package com.socrates.android.ui

/** Adapt model delimiters to Markwon's $$ inline syntax without inventing missing TeX.
 * Explicit delimiters express intent; single dollars additionally need math evidence.
 * Code is opaque. Streaming may separate an explicit unfinished tail for literal native display;
 * final normalization never invents missing delimiters or TeX.
 */
internal object MarkdownSource {
    data class Preview(val markdown: String, val pendingMath: String? = null)

    private val compactChars = Regex("""^[\w\\{}^_()\[\],.'"+\-*/|=<>!:;，；：、]+$""")
    private val spacedChars = Regex("""^[A-Za-z0-9\s\\{}^_()\[\],.'"+\-*/|=<>!:;，；：、]+$""")
    private val functionStart = Regex("^[A-Za-z][A-Za-z0-9]{0,3}\\(")
    private val operators = Regex("^[=+\\-*/|<>]+$")
    private val numericChars = Regex("""^[0-9\s.,+\-*/^_=<>()\[\]{}|!%:×÷±∓≤≥≠≈∞√°′″·−]+$""")
    private val numericBadEdge = Regex("""^[*/^_=<>,:+]|[+\-*/^_=<>,:−]$""")
    private val letter = Regex("[A-Za-z]")
    private val texSyntax = Regex("""[\\^_{}\[\]]""")
    private val mathOperator = Regex("[=+\\-×÷≤≥≠→←⇒⇔∫∑∏∂√∞∈∉⊂⊃±∓]")

    private fun compactToken(value: String): Boolean {
        if (!compactChars.matches(value)) return false
        return value.any { it !in 'A'..'Z' && it !in 'a'..'z' } ||
            value.length == 1 || value.all { it in 'A'..'Z' } ||
            (value.first() in 'A'..'Z' && value.any { it in 'a'..'z' })
    }

    /** Mirrors the Web closed-dollar policy, including numeric formulas but not $5-$10. */
    private fun isInlineMath(body: String, next: Char?): Boolean {
        if (body.isEmpty() || body.first().isWhitespace() || body.last().isWhitespace()) return false
        if (texSyntax.containsMatchIn(body)) return true
        if (letter.containsMatchIn(body)) {
            if (mathOperator.containsMatchIn(body)) return true
            if (body.none { it.isWhitespace() }) return compactToken(body)
            if (functionStart.containsMatchIn(body) && spacedChars.matches(body) && ')' in body) return true
            val words = body.split(Regex("\\s+"))
            return words.all(::compactToken) && words.withIndex().any { (index, word) ->
                operators.matches(word) || (index < words.lastIndex && word.last() in ",;，；：、:")
            }
        }
        return next !in '0'..'9' && body.any { it in '0'..'9' } &&
            numericChars.matches(body) && !numericBadEdge.containsMatchIn(body)
    }

    fun normalize(source: String): String = preview(source, streaming = false).markdown

    fun preview(source: String, streaming: Boolean, mathPipeReplacement: String? = null): Preview {
        val analysis = MarkdownCodeRegions.analyze(source)
        val boundaries = sortedSetOf(0, source.length)
        analysis.code.forEach { boundaries += it.start; boundaries += it.end }
        var previousOwner: org.commonmark.node.Node? = null
        analysis.lines.forEach { line ->
            if (line.owner !== previousOwner) boundaries += line.start
            previousOwner = line.owner
        }
        val out = StringBuilder(source.length)
        var pending: String? = null
        var codeIndex = 0
        var lineIndex = 0
        val cuts = boundaries.toList()
        for (index in 0 until cuts.lastIndex) {
            val start = cuts[index]
            val end = cuts[index + 1]
            while (codeIndex < analysis.code.size && analysis.code[codeIndex].end <= start) codeIndex++
            if (analysis.code.getOrNull(codeIndex)?.let { start >= it.start && start < it.end } == true) {
                out.append(source, start, end)
                continue
            }
            while (lineIndex < analysis.lines.size && analysis.lines[lineIndex].end <= start) lineIndex++
            val text = source.substring(start, end)
            val container = if (analysis.lines.getOrNull(lineIndex)?.owner != null)
                MarkdownContainerMath(text, start, analysis.lines, analysis.openings, analysis.explicitParagraphs) else null
            // Neither math nor code spans may borrow a closer across code/container ownership.
            val result = previewProse(text, streaming && end == source.length, mathPipeReplacement, container)
            out.append(result.markdown)
            pending = result.pendingMath
        }
        return Preview(out.toString(), pending)
    }

