package com.socrates.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.socrates.app.R
import androidx.core.view.WindowCompat
import com.socrates.app.data.local.PreferencesStore

// ──────────────────────────────────────────────
// Socrates design tokens — exact ports of the
// web CSS custom properties in light and dark.
// ──────────────────────────────────────────────

/** All Socrates semantic color tokens for one mode. */
data class SocratesColors(
    val bg000: Color,       // deepest bg — sidebar, elevated surfaces
    val bg100: Color,       // main page background
    val bg200: Color,       // card / surface background
    val bg300: Color,       // hover state / lower surface
    val bg400: Color,       // brightest surface (white in light, black in dark)
    val text000: Color,     // headline / strongest text
    val text100: Color,     // body primary text
    val text200: Color,     // body secondary text
    val text300: Color,     // muted secondary (same as 200 in socrates)
    val text400: Color,     // muted / meta text
    val text500: Color,     // caption text (same as 400 in socrates)
    val border100: Color,   // subtle borders
    val border200: Color,
    val border300: Color,
    val border400: Color,
    val accent000: Color,   // primary accent button / link
    val accent100: Color,   // accent hover (same hue, varies in lightness)
    val accent900: Color,   // accent container bg
    val brand000: Color,    // secondary brand
    val brand100: Color,    // secondary brand hover
    val oncolor100: Color,  // text placed on accent/brand (always white)
    val error: Color,       // hsl(0, 60%, 50%) — danger / destructive
    val warning: Color,     // hsl(39, 70%, 50%)
    val cellBorderAlpha: Float,  // heatmap cell border opacity
)

// ──────────────────────────────────────────────
// Dark mode  —  matches [data-theme=socrates][data-mode=dark]
// ──────────────────────────────────────────────
val DarkSocrates = SocratesColors(
    bg000          = Color.hsl(42f, 0.04f, 0.18f),     // hsl(42, 4%, 18%)
    bg100          = Color.hsl(40f, 0.033f, 0.145f),   // hsl(40, 3.3%, 14.5%)
    bg200          = Color.hsl(36f, 0.036f, 0.118f),   // hsl(36, 3.6%, 11.8%)
    bg300          = Color.hsl(39f, 0.032f, 0.078f),   // hsl(39, 3.2%, 7.8%)
    bg400          = Color.hsl(0f, 0f, 0f),             // hsl(0, 0%, 0%) — black
    text000        = Color.hsl(45f, 0.30f, 0.96f),     // hsl(45, 30%, 96%)
    text100        = Color.hsl(45f, 0.30f, 0.96f),     // same
    text200        = Color.hsl(45f, 0.08f, 0.72f),     // hsl(45, 8%, 72%)
    text300        = Color.hsl(45f, 0.08f, 0.72f),     // same
    text400        = Color.hsl(44f, 0.045f, 0.58f),    // hsl(44, 4.5%, 58%)
    text500        = Color.hsl(44f, 0.045f, 0.58f),    // same
    border100      = Color.hsl(45f, 0.20f, 0.82f),     // hsl(45, 20%, 82%)
    border200      = Color.hsl(45f, 0.20f, 0.82f),
    border300      = Color.hsl(45f, 0.20f, 0.82f),
    border400      = Color.hsl(45f, 0.20f, 0.82f),
    accent000      = Color.hsl(43f, 0.77f, 0.62f),     // hsl(43, 77%, 62%)
    accent100      = Color.hsl(43f, 0.77f, 0.62f),     // same
    accent900      = Color.hsl(43f, 0.40f, 0.20f),     // hsl(43, 40%, 20%)
    brand000       = Color.hsl(36f, 0.60f, 0.55f),     // hsl(36, 60%, 55%)
    brand100       = Color.hsl(36f, 0.65f, 0.60f),     // hsl(36, 65%, 60%)
    oncolor100     = Color.hsl(0f, 0f, 1f),             // hsl(0, 0%, 100%)
    error          = Color.hsl(0f, 0.60f, 0.50f),      // hsl(0, 60%, 50%)
    warning        = Color.hsl(39f, 0.70f, 0.50f),     // hsl(39, 70%, 50%)
    cellBorderAlpha = 0.25f,
)

