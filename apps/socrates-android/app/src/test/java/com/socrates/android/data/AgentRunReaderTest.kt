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

class AgentRunReaderTest {
    private fun run(id: Any? = "r-1", task: Any? = "task", status: Any? = "running") = JSONObject().put("id", id).put("task", task).put("status", status)
    private fun artifact(id: Any? = "a-1") = JSONObject().put("id", id).put("name", "N").put("type", "file")
    private fun event(runId: Any? = "r-1", seq: Any? = 1, data: Any? = JSONObject().put("text", "x")) = JSONObject().put("runId", runId).put("sequence", seq).put("event", "log").put("data", data)
    private fun payload(r: JSONObject = run(), a: JSONArray = JSONArray(), e: JSONArray = JSONArray()) = JSONObject().put("run", r).put("artifacts", a).put("events", e)
    private fun repo(json: JSONObject) = AgentRunReaderRepository { json }

    @Test fun idIsAsciiAndLengthBounded() {
        listOf("A_9-z", "x".repeat(128)).forEach { AgentRunReaderPolicy.requireId(it) }
        listOf("", "x".repeat(129), "é", "a.b", "a b", "a/../b").forEach { id ->
            try { repo(payload()).read(id); fail("accepted $id") } catch (_: IllegalArgumentException) { }
        }
    }
    @Test fun parsesPublicRunFieldsAndNullableMetadata() {
        val r = run().put("summary", "s").put("error", JSONObject.NULL).put("model", "m").put("mode", "chat")
            .put("kind", "agent").put("source", "native").put("providerMode", "local").put("sessionId", "s1")
            .put("projectId", "p").put("workspaceId", "w").put("threadId", "t").put("startedAt", "now")
            .put("completedAt", JSONObject.NULL).put("usage", JSONObject().put("tokens", 2))
        val result = repo(payload(r)).read("r-1").run
        assertEquals("task", result.task); assertEquals("running", result.status); assertEquals("s", result.summary)
        assertNull(result.error); assertEquals("m", result.model); assertEquals("chat", result.mode); assertEquals("agent", result.kind)
        assertEquals("native", result.source); assertEquals("local", result.providerMode); assertEquals("s1", result.sessionId)
        assertEquals("p", result.projectId); assertEquals("w", result.workspaceId); assertEquals("t", result.threadId)
        assertEquals("now", result.startedAt); assertNull(result.completedAt); assertEquals("{\"tokens\":2}", result.usage)
    }
    @Test fun requiredRunShapeIdentityAndNonemptyStatusAreStrict() {
        listOf(payload(run(id = "other")), payload(run().put("task", JSONObject.NULL)), payload(run().put("task", 4)),
            payload(run().put("status", JSONObject.NULL)), payload(run().put("status", 9)), payload(run(status = "")),
            JSONObject(), JSONObject().put("run", run()).put("artifacts", JSONArray()),
            payload().put("events", "bad"), payload().put("artifacts", "bad"))
            .forEach { try { repo(it).read("r-1"); fail("accepted $it") } catch (_: Exception) { } }
    }
    @Test fun optionalFieldsMustBeStringOrNullAndUsageMustBeObjectOrNull() {
        listOf("summary", "error", "model", "mode", "kind", "source", "providerMode", "sessionId", "projectId", "workspaceId", "threadId", "startedAt", "completedAt")
            .forEach { key -> try { repo(payload(run().put(key, 3))).read("r-1"); fail("accepted $key") } catch (_: Exception) { } }
        listOf(3, "usage", JSONArray()).forEach { v -> try { repo(payload(run().put("usage", v))).read("r-1"); fail("accepted usage") } catch (_: Exception) { } }
        assertNull(repo(payload(run().put("usage", JSONObject.NULL))).read("r-1").run.usage)
    }
    @Test fun artifactFieldsOptionalAndDuplicatesRejected() {
        val result = repo(payload(a = JSONArray().put(artifact().put("language", JSONObject.NULL).put("createdAt", "today")))).read("r-1")
        assertEquals("a-1", result.artifacts.single().id); assertNull(result.artifacts.single().language); assertEquals("today", result.artifacts.single().createdAt)
        assertNull(repo(payload(a = JSONArray().put(JSONObject().put("id", "a-2").put("type", "file")))).read("r-1").artifacts.single().name)
        val bad = listOf(JSONArray().put("bad"), JSONArray().put(JSONObject().put("id", "a")), JSONArray().put(artifact()).put(artifact()))
        bad.forEach { try { repo(payload(a = it)).read("r-1"); fail("accepted artifacts") } catch (_: Exception) { } }
    }
    @Test fun eventsRequireOwnershipObjectPayloadAndPositiveIntegerSequence() {
        listOf(event(runId = "else"), event(seq = 0), event(seq = -1), event(seq = 1.0), event(data = "x"), event(data = JSONObject.NULL), JSONObject())
            .forEach { try { repo(payload(e = JSONArray().put(it))).read("r-1"); fail("accepted event $it") } catch (_: Exception) { } }
        assertEquals(1L shl 40, repo(payload(e = JSONArray().put(event(seq = 1L shl 40)))).read("r-1").events.single().sequence)
    }
    @Test fun eventSequencesStrictlyIncreaseButMayHaveGapsAndPreserveOrder() {
        val result = repo(payload(e = JSONArray().put(event(seq = 2)).put(event(seq = 7)).put(event(seq = 10)))).read("r-1")
        assertEquals(listOf(2L, 7L, 10L), result.events.map { it.sequence }); assertEquals(listOf("log", "log", "log"), result.events.map { it.event })
        listOf(listOf(2, 2), listOf(4, 3)).forEach { seqs ->
            try { repo(payload(e = JSONArray().put(event(seq = seqs[0])).put(event(seq = seqs[1])))).read("r-1"); fail("accepted sequence order") } catch (_: Exception) { }
        }
    }
    @Test fun exactCollectionLimitsPassAndOveragesFail() {
        val exact = repo(payload(a = JSONArray().apply { repeat(100) { put(artifact("a$it")) } }, e = JSONArray().apply { repeat(80) { put(event(seq = it + 1)) } })).read("r-1")
        assertEquals(100, exact.artifacts.size); assertEquals(80, exact.events.size)
        listOf(payload(a = JSONArray().apply { repeat(101) { put(artifact("a$it")) } }),
            payload(e = JSONArray().apply { repeat(81) { put(event(seq = it + 1)) } })).forEach { try { repo(it).read("r-1"); fail("accepted over limit") } catch (_: Exception) { } }
    }
    @Test fun fieldUnitBoundaryCountsUtf16IncludingSurrogatePairs() {
        val exact = "x".repeat(AgentRunReaderPolicy.MAX_FIELD_UNITS)
        assertEquals(exact, repo(payload(run().put("summary", exact))).read("r-1").run.summary)
        try { repo(payload(run().put("summary", exact + "x"))).read("r-1"); fail("accepted oversized field") } catch (_: IllegalStateException) { }
        try { repo(payload(run().put("summary", "😀".repeat(50_001)))).read("r-1"); fail("accepted oversized UTF16 field") } catch (_: IllegalStateException) { }
    }
    @Test fun aggregateBudgetExactBoundaryAndOverflowRejectWholeSnapshot() {
        val exactly500k = run(task = "t".repeat(100_000), status = "s".repeat(100_000))
            .put("summary", "a".repeat(100_000)).put("error", "b".repeat(100_000)).put("model", "c".repeat(99_997))
        val accepted = repo(payload(exactly500k)).read("r-1").run
        assertEquals(500_000, accepted.id.length + accepted.task.length + accepted.status.length + accepted.summary!!.length + accepted.error!!.length + accepted.model!!.length)
        val exactSummary = "x".repeat(AgentRunReaderPolicy.MAX_FIELD_UNITS)
        val baseUnits = "r-1".length + "task".length + "running".length + exactSummary.length
        val lastNameUnits = AgentRunReaderPolicy.MAX_TOTAL_UNITS - baseUnits - 4 * ("a0".length + "t".length) - 3 * AgentRunReaderPolicy.MAX_FIELD_UNITS
        val artifacts = JSONArray().apply {
            repeat(4) { index -> put(JSONObject().put("id", "a$index").put("name", "n".repeat(if (index < 3) AgentRunReaderPolicy.MAX_FIELD_UNITS else lastNameUnits)).put("type", "t")) }
        }
        val acceptedArtifacts = repo(payload(run().put("summary", exactSummary), artifacts)).read("r-1").artifacts
        assertEquals(AgentRunReaderPolicy.MAX_TOTAL_UNITS, baseUnits + acceptedArtifacts.sumOf { it.id.length + it.name!!.length + it.type.length })
        artifacts.getJSONObject(3).put("name", "n".repeat(lastNameUnits + 1))
        try { repo(payload(run().put("summary", exactSummary), artifacts)).read("r-1"); fail("aggregate should exceed budget") } catch (_: IllegalStateException) { }
        val base = repo(payload(run().put("summary", "s".repeat(99_990)))).read("r-1")
        assertEquals(99_990, base.run.summary?.length)
    }
    @Test fun optionalNullsConsumeNoUnitsAndMetadataIsIncludedInAggregateBudget() {
        val exact = run(task = "t".repeat(100_000), status = "s".repeat(100_000))
            .put("summary", "a".repeat(100_000)).put("error", "b".repeat(100_000)).put("model", "c".repeat(99_996)).put("providerMode", "x")
        repo(payload(exact)).read("r-1")
        val over = exact.put("model", "c".repeat(99_997))
        try { repo(payload(over)).read("r-1"); fail("metadata must count toward aggregate") } catch (_: IllegalStateException) { }
        assertNull(repo(payload(run().put("summary", JSONObject.NULL))).read("r-1").run.summary)
    }

