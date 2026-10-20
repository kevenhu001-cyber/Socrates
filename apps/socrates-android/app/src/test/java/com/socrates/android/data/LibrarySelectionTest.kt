package com.socrates.android.data

import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class LibrarySelectionTest {
    private fun item(id: String, collection: String? = null) = FeatureItem(id, id, raw = JSONObject().apply { collection?.let { put("_collection", it) } })
    private fun controller(scope: CoroutineScope, delete: suspend (LibraryResourceKey) -> Unit = {}, removed: MutableList<LibraryResourceKey> = mutableListOf(), unauthorized: () -> Unit = {}) =
        LibrarySelectionController(scope, delete, { removed += it }, unauthorized)
    private fun scope() = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)

    @Test fun keysSeparateCollectionsAndValidateInputs() {
        assertNotEquals(LibraryResourceKey.from(item("same")), LibraryResourceKey.from(item("same", "artifacts")))
        assertEquals("files", LibraryResourceKey.from(item("ok"))?.collection)
        listOf("", "bad/id", "../bad", "bad?id", "x".repeat(129)).forEach { assertNull(LibraryResourceKey.from(item(it))) }
        listOf("other", "FILES", "files/../artifacts").forEach { assertNull(LibraryResourceKey.from(item("ok", it))) }
        assertNotNull(LibraryResourceKey.from(item("a-_123")))
        assertNotNull(LibraryResourceKey.from(item("x".repeat(128))))
    }

    @Test fun visibleSelectionTouchesOnlyVisibleItems() {
        val scope = scope()
        try {
            val c = controller(scope); val a = item("a"); val b = item("b"); val outside = item("outside")
            c.toggle(outside); c.selectVisible(listOf(a, b, a, item("invalid/id")))
            assertEquals(setOf("a", "b", "outside"), c.state.value.selection.map { it.id }.toSet())
            c.selectVisible(listOf(a, b))
            assertEquals(setOf("outside"), c.state.value.selection.map { it.id }.toSet())
            c.selectVisible(emptyList())
            assertEquals(setOf("outside"), c.state.value.selection.map { it.id }.toSet())
        } finally { scope.cancel() }
    }

    @Test fun equalIdsFromDifferentCollectionsAreDeletedSeparatelyExactlyOnce() {
        val scope = scope(); val requested = mutableListOf<String>()
        try {
            val c = controller(scope, { requested += "${it.collection}/${it.id}" })
            c.toggle(item("same")); c.toggle(item("same", "artifacts")); c.requestDelete(); c.deleteConfirmed(); c.deleteConfirmed()
            assertEquals(listOf("files/same", "artifacts/same"), requested)
            assertTrue(c.state.value.selection.isEmpty()); assertEquals(2, c.state.value.succeeded)
            assertNotNull(c.state.value.notice)
        } finally { scope.cancel() }
    }

    @Test fun confirmationIsFixedSnapshotAndRepeatConfirmationDoesNotDuplicate() = runBlocking<Unit> {
        val scope = scope(); val gate = CompletableDeferred<Unit>(); val calls = mutableListOf<String>()
        try {
            val c = controller(scope, { calls += it.id; gate.await() })
            c.toggle(item("a")); c.toggle(item("b")); c.requestDelete()
            c.toggle(item("c")); c.requestDelete()
            assertEquals(listOf("a", "b"), c.state.value.confirmation!!.map { it.id })
            c.deleteConfirmed(); c.deleteConfirmed(); assertEquals(listOf("a"), calls)
            gate.complete(Unit)
            assertEquals(listOf("a", "b"), calls)
            assertEquals(setOf("c"), c.state.value.selection.map { it.id }.toSet())
        } finally { scope.cancel() }
    }

    @Test fun cancelConfirmationNeverDeletesAndRetainsSelection() {
        val scope = scope(); var calls = 0
        try {
            val c = controller(scope, { calls++ }); c.toggle(item("a")); c.requestDelete(); c.cancelDelete(); c.deleteConfirmed()
            assertEquals(0, calls); assertEquals(1, c.state.value.selection.size); assertNull(c.state.value.confirmation)
        } finally { scope.cancel() }
    }

    @Test fun emptyAndInvalidSelectionsNeverProduceConfirmationOrRequest() {
        val scope = scope(); var calls = 0
        try {
            val c = controller(scope, { calls++ }); c.toggle(item("../bad")); c.toggle(item("ok", "unknown")); c.requestDelete(); c.deleteConfirmed()
            assertNull(c.state.value.confirmation); assertEquals(0, calls)
        } finally { scope.cancel() }
    }

    @Test fun partialFailureAnd404RemoveOnlyConfirmedResources() {
        val scope = scope(); val removed = mutableListOf<LibraryResourceKey>(); val requested = mutableListOf<String>()
        try {
            val c = controller(scope, {
                requested += it.id
                if (it.id == "missing") throw ApiException(404, "missing")
                if (it.id == "fail") throw IOException("timeout")
            }, removed)
            listOf("missing", "fail", "ok").forEach { c.toggle(item(it)) }; c.requestDelete(); c.deleteConfirmed()
            assertEquals(listOf("missing", "fail", "ok"), requested)
            assertEquals(setOf("fail"), c.state.value.selection.map { it.id }.toSet())
            assertEquals(setOf("missing", "ok"), removed.map { it.id }.toSet()); assertEquals(2, c.state.value.succeeded)
            assertTrue(c.state.value.failures.values.single().contains("先刷新")); assertFalse(c.state.value.busy)
        } finally { scope.cancel() }
    }

    @Test fun ambiguousNetworkAndServerFailuresNeverAutomaticallyRetry() {
        listOf(IOException("timeout"), ApiException(500, "server"), ApiException(403, "forbidden")).forEach { failure ->
            val scope = scope(); var count = 0
            try {
                val c = controller(scope, { count++; throw failure }); c.toggle(item("a")); c.requestDelete(); c.deleteConfirmed(); c.deleteConfirmed()
                assertEquals(1, count); assertEquals(0, c.state.value.succeeded)
                assertEquals(1, c.state.value.selection.size); assertEquals(1, c.state.value.failures.size)
            } finally { scope.cancel() }
        }
    }

    @Test fun unauthorizedStopsQueueAndClearsAccountState() {
        val scope = scope(); var calls = 0; var auth = 0
        try {
            val c = controller(scope, { calls++; throw ApiException(401, "expired") }, unauthorized = { auth++ })
            c.toggle(item("a")); c.toggle(item("b")); c.requestDelete(); c.deleteConfirmed()
            assertEquals(1, calls); assertEquals(1, auth); assertTrue(c.state.value.selection.isEmpty())
            assertTrue(c.state.value.failures.isEmpty()); assertFalse(c.state.value.busy); assertNull(c.state.value.confirmation)
        } finally { scope.cancel() }
    }

    @Test fun busyBlocksConflictingSelectionAndConfirmationMutations() = runBlocking<Unit> {
        val scope = scope(); val gate = CompletableDeferred<Unit>()
        try {
            val c = controller(scope, { gate.await() }); c.toggle(item("a")); c.requestDelete(); c.deleteConfirmed()
            val before = c.state.value
            c.toggle(item("b")); c.selectVisible(listOf(item("b"))); c.clearSelection(); c.cancelDelete(); c.requestDelete(); c.reconcile(emptyList())
            assertEquals(before, c.state.value)
            gate.complete(Unit)
        } finally { scope.cancel() }
    }

    @Test fun refreshReconcilesExactKeysWithoutRemovingSameIdInOtherCollection() {
        val scope = scope()
        try {
            val c = controller(scope); c.toggle(item("a")); c.toggle(item("a", "artifacts")); c.reconcile(listOf(item("a", "artifacts")))
            assertEquals(setOf(LibraryResourceKey("artifacts", "a")), c.state.value.selection)
        } finally { scope.cancel() }
    }

    @Test fun clearCancelsOldRequestAndPreventsStaleCallback() = runBlocking<Unit> {
        val scope = scope(); val gate = CompletableDeferred<Unit>(); val removed = mutableListOf<LibraryResourceKey>()
        try {
            val c = controller(scope, { gate.await() }, removed); c.toggle(item("a")); c.requestDelete(); c.deleteConfirmed()
            c.clear(); gate.complete(Unit)
            assertTrue(removed.isEmpty()); assertEquals(LibrarySelectionState(), c.state.value)
        } finally { scope.cancel() }
    }

    @Test fun nonCooperativeOldRequestCannotWriteIntoNewAccountSelection() = runBlocking<Unit> {
        val scope = scope(); val gate = CompletableDeferred<Unit>(); val removed = mutableListOf<LibraryResourceKey>()
        try {
            val c = controller(scope, { withContext(NonCancellable) { gate.await() } }, removed)
            c.toggle(item("old")); c.requestDelete(); c.deleteConfirmed(); c.clear(); c.toggle(item("new")); gate.complete(Unit)
            assertTrue(removed.isEmpty()); assertEquals(setOf("new"), c.state.value.selection.map { it.id }.toSet()); assertFalse(c.state.value.busy)
        } finally { scope.cancel() }
    }

    @Test fun callbackClearingControllerPreventsFurtherRequestsAndStaleProgress() {
        val scope = scope(); var calls = 0
        try {
            lateinit var c: LibrarySelectionController
            c = LibrarySelectionController(scope, { calls++ }, { c.clear() }, {})
            c.toggle(item("a")); c.toggle(item("b")); c.requestDelete(); c.deleteConfirmed()
            assertEquals(1, calls); assertEquals(LibrarySelectionState(), c.state.value)
        } finally { scope.cancel() }
    }
}