    private fun previewProse(source: String, streaming: Boolean, mathPipeReplacement: String?, container: MarkdownContainerMath? = null): Preview {
        val out = StringBuilder(source.length)
        fun math(body: String, display: Boolean) {
            appendMath(out, if (mathPipeReplacement == null) body else body.replace("|", mathPipeReplacement), display)
        }
        // Exact-length backtick runs: a single tick inside a double-tick code span cannot close it.
        // Index once rather than rescanning the remaining transcript for every unmatched opener.
        val nextTicks = mutableMapOf<Int, Int>()
        val lastRun = mutableMapOf<Int, Int>()
        var cursor = source.length - 1
        while (cursor >= 0) {
            if (source[cursor] != '`') { cursor--; continue }
            val end = cursor + 1
            while (cursor >= 0 && source[cursor] == '`') cursor--
            val start = cursor + 1
            val length = end - start
            lastRun.put(length, start)?.let { nextTicks[start] = it }
        }
        // Once a closer is absent from a suffix, it is also absent from every later suffix.
        val missingClosers = mutableSetOf<String>()
        fun closer(start: Int, marker: String): Int {
            if (marker in missingClosers) return -1
            val end = findCloser(source, start, marker)
            if (end < 0) missingClosers += marker
            return end
        }
        var i = 0
        while (i < source.length) {
            // Block code was isolated by CommonMark, before this inline/math-only scanner.
            if (source[i] == '`') {
                val end = nextTicks[i]
                if (end != null) {
                    var closeEnd = end
                    while (closeEnd < source.length && source[closeEnd] == '`') closeEnd++
                    out.append(source, i, closeEnd)
                    i = closeEnd
                    continue
                }
                // While tokens can still arrive this may grow into code: do not mark math inside it.
                if (streaming) {
                    out.append(source, i, source.length)
                    break
                }
                // An unmatched run is literal CommonMark, not an opaque tail.
                do { out.append(source[i++]) } while (i < source.length && source[i] == '`')
                continue
            }
            if (source.startsWith("\\(", i) || source.startsWith("\\[", i)) {
                val display = source[i + 1] == '['
                val end = closer(i + 2, if (display) "\\]" else "\\)")
                if (end >= 0) {
                    val body = source.substring(i + 2, end)
                    if (body.isNotBlank()) {
                        if (display && container != null) out.append(container.display(i, end + 2, body, mathPipeReplacement))
                        else math(body, display)
                        i = end + 2
                        continue
                    }
                }
                if (display && container != null) {
                    val stop = if (end >= 0) end + 2 else source.length
                    out.append(container.literal(i, stop))
                    i = stop
                    continue
                }
                if (streaming && end < 0) return Preview(out.toString(), source.substring(i))
            }
            if (source[i] == '\\' && i + 1 < source.length) {
                out.append(source, i, i + 2)
                i += 2
                continue
            }
            if (source.startsWith("$$", i)) {
                val end = closer(i + 2, "$$")
                if (container != null) {
                    val stop = if (end >= 0) end + 2 else source.length
                    if (end >= 0) out.append(container.display(i, stop, source.substring(i + 2, end), mathPipeReplacement))
                    else out.append(container.literal(i, stop))
                    i = stop
                    continue
                }
                if (end >= 0) {
                    val body = source.substring(i + 2, end)
                    if (body.isNotBlank()) math(body, true)
                    else out.append(source, i, end + 2)
                    i = end + 2
                    continue
                }
                if (streaming) return Preview(out.toString(), source.substring(i))
                out.append(source, i, source.length)
                break
            }
            if (source[i] == '$') {
                var end = i + 1
                while (end < source.length && source[end] != '\n') {
                    // A price/literal dollar cannot borrow a later explicit formula's TeX
                    // as evidence for itself. Let the outer scanner handle that opener.
                    if (source.startsWith("\\(", end) || source.startsWith("\\[", end)) break
                    if (source[end] == '\\' && end + 1 < source.length) { end += 2; continue }
                    if (source[end] == '$' || source[end] == '`') break
                    end++
                }
                if (end < source.length && source[end] == '$' && !source.startsWith("$$", end)) {
                    val body = source.substring(i + 1, end)
                    if (isInlineMath(body, source.getOrNull(end + 1))) {
                        math(body, false)
                        i = end + 1
                        continue
                    }
                }
                // A rejected currency candidate must not consume the next formula's opener.
            }
            out.append(source[i++])
        }
        return Preview(out.toString())
    }

    private fun appendMath(out: StringBuilder, body: String, display: Boolean) {
        if (display) out.append("\n\n$$\n").append(body.trim()).append("\n$$\n\n")
        else out.append("$$").append(body).append("$$")
    }

    private fun findCloser(source: String, start: Int, marker: String): Int {
        var i = start
        while (i < source.length) {
            if (source.startsWith(marker, i)) return i
            if (source[i] == '\\' && i + 1 < source.length) i += 2 else i++
        }
        return -1
    }
}
