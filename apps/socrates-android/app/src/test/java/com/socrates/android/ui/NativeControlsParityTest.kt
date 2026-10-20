package com.socrates.android.ui

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Source contract tests for this intentionally non-built native UI parity pass. */
class NativeControlsParityTest {
    private fun uiSource(name: String): String {
        val directory = listOf(
            File("src/main/java/com/socrates/android/ui"),
            File("app/src/main/java/com/socrates/android/ui"),
            File("apps/socrates-android/app/src/main/java/com/socrates/android/ui"),
        ).first { it.isDirectory }
        return File(directory, name).readText()
    }

    @Test fun paletteAndTypographyFollowCurrentFrontendNeutralTokens() {
        val controls = uiSource("SocratesControls.kt")
        val theme = uiSource("SocratesTheme.kt")
        listOf("0xFF1F1F1F", "0xFF6B6B6B", "0xFFF8F8F8", "0xFFE3E3E3").forEach {
            assertTrue("Missing frontend-aligned token $it", controls.contains(it))
        }
        assertTrue(theme.contains("background = Color(0xFFF8F8F8)"))
        assertTrue(theme.contains("bodyMedium = nativeType(14, 21)"))
    }

    @Test fun controlsKeepTouchTargetsAndExposeFocusDisabledAndSelectionSemantics() {
        val controls = uiSource("SocratesControls.kt")
        assertTrue(controls.contains("heightIn(min = 44.dp)"))
        assertTrue(controls.contains("sizeIn(minWidth = 44.dp, minHeight = 44.dp)"))
        assertTrue(controls.contains("onFocusChanged"))
        assertTrue(controls.contains("this.disabled()"))
        assertTrue(controls.contains("role = Role.Switch"))
        assertTrue(controls.contains("role = Role.RadioButton"))
    }

    @Test fun unlabeledGlyphIsDecorativeAndLabeledGlyphHasDescription() {
        val glyph = uiSource("ReferenceGlyph.kt")
        assertTrue(glyph.contains("clearAndSetSemantics {}"))
        assertTrue(glyph.contains("contentDescription = description"))
    }
}
