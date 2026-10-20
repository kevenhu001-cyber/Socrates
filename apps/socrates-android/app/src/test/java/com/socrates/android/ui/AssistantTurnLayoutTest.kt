package com.socrates.android.ui

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class AssistantTurnLayoutTest {
    @Test fun sortsToolsByOffsetAndPreservesTextBetweenThem() {
        val wire = JSONObject().put("toolCalls", JSONArray()
            .put(JSONObject().put("id", "b").put("name", "second").put("textOffset", 7))
            .put(JSONObject().put("id", "a").put("name", "first").put("textOffset", 2)))
        val rows = AssistantTurnLayout.build("one two", wire)
        assertEquals(4, rows.size)
        assertEquals("on", (rows[0] as AssistantTurnSegment.Text).value)
        assertEquals("first", (rows[1] as AssistantTurnSegment.Tool).call.optString("name"))
        assertEquals("e two", (rows[2] as AssistantTurnSegment.Text).value)
        assertEquals("second", (rows[3] as AssistantTurnSegment.Tool).call.optString("name"))
    }

    @Test fun appendsLegacyRowsWithoutValidOffsetsAfterAnswer() {
        val wire = JSONObject().put("toolCalls", JSONArray().put(JSONObject().put("id", "legacy").put("name", "lookup")))
        val rows = AssistantTurnLayout.build("answer", wire)
        assertEquals(2, rows.size)
        assertEquals("answer", (rows[0] as AssistantTurnSegment.Text).value)
        assertEquals("legacy", (rows[1] as AssistantTurnSegment.Tool).call.optString("id"))
    }

    @Test fun onlyLastTextAfterPositionedToolCanGrow() {
        val wire = JSONObject().put("toolCalls", JSONArray().put(JSONObject()
            .put("id", "t").put("name", "lookup").put("textOffset", 3)))
        val rows = AssistantTurnLayout.build("one two", wire)
        assertEquals(listOf(false, false, true), rows.indices.map { AssistantTurnLayout.isLiveTextTail(rows, it, true) })
    }

    @Test fun textBeforeTrailingToolIsNotTreatedAsGrowing() {
        val wire = JSONObject().put("toolCalls", JSONArray().put(JSONObject()
            .put("id", "t").put("name", "lookup").put("textOffset", 6)))
        val rows = AssistantTurnLayout.build("answer", wire)
        assertEquals(listOf(false, false), rows.indices.map { AssistantTurnLayout.isLiveTextTail(rows, it, true) })
    }

    @Test fun unknownAndInvalidToolOffsetsConservativelyDisablePreview() {
        listOf(null, -1, 100).forEach { offset ->
            val call = JSONObject().put("id", "t").put("name", "lookup")
            if (offset != null) call.put("textOffset", offset)
            val rows = AssistantTurnLayout.build("answer", JSONObject().put("toolCalls", JSONArray().put(call)))
            assertEquals(listOf(false, false), rows.indices.map { AssistantTurnLayout.isLiveTextTail(rows, it, true) })
        }
    }

    @Test fun stoppedAndEmptyTurnsHaveNoLiveTail() {
        val rows = AssistantTurnLayout.build("answer", null)
        assertEquals(true, AssistantTurnLayout.isLiveTextTail(rows, 0, true))
        assertEquals(false, AssistantTurnLayout.isLiveTextTail(rows, 0, false))
        assertEquals(false, AssistantTurnLayout.isLiveTextTail(rows, -1, true))
        assertEquals(false, AssistantTurnLayout.isLiveTextTail(rows, 1, true))
        assertEquals(false, AssistantTurnLayout.isLiveTextTail(emptyList(), -1, true))
    }
}
