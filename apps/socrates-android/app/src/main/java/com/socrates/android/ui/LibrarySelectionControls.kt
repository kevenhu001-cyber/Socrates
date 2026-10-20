@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.socrates.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.socrates.android.data.FeatureItem
import com.socrates.android.data.LibraryResourceKey
import com.socrates.android.data.LibrarySelectionState

/** Selection spans filters, but select-all always means the currently displayed results. */
@Composable
fun LibrarySelectionToolbar(
    items: List<FeatureItem>, visibleItems: List<FeatureItem>, state: LibrarySelectionState,
    selecting: Boolean, enabled: Boolean, onStart: () -> Unit, onDone: () -> Unit,
    onSelectVisible: () -> Unit, onClear: () -> Unit, onDelete: () -> Unit, onRefresh: () -> Unit,
) {
    var showFailures by remember { mutableStateOf(false) }
    val visibleKeys = visibleItems.mapNotNull(LibraryResourceKey::from).toSet()
    val hidden = state.selection.count { it !in visibleKeys }
    val allVisibleSelected = visibleKeys.isNotEmpty() && state.selection.containsAll(visibleKeys)
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (!selecting) {
            SocratesTextButton(onClick = onStart, enabled = enabled && items.isNotEmpty()) { Text("选择资料") }
        } else {
            Text("已选 ${state.selection.size} 项" + if (hidden > 0) "（含当前筛选外 $hidden 项）" else "", style = MaterialTheme.typography.bodySmall)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SocratesTextButton(onClick = onSelectVisible, enabled = enabled && visibleKeys.isNotEmpty()) { Text(if (allVisibleSelected) "取消选择当前结果" else "全选当前结果") }
                SocratesTextButton(onClick = onClear, enabled = enabled && state.selection.isNotEmpty()) { Text("清空选择") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SocratesTextButton(onClick = onDelete, enabled = enabled && state.selection.isNotEmpty()) { Text(if (state.busy) "正在删除…" else "删除所选") }
                SocratesTextButton(onClick = onDone, enabled = enabled) { Text("完成选择") }
            }
        }
        state.notice?.let { Text(it, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted) }
        if (state.failures.isNotEmpty()) {
            Text("${state.failures.size} 项未确认删除。网络异常时服务器可能已处理，请先刷新核对，再决定是否重试。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SocratesTextButton(onClick = { showFailures = true }, enabled = !state.busy) { Text("查看未确认项目") }
                SocratesTextButton(onClick = onRefresh, enabled = enabled) { Text("刷新资料库") }
            }
        }
    }
    if (showFailures) SocratesSheet(onDismissRequest = { showFailures = false }) {
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 500.dp).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { Text("未确认删除的项目", style = MaterialTheme.typography.titleMedium) }
            items(state.failures.entries.toList(), key = { "${it.key.collection}/${it.key.id}" }) { (key, failure) ->
                val title = items.firstOrNull { LibraryResourceKey.from(it) == key }?.title ?: key.id
                SelectionContainer {
                    Column {
                        Text("$title（${if (key.collection == "files") "文件" else "作品"}）", style = MaterialTheme.typography.titleSmall)
                        Text(failure, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            item { SocratesTextButton(onClick = { showFailures = false }) { Text("关闭明细") } }
        }
    }
}

@Composable
fun LibraryDeleteConfirmation(
    keys: List<LibraryResourceKey>, items: List<FeatureItem>, busy: Boolean,
    onConfirm: () -> Unit, onCancel: () -> Unit,
) {
    SocratesAlert(
        onDismissRequest = { if (!busy) onCancel() },
        title = { Text("永久删除 ${keys.size} 项资料？") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("以下文件或作品将被永久删除，无法撤销。包括已选择但被当前筛选隐藏的项目。")
                LazyColumn(Modifier.fillMaxWidth().heightIn(max = 220.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(keys, key = { "${it.collection}/${it.id}" }) { key ->
                        val title = items.firstOrNull { LibraryResourceKey.from(it) == key }?.title ?: key.id
                        Text("$title（${if (key.collection == "files") "文件" else "作品"}）", style = MaterialTheme.typography.bodySmall)
                    }
                }
                if (busy) Text("正在逐项删除；请等待结果，不会自动重发未确认的请求。", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = { SocratesButton(onClick = onConfirm, enabled = !busy, containerColor = MaterialTheme.colorScheme.error) { Text(if (busy) "删除中…" else "永久删除") } },
        dismissButton = { SocratesTextButton(onClick = onCancel, enabled = !busy) { Text("取消") } },
    )
}
