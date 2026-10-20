package com.socrates.android.ui

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class AttachmentBatchTest {
    private fun attachment(name: String, text: String = "", image: String? = null, key: String = name) =
        PendingAttachment(name = name, text = text, imageDataUrl = image, key = key)

    @Test fun selectionDeduplicatesAndKeepsFirstOccurrenceOrder() {
        assertEquals(listOf("b", "a", "c"), AttachmentBatch.selection(listOf("b", "a", "b", "c", "a"), 0))
    }
    @Test fun selectionAcceptsZeroCapacityOnlyForEmptyBatch() {
        assertTrue(AttachmentBatch.selection(emptyList<String>(), 0).isEmpty())
        assertTrue(runCatching { AttachmentBatch.selection(listOf("x"), AttachmentDraft.MAX_COUNT) }.isFailure)
    }
    @Test fun selectionAcceptsExactlyFullCapacity() {
        val items = (1..AttachmentDraft.MAX_COUNT).toList()
        assertEquals(items, AttachmentBatch.selection(items, 0))
    }
    @Test fun selectionAccountsForExistingItemsAtExactBoundary() {
        val remaining = AttachmentDraft.MAX_COUNT - 2
        assertEquals((1..remaining).toList(), AttachmentBatch.selection((1..remaining).toList(), 2))
    }
    @Test fun selectionRejectsOverCapacityAsAWholeAndReportsRemainingCapacity() {
        val error = runCatching { AttachmentBatch.selection((1..4).toList(), AttachmentDraft.MAX_COUNT - 3) }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
        assertTrue(error?.message.orEmpty().contains("剩余容量为 3"))
        assertTrue(error?.message.orEmpty().contains("本次未添加任何附件"))
        assertTrue(error?.message.orEmpty().contains("重新选择不超过 3 个"))
    }
    @Test fun selectionEmptyInputIsEmptyEvenWhenDraftIsFull() {
        assertTrue(AttachmentBatch.selection(emptyList<String>(), AttachmentDraft.MAX_COUNT).isEmpty())
    }

    @Test fun loadReadsSequentiallyWithOriginalAndEarlierStagedAttachments() = runBlocking {
        val original = attachment("original")
        val seen = mutableListOf<List<String>>()
        val result = AttachmentBatch.load(listOf("one", "two"), listOf(original), {}, { item, current ->
            seen += current.map { it.name }
            attachment(item)
        })
        assertEquals(listOf(listOf("original"), listOf("original", "one")), seen)
        assertEquals(listOf("original", "one", "two"), result.map { it.name })
    }
    @Test fun loadEmptyReturnsOriginalContents() = runBlocking {
        val original = listOf(attachment("original"))
        assertEquals(original, AttachmentBatch.load(emptyList<Int>(), original, {}, { _, _ -> error("unused") }))
    }
    @Test fun loadFailurePropagatesAndDoesNotReadLaterItemsOrMutateOriginal() = runBlocking {
        val original = listOf(attachment("original"))
        var reads = 0
        val failure = runCatching {
            AttachmentBatch.load(listOf(1, 2, 3), original, {}, { item, _ ->
                reads++
                if (item == 2) error("read failed")
                attachment("staged")
            })
        }.exceptionOrNull()
        assertEquals("read failed", failure?.message)
        assertEquals(2, reads)
        assertEquals(listOf("original"), original.map { it.name })
    }
    @Test fun loadChecksActivityBeforeAndAfterEachRead() = runBlocking {
        var checks = 0
        var reads = 0
        val result = AttachmentBatch.load(listOf(1, 2), emptyList(), { checks++ }, { item, _ ->
            reads++
            attachment("$item")
        })
        assertEquals(4, checks)
        assertEquals(2, reads)
        assertEquals(2, result.size)
    }
    @Test fun loadStopsImmediatelyWhenInactiveBeforeRead() = runBlocking {
        var reads = 0
        val error = runCatching {
            AttachmentBatch.load(listOf(1, 2), emptyList(), { throw IllegalStateException("stale") }, { _, _ -> reads++; attachment("x") })
        }.exceptionOrNull()
        assertEquals("stale", error?.message)
        assertEquals(0, reads)
    }
    @Test fun loadStopsAfterReadWhenActivityBecomesStale() = runBlocking {
        var checks = 0
        var reads = 0
        val error = runCatching {
            AttachmentBatch.load(listOf(1, 2), emptyList(), { if (++checks == 2) error("stale") }, { _, _ -> reads++; attachment("x") })
        }.exceptionOrNull()
        assertEquals("stale", error?.message)
        assertEquals(1, reads)
    }
    @Test fun loadPropagatesCancellationWithoutReadingLaterItems() = runBlocking {
        var reads = 0
        val error = runCatching {
            AttachmentBatch.load(listOf(1, 2), emptyList(), {}, { _, _ -> reads++; throw CancellationException("cancelled") })
        }.exceptionOrNull()
        assertTrue(error is CancellationException)
        assertEquals(1, reads)
    }
    @Test fun loadUsesAttachmentDraftAppendCountLimit() = runBlocking {
        val existing = (1..AttachmentDraft.MAX_COUNT).map { attachment("$it") }
        val error = runCatching { AttachmentBatch.load(listOf(1), existing, {}, { _, _ -> attachment("extra") }) }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
        assertEquals(AttachmentDraft.MAX_COUNT, existing.size)
    }
    @Test fun loadEnforcesDuplicateAttachmentIdentity() = runBlocking {
        val existing = listOf(attachment("same", key = "shared"))
        val error = runCatching { AttachmentBatch.load(listOf(1), existing, {}, { _, _ -> attachment("again", key = "shared") }) }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
        assertEquals(1, existing.size)
    }
    @Test fun loadEnforcesAggregateImageBudget() = runBlocking {
        val existing = listOf(attachment("large", image = "x".repeat(1_500_000)))
        val error = runCatching {
            AttachmentBatch.load(listOf(1, 2), existing, {}, { item, _ -> attachment("image$item", image = "y".repeat(1_300_000)) })
        }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
        assertEquals(1, existing.size)
    }
    @Test fun loadEnforcesAggregateTextBudget() = runBlocking {
        val existing = listOf(attachment("large", text = "x".repeat(AttachmentDraft.MAX_TEXT - 40)))
        val error = runCatching { AttachmentBatch.load(listOf(1), existing, {}, { _, _ -> attachment("added", text = "y".repeat(100)) }) }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
        assertEquals(1, existing.size)
    }
    @Test fun loadEnforcesPerImageLimit() = runBlocking {
        val error = runCatching { AttachmentBatch.load(listOf(1), emptyList(), {}, { _, _ -> attachment("huge", image = "x".repeat(2_000_001)) }) }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
    }

    @Test fun pickerGateConsumesMatchingAccountAndDraftOnlyOnce() {
        val gate = AttachmentPickerGate()
        val ticket = gate.begin(7L, "draft-a")
        assertEquals(AttachmentLoadScope(7L, "draft-a", ticket), gate.consume(ticket, 7L, "draft-a"))
        assertNull(gate.consume(ticket, 7L, "draft-a"))
    }
    @Test fun pickerGateConsumesButRejectsAccountOrDraftThatWentStale() {
        val gate = AttachmentPickerGate()
        val accountTicket = gate.begin(1L, "draft")
        assertNull(gate.consume(accountTicket, 2L, "draft"))
        assertNull(gate.consume(accountTicket, 1L, "draft"))
        val draftTicket = gate.begin(1L, "old-draft")
        assertNull(gate.consume(draftTicket, 1L, "new-draft"))
    }
    @Test fun pickerGateOldTicketCannotConsumeNewPendingTicket() {
        val gate = AttachmentPickerGate()
        val old = gate.begin(1L, "old")
        val current = gate.begin(2L, "current")
        assertNull(gate.consume(old, 1L, "old"))
        assertEquals(AttachmentLoadScope(2L, "current", current), gate.consume(current, 2L, "current"))
    }
    @Test fun pickerGateCancelOnlyClearsMatchingTicket() {
        val gate = AttachmentPickerGate()
        val old = gate.begin(1L, "old")
        val current = gate.begin(2L, "current")
        gate.cancel(old)
        assertEquals(AttachmentLoadScope(2L, "current", current), gate.consume(current, 2L, "current"))
        val ticket = gate.begin(3L, "draft")
        gate.cancel(ticket)
        assertNull(gate.consume(ticket, 3L, "draft"))
        gate.cancel(null)
    }
    @Test fun pickerGateClearAndNewInstanceHaveNoPendingTicket() {
        val gate = AttachmentPickerGate()
        val ticket = gate.begin(1L, "draft")
        gate.clear()
        assertNull(gate.consume(ticket, 1L, "draft"))
        val processRestart = AttachmentPickerGate()
        assertNull(processRestart.consume(ticket, 1L, "draft"))
    }
}
