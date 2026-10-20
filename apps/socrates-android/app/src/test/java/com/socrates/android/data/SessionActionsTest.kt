package com.socrates.android.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionActionsTest {
    @Test fun pinAndArchiveMutationsPreserveUnknownWireFields() {
        val original = JSONObject("""{"id":"s1","pinned":false,"archivedAt":"2025-01-01T00:00:00Z","serverExtra":{"x":1}}""")
        val pinned = SessionActions.pinned(original, true)
        val archived = SessionActions.archived(pinned, null)
        assertTrue(pinned.getBoolean("pinned"))
        assertEquals(1, archived.getJSONObject("serverExtra").getInt("x"))
        assertFalse(archived.has("archivedAt"))
        assertFalse(original.getBoolean("pinned")) // input is not mutated
    }

    @Test fun reasoningEffortIsWhitelistedWithMediumFallback() {
        listOf("none", "low", "medium", "high").forEach { assertEquals(it, SessionActions.reasoningEffort(it)) }
        assertEquals("medium", SessionActions.reasoningEffort("invalid"))
        val request = SessionActions.addReasoningEffort(JSONObject().put("sessionId", "s1"), "high")
        assertEquals("high", request.getString("reasoning_effort"))
        assertEquals("s1", request.getString("sessionId"))
    }
}
