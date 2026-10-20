package com.socrates.android.data

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.UUID

enum class TranscriptExportFormat(val label: String, val mimeType: String, val extension: String) {
    MARKDOWN("Markdown", "text/markdown", "md"), PLAIN_TEXT("纯文本", "text/plain", "txt")
}
enum class TranscriptExportPhase { CHOOSING, PREPARING, PICKING, WRITING, COMPLETE }
data class TranscriptExportState(
    val title: String = "", val messageCount: Int = 0,
    val format: TranscriptExportFormat = TranscriptExportFormat.MARKDOWN,
    val phase: TranscriptExportPhase = TranscriptExportPhase.CHOOSING,
    val error: String? = null, val fileName: String = "", val isOpen: Boolean = false,
)
data class TranscriptLine(val role: String, val content: String)
data class TranscriptSnapshot(val title: String, val lines: List<TranscriptLine>)
data class ExportPickerRequest(val ticket: String, val fileName: String, val mimeType: String)

/** Deliberate projection, never a dump of session/message wire or account credentials. */
object TranscriptExport {
    const val MAX_BYTES = 5 * 1024 * 1024
    fun snapshot(title: String, messages: List<ChatMessage>): TranscriptSnapshot {
        require(messages.isNotEmpty()) { "当前没有可导出的消息。" }
        return TranscriptSnapshot(title, messages.map { TranscriptLine(it.role, it.content) })
    }
    private fun oneLine(value: String) = value.replace(Regex("[\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}]"), " ").trim()
    fun fileName(title: String, format: TranscriptExportFormat): String {
        val safe = oneLine(title).replace(Regex("[\\\\/:*?\"<>|]"), "_").trim(' ', '.')
        // Bound by code points, not UTF-16 units, so the name never splits an emoji.
        val base = if (safe.isBlank()) "Socrates-chat" else safe.substring(0, safe.offsetByCodePoints(0, minOf(80, safe.codePointCount(0, safe.length))))
        return "$base.${format.extension}"
    }
    fun encode(snapshot: TranscriptSnapshot, format: TranscriptExportFormat): ByteArray {
        require(snapshot.lines.isNotEmpty()) { "当前没有可导出的消息。" }
        val out = ByteArrayOutputStream()
        fun append(value: String) {
            // A UTF-8 encoding can never need fewer bytes than valid input UTF-16 units,
            // except malformed surrogate replacement; rejecting that edge is intentional.
            require(value.length <= MAX_BYTES - out.size()) { "聊天正文超过 5 MB，暂不支持导出。" }
            val bytes = value.toByteArray(Charsets.UTF_8)
            require(bytes.size <= MAX_BYTES - out.size()) { "聊天正文超过 5 MB，暂不支持导出。" }
            out.write(bytes)
        }
        val title = oneLine(snapshot.title).ifBlank { "Socrates 对话" }
        if (format == TranscriptExportFormat.MARKDOWN) append("# ${title.replace(Regex("([\\\\`*_{}\\[\\]<>#])"), "\\\\$1")}\n\n")
        else append("$title\n\n")
        snapshot.lines.forEach { line ->
            val role = when (line.role) { "user" -> "我"; "assistant" -> "Socrates"; "system" -> "系统"; "tool" -> "工具"; else -> "角色：${oneLine(line.role)}" }
            append(if (format == TranscriptExportFormat.MARKDOWN) "## $role\n\n" else "$role\n")
            append(line.content)
            append("\n\n")
        }
        return out.toByteArray()
    }
    /** No retry: a provider can leave a partial file on error. The caller must report it. */
    suspend fun write(bytes: ByteArray, open: () -> OutputStream?) {
        currentCoroutineContext().ensureActive()
        val output = open() ?: error("无法打开所选文件。")
        output.use {
            var offset = 0
            while (offset < bytes.size) {
                currentCoroutineContext().ensureActive()
                val count = minOf(8192, bytes.size - offset)
                it.write(bytes, offset, count)
                offset += count
            }
            it.flush()
        }
    }
}

/** Frozen body-only snapshot. Picker tickets survive clear only to reject late OS callbacks. */
class TranscriptExportController(private val scope: CoroutineScope) {
    private val mutable = MutableStateFlow(TranscriptExportState())
    val state = mutable.asStateFlow()
    private var snapshot: TranscriptSnapshot? = null
    private var payload: ByteArray? = null
    private var pendingTicket: String? = null
    private var generation = 0L
    private var job: Job? = null
    @Synchronized fun open(title: String, messages: List<ChatMessage>): Boolean {
        if (pendingTicket != null || mutable.value.isOpen) return false
        val captured = TranscriptExport.snapshot(title, messages)
        generation++; job?.cancel(); payload = null; snapshot = captured
        mutable.value = TranscriptExportState(title = title, messageCount = captured.lines.size,
            fileName = TranscriptExport.fileName(title, TranscriptExportFormat.MARKDOWN), isOpen = true)
        return true
    }
    @Synchronized fun choose(format: TranscriptExportFormat) {
        val before = mutable.value
        if (!before.isOpen || before.phase != TranscriptExportPhase.CHOOSING) return
        mutable.value = before.copy(format = format, fileName = TranscriptExport.fileName(before.title, format), error = null)
    }
    @Synchronized fun clear() {
        generation++; job?.cancel(); job = null; snapshot = null; payload = null
        mutable.value = TranscriptExportState()
        // Do not reuse an outstanding OS picker for a newer export/account.
    }
    @Synchronized fun dismiss() {
        if (mutable.value.phase in setOf(TranscriptExportPhase.CHOOSING, TranscriptExportPhase.COMPLETE)) clear()
    }
    @Synchronized fun prepare(pick: (ExportPickerRequest) -> Unit) {
        val before = mutable.value
        val captured = snapshot ?: return
        if (!before.isOpen || before.phase != TranscriptExportPhase.CHOOSING || pendingTicket != null) return
        val epoch = ++generation
        mutable.value = before.copy(phase = TranscriptExportPhase.PREPARING, error = null)
        job = scope.launch {
            try {
                val bytes = withContext(Dispatchers.Default) { TranscriptExport.encode(captured, before.format) }
                ensureActive()
                synchronized(this@TranscriptExportController) {
                    if (epoch != generation) return@launch
                    payload = bytes
                    val ticket = UUID.randomUUID().toString()
                    pendingTicket = ticket
                    mutable.value = mutable.value.copy(phase = TranscriptExportPhase.PICKING)
                    try { pick(ExportPickerRequest(ticket, before.fileName, before.format.mimeType)) }
                    catch (e: Exception) {
                        pendingTicket = null; payload = null
                        mutable.value = mutable.value.copy(phase = TranscriptExportPhase.CHOOSING, error = "无法打开文件选择器，请重试。")
                    }
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { publish(epoch) { it.copy(phase = TranscriptExportPhase.CHOOSING, error = e.message ?: "无法准备导出文件。") } }
        }
    }
    @Synchronized fun picked(ticket: String?, writer: (suspend (ByteArray) -> Unit)?) {
        if (ticket == null || ticket != pendingTicket) return
        pendingTicket = null
        val bytes = payload
        payload = null
        if (!mutable.value.isOpen || mutable.value.phase != TranscriptExportPhase.PICKING || bytes == null) return
        if (writer == null) { mutable.value = mutable.value.copy(phase = TranscriptExportPhase.CHOOSING); return }
        val epoch = ++generation
        mutable.value = mutable.value.copy(phase = TranscriptExportPhase.WRITING, error = null)
        job = scope.launch {
            try {
                withContext(Dispatchers.IO) { writer(bytes) }
                ensureActive()
                publish(epoch) { snapshot = null; it.copy(phase = TranscriptExportPhase.COMPLETE) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { publish(epoch) { it.copy(phase = TranscriptExportPhase.CHOOSING,
                error = "保存未确认，所选位置可能留下不完整文件。请检查并删除残留文件后，重新选择位置；不会自动重试。") } }
        }
    }
    @Synchronized private fun publish(epoch: Long, update: (TranscriptExportState) -> TranscriptExportState) {
        if (generation == epoch) mutable.value = update(mutable.value)
    }
}
