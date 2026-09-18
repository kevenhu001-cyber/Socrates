package com.topodrive.socrates.ui

import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.topodrive.socrates.R
import com.topodrive.socrates.data.Api
import com.topodrive.socrates.icons.SocIcons
import com.topodrive.socrates.theme.LocalSocratesColors
import com.topodrive.socrates.vm.AppState
import kotlinx.coroutines.launch

/* ── Search overlay (Cmd-K) ── */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchOverlay(app: AppState) {
    val c = LocalSocratesColors.current
    var query by remember { mutableStateOf("") }
    val localResults = remember(query, app.sessions.collectAsState().value) {
        app.searchSessionsLocal(query)
    }
    var serverResults by remember { mutableStateOf<List<kotlinx.serialization.json.JsonObject>>(emptyList()) }
    val scope = rememberCoroutineScope()

    ModalBottomSheet(
        onDismissRequest = { app.openSearch(false) },
        containerColor = c.surface,
        scrimColor = c.scrim,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(c.surfaceRaised)
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(SocIcons.Search, null, tint = c.textMuted, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(8.dp))
                androidx.compose.foundation.text.BasicTextField(
                    value = query,
                    onValueChange = {
                        query = it
                        if (it.length >= 3) scope.launch {
                            val obj = app.searchServer(it)
                            serverResults = obj?.get("results")?.let { r ->
                                try {
                                    @Suppress("UNCHECKED_CAST")
                                    (r as? kotlinx.serialization.json.JsonArray)?.mapNotNull { e -> e as? kotlinx.serialization.json.JsonObject }
                                } catch (_: Exception) { null }
                            } ?: emptyList()
                        } else serverResults = emptyList()
                    },
                    textStyle = androidx.compose.ui.text.TextStyle(color = c.text, fontSize = 15.sp),
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(c.text),
                    modifier = Modifier.weight(1f).padding(vertical = 12.dp),
                    decorationBox = { inner ->
                        Box { if (query.isEmpty()) Text(stringResource(R.string.nav_search), color = c.textFaint, fontSize = 15.sp); inner() }
                    },
                )
            }
            Spacer(Modifier.height(10.dp))
            LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false)) {
                items(localResults.take(20), key = { it.id }) { s ->
                    ListRow(
                        title = s.title ?: s.topic.ifBlank { stringResource(R.string.nav_new_chat) },
                        subtitle = s.preview ?: s.updatedAt,
                        icon = SocIcons.MessageSquare,
                    ) { app.openSession(s.id); app.openSearch(false) }
                }
                items(serverResults.take(15)) { r ->
                    val sid = r["sessionId"]?.toString()?.trim('"')
                    val title = r["title"]?.toString()?.trim('"') ?: "result"
                    ListRow(title = title, subtitle = r["snippet"]?.toString()?.trim('"'), icon = SocIcons.Search) {
                        if (sid != null) app.openSession(sid)
                        app.openSearch(false)
                    }
                }
                if (localResults.isEmpty() && serverResults.isEmpty() && query.isNotBlank()) {
                    item { Text(stringResource(R.string.empty_search), color = c.textFaint, fontSize = 13.sp, modifier = Modifier.padding(16.dp)) }
                }
            }
            Spacer(Modifier.height(20.dp))
        }
    }
}

