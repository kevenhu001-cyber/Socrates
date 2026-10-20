@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.socrates.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.socrates.android.data.VoiceLanguage
import com.socrates.android.data.VoicePreferencesState

@Composable
fun VoicePreferencesSheet(
    state: VoicePreferencesState, onEdit: (VoiceLanguage) -> Unit,
    onSave: () -> Unit, onReload: () -> Unit, onDismiss: () -> Unit,
) {
    var discard by remember { mutableStateOf(false) }
    fun close() { if (!state.saving) { if (state.dirty) discard = true else onDismiss() } }
    SocratesSheet(onDismissRequest = ::close) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("语音输入偏好", style = MaterialTheme.typography.headlineSmall)
            Text("保存到当前账号，下次启动录音时使用。不会更改正在进行的录音、回复朗读或界面语言。", style = MaterialTheme.typography.bodyMedium, color = SocratesDesign.Muted)
            Text("自动跟随 Android 设备语言，并非自动检测所说语言；最终识别能力和网络需求由设备安装的语音服务决定。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            if (state.loading) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SocratesSpinner(Modifier.size(20.dp)); Text("正在读取账号偏好…")
            }
            state.confirmed?.let { Text("账号已确认：${it.label}", style = MaterialTheme.typography.labelLarge) }
            VoiceLanguage.entries.forEach { language ->
                SocratesCard(enabled = state.canEdit, modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth().selectable(selected = state.selected == language, enabled = state.canEdit,
                        role = Role.RadioButton, onClick = { onEdit(language) }).padding(horizontal = 14.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        SocratesRadio(selected = state.selected == language, onClick = null, enabled = state.canEdit)
                        Text(language.label, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
            if (state.dirty) Text("选择尚未保存，录音仍使用账号已确认的语言。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            state.error?.let { Text(it, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, color = MaterialTheme.colorScheme.error) }
            state.message?.let { Text(it, Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
            SocratesButton(onClick = onSave, enabled = state.canSave, modifier = Modifier.fillMaxWidth()) {
                Text(if (state.saving) "保存中…" else "保存语言偏好")
            }
            SocratesTextButton(onClick = onReload, enabled = !state.loading && !state.saving, modifier = Modifier.fillMaxWidth()) {
                Text(if (state.dirty) "重新读取（放弃未保存选择）" else "重新读取账号偏好")
            }
            SocratesTextButton(onClick = ::close, enabled = !state.saving, modifier = Modifier.fillMaxWidth()) { Text("关闭") }
        }
    }
    if (discard) SocratesAlert(onDismissRequest = { discard = false },
        title = { Text("放弃未保存的选择？") },
        text = { Text("关闭后将保留账号已确认的语言，不会保存当前选择。") },
        confirmButton = { SocratesTextButton(onClick = { discard = false; onDismiss() }) { Text("放弃并关闭") } },
        dismissButton = { SocratesTextButton(onClick = { discard = false }) { Text("继续编辑") } })
}
