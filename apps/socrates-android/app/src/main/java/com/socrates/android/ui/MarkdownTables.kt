package com.socrates.android.ui

import io.noties.markwon.ext.latex.JLatexMathBlock
import io.noties.markwon.ext.latex.JLatexMathNode
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TableBody
import org.commonmark.ext.gfm.tables.TableHead
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.tables.TableRow
import org.commonmark.node.Document
import org.commonmark.node.Node
import org.commonmark.node.Paragraph

/** Consume the parser's GFM structure, never split Markdown on pipes or reparse cell source.
 * Parsing the entire prose fragment first retains resolved reference links across table boundaries.
 * The same cell extraction serves root tables and tables owned by lists/quotes.
 */
internal object MarkdownTables {
    sealed interface Block {
        data class Prose(val node: Document) : Block
        data class Table(val rows: List<Row>) : Block
    }
    data class Row(val cells: List<Cell>, val header: Boolean)
    data class Cell(val node: Document, val alignment: TableCell.Alignment?)

    /** A per-input, collision-free shield for pipes inside recognized math only. Restored in TeX AST
     * nodes before rendering, so neither GFM cell splitting nor Markdown escapes can change TeX.
     */
    fun pipeToken(source: String): String {
        var token = "SOCRATESMATHPIPE"
        while (source.contains(token)) token += "X"
        return token
    }

    fun restoreMathPipes(root: Node, pipeToken: String) {
        fun restore(value: String) = value.replace(pipeToken, "|")
        // Iterative traversal also restores literal fallbacks for math rejected by the inline parser.
        val pending = java.util.ArrayDeque<Node>()
        pending.add(root)
        while (pending.isNotEmpty()) {
            val node = pending.removeLast()
            when (node) {
                is JLatexMathNode -> node.latex(restore(node.latex()))
                is JLatexMathBlock -> node.latex(restore(node.latex()))
                is org.commonmark.node.Text -> node.literal = restore(node.literal)
                is org.commonmark.node.Code -> node.literal = restore(node.literal)
                is org.commonmark.node.FencedCodeBlock -> node.literal = restore(node.literal)
                is org.commonmark.node.IndentedCodeBlock -> node.literal = restore(node.literal)
                is org.commonmark.node.HtmlInline -> node.literal = restore(node.literal)
                is org.commonmark.node.HtmlBlock -> node.literal = restore(node.literal)
                is org.commonmark.node.Link -> { node.destination = restore(node.destination); node.title = node.title?.let(::restore) }
                is org.commonmark.node.Image -> { node.destination = restore(node.destination); node.title = node.title?.let(::restore) }
            }
            var child = node.firstChild
            while (child != null) { pending.add(child); child = child.next }
        }
    }

    /** Validate the whole table before moving any inline nodes. Unknown table-extension structure
     * remains intact for Markwon's span fallback, not a partially extracted/truncated custom table.
     * No new syntax or per-cell math budget is introduced here: inline parsing is already complete.
     */
    fun extractOrNull(table: TableBlock, checkpoint: () -> Unit = {}): Block.Table? {
        var section = table.firstChild ?: return null
        while (true) {
            checkpoint()
            if (section !is TableHead && section !is TableBody) return null
            var row = section.firstChild
            while (row != null) {
                checkpoint()
                if (row !is TableRow || row.firstChild == null) return null
                var cell = row.firstChild
                while (cell != null) {
                    checkpoint()
                    if (cell !is TableCell) return null
                    cell = cell.next
                }
                row = row.next
            }
            section = section.next ?: break
        }
        val rows = mutableListOf<Row>()
        section = table.firstChild!!
        while (true) {
            var row = section.firstChild
            while (row != null) {
                checkpoint()
                val cells = mutableListOf<Cell>()
                var header = false
                var cell = row.firstChild
                while (cell != null) {
                    checkpoint()
                    val parsed = cell as TableCell
                    header = header || parsed.isHeader
                    val document = Document()
                    val paragraph = Paragraph()
                    document.appendChild(paragraph)
                    while (parsed.firstChild != null) {
                        checkpoint()
                        paragraph.appendChild(parsed.firstChild)
                    }
                    cells += Cell(document, parsed.alignment)
                    cell = cell.next
                }
                rows += Row(cells, header)
                row = row.next
            }
            section = section.next ?: break
        }
        return Block.Table(rows)
    }

    /** Root-only compatibility helper; production container traversal owns recursive placement. */
    fun blocks(root: Node): List<Block> {
        val result = mutableListOf<Block>()
        var prose = Document()
        fun flush() {
            if (prose.firstChild != null) result += Block.Prose(prose)
            prose = Document()
        }
        var child = root.firstChild
        while (child != null) {
            val next = child.next
            val table = (child as? TableBlock)?.let { extractOrNull(it) }
            if (table != null) {
                flush()
                result += table
                child.unlink()
            } else prose.appendChild(child)
            child = next
        }
        flush()
        return result
    }
}
