package com.socrates.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Search only the authenticated extraction already loaded by the preview, never the account. */
@Composable
internal fun DocumentTextReader(id: String, preview: DocumentTextPreview) {
    // Resource and content identity scope every draft, result, position and text layout.
    key(id, preview.text) {
        DocumentTextReaderContent(preview)
    }
}

@Composable
private fun DocumentTextReaderContent(preview: DocumentTextPreview) {
    val pages = remember(preview.text) { DocumentTextPaging.pages(preview.text) }
    val starts = remember(pages) {
        var offset = 0
        pages.map { page -> offset.also { offset += page.length } }
    }
    var index by remember { mutableIntStateOf(0) }
    var query by remember { mutableStateOf("") }
    var submittedQuery by remember { mutableStateOf<String?>(null) }
    var searchRequest by remember { mutableIntStateOf(0) }
    var active by remember(submittedQuery, searchRequest) { mutableIntStateOf(0) }
    val focus = LocalFocusManager.current
    val valid = query.isNotEmpty() && query.length <= DocumentTextSearch.MAX_QUERY_LENGTH
    fun submit() {
        if (valid) { submittedQuery = query; searchRequest++; focus.clearFocus() }
    }
    // A new identity starts empty, rather than displaying the preceding query's matches.
    val result by key(submittedQuery, searchRequest) {
        produceState<DocumentSearchResult?>(null) {
            val submitted = submittedQuery
            if (submitted != null) value = withContext(Dispatchers.Default) {
                DocumentTextSearch.find(preview.text, submitted)
            }
        }
    }
    val matches = result?.matches.orEmpty()
    val selected = matches.getOrNull(active)
    LaunchedEffect(result, active) {
        selected?.let { index = DocumentTextSearch.segmentIndex(pages, it.start) }
    }
    if (preview.metadata.isNotEmpty()) Text(preview.metadata.joinToString(" · ") { "${it.first}：${it.second}" }, color = SocratesDesign.Muted, style = MaterialTheme.typography.labelSmall)
    if (preview.truncated) Text("服务器已截断提取内容，以下并非完整文档。", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    if (pages.isEmpty()) {
        Text("未提取到可显示的文字。扫描件或纯图片文档可能需要 OCR。", color = SocratesDesign.Muted)
        return
    }
    SocratesField(
        value = query,
        onValueChange = { query = it; submittedQuery = null },
        modifier = Modifier.fillMaxWidth().testTag("document-search-query"),
        label = { Text("在提取文字中查找") },
        placeholder = { Text("输入要查找的文字") },
        singleLine = true,
        isError = query.length > DocumentTextSearch.MAX_QUERY_LENGTH,
        supportingText = {
            Text(if (query.length > DocumentTextSearch.MAX_QUERY_LENGTH) "查找文字最多 200 个字符，请缩短后重试。" else "仅查找已加载的提取文字，忽略大小写、按字面匹配；不搜索 PDF 原件或未提取内容。", style = MaterialTheme.typography.bodySmall)
        },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = { submit() }),
    )
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SocratesOutlinedButton(onClick = { submit() }, enabled = valid, modifier = Modifier.weight(1f)) { Text("查找文字") }
        SocratesTextButton(onClick = { query = ""; submittedQuery = null }, enabled = query.isNotEmpty(), modifier = Modifier.weight(1f)) { Text("清除查找") }
    }
    if (submittedQuery != null) {
        Text(
            when {
                result == null -> "正在查找提取文字…"
                matches.isEmpty() -> "当前提取文字中未找到匹配。"
                result!!.hasMore -> "第 ${active + 1} / ${matches.size} 处（仅列出前 ${matches.size} 处，仍有更多匹配）"
                else -> "第 ${active + 1} / ${matches.size} 处"
            },
            Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            color = SocratesDesign.Muted, style = MaterialTheme.typography.bodySmall,
        )
        if (matches.isNotEmpty()) {
            // Stacked full-width controls remain usable on narrow screens and with large fonts.
            SocratesOutlinedButton(onClick = { active-- }, enabled = active > 0, modifier = Modifier.fillMaxWidth()) { Text("上一处") }
            SocratesOutlinedButton(onClick = { active++ }, enabled = active + 1 < matches.size, modifier = Modifier.fillMaxWidth()) { Text("下一处") }
            if (selected != null && DocumentTextSearch.segmentIndex(pages, selected.start) != DocumentTextSearch.segmentIndex(pages, selected.endExclusive - 1)) {
                Text("当前命中跨越文字分段，可用下一段继续阅读；分段不是原文页码。", color = SocratesDesign.Muted, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
    // Preserve the bounded 6000-unit text layout and copyable original text.
    key(index) {
        val scroll = rememberScrollState()
        var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
        val start = starts[index]
        val page = pages[index]
        val annotated = remember(page, start, matches, selected) {
            buildAnnotatedString {
                append(page)
                matches.forEach { match ->
                    val localStart = (match.start - start).coerceAtLeast(0)
                    val localEnd = (match.endExclusive - start).coerceAtMost(page.length)
                    if (localStart < localEnd) addStyle(
                        SpanStyle(background = if (match == selected) Color(0xFFFFD36A) else Color(0xFFFFEDB2), color = SocratesDesign.Ink,
                            fontWeight = if (match == selected) FontWeight.Bold else FontWeight.Normal),
                        localStart, localEnd,
                    )
                }
            }
        }
        LaunchedEffect(layout, selected) {
            val match = selected
            if (match != null && match.start >= start && match.start < start + page.length) {
                layout?.let { scroll.scrollTo(it.getBoundingBox(match.start - start).top.toInt().coerceAtLeast(0)) }
            }
        }
        SelectionContainer {
            Text(annotated, Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(scroll).testTag("document-text-segment"),
                style = MaterialTheme.typography.bodyMedium, onTextLayout = { layout = it })
        }
    }
    if (pages.size > 1) {
        Text("文字分段 ${index + 1} / ${pages.size}（非原文页码）", color = SocratesDesign.Muted, style = MaterialTheme.typography.labelSmall)
        SocratesOutlinedButton(onClick = { index-- }, enabled = index > 0, modifier = Modifier.fillMaxWidth()) { Text("上一段") }
        SocratesOutlinedButton(onClick = { index++ }, enabled = index + 1 < pages.size, modifier = Modifier.fillMaxWidth()) { Text("下一段") }
    }
}
