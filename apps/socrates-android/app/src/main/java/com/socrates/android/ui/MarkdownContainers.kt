package com.socrates.android.ui

import io.noties.markwon.ext.tasklist.TaskListItem
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.node.BlockQuote
import org.commonmark.node.BulletList
import org.commonmark.node.Document
import org.commonmark.node.LinkReferenceDefinition
import org.commonmark.node.ListBlock
import org.commonmark.node.ListItem
import org.commonmark.node.Node
import org.commonmark.node.OrderedList

/** Presentation only: consume already parsed nodes, never reparse list-item strings. References,
 * code literals and math nodes have been resolved before their container is detached for rendering.
 * Tables use the shared cell extractor at their original position within each container.
 */
internal object MarkdownContainers {
    sealed interface Block {
        data class Prose(val node: Document) : Block
        data class Table(val rows: List<MarkdownTables.Row>) : Block
        data class Quote(val children: List<Block>) : Block
        data class ListBlock(val items: List<Item>, val tight: Boolean) : Block
    }
    data class Item(val marker: Marker, val children: List<Block>)
    sealed interface Marker {
        data class Ordered(val number: Long) : Marker
        data object Bullet : Marker
        data class Task(val checked: Boolean) : Marker
    }

    // Bound the new presentation recursion, not the underlying CommonMark parser. Deeper subtrees
    // remain intact and use Markwon's existing span fallback, instead of being dropped or truncated.
    const val MAX_PRESENTATION_DEPTH = 12

    fun blocks(root: Node, checkpoint: () -> Unit = {}): List<Block> = collect(root, 0, checkpoint)

    private fun collect(root: Node, depth: Int, checkpoint: () -> Unit): List<Block> {
        val result = mutableListOf<Block>()
        var prose = Document()
        fun flush() {
            if (prose.firstChild != null) result += Block.Prose(prose)
            prose = Document()
        }
        var child = root.firstChild
        while (child != null) {
            checkpoint()
            val next = child.next
            when {
                // Link resolution is already complete. Definitions are metadata, not an empty
                // visible prose run after a quote/list (which would introduce an extra UI gap).
                child is LinkReferenceDefinition -> child.unlink()
                depth >= MAX_PRESENTATION_DEPTH -> prose.appendChild(child)
                child is TableBlock -> {
                    val table = MarkdownTables.extractOrNull(child, checkpoint)
                    if (table == null) prose.appendChild(child)
                    else {
                        flush()
                        result += Block.Table(table.rows)
                        child.unlink()
                    }
                }
                child is BlockQuote -> {
                    flush()
                    result += Block.Quote(collect(child, depth + 1, checkpoint))
                    child.unlink()
                }
                (child is BulletList || child is OrderedList) && supportedItems(child) -> {
                    flush()
                    val list = child as ListBlock
                    val start = (list as? OrderedList)?.startNumber?.toLong()
                    val items = mutableListOf<Item>()
                    var item = list.firstChild
                    var index = 0L
                    while (item != null) {
                        checkpoint()
                        val following = item.next
                        val marker = when {
                            item is TaskListItem -> Marker.Task(item.isDone)
                            start != null -> Marker.Ordered(start + index)
                            else -> Marker.Bullet
                        }
                        items += Item(marker, collect(item, depth + 1, checkpoint))
                        item.unlink()
                        item = following
                        index++
                    }
                    result += Block.ListBlock(items, list.isTight)
                    child.unlink()
                }
                else -> prose.appendChild(child)
            }
            child = next
        }
        flush()
        return result
    }

    private fun supportedItems(list: Node): Boolean {
        var child = list.firstChild
        while (child != null) {
            if (child !is ListItem && child !is TaskListItem) return false
            child = child.next
        }
        return true
    }
}
