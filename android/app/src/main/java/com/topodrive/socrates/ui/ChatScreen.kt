package com.topodrive.socrates.ui

import android.content.Intent
import android.net.Uri
import android.speech.tts.TextToSpeech
import android.text.method.LinkMovementMethod
import android.widget.TextView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import coil.compose.AsyncImage
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import com.topodrive.socrates.R
import com.topodrive.socrates.data.Message
import com.topodrive.socrates.data.ToolCall
import com.topodrive.socrates.icons.SocIcons
import com.topodrive.socrates.theme.InterFamily
import com.topodrive.socrates.theme.JetBrainsMonoFamily
import com.topodrive.socrates.theme.LocalFontScale
import com.topodrive.socrates.theme.LocalSocratesColors
import com.topodrive.socrates.theme.NewsreaderFamily
import com.topodrive.socrates.util.ChatSupport
import com.topodrive.socrates.util.Markdown
import com.topodrive.socrates.vm.AppState
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * Chat view — port of the web `#chatView`: message list with user bubbles,
 * assistant markdown, collapsible reasoning, tool-run cards, artifact
 * links, message actions (copy / edit / retry / feedback / read aloud),
 * a find-in-chat bar, and the "new reply" jump pill.
 */
@Composable
fun ChatScreen(app: AppState) {
    val c = LocalSocratesColors.current
    val messages by app.activeMessages.collectAsState()
    val isStreaming by app.isStreaming.collectAsState()
    val streamText by app.streamText.collectAsState()
    val streamReasoning by app.streamReasoning.collectAsState()
    val streamTools by app.streamTools.collectAsState()
    val streamError by app.streamError.collectAsState()
    val fontScale = LocalFontScale.current
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var editingId by remember { mutableStateOf<String?>(null) }
    var editText by remember { mutableStateOf("") }

    val showJumpPill by remember {
        derivedStateOf {
            val idx = listState.firstVisibleItemIndex
            messages.isNotEmpty() && idx < messages.size - 2
        }
    }

    LaunchedEffect(messages.size, isStreaming) {
        if (messages.isNotEmpty() || isStreaming) {
            // auto-scroll to tail unless user scrolled up
            val last = messages.size + (if (isStreaming) 1 else 0) - 1
            if (!showJumpPill && last >= 0) listState.scrollToItem(last)
        }
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            itemsIndexed(messages, key = { i, m -> m.id ?: "m$i" }) { _, msg ->
                MessageRow(
                    app = app,
                    msg = msg,
                    onEdit = { editingId = msg.id; editText = msg.text },
                )
            }
            if (isStreaming) {
                item(key = "streaming") {
                    AssistantBubble(
                        text = streamText,
                        reasoning = streamReasoning,
                        toolCalls = streamTools,
                        streaming = true,
                    )
                }
            }
            streamError?.let { err ->
                item {
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                            .background(c.dangerSoft).padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(SocIcons.AlertCircle, null, tint = c.danger, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(err, color = c.danger, fontSize = 13.sp, modifier = Modifier.weight(1f))
                        SocButton(stringResource(R.string.action_retry), { app.retryLast() }, small = true, primary = false)
                    }
                }
            }
            item { Spacer(Modifier.height(4.dp)) }
        }

        if (showJumpPill) {
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 8.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(c.surfaceRaised)
                    .border(1.dp, c.borderStrong, RoundedCornerShape(999.dp))
                    .clickable { scope.launch { listState.scrollToItem(messages.size) } }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(SocIcons.ArrowDown, null, tint = c.text, modifier = Modifier.size(13.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.chat_new_reply), color = c.text, fontSize = 12.5.sp)
                }
            }
        }
    }

    // Edit dialog
    if (editingId != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { editingId = null },
            containerColor = c.surface,
            title = { Text(stringResource(R.string.chat_edit), color = c.text) },
            text = {
                SocField(editText, { editText = it }, "", singleLine = false)
            },
            confirmButton = {
                SocButton(stringResource(R.string.composer_send), {
                    val id = editingId
                    editingId = null
                    if (id != null) app.editAndResend(id, editText)
                }, small = true)
            },
            dismissButton = {
                SocButton(stringResource(R.string.action_cancel), { editingId = null }, primary = false, small = true)
            },
        )
    }
}

