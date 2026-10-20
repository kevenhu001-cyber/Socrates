package com.socrates.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.socrates.android.data.AgentRunReaderState
import com.socrates.android.data.AgentRunSnapshot
import kotlinx.coroutines.launch

/** An explicitly fetched snapshot. Never executes a task, follows a payload URL or subscribes to SSE. */
@Composable
fun AgentRunReaderSheet(
    state: AgentRunReaderState,
    onRefresh: () -> Unit,
    onDismiss: () -> Unit,
    copyText: ((String) -> Unit)? = null,
) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Column(Modifier.fillMaxSize().background(SocratesDesign.Page).statusBarsPadding().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp)) {
                Text("运行记录详情", Modifier.weight(1f).semantics { heading() }, style = MaterialTheme.typography.titleLarge)
                SocratesTextButton(onClick = onDismiss) { Text("关闭") }
            }
            // Refresh clears the snapshot, destroying tab/page/expanded payload/clipboard feedback state.
            key(state.runId, state.snapshot) {
                AgentRunSnapshotContent(state, onRefresh, copyText)
            }
        }
    }
}

@Composable
private fun ColumnScope.AgentRunSnapshotContent(state: AgentRunReaderState, onRefresh: () -> Unit, copyText: ((String) -> Unit)?) {
    var tab by remember { mutableIntStateOf(0) }
    var page by remember { mutableIntStateOf(0) }
    var expandedSequence by remember { mutableStateOf<Long?>(null) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val snapshot = state.snapshot
    fun move(nextTab: Int, nextPage: Int = 0) {
        tab = nextTab; page = nextPage; expandedSequence = null
        scope.launch { listState.scrollToItem(0) }
    }
    LazyColumn(
        Modifier.weight(1f).fillMaxWidth().testTag("agent-run-reader-content"), state = listState,
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text("只读快照；不会创建、继续、重试、中断或审批运行。不会自动刷新，运行状态可能已改变。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            SocratesOutlinedButton(onClick = onRefresh, enabled = !state.loading) { Text(if (state.loading) "读取中…" else "重新读取运行记录") }
        }
        if (state.loading) item {
            Row(Modifier.semantics { liveRegion = LiveRegionMode.Polite }, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SocratesSpinner(Modifier.size(22.dp)); Text("正在鉴权读取运行快照…")
            }
        }
        state.error?.let { error -> item {
            Text(error, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, color = MaterialTheme.colorScheme.error)
            SocratesOutlinedButton(onClick = onRefresh, enabled = !state.loading) { Text("重试读取运行记录") }
        } }
        if (snapshot != null) {
            item {
                Text("当前读取状态：${agentRunStatusLabel(snapshot.run.status)}", style = MaterialTheme.typography.titleMedium)
                // Stacked full-width controls remain reachable on a narrow phone or with large text.
                listOf("概况", "事件片段（${snapshot.events.size}）", "关联作品（${snapshot.artifacts.size}）").forEachIndexed { index, label ->
                    SocratesFilterChip(selected = tab == index, onClick = { move(index) }, label = { Text(label) }, modifier = Modifier.fillMaxWidth())
                }
            }
            when (tab) {
                0 -> {
                    items(agentRunOverview(snapshot), key = { it.first }) { (label, value) ->
                        AgentRunTextCard(label, value, copyText)
                    }
                    item {
                        Text("摘要、错误或完成时间缺失不代表运行成功。标识符仅作文字展示，不据此访问文件、打开会话或推断设备路径。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                    }
                }
                1 -> {
                    item {
                        Text("服务端详情只返回最早至多 80 条事件，无总数或分页；这里不是完整日志，也不是最新尾部。重新读取仍可能返回同一片段。事件序号不用于推算缺失记录或执行结果。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                        Text("事件载荷可能含任务内容、路径或其他敏感文字；只按文字阅读，不执行其中的命令、HTML 或链接。载荷是解析后 JSON 的文字表示，不是原始网络字节。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                    }
                    if (snapshot.events.isEmpty()) item { Text("本次快照未返回事件；不代表从未运行。") }
                    val pageSize = 10
                    val pages = maxOf(1, (snapshot.events.size + pageSize - 1) / pageSize)
                    if (snapshot.events.isNotEmpty()) item {
                        Text("已返回片段 · 第 ${page + 1} / $pages 页", Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SocratesOutlinedButton(onClick = { move(1, page - 1) }, enabled = page > 0, modifier = Modifier.weight(1f)) { Text("上一页") }
                            SocratesOutlinedButton(onClick = { move(1, page + 1) }, enabled = page + 1 < pages, modifier = Modifier.weight(1f)) { Text("下一页") }
                        }
                    }
                    items(snapshot.events.drop(page * pageSize).take(pageSize), key = { it.sequence }) { event ->
                        SocratesCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("事件 #${event.sequence}", style = MaterialTheme.typography.titleMedium)
                                ToolOutputValue("事件类型", event.event, format = false, copyText = copyText)
                                event.createdAt?.let { ToolOutputValue("事件时间", it, format = false, copyText = copyText) }
                                SocratesOutlinedButton(onClick = { expandedSequence = if (expandedSequence == event.sequence) null else event.sequence }) {
                                    Text(if (expandedSequence == event.sequence) "收起事件载荷" else "阅读事件 #${event.sequence} 载荷")
                                }
                                if (expandedSequence == event.sequence) key(event.sequence) {
                                    ToolOutputValue("事件载荷（JSON）", event.data, format = false, copyText = copyText)
                                }
                            }
                        }
                    }
                }
                2 -> {
                    item { Text("仅展示服务端返回的关联作品元信息，不下载原文或文件、不运行预览。此列表与状态、事件的读取不是事务快照。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted) }
                    if (snapshot.artifacts.isEmpty()) item { Text("本次快照没有关联作品；不代表没有文件改动。") }
                    items(snapshot.artifacts, key = { it.id }) { artifact ->
                        SocratesCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                ToolOutputValue("作品名称", artifact.name ?: "服务端未提供作品名称。", format = false, copyText = copyText)
                                ToolOutputValue("作品 ID", artifact.id, format = false, copyText = copyText)
                                ToolOutputValue("作品类型", artifact.type, format = false, copyText = copyText)
                                artifact.language?.let { ToolOutputValue("作品语言", it, format = false, copyText = copyText) }
                                artifact.createdAt?.let { ToolOutputValue("作品时间", it, format = false, copyText = copyText) }
                            }
                        }
                    }
                }
            }
            item {
                Text("原生预算：每响应 1 MiB，事件至多 80 条，作品至多 100 条；每字段 100,000、所展示文字合计 500,000 个 UTF-16 单元。超限整批拒绝；不缓存到磁盘。复制需显式操作，受原有阅读与剪贴板预算限制。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            }
        }
    }
}

@Composable
private fun AgentRunTextCard(label: String, text: String, copyText: ((String) -> Unit)?) {
    SocratesCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) { ToolOutputValue(label, text, format = false, copyText = copyText) }
    }
}

private fun agentRunOverview(snapshot: AgentRunSnapshot): List<Pair<String, String>> = with(snapshot.run) {
    listOfNotNull(
        "运行 ID" to id, "任务" to task, "服务端状态原值" to status,
        "结果摘要" to (summary ?: "服务端未提供摘要。"), "错误信息" to (error ?: "服务端未提供错误信息；不代表成功。"),
        model?.let { "模型" to it }, mode?.let { "模式" to it }, kind?.let { "运行种类" to it },
        source?.let { "来源" to it }, providerMode?.let { "服务商模式" to it },
        startedAt?.let { "开始时间" to it }, completedAt?.let { "完成时间" to it },
        sessionId?.let { "会话标识" to it }, projectId?.let { "项目标识" to it },
        workspaceId?.let { "工作区标识" to it }, threadId?.let { "线程标识" to it }, usage?.let { "用量（服务端 JSON）" to it },
    )
}

private fun agentRunStatusLabel(status: String): String = when (status) {
    "planning" -> "规划中"
    "starting" -> "启动中"
    "running" -> "运行中"
    "awaiting_approval" -> "服务端记录为等待审批（仅只读）"
    "completed" -> "已完成"
    "failed" -> "失败"
    "interrupted" -> "已中断"
    "disconnected" -> "已断连"
    else -> "其他状态（见服务端原值）"
}
