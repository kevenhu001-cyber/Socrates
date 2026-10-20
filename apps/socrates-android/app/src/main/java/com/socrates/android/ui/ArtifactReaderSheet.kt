package com.socrates.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.socrates.android.data.ArtifactReaderState
import kotlinx.coroutines.launch

/** Read-only source. No HTML/Markdown runtime, automatic links, restore, publish or source mutation. */
@Composable
fun ArtifactReaderSheet(
    state: ArtifactReaderState,
    onRefresh: () -> Unit,
    onLoadVersions: () -> Unit,
    onSelect: (Int?) -> Unit,
    onDismiss: () -> Unit,
    copyText: ((String) -> Unit)? = null,
) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    fun select(version: Int?) {
        onSelect(version)
        scope.launch { listState.animateScrollToItem(0) }
    }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Column(Modifier.fillMaxSize().background(SocratesDesign.Page).windowInsetsPadding(AppSafeInsets)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp)) {
                Text("作品原文与版本", Modifier.weight(1f).semantics { heading() }, style = MaterialTheme.typography.titleLarge)
                SocratesTextButton(onClick = onDismiss) { Text("关闭") }
            }
            LazyColumn(
                Modifier.weight(1f).fillMaxWidth().testTag("artifact-reader-content"),
                state = listState,
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item {
                    Text("只读原文，不运行脚本或预览网页；不编辑、恢复或发布版本。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                    SocratesOutlinedButton(onClick = onRefresh, enabled = !state.loading) { Text(if (state.loading) "读取中…" else "重新读取当前作品") }
                }
                if (state.loading) item {
                    Row(Modifier.semantics { liveRegion = LiveRegionMode.Polite }, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SocratesSpinner(Modifier.size(22.dp)); Text("正在鉴权读取作品…")
                    }
                }
                state.error?.let { error -> item {
                    Text(error, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, color = MaterialTheme.colorScheme.error)
                    SocratesOutlinedButton(onClick = onRefresh, enabled = !state.loading) { Text("重试读取作品") }
                } }
                state.current?.let { current ->
                    item {
                        Text(current.title.ifBlank { "未命名作品" }, style = MaterialTheme.typography.headlineSmall)
                        Text(listOfNotNull(current.type, current.language?.takeIf { it.isNotBlank() }, "当前版本 ${current.version}").joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                        current.updatedAt?.let { Text("当前更新时间：$it", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted) }
                    }
                    if (state.versionsLoaded && state.versions.isNotEmpty()) item {
                        key(current, state.versions) {
                            ArtifactComparisonEntry(current, state.versions, copyText)
                        }
                    }
                    item {
                        SocratesCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                val revision = state.selectedRevision
                                Text(if (revision == null) "当前作品原文 · 版本 ${current.version}" else "历史快照 · 版本 ${revision.version}", style = MaterialTheme.typography.titleMedium)
                                if (revision != null) {
                                    revision.createdAt?.let { Text("快照时间：$it", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted) }
                                    SocratesTextButton(onClick = { select(null) }) { Text("返回当前原文") }
                                }
                                val source = revision?.source ?: current.source
                                if (source.isEmpty()) Text("此记录的原文为空。", style = MaterialTheme.typography.bodyMedium)
                                else key(current.id, state.selectedVersion, current.version, source) {
                                    // Verbatim source, including fences/JSON/HTML. Reader retains all loaded segments.
                                    ToolOutputValue("已加载原文", source, format = false, copyText = copyText)
                                }
                            }
                        }
                    }
                    item {
                        Text("服务端保存的版本快照", Modifier.semantics { heading() }, style = MaterialTheme.typography.titleMedium)
                        Text("历史接口没有分页，且通常不包含初始版本；这里不补造缺失版本。当前作品与历史分开读取，不保证是同一时刻的快照。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                        Text("原生读取预算：每个响应 4 MiB；原文 1,000,000 个 UTF-16 单元；历史最多 100 条且原文合计不超过该文字预算。超限整批拒绝，不截掉版本冒充完整。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                        if (!state.versionsLoaded) SocratesOutlinedButton(onClick = onLoadVersions, enabled = !state.loading && !state.versionsLoading) {
                            Text(if (state.versionsLoading) "读取历史中…" else if (state.versionsError != null) "重试读取历史版本" else "读取历史版本")
                        }
                    }
                    state.versionsError?.let { error -> item {
                        Text(error, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, color = MaterialTheme.colorScheme.error)
                    } }
                    if (state.versionsLoaded && state.versions.isEmpty()) item {
                        Text("服务端没有保存的版本快照；这不代表作品从未修改。", style = MaterialTheme.typography.bodyMedium)
                    }
                    if (state.versionsLoaded) items(state.versions, key = { it.version }) { revision ->
                        SocratesCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("版本 ${revision.version}", style = MaterialTheme.typography.titleMedium)
                                revision.createdAt?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted) }
                                Text("${revision.source.length} 个 UTF-16 单元", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                                SocratesOutlinedButton(onClick = { select(revision.version) }, enabled = state.selectedVersion != revision.version) {
                                    Text(if (state.selectedVersion == revision.version) "正在阅读版本 ${revision.version}" else "阅读版本 ${revision.version}")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