/* ── Model picker ── */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModelPickerSheet(app: AppState) {
    val c = LocalSocratesColors.current
    val providers by app.providers.collectAsState()
    val selected by app.selectedModel.collectAsState()
    ModalBottomSheet(
        onDismissRequest = { app.openModelPicker(false) },
        containerColor = c.surface,
        scrimColor = c.scrim,
    ) {
        SheetScaffold(stringResource(R.string.topbar_model), { app.openModelPicker(false) }) {
            LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false)) {
                items(providers, key = { it.id }) { p ->
                    val isSel = selected == p.id || (selected == null && p.isActive)
                    ListRow(
                        title = p.label ?: p.model,
                        subtitle = "${p.model}${if (p.isBuiltIn) " · built-in" else ""}${if (p.hasKey) " · key" else ""}",
                        icon = SocIcons.Cpu,
                        trailing = {
                            if (isSel) Icon(SocIcons.Check, null, tint = c.success, modifier = Modifier.size(16.dp))
                        },
                    ) {
                        app.setSelectedModel(p.id)
                        app.activateProvider(p.id)
                        app.openModelPicker(false)
                    }
                }
                item {
                    ListRow(
                        title = stringResource(R.string.settings_add_key),
                        icon = SocIcons.Plus,
                    ) { app.openModelPicker(false); app.openApiKeys(true) }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

/* ── Share sheet ── */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareSheet(app: AppState) {
    val c = LocalSocratesColors.current
    val share by app.shareInfo.collectAsState()
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    ModalBottomSheet(
        onDismissRequest = { app.openShare(false) },
        containerColor = c.surface,
        scrimColor = c.scrim,
    ) {
        SheetScaffold(stringResource(R.string.share_title), { app.openShare(false) }) {
            Text(stringResource(R.string.share_desc), color = c.textMuted, fontSize = 13.sp)
            Spacer(Modifier.height(16.dp))
            if (share?.url == null) {
                SocButton(stringResource(R.string.share_create), { app.createShareLink() }, Modifier.fillMaxWidth())
            } else {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surfaceRaised)
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(SocIcons.Link, null, tint = c.textMuted, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(10.dp))
                    Text(Api.shareAbsolute(share!!.url!!), color = c.text, fontSize = 13.sp, maxLines = 1, modifier = Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
                Row {
                    SocButton(stringResource(if (copied) R.string.share_copied else R.string.share_copy), {
                        clipboard.setText(AnnotatedString(Api.shareAbsolute(share!!.url!!)))
                        copied = true
                    }, Modifier.weight(1f))
                    Spacer(Modifier.width(10.dp))
                    SocButton(stringResource(R.string.share_delete), { app.deleteShareLink() }, primary = false)
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

/* ── Settings ── */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSheet(app: AppState) {
    val c = LocalSocratesColors.current
    val user by app.user.collectAsState()
    val themePref by app.themePref.collectAsState()
    val fontScale by app.fontScale.collectAsState()
    val contentWidth by app.contentWidth.collectAsState()
    val showGrid by app.showGrid.collectAsState()
    val memories by app.memories.collectAsState()
    var displayName by remember(user?.displayName) { mutableStateOf(user?.displayName ?: "") }
    var instructions by remember(user?.customInstructions) { mutableStateOf(user?.customInstructions ?: "") }
    var newMemory by remember { mutableStateOf("") }

    ModalBottomSheet(
        onDismissRequest = { app.openSettings(false) },
        containerColor = c.surface,
        scrimColor = c.scrim,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        SheetScaffold(stringResource(R.string.settings_title), { app.openSettings(false) }) {
            Column(Modifier.fillMaxWidth().weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                // Profile
                SectionLabel(stringResource(R.string.settings_profile))
                SocCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        UserAvatar(user?.displayName ?: user?.email, size = 40.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(user?.displayName ?: "Guest", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                            Text(user?.email ?: "", color = c.textMuted, fontSize = 12.sp)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    SocField(displayName, { displayName = it }, stringResource(R.string.settings_display_name))
                    Spacer(Modifier.height(8.dp))
                    SocField(instructions, { instructions = it }, stringResource(R.string.settings_instructions), singleLine = false)
                    Spacer(Modifier.height(10.dp))
                    SocButton(stringResource(R.string.action_save), {
                        app.updateProfile(displayName.ifBlank { null }, instructions.ifBlank { null })
                    }, primary = false, small = true)
                }

                // Display prefs
                SectionLabel(stringResource(R.string.settings_theme))
                SocCard {
                    SettingsRow(stringResource(R.string.settings_theme)) {
                        Segmented(
                            listOf(
                                "system" to stringResource(R.string.settings_theme_system),
                                "light" to stringResource(R.string.settings_theme_light),
                                "dark" to stringResource(R.string.settings_theme_dark),
                            ),
                            themePref, { app.setThemePref(it) },
                        )
                    }
                    SettingsRow(stringResource(R.string.settings_text_size)) {
                        Segmented(
                            listOf("1.0" to "S", "1.125" to "M", "1.25" to "L", "1.5" to "XL"),
                            "%.3f".format(fontScale).trimEnd('0').trimEnd('.'),
                            { app.setFontScale(it.toFloat()) },
                        )
                    }
                    SettingsRow(stringResource(R.string.settings_width)) {
                        Slider(
                            value = contentWidth,
                            onValueChange = { app.setContentWidth(it) },
                            valueRange = 0.6f..1f,
                            modifier = Modifier.width(140.dp),
                            colors = SliderDefaults.colors(thumbColor = c.accent, activeTrackColor = c.accent, inactiveTrackColor = c.surfacePressed),
                        )
                    }
                    SettingsRow(stringResource(R.string.settings_show_grid)) {
                        Switch(
                            checked = showGrid, onCheckedChange = { app.setShowGrid(it) },
                            colors = SwitchDefaults.colors(checkedTrackColor = c.success, uncheckedTrackColor = c.surfacePressed),
                        )
                    }
                }

                // Memory
                SectionLabel(stringResource(R.string.settings_memory))
                SocCard {
                    if (memories.isEmpty()) {
                        Text(stringResource(R.string.settings_memory_empty), color = c.textMuted, fontSize = 13.sp)
                    } else {
                        for (m in memories.take(20)) {
                            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(
                                    checked = m.enabled,
                                    onCheckedChange = { app.toggleMemory(m, it) },
                                    colors = CheckboxDefaults.colors(checkedColor = c.success, checkmarkColor = c.onAccent),
                                )
                                Text(m.text, color = if (m.enabled) c.text else c.textMuted, fontSize = 13.sp, modifier = Modifier.weight(1f))
                                IconBtn(SocIcons.Trash, "delete", { app.deleteMemory(m.id) }, size = 28.dp, iconSize = 14.dp)
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SocField(newMemory, { newMemory = it }, stringResource(R.string.settings_memory_add), Modifier.weight(1f))
                        Spacer(Modifier.width(8.dp))
                        SocButton(stringResource(R.string.action_add), {
                            if (newMemory.isNotBlank()) { app.addMemory(newMemory); newMemory = "" }
                        }, primary = false, small = true)
                    }
                }

                // API keys shortcut
                SectionLabel(stringResource(R.string.settings_api_keys))
                ListRow(
                    stringResource(R.string.settings_api_keys),
                    subtitle = stringResource(R.string.settings_api_keys_desc),
                    icon = SocIcons.KeyRound,
                ) { app.openSettings(false); app.openApiKeys(true) }

                // Version + logout
                Spacer(Modifier.height(10.dp))
                Divider()
                Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Socrates Android · ${stringResource(R.string.settings_version)} 1.0.0", color = c.textFaint, fontSize = 12.sp, modifier = Modifier.weight(1f))
                    SocButton(stringResource(R.string.settings_logout), { app.logout() }, primary = false, small = true)
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

/* ── API keys / model providers ── */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApiKeysSheet(app: AppState) {
    val c = LocalSocratesColors.current
    val providers by app.providers.collectAsState()
    var addOpen by remember { mutableStateOf(false) }
    ModalBottomSheet(
        onDismissRequest = { app.openApiKeys(false) },
        containerColor = c.surface,
        scrimColor = c.scrim,
    ) {
        SheetScaffold(
            stringResource(R.string.settings_api_keys),
            { app.openApiKeys(false) },
            trailing = { IconBtn(SocIcons.Plus, "add", { addOpen = true }) },
        ) {
            LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false)) {
                items(providers, key = { it.id }) { p ->
                    SocCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(p.label ?: p.model, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                                Text("${p.model} · ${p.url}", color = c.textMuted, fontSize = 12.sp, maxLines = 1)
                                if (p.keyHint != null) Text(p.keyHint, color = c.textFaint, fontSize = 11.sp, fontFamily = com.topodrive.socrates.theme.JetBrainsMonoFamily)
                            }
                            if (p.isActive) {
                                Box(Modifier.clip(RoundedCornerShape(999.dp)).background(c.successSoft).padding(horizontal = 8.dp, vertical = 3.dp)) {
                                    Text("ACTIVE", color = c.success, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                                }
                            } else {
                                SocButton(stringResource(R.string.action_confirm), { app.activateProvider(p.id) }, primary = false, small = true)
                            }
                            if (!p.isBuiltIn) {
                                Spacer(Modifier.width(4.dp))
                                IconBtn(SocIcons.Trash, "delete", { app.deleteProvider(p.id) }, size = 30.dp, iconSize = 14.dp)
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }

    if (addOpen) {
        var label by remember { mutableStateOf("") }
        var url by remember { mutableStateOf("") }
        var model by remember { mutableStateOf("") }
        var key by remember { mutableStateOf("") }
        var multimodal by remember { mutableStateOf(false) }
        var err by remember { mutableStateOf<String?>(null) }
        var busy by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { addOpen = false },
            containerColor = c.surface,
            title = { Text(stringResource(R.string.settings_add_key), color = c.text) },
            text = {
                Column {
                    SocField(label, { label = it }, stringResource(R.string.settings_key_label))
                    Spacer(Modifier.height(8.dp))
                    SocField(url, { url = it }, stringResource(R.string.settings_key_url))
                    Spacer(Modifier.height(8.dp))
                    SocField(model, { model = it }, stringResource(R.string.settings_key_model))
                    Spacer(Modifier.height(8.dp))
                    SocField(key, { key = it }, stringResource(R.string.settings_key_key),
                        visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation())
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = multimodal, onCheckedChange = { multimodal = it },
                            colors = CheckboxDefaults.colors(checkedColor = c.success, checkmarkColor = c.onAccent),
                        )
                        Text(stringResource(R.string.settings_key_multimodal), color = c.text, fontSize = 13.sp)
                    }
                    if (err != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(err!!, color = c.danger, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                SocButton(stringResource(R.string.action_save), {
                    if (url.isBlank() || model.isBlank() || key.isBlank()) { err = "URL, model and key are required"; return@SocButton }
                    busy = true
                    app.addProvider(label.ifBlank { null }, url, model, key, multimodal) { e ->
                        busy = false
                        if (e == null) addOpen = false else err = e
                    }
                }, small = true, loading = busy)
            },
            dismissButton = { SocButton(stringResource(R.string.action_cancel), { addOpen = false }, primary = false, small = true) },
        )
    }
}

/* ── In-app artifact WebView ── */

@Composable
fun ArtifactViewer(url: String, title: String, onClose: () -> Unit) {
    val c = LocalSocratesColors.current
    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Column(Modifier.fillMaxSize().background(c.background)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconBtn(SocIcons.ArrowLeft, "back", onClose)
                Spacer(Modifier.width(6.dp))
                Text(title, color = c.text, fontSize = 15.sp, maxLines = 1, modifier = Modifier.weight(1f))
                IconBtn(SocIcons.ExternalLink, "browser", {
                    // opened externally via the row below
                })
            }
            AndroidView(
                factory = { ctx ->
                    WebView(ctx).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        webViewClient = WebViewClient()
                        loadUrl(url)
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
