package com.socrates.android

import android.content.Context
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.socrates.android.data.ApiClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList

/** Real Compose directories backed by a local API fixture; screenshots are uploaded by Android CI. */
class FeatureDirectoryUiTest {
    @get:Rule val compose = createEmptyComposeRule()
    private lateinit var server: MockWebServer
    private lateinit var api: ApiClient
    private lateinit var activity: MainActivity
    private var scenario: ActivityScenario<MainActivity>? = null
    @Volatile private var gmailConnected = true
    private val requests = CopyOnWriteArrayList<RecordedRequest>()

    @Before fun setup() {
        gmailConnected = true
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                val path = request.requestUrl?.encodedPath.orEmpty()
                val response = when {
                    path.endsWith("/auth/mobile/login") -> """{"accessToken":"directory-access","refreshToken":"directory-refresh","user":{"email":"directory@example.com","displayName":"目录测试"}}"""
                    path.endsWith("/auth/me") -> """{"user":{"email":"directory@example.com","displayName":"目录测试"}}"""
                    path.endsWith("/sessions") -> """{"sessions":[]}"""
                    path.endsWith("/files") -> """{"files":[{"id":"file-pdf","name":"课程讲义.pdf","mimeType":"application/pdf"},{"id":"file-image","name":"课程图.png","mimeType":"image/png"}]}"""
                    path.endsWith("/artifacts") -> """{"artifacts":[{"id":"artifact-note","title":"研究笔记","type":"text","source":"真实 Artifact 内容","updatedAt":"2026-10-20T00:00:00Z"}]}"""
                    path.endsWith("/projects") -> """{"projects":[{"id":"project-owned","name":"我的课程项目","description":"owned project"},{"id":"project-shared","name":"共享研究项目","description":"shared project","visibility":"shared"}]}"""
                    path.endsWith("/scheduled-tasks") -> """{"tasks":[{"id":"task-active","title":"每日课程总结","prompt":"summarize","status":"active","frequency":"daily","nextRunAt":"2026-10-21T09:00:00Z"}]}"""
                    path.endsWith("/creations/images") -> """{"images":[]}"""
                    path.endsWith("/project-connectors/gmail/connection") && request.method == "DELETE" -> { gmailConnected = false; """{"status":"disconnected"}""" }
                    path.endsWith("/project-connectors") -> {
                        val gmail = if (gmailConnected) """{"status":"connected","displayName":"directory@example.com"}""" else "null"
                        """{"configured":true,"openConnector":{"available":false,"cloud":false},"connectors":[{"id":"gmail","name":"Gmail","description":"Read and manage Gmail","capabilities":["Mail search"],"authType":"oauth","connection":$gmail},{"id":"gitlab","name":"GitLab","description":"Bring repositories into chat","capabilities":["Repositories"],"authType":"api_key","credentialInput":{"fields":[{"key":"apiKey","label":"GitLab token","type":"password","required":true}]},"connection":null}]}"""
                    }
                    path.endsWith("/plugins") -> """{"plugins":[{"id":"legacy-plugin","name":"旧版插件","description":"保留现有插件管理入口","type":"extension","isEnabled":true}]}"""
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
        api.login("directory@example.com", "fixture-password")
        scenario = ActivityScenario.launch(MainActivity::class.java)
        scenario!!.onActivity { activity = it }
        compose.waitUntil(15_000) { compose.onAllNodesWithContentDescription("消息输入框").fetchSemanticsNodes().isNotEmpty() }
        compose.waitUntil(15_000) { requests.any { it.method == "GET" && it.requestUrl?.encodedPath?.endsWith("/sessions") == true } }
    }

    @After fun teardown() {
        scenario?.close()
        api.invalidateSession()
        api.baseUrl = ApiClient.DEFAULT_BASE_URL
        server.shutdown()
    }

    @Test fun libraryProjectsTasksAndConnectorDirectoryRenderApiDataAndFilters() {
        openDirectory("资料库")
        compose.waitUntil(15_000) { compose.onAllNodesWithText("课程讲义.pdf").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("研究笔记").assertIsDisplayed()
        listOf("推荐", "收藏", "文件夹", "图像", "全部").forEach { compose.onNodeWithText(it).assertExists() }
        compose.onNodeWithText("图像").performClick()
        compose.onNodeWithText("课程图.png").assertIsDisplayed()
        compose.onNodeWithText("课程讲义.pdf").assertDoesNotExist()
        compose.onNodeWithText("全部").performClick()
        compose.onNodeWithText("课程讲义.pdf").assertIsDisplayed()
        compose.onNodeWithTag("feature-search-资料库").performTextInput("课程讲义")
        compose.onNodeWithText("课程讲义.pdf").assertIsDisplayed()
        compose.onNodeWithText("研究笔记").assertDoesNotExist()
        compose.onNodeWithTag("feature-search-资料库").performTextClearance()
        capture("library")
        closeDirectory()

        openDirectory("项目")
        compose.waitUntil(15_000) { compose.onAllNodesWithText("我的课程项目").fetchSemanticsNodes().isNotEmpty() }
        listOf("全部", "我创建的", "与你共享").forEach { compose.onNodeWithText(it).assertExists() }
        compose.onNodeWithText("与你共享").performClick()
        compose.onNodeWithText("共享研究项目").assertIsDisplayed()
        compose.onNodeWithText("我的课程项目").assertDoesNotExist()
        compose.onNodeWithTag("feature-search-项目").performTextInput("课程")
        compose.onNodeWithText("共享研究项目").assertDoesNotExist()
        compose.onNodeWithTag("feature-search-项目").performTextClearance()
        capture("projects")
        closeDirectory()

        openDirectory("定时任务")
        compose.waitUntil(15_000) { compose.onAllNodesWithText("每日课程总结").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("已暂停").performClick()
        compose.onNodeWithText("暂无已暂停的自动化流程").assertIsDisplayed()
        compose.onNodeWithText("推荐").assertIsDisplayed()
        capture("scheduled")
        compose.onNodeWithText("每日简报").performClick()
        compose.onAllNodesWithText("新增定时任务").assertCountEquals(2)
        compose.onNodeWithText("每日简报").assertExists()
        compose.onNodeWithText("Send me a concise daily briefing", substring = true).assertExists()
        capture("scheduled-template")
        pressBack()
        closeDirectory()

        openDirectory("插件")
        compose.waitUntil(15_000) { compose.onAllNodesWithText("Gmail").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("热门").assertIsDisplayed()
        compose.onNodeWithText("已安装").assertIsDisplayed()
        compose.onNodeWithText("新品推荐").assertIsDisplayed()
        compose.onNodeWithText("旧版插件").assertIsDisplayed()
        compose.onNodeWithContentDescription("连接GitLab").assertIsDisplayed()
        compose.onNodeWithTag("feature-search-插件").performTextInput("GitLab")
        compose.onNodeWithText("GitLab").assertIsDisplayed()
        compose.onAllNodesWithText("Gmail").assertCountEquals(0)
        compose.onNodeWithTag("feature-search-插件").performTextClearance()
        capture("plugins")
        compose.onAllNodesWithText("Gmail").onFirst().performClick()
        compose.onNodeWithText("已连接").assertIsDisplayed()
        compose.onNodeWithText("断开连接").performClick()
        compose.onNodeWithText("断开").performClick()
        compose.waitUntil(15_000) { requests.any { it.method == "DELETE" && it.requestUrl?.encodedPath?.endsWith("/project-connectors/gmail/connection") == true } }
        compose.waitUntil(15_000) { compose.onAllNodesWithText("未连接").fetchSemanticsNodes().isNotEmpty() }
        pressBack()
        compose.onNodeWithTag("feature-search-插件").assertExists()
        compose.onNodeWithContentDescription("连接GitLab").performClick()
        compose.onNodeWithTag("connector-credential-apiKey").performTextInput("fixture-token")
        compose.onNodeWithText("连接").performClick()
        compose.waitUntil(15_000) { requests.any { it.method == "POST" && it.requestUrl?.encodedPath?.endsWith("/project-connectors/gitlab/connect") == true } }
        val credentialRequest = requests.last { it.method == "POST" && it.requestUrl?.encodedPath?.endsWith("/project-connectors/gitlab/connect") == true }
        assertTrue(org.json.JSONObject(credentialRequest.body.clone().readUtf8()).getString("apiKey") == "fixture-token")
    }

    private fun openDirectory(title: String) {
        compose.onNodeWithContentDescription("打开侧边栏").performClick()
        compose.onNodeWithText(title).performClick()
    }

    private fun closeDirectory() {
        pressBack()
        compose.waitUntil(10_000) { compose.onAllNodesWithContentDescription("消息输入框").fetchSemanticsNodes().isNotEmpty() }
    }

    private fun pressBack() {
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
    }

    private fun capture(name: String) {
        activity.runOnUiThread {
            activity.window.decorView.clearFocus()
            val input = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
            input.hideSoftInputFromWindow(activity.window.decorView.windowToken, 0)
        }
        compose.waitForIdle()
        val bitmap = requireNotNull(InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot())
        val directory = java.io.File(activity.filesDir, "ui-evidence").apply { mkdirs() }
        java.io.File(directory, "$name.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        assertTrue("screenshot should be written", java.io.File(directory, "$name.png").length() > 0L)
    }
}
