package com.socrates.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.socrates.android.data.*

@Composable
fun TaskExecutionSheet(
    state: TaskExecutionState,
    onRefresh: () -> Unit,
    onLoadSession: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Column(Modifier.fillMaxSize().background(SocratesDesign.Page).windowInsetsPadding(AppSafeInsets)) {
            LazyColumn(
                Modifier.fillMaxSize().testTag("task-execution-content"),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("执行结果", Modifier.weight(1f).semantics { heading() }, style = MaterialTheme.typography.headlineSmall)
                        SocratesTextButton(onClick = onDismiss) { Text("关闭") }
                    }
                }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SocratesOutlinedButton(onClick = onRefresh, enabled = !state.loading) {
                            Text(if (state.loading) "刷新中…" else "刷新")
                        }
                    }
                }
                if (state.loading) item {
                    Row(Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SocratesSpinner(Modifier.size(22.dp))
                        Text("正在加载任务执行信息…", style = MaterialTheme.typography.bodyMedium)
                    }
                }
                state.error?.let { error -> item {
                    Column(Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(error, color = MaterialTheme.colorScheme.error)
                        SocratesOutlinedButton(onClick = onRefresh, enabled = !state.loading) { Text("重试") }
                    }
                } }
                val snapshot = state.snapshot
                if (snapshot != null) {
                    item {
                        Text(snapshot.title.ifBlank { "未命名任务" }, style = MaterialTheme.typography.titleLarge)
                        Text("仅显示当前任务元数据和最近一条独立运行记录，不代表任务的全部历史。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                    }
                    item {
                        SocratesCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                                Text("任务信息", style = MaterialTheme.typography.titleMedium)
                                DetailLine("任务状态", ScheduledTaskPresentation.statusLabel(snapshot.status))
                                DetailLine("执行方式", when (snapshot.agentKind) { "native" -> "普通任务"; "codex" -> "Codex 工作区"; else -> snapshot.agentKind })
                                DetailLine("最近运行时间", snapshot.lastRunAt.ifBlank { "暂无" })
                                DetailLine("运行次数", snapshot.runCount.toString())
                            }
                        }
                    }
                    if (snapshot.runId == null) item {
                        Text(
                            if (snapshot.agentKind.equals("native", ignoreCase = true))
                                "普通任务的结果写入关联会话，不生成独立运行记录。"
                            else "当前没有可用的独立运行记录。",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    } else if (snapshot.run == null) {
                        item {
                            Column(Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                val message = snapshot.runError
                                Text(message ?: "尚未获取到最近一次运行记录详情；它可能仍在写入或已被清理。", color = if (message != null) MaterialTheme.colorScheme.error else SocratesDesign.Muted)
                                SocratesOutlinedButton(onClick = onRefresh, enabled = !state.loading) { Text(if (message != null) "重试" else "刷新") }
                            }
                        }
                    } else {
                        val run = snapshot.run
                        item {
                            SocratesCard(Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                                    Text("最近独立运行记录", style = MaterialTheme.typography.titleMedium)
                                    DetailLine("状态", statusLabel(run.status))
                                    if (run.startedAt.isNotBlank()) DetailLine("开始时间", run.startedAt)
                                    if (run.completedAt.isNotBlank()) DetailLine("完成时间", run.completedAt)
                                    if (run.task.isNotBlank()) DetailLine("任务", run.task)
                                    if (run.summary.isNotBlank()) {
                                        Text("摘要", style = MaterialTheme.typography.labelLarge)
                                        SelectionContainer { Text(run.summary, style = MaterialTheme.typography.bodyMedium) }
                                    }
                                    if (run.error.isNotBlank()) {
                                        Text("错误", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.error)
                                        SelectionContainer { Text(run.error, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error) }
                                    }
                                    if (run.status.equals("awaiting_approval", ignoreCase = true)) {
                                        Text("此运行需要审批；请在支持的工作区中处理。此处不提供审批操作。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                                    }
                                    if (run.artifacts.isNotEmpty()) {
                                        Text("产物（仅元信息）", style = MaterialTheme.typography.labelLarge)
                                        run.artifacts.forEach { artifact ->
                                            Text("${artifact.name.ifBlank { artifact.id }} · ${artifact.type.ifBlank { "未知类型" }}", style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if (!snapshot.sessionId.isNullOrBlank()) item {
                        SocratesOutlinedButton(onClick = onLoadSession, enabled = !state.loading && !state.sessionLoading) {
                            Text(if (state.sessionLoading) "正在加载会话…" else "查看关联会话（只读）")
                        }
                    } else item {
                        Text("任务当前没有关联会话；这不代表执行成功或失败。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                    }
                    state.sessionError?.let { error -> item {
                        Text(error, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, color = MaterialTheme.colorScheme.error)
                    } }
                    state.session?.let { session ->
                        item {
                            Text("关联会话：${session.title.ifBlank { "未命名会话" }}", style = MaterialTheme.typography.titleMedium)
                            Text("此关联会话可能包含其他轮次；不保证其中每条消息都来自本次任务。以下内容只读。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                        }
                        if (session.messages.isEmpty()) item { Text("此会话暂无消息。", style = MaterialTheme.typography.bodyMedium) }
                        items(session.messages, key = { "${session.id}:${it.id}" }) { message ->
                            SocratesCard(Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(when (message.role) { "user" -> "用户"; "assistant" -> "助手"; "system" -> "系统"; "tool" -> "工具"; else -> message.role }, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                                    if (message.content.isNotEmpty()) SelectionContainer { Text(message.content, style = MaterialTheme.typography.bodyMedium) }
                                    if (message.attachmentName != null || message.imageDataUrl != null || (message.wire?.optJSONArray("attachments")?.length() ?: 0) > 0) {
                                        Text("此消息包含附件；附件正文未展示。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                                    } else if (message.content.isEmpty()) Text("（无正文）", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                                }
                            }
                        }
                    }
                } else if (!state.loading && state.error == null) item {
                    Text("暂无任务执行信息。", Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, Modifier.weight(.32f), style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
        SelectionContainer(Modifier.weight(.68f)) { Text(value, style = MaterialTheme.typography.bodyMedium) }
    }
}

private fun statusLabel(status: String): String = when (status.lowercase()) {
    "pending" -> "等待中"
    "running" -> "运行中"
    "completed" -> "已完成"
    "failed" -> "失败"
    "interrupted" -> "已中断"
    "awaiting_approval" -> "等待审批"
    else -> status
}
