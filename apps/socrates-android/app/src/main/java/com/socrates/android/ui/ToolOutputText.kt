package com.socrates.android.ui

internal enum class ToolOutputKind { PLAIN, CODE, JSON }

internal data class ToolOutputPreview(
    val text: String,
    val kind: ToolOutputKind = ToolOutputKind.PLAIN,
    val language: String? = null,
    val truncated: Boolean = false
)

internal object ToolOutputText {
    const val PREVIEW_LIMIT = 6000
    const val PAGE_SIZE = 6000
    const val COPY_LIMIT = 60000

    fun preview(raw: String, format: Boolean = true): ToolOutputPreview {
        val cut = safeEnd(raw, PREVIEW_LIMIT)
        val wasTruncated = cut < raw.length
        val sample = raw.substring(0, cut)
        if (wasTruncated || !format) return ToolOutputPreview(sample, truncated = wasTruncated)

        val fence = FENCE.matchEntire(raw)
        if (fence != null) {
            val language = fence.groupValues[1].takeIf { it.isNotEmpty() && it.length <= 32 && it.all(::safeLanguageChar) }
            return ToolOutputPreview(fence.groupValues[2], ToolOutputKind.CODE, language)
        }
        if (raw.length <= PREVIEW_LIMIT) {
            val formatted = StrictJson.pretty(raw)
            if (formatted != null && formatted.length <= PREVIEW_LIMIT) return ToolOutputPreview(formatted, ToolOutputKind.JSON)
        }
        return ToolOutputPreview(raw)
    }

    fun pageCount(raw: String): Int {
        if (raw.isEmpty()) return 1
        return (raw.length - 1) / PAGE_SIZE + 1
    }

    fun page(raw: String, index: Int): String {
        if (raw.isEmpty()) return ""
        val selected = index.coerceIn(0, pageCount(raw) - 1)
        // Fixed boundaries permit O(1) random access without scanning or splitting the source.
        // Move a boundary back one unit if necessary; adjacent pages use that same boundary.
        val start = safeEnd(raw, (selected.toLong() * PAGE_SIZE).coerceAtMost(raw.length.toLong()).toInt())
        val end = safeEnd(raw, ((selected.toLong() + 1) * PAGE_SIZE).coerceAtMost(raw.length.toLong()).toInt())
        return raw.substring(start, end)
    }

    private fun safeLanguageChar(c: Char) = c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || c == '_' || c == '+' || c == '-'

    private fun safeEnd(s: String, limit: Int): Int = safeEndFrom(s, 0, limit)
    private fun safeEndFrom(s: String, start: Int, size: Int): Int {
        var end = minOf(s.length, start + size)
        if (end > start && end < s.length && Character.isHighSurrogate(s[end - 1]) && Character.isLowSurrogate(s[end])) end--
        return end
    }

    private val FENCE = Regex("^```([a-zA-Z0-9_+-]*)[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n?```[ \\t]*$")

    /** Bounded recursive-descent parser: recursion is capped before descending, tokens preserve source spelling. */
    private object StrictJson {
        fun pretty(source: String): String? {
            val trimmedStart = source.indexOfFirst { !it.isWhitespace() }
            if (trimmedStart < 0 || (source[trimmedStart] != '{' && source[trimmedStart] != '[')) return null
            return try {
                val parser = Parser(source)
                parser.value(0)
                parser.ws()
                if (!parser.done()) null else parser.result()
            } catch (_: Invalid) { null } catch (_: TooLarge) { null }
        }
        private class Invalid : RuntimeException()
        private class TooLarge : RuntimeException()
        private class Parser(private val s: String) {
            private var i = 0
            private val out = StringBuilder()
            fun done() = i == s.length
            fun result() = out.toString()
            fun ws() { while (i < s.length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r' || s[i] == '\n')) i++ }
            private fun append(text: String) { if (out.length + text.length > PREVIEW_LIMIT) throw TooLarge(); out.append(text) }
            fun value(depth: Int) {
                ws()
                if (i >= s.length) {
                    throw Invalid()
                }
                when (s[i]) {
                    '{' -> obj(depth)
                    '[' -> array(depth)
                    '"' -> stringToken()
                    't' -> literal("true")
                    'f' -> literal("false")
                    'n' -> literal("null")
                    '-', in '0'..'9' -> number()
                    else -> throw Invalid()
                }
            }
            private fun descend(depth: Int) { if (depth >= 64) throw Invalid() }
            private fun obj(depth: Int) {
                descend(depth); i++; ws(); append("{")
                if (take('}')) { append("}"); return }
                append("\n")
                while (true) {
                    ws(); if (i >= s.length || s[i] != '"') throw Invalid()
                    indent(depth + 1); stringToken(); ws(); require(':'); append(": ")
                    value(depth + 1); ws()
                    if (take('}')) { append("\n"); indent(depth); append("}"); return }
                    require(','); append(",\n")
                }
            }
            private fun array(depth: Int) {
                descend(depth); i++; ws(); append("[")
                if (take(']')) { append("]"); return }
                append("\n")
                while (true) {
                    indent(depth + 1); value(depth + 1); ws()
                    if (take(']')) { append("\n"); indent(depth); append("]"); return }
                    require(','); append(",\n")
                }
            }
            private fun indent(depth: Int) { repeat(depth * 2) { append(" ") } }
            private fun take(c: Char): Boolean { if (i < s.length && s[i] == c) { i++; return true }; return false }
            private fun require(c: Char) { if (!take(c)) throw Invalid() }
            private fun literal(text: String) { if (!s.startsWith(text, i)) throw Invalid(); i += text.length; append(text) }
            private fun stringToken() {
                val start = i++; var closed = false
                while (i < s.length) {
                    val c = s[i++]
                    when {
                        c == '"' -> { closed = true; break }
                        c == '\\' -> {
                            if (i >= s.length) throw Invalid()
                            val e = s[i++]
                            if (e == 'u') { repeat(4) { if (i >= s.length || !(s[i] in '0'..'9' || s[i] in 'a'..'f' || s[i] in 'A'..'F')) throw Invalid(); i++ } }
                            else if (e !in "\"\\/bfnrt") throw Invalid()
                        }
                        c < ' ' -> throw Invalid()
                    }
                }
                if (!closed) throw Invalid()
                append(s.substring(start, i))
            }
            private fun number() {
                val start = i
                take('-')
                if (take('0')) { if (i < s.length && s[i] in '0'..'9') throw Invalid() }
                else { if (i >= s.length || s[i] !in '1'..'9') throw Invalid(); while (i < s.length && s[i] in '0'..'9') i++ }
                if (take('.')) { if (i >= s.length || s[i] !in '0'..'9') throw Invalid(); while (i < s.length && s[i] in '0'..'9') i++ }
                if (take('e') || take('E')) { if (!take('+')) take('-'); if (i >= s.length || s[i] !in '0'..'9') throw Invalid(); while (i < s.length && s[i] in '0'..'9') i++ }
                append(s.substring(start, i))
            }
        }
    }
}
