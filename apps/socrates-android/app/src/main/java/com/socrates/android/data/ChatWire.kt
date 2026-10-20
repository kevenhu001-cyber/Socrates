package com.socrates.android.data

import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Shared wire rules mirror server/routes/sessions.ts, not any sample conversation. */
object ChatWire {
    fun attachment(name: String, mime: String, size: Long, fileId: String? = null, text: String = "", dataUrl: String? = null): JSONObject =
        JSONObject().put("id", UUID.randomUUID().toString()).put("kind", if (mime.startsWith("image/")) "image" else "document")
            .put("name", name.take(500)).put("mime", mime.take(200)).put("size", size).apply {
                fileId?.let { put("fileId", it) }
                if (text.isNotEmpty()) put("text", text.take(100_000))
                // Large images retain their durable file reference instead of violating the 2 MB session field limit.
                if (dataUrl != null && dataUrl.length <= 2_000_000) put("dataUrl", dataUrl)
            }

    fun message(message: ChatMessage): JSONObject {
        val row = message.wire?.let { JSONObject(it.toString()) } ?: JSONObject()
        val clientId = (row.opt("clientId") as? String)?.takeIf(String::isNotBlank) ?: message.id
        row.put("id", message.id).put("clientId", clientId).put("role", message.role)
            .put("rawText", message.content).put("content", message.content).put("reasoningContent", message.reasoning)
        message.createdAt?.let { row.put("createdAt", it) }
        val attachments = row.optJSONArray("attachments") ?: JSONArray()
        if (message.imageDataUrl != null && attachments.length() == 0) {
            require(message.imageDataUrl.length <= 2_000_000) { "图片需先上传至资料库后再保存。" }
            attachments.put(attachment(message.attachmentName ?: "image", message.imageDataUrl.substringAfter("data:").substringBefore(';'), 0, dataUrl = message.imageDataUrl))
        }
        if (attachments.length() > 0) row.put("attachments", attachments)
        return row
    }

    fun content(message: ChatMessage): Any {
        val attachments = message.wire?.optJSONArray("attachments")
        var text = message.content
        if (attachments != null) for (i in 0 until attachments.length()) {
            val a = attachments.optJSONObject(i) ?: continue
            val extracted = a.optString("text").takeIf { it != "null" }.orEmpty()
            if (extracted.isNotBlank() && !text.contains(extracted)) text += "\n\n<资料 name=\"${a.optString("name")}\">\n$extracted\n</资料>"
        }
        val parts = JSONArray().put(JSONObject().put("type", "text").put("text", text.take(200_000)))
        val images = mutableSetOf<String>()
        message.imageDataUrl?.let(images::add)
        if (attachments != null) for (i in 0 until attachments.length()) {
            val a = attachments.optJSONObject(i) ?: continue
            a.optString("dataUrl").takeIf { a.optString("kind") == "image" && it.isNotBlank() }?.let(images::add)
        }
        images.forEach { parts.put(JSONObject().put("type", "image_url").put("image_url", JSONObject().put("url", it))) }
        return if (images.isEmpty()) text.take(200_000) else parts
    }

    fun branch(session: ChatSession, anchorId: String): ChatSession {
        val index = session.messages.indexOfFirst { it.id == anchorId }
        require(index >= 0) { "找不到分支消息。" }
        val wire = session.wire?.let { JSONObject(it.toString()) } ?: JSONObject()
        // Never carry live runtime, public shares or persisted message ids into a new conversation.
        listOf("id", "messages", "createdAt", "updatedAt", "share", "streamingText", "streamingReasoning").forEach(wire::remove)
        wire.put("branchedFrom", JSONObject().put("sessionId", session.id).put("messageId", anchorId))
        val rows = session.messages.take(index + 1).map { message ->
            val raw = message.wire?.let { JSONObject(it.toString()) } ?: JSONObject()
            listOf("id", "clientId", "sessionId", "createdAt", "updatedAt", "turnRuntime").forEach(raw::remove)
            message.copy(id = UUID.randomUUID().toString(), createdAt = null, wire = raw)
        }
        return session.copy(id = UUID.randomUUID().toString(), title = session.title + " · 分支", messages = rows, createdAt = null, updatedAt = null, wire = wire)
    }

    fun userAnchor(messages: List<ChatMessage>, assistantId: String): ChatMessage? {
        val index = messages.indexOfFirst { it.id == assistantId }
        if (index < 0) return null
        return messages.take(index + 1).lastOrNull { it.role == "user" }
    }
}


/** Pure session mutations; copy the whole wire object to preserve server-owned fields. */
object SessionActions {
    fun isPinned(session: ChatSession): Boolean = session.wire?.optBoolean("pinned", false) == true
    fun isArchived(session: ChatSession): Boolean = session.wire?.opt("archivedAt")?.let { it != JSONObject.NULL && it.toString().isNotBlank() && it.toString() != "null" } == true
    fun pinned(wire: JSONObject?, value: Boolean): JSONObject =
        (wire?.let { JSONObject(it.toString()) } ?: JSONObject()).put("pinned", value)

    fun archived(wire: JSONObject?, archivedAt: String?): JSONObject =
        (wire?.let { JSONObject(it.toString()) } ?: JSONObject()).apply {
            if (archivedAt == null) remove("archivedAt") else put("archivedAt", archivedAt)
        }

    fun reasoningEffort(value: String): String =
        value.takeIf { it in setOf("none", "low", "medium", "high") } ?: "medium"

    fun addReasoningEffort(payload: JSONObject, value: String?): JSONObject {
        value?.let { payload.put("reasoning_effort", reasoningEffort(it)) }
        return payload
    }
}
