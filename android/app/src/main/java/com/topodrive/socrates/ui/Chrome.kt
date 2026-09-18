package com.topodrive.socrates.ui

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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.topodrive.socrates.R
import com.topodrive.socrates.data.Session
import com.topodrive.socrates.icons.SocIcons
import com.topodrive.socrates.theme.LocalSocratesColors
import com.topodrive.socrates.vm.AppState

/**
 * Sidebar — port of the web shell's left rail: logo + caret, New chat
 * compose button, nav list, search row, tag chips, recents, footer with
 * user row + theme toggle + display-prefs + API-settings gears.
 */
@Composable
fun Sidebar(app: AppState) {
    val c = LocalSocratesColors.current
    val sessions by app.sessions.collectAsState()
    val tags by app.tags.collectAsState()
    val user by app.user.collectAsState()
    val screen by app.screen.collectAsState()
    val themePref by app.themePref.collectAsState()
    var sessionMenuFor by remember { mutableStateOf<Session?>(null) }
    var renameFor by remember { mutableStateOf<Session?>(null) }
    var renameText by remember { mutableStateOf("") }

    Column(
        Modifier
            .fillMaxHeight()
            .width(292.dp)
            .background(c.surface)
            .border(0.5.dp, c.borderSubtle)
            .padding(top = 10.dp),
    ) {
        // Logo row + caret
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(painterResource(R.drawable.logo), null, Modifier.size(26.dp))
            Spacer(Modifier.width(10.dp))
            Text("Socrates", color = c.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            IconBtn(SocIcons.CaretDown, "collapse", { app.openDrawer(false) }, size = 30.dp, iconSize = 16.dp)
        }
        Spacer(Modifier.height(12.dp))

        // Compose / New chat button
        Row(
            Modifier
                .padding(horizontal = 12.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(c.accent)
                .clickable { app.newChat() }
                .padding(vertical = 11.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(SocIcons.Edit, null, tint = c.onAccent, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.nav_new_chat), color = c.onAccent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(10.dp))

        // Nav list
        val navItems = listOf(
            Triple(AppState.Screen.HOME, SocIcons.MessageSquare, stringResource(R.string.nav_new_chat)),
            Triple(AppState.Screen.PROJECTS, SocIcons.Projects, stringResource(R.string.nav_projects)),
            Triple(AppState.Screen.LIBRARY, SocIcons.Book, stringResource(R.string.nav_library)),
            Triple(AppState.Screen.ARTIFACTS, SocIcons.Sparkles, stringResource(R.string.nav_artifacts)),
            Triple(AppState.Screen.SCHEDULED, SocIcons.Calendar, stringResource(R.string.nav_scheduled)),
            Triple(AppState.Screen.PLUGINS, SocIcons.Plugins, stringResource(R.string.nav_plugins)),
            Triple(AppState.Screen.EXAM, SocIcons.Exam, stringResource(R.string.nav_exam)),
            Triple(AppState.Screen.SKILLS, SocIcons.Zap, stringResource(R.string.nav_skills)),
            Triple(AppState.Screen.MORE, SocIcons.More, stringResource(R.string.nav_more)),
        )
        for ((scr, icon, label) in navItems) {
            val selected = screen == scr
            Row(
                Modifier
                    .padding(horizontal = 8.dp, vertical = 1.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (selected) c.surfaceRaised else Color.Transparent)
                    .clickable {
                        if (scr == AppState.Screen.HOME) app.newChat() else app.openScreen(scr)
                    }
                    .padding(horizontal = 12.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(icon, null, tint = if (selected) c.text else c.textMuted, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(12.dp))
                Text(label, color = if (selected) c.text else c.textSecondary, fontSize = 14.sp)
            }
        }

        // Search row
        Spacer(Modifier.height(6.dp))
        Row(
            Modifier
                .padding(horizontal = 8.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .clickable { app.openSearch(true) }
                .padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(SocIcons.Search, null, tint = c.textMuted, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(12.dp))
            Text(stringResource(R.string.nav_search), color = c.textMuted, fontSize = 14.sp)
        }

        // Tag chips
        if (tags.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Row(
                Modifier.padding(horizontal = 12.dp).horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                for (t in tags.take(8)) TagPill("#$t")
            }
        }

        // Recents
        SectionLabel(stringResource(R.string.nav_recent))
        LazyColumn(Modifier.weight(1f).padding(horizontal = 8.dp)) {
            items(sessions.filter { it.archivedAt == null }, key = { it.id }) { s ->
                val active = app.active.collectAsState().value?.id == s.id
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (active) c.surfaceRaised else Color.Transparent)
                        .clickable { app.openSession(s.id) }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (s.pinned) {
                        Icon(SocIcons.Pin, null, tint = c.textMuted, modifier = Modifier.size(11.dp))
                        Spacer(Modifier.width(6.dp))
                    }
                    Text(
                        s.title ?: s.topic.ifBlank { stringResource(R.string.nav_new_chat) },
                        color = if (active) c.text else c.textSecondary,
                        fontSize = 13.5.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    IconBtn(SocIcons.More, "session", { sessionMenuFor = s }, size = 26.dp, iconSize = 14.dp)
                }
            }
        }

        // Footer — user row + theme toggle + gears
        Divider()
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            UserAvatar(user?.displayName ?: user?.email)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(user?.displayName ?: user?.email ?: "Guest", color = c.text, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(user?.tier ?: "", color = c.textFaint, fontSize = 11.sp)
            }
            IconBtn(
                if (themePref == "dark") SocIcons.Sun else SocIcons.Moon,
                "theme",
                { app.setThemePref(if (themePref == "dark") "light" else "dark") },
                size = 30.dp, iconSize = 16.dp,
            )
            IconBtn(SocIcons.Sliders, "display", { app.openSettings(true) }, size = 30.dp, iconSize = 16.dp)
            IconBtn(SocIcons.Gear, "api", { app.openApiKeys(true) }, size = 30.dp, iconSize = 16.dp)
        }
    }

    // Session overflow menu
    val menuSession = sessionMenuFor
    if (menuSession != null) {
        DropdownMenu(
            expanded = true,
            onDismissRequest = { sessionMenuFor = null },
            modifier = Modifier.background(c.surfaceRaised),
        ) {
            DropdownMenuItem(
                text = { Text(stringResource(if (menuSession.pinned) R.string.action_unpin else R.string.action_pin), color = c.text) },
                onClick = { app.pinSession(menuSession, !menuSession.pinned); sessionMenuFor = null },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.action_rename), color = c.text) },
                onClick = { renameFor = menuSession; renameText = menuSession.title ?: menuSession.topic; sessionMenuFor = null },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.action_archive), color = c.text) },
                onClick = { app.archiveSession(menuSession); sessionMenuFor = null },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.action_delete), color = c.danger) },
                onClick = { app.deleteSession(menuSession); sessionMenuFor = null },
            )
        }
    }

    // Rename dialog
    val r = renameFor
    if (r != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { renameFor = null },
            containerColor = c.surface,
            title = { Text(stringResource(R.string.action_rename), color = c.text) },
            text = {
                SocField(renameText, { renameText = it }, stringResource(R.string.projects_name))
            },
            confirmButton = {
                SocButton(stringResource(R.string.action_save), { app.renameSession(r, renameText); renameFor = null }, small = true)
            },
            dismissButton = {
                SocButton(stringResource(R.string.action_cancel), { renameFor = null }, primary = false, small = true)
            },
        )
    }
}

