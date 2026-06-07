package com.socrates.app.ui.common

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import com.socrates.app.util.Log
import io.noties.markwon.Markwon

/**
 * Tiny, dependency-free Markdown renderer. We don't pull in a markdown
 * library to keep the APK small; the assistant emits a constrained
 * subset (headings, bold, italic, inline code, fenced code, LaTeX
 * spans preserved as-is) and our renderer handles the common cases.
 *
 * If we need full CommonMark + tables later, swap in `io.noties.markwon`.
 */
@Composable
fun MarkdownText(
    raw: String,
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.onSurface
) {
    val text = remember(raw) { renderMarkdown(raw) }
    Text(
        text = text,
        modifier = modifier,
        style = LocalTextStyle.current.copy(color = color)
    )
}

private fun renderMarkdown(src: String): AnnotatedString = buildAnnotatedString {
    val lines = src.split("\n")
    var inFence = false
    val fence = "```"
    lines.forEachIndexed { i, line ->
        if (line.trimStart().startsWith(fence)) {
            inFence = !inFence
            append("\n")
            return@forEachIndexed
        }
        if (inFence) {
            withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Color(0x14000000))) {
                append(line)
            }
            append("\n")
            return@forEachIndexed
        }
        renderInline(line)
        if (i != lines.size - 1) append("\n")
    }
}

private fun androidx.compose.ui.text.AnnotatedString.Builder.renderInline(line: String) {
    var i = 0
    val n = line.length
    while (i < n) {
        val ch = line[i]
        when {
            ch == '`' -> {
                val end = line.indexOf('`', i + 1)
                if (end > i) {
                    withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Color(0x14000000))) {
                        append(line.substring(i + 1, end))
                    }
                    i = end + 1
                } else {
                    append(ch); i++
                }
            }
            ch == '*' && i + 1 < n && line[i + 1] == '*' -> {
                val end = line.indexOf("**", i + 2)
                if (end > i) {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(line.substring(i + 2, end)) }
                    i = end + 2
                } else {
                    append(ch); i++
                }
            }
            ch == '*' -> {
                val end = line.indexOf('*', i + 1)
                if (end > i) {
                    withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(line.substring(i + 1, end)) }
                    i = end + 1
                } else { append(ch); i++ }
            }
            ch == '<' && line.startsWith("$$", i).not() && line.startsWith("$$$", i).not() -> {
                // Skip XML-ish assistant tags (e.g. <quiz>, <example>)
                val close = line.indexOf('>', i + 1)
                if (close > i) {
                    // Render as muted inline text
                    withStyle(SpanStyle(color = Color(0x80000000))) { append(line.substring(i, close + 1)) }
                    i = close + 1
                } else { append(ch); i++ }
            }
            ch == '$' -> {
                val end = line.indexOf('$', i + 1)
                if (end > i) {
                    withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) { append(line.substring(i, end + 1)) }
                    i = end + 1
                } else { append(ch); i++ }
            }
            else -> {
                append(ch); i++
            }
        }
    }
}
