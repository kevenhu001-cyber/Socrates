package com.socrates.android.ui

internal enum class ToolSyntaxRole { KEYWORD, STRING, NUMBER, COMMENT, PROPERTY, LITERAL }
internal data class ToolSyntaxToken(val start: Int, val end: Int, val role: ToolSyntaxRole)

/** Conservative, bounded lexical coloring only. Source text is never evaluated. */
internal object ToolOutputSyntax {
    private const val MAX_LENGTH = ToolOutputText.PREVIEW_LIMIT
    private const val MAX_TOKENS = 1024
    private enum class Lang { JSON, PYTHON, JS }

    fun supports(preview: ToolOutputPreview): Boolean = language(preview) != null

    fun tokens(preview: ToolOutputPreview): List<ToolSyntaxToken> {
        val lang = language(preview) ?: return emptyList()
        val s = preview.text
        val out = ArrayList<ToolSyntaxToken>()
        var i = 0
        while (i < s.length) {
            val start = i
            val c = s[i]
            var role: ToolSyntaxRole? = null
            when {
                lang == Lang.PYTHON && c == '#' -> {
                    i = lineEnd(s, i)
                    role = ToolSyntaxRole.COMMENT
                }
                lang == Lang.JS && c == '/' && i + 1 < s.length && s[i + 1] == '/' -> {
                    i = lineEnd(s, i)
                    role = ToolSyntaxRole.COMMENT
                }
                lang == Lang.JS && c == '/' && i + 1 < s.length && s[i + 1] == '*' -> {
                    i = blockEnd(s, i)
                    role = ToolSyntaxRole.COMMENT
                }
                c == '"' || (lang != Lang.JSON && (c == '\'' || (lang == Lang.JS && c == '`'))) -> {
                    val quoted = quoted(s, i, c, lang == Lang.PYTHON)
                    i = quoted.end
                    if (quoted.closed) {
                        role = ToolSyntaxRole.STRING
                        if (lang == Lang.JSON) {
                            var p = i
                            while (p < s.length && s[p].isWhitespace()) p++
                            if (p < s.length && s[p] == ':') role = ToolSyntaxRole.PROPERTY
                        }
                    }
                }
                c in '0'..'9' || (c == '-' && i + 1 < s.length && s[i + 1] in '0'..'9') -> {
                    i = numberEnd(s, i, lang)
                    role = ToolSyntaxRole.NUMBER
                }
                isIdentStart(c) -> {
                    i = identifierEnd(s, i)
                    val word = s.substring(start, i)
                    role = when {
                        word in literals(lang) -> ToolSyntaxRole.LITERAL
                        word in keywords(lang) -> ToolSyntaxRole.KEYWORD
                        else -> null
                    }
                }
                else -> i++
            }
            if (role != null) {
                if (out.size >= MAX_TOKENS) return emptyList()
                out.add(ToolSyntaxToken(start, i, role))
            }
        }
        return out
    }

    private fun language(p: ToolOutputPreview): Lang? {
        if (p.truncated || p.text.length > MAX_LENGTH) return null
        if (p.kind == ToolOutputKind.JSON && p.language == null) return Lang.JSON
        if (p.kind != ToolOutputKind.CODE) return null
        return when (p.language?.lowercase()) {
            "json" -> Lang.JSON
            "python", "py" -> Lang.PYTHON
            "javascript", "js", "typescript", "ts" -> Lang.JS
            else -> null
        }
    }

    private fun keywords(lang: Lang): Set<String> = when (lang) {
        Lang.JSON -> emptySet()
        Lang.PYTHON -> PY_KEYWORDS
        Lang.JS -> JS_KEYWORDS
    }

    private fun literals(lang: Lang): Set<String> = when (lang) {
        Lang.JSON -> JSON_LITERALS
        Lang.PYTHON -> PY_LITERALS
        Lang.JS -> JS_LITERALS
    }

    private data class Quoted(val end: Int, val closed: Boolean)

    private fun quoted(s: String, start: Int, quote: Char, triples: Boolean): Quoted {
        val triple = triples && start + 2 < s.length && s[start + 1] == quote && s[start + 2] == quote
        val width = if (triple) 3 else 1
        var i = start + width
        while (i < s.length) {
            if (s[i] == '\\') {
                // Consume an escape atomically; do not restart scanning its contents.
                i = minOf(s.length, i + 2)
                continue
            }
            if (triple) {
                if (i + 2 < s.length && s[i] == quote && s[i + 1] == quote && s[i + 2] == quote) return Quoted(i + 3, true)
            } else if (s[i] == quote) return Quoted(i + 1, true)
            if (!triple && quote != '`' && (s[i] == '\n' || s[i] == '\r')) return Quoted(i, false)
            i++
        }
        return Quoted(s.length, false)
    }

    private fun lineEnd(s: String, start: Int): Int {
        var i = start
        while (i < s.length && s[i] != '\n' && s[i] != '\r') i++
        return i
    }

    private fun blockEnd(s: String, start: Int): Int {
        var i = start + 2
        while (i + 1 < s.length) {
            if (s[i] == '*' && s[i + 1] == '/') return i + 2
            i++
        }
        return s.length
    }

    private fun identifierEnd(s: String, start: Int): Int {
        var i = start + 1
        while (i < s.length && isIdentPart(s[i])) i++
        return i
    }

    private fun isIdentStart(c: Char) = c == '_' || c == '$' || c.isLetter()
    private fun isIdentPart(c: Char) = isIdentStart(c) || c.isDigit()

    private fun numberEnd(s: String, start: Int, lang: Lang): Int {
        var i = start
        if (s[i] == '-') i++
        if (lang != Lang.JSON && s[i] == '0' && i + 2 < s.length) {
            val base = when (s[i + 1]) {
                'x', 'X' -> 16
                'b', 'B' -> 2
                'o', 'O' -> 8
                else -> 0
            }
            if (base != 0 && digit(s[i + 2], base)) {
                i += 3
                while (i < s.length && (digit(s[i], base) || s[i] == '_')) i++
                return i
            }
        }
        if (lang == Lang.JSON && s[i] == '0') i++ else {
            while (i < s.length && (s[i] in '0'..'9' || (lang != Lang.JSON && s[i] == '_'))) i++
        }
        if (i + 1 < s.length && s[i] == '.' && s[i + 1] in '0'..'9') {
            i += 2
            while (i < s.length && (s[i] in '0'..'9' || (lang != Lang.JSON && s[i] == '_'))) i++
        }
        if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
            var p = i + 1
            if (p < s.length && (s[p] == '+' || s[p] == '-')) p++
            if (p < s.length && s[p] in '0'..'9') {
                i = p + 1
                while (i < s.length && s[i] in '0'..'9') i++
            }
        }
        return i
    }

    private fun digit(c: Char, base: Int): Boolean = when (base) {
        16 -> c in '0'..'9' || c in 'a'..'f' || c in 'A'..'F'
        8 -> c in '0'..'7'
        else -> c == '0' || c == '1'
    }

    private val JSON_LITERALS = setOf("true", "false", "null")
    private val PY_LITERALS = setOf("True", "False", "None")
    private val JS_LITERALS = setOf("true", "false", "null", "undefined")
    private val PY_KEYWORDS = setOf("and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield")
    private val JS_KEYWORDS = setOf("async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "export", "extends", "finally", "for", "from", "function", "if", "import", "in", "instanceof", "let", "new", "of", "return", "static", "super", "switch", "this", "throw", "try", "typeof", "var", "void", "while", "with", "yield", "interface", "type", "enum", "implements", "private", "protected", "public", "readonly", "declare", "as", "satisfies")
}