    private fun response(bytes: ByteArray, code: Int = 200, declared: Long = bytes.size.toLong(), onClose: (() -> Unit)? = null): Response {
        val body = object : ResponseBody() {
            override fun contentType() = "application/json".toMediaType()
            override fun contentLength() = declared
            private val stream: BufferedSource by lazy {
                object : ForwardingSource(Buffer().write(bytes)) { override fun close() { super.close(); onClose?.invoke() } }.buffer()
            }
            override fun source() = stream
        }
        return Response.Builder().request(Request.Builder().url("https://example.test/runs/r-1").build()).protocol(Protocol.HTTP_1_1)
            .code(code).message(if (code == 200) "OK" else "Error").body(body).build()
    }
    @Test fun responseJsonExactByteLimitAndCloses() {
        var closed = 0
        assertTrue(readAgentRunJson(response("{\"ok\":true}".toByteArray(), onClose = { closed++ })).getBoolean("ok")); assertEquals(1, closed)
        val exact = ("{" + " ".repeat(AgentRunReaderPolicy.MAX_RESPONSE_BYTES - 2) + "}").toByteArray()
        assertNotNull(readAgentRunJson(response(exact)))
    }
    @Test fun responseRejectsDeclaredAndStreamedOversizeWithoutExposingBodyAndCloses() {
        val n = AgentRunReaderPolicy.MAX_RESPONSE_BYTES
        listOf(Triple("{}".toByteArray(), 200, n.toLong() + 1), Triple(ByteArray(n + 1) { 32 }, 200, -1L), Triple("secret".toByteArray(), 401, -1L))
            .forEach { (bytes, code, length) ->
                var closed = 0
                try { readAgentRunJson(response(bytes, code, length) { closed++ }); fail("accepted") }
                catch (e: Exception) { assertFalse(e.message.orEmpty().contains("secret")) }
                assertEquals(1, closed)
            }
    }
    @Test fun responseMalformedAndNullBodyAreRejected() {
        try { readAgentRunJson(response("not json".toByteArray())); fail("accepted malformed") } catch (_: ApiException) { }
        val empty = Response.Builder().request(Request.Builder().url("https://example.test/").build()).protocol(Protocol.HTTP_1_1).code(200).message("OK").build()
        try { readAgentRunJson(empty); fail("accepted empty") } catch (e: ApiException) { assertEquals(200, e.statusCode) }
    }
    @Test fun responseAcceptsDepthLimitAndIgnoresEscapedDelimiterText() {
        fun nested(depth: Int): String = "{\"a\":".repeat(depth) + "0" + "}".repeat(depth)
        assertNotNull(readAgentRunJson(response(nested(AgentRunReaderPolicy.MAX_JSON_DEPTH).toByteArray())))
        val stringWithFakeDepth = "{\"text\":\"" + "\\\"[{\\\"".repeat(200) + "\"}"
        assertNotNull(readAgentRunJson(response(stringWithFakeDepth.toByteArray())))
        try { readAgentRunJson(response(nested(AgentRunReaderPolicy.MAX_JSON_DEPTH + 1).toByteArray())); fail("accepted excessive depth") }
        catch (_: ApiException) { }
        val strictInvalid = listOf(
            "{'x':${nested(80)}}", "{x:\"${nested(80)}\"}", "${nested(1)} trailing", "{\"x\":1,}",
            "{\"x\":'${nested(80)}'}", "{\"x\":01}", "{\"x\":+1}", "{\"x\":.1}", "{\"x\":1.}",
            "{\"x\":1e}", "{\"x\":NaN}", "{\"x\":true false}"
        )
        strictInvalid.forEach { raw ->
            try { readAgentRunJson(response(raw.toByteArray())); fail("accepted invalid JSON: $raw") } catch (_: ApiException) { }
        }
        val valid = "{\"s\":\"quote \\\" slash \\\\ control \\n unicode \\u263A\",\"n\":[-0,0,12,-1.25,6e+2],\"b\":true,\"f\":false,\"z\":null}"
        assertNotNull(readAgentRunJson(response(valid.toByteArray())))
    }
    @Test fun jsonUnicodeEscapesRequireAsciiHexAndFailureClosesResponse() {
        listOf("１２３４", "١٢٣٤", "12G4", "123").forEach { digits ->
            var closed = 0
            val raw = "{\"text\":\"\\u$digits\"}"
            try { readAgentRunJson(response(raw.toByteArray(), onClose = { closed++ })); fail("accepted non-standard escape") }
            catch (_: ApiException) { }
            assertEquals(1, closed)
        }
        assertEquals("你好😀", readAgentRunJson(response("{\"text\":\"你好😀\"}".toByteArray())).getString("text"))
    }
    @Test fun invalidUtf8DoesNotSilentlyReplaceSourceCharacters() {
        listOf(byteArrayOf(0xc3.toByte(), 0x28), byteArrayOf(0xf0.toByte(), 0x9f.toByte()), byteArrayOf(0x80.toByte())).forEach { invalid ->
            var closed = 0
            val bytes = "{\"text\":\"".toByteArray() + invalid + "\"}".toByteArray()
            try { readAgentRunJson(response(bytes, onClose = { closed++ })); fail("accepted invalid UTF8") }
            catch (_: ApiException) { }
            assertEquals(1, closed)
        }
    }
    @Test fun jsonArraysRequireCompleteStructureAndStandardWhitespace() {
        listOf("{\"a\":[1,]}", "{\"a\":[,1]}", "{\"a\":[1 2]}", "{\"a\":[truefalse]}",
            "{\"a\":[]]}", "{\"a\":[}", "{\"a\":true}\u00a0", "{\"a\":\"raw\nline\"}").forEach { raw ->
            try { readAgentRunJson(response(raw.toByteArray())); fail("accepted malformed structure") }
            catch (_: ApiException) { }
        }
        assertNotNull(readAgentRunJson(response(" \t\r\n{\"a\": [1, -2.5e-3, {\"b\":null}]} \n".toByteArray())))
    }
    @Test fun responseIoFailureClosesBody() {
        var closed = 0
        val source = object : ForwardingSource(Buffer()) { override fun read(sink: Buffer, byteCount: Long): Long = throw IOException("broken"); override fun close() { super.close(); closed++ } }.buffer()
        val body = object : ResponseBody() { override fun contentType() = null; override fun contentLength() = -1L; override fun source() = source }
        val response = Response.Builder().request(Request.Builder().url("https://example.test/").build()).protocol(Protocol.HTTP_1_1).code(200).message("OK").body(body).build()
        try { readAgentRunJson(response); fail("accepted broken stream") } catch (_: IOException) { }
        assertEquals(1, closed)
    }

