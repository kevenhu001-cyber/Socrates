package com.socrates.app.ui.sidebar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.socrates.app.R
import com.socrates.app.data.AppContainer
import com.socrates.app.data.local.MistakeRow
import com.socrates.app.data.local.SessionRow
import com.socrates.app.model.KnowledgeNode
import com.socrates.app.model.User
import com.socrates.app.ui.chat.ChatViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import java.text.DateFormat
import java.util.Date

enum class SidebarTab(val titleRes: Int) {
    KNOWLEDGE(R.string.tab_knowledge),
    RECENTS(R.string.tab_recents),
    MISTAKES(R.string.tab_mistakes),
    AGENT(R.string.tab_agent)
}

/**
 * Sidebar shown in the modal drawer. Has 4 tabs that mirror the web
 * app's behaviour. Knowledge and agent tabs read from the chat
 * ViewModel so they stay in sync with the active session.
 */
@Composable
fun Sidebar(
    container: AppContainer,
    activeTab: SidebarTab,
    onTabChange: (SidebarTab) -> Unit,
    activeSessionId: String?,
    onSessionClick: (String) -> Unit,
    onNewSession: () -> Unit,
    onOpenSettings: () -> Unit
) {
    val user by container.auth.currentUser.collectAsState()
    val sessions by container.sessions.observe().collectAsState(initial = emptyList())
    val mistakes by container.mistakes.observe().collectAsState(initial = emptyList())
    val chatVm: ChatViewModel = viewModel(factory = ChatViewModel.Factory(container))
    val state by chatVm.ui.collectAsState()

    LaunchedEffect(Unit) { container.sessions.refresh() }

    ModalDrawerSheet(modifier = Modifier.width(300.dp).fillMaxHeight()) {
        Column(modifier = Modifier.fillMaxHeight()) {
            SidebarHeader(onNewSession = onNewSession)
            SidebarTabs(activeTab, onTabChange, mistakes.size)
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when (activeTab) {
                    SidebarTab.KNOWLEDGE -> KnowledgePanel(state = state, onMark = chatVm::markNode)
                    SidebarTab.RECENTS -> RecentsPanel(sessions, activeId = activeSessionId, onClick = onSessionClick)
                    SidebarTab.MISTAKES -> MistakesPanel(mistakes = mistakes)
                    SidebarTab.AGENT -> AgentInfoPanel()
                }
            }
            SidebarFooter(user = user, onOpenSettings = onOpenSettings)
        }
    }
}

@Composable
private fun SidebarHeader(onNewSession: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
            Icon(Icons.Default.Lightbulb, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Text(
                "Socrates",
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
        IconButton(onClick = onNewSession) { Icon(Icons.Default.Add, contentDescription = stringResource(R.string.new_session)) }
    }
}

@Composable
private fun SidebarTabs(active: SidebarTab, onChange: (SidebarTab) -> Unit, mistakesCount: Int) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
        SidebarTab.values().forEach { t ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onChange(t) }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                val color = if (t == active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(t.titleRes),
                        color = color,
                        fontWeight = if (t == active) FontWeight.SemiBold else FontWeight.Medium,
                        style = MaterialTheme.typography.labelMedium
                    )
                    if (t == SidebarTab.MISTAKES && mistakesCount > 0) {
                        Spacer(Modifier.width(4.dp))
                        Badge(containerColor = MaterialTheme.colorScheme.error) {
                            Text(mistakesCount.toString(), color = MaterialTheme.colorScheme.onError)
                        }
                    }
                }
            }
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
}

@Composable
private fun KnowledgePanel(state: ChatViewModel.UiState, onMark: (String?, String, String) -> Unit) {
    if (state.knowledge.isEmpty()) {
        EmptyState(stringResource(R.string.kb_empty))
        return
    }
    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 8.dp)) {
        state.knowledge.forEach { node ->
            KnowledgeRow(node = node, onMark = onMark)
        }
    }
}

@Composable
private fun KnowledgeRow(node: KnowledgeNode, onMark: (String?, String, String) -> Unit) {
    val (dot, label, tint) = when (node.status) {
        "internalized" -> Triple(stringResource(R.string.kb_internalized), Color(0xFF4CA84C), Color(0xFF4CA84C))
        "fuzzy" -> Triple(stringResource(R.string.kb_fuzzy), MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primary)
        else -> Triple(stringResource(R.string.kb_blank), MaterialTheme.colorScheme.outline, MaterialTheme.colorScheme.outline)
    }
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(tint))
            Spacer(Modifier.width(8.dp))
            Text(node.name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
        }
        Row(modifier = Modifier.padding(start = 16.dp, top = 4.dp)) {
            listOf("internalized" to "✓", "fuzzy" to "~", "blank" to "?").forEach { (status, glyph) ->
                TextButton(
                    onClick = { onMark(node.id, node.name, status) },
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                ) { Text(glyph, style = MaterialTheme.typography.labelSmall) }
            }
        }
    }
}

@Composable
private fun RecentsPanel(sessions: List<SessionRow>, activeId: String?, onClick: (String) -> Unit) {
    if (sessions.isEmpty()) {
        EmptyState("No recent sessions yet — start a new chat.")
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp)) {
        items(sessions, key = { it.id }) { row ->
            val isActive = row.id == activeId
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isActive) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else Color.Transparent)
                    .clickable { onClick(row.id) }
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        row.title ?: row.topic?.take(60) ?: "Untitled session",
                        maxLines = 1,
                        color = MaterialTheme.colorScheme.onSurface,
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(row.updatedAt)),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.labelSmall
                    )
                }
            }
        }
    }
}

@Composable
private fun MistakesPanel(mistakes: List<MistakeRow>) {
    if (mistakes.isEmpty()) {
        EmptyState(stringResource(R.string.mistakes_empty))
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp)) {
        items(mistakes, key = { it.id }) { m ->
            Column(
                modifier = Modifier.fillMaxWidth().padding(12.dp)
            ) {
                Text(m.question, maxLines = 2, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                Spacer(Modifier.height(4.dp))
                Text("Your answer: ${m.userAnswer}", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                m.correctAnswer?.let {
                    Text("Correct: $it", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
                }
                m.explanation?.take(200)?.let {
                    Spacer(Modifier.height(4.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.2f))
        }
    }
}

@Composable
private fun AgentInfoPanel() {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(
            "Tap the chat composer and switch to the agent mode for multi-step tasks (research, code, file analysis). The run's tool calls and final text will appear inline; this tab shows your recent runs.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall
        )
    }
}

@Composable
private fun SidebarFooter(user: User?, onOpenSettings: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable { onOpenSettings() }.padding(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier.size(32.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            Text(
                (user?.email?.firstOrNull()?.uppercase() ?: "S").toString(),
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                user?.email ?: "Signed in",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1
            )
            Text(
                user?.tier?.replaceFirstChar { it.uppercase() } ?: "—",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun EmptyState(text: String) {
    Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(
            text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
    }
}
