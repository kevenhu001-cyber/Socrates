package com.socrates.android.data

import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class TaskExecutionTest {
    private fun task(id: String = "t1", run: Any? = JSONObject.NULL, session: Any? = "s1", kind: String = "native") =
        JSONObject().put("id", id).put("title", "task title").put("status", "active")
            .put("agentKind", kind).put("lastRunAt", "2026-10-20T00:00:00Z").put("runCount", 3)
            .put("lastRunId", run).put("sessionId", session)
    private fun envelope(row: JSONObject) = JSONObject().put("tasks", JSONArray().put(row))
    private fun snapshot(id: String = "t1", session: String? = "s1") = TaskExecutionSnapshot(id, "title", "active", "native", "", 1, session, null)

    @Test fun nativeTaskUsesRefreshedListAndDoesNotInventAgentHistory() {
        val calls = mutableListOf<String>()
        val original = task()
        val result = TaskExecutionRepository { method, path, body ->
            calls += "$method $path"; assertNull(body); envelope(original)
        }.read("t1")
        assertEquals(listOf("GET scheduled-tasks"), calls)
        assertNull(result.runId); assertNull(result.run); assertNull(result.runError)
        assertEquals("s1", result.sessionId); assertEquals(3, result.runCount)
        assertEquals("2026-10-20T00:00:00Z", result.lastRunAt)
        assertEquals(JSONObject.NULL, original.get("lastRunId"))
    }

    @Test fun loadsOnlyExplicitLatestRunAndTreatsSummaryAndArtifactsAsLiteralMetadata() {
        val paths = mutableListOf<String>()
        val run = JSONObject().put("id", "r1").put("status", "awaiting_approval").put("task", "actual prompt")
            .put("summary", "<script>literal</script>").put("error", JSONObject.NULL)
            .put("startedAt", "start").put("completedAt", JSONObject.NULL)
        val response = JSONObject().put("run", run).put("events", JSONArray().put(JSONObject().put("secretPayload", "not exposed")))
            .put("artifacts", JSONArray().put(JSONObject().put("id", "a1").put("name", "<b>name</b>").put("type", "html"))
                .put(JSONObject().put("id", "a1")).put(JSONObject().put("id", "bad/id")))
        val result = TaskExecutionRepository { m, p, _ ->
            assertEquals("GET", m); paths += p
            if (p == "scheduled-tasks") envelope(task(run = "r1", kind = "codex")) else response
        }.read("t1")
        assertEquals(listOf("scheduled-tasks", "agent-runs/r1"), paths)
        assertEquals("awaiting_approval", result.run!!.status)
        assertEquals("<script>literal</script>", result.run.summary); assertEquals("", result.run.error)
        assertEquals("", result.run.completedAt); assertEquals(1, result.run.artifacts.size)
        assertEquals("<b>name</b>", result.run.artifacts.single().name)
    }

    @Test fun missingAndMalformedTaskListsAndInvalidReferencesDoNotBecomeEmptyHistory() {
        listOf(JSONObject(), JSONObject().put("tasks", JSONArray())).forEach { response ->
            try { TaskExecutionRepository { _, _, _ -> response }.read("t1"); fail("expected failure") }
            catch (_: Exception) { }
        }
        listOf("../other", "bad/id", 12, "x".repeat(129)).forEach { invalid ->
            var calls = 0
            try { TaskExecutionRepository { _, _, _ -> calls++; envelope(task(run = invalid)) }.read("t1"); fail("expected failure") }
            catch (_: IllegalArgumentException) { }
            assertEquals(1, calls)
        }
        var calls = 0
        try { TaskExecutionRepository { _, _, _ -> calls++; JSONObject() }.read("../invalid"); fail("expected failure") }
        catch (_: IllegalArgumentException) { }
        assertEquals(0, calls)
    }

    @Test fun deletedTaskIs404RatherThanStaleTaskFallback() {
        try { TaskExecutionRepository { _, _, _ -> envelope(task(id = "other")) }.read("t1"); fail("expected failure") }
        catch (e: ApiException) { assertEquals(404, e.statusCode) }
    }

    @Test fun run404AndBadEnvelopeRetainRealTaskSessionLinkAndExposeError() {
        listOf<() -> JSONObject>(
            { throw ApiException(404, "gone") }, { JSONObject() },
            { JSONObject().put("run", JSONObject().put("id", "another")) },
        ).forEach { response ->
            val result = TaskExecutionRepository { _, p, _ -> if (p == "scheduled-tasks") envelope(task(run = "r1")) else response() }.read("t1")
            assertEquals("s1", result.sessionId); assertEquals("r1", result.runId)
            assertNull(result.run); assertNotNull(result.runError)
        }
    }

    @Test fun unauthorizedAndCancellationAreNotSwallowedAsOptionalRunErrors() {
        listOf<Exception>(ApiException(401, "auth"), CancellationException("cancel")).forEach { failure ->
            try {
                TaskExecutionRepository { _, p, _ -> if (p == "scheduled-tasks") envelope(task(run = "r1")) else throw failure }.read("t1")
                fail("expected failure")
            } catch (e: Exception) { assertSame(failure, e) }
        }
    }

    @Test fun immediateRunReturnsUpdatedTaskNotAgentEnvelopeAndSubmitsOnlyOnce() {
        var count = 0
        val result = TaskExecutionRepository { method, path, body ->
            count++; assertEquals("POST", method); assertEquals("scheduled-tasks/t1/run", path); assertNull(body)
            task(run = "r2").put("status", "failed")
        }.runNow("t1")
        assertEquals(1, count); assertEquals("t1", result.id); assertEquals("r2", result.raw.getString("lastRunId"))
        assertEquals("failed", result.raw.getString("status"))
    }

    @Test fun ambiguousRunFailureNeverRetriesAndWarnsToRefreshBeforeResubmission() {
        listOf<Exception>(IOException("timeout"), ApiException(500, "server error")).forEach { failure ->
            var count = 0
            try { TaskExecutionRepository { _, _, _ -> count++; throw failure }.runNow("t1"); fail("expected failure") }
            catch (e: IOException) { assertTrue(e.message!!.contains("可能仍在执行")); assertSame(failure, e.cause) }
            assertEquals(1, count)
        }
    }

    @Test fun runAuthErrorsRemainAuthErrorsAndInvalidResponseNeverLooksSuccessful() {
        val failure = ApiException(401, "expired")
        try { TaskExecutionRepository { _, _, _ -> throw failure }.runNow("t1"); fail("expected failure") }
        catch (e: ApiException) { assertSame(failure, e) }
        listOf(JSONObject(), JSONObject().put("run", JSONObject().put("id", "t1")), task(id = "other")).forEach { response ->
            try { TaskExecutionRepository { _, _, _ -> response }.runNow("t1"); fail("expected failure") }
            catch (e: IllegalStateException) { assertTrue(e.message!!.contains("不要立即重复运行")) }
        }
    }

    @Test fun controllerLoadsAndRefreshesLatestReferencesAndReadOnlySession() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var count = 0; var sessionReads = 0
            val original = ChatSession(id = "s1", messages = listOf(ChatMessage(id = "m1", role = "assistant", content = "actual result")))
            val controller = TaskExecutionController(scope, { count++; snapshot() }, { sessionReads++; assertEquals("s1", it); original })
            controller.open("t1")
            assertEquals(1, count); assertNotNull(controller.state.value.snapshot)
            controller.loadSession()
            assertEquals(original, controller.state.value.session); assertEquals(1, sessionReads)
            controller.refresh()
            assertEquals(2, count); assertNull(controller.state.value.session)
            assertFalse(controller.state.value.loading)
            controller.clear(); assertEquals(TaskExecutionState(), controller.state.value)
            assertEquals("actual result", original.messages.single().content)
        } finally { scope.cancel() }
    }

    @Test fun controllerCanRetryTaskAndSessionFailuresSeparately() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var reads = 0; var sessions = 0
            val controller = TaskExecutionController(scope,
                { if (++reads == 1) throw IOException("offline"); snapshot() },
                { if (++sessions == 1) throw ApiException(404, "gone"); ChatSession(id = it) })
            controller.open("t1"); assertEquals("offline", controller.state.value.error)
            controller.refresh(); assertNull(controller.state.value.error)
            controller.loadSession(); assertTrue(controller.state.value.sessionError!!.contains("不可访问"))
            assertNotNull(controller.state.value.snapshot)
            controller.loadSession(); assertNotNull(controller.state.value.session); assertNull(controller.state.value.sessionError)
        } finally { scope.cancel() }
    }

    @Test fun closingOrSwitchingInvalidatesNonCooperativeTaskRead() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val old = CompletableDeferred<TaskExecutionSnapshot>()
            val controller = TaskExecutionController(scope, { if (it == "old") withContext(NonCancellable) { old.await() } else snapshot(it) }, { ChatSession(id = it) })
            controller.open("old"); assertTrue(controller.state.value.loading)
            controller.open("new"); assertEquals("new", controller.state.value.snapshot!!.taskId)
            old.complete(snapshot("old")); assertEquals("new", controller.state.value.snapshot!!.taskId)
            controller.clear(); assertEquals(TaskExecutionState(), controller.state.value)
        } finally { scope.cancel() }
    }

    @Test fun refreshInvalidatesInFlightSessionAndClosingClearsAccountContent() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val response = CompletableDeferred<ChatSession>()
            var sessionCalls = 0
            val controller = TaskExecutionController(scope, { snapshot(it) }, { sessionCalls++; withContext(NonCancellable) { response.await() } })
            controller.open("t1"); controller.loadSession(); controller.loadSession()
            assertEquals(1, sessionCalls)
            controller.refresh(); assertFalse(controller.state.value.sessionLoading)
            controller.clear(); response.complete(ChatSession(id = "s1"))
            assertEquals(TaskExecutionState(), controller.state.value)
        } finally { scope.cancel() }
    }

    @Test fun unauthorizedClearsAccountDataAndSignalsAuthLossOnce() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var unauthorized = 0
            val controller = TaskExecutionController(scope, { snapshot(it) }, { throw ApiException(401, "expired") }, { unauthorized++ })
            controller.open("t1"); controller.loadSession()
            assertEquals(1, unauthorized); assertEquals(TaskExecutionState(), controller.state.value)
        } finally { scope.cancel() }
    }

    @Test fun mismatchedSessionsNeverAppearAndMissingSessionDoesNotIssueRequest() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var calls = 0
            val controller = TaskExecutionController(scope, { snapshot(it, if (it == "no_session") null else "s1") }, { calls++; ChatSession(id = "wrong") })
            controller.open("no_session"); controller.loadSession(); assertEquals(0, calls)
            controller.open("t1"); controller.loadSession()
            assertNull(controller.state.value.session); assertTrue(controller.state.value.sessionError!!.contains("不匹配"))
        } finally { scope.cancel() }
    }
}
