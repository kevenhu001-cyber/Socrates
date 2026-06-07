package com.socrates.app.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.socrates.app.R
import com.socrates.app.data.AppContainer
import com.socrates.app.model.ApiProvider
import com.socrates.app.model.CreateProviderRequest
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

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onClose) { Icon(Icons.Default.ArrowBack, contentDescription = "Back") }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            AccountCard(email = user?.email, tier = user?.tier, isGuest = isGuest)
            DisplayCard(
                theme = themeMode,
                onTheme = { scope.launch { container.prefs.setTheme(it) } },
                fontStep = fontStep,
                onFont = { scope.launch { container.prefs.setFontStep(it) } },
                widthStep = widthStep,
                onWidth = { scope.launch { container.prefs.setWidthStep(it) } }
            )
            ApiKeyCard(
                providers = providers,
                activeId = activeId,
                onActivate = { id ->
                    scope.launch {
                        container.apiKeys.activate(id).onSuccess { p ->
                            providers = providers.map { it.copy(isActive = it.id == p.id) }
                            activeId = p.id
                            status = "Active provider set to ${p.label}"
                        }
                    }
                },
                onDelete = { id ->
                    scope.launch {
                        container.apiKeys.delete(id)
                        providers = providers.filterNot { it.id == id }
                    }
                },
                onAdd = { showAddKey = true }
            )
            status?.let {
                Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
            }
            HorizontalDivider()
            OutlinedButton(
                onClick = onSignOut,
                modifier = Modifier.fillMaxWidth()
            ) { Text(stringResource(R.string.settings_signout)) }
            Button(
                onClick = { confirmDelete = true },
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Delete, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.settings_delete_account))
            }
        }
    }

    if (showAddKey) {
        AddKeyDialog(
            onDismiss = { showAddKey = false },
            onSave = { req ->
                scope.launch {
                    container.apiKeys.create(req).onSuccess { p ->
                        providers = providers + p
                        showAddKey = false
                        status = "Added ${p.label}"
                    }.onFailure { status = it.message }
                }
            }
        )
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete account?") },
            text = { Text("This permanently removes your account, sessions, mistakes, and API keys. This cannot be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    scope.launch { container.auth.deleteAccount(); onSignOut() }
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } }
        )
    }
}

@Composable
private fun AccountCard(email: String?, tier: String?, isGuest: Boolean) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Account", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
            Text(email ?: "—", style = MaterialTheme.typography.bodyMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Plan: ", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                AssistChip(onClick = {}, label = { Text(tier?.replaceFirstChar { it.uppercase() } ?: "—") })
                if (isGuest) {
                    Spacer(Modifier.width(8.dp))
                    AssistChip(onClick = {}, label = { Text("Guest") })
                }
            }
        }
    }
}

@Composable
private fun DisplayCard(
    theme: String,
    onTheme: (String) -> Unit,
    fontStep: Int,
    onFont: (Int) -> Unit,
    widthStep: Int,
    onWidth: (Int) -> Unit
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Display", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
            SegmentedRow(
                label = "Theme",
                options = listOf("System", "Light", "Dark"),
                values = listOf("system", "light", "dark"),
                selected = theme,
                onSelect = onTheme
            )
            SegmentedRow(
                label = "Font size",
                options = listOf("S", "M", "L", "XL"),
                values = listOf("0", "1", "2", "3"),
                selected = fontStep.toString(),
                onSelect = { onFont(it.toInt()) }
            )
            SegmentedRow(
                label = "Content width",
                options = listOf("S", "M", "L", "XL"),
                values = listOf("0", "1", "2", "3"),
                selected = widthStep.toString(),
                onSelect = { onWidth(it.toInt()) }
            )
        }
    }
}

@Composable
private fun SegmentedRow(label: String, options: List<String>, values: List<String>, selected: String, onSelect: (String) -> Unit) {
    Column {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            values.forEachIndexed { i, v ->
                FilterChip(
                    selected = v == selected,
                    onClick = { onSelect(v) },
                    label = { Text(options[i]) },
                    modifier = Modifier.weight(1f)
                )
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
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("API keys", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                TextButton(onClick = onAdd) { Text("Add") }
            }
            if (providers.isEmpty()) {
                Text(
                    "No providers yet. Add your OpenAI / Anthropic / DeepSeek / Together / Groq key to unlock the corresponding models.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall
                )
            }
            providers.forEach { p ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(p.label, style = MaterialTheme.typography.bodyMedium)
                        Text("${p.url} • ${p.model}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (p.isActive || p.id == activeId) {
                        AssistChip(onClick = {}, label = { Text("Active") })
                    } else {
                        TextButton(onClick = { onActivate(p.id) }) { Text("Use") }
                    }
                    IconButton(onClick = { onDelete(p.id) }) { Icon(Icons.Default.Delete, contentDescription = "Delete") }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
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
        title = { Text("Add API key") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = label, onValueChange = { label = it }, label = { Text("Label") }, singleLine = true)
                OutlinedTextField(value = url, onValueChange = { url = it }, label = { Text("Endpoint") }, singleLine = true)
                OutlinedTextField(value = model, onValueChange = { model = it }, label = { Text("Model") }, singleLine = true)
                OutlinedTextField(value = key, onValueChange = { key = it }, label = { Text("Key") }, singleLine = true)
            }
        },
        confirmButton = {
            TextButton(
                enabled = label.isNotBlank() && url.isNotBlank() && model.isNotBlank() && key.isNotBlank(),
                onClick = { onSave(CreateProviderRequest(label.trim(), url.trim(), model.trim(), key.trim())) }
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
