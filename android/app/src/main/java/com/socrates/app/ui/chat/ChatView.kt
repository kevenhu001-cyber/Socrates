package com.socrates.app.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.socrates.app.R
import com.socrates.app.data.AppContainer
import com.socrates.app.model.SessionMessage
import com.socrates.app.ui.common.MarkdownText
import com.socrates.app.ui.theme.SocratesDimens
import com.socrates.app.ui.theme.SocratesTheme
import kotlinx.coroutines.launch

@Composable
fun ChatView(
    container: AppContainer,
    sessionId: String?,
    onSessionCreated: (String) -> Unit
) {
    val vm: ChatViewModel = viewModel(factory = ChatViewModel.Factory(container))
    val state by vm.ui.collectAsStateWithLifecycle()
    val agent by vm.agent.collectAsStateWithLifecycle()

    LaunchedEffect(sessionId) {
        if (sessionId != null) vm.loadSession(sessionId)
    }
    LaunchedEffect(state.sessionId) {
        if (state.sessionId != null && state.sessionId != sessionId) onSessionCreated(state.sessionId!!)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        when (state.phase) {
            ChatViewModel.Phase.TOPIC -> TopicSetup(state = state, onTopicChange = vm::setTopic, onBegin = vm::beginTopic)
            else -> ChatStream(vm = vm, state = state, agent = agent)
        }
    }
}

// ──────────────────────────────────────────────
// Topic setup — displayed when no session active
// ──────────────────────────────────────────────
@Composable
private fun TopicSetup(
    state: ChatViewModel.UiState,
    onTopicChange: (String) -> Unit,
    onBegin: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(SocratesDimens.grid24),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            stringResource(R.string.topic_setup_title),
            fontFamily = FontFamily.Serif,
            fontSize = 20.sp,
            fontWeight = FontWeight.Medium,
            color = SocratesTheme.colors.text200,
            textAlign = TextAlign.Center,
            lineHeight = 1.4.sp
        )
        Spacer(Modifier.height(SocratesDimens.grid8))
        Text(
            stringResource(R.string.topic_setup_sub),
            color = SocratesTheme.colors.text400,
            fontSize = 14.sp,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(SocratesDimens.grid24))

        // Topic input — matches #topicInput from CSS
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 520.dp),
            shape = RoundedCornerShape(SocratesDimens.radius16),
            color = SocratesTheme.colors.bg000,
            tonalElevation = 0.dp
        ) {
            BasicTextField(
                value = state.topic,
                onValueChange = onTopicChange,
                textStyle = MaterialTheme.typography.bodyLarge.copy(
                    color = SocratesTheme.colors.text100,
                    fontSize = 15.sp
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 60.dp, max = 120.dp)
                    .padding(horizontal = SocratesDimens.grid14, vertical = SocratesDimens.grid10)
            ) { innerTextField ->
                if (state.topic.isEmpty()) {
                    Text(
                        stringResource(R.string.topic_input_hint),
                        color = SocratesTheme.colors.text400,
                        fontSize = 15.sp
                    )
                }
                innerTextField()
            }
        }
        Spacer(Modifier.height(SocratesDimens.grid16))

        // Start button — mirrors .start-btn CSS
        Button(
            onClick = onBegin,
            enabled = state.topic.isNotBlank() && !state.busy,
            shape = RoundedCornerShape(SocratesDimens.radius10),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (state.topic.isNotBlank())
                    SocratesTheme.colors.accent000 else SocratesTheme.colors.bg300,
                contentColor = if (state.topic.isNotBlank())
                    SocratesTheme.colors.oncolor100 else SocratesTheme.colors.text400,
                disabledContainerColor = SocratesTheme.colors.bg300,
                disabledContentColor = SocratesTheme.colors.text400
            ),
            modifier = Modifier.heightIn(min = 36.dp)
        ) {
            if (state.busy) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = SocratesTheme.colors.oncolor100
                )
            } else Text(stringResource(R.string.begin), fontWeight = FontWeight.Medium)
        }

        state.error?.let {
            Spacer(Modifier.height(SocratesDimens.grid12))
            Text(it, color = SocratesTheme.colors.error, fontSize = 12.sp, textAlign = TextAlign.Center)
        }
    }
}

