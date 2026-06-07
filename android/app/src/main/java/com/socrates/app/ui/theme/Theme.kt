package com.socrates.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.socrates.app.data.local.PreferencesStore
import androidx.compose.runtime.collectAsState

/**
 * Socrates theme — mirrors the socrates/dark and socrates/light CSS
 * variables in the web client. We expose the colors via Material3's
 * color scheme so the standard components pick them up, and add a
 * few `SocratesColors` extras for surfaces that the design system
 * styles directly.
 */
private val LightColors = lightColorScheme(
    primary = Color(0xFFB07C2C),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFF5E5C2),
    onPrimaryContainer = Color(0xFF3A2A12),
    secondary = Color(0xFFA37530),
    onSecondary = Color(0xFFFFFFFF),
    background = Color(0xFFF1E9DA),
    onBackground = Color(0xFF1F1A14),
    surface = Color(0xFFF8F4EC),
    onSurface = Color(0xFF1F1A14),
    surfaceVariant = Color(0xFFE5DBC4),
    onSurfaceVariant = Color(0xFF5A5045),
    outline = Color(0xFFB8A98F),
    outlineVariant = Color(0xFFD3C5A4),
    error = Color(0xFFB04141),
    onError = Color(0xFFFFFFFF),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFD8A85B),
    onPrimary = Color(0xFF1A130A),
    primaryContainer = Color(0xFF3A2D1B),
    onPrimaryContainer = Color(0xFFF5E5C2),
    secondary = Color(0xFFC9924A),
    onSecondary = Color(0xFF1A130A),
    background = Color(0xFF28241F),
    onBackground = Color(0xFFF4ECD9),
    surface = Color(0xFF322E2A),
    onSurface = Color(0xFFF4ECD9),
    surfaceVariant = Color(0xFF1F1B17),
    onSurfaceVariant = Color(0xFFA99A82),
    outline = Color(0xFFC8BBA3),
    outlineVariant = Color(0xFF45403A),
    error = Color(0xFFD87070),
    onError = Color(0xFF1A130A),
)

private val SocraticTypography = Typography(
    displayLarge = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Light, fontSize = 36.sp, lineHeight = 44.sp, letterSpacing = (-0.5).sp),
    displayMedium = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Light, fontSize = 28.sp, lineHeight = 36.sp, letterSpacing = (-0.4).sp),
    displaySmall = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal, fontSize = 22.sp, lineHeight = 30.sp, letterSpacing = (-0.3).sp),
    headlineLarge = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium, fontSize = 28.sp, lineHeight = 36.sp),
    headlineMedium = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium, fontSize = 22.sp, lineHeight = 30.sp),
    headlineSmall = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium, fontSize = 18.sp, lineHeight = 26.sp),
    titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 24.sp, letterSpacing = (-0.2).sp),
    titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 22.sp, letterSpacing = (-0.1).sp),
    titleSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp, letterSpacing = (-0.1).sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 11.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp),
    labelMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 10.sp, lineHeight = 14.sp, letterSpacing = 0.4.sp),
)

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

object SocratesDimens {
    val sidebarWidthCollapsed = 56
    val sidebarWidthExpanded = 280
    val chatContentMaxWidth = 720
    val messageGap = 14
    val inputMinHeight = 56
}