/* ── Message row ── */

@Composable
private fun MessageRow(app: AppState, msg: Message, onEdit: () -> Unit) {
    val c = LocalSocratesColors.current
    val fontScale = LocalFontScale.current
    val ctx = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var showActions by remember { mutableStateOf(false) }
    var copied by remember { mutableStateOf(false) }

    if (msg.role == "user") {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
            Column(
                Modifier
                    .widthIn(max = 320.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(c.surfaceRaised)
                    .padding(horizontal = 16.dp, vertical = 10.dp)
                    .clickable { showActions = !showActions },
            ) {
                msg.attachments?.forEach { a ->
                    if (a.kind == "image" && a.dataUrl != null) {
                        val bytes = remember(a.id) {
                            try {
                                android.util.Base64.decode(a.dataUrl.substringAfter(","), android.util.Base64.DEFAULT)
                            } catch (_: Exception) { null }
                        }
                        if (bytes != null) {
                            AsyncImage(
                                model = bytes,
                                contentDescription = a.name,
                                modifier = Modifier.fillMaxWidth().heightIn(max = 200.dp).clip(RoundedCornerShape(12.dp)).padding(bottom = 6.dp),
                                contentScale = ContentScale.Crop,
                            )
                        }
                    } else {
                        Row(Modifier.padding(bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(SocIcons.FileText, null, tint = c.textMuted, modifier = Modifier.size(13.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(a.name, color = c.textSecondary, fontSize = 12.sp)
                        }
                    }
                }
                if (msg.text.isNotBlank()) {
                    Text(
                        msg.text,
                        color = c.text,
                        fontSize = (15f * fontScale).sp,
                        fontFamily = InterFamily,
                        lineHeight = (22f * fontScale).sp,
                    )
                }
            }
            if (showActions) {
                MessageActions(
                    onCopy = { clipboard.setText(AnnotatedString(msg.text)); copied = true },
                    onEdit = onEdit,
                    onRetry = null,
                    onSpeak = { speak(ctx, msg.text) },
                    feedback = null,
                    copied = copied,
                    userMessage = true,
                )
            }
        }
    } else {
        Column(Modifier.fillMaxWidth().clickable { showActions = !showActions }) {
            AssistantBubble(
                text = msg.text,
                reasoning = msg.reasoningContent,
                toolCalls = msg.toolCalls ?: emptyList(),
                streaming = false,
            )
            if (showActions) {
                MessageActions(
                    onCopy = { clipboard.setText(AnnotatedString(msg.text)); copied = true },
                    onEdit = null,
                    onRetry = { app.retryLast() },
                    onSpeak = { speak(ctx, msg.text) },
                    feedback = msg.feedback,
                    onFeedback = { rating -> feedbackOn(app, msg, rating) },
                    copied = copied,
                    userMessage = false,
                )
            }
        }
    }
}

private fun feedbackOn(app: AppState, msg: Message, rating: String) {
    val id = msg.id ?: return
    kotlinx.coroutines.GlobalScope.launch {
        try { com.topodrive.socrates.data.Api.feedbackMessage(id, rating) } catch (_: Exception) {}
    }
}

private fun speak(ctx: android.content.Context, text: String) {
    var tts: TextToSpeech? = null
    tts = TextToSpeech(ctx) { status ->
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.getDefault()
            tts?.speak(text.take(4000), TextToSpeech.QUEUE_FLUSH, null, "soc-${text.hashCode()}")
        }
    }
}

/* ── Assistant bubble (markdown + reasoning + tools) ── */

@Composable
private fun AssistantBubble(
    text: String,
    reasoning: String?,
    toolCalls: List<ToolCall>,
    streaming: Boolean,
) {
    val c = LocalSocratesColors.current
    val fontScale = LocalFontScale.current
    var reasoningOpen by remember { mutableStateOf(false) }
    val split = remember(text) { ChatSupport.extractThink(text) }
    val visible = if (split.reasoning != null) split.visible else text
    val reasoningText = listOfNotNull(reasoning?.ifBlank { null }, split.reasoning).joinToString("\n").ifBlank { null }

    Column(Modifier.fillMaxWidth()) {
        // Reasoning — collapsible chip like the web "Reasoning" disclosure
        if (reasoningText != null) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(c.reasoningBg)
                    .clickable { reasoningOpen = !reasoningOpen }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(SocIcons.Sparkles, null, tint = c.reasoningFg, modifier = Modifier.size(13.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.chat_reasoning), color = c.reasoningFg, fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                    Icon(if (reasoningOpen) SocIcons.ChevronUp else SocIcons.ChevronDown, null, tint = c.reasoningFg, modifier = Modifier.size(14.dp))
                }
                if (reasoningOpen) {
                    Spacer(Modifier.height(8.dp))
                    Text(reasoningText, color = c.reasoningFg, fontSize = 13.sp, lineHeight = 19.sp, fontFamily = InterFamily)
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        // Tool calls
        for (tc in toolCalls) ToolCallCard(tc)

        // Markdown body
        if (visible.isNotBlank()) {
            MarkdownBody(visible, fontScale)
        } else if (streaming) {
            Text(stringResource(R.string.chat_thinking), color = c.textMuted, fontSize = 14.sp)
        }
        if (streaming) {
            // blinking caret
            val alpha by rememberInfiniteTransition(label = "caret")
                .animateFloat(0f, 1f, infiniteRepeatable(tween(600)), label = "a")
            Box(Modifier.padding(top = 4.dp).size(width = 9.dp, height = 18.dp).background(c.text.copy(alpha = alpha)))
        }
    }
}

/* ── Tool call card ── */

@Composable
private fun ToolCallCard(tc: ToolCall) {
    val c = LocalSocratesColors.current
    var open by remember { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxWidth()
            .padding(bottom = 6.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(c.toolCardBg)
            .border(1.dp, c.toolCardBorder, RoundedCornerShape(12.dp))
            .clickable { open = !open }
            .padding(horizontal = 12.dp, vertical = 9.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(SocIcons.ToolRun, null, tint = c.textMuted, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(8.dp))
            Text(tc.name, color = c.text, fontSize = 12.5.sp, fontFamily = JetBrainsMonoFamily, modifier = Modifier.weight(1f), maxLines = 1)
            val statusColor = when (tc.status) {
                "done" -> c.success
                "error" -> c.danger
                else -> c.textMuted
            }
            val statusText = when (tc.status) {
                "done" -> stringResource(R.string.chat_tool_done)
                "error" -> stringResource(R.string.chat_tool_error)
                else -> stringResource(R.string.chat_tool_running)
            }
            Text(statusText, color = statusColor, fontSize = 11.sp)
        }
        if (open) {
            tc.argumentsText?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(6.dp))
                Text(it, color = c.textMuted, fontSize = 11.5.sp, fontFamily = JetBrainsMonoFamily, maxLines = 8)
            }
            tc.output?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(6.dp))
                Text(it.take(4000), color = c.textSecondary, fontSize = 12.sp, fontFamily = JetBrainsMonoFamily, maxLines = 20)
            }
            tc.errorText?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(6.dp))
                Text(it, color = c.danger, fontSize = 12.sp)
            }
            // artifact refs → open in browser
            tc.artifacts?.forEach { a ->
                val ctx = LocalContext.current
                Row(
                    Modifier.padding(top = 6.dp).clip(RoundedCornerShape(8.dp)).clickable {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${com.topodrive.socrates.data.Api.webBaseUrl}/artifacts/${a.id}")))
                    },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(SocIcons.Sparkles, null, tint = c.textMuted, modifier = Modifier.size(12.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(a.name ?: a.id, color = c.textSecondary, fontSize = 12.sp)
                    Spacer(Modifier.width(4.dp))
                    Icon(SocIcons.ExternalLink, null, tint = c.textFaint, modifier = Modifier.size(11.dp))
                }
            }
        }
    }
}

