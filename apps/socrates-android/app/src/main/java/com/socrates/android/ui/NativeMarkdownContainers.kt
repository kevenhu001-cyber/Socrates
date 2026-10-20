package com.socrates.android.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import io.noties.markwon.Markwon

/** Container geometry follows Socrates' transcript: 26dp list gutter, quiet markers, 2dp quote rail
 * and 16dp quote inset. Inline spans retain the same renderer/link policy and drawable lifecycle.
 */
@Composable
internal fun NativeMarkdownBlocks(
    blocks: List<NativeMarkdownBlock>,
    markwon: Markwon,
    modifier: Modifier = Modifier,
    spacing: androidx.compose.ui.unit.Dp = 16.dp
) {
    val density = LocalDensity.current
    val textPx = with(density) { NativeReadingTypography.bodySizeSp.sp.toPx() }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(spacing)) {
        blocks.forEach { block ->
            when (block) {
                is NativeMarkdownBlock.Table -> NativeMarkdownTable(block, markwon)
                is NativeMarkdownBlock.Prose -> AndroidView(
                    factory = { context -> markdownTextView(context, textPx, 0f) },
                    update = { view ->
                        // Also update reused hosts after density/font-scale changes. Table cells
                        // retain their independent 14sp + 7sp configuration and shared factory.
                        applyMarkdownProseTypography(view, textPx)
                        if (view.tag !== block.text) {
                            markwon.setParsedMarkdown(view, block.text)
                            view.tag = block.text
                        }
                    },
                    onRelease = { markwon.setParsedMarkdown(it, android.text.SpannedString("")) },
                    modifier = Modifier.fillMaxWidth()
                )
                is NativeMarkdownBlock.Quote -> BoxWithConstraints(Modifier.fillMaxWidth()) {
                    // Do not consume the entire viewport in deeply nested containers on a narrow phone.
                    val inset = (maxWidth / 6).coerceAtMost(18.dp)
                    Box(Modifier.fillMaxWidth().testTag("markdown-quote").drawQuoteRail()) {
                        NativeMarkdownBlocks(block.children, markwon, Modifier.padding(start = inset), spacing = 12.dp)
                    }
                }
                is NativeMarkdownBlock.ListBlock -> NativeMarkdownList(block, markwon)
            }
        }
    }
}

internal fun applyMarkdownProseTypography(view: android.widget.TextView, textPx: Float) {
    view.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, textPx)
    val metrics = view.paint.fontMetricsInt
    view.setLineSpacing(NativeReadingTypography.extraLineSpacingPx(
        textPx, (metrics.descent - metrics.ascent).toFloat()
    ), 1f)
}

private fun Modifier.drawQuoteRail(): Modifier = drawBehind {
    val width = 2.dp.toPx()
    // start edge rather than a second TextView quote span; no double indentation or italic styling.
    val x = if (layoutDirection == androidx.compose.ui.unit.LayoutDirection.Ltr) 0f else size.width - width
    drawRect(Color(NativeReadingColors.borderStrong), Offset(x, 0f), Size(width, size.height))
}

@Composable
private fun NativeMarkdownList(list: NativeMarkdownBlock.ListBlock, markwon: Markwon) {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val markerLineHeight = with(density) { NativeReadingTypography.bodyLineHeightSp.sp.toDp() }
    val markerStyle = TextStyle(fontSize = NativeReadingTypography.bodySizeSp.sp,
        lineHeight = NativeReadingTypography.bodyLineHeightSp.sp, color = Color(NativeReadingColors.textTertiary))
    val ordinalWidth = remember(list, density, measurer) {
        list.items.mapNotNull { (it.marker as? MarkdownContainers.Marker.Ordered)?.number }
            .maxOfOrNull { measurer.measure("$it.", markerStyle).size.width } ?: 0
    }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val gutter = with(density) { ordinalWidth.toDp() + 8.dp }.coerceAtLeast(26.dp)
            .coerceAtMost(maxWidth / 3)
        Column(Modifier.fillMaxWidth().testTag("markdown-list"), verticalArrangement = Arrangement.spacedBy(if (list.tight) 4.dp else 12.dp)) {
            list.items.forEach { item ->
                Row(Modifier.fillMaxWidth()) {
                    Box(Modifier.width(gutter).padding(end = 8.dp), contentAlignment = androidx.compose.ui.Alignment.TopEnd) {
                        when (val marker = item.marker) {
                            is MarkdownContainers.Marker.Ordered -> Text("${marker.number}.", style = markerStyle, softWrap = false)
                            MarkdownContainers.Marker.Bullet -> Canvas(Modifier.size(8.dp, markerLineHeight)) {
                                drawCircle(Color(NativeReadingColors.textTertiary), 2.dp.toPx(), Offset(size.width / 2, size.height / 2))
                            }
                            is MarkdownContainers.Marker.Task -> TaskMarker(marker.checked)
                        }
                    }
                    NativeMarkdownBlocks(item.children, markwon, Modifier.weight(1f), spacing = if (list.tight) 4.dp else 12.dp)
                }
            }
        }
    }
}

/** A task in an assistant's Markdown is read-only source, not an enabled Material form control. */
@Composable
private fun TaskMarker(checked: Boolean) {
    val markerLineHeight = with(LocalDensity.current) { NativeReadingTypography.bodyLineHeightSp.sp.toDp() }
    Canvas(Modifier.size(16.dp, markerLineHeight).semantics {
        role = Role.Checkbox
        toggleableState = if (checked) ToggleableState.On else ToggleableState.Off
    }) {
        val side = 13.dp.toPx()
        val left = (size.width - side) / 2
        val top = (size.height - side) / 2
        val stroke = 1.4.dp.toPx()
        drawRect(Color(NativeReadingColors.textTertiary), Offset(left, top), Size(side, side), style = Stroke(stroke))
        if (checked) {
            val path = Path().apply {
                moveTo(left + side * .2f, top + side * .5f)
                lineTo(left + side * .42f, top + side * .72f)
                lineTo(left + side * .82f, top + side * .25f)
            }
            drawPath(path, Color(NativeReadingColors.textSecondary), style = Stroke(stroke))
        }
    }
}
