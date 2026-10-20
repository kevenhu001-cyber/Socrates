package com.socrates.android.data

import org.json.JSONArray
import org.json.JSONObject

/** Mirrors packages/chat/src/turn.ts tool event handling. Unknown events are not invented as tool results. */
class ToolHistory {
    private val calls = linkedMapOf<String, JSONObject>()
    private val indices = mutableMapOf<Int, String>()
    private val publicSummaries = mutableListOf<String>()
    fun accept(activity: ChatActivity): Boolean {
        if (activity.event == "public_reasoning_summary" || activity.payload.optString("type") == "public_reasoning_summary") {
            val summary = activity.payload.optString("text").ifBlank { activity.payload.optString("summary") }.trim().take(500)
            if (summary.isNotEmpty() && publicSummaries.lastOrNull() != summary) publicSummaries += summary
            return true
        }
        if (activity.event !in setOf("tool_use", "tool_result", "tool_progress", "tool_call_delta", "tool_approval")) return false
        val value = activity.payload
        val index = if (value.has("index")) value.optInt("index") else null
        val priorId = index?.let(indices::get)
        val id = value.optString("id").takeIf(String::isNotBlank)
            ?: value.optString("toolCallId").takeIf(String::isNotBlank)
            ?: priorId ?: index?.let { "tool-index-$it" } ?: return false
        if (index != null) indices[index] = id
        val call = calls[id] ?: priorId?.let { calls.remove(it) } ?: JSONObject()
        call.put("id", id).put("name", value.optString("name").ifBlank { call.optString("name", "Tool") })
        if (activity.event == "tool_use" && value.has("input")) call.put("input", value.opt("input"))
        if (activity.event == "tool_call_delta" && value.has("arguments")) call.put("argumentsText", value.optString("arguments"))
        listOf("output", "progressPhase", "argumentsText", "errorText", "stderr", "userMessage", "detail", "errorCode", "status", "textOffset", "approval", "plan", "steps", "artifacts", "attachments", "outputs", "visualization", "spec", "sources", "results", "runId", "executionId", "durationMs", "retryable", "isError", "ok", "_liveOutput").forEach { key ->
            if (!value.isNull(key) && value.has(key)) {
                val item = value.opt(key)
                call.put(key, if (item is String) item.take(if (key == "output" || key == "detail") 500_000 else 100_000) else item)
            }
        }
        value.opt("textOffset").let { if (it is Number) call.put("_rawTextOffset", it.toInt()) }
        if (value.has("phase")) call.put("progressPhase", value.optString("phase"))
        when (activity.event) {
            "tool_use", "tool_call_delta" -> call.put("progressPhase", "running")
            "tool_progress" -> call.put("progressPhase", value.optString("phase").ifBlank { "running" })
            "tool_approval" -> {
                call.put("progressPhase", "awaiting_approval")
                if (!value.has("approval") && (value.has("approvalId") || value.has("runId"))) call.put("approval", JSONObject(value.toString()))
            }
        }
        if (activity.event == "tool_result") {
            val approval = value.optJSONObject("approval") ?: call.optJSONObject("approval")
            val awaitingApproval = value.optString("status") == "awaiting_approval" || approval?.optString("status") == "pending"
            val failed = !awaitingApproval && (value.optBoolean("isError") || (value.has("ok") && !value.optBoolean("ok")))
            call.put("isError", failed).put("progressPhase", when { awaitingApproval -> "awaiting_approval"; failed -> "failed"; else -> "completed" })
            if (value.has("output")) call.put("output", value.opt("output").let { if (it is String) it.take(500_000) else it })
            listOf("plan", "spec", "visualization", "durationMs", "executionId", "retryable", "approval", "steps", "outputs", "attachments", "runId", "sources", "error", "cancelled").forEach { key -> if (value.has(key)) call.put(key, value.opt(key)) }
            value.optJSONArray("artifacts")?.let { items ->
                val normalized = JSONArray()
                for (i in 0 until minOf(items.length(), 20)) {
                    val item = items.opt(i)
                    normalized.put(if (item is String) JSONObject().put("id", item) else item)
                }
                call.put("artifacts", normalized)
            }
        }
        if (value.optJSONArray("results") != null) call.put("results", value.optJSONArray("results"))
        calls[id] = call
        return true
    }
    fun snapshot(rawText: String? = null): JSONObject = JSONObject().put("toolCalls", JSONArray(calls.values.take(20).map { source ->
        JSONObject(source.toString()).apply {
            val rawOffset = opt("_rawTextOffset") as? Number
            if (rawText != null && rawOffset != null) put("textOffset", InlineThinkScanner.visibleOffset(rawText, rawOffset.toInt()))
            remove("_rawTextOffset")
        }
    })).apply {
        publicSummaries.lastOrNull()?.let { put("publicReasoningSummary", it) }
    }
}