/**
 * Top bar — port of `#topbar`: hamburger, centered Chat/Tutor segmented,
 * incognito, model picker, find-in-chat, share.
 */
@Composable
fun TopBar(app: AppState) {
    val c = LocalSocratesColors.current
    val mode by app.appMode.collectAsState()
    val incognito by app.incognito.collectAsState()
    val active by app.active.collectAsState()
    val providers by app.providers.collectAsState()
    val selectedModel by app.selectedModel.collectAsState()
    val screen by app.screen.collectAsState()
    val inChat = screen == AppState.Screen.CHAT

    Row(
        Modifier
            .fillMaxWidth()
            .background(c.background)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconBtn(SocIcons.Menu, "menu", { app.openDrawer(true) }, size = 36.dp, iconSize = 20.dp)

        Spacer(Modifier.weight(1f))
        Segmented(
            listOf("chat" to stringResource(R.string.topbar_chat), "tutor" to stringResource(R.string.topbar_tutor)),
            mode,
            { app.setMode(it) },
        )
        Spacer(Modifier.weight(1f))

        if (incognito) {
            IconBtn(SocIcons.Incognito, "incognito", { app.setIncognito(false) }, tint = c.text, size = 34.dp, iconSize = 17.dp)
        }
        // Model picker glyph
        val activeProvider = providers.firstOrNull { it.isActive } ?: providers.firstOrNull()
        Row(
            Modifier
                .clip(RoundedCornerShape(10.dp))
                .clickable { app.openModelPicker(true) }
                .padding(horizontal = 8.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(SocIcons.Cpu, null, tint = c.textMuted, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                selectedModel?.let { m -> providers.firstOrNull { it.id == m }?.model ?: m }
                    ?: activeProvider?.model ?: stringResource(R.string.topbar_model),
                color = c.textMuted, fontSize = 12.5.sp, maxLines = 1,
            )
        }
        if (inChat) {
            IconBtn(SocIcons.Search, "find", { app.openSearch(true) }, size = 34.dp, iconSize = 16.dp)
            IconBtn(SocIcons.Share, "share", { if (active != null) app.openShare(true) }, size = 34.dp, iconSize = 16.dp)
        }
    }
}