/* ── Message actions bar ── */

@Composable
private fun MessageActions(
    onCopy: () -> Unit,
    onEdit: (() -> Unit)?,
    onRetry: (() -> Unit)?,
    onSpeak: () -> Unit,
    feedback: String? = null,
    onFeedback: ((String) -> Unit)? = null,
    copied: Boolean,
    userMessage: Boolean,
) {
    val c = LocalSocratesColors.current
    Row(
        Modifier
            .padding(top = 6.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(c.surface)
            .border(1.dp, c.borderSubtle, RoundedCornerShape(999.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ActionIcon(if (copied) SocIcons.Check else SocIcons.Copy, stringResource(R.string.chat_copy), onCopy, tint = if (copied) c.success else c.textMuted)
        onEdit?.let { ActionIcon(SocIcons.Pencil, stringResource(R.string.chat_edit), it) }
        onRetry?.let { ActionIcon(SocIcons.Refresh, stringResource(R.string.chat_retry), it) }
        ActionIcon(SocIcons.Volume, stringResource(R.string.chat_read_aloud), onSpeak)
        if (!userMessage && onFeedback != null) {
            ActionIcon(SocIcons.ThumbsUp, stringResource(R.string.chat_like), { onFeedback("up") }, tint = if (feedback == "up") c.success else c.textMuted)
            ActionIcon(SocIcons.ThumbsDown, stringResource(R.string.chat_dislike), { onFeedback("down") }, tint = if (feedback == "down") c.danger else c.textMuted)
        }
    }
}

@Composable
private fun ActionIcon(icon: ImageVector, desc: String, onClick: () -> Unit, tint: Color = LocalSocratesColors.current.textMuted) {
    IconBtn(icon, desc, onClick, size = 32.dp, iconSize = 15.dp, tint = tint)
}

/* ══════════ Markdown body renderer ══════════ */

@Composable
fun MarkdownBody(md: String, fontScale: Float = 1f) {
    val blocks = remember(md) { Markdown.parse(md) }
    Column(Modifier.fillMaxWidth()) {
        for (b in blocks) MarkdownBlockView(b, fontScale)
    }
}

@Composable
private fun MarkdownBlockView(b: Markdown.Block, fontScale: Float) {
    val c = LocalSocratesColors.current
    val ctx = LocalContext.current
    when (b) {
        is Markdown.Block.Heading -> {
            val size = when (b.level) { 1 -> 24f; 2 -> 20f; 3 -> 18f; else -> 16f }
            Text(
                inlineText(b.spans, c, fontScale * (size / 15f)),
                style = TextStyle(lineHeight = (size * 1.4f * fontScale).sp, fontWeight = FontWeight.SemiBold),
                modifier = Modifier.padding(top = 10.dp, bottom = 4.dp),
            )
        }
        is Markdown.Block.Paragraph -> {
            Text(
                inlineText(b.spans, c, fontScale),
                style = TextStyle(lineHeight = (23f * fontScale).sp),
                modifier = Modifier.padding(vertical = 4.dp),
            )
        }
        is Markdown.Block.Code -> CodeBlock(b.lang, b.code, fontScale)
        is Markdown.Block.ListBlock -> {
            Column(Modifier.padding(start = 6.dp, top = 4.dp)) {
                for (item in b.items) {
                    Row(Modifier.padding(vertical = 2.dp)) {
                        Text(
                            if (b.ordered) "${item.index}." else "•",
                            color = c.textMuted,
                            fontSize = (15f * fontScale).sp,
                            modifier = Modifier.width(20.dp),
                        )
                        Column(Modifier.weight(1f)) {
                            Text(inlineText(item.spans, c, fontScale), style = TextStyle(lineHeight = (23f * fontScale).sp))
                            for (child in item.children) MarkdownBlockView(child, fontScale)
                        }
                    }
                }
            }
        }
        is Markdown.Block.Quote -> {
            Row(Modifier.padding(vertical = 4.dp)) {
                Box(Modifier.width(3.dp).height(18.dp).background(c.borderStrong))
                Spacer(Modifier.width(10.dp))
                Column {
                    for (inner in b.blocks) MarkdownBlockView(inner, fontScale)
                }
            }
        }
        is Markdown.Block.Table -> {
            Column(
                Modifier
                    .padding(vertical = 6.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, c.borderSubtle, RoundedCornerShape(8.dp))
                    .horizontalScroll(rememberScrollState()),
            ) {
                Row(Modifier.background(c.surfaceRaised).padding(8.dp)) {
                    for (cell in b.header) {
                        Text(inlineText(cell, c, fontScale, bold = true), style = TextStyle(lineHeight = (20f * fontScale).sp), modifier = Modifier.widthIn(min = 70.dp).padding(end = 14.dp))
                    }
                }
                for (row in b.rows) {
                    Row(Modifier.border(0.5.dp, c.borderSubtle).padding(8.dp)) {
                        for (cell in row) {
                            Text(inlineText(cell, c, fontScale), style = TextStyle(lineHeight = (20f * fontScale).sp), modifier = Modifier.widthIn(min = 70.dp).padding(end = 14.dp))
                        }
                    }
                }
            }
        }
        Markdown.Block.Rule -> Box(Modifier.padding(vertical = 8.dp).fillMaxWidth().height(1.dp).background(c.borderSubtle))
        is Markdown.Block.Math -> {
            Text(
                b.tex,
                color = c.textSecondary,
                fontFamily = JetBrainsMonoFamily,
                fontSize = (13f * fontScale).sp,
                modifier = Modifier.padding(vertical = 6.dp),
            )
        }
    }
}

@Composable
private fun CodeBlock(lang: String?, code: String, fontScale: Float) {
    val c = LocalSocratesColors.current
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(c.codeBg)
            .border(1.dp, c.codeBorder, RoundedCornerShape(12.dp)),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(lang ?: "", color = c.textMuted, fontSize = 11.sp, fontFamily = JetBrainsMonoFamily, modifier = Modifier.weight(1f))
            Text(
                stringResource(if (copied) R.string.chat_copied else R.string.chat_copy),
                color = if (copied) c.success else c.textMuted,
                fontSize = 11.sp,
                modifier = Modifier.clickable { clipboard.setText(AnnotatedString(code)); copied = true },
            )
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.codeBorder))
        SelectionContainer {
            Text(
                code,
                color = c.codeFg,
                fontFamily = JetBrainsMonoFamily,
                fontSize = (12.5f * fontScale).sp,
                lineHeight = (18f * fontScale).sp,
                modifier = Modifier.padding(12.dp).horizontalScroll(rememberScrollState()),
            )
        }
    }
}

