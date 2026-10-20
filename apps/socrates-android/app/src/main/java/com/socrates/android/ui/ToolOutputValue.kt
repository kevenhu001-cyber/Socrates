package com.socrates.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Untrusted output is always native text: never Markdown, HTML, links or executable content. */
@Composable
internal fun ToolOutputValue(
    label: String,
    value: String,
    format: Boolean = true,
    copyText: ((String) -> Unit)? = null,
) {
    val preview = remember(value, format) { ToolOutputText.preview(value, format) }
    var readingOriginal by remember(value, format) { mutableStateOf(false) }
    var page by remember(value, format) { mutableIntStateOf(0) }
    var feedback by remember(value, format) { mutableStateOf<String?>(null) }
    val pages = remember(value) { ToolOutputText.pageCount(value) }
    val original = remember(value, page, readingOriginal) {
        if (readingOriginal) ToolOutputText.page(value, page) else ""
    }
    val tokens = remember(preview) { ToolOutputSyntax.tokens(preview) }
    val highlighted = remember(preview, tokens) {
        buildAnnotatedString {
            append(preview.text)
            tokens.forEach { token ->
                addStyle(SpanStyle(color = toolSyntaxColor(token.role)), token.start, token.end)
            }
        }
    }
    val clipboard = LocalClipboardManager.current
    fun copy(text: String) {
        feedback = try {
            if (copyText != null) copyText(text) else clipboard.setText(AnnotatedString(text))
            "已复制到系统剪贴板"
        } catch (_: Exception) {
            "无法复制，请选择文字后重试"
        }
    }
    Column(
        Modifier.fillMaxWidth().padding(top = 9.dp).testTag("tool-output-value"),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = SocratesDesign.Muted)
        if (readingOriginal) {
            Text("原文 · 第 ${page + 1} / $pages 段", style = MaterialTheme.typography.labelSmall, color = SocratesDesign.Muted)
        } else if (preview.kind != ToolOutputKind.PLAIN) {
            Text(
                when (preview.kind) {
                    ToolOutputKind.CODE -> {
                        val name = preview.language?.let { "代码 · $it" } ?: "代码"
                        if (tokens.isNotEmpty()) "$name · 词法着色" else "$name（无语法高亮）"
                    }
                    ToolOutputKind.JSON -> "JSON · 格式化预览"
                    ToolOutputKind.PLAIN -> "原文"
                },
                style = MaterialTheme.typography.labelSmall, color = SocratesDesign.Muted,
            )
        }
        if (!readingOriginal && tokens.isNotEmpty()) {
            Text("颜色仅辅助阅读，不代表代码有效或可以安全运行。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
        }
        key(value, readingOriginal, page) {
            SelectionContainer {
                Text(
                    if (readingOriginal) AnnotatedString(original) else highlighted,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp).verticalScroll(rememberScrollState())
                        .background(SocratesDesign.Page).padding(10.dp).testTag("tool-output-text"),
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = SocratesDesign.Ink,
                )
            }
        }
        if (preview.truncated && !readingOriginal) {
            Text("预览已截断；可分段阅读全部已加载原文。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
        }
        if (readingOriginal && pages > 1) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SocratesTextButton(onClick = { page--; feedback = null }, enabled = page > 0, modifier = Modifier.weight(1f)) { Text("上一段") }
                SocratesTextButton(onClick = { page++; feedback = null }, enabled = page < pages - 1, modifier = Modifier.weight(1f)) { Text("下一段") }
            }
        }
        if (preview.truncated || preview.kind != ToolOutputKind.PLAIN) {
            SocratesTextButton(onClick = { readingOriginal = !readingOriginal; page = 0; feedback = null }) {
                Text(if (readingOriginal) "返回预览" else if (preview.truncated) "分段阅读原文" else "查看原文")
            }
        }
        Text("复制会将原文放入系统剪贴板。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
        if (value.length <= ToolOutputText.COPY_LIMIT) {
            SocratesTextButton(onClick = { copy(value) }) { Text("复制完整原文") }
        } else {
            Text("原文超过 60,000 个 UTF-16 单元；为避免剪贴板过载，仅支持分段复制。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            SocratesTextButton(onClick = {
                if (!readingOriginal) { readingOriginal = true; page = 0; feedback = null }
                else copy(original)
            }) { Text(if (readingOriginal) "复制当前段原文" else "打开原文分段") }
        }
        feedback?.let {
            Text(it, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
        }
    }
}

/** Opaque, dark colors on the existing light native reader surface; meaning never depends on color. */
private fun toolSyntaxColor(role: ToolSyntaxRole): Color = when (role) {
    ToolSyntaxRole.KEYWORD -> Color(0xFF653A93)
    ToolSyntaxRole.STRING -> Color(0xFF22623A)
    ToolSyntaxRole.NUMBER -> Color(0xFF904115)
    ToolSyntaxRole.COMMENT -> Color(0xFF626262)
    ToolSyntaxRole.PROPERTY -> Color(0xFF245C8F)
    ToolSyntaxRole.LITERAL -> Color(0xFF874263)
}
