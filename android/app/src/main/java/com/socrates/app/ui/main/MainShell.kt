package com.socrates.app.ui.main

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import com.socrates.app.data.AppContainer
import com.socrates.app.ui.chat.ChatView
import com.socrates.app.ui.settings.SettingsScreen
import com.socrates.app.ui.sidebar.Sidebar
import com.socrates.app.ui.sidebar.SidebarTab
import kotlinx.coroutines.launch

/**
 * The main 2-pane shell: collapsible sidebar + main content. Mirrors
 * the web app's `aside.sidebar` + `main` split, with the same
 * collapse / drawer behaviour on phones.
 */
@Composable
fun MainShell(container: AppContainer, onSignOut: () -> Unit) {
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableStateOf(SidebarTab.KNOWLEDGE) }
    var activeSessionId by rememberSaveable { mutableStateOf<String?>(null) }
    var showSettings by rememberSaveable { mutableStateOf(false) }

    val isCompact = LocalConfiguration.current.screenWidthDp < 600

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = isCompact,
        drawerContent = {
            Sidebar(
                container = container,
                activeTab = tab,
                onTabChange = { tab = it },
                activeSessionId = activeSessionId,
                onSessionClick = {
                    activeSessionId = it
                    if (isCompact) scope.launch { drawerState.close() }
                },
                onNewSession = {
                    activeSessionId = null
                    if (isCompact) scope.launch { drawerState.close() }
                },
                onOpenSettings = { showSettings = true }
            )
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Socrates") },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, contentDescription = "Open sidebar")
                        }
                    },
                    actions = {
                        IconButton(onClick = { showSettings = true }) {
                            Icon(Icons.Default.Settings, contentDescription = "Settings")
                        }
                    }
                )
            }
        ) { padding ->
            Box(modifier = Modifier.padding(padding).fillMaxSize()) {
                if (showSettings) {
                    SettingsScreen(container = container, onClose = { showSettings = false }, onSignOut = onSignOut)
                } else {
                    ChatView(
                        container = container,
                        sessionId = activeSessionId,
                        onSessionCreated = { id -> activeSessionId = id }
                    )
                }
            }
        }
    }
}
