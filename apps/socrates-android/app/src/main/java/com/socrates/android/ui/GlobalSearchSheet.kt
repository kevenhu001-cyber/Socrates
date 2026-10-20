@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.socrates.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.socrates.android.data.*

@Composable
fun GlobalSearchSheet(
    state: GlobalSearchState, sessions: List<ChatSession>, opening: Boolean, canOpen: Boolean,
    openError: String?, onEdit: (String, SearchScope) -> Unit, onSubmit: () -> Unit,
    onOpen: (SearchHit) -> Unit, onDismiss: () -> Unit,
) {
    SocratesSheet(onDismissRequest = onDismiss) {
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 680.dp), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("搜索全部会话", style = MaterialTheme.typography.headlineSmall)
                    Text("在服务器保存的标题、主题及消息全文中检索，包含归档会话。结果取决于服务端分词，并非任意子串匹配。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                    SocratesField(state.query, { onEdit(it, state.scope) }, Modifier.fillMaxWidth(),
                        label = { Text("关键词") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { if (!state.loading) onSubmit() }),
                        supportingText = { Text("最多 ${GlobalSearchRepository.MAX_QUERY} 个字符") })
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SearchScope.entries.forEach { filter ->
                            SocratesFilterChip(state.scope == filter, { onEdit(state.query, filter) }, { Text(filter.label) })
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        SocratesButton(onClick = onSubmit, enabled = !state.loading && state.query.trim().isNotEmpty() && state.query.trim().length <= GlobalSearchRepository.MAX_QUERY) { Text(if (state.loading) "搜索中…" else "搜索") }
                        SocratesTextButton(onClick = onDismiss) { Text("关闭") }
                    }
                }
            }
            if (state.loading) item { SocratesSpinner(Modifier.size(22.dp)) }
            state.error?.let { error -> item {
                Column {
                    Text(error, color = MaterialTheme.colorScheme.error)
                    SocratesTextButton(onClick = onSubmit) { Text("重试搜索") }
                }
            } }
            openError?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
            if (opening) item { Text("正在打开真实会话…", style = MaterialTheme.typography.bodySmall) }
            if (!canOpen && !opening) item { Text("回复或会话操作进行中，完成后可打开结果。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted) }
            if (state.searched) item { Text(if (state.hits.isEmpty()) "没有匹配结果，可调整关键词或检索范围。" else "找到 ${state.hits.size} 项；最多显示 ${GlobalSearchRepository.LIMIT} 项，无后续分页。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted) }
            items(state.hits, key = { it.key }) { hit ->
                val summary = sessions.firstOrNull { it.id == hit.sessionId }
                val title = hit.title.ifBlank { summary?.title.orEmpty().ifBlank { summary?.topic.orEmpty().ifBlank { "打开所属会话" } } }
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(SocratesDesign.Page)
                    .clickable(enabled = canOpen && !opening) { onOpen(hit) }.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(if (hit.kind == "message") "消息全文匹配" else "会话标题 / 主题匹配", style = MaterialTheme.typography.labelMedium, color = SocratesDesign.Muted)
                    Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    if (hit.snippet.isNotBlank()) Text(hit.snippet, style = MaterialTheme.typography.bodySmall, maxLines = 5, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}