/** Build AnnotatedString for inline spans — bold/italic/strike/code/link/math. */
@Composable
private fun inlineText(spans: List<Markdown.Inline>, c: com.topodrive.socrates.theme.SocratesColors, fontScale: Float, bold: Boolean = false): AnnotatedString {
    return buildAnnotatedString {
        fun emit(list: List<Markdown.Inline>, style: SpanStyle) {
            for (s in list) {
                when (s) {
                    is Markdown.Inline.Text -> withStyle(style) { append(s.text) }
                    is Markdown.Inline.Bold -> emit(s.children, style.copy(fontWeight = FontWeight.Bold))
                    is Markdown.Inline.Italic -> emit(s.children, style.copy(fontStyle = FontStyle.Italic))
                    is Markdown.Inline.Strike -> emit(s.children, style.copy(textDecoration = TextDecoration.LineThrough))
                    is Markdown.Inline.Code -> withStyle(
                        style.copy(
                            fontFamily = JetBrainsMonoFamily,
                            background = c.surfaceRaised,
                            fontSize = (13.5f * fontScale).sp,
                        ),
                    ) { append(s.text) }
                    is Markdown.Inline.Link -> {
                        pushStringAnnotation("URL", s.url)
                        withStyle(style.copy(color = if (c.dark) Color(0xFF8AB4F8) else Color(0xFF1A56DB), textDecoration = TextDecoration.Underline)) {
                            append(s.text)
                        }
                        pop()
                    }
                    is Markdown.Inline.MathInline -> withStyle(style.copy(fontFamily = JetBrainsMonoFamily)) { append(s.tex) }
                }
            }
        }
        emit(
            spans,
            SpanStyle(
                color = c.text,
                fontSize = (15f * fontScale).sp,
                fontFamily = InterFamily,
                fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
            ),
        )
    }
}
