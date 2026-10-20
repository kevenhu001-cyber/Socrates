package com.socrates.android.data

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.OutputStream
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class TranscriptExportTest {
    private val messages = listOf(ChatMessage(role = "user", content = "真实问题 😀"), ChatMessage(role = "assistant", content = "**回答**\n```kt\nprintln(1)\n```"))
    @Test fun markdownPreservesBodiesAndOrder() {
        val result = TranscriptExport.encode(TranscriptExport.snapshot("标题", messages), TranscriptExportFormat.MARKDOWN).toString(Charsets.UTF_8)
        assertEquals("# 标题\n\n## 我\n\n真实问题 😀\n\n## Socrates\n\n**回答**\n```kt\nprintln(1)\n```\n\n", result)
    }
    @Test fun plainTextKeepsMarkdownSourceInsteadOfPretendingToRender() {
        val result = TranscriptExport.encode(TranscriptExport.snapshot("标题", messages), TranscriptExportFormat.PLAIN_TEXT).toString(Charsets.UTF_8)
        assertTrue(result.startsWith("标题\n\n我\n真实问题 😀"))
        assertTrue(result.contains("**回答**"))
        assertFalse(result.contains("## Socrates"))
    }
    @Test fun titleCannotInjectMarkdownHeadings() {
        val result = TranscriptExport.encode(TranscriptSnapshot("a\n# [b]", listOf(TranscriptLine("assistant", "body"))), TranscriptExportFormat.MARKDOWN).toString(Charsets.UTF_8)
        assertTrue(result.startsWith("# a \\# \\[b\\]\n\n"))
    }
    @Test fun snapshotNeverExportsRawWireReasoningImagesOrAttachmentContents() {
        val wire = JSONObject().put("secret", "private-token").put("attachments", "private-file").put("toolCalls", "private-tool")
        val message = ChatMessage(role = "assistant", content = "visible", reasoning = "private-reasoning", imageDataUrl = "private-image", attachmentName = "private-name", wire = wire)
        val snap = TranscriptExport.snapshot("real", listOf(message))
        wire.put("content", "changed")
        val text = TranscriptExport.encode(snap, TranscriptExportFormat.PLAIN_TEXT).toString(Charsets.UTF_8)
        assertTrue(text.contains("visible")); assertFalse(text.contains("private-")); assertFalse(text.contains("changed"))
        assertEquals("changed", wire.getString("content"))
    }
    @Test fun inlineTextAttachmentsRemainBodyAndAreNotSilentlyStripped() {
        val body = "问题\n\n<资料 name=\"notes.txt\">\nprivate notes\n</资料>"
        val captured = TranscriptExport.snapshot("real", listOf(ChatMessage(role = "user", content = body)))
        TranscriptExportFormat.entries.forEach { format ->
            assertTrue(TranscriptExport.encode(captured, format).toString(Charsets.UTF_8).contains(body))
        }
    }
    @Test fun captureIsIndependentOfMutableMessageList() {
        val list = messages.toMutableList()
        val snap = TranscriptExport.snapshot("original", list)
        list.clear()
        assertEquals(2, snap.lines.size)
    }
    @Test fun roleLabelsDoNotTurnEveryNonUserMessageIntoAssistant() {
        val lines = listOf("system", "tool", "custom").map { TranscriptLine(it, "body") }
        val text = TranscriptExport.encode(TranscriptSnapshot("", lines), TranscriptExportFormat.PLAIN_TEXT).toString(Charsets.UTF_8)
        assertTrue(text.contains("系统\n")); assertTrue(text.contains("工具\n")); assertTrue(text.contains("角色：custom\n"))
    }
    @Test fun fileNamesSanitizePathsControlsAndHaveCorrectExtensions() {
        assertEquals("a_b_c_ d.txt", TranscriptExport.fileName(" a/b\\c:\nd ", TranscriptExportFormat.PLAIN_TEXT))
        assertEquals("Socrates-chat.md", TranscriptExport.fileName(" ..\n ", TranscriptExportFormat.MARKDOWN))
        val name = TranscriptExport.fileName("😀".repeat(90), TranscriptExportFormat.MARKDOWN)
        assertEquals("😀".repeat(80) + ".md", name)
    }
    @Test fun emptyMessagesAreRejectedWithoutInventingContent() {
        try { TranscriptExport.snapshot("x", emptyList()); fail() } catch (_: IllegalArgumentException) { }
    }
    @Test fun utf8LimitCountsBytesNotCharacters() {
        val snap = TranscriptSnapshot("x", listOf(TranscriptLine("user", "中".repeat(TranscriptExport.MAX_BYTES / 3 + 1))))
        try { TranscriptExport.encode(snap, TranscriptExportFormat.PLAIN_TEXT); fail() } catch (e: IllegalArgumentException) { assertTrue(e.message!!.contains("5 MB")) }
    }
    @Test fun exactSizeLimitAcceptedAndOneExtraByteRejected() {
        val overhead = TranscriptExport.encode(TranscriptSnapshot("x", listOf(TranscriptLine("user", ""))), TranscriptExportFormat.PLAIN_TEXT).size
        val body = "a".repeat(TranscriptExport.MAX_BYTES - overhead)
        assertEquals(TranscriptExport.MAX_BYTES, TranscriptExport.encode(TranscriptSnapshot("x", listOf(TranscriptLine("user", body))), TranscriptExportFormat.PLAIN_TEXT).size)
        try { TranscriptExport.encode(TranscriptSnapshot("x", listOf(TranscriptLine("user", body + "a"))), TranscriptExportFormat.PLAIN_TEXT); fail() } catch (_: IllegalArgumentException) { }
    }
    @Test fun writerClosesFlushesAndWritesEveryByte() = runBlocking {
        var closed = false; var flushed = false
        val out = object : ByteArrayOutputStream() {
            override fun close() { closed = true; super.close() }
            override fun flush() { flushed = true; super.flush() }
        }
        val bytes = "中文😀".repeat(2000).toByteArray()
        TranscriptExport.write(bytes) { out }
        assertArrayEquals(bytes, out.toByteArray()); assertTrue(closed); assertTrue(flushed)
    }
    @Test fun writerClosesOnFailureAndNeverRetries() = runBlocking {
        var opened = 0; var closed = false
        try {
            TranscriptExport.write(byteArrayOf(1, 2)) { opened++; object : OutputStream() {
                override fun write(b: Int) { throw IOException("provider failed") }
                override fun close() { closed = true }
            } }
            fail()
        } catch (_: IOException) { }
        assertEquals(1, opened); assertTrue(closed)
    }
    @Test fun missingOutputStreamIsFailure() = runBlocking {
        try { TranscriptExport.write(byteArrayOf(1)) { null }; fail() } catch (_: IllegalStateException) { }
    }
    @Test fun cancellationBeforeWriteDoesNotOpenProvider() = runBlocking {
        var opened = false
        val job = launch(start = CoroutineStart.LAZY) { TranscriptExport.write(byteArrayOf(1)) { opened = true; ByteArrayOutputStream() } }
        job.cancel(); job.join(); assertFalse(opened)
    }
    private suspend fun awaitPhase(controller: TranscriptExportController, phase: TranscriptExportPhase) {
        withTimeout(5000) { while (controller.state.value.phase != phase) delay(1) }
    }
    @Test fun explicitSubmitFrozenFormatAndPickerCancellation() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val c = TranscriptExportController(scope); val pick = CompletableDeferred<ExportPickerRequest>()
            assertTrue(c.open("title", messages)); c.choose(TranscriptExportFormat.PLAIN_TEXT)
            assertEquals(TranscriptExportPhase.CHOOSING, c.state.value.phase)
            c.prepare { pick.complete(it) }; val request = pick.await()
            assertEquals("title.txt", request.fileName); assertEquals("text/plain", request.mimeType)
            c.choose(TranscriptExportFormat.MARKDOWN); c.dismiss()
            assertEquals(TranscriptExportFormat.PLAIN_TEXT, c.state.value.format)
            assertTrue(c.state.value.isOpen)
            c.picked(request.ticket, null)
            assertEquals(TranscriptExportPhase.CHOOSING, c.state.value.phase)
            assertNull(c.state.value.error)
        } finally { scope.cancel() }
    }
    @Test fun duplicateSubmitAndPickerCallbackCannotWriteTwice() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val c = TranscriptExportController(scope); val pick = CompletableDeferred<ExportPickerRequest>(); var launches = 0; var writes = 0
            c.open("title", messages); c.prepare { launches++; pick.complete(it) }
            val request = pick.await(); c.prepare { launches++ }
            val done = CompletableDeferred<Unit>()
            c.picked(request.ticket) { writes++; done.complete(Unit) }
            c.picked(request.ticket) { writes++ }
            done.await(); awaitPhase(c, TranscriptExportPhase.COMPLETE)
            assertEquals(1, launches); assertEquals(1, writes)
            c.dismiss(); assertFalse(c.state.value.isOpen)
        } finally { scope.cancel() }
    }
    @Test fun clearRejectsOldPickerAndPreventsNewAccountReusingIt() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val c = TranscriptExportController(scope); val pick = CompletableDeferred<ExportPickerRequest>()
            c.open("old", messages); c.prepare { pick.complete(it) }; val ticket = pick.await().ticket
            c.clear(); assertFalse(c.state.value.isOpen)
            assertFalse(c.open("new", messages))
            var writes = 0; c.picked("wrong") { writes++ }
            assertFalse(c.open("new", messages))
            c.picked(ticket) { writes++ }
            assertEquals(0, writes); assertTrue(c.open("new", messages))
        } finally { scope.cancel() }
    }
    @Test fun failureIsHonestAndDoesNotAutomaticallyRetry() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val c = TranscriptExportController(scope); val pick = CompletableDeferred<ExportPickerRequest>(); var writes = 0
            c.open("x", messages); c.prepare { pick.complete(it) }
            c.picked(pick.await().ticket) { writes++; throw IOException("failed") }
            awaitPhase(c, TranscriptExportPhase.CHOOSING)
            assertEquals(1, writes); assertTrue(c.state.value.error!!.contains("不完整文件"))
        } finally { scope.cancel() }
    }
    @Test fun clearInvalidatesNonCooperativeWriterCompletion() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val c = TranscriptExportController(scope); val pick = CompletableDeferred<ExportPickerRequest>()
            val started = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>(); val finished = CompletableDeferred<Unit>()
            c.open("old", messages); c.prepare { pick.complete(it) }
            c.picked(pick.await().ticket) { withContext(NonCancellable) { started.complete(Unit); release.await(); finished.complete(Unit) } }
            started.await(); c.clear(); assertTrue(c.open("new", messages)); release.complete(Unit); finished.await(); delay(20)
            assertEquals("new", c.state.value.title); assertEquals(TranscriptExportPhase.CHOOSING, c.state.value.phase)
            assertNull(c.state.value.error)
        } finally { scope.cancel() }
    }
    @Test fun unavailablePickerReturnsToChoiceAndAllowsRetry() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val c = TranscriptExportController(scope); c.open("x", messages)
            c.prepare { throw IllegalStateException("no handler") }
            awaitPhase(c, TranscriptExportPhase.CHOOSING)
            assertTrue(c.state.value.error!!.contains("文件选择器"))
            val pick = CompletableDeferred<ExportPickerRequest>(); c.prepare { pick.complete(it) }
            c.picked(pick.await().ticket, null)
            assertEquals(TranscriptExportPhase.CHOOSING, c.state.value.phase)
        } finally { scope.cancel() }
    }
}
