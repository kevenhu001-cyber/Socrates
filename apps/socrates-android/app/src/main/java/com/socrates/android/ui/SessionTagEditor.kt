package com.socrates.android.ui

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.socrates.android.data.ChatSession
import com.socrates.android.data.SessionHistory

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun SessionTagEditor(
    session: ChatSession, knownTags: List<String>, saving: Boolean, canSave: Boolean,
    serverError: String?, onSave: (List<String>) -> Unit, onDismiss: () -> Unit,
) {
    var tags by remember(session.id) { mutableStateOf(SessionHistory.tags(session)) }
    var input by remember(session.id) { mutableStateOf("") }
    var inputError by remember(session.id) { mutableStateOf<String?>(null) }
    fun add(value: String): Boolean = try {
        tags = SessionHistory.addTags(tags, value); inputError = null; true
    } catch (e: IllegalArgumentException) { inputError = e.message; false }
    SocratesSheet(onDismissRequest = { if (!saving) onDismiss() }) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("管理标签", style = MaterialTheme.typography.headlineSmall)
            Text(session.title.ifBlank { "新对话" }, maxLines = 2, overflow = TextOverflow.Ellipsis, color = SocratesDesign.Muted)
            Text("${tags.size}/${SessionHistory.MAX_TAGS} 个标签 · 支持中英文逗号分隔", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 220.dp)) {
                if (tags.isEmpty()) item { Text("此会话还没有标签", Modifier.padding(vertical = 10.dp), color = SocratesDesign.Muted) }
                items(tags, key = { it }) { tag ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(tag, Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                        SocratesIconButton(onClick = { tags = tags - tag }, enabled = !saving) {
                            ReferenceIcon(ReferenceGlyph.Close, "移除标签 $tag")
                        }
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SocratesField(input, { input = it; inputError = null }, Modifier.weight(1f).testTag("session-tag-input"),
                    placeholder = { Text("添加标签") }, singleLine = true, enabled = !saving)
                SocratesTextButton(onClick = { if (add(input)) input = "" }, enabled = !saving && input.isNotBlank()) { Text("添加") }
            }
            val suggestions = knownTags.filterNot { it in tags }
            if (suggestions.isNotEmpty()) {
                Text("已有标签", style = MaterialTheme.typography.labelMedium, color = SocratesDesign.Muted)
                LazyColumn(Modifier.fillMaxWidth().heightIn(max = 110.dp)) {
                    items(suggestions, key = { it }) { suggestion ->
                        SocratesTextButton(onClick = { add(suggestion) }, enabled = !saving && tags.size < SessionHistory.MAX_TAGS) {
                            Text(suggestion, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
            (inputError ?: serverError)?.let { message ->
                Text(message, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Row(Modifier.align(Alignment.End), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SocratesTextButton(onClick = onDismiss, enabled = !saving) { Text("取消") }
                SocratesButton(onClick = { if (input.isBlank() || add(input)) { input = ""; onSave(tags) } },
                    enabled = canSave && !saving, modifier = Modifier.testTag("session-tags-save")) {
                    Text(if (saving) "保存中…" else "保存")
                }
            }
        }
    }
}
