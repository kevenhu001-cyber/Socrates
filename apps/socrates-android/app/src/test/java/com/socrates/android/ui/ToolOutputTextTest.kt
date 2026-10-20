package com.socrates.android.ui

import org.junit.Assert.*
import org.junit.Test

class ToolOutputTextTest {
    @Test fun plainAndFormatDisabledStayVerbatim() {
        assertEquals("<b>ok</b>", ToolOutputText.preview("<b>ok</b>").text)
        assertEquals(ToolOutputKind.PLAIN, ToolOutputText.preview("[1]", false).kind)
        assertEquals("[1]", ToolOutputText.preview("[1]", false).text)
    }
    @Test fun objectAndArrayPrettyPrint() {
        assertEquals("{\n  \"a\": 1,\n  \"b\": [\n    true,\n    null\n  ]\n}", ToolOutputText.preview("{\"a\":1,\"b\":[true,null]}").text)
        assertEquals(ToolOutputKind.JSON, ToolOutputText.preview("[1,2]").kind)
    }
    @Test fun preservesNumberLexemesIncludingLargeIntegerAndNegativeZero() {
        val text = ToolOutputText.preview("{\"n\":123456789012345678901234567890,\"z\":-0}").text
        assertTrue(text.contains("123456789012345678901234567890")); assertTrue(text.contains("-0"))
    }
    @Test fun rejectsInvalidJsonForms() {
        listOf("{'a':1}", "{\"a\":1,}", "{\"a\":NaN}", "{\"a\":1}x", "/*x*/{}", "[1,]", "{\"a\" 1}").forEach {
            assertEquals(it, ToolOutputText.preview(it).text)
            assertEquals(ToolOutputKind.PLAIN, ToolOutputText.preview(it).kind)
        }
    }
    @Test fun strictNumberSyntax() {
        listOf("[01]", "[+1]", "[1.]", "[.1]", "[1e]", "[-]").forEach { assertEquals(ToolOutputKind.PLAIN, ToolOutputText.preview(it).kind) }
    }
    @Test fun wholeFenceExtractsCodeAndLanguage() {
        val p = ToolOutputText.preview("```kotlin\nval x = 1\n```")
        assertEquals("val x = 1", p.text); assertEquals(ToolOutputKind.CODE, p.kind); assertEquals("kotlin", p.language)
    }
    @Test fun fenceSupportsCrLfAndNoLanguage() {
        assertEquals("a\r\nb", ToolOutputText.preview("```\r\na\r\nb\r\n```").text)
        assertNull(ToolOutputText.preview("```\na\n```").language)
    }
    @Test fun unsafeOrLongFenceLanguageIsNotExposed() {
        assertNull(ToolOutputText.preview("```bad.lang\nx\n```").language)
        assertNull(ToolOutputText.preview("```" + "a".repeat(33) + "\nx\n```").language)
    }
    @Test fun nonWholeFenceIsPlain() { assertEquals(ToolOutputKind.PLAIN, ToolOutputText.preview("x\n```js\na\n```").kind) }
    @Test fun previewLimitIsSurrogateSafeAndMarked() {
        val raw = "a".repeat(5999) + "😀" + "z"
        val p = ToolOutputText.preview(raw)
        assertTrue(p.truncated); assertEquals(5999, p.text.length); assertFalse(p.text.last().isHighSurrogate())
        assertEquals(ToolOutputKind.PLAIN, p.kind)
    }
    @Test fun exactlyLimitIsNotTruncated() {
        val p = ToolOutputText.preview("x".repeat(6000)); assertFalse(p.truncated); assertEquals(6000, p.text.length)
    }
    @Test fun formattingExpansionFallsBackRatherThanTruncates() {
        val raw = "[" + (1..1500).joinToString(",") { "1" } + "]"
        val p = ToolOutputText.preview(raw); assertEquals(ToolOutputKind.PLAIN, p.kind); assertEquals(raw, p.text)
    }
    @Test fun excessiveJsonDepthFallsBack() {
        val raw = "[".repeat(65) + "0" + "]".repeat(65)
        assertEquals(ToolOutputKind.PLAIN, ToolOutputText.preview(raw).kind)
    }
    @Test fun pagesReconstructAndClamp() {
        val raw = "x".repeat(12500)
        assertEquals(3, ToolOutputText.pageCount(raw))
        assertEquals(raw, (0..2).joinToString("") { ToolOutputText.page(raw, it) })
        assertEquals(ToolOutputText.page(raw, 0), ToolOutputText.page(raw, -1))
        assertEquals(ToolOutputText.page(raw, 2), ToolOutputText.page(raw, 200))
    }
    @Test fun emptyStringHasOneEmptyPage() { assertEquals(1, ToolOutputText.pageCount("")); assertEquals("", ToolOutputText.page("", 99)) }
    @Test fun emojiAcrossPageBoundaryIsKeptIntact() {
        val raw = "a".repeat(5999) + "😀" + "b".repeat(6000)
        val first = ToolOutputText.page(raw, 0); val second = ToolOutputText.page(raw, 1)
        assertFalse(first.last().isHighSurrogate()); assertFalse(second.first().isLowSurrogate())
        assertEquals(raw, (0 until ToolOutputText.pageCount(raw)).joinToString("") { ToolOutputText.page(raw, it) })
    }
    @Test fun indexExactlyAtPageCountClampsToLastPage() {
        val raw = "a".repeat(6000) + "tail"
        assertEquals("tail", ToolOutputText.page(raw, ToolOutputText.pageCount(raw)))
        assertEquals("tail", ToolOutputText.page(raw, Int.MAX_VALUE))
        assertEquals("a".repeat(6000), ToolOutputText.page(raw, Int.MIN_VALUE))
    }
    @Test fun unicodeEscapesRequireAsciiHexDigits() {
        listOf("[\"\\u１２３４\"]", "[\"\\u١٢٣٤\"]", "[\"\\u00xz\"]").forEach {
            assertEquals(ToolOutputKind.PLAIN, ToolOutputText.preview(it).kind)
            assertEquals(it, ToolOutputText.preview(it).text)
        }
        assertEquals(ToolOutputKind.JSON, ToolOutputText.preview("[\"\\u00Af\"]").kind)
    }
    @Test fun shiftedFixedBoundariesKeepEveryEmojiAndSourceUnit() {
        val raw = "x".repeat(5999) + "😀" + "x".repeat(5998) + "😀" + "x".repeat(6000)
        val pages = (0 until ToolOutputText.pageCount(raw)).map { ToolOutputText.page(raw, it) }
        assertEquals(raw, pages.joinToString(""))
        pages.forEach { assertFalse(it.first().isLowSurrogate()); assertFalse(it.last().isHighSurrogate()); assertTrue(it.length <= 6001) }
    }
    @Test fun copyLimitIsExposed() { assertEquals(60000, ToolOutputText.COPY_LIMIT) }
}
