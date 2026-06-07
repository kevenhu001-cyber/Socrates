package com.socrates.app.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.socrates.app.R
import com.socrates.app.data.AppContainer
import com.socrates.app.model.SessionMessage
import com.socrates.app.ui.common.MarkdownText
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

@Composable
private fun TopicSetup(
    state: ChatViewModel.UiState,
    onTopicChange: (String) -> Unit,
    onBegin: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            stringResource(R.string.topic_setup_title),
            fontFamily = FontFamily.Serif,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground
        )
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.topic_setup_sub),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = state.topic,
            onValueChange = onTopicChange,
            placeholder = { Text(stringResource(R.string.topic_input_hint)) },
            modifier = Modifier.fillMaxWidth().heightIn(min = 96.dp),
            shape = RoundedCornerShape(16.dp),
            maxLines = 4
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = onBegin,
            enabled = state.topic.isNotBlank() && !state.busy,
            shape = RoundedCornerShape(12.dp)
        ) {
            if (state.busy) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            else Text(stringResource(R.string.begin))
        }
        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun ChatStream(
    vm: ChatViewModel,
    state: ChatViewModel.UiState,
    agent: ChatViewModel.AgentState
) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var input by rememberSaveable(state.sessionId) { mutableStateOf("") }

    LaunchedEffect(state.messages.size, agent.text) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.size - 1)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Topic badge
        Surface(
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(MaterialTheme.colorScheme.primary)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    state.topic.ifBlank { state.title.orEmpty() },
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.weight(1f))
                Text(
                    state.tier.replaceFirstChar { it.uppercase() },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.labelSmall
                )
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(state.messages, key = { it.hashCode() }) { msg ->
                MessageBubble(msg)
            }
            if (agent.running || agent.text.isNotEmpty() || agent.steps.isNotEmpty()) {
                item {
                    AgentBubble(agent = agent)
                }
            }
            if (state.streaming) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 1.5.dp)
                        Spacer(Modifier.width(6.dp))
                        Text("Socrates is thinking…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        ChatInput(
            value = input,
            onValueChange = { input = it },
            streaming = state.streaming || agent.running,
            onSend = {
                if (state.mode == ChatViewModel.ChatMode.AGENT) vm.runAgent(input.trim())
                else vm.send(input.trim())
                input = ""
            },
            onStop = { vm.stop() }
        )
    }
}

@Composable
private fun MessageBubble(msg: SessionMessage) {
    val isUser = msg.role == "user"
    val align = if (isUser) Alignment.End else Alignment.Start
    val bg = if (isUser) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface
    val fg = if (isUser) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = align) {
        Row(verticalAlignment = Alignment.Top) {
            if (!isUser) {
                Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp).padding(top = 2.dp))
                Spacer(Modifier.width(6.dp))
            }
            Surface(
                color = bg,
                shape = RoundedCornerShape(12.dp),
                tonalElevation = if (!isUser) 1.dp else 0.dp,
                modifier = Modifier.widthIn(max = 560.dp)
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    if (isUser) {
                        Text(msg.content, color = fg, style = MaterialTheme.typography.bodyMedium)
                    } else {
                        MarkdownText(msg.content, color = fg)
                    }
                }
            }
            if (isUser) {
                Spacer(Modifier.width(6.dp))
                Icon(Icons.Default.Person, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp).padding(top = 2.dp))
            }
        }
    }
}

@Composable
private fun AgentBubble(agent: ChatViewModel.AgentState) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(12.dp),
        tonalElevation = 1.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Agent", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.weight(1f))
                if (agent.running) CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 1.5.dp)
            }
            if (agent.thinking.isNotEmpty()) {
                Text(agent.thinking, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (agent.steps.isNotEmpty()) {
                agent.steps.forEach { step ->
                    Column(modifier = Modifier.padding(vertical = 4.dp)) {
                        Text("${step.name}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        step.output?.take(400)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface) }
                    }
                }
            }
            if (agent.text.isNotEmpty()) {
                MarkdownText(agent.text, color = MaterialTheme.colorScheme.onSurface)
            }
            agent.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun ChatInput(
    value: String,
    onValueChange: (String) -> Unit,
    streaming: Boolean,
    onSend: () -> Unit,
    onStop: () -> Unit
) {
    Surface(tonalElevation = 2.dp, color = MaterialTheme.colorScheme.surface) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                placeholder = { Text(stringResource(R.string.placeholder_chat)) },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(20.dp),
                maxLines = 5
            )
            Spacer(Modifier.width(8.dp))
            FilledIconButton(
                onClick = { if (streaming) onStop() else onSend() },
                enabled = value.isNotBlank() || streaming,
                shape = RoundedCornerShape(20.dp)
            ) {
                if (streaming) Icon(Icons.Default.Stop, contentDescription = stringResource(R.string.stop))
                else Icon(Icons.Default.Send, contentDescription = stringResource(R.string.send))
            }
        }
    }
}


