package com.socrates.app.ui.main

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.socrates.app.data.AppContainer
import com.socrates.app.data.local.MistakeRow
import com.socrates.app.data.local.SessionRow
import com.socrates.app.model.KnowledgeNode
import com.socrates.app.model.User
import com.socrates.app.ui.chat.ChatView
import com.socrates.app.ui.settings.SettingsScreen
import com.socrates.app.ui.sidebar.SidebarTab
import com.socrates.app.ui.theme.SocratesDimens
import com.socrates.app.ui.theme.SocratesTheme
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

/**
 * Main shell matching the web app's layout:
 *
 * ┌──────────────┬──────────────────────────────────┐
 * │   Sidebar    │         Main Content              │
 * │  ┌────────┐  │  ┌── Topic Badge ──────────┐     │
 * │  │ Logo   │  │  │                         │     │
 * │  ├────────┤  │  ├── Chat Messages ────────┤     │
 * │  │ Tabs   │  │  │                         │     │
 * │  ├────────┤  │  │                         │     │
 * │  │ List   │  │  │                         │     │
 * │  │        │  │  ├── Chat Input ───────────┤     │
 * │  ├────────┤  │  │                         │     │
 * │  │ Footer │  │  └─────────────────────────┘     │
 * └──────────────┴──────────────────────────────────┘
 *
 * On compact screens (<600dp) the sidebar becomes a modal drawer.
 */
@Composable
fun MainShell(container: AppContainer, onSignOut: () -> Unit) {
    val isCompact = LocalConfiguration.current.screenWidthDp < 600
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableStateOf(SidebarTab.KNOWLEDGE) }
    var activeSessionId by rememberSaveable { mutableStateOf<String?>(null) }
    var showSettings by rememberSaveable { mutableStateOf(false) }

    val user by container.auth.currentUser.collectAsState()
    val sessions by container.sessions.observe().collectAsState(initial = emptyList())
    val mistakes by container.mistakes.observe().collectAsState(initial = emptyList())

    // Refresh sessions on mount
    LaunchedEffect(Unit) { container.sessions.refresh() }

    val sidebarContent: @Composable () -> Unit = {
        SidebarPanel(
            user = user,
            activeTab = tab,
            onTabChange = { tab = it },
            sessions = sessions,
            mistakes = mistakes,
            activeSessionId = activeSessionId,
            onSessionClick = { id ->
                activeSessionId = id
                if (isCompact) scope.launch { drawerState.close() }
            },
            onNewSession = {
                activeSessionId = null
                if (isCompact) scope.launch { drawerState.close() }
            },
            onOpenSettings = { showSettings = true }
        )
    }

    Box(modifier = Modifier.fillMaxSize()) {
        if (isCompact) {
            // Compact: modal drawer sidebar
            ModalNavigationDrawer(
                drawerState = drawerState,
                gesturesEnabled = true,
                drawerContent = { sidebarContent() }
            ) {
                MainContent(
                    container = container,
                    sessionId = activeSessionId,
                    onSessionCreated = { activeSessionId = it },
                    showSettings = showSettings,
                    onToggleSettings = { showSettings = it },
                    onSignOut = onSignOut,
                    onMenuClick = { scope.launch { drawerState.open() } }
                )
            }
        } else {
            // Tablet+: permanent sidebar
            Row(modifier = Modifier.fillMaxSize()) {
                // Fixed sidebar
                Surface(
                    modifier = Modifier
                        .width(SocratesDimens.sidebarWidthExpanded)
                        .fillMaxHeight(),
                    color = SocratesTheme.colors.bg000,
                    tonalElevation = 0.dp
                ) {
                    sidebarContent()
                }
                // Vertical divider
                Box(
                    modifier = Modifier
                        .width(0.5.dp)
                        .fillMaxHeight()
                        .background(SocratesTheme.colors.border100.copy(alpha = 0.12f))
                )
                // Main content fills remaining space
                Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                    MainContent(
                        container = container,
                        sessionId = activeSessionId,
                        onSessionCreated = { activeSessionId = it },
                        showSettings = showSettings,
                        onToggleSettings = { showSettings = it },
                        onSignOut = onSignOut,
                        onMenuClick = {}
                    )
                }
            }
        }
    }
}

