package com.socrates.android.ui

import com.socrates.android.data.ChatMessage
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** In-memory composer attachments, not a second file store. Removing one never deletes its upload. */
data class PendingAttachment(
    val name: String,
    val text: String = "",
    val imageDataUrl: String? = null,
    val wire: JSONObject? = null,
    val key: String = UUID.randomUUID().toString(),
)

object AttachmentDraft {
    const val MAX_COUNT = 6 // Web attachments/limits.js composer limit; persisted history can contain 20.
    const val MAX_TEXT = 200_000 // Includes the message and document wrapper characters.
    const val MAX_IMAGE_CHARS = 4_000_000 // Native aggregate memory/request budget, not a server limit.
    const val MAX_ITEM_TEXT = 100_000 // Same bound as native extraction, measured in UTF-16 units.

    fun append(current: List<PendingAttachment>, next: PendingAttachment): List<PendingAttachment> {
        require(current.size < MAX_COUNT) { "每条消息最多添加 $MAX_COUNT 个附件。" }
        require(current.none { it.key == next.key }) { "此附件已在草稿中。" }
        require(next.imageDataUrl == null || next.imageDataUrl.length <= 2_000_000) { "单张图片预览超过上限。" }
        val result = current + next
        require(result.sumOf { it.imageDataUrl?.length?.toLong() ?: 0L } <= MAX_IMAGE_CHARS) {
            "图片预览总量超过原生草稿上限，请移除部分图片后再添加。"
        }
        // Fail explicitly rather than let ChatWire.content silently clip document text.
        require(body("", result).length <= MAX_TEXT) { "附件文字总量过长，请分成多条消息发送。" }
        return result
    }

    fun remove(current: List<PendingAttachment>, key: String): List<PendingAttachment> =
        current.filterNot { it.key == key }

    /** Explicit one-step movement; boundaries and stale identities never move a different item. */
    fun move(current: List<PendingAttachment>, key: String, step: Int): List<PendingAttachment> {
        require(step == -1 || step == 1) { "每次只能移动一个位置。" }
        val index = current.indexOfFirst { it.key == key }
        if (index < 0 || index + step !in current.indices) return current
        return current.toMutableList().apply { add(index + step, removeAt(index)) }
    }

    fun canEdit(attachment: PendingAttachment): Boolean = attachment.imageDataUrl == null &&
        attachment.wire?.optString("kind") != "image"

    /** Edits the per-message text only. No file mutation, re-extraction, rename, or upload. */
    fun editText(current: List<PendingAttachment>, key: String, text: String): List<PendingAttachment> {
        val index = current.indexOfFirst { it.key == key }
        require(index >= 0) { "该附件已不在当前草稿中。" }
        val original = current[index]
        require(canEdit(original)) { "图片暂不支持文字编辑。" }
        require(text.length <= MAX_ITEM_TEXT) { "每份附件文字最多 100,000 字符，未应用本次修改。" }
        val wire = (original.wire?.let { JSONObject(it.toString()) }
            ?: JSONObject().put("id", original.key).put("kind", "document").put("name", original.name)).put("text", text)
        val result = current.toMutableList().apply { set(index, original.copy(text = text, wire = wire)) }
        require(body("", result).length <= MAX_TEXT) { "附件文字总量过长，未应用本次修改。请缩短文字。" }
        return result
    }

    private fun body(text: String, attachments: List<PendingAttachment>): String = buildString {
        append(text.trim())
        attachments.forEach { a ->
            if (a.text.isNotBlank()) append("\n\n<资料 name=\"${a.name}\">\n${a.text}\n</资料>")
        }
    }

    fun message(text: String, attachments: List<PendingAttachment>): ChatMessage {
        require(attachments.size <= MAX_COUNT) { "附件数量超过上限。" }
        require(attachments.sumOf { it.imageDataUrl?.length?.toLong() ?: 0L } <= MAX_IMAGE_CHARS) { "图片预览总量超过上限。" }
        val content = body(text, attachments)
        require(content.length <= MAX_TEXT) { "消息与附件文字总量超过 200,000 字符，请缩短文字或移除附件。" }
        val rows = JSONArray()
        attachments.forEach { a ->
            val row = a.wire?.let { JSONObject(it.toString()) }
                ?: JSONObject().put("id", a.key).put("kind", if (a.imageDataUrl == null) "document" else "image").put("name", a.name)
            // Keep every image in the durable array so a reload/retry is not limited to the first image.
            a.imageDataUrl?.let { require(it.length <= 2_000_000) { "单张图片预览超过上限。" }; row.put("dataUrl", it) }
            rows.put(row)
        }
        return ChatMessage(role = "user", content = content.ifBlank { "请分析这些附件。" },
            wire = if (rows.length() == 0) null else JSONObject().put("attachments", rows))
    }
}

/** A completion may only alter the draft and account that started it, including consecutive new chats. */
data class AttachmentLoadScope(val account: Long, val draftKey: String, val request: String = UUID.randomUUID().toString()) {
    fun matches(account: Long, draftKey: String, active: AttachmentLoadScope?): Boolean =
        this.account == account && this.draftKey == draftKey && this == active
}
