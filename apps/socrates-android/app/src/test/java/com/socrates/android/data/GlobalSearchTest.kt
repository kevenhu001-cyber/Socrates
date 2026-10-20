package com.socrates.android.data

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class GlobalSearchTest {
    private fun row(kind: Any?, id: Any?, sessionId: Any?, title: Any? = "title", snippet: Any? = "<mark>hit</mark>") =
        JSONObject().put("kind", kind).put("id", id).put("sessionId", sessionId).put("title", title).put("snippet", snippet)

    @Test fun postsTrimmedQueryScopeAndFixedLimitAndPreservesWireInput() {
        val input = JSONObject().put("hits", JSONArray().put(row("message", "m1", "s1")))
        var method = ""; var path = ""; var body: JSONObject? = null
        val hits = GlobalSearchRepository { m, p, b -> method = m; path = p; body = b; input }.search("  hello  ", SearchScope.MESSAGES)
        assertEquals("POST", method); assertEquals("search", path)
        assertEquals("hello", body!!.getString("q")); assertEquals("messages", body!!.getString("scope")); assertEquals(50, body!!.getInt("limit"))
        assertEquals(1, hits.size); assertEquals("<mark>hit</mark>", input.getJSONArray("hits").getJSONObject(0).getString("snippet"))
    }

    @Test fun enforcesTrimmedQueryBoundsAndDoesNotSendInvalidQueries() {
        var calls = 0
        val repo = GlobalSearchRepository { _, _, _ -> calls++; JSONObject().put("hits", JSONArray()) }
        listOf("", "   ", "x".repeat(GlobalSearchRepository.MAX_QUERY + 1)).forEach { q ->
            try { repo.search(q, SearchScope.ALL); fail("expected invalid query") } catch (_: IllegalArgumentException) { }
        }
        repo.search("x".repeat(GlobalSearchRepository.MAX_QUERY), SearchScope.ALL)
        assertEquals(1, calls)
    }

    @Test fun missingHitsIsServerError() {
        try { GlobalSearchRepository { _, _, _ -> JSONObject() }.search("x", SearchScope.ALL); fail("expected error") }
        catch (e: IllegalStateException) { assertTrue(e.message!!.contains("搜索结果")) }
    }

    @Test fun dropsMalformedKindsAndIdsDeduplicatesAndTreatsSnippetAsLiteralExceptMarks() {
        val hits = JSONArray()
            .put(row("message", "m1", "s1", snippet = "<mark>x</mark><b>y</b>"))
            .put(row("message", "m1", "s1", title = "duplicate"))
            .put(row("future", "m2", "s1"))
            .put(row("session", "bad.id", "s1"))
            .put(row("message", "m3", "bad/id"))
            .put(row(12, "m4", "s1"))
            .put(row("session", "s1", "s1"))
        val result = GlobalSearchRepository { _, _, _ -> JSONObject().put("hits", hits) }.search("q", SearchScope.ALL)
        assertEquals(2, result.size); assertEquals("x<b>y</b>", result[0].snippet); assertEquals("<b>y</b>", result[0].snippet.substring(1))
        assertEquals("session", result[1].kind)
    }

    @Test fun respectsEachSearchScopeOnRequest() {
        val seen = mutableListOf<String>()
        val repo = GlobalSearchRepository { _, _, body -> seen += body!!.getString("scope"); JSONObject().put("hits", JSONArray()) }
        SearchScope.entries.forEach { repo.search("q", it) }
        assertEquals(listOf("all", "sessions", "messages"), seen)
    }

    @Test fun capsReturnedRowsAndPropagatesServerErrors() {
        val rows = JSONArray()
        repeat(80) { rows.put(row("message", "m$it", "s1")) }
        assertEquals(GlobalSearchRepository.LIMIT, GlobalSearchRepository { _, _, _ -> JSONObject().put("hits", rows) }.search("x", SearchScope.ALL).size)
        listOf(401, 429, 500).forEach { status ->
            val failure = ApiException(status, "HTTP $status")
            try { GlobalSearchRepository { _, _, _ -> throw failure }.search("x", SearchScope.ALL); fail("expected failure") }
            catch (e: ApiException) { assertSame(failure, e) }
        }
    }

    @Test fun clearInvalidatesNonCooperativeRequestAndRemovesAccountResults() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val response = CompletableDeferred<List<SearchHit>>()
            val controller = GlobalSearchController(scope) { _, _ -> withContext(NonCancellable) { response.await() } }
            controller.edit("old account"); controller.submit()
            assertTrue(controller.state.value.loading)
            controller.clear()
            response.complete(listOf(SearchHit("session", "old", "old", "", "")))
            assertEquals(GlobalSearchState(), controller.state.value)
        } finally { scope.cancel() }
    }

    @Test fun navigationFindsOnlyExactMessageInExactSessionWithoutMutatingWire() {
        val wire = JSONObject().put("extra", JSONObject().put("x", 1))
        val session = ChatSession(id = "s1", messages = listOf(ChatMessage(id = "m1", role = "user", content = "one"), ChatMessage(id = "m10", role = "assistant", content = "ten")), wire = wire)
        assertEquals("m1", SearchNavigation.messageId(session, SearchHit("message", "m1", "s1", "", "")))
        assertNull(SearchNavigation.messageId(session, SearchHit("message", "m", "s1", "", "")))
        assertNull(SearchNavigation.messageId(session, SearchHit("message", "m1", "other", "", "")))
        assertNull(SearchNavigation.messageId(session, SearchHit("session", "s1", "s1", "", "")))
        assertEquals(1, wire.getJSONObject("extra").getInt("x")); assertEquals(2, session.messages.size)
    }

    @Test fun controllerSubmitLoadSuccessErrorEditClearAndInvalidQuery() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var attempts = 0
            val expected = listOf(SearchHit("message", "m", "s", "t", "snippet"))
            val controller = GlobalSearchController(scope) { query, filter ->
                attempts++
                assertEquals("term", query); assertEquals(SearchScope.MESSAGES, filter)
                if (attempts == 1) throw IllegalStateException("network down")
                expected
            }
            controller.edit(" term ", SearchScope.MESSAGES)
            controller.submit()
            assertFalse(controller.state.value.loading); assertEquals("network down", controller.state.value.error)
            controller.submit()
            assertTrue(controller.state.value.searched); assertEquals(expected, controller.state.value.hits); assertNull(controller.state.value.error)
            controller.edit("changed", SearchScope.ALL)
            assertEquals("changed", controller.state.value.query); assertFalse(controller.state.value.searched); assertTrue(controller.state.value.hits.isEmpty())
            controller.clear()
            assertEquals("", controller.state.value.query); assertEquals(SearchScope.ALL, controller.state.value.scope)
            controller.edit(" "); controller.submit()
            assertNotNull(controller.state.value.error); assertEquals(2, attempts)
        } finally { scope.cancel() }
    }

    @Test fun controllerCancelsOldResultAndAllowsRetryAfterFailure() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val old = CompletableDeferred<List<SearchHit>>()
            var calls = 0
            val fresh = listOf(SearchHit("session", "new", "new", "", ""))
            val controller = GlobalSearchController(scope) { query, _ ->
                calls++
                when (query) { "old" -> old.await(); "new" -> fresh; else -> error("unexpected") }
            }
            controller.edit("old"); controller.submit()
            assertTrue(controller.state.value.loading)
            controller.edit("new"); controller.submit()
            old.complete(listOf(SearchHit("session", "stale", "stale", "", "")))
            assertEquals(fresh, controller.state.value.hits); assertTrue(controller.state.value.searched); assertFalse(controller.state.value.loading)
            assertEquals(2, calls)
        } finally { scope.cancel() }
    }
}
