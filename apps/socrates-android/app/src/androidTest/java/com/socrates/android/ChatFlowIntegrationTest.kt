package com.socrates.android

import android.content.Context
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import com.socrates.android.data.ApiClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList

/** Explicit local HTTP fixture: exercises the shipped editor, ViewModel, persistence and SSE stack. */
class ChatFlowIntegrationTest {
    @get:Rule val compose = createEmptyComposeRule()
    private lateinit var server: MockWebServer
    private lateinit var api: ApiClient
    private lateinit var activity: MainActivity
    private var scenario: ActivityScenario<MainActivity>? = null
    private val requests = CopyOnWriteArrayList<RecordedRequest>()

    @Before fun setup() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                val path = request.requestUrl?.encodedPath.orEmpty()
                val response = when {
                    path.endsWith("/auth/mobile/login") -> """{"accessToken":"ui-test-access","refreshToken":"ui-test-refresh","user":{"email":"fixture@example.com","displayName":"测试帐号"}}"""
                    path.endsWith("/auth/me") -> """{"user":{"email":"fixture@example.com","displayName":"测试帐号"}}"""
                    path.endsWith("/sessions") && request.method == "GET" -> """{"sessions":[]}"""
                    path.endsWith("/sessions") && request.method == "POST" -> request.body.clone().readUtf8()
                    path.endsWith("/files/html-artifact/raw") -> return MockResponse().setHeader("Content-Type", "text/html")
                        .setBody("<!doctype html><meta charset=utf-8><h2>本地 HTML Artifact</h2>")
                    path.endsWith("/chat/stream") -> return MockResponse().setHeader("Content-Type", "text/event-stream")
                        .setChunkedBody("""data: {"choices":[{"delta":{"content":"这是"}}]}

event: tool_use
data: [{"id":"search-1","name":"web_search","input":{"query":"测试结果"},"textOffset":2}]

event: tool_progress
data: {"id":"search-1","name":"web_search","phase":"searching","userMessage":"正在搜索"}

event: tool_result
data: {"id":"search-1","name":"web_search","ok":true,"textOffset":2,"results":[{"title":"结果来源","url":"https://example.invalid/source"}],"outputs":[{"kind":"text","stream":"result","text":"完整工具结果"},{"kind":"artifact","fileId":"html-artifact","mimeType":"text/html","name":"本地报告.html"},{"kind":"future_format","data":{"answer":42}}]}

event: public_reasoning_summary
data: {"text":"公开摘要内容"}

data: {"choices":[{"delta":{"content":"<thi"}}]}

data: {"choices":[{"delta":{"content":"nk>私密思考</think>真实 HTTP 流测试回复"}}]}

data: [DONE]

""".trimIndent(), 19)
                    else -> "{}"
                }
                return MockResponse().setHeader("Content-Type", "application/json").setBody(response)
            }
        }
        server.start()
        val context = ApplicationProvider.getApplicationContext<Context>()
        api = ApiClient(context)
        api.invalidateSession()
        api.baseUrl = server.url("/api/v2").toString().trimEnd('/')
        api.login("fixture@example.com", "fixture-password")
        scenario = ActivityScenario.launch(MainActivity::class.java)
        scenario!!.onActivity { activity = it }
    }

    @After fun teardown() {
        scenario?.close()
        api.invalidateSession()
        api.baseUrl = ApiClient.DEFAULT_BASE_URL
        server.shutdown()
    }

    @Test fun typedMessageIsSentWithBearerAndStreamedReplyIsRenderedAndSaved() {
        compose.waitUntil(15_000) { compose.onAllNodesWithContentDescription("消息输入框").fetchSemanticsNodes().isNotEmpty() }
        // Startup sync must finish before send; idle alone does not wait for HTTP.
        compose.waitUntil(15_000) { requests.any { it.requestUrl?.encodedPath?.endsWith("/sessions") == true && it.method == "GET" } }
        compose.waitForIdle()
        val editor = compose.onNodeWithContentDescription("消息输入框")
        editor.performClick()
        editor.assertIsFocused()
        editor.performTextInput("你好，帮我解释一下光合作用")
        editor.assertIsFocused()
        compose.waitUntil(15_000) { compose.onAllNodesWithContentDescription("发送消息").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("发送消息").performClick()
        compose.waitUntil(20_000) {
            compose.onAllNodesWithText("真实 HTTP 流测试回复", substring = true).fetchSemanticsNodes().isNotEmpty()
                && compose.onAllNodesWithText("公开摘要内容", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("这是", substring = true).assertIsDisplayed()
        compose.onNodeWithText("真实 HTTP 流测试回复", substring = true).assertIsDisplayed()
        compose.onNodeWithText("公开摘要内容", substring = true).assertIsDisplayed()
        compose.onNodeWithText("私密思考", substring = true).assertDoesNotExist()
        compose.onNodeWithText("思考了", substring = true).assertIsDisplayed()
        compose.onNodeWithText("web_search").assertIsDisplayed().performClick()
        compose.onNodeWithText("完整工具结果", substring = true).assertIsDisplayed()
        compose.onNodeWithText("future_format", substring = true).assertIsDisplayed()
        compose.onNodeWithText("补充结果").assertIsDisplayed()
        compose.onNodeWithText("正在搜索", substring = true).assertIsDisplayed()
        compose.waitUntil(15_000) { requests.any { it.requestUrl?.encodedPath?.endsWith("/files/html-artifact/raw") == true } }
        compose.onNodeWithTag("socrates-rich-result").assertIsDisplayed()
        compose.waitUntil(15_000) { compose.onAllNodesWithContentDescription("复制回复").fetchSemanticsNodes().isNotEmpty() }
        capture("chat-tool-card")
        compose.waitUntil(15_000) { requests.count { it.method == "POST" && it.requestUrl?.encodedPath?.endsWith("/sessions") == true } >= 2 }
        val chat = requests.single { it.requestUrl?.encodedPath?.endsWith("/chat/stream") == true }
        assertEquals("Bearer ui-test-access", chat.getHeader("Authorization"))
        val body = JSONObject(chat.body.clone().readUtf8())
        assertEquals("你好，帮我解释一下光合作用", body.getJSONArray("messages").getJSONObject(0).getString("content"))
        assertTrue(body.getString("sessionId").isNotBlank())
        val saved = requests.last { it.method == "POST" && it.requestUrl?.encodedPath?.endsWith("/sessions") == true }
        val savedSession = JSONObject(saved.body.clone().readUtf8())
        val savedAssistant = savedSession.getJSONArray("messages").getJSONObject(1)
        assertEquals("这是真实 HTTP 流测试回复", savedAssistant.getString("content"))
        assertTrue(savedAssistant.getString("reasoningContent").contains("私密思考"))
        compose.onNodeWithContentDescription("对话菜单").performClick()
        listOf("分享会话链接", "分享聊天文本", "添加到主屏幕", "归档", "删除").forEach { compose.onNodeWithText(it).assertIsDisplayed() }
        capture("chat-session-menu")
    }

    private fun capture(name: String) {
        activity.runOnUiThread {
            activity.window.decorView.clearFocus()
            val input = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
            input.hideSoftInputFromWindow(activity.window.decorView.windowToken, 0)
        }
        compose.waitForIdle()
        val bitmap = requireNotNull(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot())
        val directory = java.io.File(activity.filesDir, "ui-evidence").apply { mkdirs() }
        java.io.File(directory, "$name.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
}
