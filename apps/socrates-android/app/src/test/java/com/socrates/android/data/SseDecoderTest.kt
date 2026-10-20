package com.socrates.android.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SseDecoderTest {
    private fun decode(vararg lines: String): Triple<List<String>, List<String>, List<ChatActivity>> {
        val text = mutableListOf<String>()
        val reasoning = mutableListOf<String>()
        val activity = mutableListOf<ChatActivity>()
        val decoder = SseDecoder(text::add, reasoning::add, activity::add)
        lines.forEach(decoder::acceptLine)
        decoder.finish()
        return Triple(text, reasoning, activity)
    }

    @Test fun parsesSimpleDeltaAndCrLf() {
        val result = decode("data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\r", "\r")
        assertEquals(listOf("Hi"), result.first)
    }

    @Test fun joinsMultilineDataAsSseRequires() {
        val result = decode("data: first", "data: second", "")
        assertEquals(listOf("first\nsecond"), result.first)
    }

    @Test fun ignoresCommentsAndUnknownFields() {
        val result = decode(": heartbeat", "id: 42", "retry: 500", "data: ok", "")
        assertEquals(listOf("ok"), result.first)
    }

    @Test fun doneIsTerminal() {
        val values = mutableListOf<String>()
        val decoder = SseDecoder(values::add, {}, {})
        decoder.acceptLine("data: [DONE]"); decoder.acceptLine("")
        decoder.acceptLine("data: {\"choices\":[{\"delta\":{\"content\":\"ignored\"}}]}"); decoder.finish()
        assertTrue(decoder.done); assertTrue(values.isEmpty())
    }

    @Test fun emitsReasoningContentReasoningAndThinkingStrings() {
        val reasoning = mutableListOf<String>()
        val decoder = SseDecoder({}, reasoning::add, {})
        decoder.acceptLine("data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"a\",\"reasoning\":\"b\",\"thinking\":\"c\"}}]}"); decoder.acceptLine("")
        assertEquals(listOf("a", "b", "c"), reasoning)
    }

    @Test fun emitsReasoningObjectText() {
        val reasoning = mutableListOf<String>()
        val decoder = SseDecoder({}, reasoning::add, {})
        decoder.acceptLine("data: {\"delta\":{\"thinking\":{\"text\":\"pondering\"}}}"); decoder.acceptLine("")
        assertEquals(listOf("pondering"), reasoning)
    }

    @Test fun routesInlineThinkBlocksToPrivateReasoningAcrossChunkBoundaries() {
        val visible = mutableListOf<String>()
        val reasoning = mutableListOf<String>()
        val decoder = SseDecoder(visible::add, reasoning::add, {})
        listOf("data: Hello <thi", "data: nk>private ", "data: thought</think> world", "", "data: [DONE]", "").forEach(decoder::acceptLine)
        assertEquals("Hello  world", visible.joinToString(""))
        assertEquals("private thought", reasoning.joinToString(""))
    }

    @Test fun routesMultipleThinkBlocksAndLeavesOrdinaryAnglesAlone() {
        val visible = mutableListOf<String>()
        val reasoning = mutableListOf<String>()
        val decoder = SseDecoder(visible::add, reasoning::add, {})
        decoder.acceptLine("data: x < 3; <think>a</think> y <think>b</think> z")
        decoder.acceptLine(""); decoder.acceptLine("data: [DONE]"); decoder.acceptLine("")
        assertEquals("x < 3;  y  z", visible.joinToString(""))
        assertEquals("ab", reasoning.joinToString(""))
    }

    @Test fun flushesIncompleteOpeningTagAsVisibleAndUnclosedThoughtAsPrivate() {
        val visible = mutableListOf<String>()
        val reasoning = mutableListOf<String>()
        val decoder = SseDecoder(visible::add, reasoning::add, {})
        decoder.acceptLine("data: answer <thi"); decoder.finish()
        assertEquals("answer <thi", visible.joinToString(""))
        assertTrue(reasoning.isEmpty())
        val open = SseDecoder(visible::add, reasoning::add, {})
        open.acceptLine("data: <think>secret tail"); open.finish()
        assertEquals("secret tail", reasoning.last())
        assertFalse(visible.joinToString("").contains("secret"))
    }

    @Test fun emitsNamedToolActivity() {
        val activities = mutableListOf<ChatActivity>()
        val decoder = SseDecoder({}, {}, activities::add)
        decoder.acceptLine("event: tool_call"); decoder.acceptLine("data: {\"name\":\"search\"}"); decoder.acceptLine("")
        assertEquals("tool_call", activities.single().event); assertEquals("search", activities.single().payload.optString("name"))
    }
    @Test fun expandsBatchToolUseEventsIntoIndividualActivities() {
        val activities = mutableListOf<ChatActivity>()
        val decoder = SseDecoder({}, {}, activities::add)
        decoder.acceptLine("event: tool_use")
        decoder.acceptLine("data: [{\"id\":\"one\",\"name\":\"search\"},{\"id\":\"two\",\"name\":\"fetch\"}]")
        decoder.acceptLine("")
        assertEquals(listOf("search", "fetch"), activities.map { it.payload.optString("name") })
    }

    @Test fun stringErrorThrowsVerbatim() {
        val decoder = SseDecoder({}, {}, {})
        decoder.acceptLine("event: error"); decoder.acceptLine("data: backend unavailable")
        try { decoder.acceptLine(""); throw AssertionError("Expected error") } catch (e: java.io.IOException) { assertEquals("backend unavailable", e.message) }
    }

    @Test fun jsonErrorUsesMessage() {
        val decoder = SseDecoder({}, {}, {})
        decoder.acceptLine("event: error"); decoder.acceptLine("data: {\"message\":\"denied\"}")
        try { decoder.acceptLine(""); throw AssertionError("Expected error") } catch (e: java.io.IOException) { assertEquals("denied", e.message) }
    }

    @Test fun flushesFinalEventWithoutBlankLine() {
        val values = mutableListOf<String>()
        val decoder = SseDecoder(values::add, {}, {})
        decoder.acceptLine("data: tail"); decoder.finish()
        assertEquals(listOf("tail"), values)
    }
    @Test fun supportsServerShorthandDelta() {
        assertEquals(listOf("actual delta"), decode("data: {\"delta\":\"actual delta\"}", "").first)
    }
    @Test fun messageErrorFrameDoesNotBecomeSuccessfulActivity() {
        val decoder = SseDecoder({}, {}, {})
        decoder.acceptLine("data: {\"error\":\"provider unavailable\"}")
        try { decoder.acceptLine(""); throw AssertionError("Expected error") }
        catch (e: java.io.IOException) { assertEquals("provider unavailable", e.message) }
    }
}
