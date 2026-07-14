package com.socrates.app.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.socrates.app.R
import com.socrates.app.data.AppContainer
import com.socrates.app.model.ApiProvider
import com.socrates.app.model.CreateProviderRequest
import com.socrates.app.ui.theme.SocratesDimens
import com.socrates.app.ui.theme.SocratesTheme
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    container: AppContainer,
    onClose: () -> Unit,
    onSignOut: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val user by container.auth.currentUser.collectAsStateWithLifecycle()
    val themeMode by container.prefs.theme.collectAsStateWithLifecycle(initialValue = "system")
    val fontStep by container.prefs.fontStep.collectAsStateWithLifecycle(initialValue = 1)
    val widthStep by container.prefs.widthStep.collectAsStateWithLifecycle(initialValue = 1)
    val isGuest by container.prefs.isGuest.collectAsStateWithLifecycle(initialValue = false)
    var providers by remember { mutableStateOf<List<ApiProvider>>(emptyList()) }
    var activeId by remember { mutableStateOf<String?>(null) }
    var showAddKey by rememberSaveable { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        container.apiKeys.list().onSuccess { l -> providers = l.providers; activeId = l.activeId }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SocratesTheme.colors.bg200)
            .padding(top = SocratesDimens.grid16)
    ) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = SocratesDimens.grid16, vertical = SocratesDimens.grid12),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = onClose,
                modifier = Modifier.size(SocratesDimens.iconBtnSize)
            ) {
                Icon(
                    Icons.Default.ArrowBack,
                    contentDescription = "Back",
                    tint = SocratesTheme.colors.text400,
                    modifier = Modifier.size(SocratesDimens.iconSize)
                )
            }
            Spacer(Modifier.width(SocratesDimens.grid8))
            Text(
                "Settings",
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                color = SocratesTheme.colors.text100
            )
        }

        // Content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = SocratesDimens.grid16),
            verticalArrangement = Arrangement.spacedBy(SocratesDimens.grid16)
        ) {
            // Account card
            AccountCard(email = user?.email, tier = user?.tier, isGuest = isGuest)
            // Display card
            DisplayCard(theme = themeMode, onTheme = { scope.launch { container.prefs.setTheme(it) } })
            // API keys card
            ApiKeyCard(providers = providers, activeId = activeId,
                onActivate = { id ->
                    scope.launch {
                        container.apiKeys.activate(id).onSuccess { p ->
                            providers = providers.map { it.copy(isActive = it.id == p.id) }
                            activeId = p.id
                            status = "Active: ${p.label}"
                        }
                    }
                },
                onDelete = { id ->
                    scope.launch { container.apiKeys.delete(id); providers = providers.filterNot { it.id == id } }
                },
                onAdd = { showAddKey = true }
            )

            status?.let {
                Text(it, color = SocratesTheme.colors.accent000, fontSize = 12.sp)
            }

            HorizontalDivider(color = SocratesTheme.colors.border100.copy(alpha = 0.08f))

            // Sign out
            OutlinedButton(
                onClick = onSignOut,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(SocratesDimens.radius10),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = SocratesTheme.colors.text200)
            ) {
                Text("Sign out")
            }

            // Delete account
            Button(
                onClick = { confirmDelete = true },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(SocratesDimens.radius10),
                colors = ButtonDefaults.buttonColors(
                    containerColor = SocratesTheme.colors.error
                )
            ) {
                Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(SocratesDimens.grid8))
                Text(stringResource(R.string.settings_delete_account))
            }

            Spacer(Modifier.height(SocratesDimens.grid32))
        }
    }

    if (showAddKey) {
        AddKeyDialog(onDismiss = { showAddKey = false },
            onSave = { req ->
                scope.launch {
                    container.apiKeys.create(req).onSuccess { p ->
                        providers = providers + p; showAddKey = false; status = "Added ${p.label}"
                    }.onFailure { status = it.message }
                }
            })
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete account?", color = SocratesTheme.colors.text100) },
            text = { Text("This permanently removes your account, sessions, mistakes, and API keys.", color = SocratesTheme.colors.text400, fontSize = 13.sp) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    scope.launch { container.auth.deleteAccount(); onSignOut() }
                }) { Text("Delete", color = SocratesTheme.colors.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
            containerColor = SocratesTheme.colors.bg200
        )
    }
}

