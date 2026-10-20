package com.socrates.android.data

import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody
import okio.Buffer
import okio.BufferedSource
import okio.ForwardingSource
import okio.buffer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class ArtifactReaderTest {
    private fun current(id: Any? = "a-1", source: Any? = "text", version: Any? = 3) = JSONObject()
        .put("id", id).put("title", "Title").put("type", "text").put("language", JSONObject.NULL)
        .put("version", version).put("source", source).put("updatedAt", JSONObject.NULL)
    private fun revision(id: Any? = "a-1", version: Any? = 1, source: Any? = "s") = JSONObject()
        .put("artifactId", id).put("version", version).put("source", source).put("createdAt", JSONObject.NULL)

    @Test fun currentUsesExactIdAndHistoryFlagAndParsesStrictModel() {
        val calls = mutableListOf<Pair<String, Boolean>>()
        val repo = ArtifactReaderRepository { id, history -> calls += id to history; if (history) JSONObject().put("versions", JSONArray()) else current() }
        val result = repo.current("a-1")
        assertEquals("a-1", result.id); assertEquals("Title", result.title); assertEquals("text", result.type)
        assertNull(result.language); assertEquals(3, result.version); assertEquals("text", result.source); assertNull(result.updatedAt)
        assertTrue(repo.versions("a-1").isEmpty())
        assertEquals(listOf("a-1" to false, "a-1" to true), calls)
        listOf("", "bad id", "a.b", "é", "x".repeat(129)).forEach { id ->
            var called = false
            try { ArtifactReaderRepository { _, _ -> called = true; current() }.current(id); fail("accepted $id") }
            catch (_: IllegalArgumentException) { assertFalse(called) }
        }
    }

    @Test fun currentRejectsMismatchedIdentityAndMalformedRequiredOrOptionalFields() {
        val badRows = listOf(current(id = "other"), current().put("title", 4), current().put("type", JSONObject.NULL),
            current().put("source", 4), current().put("version", 1L), current().put("version", 0), current().put("version", -1),
            current().put("language", 4), current().put("updatedAt", false), current().put("source", "x".repeat(1_000_001)))
        badRows.forEach { row -> try { ArtifactReaderRepository { _, _ -> row }.current("a-1"); fail("accepted $row") } catch (_: Exception) { } }
        listOf("x".repeat(1_000_000), "").forEach { s -> assertEquals(s, ArtifactReaderRepository { _, _ -> current(source = s) }.current("a-1").source) }
    }

    @Test fun versionsValidateShapeOwnershipNumbersDuplicatesAndSortDescending() {
        val valid = ArtifactReaderRepository { _, _ -> JSONObject().put("versions", JSONArray().put(revision(version = 2)).put(revision(version = 7)).put(revision(version = 1))) }.versions("a-1")
        assertEquals(listOf(7, 2, 1), valid.map { it.version }); assertEquals("s", valid.first().source); assertNull(valid.first().createdAt)
        val invalid = listOf(JSONObject(), JSONObject().put("versions", "bad"), JSONObject().put("versions", JSONArray().put("bad")),
            JSONObject().put("versions", JSONArray().put(revision(id = "else"))),
            JSONObject().put("versions", JSONArray().put(revision(version = 1)).put(revision(version = 1))),
            JSONObject().put("versions", JSONArray().put(revision(version = 0))),
            JSONObject().put("versions", JSONArray().put(revision(version = 1L))),
            JSONObject().put("versions", JSONArray().put(revision().put("source", false))),
            JSONObject().put("versions", JSONArray().put(revision().put("createdAt", 4))))
        invalid.forEach { row -> try { ArtifactReaderRepository { _, _ -> row }.versions("a-1"); fail("accepted $row") } catch (_: Exception) { } }
    }

    @Test fun historyAcceptsEmptyAndExactCountAndAggregateSourceBudgetsButRejectsWholeOverflow() {
        fun result(vararg rows: JSONObject) = ArtifactReaderRepository { _, _ -> JSONObject().put("versions", JSONArray().apply { rows.forEach(::put) }) }.versions("a-1")
        assertTrue(result().isEmpty())
        val hundred = result(*Array(100) { revision(version = it + 1, source = "") })
        assertEquals(100, hundred.size)
        try { result(*Array(101) { revision(version = it + 1, source = "") }); fail("accepted 101 versions") } catch (_: IllegalStateException) { }
        assertEquals(1_000_000, result(revision(version = 1, source = "x".repeat(500_000)), revision(version = 2, source = "y".repeat(500_000))).sumOf { it.source.length })
        try { result(revision(version = 1, source = "x".repeat(500_001)), revision(version = 2, source = "y".repeat(500_000))); fail("accepted aggregate overflow") } catch (_: IllegalStateException) { }
        try { result(revision(version = 1, source = "x".repeat(1_000_001))); fail("accepted single source overflow") } catch (_: IllegalStateException) { }
    }

    private fun response(bytes: ByteArray, code: Int = 200, declared: Long = bytes.size.toLong(), onClose: (() -> Unit)? = null) : Response {
        val body = object : ResponseBody() {
            override fun contentType() = "application/json".toMediaType()
            override fun contentLength() = declared
            private val stream: BufferedSource by lazy {
                val raw = Buffer().write(bytes)
                object : ForwardingSource(raw) {
                    override fun close() { super.close(); onClose?.invoke() }
                }.buffer()
            }
            override fun source(): BufferedSource = stream
        }
        return Response.Builder().request(Request.Builder().url("https://example.test/artifacts/a-1").build())
            .protocol(Protocol.HTTP_1_1).code(code).message(if (code in 200..299) "OK" else "Error").body(body).build()
    }

    @Test fun readJsonAcceptsExactByteLimitAndClosesResponseAndStream() {
        val json = "{\"ok\":true}".toByteArray(); var closed = 0
        assertTrue(readArtifactJson(response(json, onClose = { closed++ })).getBoolean("ok")); assertEquals(1, closed)
        val exact = ("{" + " ".repeat(ArtifactReaderPolicy.MAX_RESPONSE_BYTES - 2) + "}").toByteArray()
        assertNotNull(readArtifactJson(response(exact)))
    }

    @Test fun readJsonRejectsDeclaredAndActualOverflowAndMalformedAndUnsuccessfulResponses() {
        val size = ArtifactReaderPolicy.MAX_RESPONSE_BYTES
        listOf(response("{}".toByteArray(), declared = size.toLong() + 1), response(ByteArray(size + 1) { 32 }, declared = -1),
            response("no json".toByteArray()), response("{}".toByteArray(), code = 401)).forEach { r ->
            try { readArtifactJson(r); fail("accepted response") } catch (_: Exception) { }
        }
        try { readArtifactJson(response("{}".toByteArray(), code = 404)); fail("expected status error") }
        catch (e: ApiException) { assertEquals(404, e.statusCode); assertFalse(e.message.orEmpty().contains("{}")) }
        val nullBody = Response.Builder().request(Request.Builder().url("https://example.test/").build()).protocol(Protocol.HTTP_1_1).code(200).message("OK").build()
        try { readArtifactJson(nullBody); fail("expected empty body error") } catch (e: ApiException) { assertEquals(200, e.statusCode) }
    }

    private fun sample(id: String = "a-1") = ArtifactSource(id, "T", "text", null, 1, "body", null)
    private fun controller(scope: CoroutineScope, current: suspend (String) -> ArtifactSource = { sample(it) }, history: suspend (String) -> List<ArtifactRevision> = { listOf(ArtifactRevision(2, "old", null)) }, unauthorized: () -> Unit = {}) = ArtifactReaderController(scope, current, history, unauthorized)

    @Test fun scopedTransportRefreshesOnlyOnceAndReturnsConfirmedCurrentResponse() {
        var sends = 0; var refreshes = 0; var invalidations = 0
        val result = readScopedArtifact({ true }, {
            sends++; response("{}".toByteArray(), code = if (sends == 1) 401 else 200)
        }, { refreshes++; true }, { invalidations++ })
        assertEquals(0, result.length()); assertEquals(2, sends); assertEquals(1, refreshes); assertEquals(0, invalidations)
    }

    @Test fun scopedTransportDoesNotSendOrRefreshIfAccountIsAlreadyStale() {
        var sends = 0; var refreshes = 0; var invalidations = 0
        try { readScopedArtifact({ false }, { sends++; response("{}".toByteArray()) }, { refreshes++; true }, { invalidations++ }); fail("stale request") }
        catch (_: CancellationException) { }
        assertEquals(0, sends); assertEquals(0, refreshes); assertEquals(0, invalidations)
    }

    @Test fun scopedTransportDiscardsLate401WithoutRefreshingOrClearingNewLogin() {
        var current = true; var refreshes = 0; var invalidations = 0; var closed = 0
        try { readScopedArtifact({ current }, {
            current = false; response("{}".toByteArray(), code = 401) { closed++ }
        }, { refreshes++; true }, { invalidations++ }); fail("stale response") }
        catch (_: CancellationException) { }
        assertEquals(1, closed); assertEquals(0, refreshes); assertEquals(0, invalidations)
    }

    @Test fun scopedTransportNeverRetriesWithNewIdentityAfterRefreshOrClearsItAfterLateRetry() {
        var current = true; var sends = 0; var invalidations = 0
        try { readScopedArtifact({ current }, { sends++; response("{}".toByteArray(), code = 401) }, {
            current = false; true
        }, { invalidations++ }); fail("stale refresh") } catch (_: CancellationException) { }
        assertEquals(1, sends); assertEquals(0, invalidations)
        current = true; sends = 0
        try { readScopedArtifact({ current }, {
            sends++; if (sends == 2) current = false
            response("{}".toByteArray(), code = 401)
        }, { true }, { invalidations++ }); fail("stale retry") } catch (_: CancellationException) { }
        assertEquals(2, sends); assertEquals(0, invalidations)
    }

    @Test fun scopedTransportDoesNotLoopAfterFailedRefreshOrSecond401() {
        var sends = 0; var invalidations = 0
        try { readScopedArtifact({ true }, { sends++; response("{}".toByteArray(), code = 401) }, { false }, { invalidations++ }); fail("expired") }
        catch (e: ApiException) { assertEquals(401, e.statusCode) }
        assertEquals(1, sends); assertEquals(0, invalidations)
        sends = 0
        try { readScopedArtifact({ true }, { sends++; response("{}".toByteArray(), code = 401) }, { true }, { invalidations++ }); fail("expired retry") }
        catch (e: ApiException) { assertEquals(401, e.statusCode) }
        assertEquals(2, sends); assertEquals(1, invalidations)
    }

    @Test fun overflowAndInvalidJsonAndHttpErrorAlwaysCloseBody() {
        val size = ArtifactReaderPolicy.MAX_RESPONSE_BYTES
        listOf(
            Triple("{}".toByteArray(), 200, size.toLong() + 1),
            Triple(ByteArray(size + 1) { 32 }, 200, -1L),
            Triple("invalid".toByteArray(), 200, 7L),
            Triple("secret server message".toByteArray(), 500, -1L),
        ).forEach { (bytes, code, length) ->
            var closed = 0
            try { readArtifactJson(response(bytes, code, length) { closed++ }); fail("accepted invalid body") }
            catch (_: Exception) { }
            assertEquals(1, closed)
        }
    }

    @Test fun ioFailureClosesBodyAndDoesNotReturnPartialJson() {
        var closed = 0
        val stream = object : ForwardingSource(Buffer().writeUtf8("{")) {
            override fun read(sink: Buffer, byteCount: Long): Long = throw IOException("broken stream")
            override fun close() { super.close(); closed++ }
        }.buffer()
        val body = object : ResponseBody() {
            override fun contentType() = "application/json".toMediaType()
            override fun contentLength() = -1L
            override fun source() = stream
        }
        val response = Response.Builder().request(Request.Builder().url("https://example.test/").build())
            .protocol(Protocol.HTTP_1_1).code(200).message("OK").body(body).build()
        try { readArtifactJson(response); fail("accepted incomplete response") }
        catch (_: IOException) { }
        assertEquals(1, closed)
    }

    @Test fun historyUnauthorizedClearsCurrentAndDoesNotMasqueradeAsEmptyHistory() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var auth = 0
            val c = controller(scope, history = { throw ApiException(401, "denied") }, unauthorized = { auth++ })
            c.open("a-1"); c.loadVersions()
            assertEquals(1, auth); assertEquals(ArtifactReaderState(), c.state.value)
        } finally { scope.cancel() }
    }

    @Test fun refreshAndSwitchRejectNonCooperativeLateHistory() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val gate = CompletableDeferred<List<ArtifactRevision>>()
            val c = controller(scope, history = { withContext(NonCancellable) { gate.await() } })
            c.open("a-1"); c.loadVersions(); c.refresh()
            assertFalse(c.state.value.versionsLoading); assertFalse(c.state.value.versionsLoaded)
            c.open("b-2"); gate.complete(listOf(ArtifactRevision(2, "old account source", null)))
            assertEquals("b-2", c.state.value.artifactId); assertTrue(c.state.value.versions.isEmpty())
            assertNull(c.state.value.selectedVersion)
        } finally { scope.cancel() }
    }

    @Test fun refreshIsDisabledDuringCurrentLoadAndFailedReadCanBeRetried() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val gate = CompletableDeferred<ArtifactSource>(); var calls = 0
            val c = controller(scope, current = { calls++; if (calls == 1) gate.await() else sample(it) })
            c.open("a-1"); c.refresh(); assertEquals(1, calls)
            gate.completeExceptionally(IOException("offline")); assertNotNull(c.state.value.error)
            c.refresh(); assertEquals(2, calls); assertEquals(sample(), c.state.value.current)
            assertNull(c.state.value.error)
        } finally { scope.cancel() }
    }

    @Test fun controllerOpensExplicitlyRejectsDuplicateLoadsSelectsAndRefreshes() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var currents = 0; var histories = 0
            val c = controller(scope, { currents++; sample(it) }, { histories++; listOf(ArtifactRevision(2, "old", null)) })
            assertNull(c.state.value.artifactId); c.open("a-1"); assertEquals(1, currents); assertEquals(sample(), c.state.value.current)
            c.loadVersions(); c.loadVersions(); assertEquals(1, histories); assertTrue(c.state.value.versionsLoaded)
            c.select(2); assertEquals(2, c.state.value.selectedVersion); assertEquals("old", c.state.value.selectedRevision?.source)
            c.select(9); assertEquals(2, c.state.value.selectedVersion); c.select(null); assertNull(c.state.value.selectedVersion)
            c.refresh(); assertEquals(2, currents); assertFalse(c.state.value.versionsLoaded); assertTrue(c.state.value.versions.isEmpty())
            c.loadVersions(); assertEquals(2, histories)
        } finally { scope.cancel() }
    }

    @Test fun controllerPreventsConcurrentCurrentAndHistoryRequestsAndRetriesHistoryIndependently() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val currentGate = CompletableDeferred<ArtifactSource>(); val historyGate = CompletableDeferred<List<ArtifactRevision>>()
            val failedHistoryGate = CompletableDeferred<List<ArtifactRevision>>()
            var currentCalls = 0; var historyCalls = 0
            val c = controller(scope, { currentCalls++; currentGate.await() }, { historyCalls++; if (historyCalls == 1) failedHistoryGate.await() else historyGate.await() })
            c.open("a-1"); c.open("a-1"); assertEquals(2, currentCalls)
            currentGate.complete(sample()); assertNotNull(c.state.value.current)
            c.loadVersions(); c.loadVersions(); assertEquals(1, historyCalls)
            failedHistoryGate.completeExceptionally(IOException("history offline"))
            assertNotNull(c.state.value.versionsError); assertFalse(c.state.value.loading)
            c.loadVersions(); c.loadVersions(); assertEquals(2, historyCalls); assertTrue(c.state.value.versionsLoading)
            historyGate.complete(listOf(ArtifactRevision(2, "old", null))); assertTrue(c.state.value.versionsLoaded)
        } finally { scope.cancel() }
    }

    @Test fun controllerHandlesUnauthorizedNotFoundAndInvalidIdentifiers() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var auth = 0
            val c = controller(scope, { throw ApiException(404, "gone") }, unauthorized = { auth++ })
            c.open("a-1"); assertFalse(c.state.value.loading); assertTrue(c.state.value.error.orEmpty().contains("不可访问")); assertNull(c.state.value.current)
            c.open("bad id"); assertNotNull(c.state.value.error); assertEquals(0, auth)
            val denied = controller(scope, { throw ApiException(401, "denied") }, unauthorized = { auth++ })
            denied.open("a-1"); assertEquals(1, auth); assertEquals(ArtifactReaderState(), denied.state.value)
        } finally { scope.cancel() }
    }

    @Test fun clearAndSwitchRejectNonCooperativeLateResultsAndOldUnauthorizedCannotClearNewScope() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val gate = CompletableDeferred<ArtifactSource>()
            val c = controller(scope, { id -> if (id == "a-1") withContext(NonCancellable) { gate.await() } else sample(id) })
            c.open("a-1"); c.clear(); c.open("b-2"); gate.complete(sample()); assertEquals("b-2", c.state.value.artifactId); assertEquals("b-2", c.state.value.current?.id)
            val unauthorizedGate = CompletableDeferred<ArtifactSource>(); var auth = 0
            val second = controller(scope, { id -> if (id == "a-1") withContext(NonCancellable) { unauthorizedGate.await() } else sample(id) }, unauthorized = { auth++ })
            second.open("a-1"); second.open("b-2"); unauthorizedGate.completeExceptionally(ApiException(401, "old unauthorized"))
            assertEquals("b-2", second.state.value.artifactId); assertEquals("b-2", second.state.value.current?.id); assertEquals(0, auth)
        } finally { scope.cancel() }
    }
}
