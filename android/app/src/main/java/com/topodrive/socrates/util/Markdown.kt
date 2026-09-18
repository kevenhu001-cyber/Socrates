package com.topodrive.socrates.util

/**
 * Lightweight markdown parser producing a block model the Compose renderer
 * walks — a subset of `frontend/src/chat/render/markdown.js` covering
 * headings, fenced code, lists (nested via indentation), quotes, tables,
 * horizontal rules, and paragraphs, plus inline spans.
 */
object Markdown {

    sealed interface Block {
        data class Heading(val level: Int, val spans: List<Inline>) : Block
        data class Code(val lang: String?, val code: String) : Block
        data class ListBlock(val ordered: Boolean, val items: List<ListItem>) : Block
        data class Quote(val blocks: List<Block>) : Block
        data class Table(val header: List<List<Inline>>, val rows: List<List<List<Inline>>>) : Block
        object Rule : Block
        data class Paragraph(val spans: List<Inline>) : Block
        /** Display-math block ($$…$$) — rendered as centred mono text. */
        data class Math(val tex: String) : Block
    }

    data class ListItem(val spans: List<Inline>, val children: List<Block> = emptyList(), val index: Int = 0)

    sealed interface Inline {
        data class Text(val text: String) : Inline
        data class Bold(val children: List<Inline>) : Inline
        data class Italic(val children: List<Inline>) : Inline
        data class Strike(val children: List<Inline>) : Inline
        data class Code(val text: String) : Inline
        data class Link(val text: String, val url: String) : Inline
        data class MathInline(val tex: String) : Inline
    }

    private val headingRe = Regex("^(#{1,6})\\s+(.*)$")
    private val fenceRe = Regex("^```(\\S*)\\s*$")
    private val ulRe = Regex("^(\\s*)[-*+]\\s+(.*)$")
    private val olRe = Regex("^(\\s*)\\d+[.)]\\s+(.*)$")
    private val quoteRe = Regex("^>\\s?(.*)$")
    private val hrRe = Regex("^(?:---|\\*\\*\\*|___)\\s*$")
    private val tableSepRe = Regex("^\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)+\\|?\\s*$")

    fun parse(md: String): List<Block> {
        val lines = md.replace("\r\n", "\n").split('\n')
        return parseLines(lines)
    }

