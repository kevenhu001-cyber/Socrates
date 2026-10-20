package com.socrates.android.ui

/**
 * Viewport transform for center-origin graphicsLayer scale and translation.
 * Content is assumed to be fitted to the viewport and centered before this transform.
 */
data class PdfViewportTransform(
    val scale: Float = 1f,
    val offsetX: Float = 0f,
    val offsetY: Float = 0f,
)

object PdfViewportGeometry {
    const val MIN_SCALE = 1f
    const val MAX_SCALE = 4f
    const val STEP = 0.5f

    /**
     * Applies zoom around the viewport centroid, then adds pan, and clamps to centered
     * content bounds. Invalid/non-positive dimensions are treated as zero-size for bounds.
     * Non-finite current values use neutral defaults; non-finite gestures contribute zero.
     * The returned transform is always finite, and scale is clamped to [1, 4].
     */
    fun update(
        current: PdfViewportTransform,
        viewportWidth: Float,
        viewportHeight: Float,
        contentWidth: Float,
        contentHeight: Float,
        zoomFactor: Float = 1f,
        panX: Float = 0f,
        panY: Float = 0f,
        centroidX: Float = viewportWidth / 2,
        centroidY: Float = viewportHeight / 2,
    ): PdfViewportTransform {
        val vw = dimension(viewportWidth)
        val vh = dimension(viewportHeight)
        val cw = dimension(contentWidth)
        val ch = dimension(contentHeight)
        val oldScale = finite(current.scale, MIN_SCALE).coerceIn(MIN_SCALE, MAX_SCALE)
        val oldX = finite(current.offsetX, 0f)
        val oldY = finite(current.offsetY, 0f)
        val factor = finite(zoomFactor, 1f).coerceAtLeast(0f)
        val scale = (oldScale.toDouble() * factor.toDouble())
            .coerceIn(MIN_SCALE.toDouble(), MAX_SCALE.toDouble()).toFloat()
        val cx = finite(centroidX, (vw / 2).toFloat())
        val cy = finite(centroidY, (vh / 2).toFloat())
        val px = finite(panX, 0f)
        val py = finite(panY, 0f)

        // Scaling is about the layer's center origin: centroid remains fixed by
        // translating the scaled existing offset and compensating the centroid vector.
        val x = (cx.toDouble() - vw / 2.0) * (1.0 - scale / oldScale) +
            oldX.toDouble() * scale / oldScale + px
        val y = (cy.toDouble() - vh / 2.0) * (1.0 - scale / oldScale) +
            oldY.toDouble() * scale / oldScale + py
        val maxX = if (scale == 1f) 0.0 else max(0.0, (cw.toDouble() * scale - vw) / 2.0)
        val maxY = if (scale == 1f) 0.0 else max(0.0, (ch.toDouble() * scale - vh) / 2.0)
        return PdfViewportTransform(
            scale = scale,
            offsetX = x.coerceIn(-maxX, maxX).toFiniteFloat(),
            offsetY = y.coerceIn(-maxY, maxY).toFiniteFloat(),
        )
    }

    private fun dimension(value: Float): Double =
        if (value.isFinite() && value > 0f) value.toDouble() else 0.0

    private fun finite(value: Float, fallback: Float): Float =
        if (value.isFinite()) value else fallback

    private fun max(a: Double, b: Double): Double = if (a > b) a else b

    private fun Double.toFiniteFloat(): Float =
        if (isFinite()) toFloat().takeIf { it.isFinite() } ?: 0f else 0f
}