// ──────────────────────────────────────────────
// Sidebar panel — mirrors web aside.sidebar
// ──────────────────────────────────────────────
@Composable
private fun SidebarPanel(
    user: User?,
    activeTab: SidebarTab,
    onTabChange: (SidebarTab) -> Unit,
    sessions: List<SessionRow>,
    mistakes: List<MistakeRow>,
    activeSessionId: String?,
    onSessionClick: (String) -> Unit,
    onNewSession: () -> Unit,
    onOpenSettings: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxHeight()
            .widthIn(max = 320.dp)
    ) {
        // Logo area
        SidebarLogo(onNewSession = onNewSession)

        // Tab bar
        SidebarTabs(
            active = activeTab,
            onChange = onTabChange,
            mistakesCount = mistakes.size
        )

        // Content area
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            when (activeTab) {
                SidebarTab.KNOWLEDGE -> KnowledgePanel()
                SidebarTab.RECENTS -> RecentsPanel(
                    sessions = sessions,
                    activeId = activeSessionId,
                    onClick = onSessionClick
                )
                SidebarTab.MISTAKES -> MistakesPanel(mistakes = mistakes)
                SidebarTab.AGENT -> AgentInfoPanel()
            }
        }

        // Footer with user info
        SidebarFooter(user = user, onOpenSettings = onOpenSettings)
    }
}

@Composable
private fun SocratesClockIcon(
    size: androidx.compose.ui.unit.Dp = 20.dp,
    tint: Color = SocratesTheme.colors.accent000,
) {
    Canvas(modifier = Modifier.size(size)) {
        val strokeW = size.toPx() * 0.07f
        val c = center
        val outerR = size.toPx() / 2f - strokeW
        // Outer circle
        drawCircle(color = tint, radius = outerR, style = Stroke(width = strokeW * 1.4f))
        // Minute hand (~2 o'clock)
        val angle = Math.toRadians(30.0)
        val handLen = outerR * 0.6f
        drawLine(
            color = tint,
            start = c,
            end = androidx.compose.ui.geometry.Offset(
                c.x + handLen * kotlin.math.sin(angle).toFloat(),
                c.y - handLen * kotlin.math.cos(angle).toFloat()
            ),
            strokeWidth = strokeW * 0.7f,
            cap = androidx.compose.ui.graphics.StrokeCap.Round
        )
        // Hour hand (12 o'clock)
        val hourLen = outerR * 0.4f
        drawLine(
            color = tint,
            start = c,
            end = androidx.compose.ui.geometry.Offset(c.x, c.y - hourLen),
            strokeWidth = strokeW * 1.3f,
            cap = StrokeCap.Round
        )
        // Inner circle
        drawCircle(color = tint, radius = outerR * 0.25f, style = Stroke(width = strokeW))
    }
}

@Composable
private fun SidebarLogo(onNewSession: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = SocratesDimens.grid8, end = SocratesDimens.grid8, top = SocratesDimens.grid6),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.weight(1f)
        ) {
            SocratesClockIcon(size = 20.dp, tint = SocratesTheme.colors.accent000)
            Spacer(Modifier.width(SocratesDimens.grid6))
            Text(
                "Socrates",
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.SemiBold,
                fontSize = 16.sp,
                color = SocratesTheme.colors.text100,
                letterSpacing = (-0.02).sp
            )
        }
        IconButton(
            onClick = onNewSession,
            modifier = Modifier.size(SocratesDimens.iconBtnSize)
        ) {
            Icon(
                Icons.Default.Add,
                contentDescription = "New session",
                tint = SocratesTheme.colors.text300,
                modifier = Modifier.size(SocratesDimens.iconSize)
            )
        }
    }
}

