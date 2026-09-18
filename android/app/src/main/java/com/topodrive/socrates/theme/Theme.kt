package com.topodrive.socrates.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Socrates color system — a Kotlin port of `packages/theme/src/rn.ts`'s
 * `buildMappedPalette` plus mobile's local derived fields. All values are
 * hex-equivalents of the HSL ramps the web frontend paints, so the Android
 * app renders the exact same surfaces, borders and text tones.
 */
@Immutable
data class SocratesColors(
    val dark: Boolean,
    /* Surfaces */
    val background: Color,
    val backgroundSunken: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val surfacePressed: Color,
    val surfaceHover: Color,
    /* Borders */
    val border: Color,
    val borderSubtle: Color,
    val borderStrong: Color,
    /* Text */
    val text: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val textSubtle: Color,
    val textInverse: Color,
    /* Accent — monochrome ramp */
    val accent: Color,
    val accentSoft: Color,
    val accentStrong: Color,
    val onAccent: Color,
    val action: Color,
    val actionPressed: Color,
    /* Semantic */
    val success: Color,
    val successSoft: Color,
    val danger: Color,
    val dangerSoft: Color,
    val warning: Color,
    val scrim: Color,
    val brand: Color,
    val brandSoft: Color,
    val white: Color,
    val black: Color,
    val overlay: Color,
    val scrollbar: Color,
    val statusBarLight: Boolean,
    /* Feature surfaces */
    val codeBg: Color,
    val codeFg: Color,
    val codeBorder: Color,
    val reasoningBg: Color,
    val reasoningFg: Color,
    val toolCardBg: Color,
    val toolCardBgHover: Color,
    val toolCardBgSunken: Color,
    val toolCardBorder: Color,
    val toolCardBorderStrong: Color,
    val toolCardFocus: Color,
    val voiceBlue: Color,
) {
    /** Faintest text tone — alias of textSubtle, used by UI code for
     *  placeholders / hints (the web "--text-faint" token). */
    val textFaint: Color get() = textSubtle
}

fun darkSocratesColors(): SocratesColors = SocratesColors(
    dark = true,
    background = Color(0xFF000000),
    backgroundSunken = Color(0xFF000000),
    surface = Color(0xFF141414),
    surfaceRaised = Color(0xFF212121),
    surfacePressed = Color(0xFF2F2F2F),
    surfaceHover = Color(0xFF262626),
    border = Color(0x1AFFFFFF),
    borderSubtle = Color(0xFF383838),
    borderStrong = Color(0x2EFFFFFF),
    text = Color(0xFFFFFFFF),
    textSecondary = Color(0xFFCCCCCC),
    textMuted = Color(0xFF8C8C8C),
    textSubtle = Color(0xFF666666),
    textInverse = Color(0xFF1A1A1A),
    accent = Color(0xFFFFFFFF),
    accentSoft = Color(0xFF333333),
    accentStrong = Color(0xFFFFFFFF),
    onAccent = Color(0xFF1A1A1A),
    action = Color(0xFFFFFFFF),
    actionPressed = Color(0xFFD4D4D4),
    success = Color(0xFF40BF75),
    successSoft = Color(0xFF1C3A2B),
    danger = Color(0xFFDD5F5F),
    dangerSoft = Color(0xFF3A1F1F),
    warning = Color(0xFFF5B544),
    scrim = Color(0xAD000000),
    brand = Color(0xFFD4D4D4),
    brandSoft = Color(0xFF2A2A2A),
    white = Color(0xFFFFFFFF),
    black = Color(0xFF000000),
    overlay = Color(0x8C000000),
    scrollbar = Color(0x2EFFFFFF),
    statusBarLight = true,
    codeBg = Color(0xFF0A0A0A),
    codeFg = Color(0xFFE7E7E7),
    codeBorder = Color(0xFF232323),
    reasoningBg = Color(0xFF1A1A1A),
    reasoningFg = Color(0xFFA0A0A0),
    toolCardBg = Color(0x10FFFFFF),
    toolCardBgHover = Color(0x1AFFFFFF),
    toolCardBgSunken = Color(0x0AFFFFFF),
    toolCardBorder = Color(0x18FFFFFF),
    toolCardBorderStrong = Color(0x26FFFFFF),
    toolCardFocus = Color(0x59FFFFFF),
    voiceBlue = Color(0xFF2B7FFF),
)

fun lightSocratesColors(): SocratesColors = SocratesColors(
    dark = false,
    background = Color(0xFFFAFAFA),
    backgroundSunken = Color(0xFFFFFFFF),
    surface = Color(0xFFF2F2F2),
    surfaceRaised = Color(0xFFF2F2F2),
    surfacePressed = Color(0xFFE8E8E8),
    surfaceHover = Color(0xFFE8E8E8),
    border = Color(0xFFCCCCCC),
    borderSubtle = Color(0xFFE0E0E0),
    borderStrong = Color(0xFFBDBDBD),
    text = Color(0xFF212121),
    textSecondary = Color(0xFF454545),
    textMuted = Color(0xFF858585),
    textSubtle = Color(0xFF707070),
    textInverse = Color(0xFFFFFFFF),
    accent = Color(0xFF1A1A1A),
    accentSoft = Color(0xFFE6E6E6),
    accentStrong = Color(0xFF111111),
    onAccent = Color(0xFFFFFFFF),
    action = Color(0xFF1A1A1A),
    actionPressed = Color(0xFF333333),
    success = Color(0xFF2D865C),
    successSoft = Color(0xFFD3E7D8),
    danger = Color(0xFFB82E2E),
    dangerSoft = Color(0xFFEFD2D2),
    warning = Color(0xFFB45309),
    scrim = Color(0x73000000),
    brand = Color(0xFF1A1A1A),
    brandSoft = Color(0xFFE6E6E6),
    white = Color(0xFFFFFFFF),
    black = Color(0xFF000000),
    overlay = Color(0x73000000),
    scrollbar = Color(0x33000000),
    statusBarLight = false,
    codeBg = Color(0xFFF0F0F0),
    codeFg = Color(0xFF1A1A1A),
    codeBorder = Color(0xFFD0D0D0),
    reasoningBg = Color(0xFFEFEFEF),
    reasoningFg = Color(0xFF4A4A4A),
    toolCardBg = Color(0x0D000000),
    toolCardBgHover = Color(0x14000000),
    toolCardBgSunken = Color(0x08000000),
    toolCardBorder = Color(0x1C000000),
    toolCardBorderStrong = Color(0x31000000),
    toolCardFocus = Color(0x59000000),
    voiceBlue = Color(0xFF0A84FF),
)

val LocalSocratesColors = staticCompositionLocalOf<SocratesColors> { darkSocratesColors() }

enum class ThemePreference { SYSTEM, LIGHT, DARK }

@Composable
fun SocratesTheme(
    preference: ThemePreference = ThemePreference.DARK,
    content: @Composable () -> Unit,
) {
    val systemDark = isSystemInDarkTheme()
    val dark = when (preference) {
        ThemePreference.DARK -> true
        ThemePreference.LIGHT -> false
        ThemePreference.SYSTEM -> systemDark
    }
    val colors = if (dark) darkSocratesColors() else lightSocratesColors()
    CompositionLocalProvider(LocalSocratesColors provides colors) {
        content()
    }
}

object SocratesTheme {
    val colors: SocratesColors
        @Composable get() = LocalSocratesColors.current
}
