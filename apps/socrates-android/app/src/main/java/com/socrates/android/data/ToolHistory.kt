package com.socrates.android.data

import org.json.JSONArray
import org.json.JSONObject

/** Mirrors packages/chat/src/turn.ts tool event handling. Unknown events are not invented as tool results. */
class ToolHistory {
    private val calls = linkedMapOf<String, JSONObject>()
    private val indices = mutableMapOf<Int, String>()
    fun accept(activity: ChatActivity): Boolean {
        if (activity.event !in setOf("tool_use", "tool_result", "tool_progress", "tool_call_delta")) return false
        val value = activity.payload
        val index = if (value.has("index")) value.optInt("index") else null
        val priorId = index?.let(indices::get)
        val id = value.optString("id").takeIf(String::isNotBlank) ?: priorId ?: index?.let { "tool-index-$it" } ?: return false
        if (index != null) indices[index] = id
        val call = calls[id] ?: priorId?.let { calls.remove(it) } ?: JSONObject()
        call.put("id", id).put("name", value.optString("name").ifBlank { call.optString("name", "Tool") })
        if (activity.event == "tool_use" && value.has("input")) call.put("input", value.opt("input"))
        if (activity.event == "tool_call_delta" && value.has("arguments")) call.put("argumentsText", value.optString("arguments"))
        listOf("output", "progressPhase", "argumentsText", "errorText", "stderr", "userMessage", "detail").forEach { key ->
            if (value.opt(key) is String) call.put(key, value.optString(key).take(100_000))
        }
        if (value.has("phase")) call.put("progressPhase", value.optString("phase"))
        if (activity.event == "tool_result") {
            val failed = value.optBoolean("isError") || (value.has("ok") && !value.optBoolean("ok"))
            call.put("isError", failed).put("progressPhase", if (failed) "failed" else "completed")
            if (value.has("output")) call.put("output", value.opt("output").toString().take(500_000))
            listOf("plan", "spec", "visualization", "durationMs", "executionId", "retryable").forEach { key -> if (value.has(key)) call.put(key, value.opt(key)) }
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
    fun snapshot(): JSONObject = JSONObject().put("toolCalls", JSONArray(calls.values.take(20).map { JSONObject(it.toString()) }))
}
