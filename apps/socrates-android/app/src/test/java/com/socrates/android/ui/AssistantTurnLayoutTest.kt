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
}
