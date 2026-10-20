package com.socrates.android.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.CancellationException
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Compiled only this iteration. These Android/crypto/network races still require device execution. */
@RunWith(AndroidJUnit4::class)
class ArtifactApiIntegrationTest {
    private lateinit var server: MockWebServer
    private lateinit var client: ApiClient
    private fun json(body: String, code: Int = 200) = MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)
    private fun pair(name: String) = """{"accessToken":"$name-access","refreshToken":"$name-refresh"}"""
    @Before fun setUp() {
        server = MockWebServer().also { it.start() }
        client = ApiClient(ApplicationProvider.getApplicationContext<Context>())
        client.invalidateSession(); client.baseUrl = server.url("/api/v2").toString().trimEnd('/')
    }
    @After fun tearDown() {
        client.invalidateSession(); client.baseUrl = ApiClient.DEFAULT_BASE_URL; server.shutdown()
    }
    @Test fun currentAndHistoryUseExactAuthenticatedReadOnlyRoutes() {
        server.enqueue(json(pair("owner"))); client.login("owner@example.test", "test-only")
        server.takeRequest()
        server.enqueue(json("{}")); server.enqueue(json("{\"versions\":[]}"))
        client.readArtifactResource("artifact-1"); client.readArtifactResource("artifact-1", true)
        listOf("/api/v2/artifacts/artifact-1", "/api/v2/artifacts/artifact-1/versions").forEach { path ->
            val request = server.takeRequest(5, TimeUnit.SECONDS)!!
            assertEquals("GET", request.method); assertEquals(path, request.path)
            assertEquals("Bearer owner-access", request.getHeader("Authorization")); assertEquals(0L, request.bodySize)
        }
    }
    @Test fun expiredAccessRefreshesAndRetriesOnceWithSameLogin() {
        server.enqueue(json(pair("owner"))); client.login("owner@example.test", "test-only"); server.takeRequest()
        server.enqueue(json("{}", 401)); server.enqueue(json(pair("refreshed"))); server.enqueue(json("{\"ok\":true}"))
        assertTrue(client.readArtifactResource("artifact-1").getBoolean("ok"))
        assertEquals("Bearer owner-access", server.takeRequest().getHeader("Authorization"))
        assertEquals("/api/v2/auth/mobile/refresh", server.takeRequest().path)
        assertEquals("Bearer refreshed-access", server.takeRequest().getHeader("Authorization"))
        assertTrue(client.isLoggedIn)
    }
    @Test fun lateOld401NeverRefreshesOrClearsDirectlyReplacedLogin() {
        val arrived = CountDownLatch(1); val release = CountDownLatch(1)
        val logins = AtomicInteger(); val refreshes = AtomicInteger()
        var observedBearer: String? = null
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/api/v2/auth/mobile/login" -> json(pair(if (logins.incrementAndGet() == 1) "old" else "new"))
                "/api/v2/artifacts/artifact-1" -> {
                    arrived.countDown()
                    if (!release.await(5, TimeUnit.SECONDS)) json("{}", 500) else json("{}", 401)
                }
                "/api/v2/auth/mobile/refresh" -> { refreshes.incrementAndGet(); json("{}", 401) }
                "/api/v2/projects" -> { observedBearer = request.getHeader("Authorization"); json("{}") }
                else -> json("{}", 404)
            }
        }
        val executor = Executors.newSingleThreadExecutor()
        try {
            client.login("old@example.test", "test-only")
            val read = executor.submit<Any> { client.readArtifactResource("artifact-1") }
            assertTrue(arrived.await(5, TimeUnit.SECONDS))
            client.login("new@example.test", "test-only")
            release.countDown()
            try { read.get(5, TimeUnit.SECONDS); fail("old request should be cancelled") }
            catch (e: ExecutionException) { assertTrue(e.cause is CancellationException) }
            assertEquals(0, refreshes.get()); assertTrue(client.isLoggedIn)
            client.requestResource("GET", "projects")
            assertEquals("Bearer new-access", observedBearer)
        } finally { release.countDown(); executor.shutdownNow() }
    }
}
