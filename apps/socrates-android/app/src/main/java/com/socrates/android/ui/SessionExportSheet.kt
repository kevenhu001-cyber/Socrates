@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.socrates.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.socrates.android.data.TranscriptExportFormat
import com.socrates.android.data.TranscriptExportPhase
import com.socrates.android.data.TranscriptExportState

@Composable
internal fun SessionExportSheet(
    state: TranscriptExportState,
    onFormat: (TranscriptExportFormat) -> Unit,
    onSave: () -> Unit,
    onDismiss: () -> Unit,
) {
    val busy = state.phase == TranscriptExportPhase.PREPARING ||
        state.phase == TranscriptExportPhase.PICKING || state.phase == TranscriptExportPhase.WRITING
    val choosing = state.phase == TranscriptExportPhase.CHOOSING
    BackHandler(enabled = busy) { /* Keep the in-flight export in control. */ }

    SocratesSheet(onDismissRequest = { if (!busy) onDismiss() }) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(13.dp),
        ) {
            Text("导出对话", style = MaterialTheme.typography.headlineSmall)
            if (state.title.isNotBlank()) Text(state.title, style = MaterialTheme.typography.titleMedium)
            Text("导出打开时已加载的 ${state.messageCount} 条消息正文。", style = MaterialTheme.typography.bodyMedium)
            Text(
                "不读取草稿、附件原件、独立推理、工具调用载荷或学习专用状态；这不是完整备份。正文可能含此前附加的文本资料，导出时会原样保留。",
                style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted,
            )
            Text(
                "纯文本会保留正文中的 Markdown 源字符。保存位置由 Android 文件选择器指定。导出文件可能包含敏感对话，请谨慎保存和分享。文件上限为 5 MB。",
                style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted,
            )
            if (choosing) {
                Text("导出格式", style = MaterialTheme.typography.titleSmall)
                TranscriptExportFormat.entries.forEach { format ->
                    val selected = state.format == format
                    SocratesCard(enabled = true, modifier = Modifier.fillMaxWidth()) {
                        Row(
                            Modifier.fillMaxWidth().selectable(
                                selected = selected, enabled = true, role = Role.RadioButton,
                                onClick = { onFormat(format) },
                            ).padding(horizontal = 14.dp, vertical = 9.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            SocratesRadio(selected = selected, onClick = null, enabled = true)
                            Column {
                                Text(format.label, style = MaterialTheme.typography.bodyLarge)
                                Text(".${format.extension} · ${format.mimeType}", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                            }
                        }
                    }
                }
            }
            if (busy) {
                val progress = when (state.phase) {
                    TranscriptExportPhase.PREPARING -> "正在准备导出…"
                    TranscriptExportPhase.PICKING -> "正在打开文件选择器…"
                    else -> "正在写入文件…"
                }
                Text(progress, style = MaterialTheme.typography.bodyMedium)
            }
            if (state.phase == TranscriptExportPhase.COMPLETE) {
                Text(
                    if (state.fileName.isBlank()) "保存已完成。" else "保存已完成。建议文件名：${state.fileName}；实际名称以所选位置为准。",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            if (choosing) state.error?.let {
                Text(it, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, color = MaterialTheme.colorScheme.error)
            }
            if (choosing) {
                SocratesButton(onClick = onSave, enabled = true, modifier = Modifier.fillMaxWidth()) {
                    Text("保存导出文件")
                }
            }
            SocratesTextButton(onClick = onDismiss, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                Text("关闭")
            }
        }
    }
}
