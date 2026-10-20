package com.socrates.android.data

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import android.content.Context
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class ApiIntegrationTest {
    private lateinit var server: MockWebServer
    private lateinit var client: ApiClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = ApiClient(ApplicationProvider.getApplicationContext<Context>())
        client.invalidateSession()
        client.baseUrl = server.url("/api/v2").toString().trimEnd('/')
    }

    @After
    fun tearDown() {
        client.invalidateSession()
        client.baseUrl = ApiClient.DEFAULT_BASE_URL
        server.shutdown()
    }

    @Test
    fun loginPersistsBearerAndStreamsSseReasoningContentAndToolEvent() {
        server.enqueue(jsonResponse(tokenPair("access-login", "refresh-login")))
        server.enqueue(jsonResponse("""{"id":"session-1","title":"Test","messages":[]}"""))
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Type", "text/event-stream; charset=utf-8")
            .setBody("""data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\nevent: tool_call\ndata: {"name":"search","id":"tool-1"}\n\ndata: {"choices":[{"delta":{"content":"answer"}}]}\n\ndata: [DONE]\n\n""".replace("\\n", "\n")))

        client.login("socrates@example.com", "secret")
        assertTrue(client.isLoggedIn)
        val login = server.takeRequest()
        assertEquals("/api/v2/auth/mobile/login", login.path)
        assertEquals("POST", login.method)
        val loginBody = JSONObject(login.body.readUtf8())
        assertEquals("socrates@example.com", loginBody.getString("email"))
        assertEquals("secret", loginBody.getString("password"))

        val saved = client.saveSession(ChatSession(id = "session-1", title = "Test", messages = listOf(ChatMessage(id = "m1", role = "user", content = "hello"))))
        assertEquals("session-1", saved.id)
        val saveRequest = server.takeRequest()
        assertEquals("/api/v2/sessions", saveRequest.path)
        assertEquals("Bearer access-login", saveRequest.getHeader("Authorization"))
        assertEquals("hello", JSONObject(saveRequest.body.readUtf8()).getJSONArray("messages").getJSONObject(0).getString("content"))

        val deltas = mutableListOf<String>()
        val reasoning = mutableListOf<String>()
        val activities = mutableListOf<ChatActivity>()
        var completion: Throwable? = IllegalStateException("callback was not invoked")
        client.streamChat("session-1", listOf(ChatMessage(role = "user", content = "question")),
            onDelta = { deltas += it }, onReasoning = { reasoning += it }, onActivity = { activities += it }, onDone = { completion = it })
        assertEquals(null, completion)
        assertEquals(listOf("answer"), deltas)
        assertEquals(listOf("thinking"), reasoning)
        assertEquals(1, activities.size)
        assertEquals("tool_call", activities.single().event)
        assertEquals("search", activities.single().payload.getString("name"))
        val stream = server.takeRequest()
        assertEquals("/api/v2/chat/stream?sessionId=session-1", stream.path)
        assertEquals("Bearer access-login", stream.getHeader("Authorization"))
        assertEquals("question", JSONObject(stream.body.readUtf8()).getJSONArray("messages").getJSONObject(0).getString("content"))
    }

    @Test
    fun unauthorizedStreamRefreshesAndRetriesWithNewBearer() {
        server.enqueue(jsonResponse(tokenPair("access-old", "refresh-old")))
        server.enqueue(MockResponse().setResponseCode(401).setBody("{}"))
        server.enqueue(jsonResponse(tokenPair("access-new", "refresh-new")))
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Type", "text/event-stream")
            .setBody("data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n"))
        client.login("socrates@example.com", "secret")

        val content = mutableListOf<String>()
        var completion: Throwable? = IllegalStateException("callback was not invoked")
        client.streamChat("session-refresh", listOf(ChatMessage(role = "user", content = "retry")),
            onDelta = { content += it }, onDone = { completion = it })
        assertEquals(null, completion)
        assertEquals(listOf("ok"), content)

        val first = server.takeRequest()
        assertEquals("/api/v2/auth/mobile/login", first.path)
        val failedStream = server.takeRequest()
        assertEquals("/api/v2/chat/stream?sessionId=session-refresh", failedStream.path)
        assertEquals("Bearer access-old", failedStream.getHeader("Authorization"))
        val refresh = server.takeRequest()
        assertEquals("/api/v2/auth/mobile/refresh", refresh.path)
        assertEquals("refresh-old", JSONObject(refresh.body.readUtf8()).getString("refreshToken"))
        val retriedStream = server.takeRequest()
        assertEquals("/api/v2/chat/stream?sessionId=session-refresh", retriedStream.path)
        assertEquals("Bearer access-new", retriedStream.getHeader("Authorization"))
        assertTrue(client.isLoggedIn)
    }

    @Test
    fun savingExistingWireSessionPreservesUnknownToolCitationAndProjectFields() {
        val existing = """{"id":"wire-session","title":"Wire","projectId":"project-7","customSession":{"keep":true},"messages":[{"id":"m-wire","role":"assistant","content":"from server","reasoningContent":"because","toolCalls":[{"id":"call-1","name":"lookup","arguments":{"q":"x"}}],"citations":[{"url":"https://example.test","title":"Source"}],"customMessage":"keep-too"}]}"""
        server.enqueue(jsonResponse(existing))
        server.enqueue(jsonResponse(existing))

        val loaded = client.getSession("wire-session")
        assertEquals("wire-session", loaded.id)
        assertEquals("from server", loaded.messages.single().content)
        assertNotNull(loaded.wire)
        val saved = client.saveSession(loaded)
        assertEquals("project-7", saved.wire?.getString("projectId"))
        val request = server.takeRequest()
        assertEquals("/api/v2/sessions/wire-session", request.path)
        val post = server.takeRequest()
        assertEquals("/api/v2/sessions", post.path)
        val posted = JSONObject(post.body.readUtf8())
        assertEquals("project-7", posted.getString("projectId"))
        assertTrue(posted.getJSONObject("customSession").getBoolean("keep"))
        val message = posted.getJSONArray("messages").getJSONObject(0)
        assertEquals("keep-too", message.getString("customMessage"))
        assertEquals("call-1", message.getJSONArray("toolCalls").getJSONObject(0).getString("id"))
        assertEquals("https://example.test", message.getJSONArray("citations").getJSONObject(0).getString("url"))
    }

    @Test
    fun wrongPasswordDoesNotAttemptTokenRefresh() {
        server.enqueue(MockResponse().setResponseCode(401).setBody("{\"message\":\"Wrong password\"}"))
        var failure: ApiException? = null
        try { client.login("socrates@example.com", "wrong") } catch (e: ApiException) { failure = e }
        assertEquals("Wrong password", failure?.message)
        assertEquals(1, server.requestCount)
        assertFalse(client.isLoggedIn)
    }

    @Test
    fun temporaryRefreshFailureKeepsStoredSession() {
        server.enqueue(jsonResponse(tokenPair("access-old", "refresh-old")))
        server.enqueue(MockResponse().setResponseCode(401).setBody("{}"))
        server.enqueue(MockResponse().setResponseCode(503).setBody("{\"message\":\"Temporarily unavailable\"}"))
        client.login("socrates@example.com", "secret")
        var failure: Throwable? = null
        client.streamChat("session-temporary", emptyList(), onDelta = {}, onDone = { failure = it })
        assertTrue(client.isLoggedIn)
        assertEquals(503, (failure as? ApiException)?.statusCode)
        assertEquals(3, server.requestCount)
    }

    @Test
    fun changingOriginClearsCredentialsBeforeNextRequest() {
        server.enqueue(jsonResponse(tokenPair("private-access", "private-refresh")))
        client.login("socrates@example.com", "secret")
        val second = MockWebServer()
        second.start()
        try {
            client.baseUrl = second.url("/api/v2").toString().trimEnd('/')
            assertFalse(client.isLoggedIn)
            second.enqueue(jsonResponse("{\"projects\":[]}"))
            client.readResource("projects")
            assertEquals(null, second.takeRequest().getHeader("Authorization"))
        } finally { second.shutdown() }
    }

    private fun tokenPair(accessToken: String, refreshToken: String): String = JSONObject()
        .put("accessToken", accessToken)
        .put("refreshToken", refreshToken)
        .put("expiresAt", Instant.now().plusSeconds(3600).toString())
        .toString()

    private fun jsonResponse(body: String) = MockResponse().setResponseCode(200)
        .setHeader("Content-Type", "application/json; charset=utf-8").setBody(body)
}
