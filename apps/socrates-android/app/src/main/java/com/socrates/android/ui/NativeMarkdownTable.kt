package com.socrates.android.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.text.Spanned
import android.text.method.LinkMovementMethod
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.HorizontalScrollView
import android.widget.TableLayout
import android.widget.TableRow
import android.widget.TextView
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import io.noties.markwon.Markwon
import org.commonmark.ext.gfm.tables.TableCell

internal sealed interface NativeMarkdownBlock {
    data class Prose(val text: Spanned) : NativeMarkdownBlock
    data class Table(val rows: List<Row>) : NativeMarkdownBlock
    data class Quote(val children: List<NativeMarkdownBlock>) : NativeMarkdownBlock
    data class ListBlock(val items: List<Item>, val tight: Boolean) : NativeMarkdownBlock
    data class Item(val marker: MarkdownContainers.Marker, val children: List<NativeMarkdownBlock>)
    data class Row(val cells: List<Cell>, val header: Boolean)
    data class Cell(val text: Spanned, val alignment: TableCell.Alignment?)
}

/** Markwon plugins have mutable visitors; serialize cancelled/overlapping streaming renders. */
internal fun renderMarkdownBlocks(markwon: Markwon, source: String, pipeToken: String, checkpoint: () -> Unit): List<NativeMarkdownBlock> = synchronized(markwon) {
    checkpoint()
    val root = markwon.parse(source)
    checkpoint()
    MarkdownTables.restoreMathPipes(root, pipeToken)
    fun renderContainers(blocks: List<MarkdownContainers.Block>): List<NativeMarkdownBlock> = blocks.map { block ->
        checkpoint()
        when (block) {
            is MarkdownContainers.Block.Prose -> NativeMarkdownBlock.Prose(markwon.render(block.node))
            is MarkdownContainers.Block.Table -> NativeMarkdownBlock.Table(block.rows.map { row ->
                NativeMarkdownBlock.Row(row.cells.map { cell ->
                    checkpoint()
                    NativeMarkdownBlock.Cell(markwon.render(cell.node), cell.alignment)
                }, row.header)
            })
            is MarkdownContainers.Block.Quote -> NativeMarkdownBlock.Quote(renderContainers(block.children))
            is MarkdownContainers.Block.ListBlock -> NativeMarkdownBlock.ListBlock(block.items.map { item ->
                checkpoint()
                NativeMarkdownBlock.Item(item.marker, renderContainers(item.children))
            }, block.tight)
        }
    }
    renderContainers(MarkdownContainers.blocks(root, checkpoint))
}

internal fun markdownTextView(context: Context, textPx: Float, lineSpacingPx: Float) = TextView(context).apply {
    setTextColor(NativeReadingColors.textPrimary)
    setTextSize(TypedValue.COMPLEX_UNIT_PX, textPx)
    typeface = Typeface.create("sans-serif", Typeface.NORMAL)
    includeFontPadding = false
    setLineSpacing(lineSpacingPx, 1f)
    setTextIsSelectable(true)
    movementMethod = LinkMovementMethod.getInstance()
    isSaveEnabled = false
}

// GFM :--- / ---: specify physical left/right, not locale-dependent start/end (as in HTML).
@android.annotation.SuppressLint("RtlHardcoded")
@Composable
internal fun NativeMarkdownTable(table: NativeMarkdownBlock.Table, markwon: Markwon) {
    val density = LocalDensity.current
    val textPx = with(density) { 14.sp.toPx() }
    val lineSpacingPx = with(density) { 7.sp.toPx() }
    val verticalPadding = with(density) { 8.dp.roundToPx() }
    val rightPadding = with(density) { 16.dp.roundToPx() }
    val minCellWidth = with(density) { 48.dp.roundToPx() }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val minimumTableWidth = with(density) { (maxWidth / 2).roundToPx() }
        val maximumCellWidth = with(density) { maxWidth.coerceAtMost(320.dp).roundToPx() }.coerceAtLeast(minCellWidth)
        AndroidView(
            factory = { context -> HorizontalScrollView(context).apply {
                isFillViewport = false
                isHorizontalScrollBarEnabled = true
                isSaveEnabled = false
                addView(TableLayout(context), ViewGroup.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            } },
            update = { scroll ->
                val layout = scroll.getChildAt(0) as TableLayout
                val identity = Triple(table, minimumTableWidth, maximumCellWidth)
                if (layout.tag != identity) {
                    clearTable(layout, markwon)
                    layout.minimumWidth = minimumTableWidth
                    table.rows.forEachIndexed { index, row ->
                        val view = TableRow(layout.context)
                        if (row.header || index < table.rows.lastIndex) {
                            view.background = TableRule(if (row.header) NativeReadingColors.borderStrong else NativeReadingColors.borderSubtle)
                        }
                        row.cells.forEach { cell ->
                            val text = markdownTextView(layout.context, textPx, lineSpacingPx).apply {
                                minWidth = minCellWidth
                                maxWidth = maximumCellWidth
                                setPadding(0, verticalPadding, rightPadding, verticalPadding)
                                if (row.header) typeface = if (android.os.Build.VERSION.SDK_INT >= 28) {
                                    Typeface.create(Typeface.create("sans-serif", Typeface.NORMAL), 600, false)
                                } else Typeface.create("sans-serif-medium", Typeface.NORMAL)
                                gravity = Gravity.TOP or when (cell.alignment) {
                                    TableCell.Alignment.CENTER -> Gravity.CENTER_HORIZONTAL
                                    TableCell.Alignment.RIGHT -> Gravity.RIGHT
                                    else -> Gravity.LEFT
                                }
                            }
                            view.addView(text, TableRow.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
                            markwon.setParsedMarkdown(text, cell.text)
                        }
                        layout.addView(view, TableLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
                    }
                    layout.tag = identity
                }
            },
            onRelease = { clearTable(it.getChildAt(0) as TableLayout, markwon) },
            modifier = Modifier.fillMaxWidth()
        )
    }
}

private fun clearTable(layout: TableLayout, markwon: Markwon) {
    for (rowIndex in 0 until layout.childCount) {
        val row = layout.getChildAt(rowIndex) as TableRow
        for (cellIndex in 0 until row.childCount) {
            // Run plugin unscheduling hooks before discarding formula/image hosts.
            markwon.setParsedMarkdown(row.getChildAt(cellIndex) as TextView, android.text.SpannedString(""))
        }
    }
    layout.removeAllViews()
    layout.tag = null
}

/** Quiet Socrates row rules: no grid, zebra fill, card, or Material data-table chrome. */
private class TableRule(color: Int) : Drawable() {
    private val paint = Paint().apply { this.color = color; strokeWidth = 1f }
    override fun draw(canvas: Canvas) { canvas.drawLine(bounds.left.toFloat(), bounds.bottom - .5f, bounds.right.toFloat(), bounds.bottom - .5f, paint) }
    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(colorFilter: ColorFilter?) { paint.colorFilter = colorFilter }
    @Deprecated("Deprecated in Android") override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}
