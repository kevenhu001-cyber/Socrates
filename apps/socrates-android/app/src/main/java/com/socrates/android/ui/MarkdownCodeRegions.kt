package com.socrates.android.ui

import java.io.BufferedReader
import java.io.StringReader
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.Document
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.IndentedCodeBlock
import org.commonmark.node.Node
import org.commonmark.node.BlockQuote
import org.commonmark.node.ListItem
import org.commonmark.node.Paragraph
import org.commonmark.parser.Parser
import org.commonmark.parser.block.BlockStart
import org.commonmark.parser.block.ParserState

/** Source offsets, not a serializer or a second implementation of CommonMark containers.
 *
 * CommonMark 0.13 has no source spans. Its Reader entry point calls BufferedReader.readLine
 * once per physical line, then fully processes that line before requesting the next one.
 * A non-consuming factory retains the public ParserState; at that boundary we inspect the
 * actual active block. Offsets always come from the original string (including CR/LF/NUL),
 * never from CommonMark's prepared/de-indented text. Tests pin this dependency contract.
 *
 * This is a code-only pass: no LaTeX block factory or inline math normalization runs here.
 * GFM tables use the same block extension as production. Inline parsing is unnecessary.
 */
internal object MarkdownCodeRegions {
    data class Region(val start: Int, val end: Int)
    data class Line(val start: Int, val end: Int, val content: Int, val block: Node, val owner: Node?, val prefix: String)
    data class Analysis(val code: List<Region>, val rootFenceStarts: Set<Int>, val lines: List<Line> = emptyList(),
        val openings: Map<Node, Line> = emptyMap(), val explicitParagraphs: Set<Node> = emptySet())

    fun analyze(source: String): Analysis {
        if (source.isEmpty()) return Analysis(emptyList(), emptySet())
        val regions = mutableListOf<Region>()
        val rootFences = mutableSetOf<Int>()
        val lines = mutableListOf<Line>()
        val openings = mutableMapOf<Node, Line>()
        var state: ParserState? = null
        var previous: Node? = null
        var lineStart = 0
        var lineEnd = 0
        var cursor = 0
        var pendingLine = false
        fun recordLine() {
            if (!pendingLine) return
            pendingLine = false
            val currentState = state ?: return
            val block = currentState.activeBlockParser.block
            var ancestor: Node? = block
            while (ancestor != null && ancestor !is ListItem && ancestor !is BlockQuote) ancestor = ancestor.parent
            // Index follows the actual consumed container/block prefixes. Promotion below
            // is limited to Paragraphs; other blocks only use this for literal fallback.
            val content = (lineStart + currentState.index).coerceAtMost(lineEnd)
            val line = Line(lineStart, lineEnd, content, block, ancestor, source.substring(lineStart, content))
            lines += line
            if (ancestor != null && block is Paragraph) openings.putIfAbsent(ancestor, line)
            val fenced = block as? FencedCodeBlock
            // On a closing fence CommonMark has already popped the code parser. Its index
            // still points past the actual container prefixes, before the closing markers.
            val priorFence = previous as? FencedCodeBlock
            val closing = priorFence != null && block === priorFence.parent &&
                MarkdownFences.closes(currentState.line.subSequence(currentState.index, currentState.line.length).toString(),
                    MarkdownFences.Opening(priorFence.fenceChar, priorFence.fenceLength, priorFence.fenceIndent, ""))
            if (fenced != null || block is IndentedCodeBlock || closing) {
                val last = regions.lastOrNull()
                if (last?.end == lineStart) regions[regions.lastIndex] = Region(last.start, lineEnd)
                else regions += Region(lineStart, lineEnd)
            }
            if (fenced != null && fenced !== previous && fenced.parent is Document) rootFences += lineStart
            previous = block
        }
        val reader = object : BufferedReader(StringReader("")) {
            override fun readLine(): String? {
                recordLine()
                if (cursor >= source.length) return null
                lineStart = cursor
                while (cursor < source.length && source[cursor] != '\r' && source[cursor] != '\n') cursor++
                val textEnd = cursor
                if (cursor < source.length) {
                    if (source[cursor++] == '\r' && cursor < source.length && source[cursor] == '\n') cursor++
                }
                lineEnd = cursor
                pendingLine = true
                return source.substring(lineStart, textEnd)
            }
        }
        val parser = Parser.builder()
            .extensions(listOf(TablesExtension.create()))
            .customBlockParserFactory { parserState, _ ->
                state = parserState
                BlockStart.none()
            }
            .inlineParserFactory { org.commonmark.parser.InlineParser { _, _ -> } }
            .build()
        reader.use { parser.parseReader(it) }
        val explicitParagraphs = lines.filter { it.block is Paragraph }.groupBy { it.block }.filter { (block, paragraph) ->
            val opening = openings[paragraph.first().owner]
            val continuation = opening?.prefix?.map { if (it == '>') '>' else ' ' }?.joinToString("")
            // A later setext heading/table can replace the observed Paragraph. Detached
            // source observations must never be promoted. Lazy lines after a candidate also
            // need protection: math blocks do not inherit paragraph lazy continuation rules.
            block.parent != null && opening != null && opening.prefix.isNotEmpty() &&
                paragraph.all { it === opening || it.prefix == continuation }
        }.keys
        return Analysis(regions, rootFences, lines, openings, explicitParagraphs)
    }
}