    @Test fun scopedJsonUsesResourceDecoderForRetryAndDoesNotRefreshMoreThanOnce() {
        var sends = 0; var refreshes = 0; var invalidations = 0; var decodes = 0
        val result = readScopedJson({ true }, { sends++; response("{}".toByteArray(), if (sends == 1) 401 else 200) },
            { refreshes++; true }, { invalidations++ }) { decodes++; readAgentRunJson(it) }
        assertTrue(result.length() == 0); assertEquals(2, sends); assertEquals(1, refreshes); assertEquals(1, decodes); assertEquals(0, invalidations)
    }

    @Test fun scopedJsonDiscardsLateResponseAndIdentityChangeDuringDecode() {
        var current = true; var invalidations = 0; var closed = 0
        try {
            readScopedJson({ current }, { current = false; response("{}".toByteArray(), onClose = { closed++ }) }, { true }, { invalidations++ }) { readAgentRunJson(it) }
            fail("returned response for stale identity")
        } catch (_: CancellationException) { }
        assertEquals(1, closed); assertEquals(0, invalidations)

        current = true
        try {
            readScopedJson({ current }, { response("{}".toByteArray()) }, { true }, { invalidations++ }) {
                val json = readAgentRunJson(it); current = false; json
            }
            fail("returned decoded data for stale identity")
        } catch (_: CancellationException) { }
        assertEquals(0, invalidations)
    }