@Composable
private fun SidebarTabs(
    active: SidebarTab,
    onChange: (SidebarTab) -> Unit,
    mistakesCount: Int
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = SocratesDimens.grid8)
    ) {
        SidebarTab.values().forEach { t ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onChange(t) }
                    .padding(vertical = SocratesDimens.grid8),
                contentAlignment = Alignment.Center
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = when (t) {
                            SidebarTab.KNOWLEDGE -> "Knowledge"
                            SidebarTab.RECENTS -> "Recents"
                            SidebarTab.MISTAKES -> "Mistakes"
                            SidebarTab.AGENT -> "Agent"
                        },
                        color = if (t == active) SocratesTheme.colors.text100
                        else SocratesTheme.colors.text500,
                        fontWeight = if (t == active) FontWeight.SemiBold else FontWeight.Medium,
                        fontSize = 11.sp,
                        letterSpacing = 0.06.sp
                    )
                    if (t == SidebarTab.MISTAKES && mistakesCount > 0) {
                        Spacer(Modifier.width(SocratesDimens.grid4))
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = SocratesTheme.colors.error,
                            modifier = Modifier.height(16.dp)
                        ) {
                            Text(
                                mistakesCount.toString(),
                                color = SocratesTheme.colors.oncolor100,
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.padding(horizontal = SocratesDimens.grid4)
                            )
                        }
                    }
                }
            }
        }
    }
    HorizontalDivider(color = SocratesTheme.colors.border100.copy(alpha = 0.08f))
}

@Composable
private fun KnowledgePanel() {
    Box(
        modifier = Modifier.fillMaxSize().padding(SocratesDimens.grid16),
        contentAlignment = Alignment.Center
    ) {
        Text(
            "Start a chat to build your knowledge map",
            color = SocratesTheme.colors.text500,
            fontSize = 12.sp,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun RecentsPanel(
    sessions: List<SessionRow>,
    activeId: String?,
    onClick: (String) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        // Section title
        Text(
            "Recents",
            color = SocratesTheme.colors.text500,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.06.sp,
            modifier = Modifier.padding(
                start = SocratesDimens.grid12,
                end = SocratesDimens.grid12,
                top = SocratesDimens.grid6,
                bottom = SocratesDimens.grid4
            )
        )

        if (sessions.isEmpty()) {
            Text(
                "No recent sessions",
                color = SocratesTheme.colors.text500,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(SocratesDimens.grid24)
            )
        } else {
            sessions.forEach { row ->
                RecentItem(
                    row = row,
                    isActive = row.id == activeId,
                    onClick = { onClick(row.id) }
                )
            }
        }
    }
}

@Composable
private fun RecentItem(
    row: SessionRow,
    isActive: Boolean,
    onClick: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .then(
                if (isActive) Modifier.background(SocratesTheme.colors.bg200)
                else Modifier
            )
            .padding(
                start = if (isActive) 10.dp else 12.dp,
                end = 12.dp,
                top = 8.dp,
                bottom = 8.dp
            )
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = row.title ?: row.topic?.take(60) ?: "Untitled",
                maxLines = 1,
                color = if (isActive) SocratesTheme.colors.text100 else SocratesTheme.colors.text200,
                fontWeight = FontWeight.Medium,
                fontSize = 13.sp
            )
            Text(
                text = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT)
                    .format(Date(row.updatedAt)),
                color = SocratesTheme.colors.text500,
                fontSize = 11.sp
            )
        }
    }
}

@Composable
private fun MistakesPanel(mistakes: List<MistakeRow>) {
    if (mistakes.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize().padding(SocratesDimens.grid16),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "No mistakes recorded yet",
                color = SocratesTheme.colors.text500,
                fontSize = 12.sp,
                textAlign = TextAlign.Center
            )
        }
    } else {
        Column(modifier = Modifier.fillMaxSize()) {
            mistakes.forEach { m ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = SocratesDimens.grid12, vertical = SocratesDimens.grid8)
                ) {
                    Text(m.question, maxLines = 2, color = SocratesTheme.colors.text100, fontSize = 13.sp)
                    Spacer(Modifier.height(SocratesDimens.grid4))
                    Text("Your answer: ${m.userAnswer}", color = SocratesTheme.colors.error, fontSize = 11.sp)
                    m.correctAnswer?.let {
                        Text("Correct: $it", color = SocratesTheme.colors.accent000, fontSize = 11.sp)
                    }
                }
                HorizontalDivider(color = SocratesTheme.colors.border100.copy(alpha = 0.08f))
            }
        }
    }
}

