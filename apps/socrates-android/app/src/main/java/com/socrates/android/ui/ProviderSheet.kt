package com.socrates.android.ui

import android.app.Application
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.socrates.android.data.ApiClient
import com.socrates.android.data.ProviderEntry
import com.socrates.android.data.ProviderRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class ProviderState(val providers: List<ProviderEntry> = emptyList(), val loading: Boolean = true, val busy: Boolean = false, val error: String? = null, val revision: Int = 0)
private class ProviderViewModel(app: Application) : AndroidViewModel(app) {
    private val repository = ProviderRepository(ApiClient(app))
    private val _state = MutableStateFlow(ProviderState()); val state = _state.asStateFlow()
    fun load() = viewModelScope.launch {
        _state.value = _state.value.copy(loading = true, error = null)
        try { val value = withContext(Dispatchers.IO) { repository.list() }; _state.value = _state.value.copy(providers = value, loading = false) }
        catch (e: Exception) { _state.value = _state.value.copy(loading = false, error = e.message ?: "加载服务商失败") }
    }
    fun create(label: String, url: String, model: String, key: String, vision: Boolean) = mutate { repository.create(label, url, model, key, vision) }
    fun update(id: String, label: String, url: String, model: String, key: String?, vision: Boolean) = mutate { repository.update(id, label, url, model, key, vision) }
    fun activate(id: String) = mutate { repository.activate(id) }
    fun delete(id: String) = mutate { repository.delete(id) }
    private fun mutate(action: () -> Unit) = viewModelScope.launch {
        if (_state.value.busy) return@launch
        _state.value = _state.value.copy(busy = true, error = null)
        try { withContext(Dispatchers.IO) { action() }; _state.value = _state.value.copy(busy = false, revision = _state.value.revision + 1); load().join() }
        catch (e: Exception) { _state.value = _state.value.copy(busy = false, error = e.message ?: "操作失败") }
    }
}

