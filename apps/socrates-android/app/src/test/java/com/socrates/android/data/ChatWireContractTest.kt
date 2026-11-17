package com.socrates.android.data

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Android client consumes the same persisted message row as the SPA.
 * ChatWire keeps the server-owned JSON intact; these tests pin the fields it
 * must not drop while hydrating and re-serializing a message.
 */
class ChatWireContractTest {
    private fun canonicalMessage() = JSONObject().apply {
        put("id", "11111111-1111-4111-8111-111111111111")
        put("clientId", "client-1")
        put("role", "assistant")
        put("rawText", "Answer text")
        put("content", "<p>Answer text</p>")
        put("html", "<p>Answer text</p>")
        put("type", "assistant")
        put("reasoningContent", "Reasoning text")
        put("createdAt", "2026-01-01T00:00:00.000Z")
        put("turnRuntime", JSONObject().put("version", 1))
        put("attachments", JSONArray().put(JSONObject()
            .put("id", "file-1")
            .put("kind", "pdf")
            .put("name", "paper.pdf")
            .put("mime", "application/pdf")
            .put("size", 12)
            .put("fileId", "file-1")))
        put("toolCalls", JSONArray().put(JSONObject()
            .put("id", "call-1")
            .put("name", "web_search")
            .put("input", JSONObject().put("query", "contract"))
            .put("output", "result")))
    }

    @Test
    fun hydratePreservesPersistedMessageFields() {
        val hydrated = ChatWire.hydrateMessage(canonicalMessage())
        val wire = hydrated.wire ?: error("wire payload missing")

        assertEquals("Answer text", hydrated.content)
        assertEquals("Reasoning text", hydrated.reasoning)
        assertEquals("client-1", wire.getString("clientId"))
        assertEquals("assistant", wire.getString("role"))
        assertEquals("<p>Answer text</p>", wire.getString("html"))
        assertEquals(1, wire.getJSONObject("turnRuntime").getInt("version"))
        assertEquals("call-1", wire.getJSONArray("toolCalls").getJSONObject(0).getString("id"))
        assertEquals("file-1", wire.getJSONArray("attachments").getJSONObject(0).getString("fileId"))
    }

    @Test
    fun messageRoundTripKeepsServerOwnedFields() {
        val hydrated = ChatWire.hydrateMessage(canonicalMessage())
        val row = ChatWire.message(hydrated)

        assertEquals("client-1", row.getString("clientId"))
        assertEquals("Answer text", row.getString("rawText"))
        assertEquals("Reasoning text", row.getString("reasoningContent"))
        assertEquals("2026-01-01T00:00:00.000Z", row.getString("createdAt"))
        assertEquals(1, row.getJSONObject("turnRuntime").getInt("version"))
        assertEquals("web_search", row.getJSONArray("toolCalls").getJSONObject(0).getString("name"))
    }

    @Test
    fun contentBuildsTextAndImagePartsFromTheSameAttachments() {
        val message = ChatMessage(
            role = "user",
            content = "Look at this",
            imageDataUrl = "data:image/png;base64,AAAA",
            attachmentName = "image.png",
        )
        val content = ChatWire.content(message)
        assertTrue(content is JSONArray)
        val parts = content as JSONArray
        assertEquals("text", parts.getJSONObject(0).getString("type"))
        assertTrue(parts.length() >= 2)
        assertNotNull(parts.getJSONObject(parts.length() - 1).optJSONObject("image_url"))
        assertFalse(parts.getJSONObject(0).getString("text").isBlank())
    }
}