@Composable
private fun AgentInfoPanel() {
    Box(
        modifier = Modifier.fillMaxSize().padding(SocratesDimens.grid16),
        contentAlignment = Alignment.Center
    ) {
        Text(
            "Switch to agent mode in the chat to use multi-step tools (research, code, files).",
            color = SocratesTheme.colors.text500,
            fontSize = 12.sp,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun SidebarFooter(user: User?, onOpenSettings: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onOpenSettings() }
            .padding(SocratesDimens.grid8)
            .clip(RoundedCornerShape(SocratesDimens.grid6)),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Avatar
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(SocratesTheme.colors.text200),
            contentAlignment = Alignment.Center
        ) {
            Text(
                (user?.email?.firstOrNull()?.uppercase() ?: "S").toString(),
                fontWeight = FontWeight.SemiBold,
                color = SocratesTheme.colors.bg000,
                fontSize = 13.sp
            )
        }
        Spacer(Modifier.width(SocratesDimens.grid10))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                user?.email ?: "Signed in",
                color = SocratesTheme.colors.text100,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1
            )
            Text(
                user?.tier?.replaceFirstChar { it.uppercase() } ?: "—",
                color = SocratesTheme.colors.text500,
                fontSize = 11.sp
            )
        }
        Icon(
            Icons.Default.ChevronRight,
            contentDescription = null,
            tint = SocratesTheme.colors.text500,
            modifier = Modifier.size(SocratesDimens.iconSize)
        )
    }
}

// ──────────────────────────────────────────────
// Main content area (chat + settings overlay)
// ──────────────────────────────────────────────
@Composable
private fun MainContent(
    container: AppContainer,
    sessionId: String?,
    onSessionCreated: (String) -> Unit,
    showSettings: Boolean,
    onToggleSettings: (Boolean) -> Unit,
    onSignOut: () -> Unit,
    onMenuClick: () -> Unit
) {
    Box(modifier = Modifier.fillMaxSize()) {
        AnimatedContent(
            targetState = showSettings,
            transitionSpec = {
                fadeIn(animationSpec = tween(250)) togetherWith fadeOut(animationSpec = tween(200))
            },
            label = "settingsToggle"
        ) { showingSettings ->
            if (showingSettings) {
                SettingsScreen(
                    container = container,
                    onClose = { onToggleSettings(false) },
                    onSignOut = onSignOut
                )
            } else {
                Column(modifier = Modifier.fillMaxSize()) {
                // Mobile hamburger menu
                val isCompact = LocalConfiguration.current.screenWidthDp < 600
                if (isCompact) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(
                                start = SocratesDimens.grid8,
                                top = SocratesDimens.grid8,
                                end = SocratesDimens.grid8
                            ),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(
                            onClick = onMenuClick,
                            modifier = Modifier.size(SocratesDimens.iconBtnSize)
                        ) {
                            Icon(
                                Icons.Default.Menu,
                                contentDescription = "Open sidebar",
                                tint = SocratesTheme.colors.text300,
                                modifier = Modifier.size(SocratesDimens.iconSize)
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        IconButton(
                            onClick = { onToggleSettings(true) },
                            modifier = Modifier.size(SocratesDimens.iconBtnSize)
                        ) {
                            Icon(
                                Icons.Default.Settings,
                                contentDescription = "Settings",
                                tint = SocratesTheme.colors.text300,
                                modifier = Modifier.size(SocratesDimens.iconSize)
                            )
                        }
                    }
                }

                Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    ChatView(
                        container = container,
                        sessionId = sessionId,
                        onSessionCreated = onSessionCreated
                    )
                }
            }
        }
    }
}
