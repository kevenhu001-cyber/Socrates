package com.socrates.android.data

import org.junit.Assert.assertEquals
import org.junit.Test

class InlineThinkScannerTest {
    @Test fun mapsRawOffsetsAcrossPrivateRanges() {
        val raw = "Before <think>secret</think> after"
        assertEquals("Before ".length, InlineThinkScanner.visibleOffset(raw, raw.indexOf("secret")))
        assertEquals("Before  after".length, InlineThinkScanner.visibleOffset(raw, raw.length))
        assertEquals("Before ".length, InlineThinkScanner.visibleOffset(raw, raw.indexOf("<think>") + 3))
    }

    @Test fun incompleteOpeningTagRemainsVisible() {
        assertEquals("answer <thi" to "", InlineThinkScanner.split("answer <thi"))
        assertEquals("answer <thi".length, InlineThinkScanner.visibleOffset("answer <thi", "answer <thi".length))
    }

    @Test fun tagMatchingIsCaseInsensitiveLikeTheWebRenderer() {
        assertEquals("visible  text" to "private", InlineThinkScanner.split("visible <THINK>private</Think> text"))
    }
}
