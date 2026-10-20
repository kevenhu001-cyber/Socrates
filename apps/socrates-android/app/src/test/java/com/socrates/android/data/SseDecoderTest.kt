package com.socrates.android.data

import org.junit.Assert.assertEquals
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

    @Test fun emitsNamedToolActivity() {
        val activities = mutableListOf<ChatActivity>()
        val decoder = SseDecoder({}, {}, activities::add)
        decoder.acceptLine("event: tool_call"); decoder.acceptLine("data: {\"name\":\"search\"}"); decoder.acceptLine("")
        assertEquals("tool_call", activities.single().event); assertEquals("search", activities.single().payload.optString("name"))
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
