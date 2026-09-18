package com.topodrive.socrates.util

import com.topodrive.socrates.data.Attachment
import com.topodrive.socrates.data.Api
import com.topodrive.socrates.data.Message
import com.topodrive.socrates.data.Session
import com.topodrive.socrates.data.ToolCall
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID

object ChatSupport {
    fun uid(): String = UUID.randomUUID().toString()

    /** Split `<think>…</think>` reasoning out of assistant text (web parity:
     *  deepseek-style reasoning is rendered as its own collapsible block). */
    data class ThinkSplit(val visible: String, val reasoning: String?)

    fun extractThink(text: String): ThinkSplit {
        if (!text.contains("<think>")) return ThinkSplit(text, null)
        val reasoning = StringBuilder()
        val visible = StringBuilder()
        var rest = text
        while (true) {
            val open = rest.indexOf("<think>")
            if (open < 0) { visible.append(rest); break }
            visible.append(rest.substring(0, open))
            val close = rest.indexOf("</think>", open)
            if (close < 0) {
                reasoning.append(rest.substring(open + 7))
                break
            }
            reasoning.append(rest.substring(open + 7, close))
            rest = rest.substring(close + 8)
        }
        return ThinkSplit(visible.toString().trim(), reasoning.toString().trim().ifEmpty { null })
    }

    /** Port of `packages/core` buildChatHistory: ≤30 turns, ≤2000 chars each,
     *  strips "Thinking…" prefixes / think tags, expands attachments into
     *  image_url/text content parts. */
    fun buildChatHistory(messages: List<Message>): JsonArray {
        val out = mutableListOf<JsonObject>()
        for (m in messages.takeLast(30)) {
            val role = m.role
            if (role != "user" && role != "assistant" && role != "system") continue
            var text = m.text
            if (text.startsWith("Thinking...")) text = text.removePrefix("Thinking...").trimStart()
            text = extractThink(text).visible
            if (text.length > 2000) text = text.substring(0, 2000)
            val atts = m.attachments.orEmpty()
            if (atts.isEmpty()) {
                if (text.isBlank()) continue
                out.add(JsonObject(mapOf("role" to JsonPrimitive(role), "content" to JsonPrimitive(text))))
                continue
            }
            val parts = mutableListOf<JsonElement>()
            if (text.isNotBlank()) {
                parts.add(JsonObject(mapOf("type" to JsonPrimitive("text"), "text" to JsonPrimitive(text))))
            }
            for (a in atts) {
                when {
                    a.kind == "image" && a.dataUrl != null -> parts.add(
                        JsonObject(
                            mapOf(
                                "type" to JsonPrimitive("image_url"),
                                "image_url" to JsonObject(mapOf("url" to JsonPrimitive(a.dataUrl))),
                            ),
                        ),
                    )
                    !a.text.isNullOrBlank() -> parts.add(
                        JsonObject(
                            mapOf(
                                "type" to JsonPrimitive("text"),
                                "text" to JsonPrimitive("[File: ${a.name}]\n${a.text.take(4000)}"),
                            ),
                        ),
                    )
                }
            }
            if (parts.isEmpty()) continue
            out.add(JsonObject(mapOf("role" to JsonPrimitive(role), "content" to JsonArray(parts))))
        }
        return JsonArray(out)
    }

    /* ── Streaming ── */

    /** Live streaming accumulator for one assistant turn. */
    class StreamState {
        var text = StringBuilder()
        var reasoning = StringBuilder()
        var toolCalls = mutableListOf<ToolCall>()
        var currentToolIndex = -1
        var done = false
        var error: String? = null
        var executedArtifacts = mutableListOf<JsonObject>()

        fun snapshot(): Triple<String, String, List<ToolCall>> =
            Triple(text.toString(), reasoning.toString(), toolCalls.toList())
    }

