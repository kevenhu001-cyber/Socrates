package com.socrates.android.ui

import io.noties.markwon.ext.latex.JLatexMathNode
import io.noties.markwon.inlineparser.InlineProcessor
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.node.Node

/** Own every prose dollar before the dependency's forward-searching regex can see it.
 * MarkdownSource has already classified author delimiters; do not guess single-dollar math here.
 * Table cells retain their separate length/count policy. Display blocks retain the block parser.
 * This bounds consumption to the current candidate, not TeX execution or transcript resources.
 */
internal class MarkdownProseMath : InlineProcessor() {
    override fun specialCharacter(): Char = '$'

    override fun parse(): Node? {
        if (block is TableCell) return null
        if (!input.startsWith("$$", index)) {
            index++
            return text("$")
        }
        val start = index
        val bodyStart = start + 2
        var close = bodyStart
        while (close < input.length && !input.startsWith("$$", close)) {
            close += if (input[close] == '\\' && close + 1 < input.length) 2 else 1
        }
        // Only the opener is ours if it cannot close: keep subsequent Markdown parseable.
        if (close >= input.length) {
            index = bodyStart
            return text("$$")
        }
        index = close + 2
        // Empty markers are text, never a reason to search ahead for a different formula.
        val body = input.substring(bodyStart, close)
        if (body.isBlank()) return text(input.substring(start, index))
        return JLatexMathNode().apply { latex(body) }
    }
}
