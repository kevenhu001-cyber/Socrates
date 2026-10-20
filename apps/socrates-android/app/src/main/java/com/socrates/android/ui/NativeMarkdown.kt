package com.socrates.android.ui

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
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.noties.markwon.AbstractMarkwonPlugin
import io.noties.markwon.Markwon
import io.noties.markwon.MarkwonConfiguration
import io.noties.markwon.SoftBreakAddsNewLinePlugin
import io.noties.markwon.core.MarkwonTheme
import io.noties.markwon.ext.latex.JLatexMathPlugin
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tables.TablePlugin
import io.noties.markwon.ext.tasklist.TaskListPlugin
import io.noties.markwon.inlineparser.MarkwonInlineParserPlugin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors

// Bounded, process-wide pool: a long transcript must not create a thread pool per bubble.
private val mathExecutor = Executors.newFixedThreadPool(2)

private data class PreparedMarkdownPart(
    val part: MarkdownFences.Part,
    val preview: MarkdownSource.Preview,
    val pipeToken: String,
)

private data class PreparedMarkdown(
    val source: String,
    val streaming: Boolean,
    val parts: List<PreparedMarkdownPart>,
)

/** Native TextView spans, not a WebView. No HTML or JavaScript execution; bounded public HTTPS/data images only. */
@Composable
fun NativeMarkdown(text: String, modifier: Modifier = Modifier, streaming: Boolean = false) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val textPx = with(density) { 17.sp.toPx() }
    val markwon = remember(context, textPx) {
        Markwon.builder(context)
            // Registered before JLatexMathPlugin adds its general-purpose $$ processor.
            .usePlugin(MarkwonInlineParserPlugin.create {
                it.addInlineProcessor(MarkdownTableMath()).addInlineProcessor(MarkdownProseMath())
            })
            .usePlugin(JLatexMathPlugin.create(textPx, textPx * 1.16f) { builder ->
                builder.inlinesEnabled(true).executorService(mathExecutor)
            })
            .usePlugin(MarkdownImagesPlugin.create(context))
            .usePlugin(TablePlugin.create { theme ->
                // Unsupported/depth-limited subtrees retain the native span fallback, without zebra fills.
                theme.tableBorderColor(NativeReadingColors.borderSubtle).tableBorderWidth(1)
                    .tableCellPadding(with(density) { 8.dp.roundToPx() })
                    .tableHeaderRowBackgroundColor(android.graphics.Color.TRANSPARENT)
                    .tableOddRowBackgroundColor(android.graphics.Color.TRANSPARENT)
                    .tableEvenRowBackgroundColor(android.graphics.Color.TRANSPARENT)
            })
            .usePlugin(StrikethroughPlugin.create())
            .usePlugin(TaskListPlugin.create(context))
            // Web uses marked { breaks: true } for both streaming and settled prose.
            // Change only SoftLineBreak rendering, not source, AST ownership or code literals.
            .usePlugin(SoftBreakAddsNewLinePlugin.create())
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
                        .codeTextColor(SocratesDesign.Ink.toArgb())
                        .codeBackgroundColor(0xFFF5F5F5.toInt())
                        .linkColor(SocratesDesign.Link.toArgb())
                        .isLinkUnderlined(false)
                }
            }).build()
    }
    // Code-region discovery is a real block parse, not a main-thread line heuristic.
    val prepared by produceState<PreparedMarkdown?>(null, text, streaming) {
        value = withContext(Dispatchers.Default) {
            val parts = MarkdownFences.parts(text)
            val result = parts.mapIndexed { index, part ->
                ensureActive()
                val token = MarkdownTables.pipeToken(part.source)
                val preview = if (part.language == null) MarkdownSource.preview(
                    part.source, streaming && index == parts.lastIndex, token
                ) else MarkdownSource.Preview(part.source)
                PreparedMarkdownPart(part, preview, token)
            }
            ensureActive()
            PreparedMarkdown(text, streaming, result)
        }
    }
    // Do not display a previous streaming revision while the new source is being prepared.
    val parts = prepared?.takeIf { it.source == text && it.streaming == streaming }?.parts.orEmpty()
    Column(modifier, verticalArrangement = Arrangement.spacedBy(18.dp)) {
        parts.forEach { preparedPart ->
            val part = preparedPart.part
            if (part.language != null) CodePanel(part.source, part.language)
            else {
                val pipeToken = preparedPart.pipeToken
                val preview = preparedPart.preview
                val normalized = preview.markdown
                if (normalized.isNotBlank()) {
                    // CommonMark parsing runs off the main thread; obsolete streaming work is cancelled.
                    val rendered by produceState<List<NativeMarkdownBlock>?>(null, normalized, markwon, pipeToken) {
                        value = withContext(Dispatchers.Default) { renderMarkdownBlocks(markwon, normalized, pipeToken) { ensureActive() } }
                    }
                    NativeMarkdownBlocks(rendered.orEmpty(), markwon, Modifier.fillMaxWidth().semantics {
                        this.text = AnnotatedString(part.source.removeSuffix(preview.pendingMath.orEmpty()))
                    })
                }
                preview.pendingMath?.let { PendingMathSource(it) }
            }
        }
    }
}

/** Literal, selectable source while an explicit delimiter is still arriving; never repaired TeX. */
@Composable
private fun PendingMathSource(source: String) {
    Column(Modifier.fillMaxWidth().background(SocratesDesign.Selected, RoundedCornerShape(12.dp)).padding(12.dp)) {
        Text("公式生成中 · 原文", fontSize = 12.sp, color = SocratesDesign.Muted)
        SelectionContainer {
            Text(source, Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 6.dp),
                fontFamily = FontFamily.Monospace, fontSize = 14.sp, lineHeight = 22.sp, color = SocratesDesign.Ink)
        }
    }
}

@Composable
private fun CodePanel(source: String, language: String) {
    val clipboard = LocalClipboardManager.current
    Column(Modifier.fillMaxWidth().background(SocratesDesign.Selected, RoundedCornerShape(16.dp))) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(language.ifBlank { "代码" }, Modifier.weight(1f), fontSize = 12.sp, color = SocratesDesign.Muted)
            SocratesIconButton(onClick = { clipboard.setText(AnnotatedString(source)) }) { ReferenceIcon(ReferenceGlyph.Copy, "复制代码", Modifier.size(16.dp), SocratesDesign.Muted) }
        }
        SelectionContainer {
            Text(source, Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 16.dp), fontFamily = FontFamily.Monospace, fontSize = 14.sp, lineHeight = 22.sp, color = SocratesDesign.Ink)
        }
    }
}