// ──────────────────────────────────────────────
// Chat stream — messages + input
// ──────────────────────────────────────────────
@Composable
private fun ChatStream(
    vm: ChatViewModel,
    state: ChatViewModel.UiState,
    agent: ChatViewModel.AgentState
) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var input by rememberSaveable(state.sessionId) { mutableStateOf("") }
    val focusManager = LocalFocusManager.current

    // Auto-scroll when new messages arrive
    LaunchedEffect(state.messages.size, agent.text) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.size - 1)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Topic badge bar — mirrors web .topic-badge area
        Surface(
            color = SocratesTheme.colors.bg200,
            tonalElevation = 0.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(
                    horizontal = SocratesDimens.grid16,
                    vertical = SocratesDimens.grid8
                ),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Topic dot
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(SocratesTheme.colors.accent000)
                )
                Spacer(Modifier.width(SocratesDimens.grid8))
                Text(
                    state.topic.ifBlank { state.title.orEmpty() },
                    color = SocratesTheme.colors.text300,
                    fontSize = 13.sp,
                    maxLines = 1,
                    modifier = Modifier.weight(1f)
                )
                // Plan badge — mirrors .plan-badge
                Text(
                    state.tier.replaceFirstChar { it.uppercase() },
                    color = SocratesTheme.colors.text500,
                    fontSize = 11.sp
                )
            }
        }
        HorizontalDivider(color = SocratesTheme.colors.border100.copy(alpha = 0.08f))

        // Messages list
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(SocratesTheme.colors.bg100),
            contentPadding = PaddingValues(SocratesDimens.grid16),
            verticalArrangement = Arrangement.spacedBy(SocratesDimens.grid14)
        ) {
            items(state.messages, key = { "${it.role}_${it.createdAt}" }) { msg ->
                AnimatedVisibility(
                    visible = true,
                    enter = fadeIn(animationSpec = androidx.compose.animation.core.tween(300)) +
                            slideInVertically { it / 2 }
                ) {
                    MessageBubble(msg)
                }
            }
            // Agent bubble
            if (agent.running || agent.text.isNotEmpty() || agent.steps.isNotEmpty()) {
                item {
                    AnimatedVisibility(
                        visible = true,
                        enter = fadeIn(animationSpec = androidx.compose.animation.core.tween(400))
                    ) {
                        AgentBubble(agent = agent)
                    }
                }
            }
            // Streaming indicator
            if (state.streaming) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(14.dp),
                            strokeWidth = 1.5.dp,
                            color = SocratesTheme.colors.text500
                        )
                        Spacer(Modifier.width(SocratesDimens.grid6))
                        Text(
                            "Socrates is thinking…",
                            color = SocratesTheme.colors.text500,
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }

        // Chat input bar
        ChatInput(
            value = input,
            onValueChange = { input = it },
            streaming = state.streaming || agent.running,
            onSend = {
                if (state.mode == ChatViewModel.ChatMode.AGENT) vm.runAgent(input.trim())
                else vm.send(input.trim())
                input = ""
                focusManager.clearFocus()
            },
            onStop = { vm.stop() }
        )
    }
}

