package com.socrates.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.socrates.android.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class ComparisonInput(val version: Int?, val label: String, val source: String)

/** The owner keys this subtree to the fetched records; nothing survives refresh/account cleanup. */
@Composable
internal fun ArtifactComparisonEntry(current: ArtifactSource, versions: List<ArtifactRevision>, copyText: ((String) -> Unit)?) {
    var opened by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("本地只读版本对比", Modifier.semantics { heading() }, style = MaterialTheme.typography.titleMedium)
        Text("只比较本次已加载的真实原文。可选择历史与当前、或两个历史快照；不推断缺失版本，不发送写入请求。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
        SocratesOutlinedButton(onClick = { opened = true }, enabled = versions.isNotEmpty()) { Text("选择版本并对比") }
    }
    if (opened && versions.isNotEmpty()) {
        val inputs = remember(current, versions) {
            listOf(ComparisonInput(null, "当前原文 · 版本 ${current.version}", current.source)) +
                versions.map { ComparisonInput(it.version, "历史快照 · 版本 ${it.version}", it.source) }
        }
        ArtifactComparisonSheet(inputs, { opened = false }, copyText)
    }
}

@Composable
private fun ArtifactComparisonSheet(inputs: List<ComparisonInput>, onDismiss: () -> Unit, copyText: ((String) -> Unit)?) {
    var from by remember { mutableStateOf(inputs.last().version) }
    var to by remember { mutableStateOf<Int?>(null) }
    val before = inputs.first { it.version == from }
    val after = inputs.first { it.version == to }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Column(Modifier.fillMaxSize().background(SocratesDesign.Page).windowInsetsPadding(AppSafeInsets)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp)) {
                Text("本地版本对比", Modifier.weight(1f).semantics { heading() }, style = MaterialTheme.typography.titleLarge)
                SocratesTextButton(onClick = onDismiss) { Text("关闭对比") }
            }
            // Input changes dispose the calculation scope, result, paging and copy feedback immediately.
            key(from, to) {
                ComparisonCalculation(before, after, inputs, { from = it }, { to = it }, { val old = from; from = to; to = old }, copyText)
            }
        }
    }
}

