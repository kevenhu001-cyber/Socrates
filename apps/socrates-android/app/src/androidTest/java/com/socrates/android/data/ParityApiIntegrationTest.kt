package com.socrates.android.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/** Test-only local HTTP fixtures, never product data or a replacement for production E2E. */
class ParityApiIntegrationTest {
    private lateinit var server: MockWebServer
    private lateinit var api: ApiClient
    @Before fun setUp() {
        server = MockWebServer(); server.start()
        api = ApiClient(ApplicationProvider.getApplicationContext<Context>())
        api.invalidateSession(); api.baseUrl = server.url("/api/v2").toString().trimEnd('/')
        server.enqueue(MockResponse().setBody("""{"accessToken":"test-access","refreshToken":"test-refresh"}"""))
        api.login("fixture@example.invalid", "fixture-password"); server.takeRequest()
    }
    @After fun tearDown() { api.invalidateSession(); api.baseUrl = ApiClient.DEFAULT_BASE_URL; server.shutdown() }
    @Test fun scalarSaveResponseRetainsLearningPayloadAttachmentsAndUnknownFields() {
        val exam = JSONObject().put("questions", JSONArray().put(JSONObject().put("q", "fixture-question")))
        val session = ChatSession(id = "91b12f21-c468-4dc8-aefa-9c30a31e00b9", kind = "exam", wire = JSONObject().put("examData", exam).put("future", true), messages = listOf(ChatMessage(role = "user", content = "text", wire = JSONObject().put("attachments", JSONArray().put(ChatWire.attachment("a.pdf", "application/pdf", 32, "file-reference", "document text"))))))
        server.enqueue(MockResponse().setBody("""{"id":"91b12f21-c468-4dc8-aefa-9c30a31e00b9","kind":"exam"}"""))
        val saved = api.saveSession(session)
        assertEquals(1, saved.messages.size); assertTrue(saved.wire!!.getBoolean("future")); assertEquals(1, saved.wire.getJSONObject("examData").getJSONArray("questions").length())
        val request = server.takeRequest(); assertEquals("Bearer test-access", request.getHeader("Authorization"))
        val attachment = JSONObject(request.body.readUtf8()).getJSONArray("messages").getJSONObject(0).getJSONArray("attachments").getJSONObject(0)
        assertEquals("application/pdf", attachment.getString("mime")); assertEquals(32, attachment.getInt("size")); assertTrue(attachment.has("id")); assertEquals("file-reference", attachment.getString("fileId"))
    }
    @Test fun cursorAndMessageScopeAreEncodedAsValuesNotPaths() {
        server.enqueue(MockResponse().setBody("{}"))
        api.requestResourceQuery("GET", "memory", mapOf("cursor" to "2026-10-20T13:00:00+08:00 &x=1", "includeDisabled" to "true"))
        val request = server.takeRequest()
        assertEquals("/api/v2/memory", request.requestUrl!!.encodedPath)
        assertEquals("2026-10-20T13:00:00+08:00 &x=1", request.requestUrl!!.queryParameter("cursor")); assertNull(request.requestUrl!!.queryParameter("x"))
    }
    @Test fun oldClientNeverSendsNewServerCredentialsAfterSwitch() {
        val other = MockWebServer(); other.start()
        try {
            val fresh = ApiClient(ApplicationProvider.getApplicationContext<Context>())
            fresh.baseUrl = other.url("/api/v2").toString().trimEnd('/')
            other.enqueue(MockResponse().setBody("""{"accessToken":"new-server-access","refreshToken":"new-server-refresh"}"""))
            fresh.login("fixture@example.invalid", "fixture-password"); other.takeRequest()
            server.enqueue(MockResponse().setResponseCode(401).setBody("{}"))
            try { api.requestResource("GET", "memory"); fail("Expected stale client to be unauthorized") } catch (expected: ApiException) { assertEquals(401, expected.statusCode) }
            assertNull(server.takeRequest().getHeader("Authorization")); assertTrue(fresh.isLoggedIn)
        } finally { other.shutdown() }
    }
    @Test fun feedbackUsesScopedRealEndpoint() {
        server.enqueue(MockResponse().setBody("{\"ok\":true}"))
        api.requestResourceQuery("PUT", "messages/client-message/feedback", mapOf("sessionId" to "91b12f21-c468-4dc8-aefa-9c30a31e00b9"), JSONObject().put("rating", "up"))
        val r = server.takeRequest(); assertEquals("PUT", r.method); assertEquals("/api/v2/messages/client-message/feedback", r.requestUrl!!.encodedPath)
        assertEquals("91b12f21-c468-4dc8-aefa-9c30a31e00b9", r.requestUrl!!.queryParameter("sessionId"))
    }
}
