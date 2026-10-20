package com.socrates.android.ui

import org.junit.Assert.*
import org.junit.Test

class PdfPageSizingTest {
    @Test fun portraitKeepsAspectRatioAndBoundedRaster() {
        val (width, height) = PdfPageSizing.fit(595, 842)
        assertEquals(1440, width)
        assertTrue(height in 2037..2039)
        assertEquals(595.0 / 842, width.toDouble() / height, 0.001)
    }
    @Test fun landscapeKeepsAspectRatio() {
        assertEquals(1440 to 720, PdfPageSizing.fit(2000, 1000))
    }
    @Test fun pathologicalAspectRatiosNeverAllocateZeroOrOversizeBitmap() {
        assertEquals(1 to 2048, PdfPageSizing.fit(1, Int.MAX_VALUE))
        assertEquals(1440 to 1, PdfPageSizing.fit(Int.MAX_VALUE, 1))
        listOf(1 to 1, Int.MAX_VALUE to Int.MAX_VALUE, 30000 to 40000).forEach { (w, h) ->
            val (width, height) = PdfPageSizing.fit(w, h)
            assertTrue(width in 1..1440)
            assertTrue(height in 1..2048)
            assertTrue(width.toLong() * height * 4 <= 1440L * 2048 * 4)
        }
    }
    @Test fun invalidDimensionsAreRejected() {
        listOf(0 to 100, 100 to 0, -1 to 100, 100 to -1).forEach { (w, h) ->
            assertThrows(IllegalArgumentException::class.java) { PdfPageSizing.fit(w, h) }
        }
    }
}
