package com.topodrive.socrates.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.topodrive.socrates.R
import com.topodrive.socrates.data.Attachment
import com.topodrive.socrates.icons.SocIcons
import com.topodrive.socrates.theme.LocalSocratesColors
import com.topodrive.socrates.util.ChatSupport
import com.topodrive.socrates.vm.AppState
import kotlinx.coroutines.launch

/**
 * Composer — port of the web `#chatInputWrap`: rounded card with attachment
 * chips, a "+" tools trigger (photo/file/camera/scheduled), the effort
 * picker (High/Medium/Low), mic (speech-to-text), and the voice/send FAB.
 */
@Composable
fun Composer(app: AppState, placeholder: Int = R.string.composer_hint) {
    val c = LocalSocratesColors.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val attachments by app.pendingAttachments.collectAsState()
    val isStreaming by app.isStreaming.collectAsState()
    val effort by app.effort.collectAsState()
    val mode by app.appMode.collectAsState()
    var text by remember { mutableStateOf("") }
    var toolsOpen by remember { mutableStateOf(false) }
    var effortOpen by remember { mutableStateOf(false) }
    var listening by remember { mutableStateOf(false) }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) scope.launch { attachUri(ctx, app, uri, "image") }
    }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) scope.launch { attachUri(ctx, app, uri, "file") }
    }

    // Restore draft when switching sessions
    val active by app.active.collectAsState()
    LaunchedEffect(active?.id) {
        text = ""
    }
    val prefill by app.composerPrefill.collectAsState()
    LaunchedEffect(prefill) {
        val p = prefill
        if (p != null) { text = p; app.consumePrefill() }
    }

    fun send() {
        if (text.isBlank() && attachments.isEmpty()) return
        app.sendMessage(text)
        text = ""
    }

    Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
        // Attachment chips
        if (attachments.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp)
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (a in attachments) {
                    Row(
                        Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(c.surfaceRaised)
                            .border(1.dp, c.borderSubtle, RoundedCornerShape(10.dp))
                            .padding(start = 10.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            if (a.kind == "image") SocIcons.Image else SocIcons.FileText,
                            null, tint = c.textMuted, modifier = Modifier.size(13.dp),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(a.name, color = c.text, fontSize = 12.sp, maxLines = 1)
                        Spacer(Modifier.width(4.dp))
                        IconBtn(SocIcons.Close, "remove", { app.removeAttachment(a.id) }, size = 20.dp, iconSize = 11.dp)
                    }
                }
            }
        }

        // Composer card
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(c.surface)
                .border(1.dp, c.borderSubtle, RoundedCornerShape(24.dp)),
        ) {
            BasicTextField(
                value = text,
                onValueChange = { text = it },
                textStyle = TextStyle(color = c.text, fontSize = 15.5.sp, lineHeight = 22.sp),
                cursorBrush = SolidColor(c.text),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 14.dp)
                    .heightIn(min = 24.dp, max = 140.dp),
                decorationBox = { inner ->
                    Box {
                        if (text.isEmpty()) {
                            Text(
                                stringResource(if (mode == "tutor") R.string.composer_hint_tutor else placeholder),
                                color = c.textFaint, fontSize = 15.5.sp,
                            )
                        }
                        inner()
                    }
                },
            )

            Row(
                Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // "+" tools trigger
                Box {
                    IconBtn(SocIcons.Plus, "tools", { toolsOpen = true }, size = 34.dp, iconSize = 19.dp, bg = c.surfaceRaised)
                    DropdownMenu(
                        expanded = toolsOpen,
                        onDismissRequest = { toolsOpen = false },
                        modifier = Modifier.background(c.surfaceRaised),
                    ) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.composer_photo), color = c.text) },
                            leadingIcon = { Icon(SocIcons.Image, null, tint = c.textMuted, modifier = Modifier.size(16.dp)) },
                            onClick = { toolsOpen = false; imagePicker.launch("image/*") },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.composer_file), color = c.text) },
                            leadingIcon = { Icon(SocIcons.FileText, null, tint = c.textMuted, modifier = Modifier.size(16.dp)) },
                            onClick = { toolsOpen = false; filePicker.launch(arrayOf("*/*")) },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.nav_scheduled), color = c.text) },
                            leadingIcon = { Icon(SocIcons.Clock, null, tint = c.textMuted, modifier = Modifier.size(16.dp)) },
                            onClick = { toolsOpen = false; app.openScreen(AppState.Screen.SCHEDULED) },
                        )
                    }
                }

                Spacer(Modifier.width(8.dp))

                // Effort picker
                Box {
                    Row(
                        Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(c.surfaceRaised)
                            .clickable { effortOpen = true }
                            .padding(horizontal = 12.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(SocIcons.Sparkles, null, tint = c.textMuted, modifier = Modifier.size(13.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            when (effort) {
                                "high" -> stringResource(R.string.composer_effort_high)
                                "low" -> stringResource(R.string.composer_effort_low)
                                else -> stringResource(R.string.composer_effort_medium)
                            },
                            color = c.textSecondary, fontSize = 12.5.sp,
                        )
                        Spacer(Modifier.width(2.dp))
                        Icon(SocIcons.ChevronDown, null, tint = c.textMuted, modifier = Modifier.size(12.dp))
                    }
                    DropdownMenu(
                        expanded = effortOpen,
                        onDismissRequest = { effortOpen = false },
                        modifier = Modifier.background(c.surfaceRaised),
                    ) {
                        for ((id, label) in listOf(
                            "high" to stringResource(R.string.composer_effort_high),
                            "medium" to stringResource(R.string.composer_effort_medium),
                            "low" to stringResource(R.string.composer_effort_low),
                        )) {
                            DropdownMenuItem(
                                text = { Text(label, color = if (effort == id) c.text else c.textMuted) },
                                onClick = { app.setEffort(id); effortOpen = false },
                            )
                        }
                    }
                }

                Spacer(Modifier.weight(1f))

                // Mic — speech-to-text into the field
                IconBtn(
                    SocIcons.Mic, "mic",
                    { listening = true },
                    size = 34.dp, iconSize = 17.dp,
                    tint = if (listening) c.voiceBlue else c.textMuted,
                )
                Spacer(Modifier.width(6.dp))

                // Send / stop FAB
                Box(
                    Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(if (isStreaming) c.dangerSoft else c.accent)
                        .clickable { if (isStreaming) app.stopStreaming() else send() },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        if (isStreaming) SocIcons.Stop else SocIcons.ArrowUp,
                        stringResource(R.string.composer_send),
                        tint = if (isStreaming) c.danger else c.onAccent,
                        modifier = Modifier.size(17.dp),
                    )
                }
            }
        }
    }

    if (listening) {
        VoiceCapture(
            onResult = { text = if (text.isBlank()) it else "$text $it"; listening = false },
            onDismiss = { listening = false },
        )
    }
}

internal suspend fun attachUri(ctx: android.content.Context, app: AppState, uri: Uri, kindHint: String) {
    try {
        val cr = ctx.contentResolver
        val mime = cr.getType(uri) ?: "application/octet-stream"
        val name = queryDisplayName(cr, uri) ?: "file"
        val bytes = cr.openInputStream(uri)?.use { it.readBytes() } ?: return
        val isImage = kindHint == "image" || mime.startsWith("image/")
        val dataUrl = if (isImage && bytes.size < 4 * 1024 * 1024) {
            "data:$mime;base64,${android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)}"
        } else null
        app.addAttachment(
            Attachment(
                id = "att_${ChatSupport.uid()}",
                kind = if (isImage) "image" else "file",
                name = name,
                mime = mime,
                dataUrl = dataUrl,
                text = if (!isImage && (mime.startsWith("text/") || name.endsWith(".md"))) String(bytes).take(200_000) else null,
                size = bytes.size.toLong(),
            ),
        )
    } catch (_: Exception) {}
}

private fun queryDisplayName(cr: android.content.ContentResolver, uri: Uri): String? {
    return try {
        cr.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cur ->
            if (cur.moveToFirst()) cur.getString(0) else null
        }
    } catch (_: Exception) { null }
}