    private fun parseLines(lines: List<String>): List<Block> {
        val blocks = mutableListOf<Block>()
        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            if (line.isBlank()) { i++; continue }

            // Fenced code
            val fenceMatch = fenceRe.find(line)
            if (fenceMatch != null) {
                val lang = fenceMatch.groupValues[1].ifBlank { null }
                val sb = StringBuilder()
                i++
                while (i < lines.size && !lines[i].startsWith("```")) {
                    sb.append(lines[i]).append('\n'); i++
                }
                i++ // closing fence
                blocks.add(Block.Code(lang, sb.toString().trimEnd('\n')))
                continue
            }

            // Heading
            val headMatch = headingRe.find(line)
            if (headMatch != null) {
                blocks.add(Block.Heading(headMatch.groupValues[1].length, inline(headMatch.groupValues[2])))
                i++
                continue
            }

            // HR
            if (hrRe.matches(line.trim())) { blocks.add(Block.Rule); i++; continue }

            // Display math $$…$$
            if (line.trim().startsWith("$$")) {
                val sb = StringBuilder()
                val first = line.trim().removePrefix("$$")
                if (first.endsWith("$$")) {
                    blocks.add(Block.Math(first.removeSuffix("$$"))); i++; continue
                }
                sb.append(first).append('\n'); i++
                while (i < lines.size && !lines[i].trim().endsWith("$$")) {
                    sb.append(lines[i]).append('\n'); i++
                }
                if (i < lines.size) sb.append(lines[i].trim().removeSuffix("$$"))
                i++
                blocks.add(Block.Math(sb.toString().trim()))
                continue
            }

            // Quote
            if (quoteRe.matches(line)) {
                val qlines = mutableListOf<String>()
                while (i < lines.size && quoteRe.matches(lines[i])) {
                    qlines.add(quoteRe.find(lines[i])!!.groupValues[1]); i++
                }
                blocks.add(Block.Quote(parseLines(qlines)))
                continue
            }

            // Table: header line, separator line, body lines
            if (line.contains('|') && i + 1 < lines.size && tableSepRe.matches(lines[i + 1])) {
                fun cells(l: String): List<List<Inline>> =
                    l.trim().trim('|').split('|').map { inline(it.trim()) }
                val header = cells(line)
                i += 2
                val rows = mutableListOf<List<List<Inline>>>()
                while (i < lines.size && lines[i].contains('|') && lines[i].isNotBlank()) {
                    rows.add(cells(lines[i])); i++
                }
                blocks.add(Block.Table(header, rows))
                continue
            }

            // List block (ul or ol, possibly multi-line; stop at blank line)
            if (ulRe.matches(line) || olRe.matches(line)) {
                val ordered = olRe.matches(line)
                val items = mutableListOf<ListItem>()
                var idx = 0
                while (i < lines.size) {
                    val l = lines[i]
                    val m = (if (ordered) olRe else ulRe).find(l) ?: break
                    idx++
                    val itemText = m.groupValues[2]
                    i++
                    // nested lines: deeper indentation
                    val nested = mutableListOf<String>()
                    while (i < lines.size && (ulRe.find(lines[i]) ?: olRe.find(lines[i])) != null) {
                        val indent = ((ulRe.find(lines[i]) ?: olRe.find(lines[i]))!!.groupValues[1].length)
                        if (indent > m.groupValues[1].length) {
                            nested.add(lines[i].trimStart()); i++
                        } else break
                    }
                    items.add(ListItem(inline(itemText), parseLines(nested), idx))
                }
                blocks.add(Block.ListBlock(ordered, items))
                continue
            }

            // Paragraph — accumulate until blank line or block start
            val para = StringBuilder()
            while (i < lines.size) {
                val l = lines[i]
                if (l.isBlank()) break
                if (para.isNotEmpty() && (fenceRe.matches(l) || headingRe.matches(l) || hrRe.matches(l.trim()) ||
                        quoteRe.matches(l) || ulRe.matches(l) || olRe.matches(l) || l.trim().startsWith("$$"))
                ) break
                if (para.isNotEmpty()) para.append('\n')
                para.append(l)
                i++
            }
            if (para.isNotBlank()) blocks.add(Block.Paragraph(inline(para.toString())))
        }
        return blocks
    }

    /* ── Inline ── */

    private val inlinePatterns = listOf(
        Regex("`([^`]+)`") to 0,                       // code
        Regex("\\*\\*([^*]+)\\*\\*") to 1,             // bold
        Regex("__([^_]+)__") to 1,
        Regex("~~([^~]+)~~") to 2,                     // strike
        Regex("\\*([^*\\n]+)\\*") to 3,                // italic
        Regex("_([^_\\n]+)_") to 3,
        Regex("\\[([^\\]]+)\\]\\(([^)]+)\\)") to 4,    // link
        Regex("\\$\\$?([^$]+)\\$\\$?") to 5,           // inline math
    )

    fun inline(text: String): List<Inline> {
        val out = mutableListOf<Inline>()
        var i = 0
        val s = text
        while (i < s.length) {
            var matched = false
            // find earliest match across patterns
            var best: MatchResult? = null
            var bestKind = -1
            for ((re, kind) in inlinePatterns) {
                val m = re.find(s, i) ?: continue
                if (best == null || m.range.first < best!!.range.first) {
                    best = m; bestKind = kind
                }
            }
            val m = best
            if (m == null) break
            if (m.range.first > i) out.add(Inline.Text(s.substring(i, m.range.first)))
            when (bestKind) {
                0 -> out.add(Inline.Code(m.groupValues[1]))
                1 -> out.add(Inline.Bold(inline(m.groupValues[1])))
                2 -> out.add(Inline.Strike(inline(m.groupValues[1])))
                3 -> out.add(Inline.Italic(inline(m.groupValues[1])))
                4 -> out.add(Inline.Link(m.groupValues[1], m.groupValues[2]))
                5 -> out.add(Inline.MathInline(m.groupValues[1].trim()))
            }
            i = m.range.last + 1
            matched = true
            if (!matched) i++
        }
        if (i < s.length) out.add(Inline.Text(s.substring(i)))
        return mergeText(out)
    }

    private fun mergeText(inl: List<Inline>): List<Inline> {
        val out = mutableListOf<Inline>()
        for (item in inl) {
            if (item is Inline.Text && out.lastOrNull() is Inline.Text) {
                out[out.size - 1] = Inline.Text((out.last() as Inline.Text).text + item.text)
            } else out.add(item)
        }
        return out
    }
}
