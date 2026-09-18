@file:OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)

package com.topodrive.socrates.theme

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import com.topodrive.socrates.R

/**
 * Typography — matches the web bundle's font stack:
 *   body/UI   → Inter (400/500/600/700 statics)
 *   display   → Newsreader variable (greeting + headings)
 *   mono/code → JetBrains Mono variable
 * CJK glyphs fall through to the platform's Noto Sans CJK, the same
 * fallback the web relies on via its Noto Sans SC stack.
 */
private val interRegular = Font(R.font.inter_regular, FontWeight.Normal)
private val interMedium = Font(R.font.inter_medium, FontWeight.Medium)
private val interSemiBold = Font(R.font.inter_semibold, FontWeight.SemiBold)
private val interBold = Font(R.font.inter_bold, FontWeight.Bold)

val InterFamily = FontFamily(interRegular, interMedium, interSemiBold, interBold)

val NewsreaderFamily = FontFamily(
    Font(
        R.font.newsreader,
        weight = FontWeight.Medium,
        variationSettings = FontVariation.Settings(
            FontVariation.weight(500),
            FontVariation.Setting("opsz", 28f),
        ),
    ),
    Font(
        R.font.newsreader,
        weight = FontWeight.SemiBold,
        variationSettings = FontVariation.Settings(
            FontVariation.weight(600),
            FontVariation.Setting("opsz", 28f),
        ),
    ),
)

val JetBrainsMonoFamily = FontFamily(
    Font(
        R.font.jetbrains_mono,
        weight = FontWeight.Normal,
        variationSettings = FontVariation.Settings(FontVariation.weight(400)),
    ),
    Font(
        R.font.jetbrains_mono,
        weight = FontWeight.Medium,
        variationSettings = FontVariation.Settings(FontVariation.weight(500)),
    ),
)

/**
 * Font size scale — mirrors `frontend/src/styles/tokens.css`
 * (--ui-font-size-*) interpreted as sp/dp.
 */
data class TypeScale(
    val xxs: Float = 12f,
    val xs: Float = 13f,
    val sm: Float = 14f,
    val md: Float = 16f,
    val lg: Float = 18f,
    val xl: Float = 20f,
    val xxl: Float = 24f,
)

/** User-facing text-size multiplier from display prefs (S/M/L/XL). */
val LocalFontScale = staticCompositionLocalOf { 1.125f }

val LocalTypeScale = staticCompositionLocalOf { TypeScale() }