/** Full-screen provider manager. A parent can open it with ProviderSheet(onDismiss = { ... }). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProviderSheet(onDismiss: () -> Unit) {
    val app = LocalContext.current.applicationContext as Application
    val server = remember { ApiClient(app).baseUrl }
    val vm: ProviderViewModel = viewModel(key = "providers-$server", factory = object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST") override fun <T : ViewModel> create(modelClass: Class<T>): T = ProviderViewModel(app) as T
    })
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(vm) { vm.load() }
    var editing by remember { mutableStateOf(false) }; var selected by remember { mutableStateOf<ProviderEntry?>(null) }
    var label by remember { mutableStateOf("") }; var url by remember { mutableStateOf("") }; var model by remember { mutableStateOf("") }
    // Secret deliberately remains transient, non-saveable Compose state; never logged or returned by server.
    var secret by remember { mutableStateOf("") }; var multimodal by remember { mutableStateOf(true) }
    var deleting by remember { mutableStateOf<ProviderEntry?>(null) }
    LaunchedEffect(state.revision) { if (state.revision > 0) { editing = false; selected = null; secret = "" } }
    fun edit(entry: ProviderEntry?) { selected = entry; editing = true; label = entry?.label.orEmpty(); url = entry?.url.orEmpty(); model = entry?.model.orEmpty(); secret = ""; multimodal = entry?.isMultimodal ?: true }
    BackHandler { if (deleting != null) deleting = null else if (editing) editing = false else if (selected != null) selected = null else onDismiss() }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = true)) {
        Box(Modifier.fillMaxSize().background(SocratesDesign.Page)) {
            CompositionLocalProvider(LocalContentColor provides SocratesDesign.Ink) {
            Column(Modifier.fillMaxSize().imePadding()) {
                Row(Modifier.fillMaxWidth().height(60.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    SocratesIconButton(onClick = { if (editing) editing = false else if (selected != null) selected = null else onDismiss() }) { ReferenceIcon(ReferenceGlyph.Back, "返回") }
                    Text(if (editing) if (selected == null) "新增服务商" else "编辑服务商" else "模型与服务商", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                    if (!editing && selected == null) SocratesTextButton(onClick = { edit(null) }) { Text("添加") }
                }
                state.error?.let { Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) { Text(it, Modifier.weight(1f), color = MaterialTheme.colorScheme.error); SocratesTextButton(onClick = vm::load) { ReferenceIcon(ReferenceGlyph.Refresh, null); Text("重试") } } }
                when {
                    state.loading && state.providers.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { SocratesSpinner() }
                    editing -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        SocratesField(label, { label = it }, Modifier.fillMaxWidth(), label = { Text("名称") }, singleLine = true)
                        SocratesField(url, { url = it }, Modifier.fillMaxWidth(), label = { Text("服务商 HTTPS 地址") }, singleLine = true)
                        SocratesField(model, { model = it }, Modifier.fillMaxWidth(), label = { Text("模型 ID（由服务商提供）") }, singleLine = true)
                        SocratesField(secret, { secret = it }, Modifier.fillMaxWidth(), label = { Text(if (selected == null) "API 密钥" else "更换密钥（留空保持不变）") }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
                        Row(verticalAlignment = Alignment.CenterVertically) { Text("支持图像/多模态", Modifier.weight(1f)); SocratesSwitch(multimodal, { multimodal = it }) }
                        Text("密钥仅保留在此临时表单内存中；服务器只返回密钥提示。", style = MaterialTheme.typography.bodySmall)
                        SocratesButton(onClick = { val old = selected; val draftKey = secret; if (old == null) vm.create(label.ifBlank { "Custom" }, url.trim(), model.trim(), draftKey, multimodal) else vm.update(old.id, label.trim(), url.trim(), model.trim(), draftKey.ifEmpty { null }, multimodal) }, enabled = !state.busy && url.startsWith("https://") && model.isNotBlank() && (selected != null || secret.isNotEmpty()), modifier = Modifier.fillMaxWidth()) { Text(if (state.busy) "保存中…" else "保存") }
                    }
                    selected != null -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(selected!!.label, style = MaterialTheme.typography.headlineSmall); Text(selected!!.url); Text("模型：${selected!!.model}"); Text(if (selected!!.hasKey) "密钥已配置 · ${selected!!.keyHint.orEmpty()}" else "未设置密钥")
                        if (!selected!!.isActive) SocratesButton(onClick = { vm.activate(selected!!.id) }, enabled = !state.busy) { Text("设为当前服务商") }
                        if (!selected!!.isBuiltIn) { SocratesOutlinedButton(onClick = { edit(selected) }) { Text("编辑") }; SocratesTextButton(onClick = { deleting = selected }) { ReferenceIcon(ReferenceGlyph.Trash, null); Text("删除自定义服务商") } } else Text("内置服务商由系统管理，不能在此编辑或删除。")
                    }
                    else -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (state.providers.isEmpty()) Text("没有可用服务商。可添加自定义服务商。", Modifier.padding(12.dp))
                        state.providers.forEach { p -> SocratesCard(Modifier.fillMaxWidth().clickable { selected = p }, shape = RoundedCornerShape(16.dp)) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) { Row(verticalAlignment = Alignment.CenterVertically) { Text(p.label, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium); if (p.isActive) Text("当前", color = MaterialTheme.colorScheme.primary) }; Text("${p.model} · ${p.url}", style = MaterialTheme.typography.bodySmall); Text(if (p.hasKey) "密钥已配置 · ${p.keyHint.orEmpty()}" else "未配置密钥", style = MaterialTheme.typography.bodySmall); if (!p.isActive) SocratesTextButton(onClick = { vm.activate(p.id) }, enabled = !state.busy) { Text("启用") } } } }
                        Text("启用的服务商决定聊天使用的模型。没有个人启用项时，服务端使用系统默认模型。系统模型配置由管理员管理，不在此调用管理员接口。", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            }
        }
    }
    deleting?.let { target -> SocratesAlert(onDismissRequest = { deleting = null }, title = { Text("删除服务商？") }, text = { Text("${target.label} 将被永久删除。") }, confirmButton = { SocratesTextButton(onClick = { deleting = null; selected = null; vm.delete(target.id) }) { Text("删除") } }, dismissButton = { SocratesTextButton(onClick = { deleting = null }) { Text("取消") } }) }
}
