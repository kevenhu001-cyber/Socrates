package com.socrates.android.ui

import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.node.BlockQuote
import org.commonmark.node.ListItem
import org.commonmark.node.Paragraph

/** Uses real block ownership; deliberately does not implement a container grammar.
 * Only standalone, explicitly prefixed paragraph lines can become display blocks.
 * Everything else stays literal in its original container (including streaming tails).
 */
internal class MarkdownContainerMath(
    private val source: String,
    private val offset: Int,
    private val lines: List<MarkdownCodeRegions.Line>,
    private val openings: Map<org.commonmark.node.Node, MarkdownCodeRegions.Line>,
    private val explicitParagraphs: Set<org.commonmark.node.Node>,
) {
    companion object {
        const val MAX_LENGTH = 4096
        const val MAX_LINES = 64
        const val MAX_DEPTH = 12
        private val punctuation = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".toSet()
    }

    private fun lineIndex(index: Int): Int {
        val absolute = offset + index
        var low = 0
        var high = lines.lastIndex
        while (low <= high) {
            val mid = (low + high) ushr 1
            val line = lines[mid]
            when {
                absolute < line.start -> high = mid - 1
                absolute >= line.end -> low = mid + 1
                else -> return mid
            }
        }
        return -1
    }

    private fun lineAt(index: Int) = lines.getOrNull(lineIndex(index))

    fun display(start: Int, end: Int, body: String, pipeReplacement: String?): String {
        if (end - start > MAX_LENGTH) return literal(start, end)
        val firstIndex = lineIndex(start)
        val lastIndex = lineIndex(end - 1)
        if (firstIndex < 0 || lastIndex < firstIndex || lastIndex - firstIndex + 1 > MAX_LINES) return literal(start, end)
        val first = lines[firstIndex]
        val last = lines[lastIndex]
        val selected = lines.subList(firstIndex, lastIndex + 1)
        val prefix = source.substring(first.start - offset, first.content - offset)
        var depth = 0
        var parent = first.block.parent
        while (parent != null) {
            if (parent is BlockQuote || parent is ListItem) depth++
            parent = parent.parent
        }
        // The first prefix is emitted by the caller. Replace list-marker columns with spaces,
        // retaining quote markers. Tabs are declined: partial-tab columns are not raw offsets.
        val continuation = prefix.map { if (it == '>') '>' else ' ' }.joinToString("")
        val opening = openings[first.owner]
        val openingPrefix = opening?.prefix.orEmpty()
        val expectedContinuation = openingPrefix.map { if (it == '>') '>' else ' ' }.joinToString("")
        val safe = end - start <= MAX_LENGTH && selected.size <= MAX_LINES && depth <= MAX_DEPTH &&
            first.block is Paragraph && start + offset == first.content &&
            first.block in explicitParagraphs &&
            openingPrefix.isNotEmpty() && (first === opening || prefix == expectedContinuation) &&
            source.substring(end, last.end - offset).isBlank() &&
            prefix.all { it == ' ' || it == '>' || it in "-+*.0123456789)" } &&
            selected.all { it.block === first.block && it.owner === first.owner } &&
            selected.drop(1).all {
                source.substring(it.start - offset, it.content - offset) == continuation
            }
        if (!safe || body.isBlank()) return literal(start, end)
        fun shield(value: String) = if (pipeReplacement == null) value else value.replace("|", pipeReplacement)
        if (first === last) {
            if (body.trim().let { it.length >= 2 && it.all { char -> char == '$' } }) return literal(start, end)
            return "$$\n$continuation${shield(body.trim())}\n$continuation$$"
        }
        // Multiline delimiters must occupy their own lines. Do not strip container prefixes
        // from TeX by string heuristics: the production block parser consumes them itself.
        val openerEnd = start + 2
        val closerStart = end - 2
        if (!source.substring(openerEnd, first.end - offset).isBlank() ||
            source.substring(last.content - offset, closerStart).isNotBlank()) return literal(start, end)
        if (selected.drop(1).dropLast(1).any { line ->
            source.substring(line.content - offset, line.end - offset).trim().let {
                it.length >= 2 && it.all { char -> char == '$' }
            }
        }) return literal(start, end)
        return "$$" + shield(source.substring(openerEnd, closerStart)) + "$$"
    }

    /** Escape Markdown punctuation only in content, never in the real container prefixes.
     * This is renderer input, not a network/copy/export rewrite. CommonMark removes escapes
     * and produces literal TeX text, rather than links, emphasis, HTML or default math nodes.
     */
    fun literal(start: Int, end: Int): String = buildString {
        var line = lineAt(start)
        var slashRunEnd = -1
        for (index in start until end) {
            if (line == null || offset + index >= line.end) line = lineAt(index)
            val char = source[index]
            if (char == '\\' && index >= slashRunEnd) {
                slashRunEnd = index + 1
                while (slashRunEnd < end && source[slashRunEnd] == '\\') slashRunEnd++
            }
            // Table separators already belong to the GFM block parser, not to this candidate.
            // Preserve their original escape parity; this does not add multiline-cell support.
            val tableSeparator = line?.block is TableBlock &&
                (char == '|' || (char == '\\' && source.getOrNull(slashRunEnd) == '|'))
            if (!tableSeparator && offset + index >= (line?.content ?: Int.MAX_VALUE) && char in punctuation) append('\\')
            append(char)
        }
    }
}
