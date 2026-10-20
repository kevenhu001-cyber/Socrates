@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.socrates.android.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/** Magnifies the existing bounded raster: never downloads or allocates a larger PDF bitmap. */
@Composable
fun PdfPageViewport(bitmap: Bitmap, description: String, pageIdentity: Any) {
    var transform by remember(bitmap, pageIdentity) { mutableStateOf(PdfViewportTransform()) }
    var viewport by remember { mutableStateOf(IntSize.Zero) }
    fun transformed(zoom: Float = 1f, panX: Float = 0f, panY: Float = 0f,
                    anchorX: Float = viewport.width / 2f, anchorY: Float = viewport.height / 2f): PdfViewportTransform {
        val width = viewport.width.toFloat()
        val height = viewport.height.toFloat()
        val fit = minOf(width / bitmap.width, height / bitmap.height)
        return PdfViewportGeometry.update(transform, width, height,
            bitmap.width * fit, bitmap.height * fit, zoom, panX, panY, anchorX, anchorY)
    }
    fun update(zoom: Float = 1f, panX: Float = 0f, panY: Float = 0f,
               anchorX: Float = viewport.width / 2f, anchorY: Float = viewport.height / 2f) {
        transform = transformed(zoom, panX, panY, anchorX, anchorY)
    }
    val gestureState = rememberTransformableState { zoom, pan, _ -> update(zoom, pan.x, pan.y) }
    val ready = viewport.width > 0 && viewport.height > 0
    val percent = (transform.scale * 100).roundToInt()
    val canZoomIn = ready && transform.scale < PdfViewportGeometry.MAX_SCALE
    val canZoomOut = ready && transform.scale > PdfViewportGeometry.MIN_SCALE
    fun zoomIn() { update((transform.scale + PdfViewportGeometry.STEP) / transform.scale) }
    fun zoomOut() { update((transform.scale - PdfViewportGeometry.STEP) / transform.scale) }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val pageHeight = (maxWidth * (bitmap.height.toFloat() / bitmap.width)).coerceIn(120.dp, 520.dp)
            Box(Modifier.fillMaxWidth().height(pageHeight)
                .clipToBounds().background(Color.White)
                .onSizeChanged { viewport = it; update() }
                .testTag("pdf-page-viewport")
                .semantics {
                    stateDescription = "缩放 $percent%"
                    customActions = buildList {
                        if (canZoomIn) add(CustomAccessibilityAction("放大 PDF") { zoomIn(); true })
                        if (canZoomOut) {
                            add(CustomAccessibilityAction("缩小 PDF") { zoomOut(); true })
                            add(CustomAccessibilityAction("重置 PDF 缩放") { transform = PdfViewportTransform(); true })
                            // Actions move the viewing window; the page moves in the opposite direction.
                            add(CustomAccessibilityAction("向右阅读 PDF") { update(panX = -viewport.width / 3f); true })
                            add(CustomAccessibilityAction("向左阅读 PDF") { update(panX = viewport.width / 3f); true })
                            add(CustomAccessibilityAction("向下阅读 PDF") { update(panY = -viewport.height / 3f); true })
                            add(CustomAccessibilityAction("向上阅读 PDF") { update(panY = viewport.height / 3f); true })
                        }
                    }
                }
                // A new one-finger gesture at a clamped edge can scroll the outer document.
                // An already claimed gesture stays with the PDF until the fingers lift.
                .transformable(gestureState, canPan = { pan ->
                    val next = transformed(panX = pan.x, panY = pan.y)
                    transform.scale > PdfViewportGeometry.MIN_SCALE &&
                        (next.offsetX != transform.offsetX || next.offsetY != transform.offsetY)
                })
                .pointerInput(bitmap, pageIdentity) {
                    detectTapGestures(onDoubleTap = { point ->
                        if (transform.scale > PdfViewportGeometry.MIN_SCALE) transform = PdfViewportTransform()
                        else update(2f, anchorX = point.x, anchorY = point.y)
                    })
                }) {
                Image(bitmap.asImageBitmap(), contentDescription = description,
                    modifier = Modifier.fillMaxSize().graphicsLayer {
                        scaleX = transform.scale
                        scaleY = transform.scale
                        translationX = transform.offsetX
                        translationY = transform.offsetY
                    }, contentScale = ContentScale.Fit)
            }
        }
        Text("缩放 $percent%", style = MaterialTheme.typography.labelSmall, color = SocratesDesign.Muted)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SocratesOutlinedButton(onClick = ::zoomOut, enabled = canZoomOut, modifier = Modifier.weight(1f)) { Text("缩小") }
            SocratesOutlinedButton(onClick = ::zoomIn, enabled = canZoomIn, modifier = Modifier.weight(1f)) { Text("放大") }
        }
        SocratesOutlinedButton(onClick = { transform = PdfViewportTransform() }, enabled = canZoomOut,
            modifier = Modifier.fillMaxWidth()) { Text("适合页面") }
        Text("双指缩放，放大后单指移动；双击放大或恢复。移至边界后松手，再次滑动可滚动外层页面。翻页后重置。仅放大当前预览图，细节受原始栅格清晰度限制。",
            style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
    }
}