    private fun snapshot(id: String) = AgentRunSnapshot(AgentRunDetail(id, "task", "running"), emptyList(), emptyList())
    @Test fun controllerOpensRefreshesAndKeepsNoOldSnapshotWhileRefreshing() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var calls = 0
            val c = AgentRunReaderController(scope, { calls++; snapshot(it) })
            c.open("r-1"); assertEquals(snapshot("r-1"), c.state.value.snapshot)
            c.refresh(); assertEquals(2, calls); assertEquals(snapshot("r-1"), c.state.value.snapshot)
            c.clear(); assertEquals(AgentRunReaderState(), c.state.value)
        } finally { scope.cancel() }
    }
    @Test fun controllerRefreshDoesNotDuplicateInFlightRequestAndFailureCanRetry() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var calls = 0; val gate = CompletableDeferred<AgentRunSnapshot>()
            val c = AgentRunReaderController(scope, read = { calls++; if (calls == 1) gate.await() else snapshot(it) })
            c.open("r-1"); c.refresh(); assertEquals(1, calls); gate.completeExceptionally(IOException("offline"))
            assertNotNull(c.state.value.error); c.refresh(); assertEquals(2, calls); assertEquals(snapshot("r-1"), c.state.value.snapshot)
        } finally { scope.cancel() }
    }
    @Test fun controllerCancelsOldWorkAndIgnoresNonCooperativeLateResult() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val gate = CompletableDeferred<AgentRunSnapshot>()
            val c = AgentRunReaderController(scope, read = { id -> if (id == "r-1") withContext(NonCancellable) { gate.await() } else snapshot(id) })
            c.open("r-1"); c.open("r-2"); gate.complete(snapshot("r-1"))
            assertEquals("r-2", c.state.value.runId); assertEquals(snapshot("r-2"), c.state.value.snapshot)
        } finally { scope.cancel() }
    }
    @Test fun controllerClearIgnoresLateUnauthorizedAndDoesNotNotify() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val gate = CompletableDeferred<AgentRunSnapshot>(); var unauthorized = 0
            val c = AgentRunReaderController(scope, { withContext(NonCancellable) { gate.await() } }, { unauthorized++ })
            c.open("r-1"); c.clear(); gate.completeExceptionally(ApiException(401, "denied"))
            assertEquals(0, unauthorized); assertEquals(AgentRunReaderState(), c.state.value)
        } finally { scope.cancel() }
    }
    @Test fun controllerCurrentUnauthorizedClearsAndCallsCallback() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var unauthorized = 0
            val c = AgentRunReaderController(scope, { throw ApiException(401, "denied") }, { unauthorized++ })
            c.open("r-1"); assertEquals(1, unauthorized); assertEquals(AgentRunReaderState(), c.state.value)
        } finally { scope.cancel() }
    }
    @Test fun controller404IsExplicitAndRetryable() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var calls = 0
            val c = AgentRunReaderController(scope, read = { calls++; if (calls == 1) throw ApiException(404, "secret") else snapshot(it) })
            c.open("r-1"); assertTrue(c.state.value.error.orEmpty().contains("不可访问")); assertNull(c.state.value.snapshot)
            c.refresh(); assertEquals(snapshot("r-1"), c.state.value.snapshot)
        } finally { scope.cancel() }
    }
    @Test fun controllerRejectsMismatchedResultAndInvalidId() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val c = AgentRunReaderController(scope, { snapshot("other") })
            c.open("bad id"); assertFalse(c.state.value.loading); assertNotNull(c.state.value.error)
            c.open("r-1"); assertNull(c.state.value.snapshot); assertTrue(c.state.value.error.orEmpty().contains("身份"))
        } finally { scope.cancel() }
    }
}