// ──────────────────────────────────────────────
// Light mode — matches [data-theme=socrates][data-mode=light]
// ──────────────────────────────────────────────
val LightSocrates = SocratesColors(
    bg000          = Color.hsl(40f, 0.24f, 0.97f),     // hsl(40, 24%, 97%)
    bg100          = Color.hsl(40f, 0.18f, 0.94f),     // hsl(40, 18%, 94%)
    bg200          = Color.hsl(40f, 0.14f, 0.89f),     // hsl(40, 14%, 89%)
    bg300          = Color.hsl(40f, 0.10f, 0.83f),     // hsl(40, 10%, 83%)
    bg400          = Color.hsl(0f, 0f, 1f),             // hsl(0, 0%, 100%) — white
    text000        = Color.hsl(40f, 0.12f, 0.10f),     // hsl(40, 12%, 10%)
    text100        = Color.hsl(40f, 0.10f, 0.16f),     // hsl(40, 10%, 16%)
    text200        = Color.hsl(40f, 0.08f, 0.32f),     // hsl(40, 8%, 32%)
    text300        = Color.hsl(40f, 0.08f, 0.32f),     // same
    text400        = Color.hsl(40f, 0.06f, 0.48f),     // hsl(40, 6%, 48%)
    text500        = Color.hsl(40f, 0.06f, 0.48f),     // same
    border100      = Color.hsl(40f, 0.10f, 0.72f),     // hsl(40, 10%, 72%)
    border200      = Color.hsl(40f, 0.10f, 0.72f),
    border300      = Color.hsl(40f, 0.10f, 0.72f),
    border400      = Color.hsl(40f, 0.10f, 0.72f),
    accent000      = Color.hsl(43f, 0.65f, 0.42f),     // hsl(43, 65%, 42%)
    accent100      = Color.hsl(43f, 0.65f, 0.38f),     // hsl(43, 65%, 38%)
    accent900      = Color.hsl(43f, 0.40f, 0.90f),     // hsl(43, 40%, 90%)
    brand000       = Color.hsl(36f, 0.55f, 0.42f),     // hsl(36, 55%, 42%)
    brand100       = Color.hsl(36f, 0.60f, 0.47f),     // hsl(36, 60%, 47%)
    oncolor100     = Color.hsl(0f, 0f, 1f),             // hsl(0, 0%, 100%)
    error          = Color.hsl(0f, 0.60f, 0.50f),      // hsl(0, 60%, 50%)
    warning        = Color.hsl(39f, 0.70f, 0.50f),     // hsl(39, 70%, 50%)
    cellBorderAlpha = 0.6f,
)

// ──────────────────────────────────────────────
// Material3 color schemes mapped from Socrates tokens
// ──────────────────────────────────────────────
private val DarkColors = darkColorScheme(
    primary            = DarkSocrates.accent000,
    onPrimary          = DarkSocrates.oncolor100,
    primaryContainer   = DarkSocrates.accent900,
    onPrimaryContainer = DarkSocrates.accent100,
    secondary          = DarkSocrates.brand000,
    onSecondary        = DarkSocrates.oncolor100,
    tertiary           = DarkSocrates.brand100,
    onTertiary         = DarkSocrates.oncolor100,
    background         = DarkSocrates.bg100,
    onBackground       = DarkSocrates.text100,
    surface            = DarkSocrates.bg200,
    onSurface          = DarkSocrates.text100,
    surfaceVariant     = DarkSocrates.bg000,
    onSurfaceVariant   = DarkSocrates.text300,
    outline            = DarkSocrates.border300,
    outlineVariant     = DarkSocrates.border100.copy(alpha = 0.3f),
    error              = DarkSocrates.error,
    onError            = DarkSocrates.oncolor100,
    inverseSurface     = DarkSocrates.text100,
    inverseOnSurface   = DarkSocrates.bg100,
    inversePrimary     = DarkSocrates.accent000,
)

