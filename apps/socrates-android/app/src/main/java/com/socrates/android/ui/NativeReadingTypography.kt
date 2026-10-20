package com.socrates.android.ui

/** Mobile Web: components/chat.css uses 15px * displayPrefs.font (default M = 1.125)
 * and line-height: 1.65. Keep the existing rounded 17sp native body size, not desktop tokens
 * or the CSS fallback's 15px. This policy does not size formulas, tables or app-wide typography.
 */
internal object NativeReadingTypography {
    const val bodySizeSp = 17f
    const val bodyLineHeightRatio = 1.65f
    const val bodyLineHeightSp = bodySizeSp * bodyLineHeightRatio

    // TextView adds spacing to ascent/descent, NOT to textSize. Subtract the actual font metrics
    // instead of assuming that 17sp + 7sp is a 24sp line. Never compress a taller native font;
    // inline image/math spans and headings remain free to increase their own line metrics.
    fun extraLineSpacingPx(textSizePx: Float, fontHeightPx: Float): Float =
        (textSizePx * bodyLineHeightRatio - fontHeightPx).coerceAtLeast(0f)
}
