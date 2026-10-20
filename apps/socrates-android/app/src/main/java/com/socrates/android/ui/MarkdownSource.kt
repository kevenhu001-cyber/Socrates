package com.socrates.android.ui

/** Markwon uses $$ for inline math; accept the delimiters returned by our models too.
 * Code is opaque, and incomplete streaming delimiters stay literal until closed.
 */
internal object MarkdownSource {
    fun normalize(source: String): String {
        val out = StringBuilder()
        var i = 0
        while (i < source.length) {
            if (source[i] == '`' || (source[i] == '~' && source.startsWith("~~~", i))) {
                val c = source[i]
                var n = 1
                while (i + n < source.length && source[i + n] == c) n++
                val marker = c.toString().repeat(n)
                val end = source.indexOf(marker, i + n)
                if (end < 0) { out.append(source.substring(i)); break }
                out.append(source.substring(i, end + n)); i = end + n; continue
            }
            if (source.startsWith("\\(", i) || source.startsWith("\\[", i)) {
                val display = source[i + 1] == '['
                val end = source.indexOf(if (display) "\\]" else "\\)", i + 2)
                if (end >= 0) {
                    val body = source.substring(i + 2, end)
                    out.append(if (display) "\n\n$$\n${body.trim()}\n$$\n\n" else "$$$body$$")
                    i = end + 2; continue
                }
            }
            if (source[i] == '\\' && i + 1 < source.length) {
                out.append(source.substring(i, i + 2)); i += 2; continue
            }
            if (source.startsWith("$$", i)) {
                val end = source.indexOf("$$", i + 2)
                if (end >= 0) {
                    out.append("\n\n$$\n${source.substring(i + 2, end).trim()}\n$$\n\n")
                    i = end + 2; continue
                }
                out.append(source.substring(i)); break
            }
            if (source[i] == '$') {
                var end = i + 1
                while (end < source.length && source[end] != '\n') {
                    if (source[end] == '\\') { end += 2; continue }
                    if (source[end] == '$') break
                    end++
                }
                if (end < source.length && source[end] == '$') {
                    val body = source.substring(i + 1, end)
                    // Do not treat ordinary prices such as "$5 and $10" as a formula.
                    if (body.isNotEmpty() && !body.first().isWhitespace() && !body.last().isWhitespace()) {
                        out.append("$$$body$$"); i = end + 1; continue
                    }
                }
            }
            out.append(source[i++])
        }
        return out.toString()
    }
}
