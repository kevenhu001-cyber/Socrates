package com.socrates.android.ui

import org.json.JSONArray
import org.json.JSONObject

internal sealed interface AssistantTurnSegment {
    data class Text(val value: String) : AssistantTurnSegment
    data class Tool(val call: JSONObject) : AssistantTurnSegment
}

/** Interleaves persisted tool rows with answer text using the shared textOffset contract. */
internal object AssistantTurnLayout {
    fun build(text: String, wire: JSONObject?): List<AssistantTurnSegment> {
        val calls = wire?.optJSONArray("toolCalls") ?: JSONArray()
        val positioned = mutableListOf<Pair<Int, JSONObject>>()
        val unpositioned = mutableListOf<JSONObject>()
        for (index in 0 until calls.length()) {
            val call = calls.optJSONObject(index) ?: continue
            if (call.optString("id").isBlank() || call.optString("name").isBlank()) continue
            val offsetValue = call.opt("textOffset")
            val offset = when (offsetValue) {
                is Number -> offsetValue.toInt()
                else -> null
            }
            if (offset == null || offset !in 0..text.length) unpositioned += call
            else positioned += offset to call
        }
        positioned.sortBy { it.first }
        val result = mutableListOf<AssistantTurnSegment>()
        var cursor = 0
        for ((offset, call) in positioned) {
            val safeOffset = offset.coerceAtLeast(cursor)
            if (safeOffset > cursor) result += AssistantTurnSegment.Text(text.substring(cursor, safeOffset))
            result += AssistantTurnSegment.Tool(call)
            cursor = safeOffset
        }
        if (cursor < text.length) result += AssistantTurnSegment.Text(text.substring(cursor))
        unpositioned.forEach { result += AssistantTurnSegment.Tool(it) }
        if (result.isEmpty() && text.isNotEmpty()) result += AssistantTurnSegment.Text(text)
        return result
    }
}
