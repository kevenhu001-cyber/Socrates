package com.socrates.android.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items as staggeredItems
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.socrates.android.data.FeatureItem
import org.json.JSONObject

@Composable
fun FeatureSheet(kind: String, onDismiss: () -> Unit, onStartChat: (String) -> Unit, onAuthLost: () -> Unit = {}, onUseFile: (String, String, String) -> Unit = { _, _, _ -> }, onUseProject: (String, String) -> Unit = { _, _ -> }, onUseAssistant: (String, String) -> Unit = { _, _ -> }, onOpenSession: (String) -> Unit = {}) {
    val vm: FeatureViewModel = viewModel()
    val state by vm.state.collectAsStateWithLifecycle()
    var editing by remember(kind) { mutableStateOf(false) }
    var query by remember(kind) { mutableStateOf("") }
    var taskFilter by remember(kind) { mutableStateOf("已开启") }
    var libraryFilter by remember(kind) { mutableStateOf("推荐") }
    var projectFilter by remember(kind) { mutableStateOf("全部") }
    var credentialConnector by remember { mutableStateOf<FeatureItem?>(null) }
    var disconnectConnector by remember { mutableStateOf<FeatureItem?>(null) }
    val context = androidx.compose.ui.platform.LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(vm::upload) }
    val goBack: () -> Unit = {
        if (!state.busy) {
            when {
                editing -> editing = false
                state.selected != null -> vm.select(null)
                else -> onDismiss()
            }
        }
    }
    LaunchedEffect(kind) { vm.open(kind) }
    DisposableEffect(lifecycle, kind, vm) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && kind == "插件") vm.refreshConnectorStatuses()
        }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(state.notice) {
        if (state.notice == "已保存。" || state.notice == "图片已生成。") editing = false
    }
    LaunchedEffect(state.unauthorized) { if (state.unauthorized) { onAuthLost(); onDismiss() } }
    BackHandler(onBack = goBack)
    Dialog(onDismissRequest = goBack, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(SocratesDesign.Page)) {
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
                Row(Modifier.fillMaxWidth().height(SocratesDesign.HeaderHeight).padding(horizontal = SocratesDesign.PageGutter), verticalAlignment = Alignment.CenterVertically) {
                    SocratesIconButton(goBack, Modifier.background(Color.White, CircleShape), enabled = !state.busy) {
                        ReferenceIcon(ReferenceGlyph.Back, if (state.selected != null || editing) "返回" else "关闭")
                    }
                    Text(
                        if (editing) if (state.selected == null) "新增$kind" else "编辑$kind" else kind,
                        Modifier.weight(1f).padding(horizontal = 8.dp).semantics { heading() },
                        style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    Box(Modifier.size(SocratesDesign.Touch), contentAlignment = Alignment.Center) {
                        if (kind in setOf("项目", "记忆", "助手", "定时任务", "图像") && state.selected == null && !editing) {
                            SocratesIconButton(onClick = { vm.select(null); editing = true }, enabled = !state.busy) { ReferenceIcon(ReferenceGlyph.Plus, "新增$kind") }
                        }
                    }
                }
                state.error?.let { message ->
                    SocratesCard(Modifier.fillMaxWidth().padding(horizontal = 16.dp), containerColor = MaterialTheme.colorScheme.errorContainer) {
                        Row(Modifier.padding(start = 16.dp, end = 6.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(message, Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
                            // A list retry must not reset a mutation or pretend to retry saving a form.
                            if (!editing && state.selected == null) SocratesTextButton(onClick = vm::load, enabled = !state.busy && !state.loading) {
                                ReferenceIcon(ReferenceGlyph.Refresh, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(6.dp)); Text("重试")
                            }
                        }
                    }
                }
                state.notice?.let { Text(it, Modifier.padding(horizontal = 20.dp, vertical = 6.dp).semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted) }
                if (state.selected == null && !editing && kind in setOf("定时任务", "资料库", "项目")) {
                    val labels = when (kind) {
                        "定时任务" -> listOf("已开启", "已暂停", "已完成")
                        "资料库" -> listOf("推荐", "收藏", "文件夹", "图像", "全部")
                        else -> listOf("全部", "我创建的", "与你共享")
                    }
                    val selected = when (kind) { "定时任务" -> taskFilter; "资料库" -> libraryFilter; else -> projectFilter }
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        labels.forEach { label -> SocratesFilterChip(selected = selected == label, onClick = {
                            when (kind) { "定时任务" -> taskFilter = label; "资料库" -> libraryFilter = label; else -> projectFilter = label }
                        }, label = { Text(label) }) }
                    }
                }
                when {
                    state.loading && state.items.isEmpty() -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { SocratesSpinner() }
                    editing -> if (kind == "图像") ImagePromptForm(state.prompt, vm::setPrompt, state.busy, vm::createImage) { editing = false }
                        else FeatureForm(kind, state.selected != null, state.name, state.description, state.prompt, state.frequency, state.taskAt, state.systemPrompt, state.busy, vm::setName, vm::setDescription, vm::setPrompt, vm::setFrequency, vm::setTaskAt, vm::setSystemPrompt, { vm.save() }, { editing = false })
                    state.selected != null -> FeatureDetail(kind, state.selected!!, vm, state.busy, state.connectorConfigured, onUseFile, onUseProject, onUseAssistant, onOpenSession, state.imageBytes, state.imageLoading,
                        onConnectConnector = { item ->
                            if (item.raw.optJSONObject("credentialInput")?.optJSONArray("fields")?.length()?.let { it > 0 } == true) credentialConnector = item
                            else vm.connectConnector(item.id) { url -> context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                        }, onRefreshConnector = vm::refreshConnectorStatus, onDisconnectConnector = { disconnectConnector = it }) { editing = true }
                    else -> FeatureList(kind, state.items, state.legacyPluginItems, state.connectorConfigured, state.openConnectorAvailable, state.loading, state.busy, vm, query, taskFilter, libraryFilter, projectFilter, onStartChat,
                        onScheduledTemplate = { template -> vm.select(null); vm.setScheduledTemplate(template.title, template.prompt); editing = true }, onCreate = { editing = true; vm.select(null) }, onSelect = vm::select,
                        onConnectConnector = { item ->
                            if (item.raw.optJSONObject("credentialInput")?.optJSONArray("fields")?.length()?.let { it > 0 } == true) credentialConnector = item
                            else vm.connectConnector(item.id) { url -> context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                        }, onLegacyPluginToggle = vm::toggle, onLegacyPluginDelete = vm::requestDelete)
                }
                if (state.selected == null && !editing && kind in setOf("资料库", "项目", "图像", "插件", "记忆")) {
                    Column(Modifier.fillMaxWidth().padding(horizontal = SocratesDesign.ComposerInset, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            SocratesField(query, { query = it }, Modifier.weight(1f).testTag("feature-search-$kind"), leadingIcon = { ReferenceIcon(ReferenceGlyph.Search, tint = SocratesDesign.Muted) }, placeholder = { Text("搜索$kind") }, singleLine = true, shape = CircleShape)
                            if (kind == "资料库") SocratesIconButton(onClick = { picker.launch(arrayOf("*/*")) }, modifier = Modifier.background(Color.White, CircleShape), enabled = !state.busy) {
                                if (state.busy) SocratesSpinner(Modifier.size(20.dp)) else ReferenceIcon(ReferenceGlyph.Plus, "上传资料")
                            }
                        }
                        if (kind == "记忆") SocratesTextButton(onClick = { vm.setIncludeDisabledMemories(!state.includeDisabledMemories) }, enabled = !state.busy && !state.loading, modifier = Modifier.align(Alignment.End)) { Text(if (state.includeDisabledMemories) "含停用" else "仅启用") }
                    }
                }
            }
            state.needsConfirmation?.let { id ->
                val target = (state.items + state.legacyPluginItems).firstOrNull { it.id == id }
                SocratesAlert(
                    onDismissRequest = { if (!state.busy) vm.cancelDelete() }, title = { Text("确认删除？") },
                    text = { Text("${target?.title ?: "此资源"} 将被永久删除。此操作无法撤销。") },
                    confirmButton = { SocratesButton(onClick = vm::deleteConfirmed, enabled = !state.busy, containerColor = MaterialTheme.colorScheme.error) { Text(if (state.busy) "删除中…" else "删除") } },
                    dismissButton = { SocratesTextButton(onClick = vm::cancelDelete, enabled = !state.busy) { Text("取消") } },
                )
            }
            credentialConnector?.let { item ->
                ConnectorCredentialsDialog(item, state.busy, onDismiss = { if (!state.busy) credentialConnector = null }, onConnect = { body ->
                    vm.connectConnector(item.id, body)
                    credentialConnector = null
                })
            }
            disconnectConnector?.let { item ->
                SocratesAlert(onDismissRequest = { if (!state.busy) disconnectConnector = null }, title = { Text("断开连接？") },
                    text = { Text("${item.title} 的已保存连接信息将被移除。") },
                    confirmButton = { SocratesButton(onClick = { vm.disconnectConnector(item.id); disconnectConnector = null }, enabled = !state.busy, containerColor = MaterialTheme.colorScheme.error) { Text("断开") } },
                    dismissButton = { SocratesTextButton(onClick = { disconnectConnector = null }, enabled = !state.busy) { Text("取消") } })
            }
        }
    }
}

@Composable
private fun ColumnScope.FeatureList(kind: String, items: List<FeatureItem>, legacyPluginItems: List<FeatureItem>, connectorConfigured: Boolean, openConnectorAvailable: Boolean, loading: Boolean, busy: Boolean, vm: FeatureViewModel, query: String, taskFilter: String, libraryFilter: String, projectFilter: String, onStartChat: (String) -> Unit, onScheduledTemplate: (ScheduledTemplate) -> Unit, onCreate: () -> Unit, onSelect: (FeatureItem) -> Unit, onConnectConnector: (FeatureItem) -> Unit, onLegacyPluginToggle: (FeatureItem) -> Unit, onLegacyPluginDelete: (FeatureItem) -> Unit) {
    val directoryState by vm.state.collectAsStateWithLifecycle()
    val filtered = FeatureDirectoryModels.filter(items, query, kind, taskFilter, libraryFilter, projectFilter)
    if (kind == "插件") {
        PluginDirectoryList(items, legacyPluginItems, connectorConfigured, openConnectorAvailable, loading, busy, query, onSelect, onConnectConnector, onLegacyPluginToggle, onLegacyPluginDelete)
        return
    }
    if (kind == "定时任务") {
        if (filtered.isEmpty() && !loading) {
            Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 26.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(42.dp))
                Text(when (taskFilter) { "已暂停" -> "暂无已暂停的自动化流程"; "已完成" -> "暂无已完成的自动化流程"; else -> "尚无已安排的自动化流程" }, color = Color(0xFF666666), textAlign = TextAlign.Center, style = MaterialTheme.typography.titleMedium)
                if (query.isBlank()) ScheduledRecommendations(onSelect = onScheduledTemplate)
            }
        } else LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (query.isBlank()) item { ScheduledRecommendations(onSelect = onScheduledTemplate) }
            items(filtered, key = { it.id }) { item -> FeatureResourceRow(kind, item, busy, { onSelect(item) }, { vm.toggle(item) }, { }) }
        }
        return
    }
    if (items.isEmpty() && !loading) {
        Box(Modifier.weight(1f).fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(40.dp).background(Color(0xFFF1F2F4), RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
                    ReferenceIcon(when (kind) { "图像" -> ReferenceGlyph.Image; "插件" -> ReferenceGlyph.Plugin; else -> ReferenceGlyph.Folder })
                }
                Text(if (kind == "项目") "开始你的第一个项目" else if (kind == "插件") "尚未安装插件" else "这里还没有内容", style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
                Text(when (kind) { "项目" -> "项目可帮助你集中整理聊天、文件和工具"; "图像" -> "本帐号尚无已保存的图片文件。"; "Codex" -> "尚无可显示的 Codex 运行记录。"; "资料库" -> "上传文件后，可查看详情或在对话中引用。"; else -> "创建或连接资源后，它们会显示在这里。" }, color = SocratesDesign.Muted, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
                if (kind == "项目") SocratesButton(onClick = onCreate, enabled = !busy) { Text("新建项目") }
            }
        }
        return
    }
    if (filtered.isEmpty() && !loading) {
        Box(Modifier.weight(1f).fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { Text("没有符合条件的$kind", color = SocratesDesign.Muted, textAlign = TextAlign.Center) }
        // Filtering the currently loaded page must not hide the memory pagination control.
        if (kind == "记忆" && directoryState.memoryCursor != null) SocratesTextButton(onClick = vm::loadMoreMemories, modifier = Modifier.align(Alignment.CenterHorizontally), enabled = !busy) { Text("加载更多记忆") }
        return
    }
    if (kind == "资料库" || kind == "图像") {
        LazyVerticalStaggeredGrid(columns = StaggeredGridCells.Fixed(2), modifier = Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalItemSpacing = 14.dp) {
            staggeredItems(filtered, key = { it.id }) { item ->
                val mime = item.raw.optString("mimeType").ifBlank { item.raw.optString("mime") }
                val imageFile = kind == "图像" || mime.startsWith("image/")
                val bitmap by produceState<Bitmap?>(null, item.id, imageFile, item.raw.optString("url")) { value = if (imageFile) runCatching { vm.thumbnail(item.id, item.raw.optString("url")) }.getOrNull() else null }
                val tileHeight = if (kind == "图像") 214.dp else if (imageFile) 116.dp else 172.dp
                SocratesCard(Modifier.fillMaxWidth().height(tileHeight), shape = RoundedCornerShape(if (kind == "图像") 22.dp else 16.dp)) {
                    Box(Modifier.fillMaxSize().clickable(enabled = !busy, role = Role.Button) { onSelect(item) }) {
                        if (imageFile) {
                            if (bitmap != null) Image(bitmap!!.asImageBitmap(), contentDescription = item.title, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                            else Column(Modifier.align(Alignment.Center).padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                ReferenceIcon(ReferenceGlyph.Image, description = item.title, modifier = Modifier.size(28.dp), tint = Color.LightGray)
                                Text("预览不可用", Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                            }
                            if (kind == "图像") Text(item.title, Modifier.align(Alignment.BottomStart).fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Transparent, Color(0x77000000)))).padding(horizontal = 12.dp, vertical = 14.dp), style = MaterialTheme.typography.titleMedium, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        } else {
                            Text(item.title, Modifier.align(Alignment.TopStart).padding(16.dp), style = MaterialTheme.typography.titleMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
                            val document = mime.contains("pdf", true) || mime.contains("presentation", true)
                            val web = mime.contains("html", true) || mime.contains("xml", true)
                            ReferenceIcon(if (web) ReferenceGlyph.Globe else ReferenceGlyph.Document, modifier = Modifier.align(Alignment.BottomStart).padding(16.dp).size(22.dp), tint = if (document) Color(0xFFEB5353) else SocratesDesign.Blue)
                        }
                    }
                }
            }
        }
    } else {
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(if (kind == "插件") 0.dp else 10.dp)) {
            items(filtered, key = { it.id }) { item ->
                FeatureResourceRow(kind, item, busy, { onSelect(item) }, { vm.toggle(item) }, { onStartChat("请帮我处理这个编程任务：${item.title}。注意：当前原生端不提供 Codex 工作区执行能力。") })
            }
        }
    }
    if (kind == "记忆" && directoryState.memoryCursor != null) SocratesTextButton(onClick = vm::loadMoreMemories, modifier = Modifier.align(Alignment.CenterHorizontally), enabled = !loading && !busy) { Text(if (loading) "正在加载…" else "加载更多记忆") }
}

private data class ScheduledTemplate(val title: String, val description: String, val prompt: String, val icon: String)

private val scheduledTemplates = listOf(
    ScheduledTemplate("每日简报", "每天早晨汇总我关注的最新动态。", "Send me a concise daily briefing with the latest updates on my saved topics.", "☀️"),
    ScheduledTemplate("邮件监控", "找出需要我处理或回复的消息。", "Check my inbox and tell me which messages need a reply or follow-up.", "📥"),
    ScheduledTemplate("每周研究动态", "比较我关注主题的最新研究进展。", "Give me a weekly research briefing comparing the latest work on my chosen topic.", "🔎"),
    ScheduledTemplate("AI 研究摘要", "每周五发送值得关注的新研究。", "Give me the best new AI research every Friday with a short explanation of why it matters.", "🤖"),
    ScheduledTemplate("项目状态", "持续跟进项目进展和待解决事项。", "Give me a weekly progress brief on my active project and its next milestone.", "💻"),
)

@Composable
private fun ScheduledRecommendations(onSelect: (ScheduledTemplate) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 36.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("推荐", style = MaterialTheme.typography.titleMedium, color = SocratesDesign.Muted)
        scheduledTemplates.forEach { template ->
            SocratesCard(Modifier.fillMaxWidth().clickable(role = Role.Button) { onSelect(template) }, shape = RoundedCornerShape(24.dp)) {
                Row(Modifier.fillMaxWidth().heightIn(min = 78.dp).padding(horizontal = 18.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(template.icon, fontSize = 28.sp)
                    Column(Modifier.weight(1f).padding(start = 14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(template.title, style = MaterialTheme.typography.titleMedium)
                        Text(template.description, color = SocratesDesign.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                    ReferenceIcon(ReferenceGlyph.Plus, "使用${template.title}模板", tint = SocratesDesign.Muted)
                }
            }
        }
    }
}

@Composable
private fun ColumnScope.PluginDirectoryList(
    connectors: List<FeatureItem>, legacyItems: List<FeatureItem>, configured: Boolean, openConnectorAvailable: Boolean,
    loading: Boolean, busy: Boolean, query: String, onSelect: (FeatureItem) -> Unit,
    onConnect: (FeatureItem) -> Unit, onLegacyToggle: (FeatureItem) -> Unit, onLegacyDelete: (FeatureItem) -> Unit,
) {
    var connectedOnly by remember { mutableStateOf(false) }
    val visible = connectors.filter { item ->
        val connection = item.raw.optJSONObject("connection")
        val installed = connection?.optString("status") in setOf("connected", "initiated")
        (!connectedOnly || installed) && (query.isBlank() || listOf(item.title, item.description, item.raw.optString("capabilities")).any { it.contains(query, true) })
    }
    val installed = visible.filter { it.raw.optJSONObject("connection")?.optString("status") in setOf("connected", "initiated") }
    val legacyVisible = legacyItems.filter { query.isBlank() || it.title.contains(query, true) || it.description.contains(query, true) }
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        if (installed.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("已安装", style = MaterialTheme.typography.titleMedium, color = SocratesDesign.Muted, modifier = Modifier.weight(1f))
                    SocratesTextButton(onClick = { connectedOnly = true }) { Text("查看全部 ›") }
                }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    installed.forEach { item ->
                        Column(Modifier.width(64.dp).clickable(role = Role.Button) { onSelect(item) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            ConnectorMark(item.title)
                            Text(item.title, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SocratesFilterChip(selected = !connectedOnly, onClick = { connectedOnly = false }, label = { Text("全部") })
            SocratesFilterChip(selected = connectedOnly, onClick = { connectedOnly = true }, label = { Text("已连接") })
        }
        if (loading && connectors.isEmpty()) Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { SocratesSpinner() }
        else if (visible.isEmpty()) {
            Column(Modifier.fillMaxWidth().padding(vertical = 20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (connectedOnly) "尚未连接应用" else "没有匹配的连接器", style = MaterialTheme.typography.titleMedium)
                Text(if (connectedOnly) "连接器目录中的应用连接后会显示在这里。" else "目录只展示服务端提供的真实连接器。", color = SocratesDesign.Muted, textAlign = TextAlign.Center)
            }
        } else {
            if (!connectedOnly && visible.take(5).isNotEmpty()) {
                Text("热门", style = MaterialTheme.typography.titleMedium, color = SocratesDesign.Muted)
                visible.take(5).forEach { item -> ConnectorCatalogRow(item, configured, busy, onSelect, onConnect) }
            }
            val newer = if (connectedOnly) visible else visible.drop(5)
            if (newer.isNotEmpty()) {
                Text(if (connectedOnly) "已连接应用" else "新品推荐", style = MaterialTheme.typography.titleMedium, color = SocratesDesign.Muted)
                newer.forEach { item -> ConnectorCatalogRow(item, configured, busy, onSelect, onConnect) }
            }
        }
        if (!configured && !openConnectorAvailable && connectors.isNotEmpty()) Text("连接器服务尚未完成服务器配置。", color = SocratesDesign.Muted, style = MaterialTheme.typography.bodySmall)
        if (legacyVisible.isNotEmpty()) {
            SocratesDivider(color = Color(0xFFE8E8E8))
            Text("我的插件", style = MaterialTheme.typography.titleMedium, color = SocratesDesign.Muted)
            legacyVisible.forEach { item -> PluginRow(item, onSelect, { onLegacyToggle(item) }, { onLegacyDelete(item) }, enabled = !busy) }
        }
    }
}

@Composable
private fun ConnectorCatalogRow(item: FeatureItem, configured: Boolean, busy: Boolean, onSelect: (FeatureItem) -> Unit, onConnect: (FeatureItem) -> Unit) {
    val status = item.raw.optJSONObject("connection")?.optString("status").orEmpty()
    val connected = status == "connected"
    val initiated = status == "initiated"
    val available = !item.raw.has("available") || item.raw.optBoolean("available")
    val connectable = available && (item.id.startsWith("oc_") || configured)
    Row(Modifier.fillMaxWidth().heightIn(min = 82.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).clickable(role = Role.Button) { onSelect(item) }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            ConnectorMark(item.title)
            Column(Modifier.weight(1f).padding(start = 14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(item.description.ifBlank { item.raw.optJSONArray("capabilities")?.let { array -> (0 until array.length()).map { array.optString(it) }.joinToString(" · ") }.orEmpty() }, color = SocratesDesign.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (connected || initiated) SocratesTextButton(onClick = { onSelect(item) }, enabled = !busy) { Text(if (connected) "管理" else "授权中") }
        else if (connectable) SocratesIconButton(onClick = { onConnect(item) }, enabled = !busy) { ReferenceIcon(ReferenceGlyph.Plus, "连接${item.title}", tint = SocratesDesign.Blue) }
        else Text("不可用", Modifier.padding(horizontal = 8.dp), style = MaterialTheme.typography.labelSmall, color = SocratesDesign.Muted)
    }
}

@Composable
private fun ConnectorMark(name: String) {
    val palette = listOf(Color(0xFFECE8FF), Color(0xFFE2F2EC), Color(0xFFFFEEE2), Color(0xFFE6EFFC))
    val color = palette[(name.hashCode() and Int.MAX_VALUE) % palette.size]
    Box(Modifier.size(52.dp).background(color, RoundedCornerShape(15.dp)), contentAlignment = Alignment.Center) {
        Text(name.trim().take(1).uppercase(), fontWeight = FontWeight.SemiBold, fontSize = 20.sp, color = Color(0xFF343644))
    }
}

@Composable
private fun ConnectorCredentialsDialog(item: FeatureItem, busy: Boolean, onDismiss: () -> Unit, onConnect: (JSONObject) -> Unit) {
    val fields = item.raw.optJSONObject("credentialInput")?.optJSONArray("fields")
    val values = remember(item.id) { mutableStateMapOf<String, String>().apply { if (fields != null) for (index in 0 until fields.length()) fields.optJSONObject(index)?.optString("key")?.takeIf { it.isNotBlank() }?.let { put(it, "") } } }
    SocratesSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 22.dp, vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("连接 ${item.title}", style = MaterialTheme.typography.headlineSmall)
            Text(item.description, color = SocratesDesign.Muted, style = MaterialTheme.typography.bodyMedium)
            if (fields != null) for (index in 0 until fields.length()) {
                val field = fields.optJSONObject(index) ?: continue
                val key = field.optString("key")
                val type = field.optString("type")
                SocratesField(values[key].orEmpty(), { values[key] = it }, Modifier.fillMaxWidth().testTag("connector-credential-$key"), enabled = !busy,
                    label = { Text(field.optString("label").ifBlank { key }) }, singleLine = true,
                    visualTransformation = if (type == "password" || key.contains("key", true) || key.contains("secret", true)) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None)
                field.optString("help").takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted) }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                SocratesTextButton(onClick = onDismiss, enabled = !busy) { Text("取消") }
                SocratesButton(onClick = {
                    val body = if (item.raw.optString("authType") == "api_key") JSONObject().put("apiKey", values.values.firstOrNull().orEmpty())
                    else JSONObject().put("values", JSONObject().apply { values.forEach { (key, value) -> put(key, value) } })
                    onConnect(body)
                }, enabled = !busy && values.values.all { it.isNotBlank() }) { Text(if (busy) "连接中…" else "连接") }
            }
        }
    }
}

@Composable
private fun FeatureResourceRow(kind: String, item: FeatureItem, busy: Boolean, onSelect: () -> Unit, onToggle: () -> Unit, onStartChat: () -> Unit) {
    val status = item.raw.optString("status")
    val toggleable = kind == "记忆" || kind == "定时任务" && status in setOf("pending", "active", "paused")
    val checked = if (kind == "记忆") item.raw.optBoolean("enabled", true) else ScheduledTaskPresentation.isActive(status)
    SocratesCard(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).clickable(enabled = !busy, role = Role.Button, onClick = onSelect).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (item.description.isNotBlank()) Text(item.description, style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (kind == "定时任务") {
                    val statusLabel = listOf(ScheduledTaskPresentation.statusLabel(status), ScheduledTaskPresentation.frequencyLabel(item.raw.optString("frequency"))).filter { it.isNotBlank() }.joinToString(" · ")
                    if (statusLabel.isNotBlank()) Text(statusLabel, style = MaterialTheme.typography.labelSmall, color = SocratesDesign.Muted)
                }
            }
            if (toggleable) SocratesSwitch(checked, { onToggle() }, enabled = !busy, modifier = Modifier.semantics { contentDescription = if (kind == "记忆") "启用记忆：${item.title}" else "启用任务：${item.title}" })
            else SocratesIconButton(onClick = onSelect, enabled = !busy) { ReferenceIcon(ReferenceGlyph.MoreHorizontal, "查看${item.title}详情", tint = SocratesDesign.Muted) }
        }
        if (kind == "Codex") SocratesTextButton(onClick = onStartChat, enabled = !busy, modifier = Modifier.padding(start = 4.dp, bottom = 4.dp)) { Text("转到编程对话") }
    }
}

@Composable
private fun ColumnScope.FeatureDetail(kind: String, item: FeatureItem, vm: FeatureViewModel, busy: Boolean, connectorConfigured: Boolean, onUseFile: (String, String, String) -> Unit, onUseProject: (String, String) -> Unit, onUseAssistant: (String, String) -> Unit, onOpenSession: (String) -> Unit, imageBytes: ByteArray?, imageLoading: Boolean, onConnectConnector: (FeatureItem) -> Unit, onRefreshConnector: (String) -> Unit, onDisconnectConnector: (FeatureItem) -> Unit, onEdit: () -> Unit) {
    var projectResources by remember(item.id) { mutableStateOf(false) }
    if (projectResources) ProjectResourcesSheet(item.id, onDismiss = { projectResources = false }, onOpenSession = onOpenSession)
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(item.title, Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineSmall)
        val imageBitmap by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, imageBytes) {
            value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) {
                imageBytes?.let { bytes ->
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                    var sample = 1
                    while (bounds.outWidth / sample > 2048 || bounds.outHeight / sample > 2048) sample *= 2
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })?.asImageBitmap()
                }
            }
        }
        val preview = imageBitmap
        if (kind == "图像") {
            when {
                imageLoading -> Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) { SocratesSpinner() }
                preview != null -> Image(preview, contentDescription = item.title, modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp).clip(RoundedCornerShape(20.dp)), contentScale = ContentScale.Fit)
                else -> Text("图片预览暂不可用；仍可尝试在对话中附加原文件。", color = SocratesDesign.Muted)
            }
        }
        if (kind == "资料库" && item.raw.optString("_collection") == "artifacts") {
            val source = item.raw.optString("source")
            val artifactType = item.raw.optString("type").lowercase()
            when {
                source.isBlank() -> Unit
                artifactType.contains("html") -> RichResultView(JSONObject().put("kind", "artifact").put("mimeType", "text/html").put("content", source).put("name", item.title), artifactType)
                artifactType.contains("visual") -> {
                    val spec = runCatching { JSONObject(source) }.getOrNull()
                    if (spec != null) RichResultView(JSONObject().put("kind", "visualization").put("spec", spec), spec.optString("template"))
                    else SelectionContainer { Text(source, style = MaterialTheme.typography.bodySmall) }
                }
                else -> SocratesCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Artifact 内容 · ${item.raw.optString("type").ifBlank { "文本" }}", style = MaterialTheme.typography.labelMedium, color = SocratesDesign.Muted)
                        SelectionContainer { Text(source, style = MaterialTheme.typography.bodySmall, maxLines = 24, overflow = TextOverflow.Ellipsis) }
                    }
                }
            }
        }
        if (item.description.isNotBlank()) Text(item.description, color = SocratesDesign.Muted, style = MaterialTheme.typography.bodyMedium)
        val details = when (kind) {
            "项目" -> listOf("描述" to item.raw.optString("description"), "系统提示" to item.raw.optString("systemPrompt"))
            "记忆" -> listOf("记忆内容" to item.raw.optString("text"), "状态" to if (item.raw.optBoolean("enabled", true)) "已启用" else "已停用")
            "资料库" -> listOf("文件类型" to item.raw.optString("mimeType").ifBlank { item.raw.optString("mime") }, "大小（字节）" to item.raw.optString("size"), "类别" to item.raw.optString("kind"), "上传时间" to item.raw.optString("uploadedAt"))
            "图像" -> listOf("文件名" to item.raw.optString("name"), "图片文件" to item.raw.optString("kind", "image"), "上传时间" to item.raw.optString("uploadedAt"), "文件 ID" to item.id)
            "助手" -> listOf("助手指令" to runCatching { org.json.JSONObject(item.raw.optString("source")).optString("instructions") }.getOrDefault(item.raw.optString("source")), "更新时间" to item.raw.optString("updatedAt"))
            "定时任务" -> listOf("执行内容" to item.raw.optString("prompt"), "频率" to ScheduledTaskPresentation.frequencyLabel(item.raw.optString("frequency")), "状态" to ScheduledTaskPresentation.statusLabel(item.raw.optString("status")), "下次运行" to item.raw.optString("nextRunAt"), "最近运行" to item.raw.optString("lastRunAt"), "执行次数" to item.raw.optString("runCount"))
            "插件" -> if (item.raw.optString("_recordType") == "connector") {
                val capabilities = item.raw.optJSONArray("capabilities")?.let { array -> (0 until array.length()).map { array.optString(it) }.filter { it.isNotBlank() }.joinToString("、") }.orEmpty()
                val connection = item.raw.optJSONObject("connection")
                listOf("说明" to item.raw.optString("description"), "认证方式" to item.raw.optString("authType"), "状态" to when (connection?.optString("status")) { "connected" -> "已连接"; "initiated" -> "等待授权"; else -> "未连接" }, "帐号" to connection?.optString("displayName").orEmpty(), "可用能力" to capabilities)
            } else listOf("说明" to item.raw.optString("description"), "类型" to item.raw.optString("type"), "状态" to if (item.raw.optBoolean("isEnabled", true)) "已启用" else "已停用")
            else -> listOf("任务" to item.raw.optString("task"), "状态" to item.raw.optString("status"), "结果摘要" to item.raw.optString("summary"), "错误" to item.raw.optString("error"))
        }
        val visibleDetails = details.filter { it.second.isNotBlank() && it.second != "null" }
        if (visibleDetails.isNotEmpty()) SocratesCard(Modifier.fillMaxWidth()) {
            SelectionContainer {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    visibleDetails.forEach { (label, value) -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(label, style = MaterialTheme.typography.labelMedium, color = SocratesDesign.Muted)
                        Text(value, style = MaterialTheme.typography.bodyMedium)
                    } }
                }
            }
        }
        // Full-width actions wrap naturally with large text instead of overflowing a phone row.
        val connector = kind == "插件" && item.raw.optString("_recordType") == "connector"
        val connectionStatus = item.raw.optJSONObject("connection")?.optString("status")
        val connectorAvailable = !item.raw.has("available") || item.raw.optBoolean("available")
        val connectorConnectable = connectorAvailable && (item.id.startsWith("oc_") || connectorConfigured)
        val editable = kind in setOf("项目", "记忆", "资料库", "定时任务", "助手") || kind == "插件" && !connector && !item.raw.optBoolean("isBuiltin", false)
        if (kind == "图像" || kind == "资料库") SocratesButton(onClick = { onUseFile(item.id, item.title, item.raw.optString("mimeType").ifBlank { item.raw.optString("mime", "application/octet-stream") }) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("在对话中附加") }
        if (kind == "项目") {
            SocratesButton(onClick = { onUseProject(item.id, item.title) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("开始项目对话") }
            SocratesOutlinedButton(onClick = { projectResources = true }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("管理项目会话") }
        }
        if (kind == "助手") SocratesButton(onClick = { onUseAssistant(item.id, item.title) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("使用此助手") }
        if (connector && connectionStatus != "connected" && connectionStatus != "initiated" && connectorConnectable) SocratesButton(onClick = { onConnectConnector(item) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "连接中…" else "连接 ${item.title}") }
        if (connector && connectionStatus != "connected" && connectionStatus != "initiated" && !connectorConnectable) Text("此连接器尚未在服务器配置，暂不可连接。", color = SocratesDesign.Muted, style = MaterialTheme.typography.bodySmall)
        if (connector && connectionStatus == "initiated") SocratesOutlinedButton(onClick = { onRefreshConnector(item.id) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "检查中…" else "刷新授权状态") }
        if (connector && connectionStatus in setOf("connected", "initiated")) {
            SocratesOutlinedButton(onClick = { onRefreshConnector(item.id) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("刷新连接状态") }
            SocratesTextButton(onClick = { onDisconnectConnector(item) }, enabled = !busy, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("断开连接", color = MaterialTheme.colorScheme.error) }
        }
        if (kind == "插件" && !connector) SocratesOutlinedButton(onClick = { vm.toggle(item) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (item.raw.optBoolean("isEnabled", true)) "停用插件" else "启用插件") }
        if (kind == "定时任务") SocratesOutlinedButton(onClick = { vm.runTask(item) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "处理中…" else "立即运行") }
        if (kind == "定时任务") SocratesOutlinedButton(onClick = { vm.toggle(item) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (ScheduledTaskPresentation.isActive(item.raw.optString("status"))) "暂停任务" else "恢复任务") }
        if (editable) SocratesOutlinedButton(onClick = onEdit, enabled = !busy, modifier = Modifier.fillMaxWidth()) { ReferenceIcon(ReferenceGlyph.Compose, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("编辑") }
        if (kind != "Codex" && !connector && !(kind == "插件" && item.raw.optBoolean("isBuiltin", false))) SocratesTextButton(onClick = { vm.requestDelete(item) }, enabled = !busy, modifier = Modifier.align(Alignment.CenterHorizontally)) { ReferenceIcon(ReferenceGlyph.Trash, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error); Spacer(Modifier.width(8.dp)); Text("删除", color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun ColumnScope.FeatureForm(kind: String, isEditing: Boolean, name: String, description: String, prompt: String, frequency: String, taskAt: String, systemPrompt: String, busy: Boolean, setName: (String) -> Unit, setDescription: (String) -> Unit, setPrompt: (String) -> Unit, setFrequency: (String) -> Unit, setTaskAt: (String) -> Unit, setSystemPrompt: (String) -> Unit, save: () -> Unit, cancel: () -> Unit) {
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(if (isEditing) "编辑$kind" else "新增$kind", Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineSmall)
        if (kind != "记忆") SocratesField(name, setName, Modifier.fillMaxWidth(), enabled = !busy, label = { Text(if (kind == "定时任务") "任务名称" else "名称") }, singleLine = true)
        when (kind) {
            "项目" -> {
                SocratesField(description, setDescription, Modifier.fillMaxWidth(), enabled = !busy, label = { Text("描述") }, minLines = 2)
                SocratesField(systemPrompt, setSystemPrompt, Modifier.fillMaxWidth(), enabled = !busy, label = { Text("项目指令") }, minLines = 4)
            }
            "记忆" -> SocratesField(description, setDescription, Modifier.fillMaxWidth(), enabled = !busy, label = { Text("记忆内容") }, minLines = 4)
            "插件", "助手" -> SocratesField(description, setDescription, Modifier.fillMaxWidth(), enabled = !busy, label = { Text(if (kind == "助手") "助手指令" else "描述") }, minLines = 3)
            "定时任务" -> {
                SocratesField(prompt, setPrompt, Modifier.fillMaxWidth(), enabled = !busy, label = { Text("执行内容") }, minLines = 3)
                SocratesField(taskAt, setTaskAt, Modifier.fillMaxWidth(), enabled = !busy, label = { Text("首次运行时间（含时区）") }, supportingText = { Text("使用 ISO 8601 日期时间并包含时区；默认约一小时后。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted) }, singleLine = true)
                Text("重复频率", style = MaterialTheme.typography.labelMedium, color = SocratesDesign.Muted)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("once" to "一次", "hourly" to "每小时", "daily" to "每天", "weekly" to "每周", "monthly" to "每月").forEach { (value, label) -> SocratesFilterChip(selected = frequency == value, onClick = { setFrequency(value) }, enabled = !busy, label = { Text(label) }) }
                }
                Text("任务会在你设置的首次运行时间后进入调度；启停状态由服务端保存。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            }
            "资料库" -> Text("资料内容在本页只读，支持重命名、查看与删除。", color = SocratesDesign.Muted, style = MaterialTheme.typography.bodySmall)
        }
        val valid = (if (kind == "记忆") description.isNotBlank() else name.isNotBlank()) && (kind != "定时任务" || prompt.isNotBlank() && taskAt.isNotBlank())
        SocratesButton(onClick = save, modifier = Modifier.fillMaxWidth(), enabled = !busy && valid) {
            if (busy) { SocratesSpinner(Modifier.size(18.dp), color = Color.White); Spacer(Modifier.width(8.dp)) }
            Text(if (busy) "保存中…" else "保存")
        }
        SocratesTextButton(onClick = cancel, enabled = !busy, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("取消") }
    }
}

@Composable
private fun PluginRow(item: FeatureItem, onSelect: (FeatureItem) -> Unit, onToggle: () -> Unit, onDelete: () -> Unit, enabled: Boolean) {
    var menu by remember(item.id) { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().heightIn(min = 78.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable(enabled = enabled, role = Role.Button) { onSelect(item) }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            val letter = item.title.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?"
            val palette = listOf(Color(0xFFECE8FF), Color(0xFFE2F2EC), Color(0xFFFFEEE2), Color(0xFFE6EFFC))
            val color = palette[(item.title.hashCode() and Int.MAX_VALUE) % palette.size]
            Box(Modifier.size(48.dp).background(color, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Text(letter, fontWeight = FontWeight.Bold, color = Color(0xFF343644)) }
            Column(Modifier.weight(1f).padding(start = 16.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(item.title, fontSize = 17.sp, lineHeight = 22.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(item.description.ifBlank { item.raw.optString("type") }, fontSize = 14.sp, lineHeight = 19.sp, color = Color(0xFF666666), maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        Box {
            SocratesIconButton(onClick = { menu = true }, enabled = enabled) { ReferenceIcon(ReferenceGlyph.MoreHorizontal, "${item.title}操作", tint = SocratesDesign.Muted) }
            SocratesMenu(menu, { menu = false }) {
                SocratesMenuItem({ Text("详情") }, { menu = false; onSelect(item) }, enabled = enabled)
                SocratesMenuItem({ Text(if (item.raw.optBoolean("isEnabled", true)) "停用" else "启用") }, { menu = false; onToggle() }, enabled = enabled)
                if (!item.raw.optBoolean("isBuiltin", false)) SocratesMenuItem({ Text("删除", color = MaterialTheme.colorScheme.error) }, { menu = false; onDelete() }, enabled = enabled)
            }
        }
    }
}

@Composable
private fun ColumnScope.ImagePromptForm(prompt: String, setPrompt: (String) -> Unit, busy: Boolean, create: () -> Unit, cancel: () -> Unit) {
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("生成图像", Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineSmall)
        Text("描述你想生成的图片。生成能力依赖帐号已配置的图像模型。", color = SocratesDesign.Muted, style = MaterialTheme.typography.bodyMedium)
        SocratesField(prompt, setPrompt, Modifier.fillMaxWidth(), enabled = !busy, label = { Text("图片描述") }, minLines = 4)
        SocratesButton(onClick = create, modifier = Modifier.fillMaxWidth(), enabled = !busy && prompt.isNotBlank()) {
            if (busy) { SocratesSpinner(Modifier.size(18.dp), color = Color.White); Spacer(Modifier.width(8.dp)) }
            Text(if (busy) "生成中…" else "生成")
        }
        SocratesTextButton(onClick = cancel, enabled = !busy, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("取消") }
    }
}
