package com.socrates.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.socrates.android.data.ChatMessage

@Composable
internal fun AttachmentStrip(
    attachments: List<PendingAttachment>, enabled: Boolean, onRemove: (String) -> Unit,
    onMove: (String, Int) -> Unit, onEdit: (String, String, String) -> String?,
) {
    var editingKey by remember { mutableStateOf<String?>(null) }
    // Never keep an invisible editor draft alive after sending/loading or removing its target.
    LaunchedEffect(enabled, attachments.map { it.key }) {
        if (!enabled || attachments.none { it.key == editingKey }) editingKey = null
    }
    if (attachments.isEmpty()) return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("待发送附件 ${attachments.size}/${AttachmentDraft.MAX_COUNT}", style = MaterialTheme.typography.labelMedium, color = SocratesDesign.Muted)
        LazyRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            itemsIndexed(attachments, key = { _, item -> item.key }) { index, attachment ->
                Column(Modifier.width(264.dp).background(SocratesDesign.Page, RoundedCornerShape(16.dp)).padding(8.dp)
                    .semantics {
                        customActions = if (!enabled) emptyList() else buildList {
                            if (index > 0) add(CustomAccessibilityAction("前移附件") { onMove(attachment.key, -1); true })
                            if (index < attachments.lastIndex) add(CustomAccessibilityAction("后移附件") { onMove(attachment.key, 1); true })
                        }
                    }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ReferenceIcon(ReferenceGlyph.Paperclip, null, Modifier.size(18.dp))
                        Text(attachment.name, Modifier.weight(1f).padding(horizontal = 8.dp), maxLines = 2,
                            overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                        SocratesIconButton(onClick = { onRemove(attachment.key) }, enabled = enabled) {
                            ReferenceIcon(ReferenceGlyph.Close, "移除附件：${attachment.name}", Modifier.size(18.dp))
                        }
                    }
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("${index + 1}/${attachments.size}", Modifier.padding(horizontal = 4.dp),
                            style = MaterialTheme.typography.labelSmall, color = SocratesDesign.Muted)
                        SocratesIconButton(onClick = { onMove(attachment.key, -1) }, enabled = enabled && index > 0) {
                            ReferenceIcon(ReferenceGlyph.ArrowUp, "前移附件：${attachment.name}", Modifier.size(18.dp))
                        }
                        SocratesIconButton(onClick = { onMove(attachment.key, 1) }, enabled = enabled && index < attachments.lastIndex) {
                            ReferenceIcon(ReferenceGlyph.ArrowDown, "后移附件：${attachment.name}", Modifier.size(18.dp))
                        }
                        Spacer(Modifier.weight(1f))
                        if (AttachmentDraft.canEdit(attachment)) {
                            SocratesIconButton(onClick = { editingKey = attachment.key }, enabled = enabled) {
                                ReferenceIcon(ReferenceGlyph.Compose, "编辑附件文字：${attachment.name}", Modifier.size(18.dp))
                            }
                        }
                    }
                }
            }
        }
        Text("可逐个添加、横滑查看；箭头调整发送顺序，笔形按钮编辑本次文字。移除或编辑不删除、不修改资料库原件。图片预览合计上限 400 万字符。",
            style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
    }
    if (enabled) attachments.firstOrNull { it.key == editingKey && AttachmentDraft.canEdit(it) }?.let { attachment ->
        key(attachment.key) {
            AttachmentTextEditor(attachment, { text -> onEdit(attachment.key, attachment.text, text) }, { editingKey = null })
        }
    }
}

internal data class MessageAttachmentPreview(val name: String, val dataUrl: String?)

/** Only renders received inline images; durable references remain available in conversation resources. */
internal fun messageAttachmentPreviews(message: ChatMessage): List<MessageAttachmentPreview> {
    val rows = message.wire?.optJSONArray("attachments")
    if (rows != null && rows.length() > 0) return (0 until minOf(rows.length(), 20)).mapNotNull { index ->
        val row = rows.optJSONObject(index) ?: return@mapNotNull null
        MessageAttachmentPreview((row.opt("name") as? String)?.takeIf { it.isNotBlank() } ?: "未命名附件",
            (row.opt("dataUrl") as? String)?.takeIf { row.optString("kind") == "image" && it.startsWith("data:image/") })
    }
    return if (message.attachmentName != null || message.imageDataUrl != null)
        listOf(MessageAttachmentPreview(message.attachmentName ?: "图片", message.imageDataUrl)) else emptyList()
}

@Composable
internal fun MessageAttachmentList(message: ChatMessage) {
    val previews = remember(message.imageDataUrl, message.attachmentName, message.wire?.toString()) { messageAttachmentPreviews(message) }
    previews.forEach { attachment ->
        attachment.dataUrl?.let { MessageImage(it, attachment.name) }
        Text("附件 · ${attachment.name}", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted,
            modifier = Modifier.padding(vertical = 4.dp))
    }
}