    /**
     * Port of `dispatchChatSseFrame` from `packages/core` — applies one SSE
     * event to the live StreamState.
     */
    fun applyFrame(state: StreamState, event: String, dataJson: String) {
        if (dataJson == "[DONE]") { state.done = true; return }
        val el = try { Api.json.parseToJsonElement(dataJson) } catch (_: Exception) { return }
        if (el !is JsonObject) return
        when (event) {
            "tool_use", "tool_call" -> {
                val tc = el["tool_call"]?.jsonObject ?: el["toolCall"]?.jsonObject ?: el
                val id = tc["id"]?.jsonPrimitive?.contentOrNull ?: uid()
                val name = tc["name"]?.jsonPrimitive?.contentOrNull ?: tc["tool"]?.jsonPrimitive?.contentOrNull ?: "tool"
                state.toolCalls.add(ToolCall(id = id, name = name, input = tc["input"], status = "running"))
                state.currentToolIndex = state.toolCalls.size - 1
            }
            "tool_call_delta" -> {
                val idx = state.currentToolIndex.takeIf { it >= 0 } ?: state.toolCalls.lastIndex
                if (idx >= 0) {
                    val cur = state.toolCalls[idx]
                    val delta = el["argumentsText"]?.jsonPrimitive?.contentOrNull
                        ?: el["delta"]?.jsonPrimitive?.contentOrNull ?: ""
                    state.toolCalls[idx] = cur.copy(argumentsText = (cur.argumentsText ?: "") + delta)
                }
            }
            "tool_result" -> {
                val id = el["id"]?.jsonPrimitive?.contentOrNull ?: el["tool_call_id"]?.jsonPrimitive?.contentOrNull
                val idx = if (id != null) state.toolCalls.indexOfFirst { it.id == id } else state.currentToolIndex
                if (idx >= 0) {
                    val cur = state.toolCalls[idx]
                    val output = el["output"]?.jsonPrimitive?.contentOrNull ?: el["result"]?.jsonPrimitive?.contentOrNull
                    val isErr = el["is_error"]?.jsonPrimitive?.contentOrNull == "true" ||
                        el["isError"]?.jsonPrimitive?.contentOrNull == "true" ||
                        el["error"]?.jsonPrimitive?.contentOrNull != null
                    state.toolCalls[idx] = cur.copy(
                        output = output,
                        isError = isErr,
                        status = if (isErr) "error" else "done",
                        durationMs = el["durationMs"]?.jsonPrimitive?.doubleOrNull,
                        artifacts = el["artifacts"]?.jsonArray?.mapNotNull { a ->
                            a.jsonObject.let { o ->
                                val aid = o["id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                                com.topodrive.socrates.data.ToolArtifactRef(
                                    id = aid,
                                    mimeType = o["mimeType"]?.jsonPrimitive?.contentOrNull,
                                    name = o["name"]?.jsonPrimitive?.contentOrNull,
                                )
                            }
                        },
                    )
                }
            }
            "tool_progress" -> {
                val idx = state.currentToolIndex.takeIf { it >= 0 } ?: state.toolCalls.lastIndex
                if (idx >= 0) {
                    val cur = state.toolCalls[idx]
                    state.toolCalls[idx] = cur.copy(
                        progressPhase = el["phase"]?.jsonPrimitive?.contentOrNull,
                        detail = el["detail"]?.jsonPrimitive?.contentOrNull,
                    )
                }
            }
            "execution_start" -> {
                el["executionId"]?.jsonPrimitive?.contentOrNull
            }
            "error" -> {
                state.error = el["message"]?.jsonPrimitive?.contentOrNull
                    ?: el["error"]?.jsonPrimitive?.contentOrNull ?: "Stream error"
                state.done = true
            }
            else -> {
                // Default: OpenAI-style choice delta
                val choice = el["choices"]?.jsonArray?.firstOrNull()?.jsonObject
                val delta = choice?.get("delta")?.jsonObject
                if (delta != null) {
                    delta["reasoning_content"]?.jsonPrimitive?.contentOrNull?.let { state.reasoning.append(it) }
                    delta["content"]?.jsonPrimitive?.contentOrNull?.let { state.text.append(it) }
                }
                if (choice?.get("finish_reason")?.jsonPrimitive?.contentOrNull != null) state.done = true
            }
        }
    }

    /** Title/preview helpers matching server-side summarisation heuristics. */
    fun sessionPreview(messages: List<Message>): String =
        messages.firstOrNull { it.role == "user" }?.text?.take(80) ?: ""

    fun sessionTitle(topic: String, firstUser: String?): String =
        firstUser?.replace(Regex("\\s+"), " ")?.trim()?.take(40) ?: topic.ifBlank { "New chat" }
}
