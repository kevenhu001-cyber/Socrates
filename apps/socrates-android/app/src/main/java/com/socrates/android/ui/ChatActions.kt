@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.socrates.android.ui

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import com.socrates.android.ui.ReferenceIcon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.socrates.android.data.ChatMessage

internal fun shareTranscript(context: Context, messages: List<ChatMessage>) {
    val text = messages.joinToString("\n\n") { message ->
        (if (message.role == "user") "我" else "Socrates") + "\n" + message.content
    }
    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text)
    }, "分享聊天文本"))
}

@Composable
internal fun AttachmentSheet(onDismiss: () -> Unit, onCamera: () -> Unit, onPhoto: () -> Unit,
    onFileSources: () -> Unit, onPlugins: () -> Unit,
    onReasoning: () -> Unit, reasoning: String) {
    val density = LocalDensity.current
    Popup(alignment = Alignment.BottomStart,
        offset = with(density) { IntOffset(24.dp.roundToPx(), -12.dp.roundToPx()) },
        onDismissRequest = onDismiss, properties = PopupProperties(focusable = true)) {
        Column(Modifier.widthIn(max = 258.dp).width(258.dp).navigationBarsPadding().shadow(12.dp, RoundedCornerShape(30.dp)).background(Color.White, RoundedCornerShape(30.dp))) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                AttachmentAction(ReferenceGlyph.Camera, "拍照", onCamera)
                AttachmentAction(ReferenceGlyph.Image, "照片", onPhoto)
                AttachmentAction(ReferenceGlyph.Paperclip, "文件", onFileSources)
                AttachmentAction(ReferenceGlyph.Plugin, "插件", onPlugins)
                AttachmentAction(ReferenceGlyph.Reasoning, "推理强度", onReasoning, active = reasoning != "none")
            }
        }
    }
}

@Composable
internal fun FileSourceSheet(onDismiss: () -> Unit, onDevice: () -> Unit, onLibrary: () -> Unit) {
    SocratesSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp)) {
            Text("添加文件", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(start = 6.dp, bottom = 8.dp))
            AttachmentAction(ReferenceGlyph.Paperclip, "从设备选择", onDevice)
            AttachmentAction(ReferenceGlyph.Archive, "从资料库选择", onLibrary)
        }
    }
}

@Composable
private fun AttachmentAction(icon: ReferenceGlyph, title: String, onClick: () -> Unit, active: Boolean = false) {
    Row(Modifier.fillMaxWidth().height(58.dp).clickable(role = androidx.compose.ui.semantics.Role.Button, onClick = onClick)
        .padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(44.dp).background(Color(0xFFF0F0F0), CircleShape), contentAlignment = Alignment.Center) {
            ReferenceIcon(icon, tint = if (active) SocratesDesign.Blue else SocratesDesign.Ink)
        }
        Spacer(Modifier.width(12.dp))
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, color = if (active) SocratesDesign.Blue else SocratesDesign.Ink)
        if (active) ReferenceIcon(ReferenceGlyph.Check, modifier = Modifier.size(20.dp), tint = SocratesDesign.Blue)
    }
}

@Composable
internal fun ReasoningPicker(value: String, enabled: Boolean, onSelect: (String) -> Unit, onDismiss: () -> Unit) {
    SocratesSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().padding(20.dp)) {
            Text("推理强度", style = MaterialTheme.typography.headlineSmall)
            Text("应用于下一次回复；实际支持程度取决于当前模型。", Modifier.padding(top = 8.dp, bottom = 14.dp), color = Color.Gray, style = MaterialTheme.typography.bodyMedium)
            listOf("none" to "不启用", "low" to "轻量", "medium" to "标准", "high" to "深入").forEach { (key, label) ->
                SocratesMenuItem(text = { Text(label) }, onClick = { onSelect(key) }, enabled = enabled,
                    leadingIcon = { ReferenceIcon(ReferenceGlyph.Reasoning, tint = if (key == value) SocratesDesign.Blue else Color.Gray) },
                    trailingIcon = if (key == value) ({ ReferenceIcon(ReferenceGlyph.Check, "已选择", tint = SocratesDesign.Blue) }) else null)
            }
            SocratesTextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.End)) { Text("关闭") }
        }
    }
}
