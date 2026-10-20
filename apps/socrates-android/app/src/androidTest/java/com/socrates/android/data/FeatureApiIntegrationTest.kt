package com.socrates.android.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class FeatureApiIntegrationTest {
    private lateinit var server: MockWebServer
    private lateinit var client: ApiClient

    @Before fun setUp() {
        server = MockWebServer().also { it.start() }
        client = ApiClient(ApplicationProvider.getApplicationContext<Context>())
        client.invalidateSession()
        client.baseUrl = server.url("/api/v2").toString().trimEnd('/')
    }

    @After fun tearDown() {
        client.invalidateSession()
        client.baseUrl = ApiClient.DEFAULT_BASE_URL
        server.shutdown()
    }

    @Test fun verificationCodeLoginSavesBearerForLaterFeatureRequest() {
        server.enqueue(json(tokenPair("code-access", "code-refresh")))
        server.enqueue(json("""{"feature":true}"""))

        AuthOperations(client).loginWithCode("person@example.com", "123456")
        assertTrue(client.isLoggedIn)
        assertEquals("feature", client.requestResource("GET", "feature", authenticated = true).keys().asSequence().single())

        val login = server.takeRequest()
        assertEquals("/api/v2/auth/mobile/login-with-code", login.path)
        assertEquals("POST", login.method)
        assertNull(login.getHeader("Authorization"))
        assertEquals("person@example.com", JSONObject(login.body.readUtf8()).getString("email"))
        val followup = server.takeRequest()
        assertEquals("/api/v2/feature", followup.path)
        assertEquals("Bearer code-access", followup.getHeader("Authorization"))
    }

    @Test fun registrationForgotAndResetPasswordRequestsDoNotSendBearer() {
        val auth = AuthOperations(client)
        server.enqueue(json(tokenPair("existing-access", "existing-refresh")))
        auth.login("person@example.com", "pw")
        server.enqueue(json("{}")); server.enqueue(json("{}")); server.enqueue(json("{}"))
        auth.register("new@example.com", "new-pw")
        auth.forgotPassword("person@example.com")
        auth.resetPassword("reset-token", "new-pw")

        val login = server.takeRequest()
        assertEquals("/api/v2/auth/mobile/login", login.path)
        val expected = listOf("/api/v2/auth/register", "/api/v2/auth/forgot-password", "/api/v2/auth/reset-password")
        expected.forEach { path ->
            val request = server.takeRequest()
            assertEquals(path, request.path)
            assertEquals("POST", request.method)
            assertNull("$path must not carry credentials", request.getHeader("Authorization"))
        }
        assertTrue(client.isLoggedIn)
    }

    @Test fun resourcePathsRejectAbsoluteTraversalEncodedAndBackslashFormsBeforeNetwork() {
        val invalid = listOf(
            "https://attacker.example/path", "//attacker.example/path", "../secret", "feature/../secret",
            "feature/%2e%2e/secret", "feature%2f..%2fsecret", "feature\\..\\secret", "feature\\secret",
        )
        invalid.forEach { path ->
            var rejected = false
            try { client.requestResource("GET", path) } catch (_: IllegalArgumentException) { rejected = true }
            assertTrue("Expected unsafe path to be rejected: $path", rejected)
        }
        assertEquals("No request should reach the server", 0, server.requestCount)
    }

    @Test fun definitiveRefresh401ClearsCredentialsWhenProtectedRequestReturns401() {
        server.enqueue(json(tokenPair("old-access", "old-refresh")))
        client.login("person@example.com", "pw")
        server.enqueue(MockResponse().setResponseCode(401).setBody("{}"))
        server.enqueue(MockResponse().setResponseCode(401).setBody("{}"))

        var failure: ApiException? = null
        try { client.requestResource("GET", "projects") } catch (e: ApiException) { failure = e }
        assertEquals(401, failure?.statusCode)
        assertFalse(client.isLoggedIn)
        assertEquals("/api/v2/auth/mobile/login", server.takeRequest().path)
        assertEquals("/api/v2/projects", server.takeRequest().path)
        val refresh = server.takeRequest()
        assertEquals("/api/v2/auth/mobile/refresh", refresh.path)
        assertEquals("old-refresh", JSONObject(refresh.body.readUtf8()).getString("refreshToken"))
    }

    @Test fun changingServerOriginClearsCredentialsAndOmitsBearer() {
        server.enqueue(json(tokenPair("private-access", "private-refresh")))
        client.login("person@example.com", "pw")
        val other = MockWebServer().also { it.start() }
        try {
            client.baseUrl = other.url("/api/v2").toString().trimEnd('/')
            assertFalse(client.isLoggedIn)
            other.enqueue(json("{}"))
            client.requestResource("GET", "projects")
            assertNull(other.takeRequest().getHeader("Authorization"))
        } finally { other.shutdown() }
    }

    @Test fun patchAndDeleteUseRequestedMethodsAndJsonBodyContract() {
        server.enqueue(json("{}")); server.enqueue(json("{}"))
        val payload = JSONObject().put("enabled", true)
        client.requestResource("PATCH", "projects/p-1", payload)
        client.requestResource("DELETE", "projects/p-1")

        val patch = server.takeRequest()
        assertEquals("PATCH", patch.method)
        assertEquals("/api/v2/projects/p-1", patch.path)
        assertEquals("application/json", patch.getHeader("Content-Type")?.substringBefore(';'))
        assertTrue(JSONObject(patch.body.readUtf8()).getBoolean("enabled"))
        val delete = server.takeRequest()
        assertEquals("DELETE", delete.method)
        assertEquals("/api/v2/projects/p-1", delete.path)
        assertNull(delete.getHeader("Content-Type"))
        assertEquals(0L, delete.body.size)
    }

    @Test fun sseReadsMultipleNetworkChunksAndKeepsReceivedContentOnEarlyEof() {
        server.enqueue(MockResponse().setResponseCode(200)
            .setHeader("Content-Type", "text/event-stream; charset=utf-8")
            .setChunkedBody("data: {\"choices\":[{\"delta\":{\"content\":\"first\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\" second\"}}]}\n\n", 9))
        val content = mutableListOf<String>()
        var completion: Throwable? = null
        client.streamChat("chunked", emptyList(), onDelta = { content += it }, onDone = { completion = it })
        assertEquals(listOf("first", " second"), content)
        assertTrue("EOF before [DONE] should report an interrupted response", completion is java.io.IOException)
        assertTrue(completion?.message.orEmpty().contains("已保留收到的内容"))
        assertEquals("/api/v2/chat/stream?sessionId=chunked", server.takeRequest().path)
    }

    private fun tokenPair(access: String, refresh: String) = JSONObject()
        .put("accessToken", access).put("refreshToken", refresh)
        .put("expiresAt", Instant.now().plusSeconds(3600).toString()).toString()

    private fun json(body: String) = MockResponse().setResponseCode(200)
        .setHeader("Content-Type", "application/json; charset=utf-8").setBody(body)
}
