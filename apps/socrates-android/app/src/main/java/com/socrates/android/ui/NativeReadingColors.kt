package com.socrates.android.ui

/**
 * Light reading-surface roles from frontend/src/styles/themes.css (the sole Web palette owner).
 * Keep these separate from code syntax/status colors. Android currently exposes only a light theme;
 * this is not a dark-mode implementation or a replacement for the custom reading widgets.
 * ARGB ints let Compose and native TextView/Drawable hosts consume exactly the same roles.
 */
internal object NativeReadingColors {
    val textPrimary: Int = 0xFF1F1F1F.toInt() // --ui-text-primary
    val textSecondary: Int = 0xFF595959.toInt() // --ui-text-secondary
    val textTertiary: Int = 0xFF6B6B6B.toInt() // --ui-text-tertiary / muted
    val borderSubtle: Int = 0xFFEEEEEE.toInt() // --ui-border-subtle
    val borderDefault: Int = 0xFFE3E3E3.toInt() // --ui-border-default
    val borderStrong: Int = 0xFFDDDDDD.toInt() // --ui-border-strong
}
