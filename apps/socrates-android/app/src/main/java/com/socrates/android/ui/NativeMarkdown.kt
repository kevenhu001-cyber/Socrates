package com.socrates.android.ui

import android.text.Spanned
import android.graphics.Typeface
import android.text.method.LinkMovementMethod
import android.util.TypedValue
import android.widget.TextView
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import io.noties.markwon.AbstractMarkwonPlugin
import io.noties.markwon.Markwon
import io.noties.markwon.MarkwonConfiguration
import io.noties.markwon.core.MarkwonTheme
import io.noties.markwon.ext.latex.JLatexMathPlugin
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tables.TablePlugin
import io.noties.markwon.ext.tasklist.TaskListPlugin
import io.noties.markwon.inlineparser.MarkwonInlineParserPlugin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors

// Bounded, process-wide pool: a long transcript must not create a thread pool per bubble.
private val mathExecutor = Executors.newFixedThreadPool(2)
private data class RenderPart(val source: String, val language: String? = null)

private fun renderParts(source: String): List<RenderPart> {
    val result = mutableListOf<RenderPart>()
    val prose = StringBuilder()
    val code = StringBuilder()
    var fence: String? = null
    var language = ""
    fun flush() { if (prose.isNotBlank()) result += RenderPart(prose.toString().trimEnd()); prose.clear() }
    source.lines().forEach { line ->
        val value = line.trimStart()
        val active = fence
        if (active == null && (value.startsWith("```") || value.startsWith("~~~"))) {
            flush()
            val char = value[0]
            fence = value.takeWhile { it == char }
            language = value.drop(fence!!.length).trim()
        } else if (active != null && value.startsWith(active) && value.dropWhile { it == active[0] }.isBlank()) {
            result += RenderPart(code.toString().trimEnd('\n'), language); code.clear(); fence = null
        } else if (active != null) code.appendLine(line) else prose.appendLine(line)
    }
    if (fence != null) result += RenderPart(code.toString().trimEnd('\n'), language)
    flush()
    return result
}

/** Native TextView spans, not a WebView. No HTML or JavaScript execution; bounded public HTTPS/data images only. */
@Composable
fun NativeMarkdown(text: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val textPx = with(density) { 17.sp.toPx() }
    val markwon = remember(context, textPx) {
        Markwon.builder(context)
            .usePlugin(MarkwonInlineParserPlugin.create())
            .usePlugin(JLatexMathPlugin.create(textPx, textPx * 1.16f) { builder ->
                builder.inlinesEnabled(true).executorService(mathExecutor)
            })
            .usePlugin(MarkdownImagesPlugin.create(context))
            .usePlugin(TablePlugin.create(context))
            .usePlugin(StrikethroughPlugin.create())
            .usePlugin(TaskListPlugin.create(context))
            .usePlugin(object : AbstractMarkwonPlugin() {
                override fun configureConfiguration(builder: MarkwonConfiguration.Builder) {
                    builder.linkResolver { view, link ->
                        val uri = android.net.Uri.parse(link)
                        if (uri.scheme?.lowercase() in setOf("http", "https", "mailto")) {
                            runCatching { view.context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri)) }
                                .onFailure { android.widget.Toast.makeText(view.context, "设备没有可打开此链接的应用。", android.widget.Toast.LENGTH_SHORT).show() }
                        } else android.widget.Toast.makeText(view.context, "不支持打开此类型的链接。", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }
                override fun configureTheme(builder: MarkwonTheme.Builder) {
                    builder.headingTextSizeMultipliers(floatArrayOf(1.30f, 1.22f, 1.12f, 1.06f, 1f, 1f))
                        .headingBreakHeight(0)
                        .blockMargin(with(density) { 20.dp.roundToPx() })
                        .bulletWidth(with(density) { 4.dp.roundToPx() })
                        .codeTextColor(0xFF434343.toInt())
                        .codeBackgroundColor(0xFFF0F0F0.toInt())
                        .linkColor(0xFF2855C7.toInt())
                        .isLinkUnderlined(false)
                }
            }).build()
    }
    val parts = remember(text) { renderParts(text) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(18.dp)) {
        parts.forEach { part ->
            if (part.language != null) CodePanel(part.source, part.language)
            else {
                val normalized = remember(part.source) { MarkdownSource.normalize(part.source) }
                // CommonMark parsing runs off the main thread; obsolete streaming work is cancelled.
                val rendered by produceState<Spanned?>(null, normalized, markwon) {
                    value = withContext(Dispatchers.Default) { markwon.toMarkdown(normalized) }
                }
                AndroidView(
                    factory = { ctx -> TextView(ctx).apply {
                        setTextColor(0xFF101010.toInt())
                        setTextSize(TypedValue.COMPLEX_UNIT_PX, textPx)
                        typeface = Typeface.create("sans-serif", Typeface.NORMAL)
                        includeFontPadding = false
                        setLineSpacing(with(density) { 7.sp.toPx() }, 1f)
                        setTextIsSelectable(true)
                        movementMethod = LinkMovementMethod.getInstance()
                        // Avoid restoring a stale selection into a later, streamed version.
                        isSaveEnabled = false
                    } },
                    update = { view -> rendered?.let { if (view.tag !== it) { markwon.setParsedMarkdown(view, it); view.tag = it } } },
                    modifier = Modifier.fillMaxWidth().semantics { this.text = AnnotatedString(part.source) }
                )
            }
        }
    }
}

@Composable
private fun CodePanel(source: String, language: String) {
    val clipboard = LocalClipboardManager.current
    Column(Modifier.fillMaxWidth().background(Color(0xFFF5F5F5), RoundedCornerShape(16.dp))) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(language.ifBlank { "代码" }, Modifier.weight(1f), fontSize = 12.sp, color = Color.Gray)
            SocratesIconButton(onClick = { clipboard.setText(AnnotatedString(source)) }) { ReferenceIcon(ReferenceGlyph.Copy, "复制代码", Modifier.size(16.dp), Color.Gray) }
        }
        SelectionContainer {
            Text(source, Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 16.dp), fontFamily = FontFamily.Monospace, fontSize = 14.sp, lineHeight = 22.sp, color = Color(0xFF252525))
        }
    }
}
