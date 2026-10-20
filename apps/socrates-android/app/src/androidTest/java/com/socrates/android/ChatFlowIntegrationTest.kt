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
                    path.endsWith("/chat/stream") -> return MockResponse().setHeader("Content-Type", "text/event-stream")
                        .setChunkedBody("data: {\"choices\":[{\"delta\":{\"content\":\"这是\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"真实 HTTP 流测试回复\"}}]}\n\ndata: [DONE]\n\n", 19)
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
        compose.waitUntil(20_000) { compose.onAllNodesWithText("这是真实 HTTP 流测试回复", substring = true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("这是真实 HTTP 流测试回复", substring = true).assertIsDisplayed()
        compose.waitUntil(15_000) { requests.count { it.method == "POST" && it.requestUrl?.encodedPath?.endsWith("/sessions") == true } >= 2 }
        val chat = requests.single { it.requestUrl?.encodedPath?.endsWith("/chat/stream") == true }
        assertEquals("Bearer ui-test-access", chat.getHeader("Authorization"))
        val body = JSONObject(chat.body.clone().readUtf8())
        assertEquals("你好，帮我解释一下光合作用", body.getJSONArray("messages").getJSONObject(0).getString("content"))
        assertTrue(body.getString("sessionId").isNotBlank())
        val saved = requests.last { it.method == "POST" && it.requestUrl?.encodedPath?.endsWith("/sessions") == true }
        assertTrue(saved.body.clone().readUtf8().contains("这是真实 HTTP 流测试回复"))
    }
}