private val LightColors = lightColorScheme(
    primary            = LightSocrates.accent000,
    onPrimary          = LightSocrates.oncolor100,
    primaryContainer   = LightSocrates.accent900,
    onPrimaryContainer = LightSocrates.accent100,
    secondary          = LightSocrates.brand000,
    onSecondary        = LightSocrates.oncolor100,
    tertiary           = LightSocrates.brand100,
    onTertiary         = LightSocrates.oncolor100,
    background         = LightSocrates.bg100,
    onBackground       = LightSocrates.text100,
    surface            = LightSocrates.bg200,
    onSurface          = LightSocrates.text100,
    surfaceVariant     = LightSocrates.bg000,
    onSurfaceVariant   = LightSocrates.text300,
    outline            = LightSocrates.border300,
    outlineVariant     = LightSocrates.border100.copy(alpha = 0.3f),
    error              = LightSocrates.error,
    onError            = LightSocrates.oncolor100,
    inverseSurface     = LightSocrates.text100,
    inverseOnSurface   = LightSocrates.bg100,
    inversePrimary     = LightSocrates.accent000,
)

// ──────────────────────────────────────────────
// Custom font families from res/font/
// ──────────────────────────────────────────────
private val InterFont = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold),
)

private val NewsreaderFont = FontFamily(
    Font(R.font.newsreader_regular, FontWeight.Normal),
    Font(R.font.newsreader_medium, FontWeight.Medium),
    Font(R.font.newsreader_semibold, FontWeight.SemiBold),
    Font(R.font.newsreader_bold, FontWeight.Bold),
)

private val JetBrainsMonoFont = FontFamily(
    Font(R.font.jetbrains_mono_regular, FontWeight.Normal),
    Font(R.font.jetbrains_mono_medium, FontWeight.Medium),
    Font(R.font.jetbrains_mono_bold, FontWeight.Bold),
)

// ──────────────────────────────────────────────
// Typography — mirrors web font stack
//   --font-sans: Inter, system-ui, sans-serif
//   --font-display: Newsreader, Georgia, serif
//   --font-mono: JetBrains Mono, ui-monospace, monospace
// ──────────────────────────────────────────────
private val SocraticTypography = Typography(
    displayLarge  = TextStyle(fontFamily = NewsreaderFont, fontWeight = FontWeight.Light,   fontSize = 36.sp, lineHeight = 44.sp, letterSpacing = (-0.5).sp),
    displayMedium = TextStyle(fontFamily = NewsreaderFont, fontWeight = FontWeight.Light,   fontSize = 28.sp, lineHeight = 36.sp, letterSpacing = (-0.4).sp),
    displaySmall  = TextStyle(fontFamily = NewsreaderFont, fontWeight = FontWeight.Normal,  fontSize = 22.sp, lineHeight = 30.sp, letterSpacing = (-0.3).sp),
    headlineLarge = TextStyle(fontFamily = NewsreaderFont, fontWeight = FontWeight.Medium,  fontSize = 28.sp, lineHeight = 36.sp),
    headlineMedium= TextStyle(fontFamily = NewsreaderFont, fontWeight = FontWeight.Medium,  fontSize = 22.sp, lineHeight = 30.sp),
    headlineSmall = TextStyle(fontFamily = NewsreaderFont, fontWeight = FontWeight.Medium,  fontSize = 18.sp, lineHeight = 26.sp),
    titleLarge    = TextStyle(fontFamily = InterFont,      fontWeight = FontWeight.SemiBold,fontSize = 18.sp, lineHeight = 24.sp, letterSpacing = (-0.2).sp),
    titleMedium   = TextStyle(fontFamily = InterFont,      fontWeight = FontWeight.Medium,  fontSize = 15.sp, lineHeight = 22.sp, letterSpacing = (-0.1).sp),
    titleSmall    = TextStyle(fontFamily = InterFont,      fontWeight = FontWeight.Medium,  fontSize = 13.sp, lineHeight = 18.sp),
    bodyLarge     = TextStyle(fontFamily = InterFont,      fontWeight = FontWeight.Normal,  fontSize = 15.sp, lineHeight = 22.sp, letterSpacing = (-0.1).sp),
    bodyMedium    = TextStyle(fontFamily = InterFont,      fontWeight = FontWeight.Normal,  fontSize = 13.sp, lineHeight = 20.sp),
    bodySmall     = TextStyle(fontFamily = InterFont,      fontWeight = FontWeight.Normal,  fontSize = 11.sp, lineHeight = 16.sp),
    labelLarge    = TextStyle(fontFamily = InterFont,      fontWeight = FontWeight.Medium,  fontSize = 13.sp, lineHeight = 18.sp),
    labelMedium   = TextStyle(fontFamily = InterFont,      fontWeight = FontWeight.Medium,  fontSize = 11.sp, lineHeight = 16.sp),
    labelSmall    = TextStyle(fontFamily = InterFont,      fontWeight = FontWeight.Medium,  fontSize = 10.sp, lineHeight = 14.sp, letterSpacing = 0.4.sp),
)

