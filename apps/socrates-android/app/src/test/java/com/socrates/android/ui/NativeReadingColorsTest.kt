package com.socrates.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pure Kotlin palette contract checks; not a rendered-pixel or accessibility audit. */
class NativeReadingColorsTest {
    @Test
    fun matchesWebTokensAndKeepsEveryRoleOpaque() {
        assertEquals(0xFF1F1F1F.toInt(), NativeReadingColors.textPrimary)
        assertEquals(0xFF595959.toInt(), NativeReadingColors.textSecondary)
        assertEquals(0xFF6B6B6B.toInt(), NativeReadingColors.textTertiary)
        assertEquals(0xFFEEEEEE.toInt(), NativeReadingColors.borderSubtle)
        assertEquals(0xFFE3E3E3.toInt(), NativeReadingColors.borderDefault)
        assertEquals(0xFFDDDDDD.toInt(), NativeReadingColors.borderStrong)
        listOf(
            NativeReadingColors.textPrimary, NativeReadingColors.textSecondary,
            NativeReadingColors.textTertiary, NativeReadingColors.borderSubtle,
            NativeReadingColors.borderDefault, NativeReadingColors.borderStrong,
        ).forEach { assertEquals(0xFF, (it ushr 24) and 0xFF) }
    }

    @Test
    fun textRolesHaveOrderedDarknessAndAccessibleContrastOnReadingSurfaces() {
        val text = listOf(
            NativeReadingColors.textPrimary,
            NativeReadingColors.textSecondary,
            NativeReadingColors.textTertiary,
        )
        assertTrue(luminance(text[0]) < luminance(text[1]))
        assertTrue(luminance(text[1]) < luminance(text[2]))
        listOf(0xFFFFFFFF.toInt(), 0xFFF8F8F8.toInt(), 0xFFF4F4F4.toInt()).forEach { background ->
            text.forEach { foreground ->
                assertTrue(
                    "contrast ${contrast(foreground, background)} below 4.5 for #${foreground.toUInt().toString(16)} on #${background.toUInt().toString(16)}",
                    contrast(foreground, background) >= 4.5,
                )
            }
        }
    }

    private fun luminance(argb: Int): Double {
        fun linear(channel: Int): Double {
            val value = channel / 255.0
            return if (value <= 0.04045) value / 12.92 else Math.pow((value + 0.055) / 1.055, 2.4)
        }
        val r = linear((argb ushr 16) and 0xFF)
        val g = linear((argb ushr 8) and 0xFF)
        val b = linear(argb and 0xFF)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    private fun contrast(foreground: Int, background: Int): Double {
        val first = luminance(foreground)
        val second = luminance(background)
        return (maxOf(first, second) + 0.05) / (minOf(first, second) + 0.05)
    }
}
