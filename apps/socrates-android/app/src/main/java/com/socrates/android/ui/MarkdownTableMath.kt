package com.socrates.android.ui

import io.noties.markwon.ext.latex.JLatexMathNode
import io.noties.markwon.inlineparser.InlineProcessor
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.node.Node

/** Runs before the LaTeX plugin's unrestricted $$ processor, only in real GFM cells.
 * MarkdownSource has already recognized the author's inline delimiters and shielded math pipes.
 * No cell reparse: links, references, emphasis, code and HTML keep the normal parser boundaries.
 * These are local source/span budgets, not a TeX execution-time or bitmap-memory guarantee.
 */
internal class MarkdownTableMath : InlineProcessor() {
    companion object {
        const val MAX_MATH_LENGTH = 2048
        const val MAX_MATH_PER_CELL = 32
    }

    private var currentCell: Node? = null
    private var mathCount = 0

    override fun specialCharacter(): Char = '$'

    override fun parse(): Node? {
        if (block !is TableCell) return null
        // Markwon 4.6.2's default regex uses Matcher.find(), not lookingAt(): returning null
        // for a literal dollar would let it skip prices/text to a later $$ formula (and our cap).
        if (!input.startsWith("$$", index)) {
            index++
            return text("$")
        }
        if (currentCell !== block) {
            currentCell = block
            mathCount = 0
        }
        val start = index
        val bodyStart = start + 2
        var close = bodyStart
        while (close < input.length && !input.startsWith("$$", close)) {
            close += if (input[close] == '\\' && close + 1 < input.length) 2 else 1
        }
        // Consume only the unmatched opener, so following links/code/emphasis still parse normally.
        if (close >= input.length) {
            index = bodyStart
            return text("$$")
        }
        val end = close + 2
        index = end
        val length = close - bodyStart
        if (length !in 1..MAX_MATH_LENGTH || mathCount >= MAX_MATH_PER_CELL ||
            input.substring(bodyStart, close).any { it == '\n' || it == '\r' }) {
            return text(input.substring(start, end))
        }
        mathCount++
        return JLatexMathNode().apply { latex(input.substring(bodyStart, close)) }
    }
}