// ──────────────────────────────────────────────
// Spacing & dimension tokens from the CSS
// ──────────────────────────────────────────────
object SocratesDimens {
    /** Sidebar expanded width — matches 18rem from CSS */
    val sidebarWidthExpanded = 288.dp
    /** Sidebar collapsed (icon-only) width */
    val sidebarWidthCollapsed = 56.dp
    /** Max width of the chat message column */
    val chatContentMaxWidth = 720.dp
    /** Gap between consecutive messages */
    val messageGap = 14.dp
    /** Minimum height of the chat input area */
    val inputMinHeight = 56.dp
    /** Grid spacing for 4dp-base grid */
    val grid4 = 4.dp
    val grid6 = 6.dp
    val grid8 = 8.dp
    val grid10 = 10.dp
    val grid12 = 12.dp
    val grid14 = 14.dp
    val grid16 = 16.dp
    val grid20 = 20.dp
    val grid24 = 24.dp
    val grid32 = 32.dp
    /** Border radius tokens */
    val radius4 = 4.dp
    val radius6 = 6.dp
    val radius8 = 8.dp
    val radius10 = 10.dp
    val radius12 = 12.dp
    val radius14 = 14.dp
    val radius16 = 16.dp
    val radius20 = 20.dp
    val radiusPill = 999.dp
    /** Sidebar icon-btn size */
    val iconBtnSize = 28.dp
    val iconSize = 16.dp
}

// ──────────────────────────────────────────────
// Top-level theme composable
// ──────────────────────────────────────────────
@Composable
fun SocratesTheme(
    prefs: PreferencesStore,
    content: @Composable () -> Unit
) {
    val themeMode by prefs.theme.collectAsState(initial = "system")
    val systemDark = isSystemInDarkTheme()
    val darkTheme = when (themeMode) {
        "dark" -> true
        "light" -> false
        else -> systemDark
    }

    val colors = if (darkTheme) DarkColors else LightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Color.Transparent.toArgb()
            window.navigationBarColor = Color.Transparent.toArgb()
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !darkTheme
            controller.isAppearanceLightNavigationBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colors,
        typography = SocraticTypography,
        content = content
    )
}

/**
 * Access the current SocratesColors tokens from any composable.
 * Usage: `val socrates = SocratesTheme.colors`
 */
object SocratesTheme {
    val colors: SocratesColors
        @Composable
        get() = if (MaterialTheme.colorScheme.background == DarkColors.background) DarkSocrates else LightSocrates
}
