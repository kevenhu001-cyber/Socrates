package com.socrates.android.ui

import org.junit.Assert.assertFalse
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

    @Test fun accentAndRadiusRolesComeFromTheFrontendTokenContract() {
        val controls = uiSource("SocratesControls.kt")
        val theme = uiSource("SocratesTheme.kt")
        listOf(
            "val Accent = Color(0xFF222222)",
            "val Link = Color(0xFF0060CC)",
            "val PillSelected = Color(0xFFEEEEEE)",
            "val LineSubtle = Color(0xFFEEEEEE)",
            "val LineStrong = Color(0xFFDDDDDD)",
            "val Placeholder = Color(0xFF8F8F8F)",
            "val Avatar = Color(0xFF6B6B6B)",
            "val ControlRadius = 8.dp",
            "val RowRadius = 10.dp",
            "val DialogRadius = 16.dp",
            "val ComposerRadius = 28.dp",
        ).forEach { assertTrue("Missing token contract: $it", controls.contains(it)) }
        assertTrue(theme.contains("secondary = Color(0xFF222222)"))
        assertTrue(theme.contains("error = Color(0xFFB02D1C)"))
    }

    @Test fun sharedControlsUseTheAlignedRadiiTypographyAndPillFill() {
        val controls = uiSource("SocratesControls.kt")
        assertTrue(controls.contains("shape: Shape = RoundedCornerShape(SocratesDesign.ControlRadius)"))
        assertTrue(controls.contains("background(if (selected) SocratesDesign.PillSelected"))
        assertTrue(controls.contains("ProvideTextStyle(MaterialTheme.typography.bodyMedium)"))
        assertTrue(controls.contains("widthIn(max = 400.dp)"))
        assertTrue(controls.contains("RoundedCornerShape(SocratesDesign.DialogRadius)"))
        assertTrue(controls.contains("size(36.dp, 20.dp)"))
    }

    @Test fun sheetsDropTheGrabberAndAlertsUseTheConfirmModalWidth() {
        val controls = uiSource("SocratesControls.kt")
        val sheet = controls.substringAfter("fun SocratesSheet(").substringBefore("fun SocratesSwitch(")
        assertFalse("The shipped phone sheets hide the grabber", sheet.contains("size(34.dp, 4.dp)"))
        assertTrue(sheet.contains("topStart = SocratesDesign.DialogRadius"))
        assertTrue(controls.contains("padding(20.dp).clip(RoundedCornerShape(SocratesDesign.DialogRadius))"))
    }

    @Test fun composerAndBubbleMatchTheWebSurfaces() {
        val app = uiSource("SocratesApp.kt")
        assertTrue(app.contains("val shape = RoundedCornerShape(SocratesDesign.ComposerRadius)"))
        assertTrue(app.contains("border(1.dp, Color(0x1F000000), shape)"))
        assertTrue(app.contains("fontSize = 16.sp, lineHeight = 24.sp"))
        assertTrue(app.contains("background(Color(0xFFF4F4F4), RoundedCornerShape(18.dp))"))
        assertTrue(app.contains("CircleAction(") && app.contains("accent = true"))
        assertFalse(app.contains("val Blue ="))
        assertFalse(app.contains("0xFFF0F1FB"))
    }

    @Test fun sidebarChromeUsesTheFrontendRowAndAvatarRoles() {
        val app = uiSource("SocratesApp.kt")
        assertTrue(app.contains("RoundedCornerShape(SocratesDesign.RowRadius)"))
        assertTrue(app.contains("containerColor = SocratesDesign.Accent"))
        assertTrue(app.contains("SocratesDesign.Avatar"))
        assertFalse(app.contains("0xFF21B99F"))
        assertFalse(app.contains("Color(0xFF929292)"))
    }

    @Test fun markdownLinksUseTheFrontendLinkRole() {
        assertTrue(uiSource("NativeMarkdown.kt").contains("linkColor(SocratesDesign.Link.toArgb())"))
    }
}
