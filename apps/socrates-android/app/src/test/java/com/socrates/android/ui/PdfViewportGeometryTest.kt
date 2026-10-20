package com.socrates.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PdfViewportGeometryTest {
    private fun update(
        current: PdfViewportTransform = PdfViewportTransform(),
        vw: Float = 100f,
        vh: Float = 100f,
        cw: Float = vw,
        ch: Float = vh,
        zoom: Float = 1f,
        panX: Float = 0f,
        panY: Float = 0f,
        cx: Float = vw / 2,
        cy: Float = vh / 2,
    ) = PdfViewportGeometry.update(current, vw, vh, cw, ch, zoom, panX, panY, cx, cy)

    @Test fun zoomAtCenterKeepsOffsetZero() {
        assertEquals(PdfViewportTransform(2f), update(zoom = 2f, cw = 200f, ch = 200f))
    }

    @Test fun zoomAtCentroidCompensatesTranslation() {
        val result = update(zoom = 2f, cx = 75f, cy = 25f, cw = 200f, ch = 200f)
        assertEquals(-25f, result.offsetX, 0.001f)
        assertEquals(25f, result.offsetY, 0.001f)
    }

    @Test fun centroidKeepsContentPointStationary() {
        val result = update(zoom = 2f, cx = 75f, cy = 25f, cw = 300f, ch = 300f)
        assertEquals(75f, 50f + result.offsetX + (75f - 50f) * result.scale, 0.001f)
        assertEquals(25f, 50f + result.offsetY + (25f - 50f) * result.scale, 0.001f)
    }

    @Test fun panIsAppliedAfterZoom() {
        val result = update(zoom = 2f, panX = 7f, panY = -9f, cw = 300f, ch = 300f)
        assertEquals(7f, result.offsetX, 0.001f)
        assertEquals(-9f, result.offsetY, 0.001f)
    }

    @Test fun panClampsToContentEdges() {
        val result = update(cw = 200f, ch = 200f, zoom = 2f, panX = 1000f, panY = -1000f)
        assertEquals(150f, result.offsetX, 0.001f)
        assertEquals(-150f, result.offsetY, 0.001f)
    }

    @Test fun undersizedAxisIsAlwaysCentered() {
        val result = update(cw = 40f, ch = 300f, zoom = 2f, panX = 90f, panY = 500f)
        assertEquals(0f, result.offsetX, 0f)
        assertEquals(250f, result.offsetY, 0.001f)
    }

    @Test fun oneTimesZoomResetsBothOffsets() {
        val result = update(PdfViewportTransform(2f, 50f, -20f), zoom = 0.5f, cw = 300f, ch = 300f)
        assertEquals(1f, result.scale, 0f)
        assertEquals(0f, result.offsetX, 0f)
        assertEquals(0f, result.offsetY, 0f)
    }

    @Test fun scaleIsClampedToMaximum() {
        assertEquals(4f, update(zoom = 20f, cw = 500f, ch = 500f).scale, 0f)
    }

    @Test fun scaleIsClampedToMinimum() {
        assertEquals(1f, update(PdfViewportTransform(2f), zoom = 0.1f).scale, 0f)
    }

    @Test fun portraitAndLandscapeContentClampPerAxis() {
        val portrait = update(vw = 100f, vh = 200f, cw = 180f, ch = 300f, zoom = 2f, panX = 500f, panY = -500f)
        assertEquals(130f, portrait.offsetX, 0.001f)
        assertEquals(-200f, portrait.offsetY, 0.001f)
        val landscape = update(vw = 200f, vh = 100f, cw = 300f, ch = 180f, zoom = 2f, panX = -500f, panY = 500f)
        assertEquals(-200f, landscape.offsetX, 0.001f)
        assertEquals(130f, landscape.offsetY, 0.001f)
    }

    @Test fun repeatedZoomsRemainFiniteAndWithinBounds() {
        var state = PdfViewportTransform()
        repeat(100) { state = update(state, cw = 1000f, ch = 1000f, zoom = 1.1f, cx = 30f, cy = 70f) }
        assertEquals(4f, state.scale, 0f)
        assertTrue(state.offsetX.isFinite() && state.offsetY.isFinite())
        assertTrue(kotlin.math.abs(state.offsetX) <= 1950f)
    }

    @Test fun nonFiniteCurrentAndGesturesAreSafelyCorrected() {
        val result = update(
            PdfViewportTransform(Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY),
            cw = 300f, ch = 300f, zoom = Float.NaN, panX = Float.POSITIVE_INFINITY,
            panY = Float.NaN, cx = Float.NaN, cy = Float.NEGATIVE_INFINITY,
        )
        assertEquals(PdfViewportTransform(), result)
        assertTrue(result.scale.isFinite() && result.offsetX.isFinite() && result.offsetY.isFinite())
    }

    @Test fun invalidDimensionsProduceFiniteCenteredBounds() {
        val result = update(vw = Float.NaN, vh = -5f, cw = Float.POSITIVE_INFINITY, ch = Float.NaN,
            zoom = 2f, panX = 40f, panY = 50f)
        assertTrue(result.scale.isFinite() && result.offsetX.isFinite() && result.offsetY.isFinite())
        assertEquals(0f, result.offsetX, 0f)
        assertEquals(0f, result.offsetY, 0f)
    }
}
