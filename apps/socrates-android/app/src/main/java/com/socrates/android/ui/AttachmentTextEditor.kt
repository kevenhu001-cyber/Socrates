package com.socrates.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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

/** Ephemeral, explicitly applied text. Never persisted across draft/account changes. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun AttachmentTextEditor(
    attachment: PendingAttachment,
    onApply: (String) -> String?,
    onDismiss: () -> Unit,
) {
    var text by remember(attachment.key, attachment.text) { mutableStateOf(attachment.text) }
    var error by remember(attachment.key, attachment.text) { mutableStateOf<String?>(null) }
    var confirmDiscard by remember(attachment.key, attachment.text) { mutableStateOf(false) }
    fun close() {
        if (text != attachment.text) confirmDiscard = true else onDismiss()
    }
    SocratesSheet(onDismissRequest = ::close) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("编辑附件文字", style = MaterialTheme.typography.headlineSmall)
            Text(attachment.name, maxLines = 2, overflow = TextOverflow.Ellipsis, color = SocratesDesign.Muted)
            Text("仅修改本次发给模型的文字，不修改资料库原件。清空后不再向正文插入此附件文字，文件引用仍保留。",
                style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            Text("模型若通过工具读取文件引用，仍可能读取原件；这里的删改不是对原件脱敏。",
                style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            SocratesField(text, { value ->
                if (value.length <= AttachmentDraft.MAX_ITEM_TEXT) { text = value; error = null; confirmDiscard = false }
                else error = "每份附件文字最多 100,000 字符，超长输入未加入。"
            }, Modifier.fillMaxWidth().testTag("attachment-text-input"),
                label = { Text("本次附件文字") }, minLines = 4, maxLines = 9)
            Text("${text.length}/${AttachmentDraft.MAX_ITEM_TEXT} · 按 UTF-16 单元计数；消息与全部资料合计最多 200,000",
                style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            Text("这里只编辑已加载的提取文字，不会重新解析原件、编辑图片或恢复提取时未加载的部分。主消息文字会在发送时一并检查上限。",
                style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            error?.let { Text(it, Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Row(Modifier.align(Alignment.End), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SocratesTextButton(onClick = ::close) { Text("取消") }
                SocratesButton(onClick = {
                    error = onApply(text)
                    if (error == null) onDismiss()
                }, enabled = text != attachment.text, modifier = Modifier.testTag("attachment-text-apply")) { Text("应用到草稿") }
            }
        }
    }
    if (confirmDiscard) {
        SocratesAlert(
            onDismissRequest = { confirmDiscard = false },
            title = { Text("放弃未应用的修改？") },
            text = { Text("附件文字的改动尚未应用到草稿，关闭后这些改动会丢失。") },
            confirmButton = { SocratesTextButton(onClick = onDismiss) { Text("放弃修改") } },
            dismissButton = { SocratesTextButton(onClick = { confirmDiscard = false }) { Text("继续编辑") } },
        )
    }
}
