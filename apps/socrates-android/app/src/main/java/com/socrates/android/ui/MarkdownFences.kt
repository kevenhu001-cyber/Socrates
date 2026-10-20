package com.socrates.android.ui

/** Line-level fenced-code rules shared by math protection and the native code panels.
 * This is not a replacement for CommonMark's list/blockquote/container parser.
 */
internal object MarkdownFences {
    data class Opening(val marker: Char, val length: Int, val indent: Int, val info: String)
    data class Part(val source: String, val language: String? = null)
    data class Block(val end: Int, val content: String, val opening: Opening)

    fun opening(line: String): Opening? {
        val indent = line.takeWhile { it == ' ' }.length
        if (indent > 3 || indent == line.length) return null
        val marker = line[indent]
        if (marker != '`' && marker != '~') return null
        var end = indent
        while (end < line.length && line[end] == marker) end++
        if (end - indent < 3) return null
        val info = line.substring(end)
        if (marker == '`' && '`' in info) return null
        return Opening(marker, end - indent, indent, info.trim())
    }

    fun closes(line: String, opening: Opening): Boolean {
        val indent = line.takeWhile { it == ' ' }.length
        if (indent > 3) return false
        var end = indent
        while (end < line.length && line[end] == opening.marker) end++
        return end - indent >= opening.length && line.substring(end).all { it == ' ' || it == '\t' }
    }

    private data class Line(val textEnd: Int, val end: Int)

    private fun lineAt(source: String, start: Int): Line {
        var end = start
        while (end < source.length && source[end] != '\r' && source[end] != '\n') end++
        val textEnd = end
        if (end < source.length) {
            if (source[end++] == '\r' && end < source.length && source[end] == '\n') end++
        }
        return Line(textEnd, end)
    }

    /** start must be a physical line start. No end delimiter or newline is fabricated. */
    fun blockAt(source: String, start: Int): Block? {
        val first = lineAt(source, start)
        val opening = opening(source.substring(start, first.textEnd)) ?: return null
        val code = StringBuilder()
        var cursor = first.end
        while (cursor < source.length) {
            val line = lineAt(source, cursor)
            val text = source.substring(cursor, line.textEnd)
            if (closes(text, opening)) return Block(line.end, code.toString(), opening)
            code.append(removeIndent(text, opening.indent))
            code.append(source, line.textEnd, line.end)
            cursor = line.end
        }
        return Block(source.length, code.toString(), opening)
    }

    private fun removeIndent(line: String, indent: Int): String {
        var index = 0
        // Fenced code removes up to N leading spaces, not indentation columns: tabs stay literal.
        while (index < line.length && index < indent && line[index] == ' ') index++
        return line.substring(index)
    }

    fun parts(source: String): List<Part> {
        val parts = mutableListOf<Part>()
        var proseStart = 0
        var cursor = 0
        val rootFenceStarts = MarkdownCodeRegions.analyze(source).rootFenceStarts
        while (cursor < source.length) {
            // A physical closing fence in a list must not become a new root code panel.
            // Containers and indented code remain intact for the real AST renderer.
            val block = if (cursor in rootFenceStarts) blockAt(source, cursor) else null
            if (block == null) {
                cursor = lineAt(source, cursor).end
            } else {
                val prose = source.substring(proseStart, cursor)
                if (prose.isNotEmpty()) parts += Part(prose)
                parts += Part(block.content, block.opening.info)
                cursor = block.end
                proseStart = cursor
            }
        }
        val prose = source.substring(proseStart)
        if (prose.isNotEmpty()) parts += Part(prose)
        return parts
    }
}