@Composable
private fun ColumnScope.ComparisonCalculation(
    before: ComparisonInput, after: ComparisonInput, inputs: List<ComparisonInput>,
    onFrom: (Int?) -> Unit, onTo: (Int?) -> Unit, onSwap: () -> Unit, copyText: ((String) -> Unit)?,
) {
    var result by remember { mutableStateOf<ArtifactDiffResult?>(null) }
    var computing by remember { mutableStateOf(false) }
    var page by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    LazyColumn(
        Modifier.weight(1f).fillMaxWidth().testTag("artifact-comparison-content"),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("方向：从起点到终点。新增属于终点，删除属于起点；不是编辑、恢复或发布。当前与历史分开读取，不保证同一时刻一致。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                InputPicker("起点", before, inputs, onFrom)
                InputPicker("终点", after, inputs, onTo)
                SocratesTextButton(onClick = onSwap) { Text("交换起点与终点") }
                Text("比较保留空白、大小写及 LF / CRLF / CR 行尾。每侧最多 120,000 个 UTF-16 单元、1,000 行；(起点行数 + 1) × (终点行数 + 1) 不超过 1,000,000 个计算格。超限不生成部分差异，原文仍可返回阅读。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                SocratesOutlinedButton(onClick = {
                    computing = true
                    scope.launch {
                        val calculated = withContext(Dispatchers.Default) { ArtifactDiff.compare(before.source, after.source) }
                        ensureActive()
                        result = calculated
                        page = 0
                        computing = false
                    }
                }, enabled = !computing && before.version != after.version) { Text(if (computing) "本地计算中…" else "计算所选版本差异") }
                if (before.version == after.version) Text("请选择两个不同的记录；当前原文与同版本号的历史记录也可分别选择。", style = MaterialTheme.typography.bodySmall)
            }
        }
        when (val diff = result) {
            null -> if (computing) item { Text("正在本地比较，不请求服务器…", Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
            is ArtifactDiffResult.Rejected -> item {
                val reason = when (diff.reason) {
                    ArtifactDiffRejection.UTF16_LIMIT -> "所选原文超过每侧 120,000 个 UTF-16 单元的本地对比预算。"
                    ArtifactDiffRejection.LINE_LIMIT -> "所选原文超过每侧 1,000 行的本地对比预算。"
                    ArtifactDiffRejection.LCS_CELL_LIMIT -> "所选行数组合超过 1,000,000 个计算格的本地对比预算。"
                }
                Text("$reason 未生成部分差异；可关闭对比继续阅读原文。", Modifier.testTag("artifact-diff-rejected").semantics { liveRegion = LiveRegionMode.Polite }, color = MaterialTheme.colorScheme.error)
            }
            is ArtifactDiffResult.Success -> {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(if (diff.added == 0 && diff.removed == 0) "两份原文完全相同。" else "新增 ${diff.added} 行 · 删除 ${diff.removed} 行", Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.titleMedium)
                        Text("按整行比较，不是字符级差异。每行标明类型、原行号和行尾；颜色不是唯一标识。长行可分段阅读，复制只包含该行原文（含真实行尾），不含对比标签。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                        val pages = maxOf(1, (diff.rows.size + DIFF_PAGE_ROWS - 1) / DIFF_PAGE_ROWS)
                        Text("对比第 ${page + 1} / $pages 页 · 共 ${diff.rows.size} 条行记录", Modifier.testTag("artifact-diff-page"), style = MaterialTheme.typography.bodySmall)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SocratesTextButton(onClick = { page-- }, enabled = page > 0, modifier = Modifier.weight(1f)) { Text("上一页差异") }
                            SocratesTextButton(onClick = { page++ }, enabled = page < pages - 1, modifier = Modifier.weight(1f)) { Text("下一页差异") }
                        }
                    }
                }
                itemsIndexed(diff.rows.drop(page * DIFF_PAGE_ROWS).take(DIFF_PAGE_ROWS), key = { index, _ -> page * DIFF_PAGE_ROWS + index }) { _, row ->
                    DiffRow(row, copyText)
                }
            }
        }
    }
}

private const val DIFF_PAGE_ROWS = 40

@Composable
private fun InputPicker(label: String, selected: ComparisonInput, inputs: List<ComparisonInput>, onSelect: (Int?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        SocratesOutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) { Text("$label：${selected.label}") }
        SocratesMenu(expanded = expanded, onDismissRequest = { expanded = false }, modifier = Modifier.heightIn(max = 280.dp)) {
            inputs.forEach { input ->
                SocratesMenuItem(text = { Text(input.label) }, onClick = { expanded = false; onSelect(input.version) })
            }
        }
    }
}

@Composable
private fun DiffRow(row: ArtifactDiffRow, copyText: ((String) -> Unit)?) {
    val label = when (row.kind) {
        ArtifactDiffKind.EQUAL -> "不变"
        ArtifactDiffKind.ADDED -> "+ 新增"
        ArtifactDiffKind.REMOVED -> "− 删除"
    }
    val tint = when (row.kind) {
        ArtifactDiffKind.EQUAL -> SocratesDesign.Muted
        ArtifactDiffKind.ADDED -> Color(0xFF20623D)
        ArtifactDiffKind.REMOVED -> Color(0xFF973B36)
    }
    val ending = when {
        row.text.endsWith("\r\n") -> "CRLF"
        row.text.endsWith("\n") -> "LF"
        row.text.endsWith("\r") -> "CR"
        else -> "无换行"
    }
    SocratesCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("$label · 起点 ${row.oldLineNumber ?: "—"} → 终点 ${row.newLineNumber ?: "—"} · 行尾 $ending", color = tint, style = MaterialTheme.typography.labelLarge)
            ToolOutputValue("逐字原文", row.text, format = false, copyText = copyText)
        }
    }
}