@Composable
private fun AccountCard(email: String?, tier: String?, isGuest: Boolean) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(SocratesDimens.radius16),
        color = SocratesTheme.colors.bg000,
        tonalElevation = 0.dp
    ) {
        Column(modifier = Modifier.padding(SocratesDimens.grid16), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Account", fontWeight = FontWeight.SemiBold, color = SocratesTheme.colors.text100, fontSize = 14.sp)
            Text(email ?: "—", color = SocratesTheme.colors.text200, fontSize = 13.sp)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Plan: ", color = SocratesTheme.colors.text500, fontSize = 12.sp)
                Surface(
                    shape = RoundedCornerShape(SocratesDimens.radius4),
                    color = SocratesTheme.colors.accent900
                ) {
                    Text(
                        tier?.replaceFirstChar { it.uppercase() } ?: "—",
                        color = SocratesTheme.colors.accent100,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = SocratesDimens.grid8, vertical = 2.dp)
                    )
                }
                if (isGuest) {
                    Spacer(Modifier.width(SocratesDimens.grid8))
                    Surface(
                        shape = RoundedCornerShape(SocratesDimens.radius4),
                        color = SocratesTheme.colors.bg300
                    ) {
                        Text("Guest", color = SocratesTheme.colors.text400, fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = SocratesDimens.grid8, vertical = 2.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun DisplayCard(theme: String, onTheme: (String) -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(SocratesDimens.radius16),
        color = SocratesTheme.colors.bg000,
        tonalElevation = 0.dp
    ) {
        Column(modifier = Modifier.padding(SocratesDimens.grid16), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Display", fontWeight = FontWeight.SemiBold, color = SocratesTheme.colors.text100, fontSize = 14.sp)
            SegmentedRow(label = "Theme", options = listOf("System", "Light", "Dark"),
                values = listOf("system", "light", "dark"), selected = theme, onSelect = onTheme)
            // Font size and content width are managed via the web prefs — keep them, but in a real
            // Compose app the prefs are already wired through PreferencesStore
            Text("Font and width scaling are synced server-side.", color = SocratesTheme.colors.text500, fontSize = 11.sp)
        }
    }
}

@Composable
private fun SegmentedRow(label: String, options: List<String>, values: List<String>, selected: String, onSelect: (String) -> Unit) {
    Column {
        Text(label, color = SocratesTheme.colors.text500, fontSize = 11.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(SocratesDimens.grid8))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            values.forEachIndexed { i, v ->
                val isSelected = v == selected
                Surface(
                    modifier = Modifier
                        .weight(1f),
                    shape = RoundedCornerShape(SocratesDimens.radius6),
                    color = if (isSelected) SocratesTheme.colors.bg100 else SocratesTheme.colors.bg300,
                    tonalElevation = 0.dp
                ) {
                    Text(
                        options[i],
                        color = if (isSelected) SocratesTheme.colors.text100 else SocratesTheme.colors.text400,
                        fontSize = 12.sp,
                        fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
                        modifier = Modifier
                            .clickable { onSelect(v) }
                            .padding(vertical = 6.dp),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
        }
    }
}

@Composable
private fun ApiKeyCard(
    providers: List<ApiProvider>,
    activeId: String?,
    onActivate: (String) -> Unit,
    onDelete: (String) -> Unit,
    onAdd: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(SocratesDimens.radius16),
        color = SocratesTheme.colors.bg000,
        tonalElevation = 0.dp
    ) {
        Column(modifier = Modifier.padding(SocratesDimens.grid16), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("API keys", fontWeight = FontWeight.SemiBold, color = SocratesTheme.colors.text100, fontSize = 14.sp,
                    modifier = Modifier.weight(1f))
                TextButton(onClick = onAdd) { Text("Add", color = SocratesTheme.colors.accent000) }
            }
            if (providers.isEmpty()) {
                Text("No providers yet. Add your API key to unlock models.",
                    color = SocratesTheme.colors.text500, fontSize = 12.sp)
            }
            providers.forEach { p ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(p.label, color = SocratesTheme.colors.text100, fontSize = 13.sp)
                        Text("${p.url} • ${p.model}", color = SocratesTheme.colors.text500, fontSize = 11.sp)
                    }
                    if (p.isActive || p.id == activeId) {
                        Surface(shape = RoundedCornerShape(SocratesDimens.radius4), color = SocratesTheme.colors.accent900) {
                            Text("Active", color = SocratesTheme.colors.accent100, fontSize = 10.sp,
                                modifier = Modifier.padding(horizontal = SocratesDimens.grid8, vertical = 2.dp))
                        }
                    } else {
                        TextButton(onClick = { onActivate(p.id) }) {
                            Text("Use", color = SocratesTheme.colors.accent000, fontSize = 12.sp)
                        }
                    }
                    IconButton(onClick = { onDelete(p.id) }, modifier = Modifier.size(SocratesDimens.iconBtnSize)) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete",
                            tint = SocratesTheme.colors.error, modifier = Modifier.size(16.dp))
                    }
                }
                HorizontalDivider(color = SocratesTheme.colors.border100.copy(alpha = 0.08f))
            }
        }
    }
}

@Composable
private fun AddKeyDialog(onDismiss: () -> Unit, onSave: (CreateProviderRequest) -> Unit) {
    var label by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("https://api.openai.com/v1") }
    var model by remember { mutableStateOf("gpt-4o-mini") }
    var key by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add API key", color = SocratesTheme.colors.text100) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SocratesSettingsInput(value = label, onValueChange = { label = it }, label = "Label")
                SocratesSettingsInput(value = url, onValueChange = { url = it }, label = "Endpoint")
                SocratesSettingsInput(value = model, onValueChange = { model = it }, label = "Model")
                SocratesSettingsInput(value = key, onValueChange = { key = it }, label = "Key")
            }
        },
        confirmButton = {
            TextButton(
                enabled = label.isNotBlank() && url.isNotBlank() && model.isNotBlank() && key.isNotBlank(),
                onClick = { onSave(CreateProviderRequest(label.trim(), url.trim(), model.trim(), key.trim())) }
            ) { Text("Save", color = SocratesTheme.colors.accent000) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        containerColor = SocratesTheme.colors.bg200
    )
}

@Composable
private fun SocratesSettingsInput(
    value: String,
    onValueChange: (String) -> Unit,
    label: String
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyMedium.copy(
            color = SocratesTheme.colors.text100,
            fontFamily = FontFamily.Monospace,
            fontSize = 14.sp
        ),
        modifier = Modifier
            .fillMaxWidth()
            .background(SocratesTheme.colors.bg200, RoundedCornerShape(SocratesDimens.radius10))
            .border(0.5.dp, SocratesTheme.colors.border100.copy(alpha = 0.15f), RoundedCornerShape(SocratesDimens.radius10))
            .padding(SocratesDimens.grid12)
    ) { innerTextField ->
        if (value.isEmpty()) {
            Text(label, color = SocratesTheme.colors.text500, fontSize = 14.sp)
        }
        innerTextField()
    }
}