// ──────────────────────────────────────────────
// Message bubble — matches web .msg.user / .msg
// ──────────────────────────────────────────────
@Composable
private fun MessageBubble(msg: SessionMessage) {
    val isUser = msg.role == "user"
    val align = if (isUser) Alignment.End else Alignment.Start

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = align
    ) {
        Row(
            verticalAlignment = Alignment.Top,
            modifier = Modifier.widthIn(max = SocratesDimens.chatContentMaxWidth)
        ) {
            // Assistant icon
            if (!isUser) {
                Icon(
                    Icons.Default.AutoAwesome,
                    contentDescription = null,
                    tint = SocratesTheme.colors.accent000,
                    modifier = Modifier
                        .size(18.dp)
                        .padding(top = 2.dp)
                )
                Spacer(Modifier.width(SocratesDimens.grid6))
            }

            // Bubble — matches web .msg-body
            Surface(
                color = if (isUser) SocratesTheme.colors.bg000 else SocratesTheme.colors.bg200,
                shape = if (isUser) RoundedCornerShape(
                    topStart = SocratesDimens.radius16,
                    topEnd = SocratesDimens.radius16,
                    bottomStart = SocratesDimens.radius16,
                    bottomEnd = 4.dp
                ) else RoundedCornerShape(
                    topStart = SocratesDimens.radius16,
                    topEnd = SocratesDimens.radius16,
                    bottomStart = 4.dp,
                    bottomEnd = SocratesDimens.radius16
                ),
                tonalElevation = 0.dp,
                border = if (!isUser) androidx.compose.foundation.BorderStroke(
                    0.5.dp,
                    SocratesTheme.colors.border100.copy(alpha = 0.1f)
                ) else null,
                modifier = Modifier.widthIn(max = 560.dp)
            ) {
                Column(modifier = Modifier.padding(SocratesDimens.grid12)) {
                    if (isUser) {
                        Text(
                            msg.content,
                            color = SocratesTheme.colors.text100,
                            fontSize = 14.sp,
                            lineHeight = 1.65.sp
                        )
                    } else {
                        MarkdownText(
                            msg.content,
                            color = SocratesTheme.colors.text100
                        )
                    }
                }
            }

            // User icon
            if (isUser) {
                Spacer(Modifier.width(SocratesDimens.grid6))
                Box(
                    modifier = Modifier
                        .size(18.dp)
                        .padding(top = 2.dp),
                    contentAlignment = Alignment.TopCenter
                ) {
                    Icon(
                        Icons.Default.Person,
                        contentDescription = null,
                        tint = SocratesTheme.colors.text500,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}

// ──────────────────────────────────────────────
// Agent bubble — matches web .agent-tool-card etc.
// ──────────────────────────────────────────────
@Composable
private fun AgentBubble(agent: ChatViewModel.AgentState) {
    Surface(
        color = SocratesTheme.colors.bg200,
        shape = RoundedCornerShape(SocratesDimens.radius12),
        tonalElevation = 0.dp,
        border = androidx.compose.foundation.BorderStroke(
            0.5.dp,
            SocratesTheme.colors.border100.copy(alpha = 0.1f)
        ),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(SocratesDimens.grid12)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.AutoAwesome,
                    contentDescription = null,
                    tint = SocratesTheme.colors.accent000,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(SocratesDimens.grid6))
                Text("Agent", color = SocratesTheme.colors.accent000, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.weight(1f))
                if (agent.running) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 1.5.dp,
                        color = SocratesTheme.colors.accent000)
                }
            }
            if (agent.thinking.isNotEmpty()) {
                Text(agent.thinking, color = SocratesTheme.colors.text500, fontSize = 12.sp)
            }
            if (agent.steps.isNotEmpty()) {
                agent.steps.forEach { step ->
                    Column(modifier = Modifier.padding(vertical = 4.dp)) {
                        Text(step.name, color = SocratesTheme.colors.text500, fontSize = 11.sp)
                        step.output?.take(400)?.let {
                            Text(it, color = SocratesTheme.colors.text200, fontSize = 12.sp)
                        }
                    }
                }
            }
            if (agent.text.isNotEmpty()) {
                MarkdownText(agent.text, color = SocratesTheme.colors.text100)
            }
            agent.error?.let {
                Text(it, color = SocratesTheme.colors.error, fontSize = 12.sp)
            }
        }
    }
}

// ──────────────────────────────────────────────
// Chat input — matches web .chat-input-wrap
// ──────────────────────────────────────────────
@Composable
private fun ChatInput(
    value: String,
    onValueChange: (String) -> Unit,
    streaming: Boolean,
    onSend: () -> Unit,
    onStop: () -> Unit
) {
    Surface(
        tonalElevation = 0.dp,
        color = SocratesTheme.colors.bg100
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    start = SocratesDimens.grid16,
                    end = SocratesDimens.grid16,
                    top = SocratesDimens.grid8,
                    bottom = SocratesDimens.grid8
                ),
            verticalAlignment = Alignment.Bottom
        ) {
            Surface(
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(SocratesDimens.radius14),
                color = SocratesTheme.colors.bg000,
                tonalElevation = 0.dp
            ) {
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(
                        color = SocratesTheme.colors.text100,
                        fontSize = 15.sp
                    ),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = {
                        if (value.isNotBlank() && !streaming) {
                            onSend()
                        }
                    }),
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = SocratesDimens.inputMinHeight, max = 120.dp)
                        .padding(horizontal = SocratesDimens.grid14, vertical = SocratesDimens.grid8)
                ) { innerTextField ->
                    if (value.isEmpty()) {
                        Text(
                            stringResource(R.string.placeholder_chat),
                            color = SocratesTheme.colors.text400,
                            fontSize = 15.sp
                        )
                    }
                    innerTextField()
                }
            }

            Spacer(Modifier.width(SocratesDimens.grid8))

            // Send / Stop button — mirrors web .send-btn
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(
                        if (streaming) SocratesTheme.colors.text400
                        else if (value.isNotBlank()) SocratesTheme.colors.accent000
                        else SocratesTheme.colors.bg300
                    ),
                contentAlignment = Alignment.Center
            ) {
                IconButton(
                    onClick = { if (streaming) onStop() else if (value.isNotBlank()) onSend() },
                    enabled = value.isNotBlank() || streaming,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        if (streaming) Icons.Default.Stop else Icons.Default.Send,
                        contentDescription = if (streaming) "Stop" else "Send",
                        tint = if (streaming) SocratesTheme.colors.oncolor100
                        else if (value.isNotBlank()) SocratesTheme.colors.oncolor100
                        else SocratesTheme.colors.text400,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}
