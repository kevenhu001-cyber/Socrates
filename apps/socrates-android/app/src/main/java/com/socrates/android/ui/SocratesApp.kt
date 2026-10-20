@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.socrates.android.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.*
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.socrates.android.data.ChatMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val Blue = Color(0xFF3865EF)
private val Ink = Color(0xFF101010)
private val Gray = Color(0xFFF0F0F0)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SocratesApp(vm: ChatViewModel = viewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val drawer = rememberSocratesDrawerState()
    val focus = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val snackbar = remember { SnackbarHostState() }
    var work by rememberSaveable { mutableStateOf(false) }
    var settings by rememberSaveable { mutableStateOf(false) }
    var resource by rememberSaveable { mutableStateOf<String?>(null) }
    var profile by remember { mutableStateOf(false) }
    var account by remember { mutableStateOf(false) }
    var learningKind by remember { mutableStateOf<String?>(null) }
    var learningId by remember { mutableStateOf<String?>(null) }
    var shareSession by remember { mutableStateOf<String?>(null) }
    var find by remember { mutableStateOf(false) }
    var findQuery by remember { mutableStateOf("") }
    var jumpId by remember { mutableStateOf<String?>(null) }
    var editMessage by remember { mutableStateOf<ChatMessage?>(null) }
    var editText by remember { mutableStateOf("") }
    var sessionAction by remember { mutableStateOf<com.socrates.android.data.ChatSession?>(null) }
    var rename by remember { mutableStateOf(false) }
    var sessionTitle by remember { mutableStateOf("") }
    val voice = remember { VoiceInput(context.applicationContext, vm::error) }
    val speech = remember { SpeechPlayback(context.applicationContext, vm::error) }
    var reasoningMenu by remember { mutableStateOf(false) }
    var projectPicker by remember { mutableStateOf(false) }
    var uploadedFiles by remember { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current
    DisposableEffect(lifecycle, voice) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) voice.cancel().also { speech.stop() } }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer); voice.cancel(); speech.dispose() }
    }
    val audioPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) voice.start() else vm.error("麦克风权限未开启，可以继续使用文字输入。") }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(vm::attach) }
    var attachmentMenu by remember { mutableStateOf(false) }
    var fileSourceMenu by remember { mutableStateOf(false) }
    var capturedUri by rememberSaveable { mutableStateOf<String?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        capturedUri?.let { uri -> if (saved) vm.attach(android.net.Uri.parse(uri)) }
        capturedUri = null
    }
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(vm::attach) }
    fun attach() { attachmentMenu = true }
    fun record() {
        if (ui.streaming || ui.busy) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) voice.start() else audioPermission.launch(Manifest.permission.RECORD_AUDIO)
    }
    fun openResource(title: String, path: String, key: String) {
        scope.launch { drawer.close() }
        if (!ui.loggedIn) { vm.showAuth(true); return }
        resource = title
    }
    LaunchedEffect(ui.loggedIn, ui.baseUrl) { if (!ui.loggedIn) { projectPicker = false; uploadedFiles = false; reasoningMenu = false; resource = null; account = false; shareSession = null; learningId = null; learningKind = null } }
    LaunchedEffect(ui.error) { ui.error?.let { snackbar.showSnackbar(it); vm.clearError() } }
    BackHandler(drawer.isOpen || voice.active || work) {
        when { drawer.isOpen -> scope.launch { drawer.close() }; voice.active -> voice.cancel(); else -> work = false }
    }
    SocratesNavigationDrawer(
        drawerState = drawer,
        gesturesEnabled = !voice.active,
        scrimColor = Color.Black.copy(alpha = .48f),
        drawerContent = {
            SocratesDrawerSheet(Modifier.fillMaxWidth(.80f), drawerContainerColor = Color.White, drawerShape = RoundedCornerShape(0.dp), windowInsets = WindowInsets(0, 0, 0, 0)) {
                NativeSidebar(ui, onNew = { vm.newChat(); work = false; scope.launch { drawer.close() } }, onSelect = { if (it.kind == "exam" || it.mode == "tutor") { learningId = it.id; learningKind = null; resource = "教学与测验" } else vm.selectSession(it); work = false; scope.launch { drawer.close() } }, onProfile = { profile = true }, onRefresh = vm::refresh, onSessionMenu = { sessionAction = it; sessionTitle = it.title; rename = false },
                    onRestore = vm::restoreSession, onImages = { openResource("图像", "/files?limit=50", "files") },
                    onLibrary = { openResource("资料库", "/files?limit=50", "files") },
                    onProjects = { openResource("项目", "/projects", "projects") },
                    onAssistants = { openResource("助手", "/creations/items/assistants", "items") },
                    onTasks = { openResource("定时任务", "/scheduled-tasks", "tasks") },
                    onPlugins = { openResource("插件", "/plugins", "plugins") }, onCodex = { openResource("Codex", "/projects", "projects") })
            }
        }
    ) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFFF8F8F8), Color(0xFFFDFDFD), Color(0xFFFDFDFD), Color(0xFFF7F7F7))))) {
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
                ChatHeader(work, voice.active, ui.messages.isNotEmpty(), ui.current, onConversationAction = { action ->
                    when (action) {
                        "share" -> shareTranscript(context, ui.messages)
                        "link" -> ui.current?.let { if (!ui.streaming && !ui.busy) shareSession = it.id }
                        "home" -> ui.current?.let { session ->
                            val shortcutIntent = Intent(context, com.socrates.android.MainActivity::class.java)
                                .setAction(com.socrates.android.MainActivity.ACTION_OPEN_SESSION)
                                .putExtra(com.socrates.android.MainActivity.EXTRA_SESSION_ID, session.id)
                                .setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                            val shortcut = ShortcutInfoCompat.Builder(context, "session-${session.id}")
                                .setShortLabel(session.title.ifBlank { "Socrates 对话" }.take(25))
                                .setLongLabel(session.title.ifBlank { "打开 Socrates 对话" }.take(45))
                                .setIcon(IconCompat.createWithResource(context, com.socrates.android.R.drawable.ic_socrates))
                                .setIntent(shortcutIntent)
                                .build()
                            if (!ShortcutManagerCompat.requestPinShortcut(context, shortcut, null)) vm.error("设备暂不支持添加会话快捷方式。")
                        }
                        "find" -> find = true
                        "pin" -> ui.current?.let(vm::togglePinned)
                        "archive" -> ui.current?.let { if (com.socrates.android.data.SessionActions.isArchived(it)) vm.restoreSession(it) else vm.archiveSession(it) }
                        "project" -> if (!ui.streaming && !ui.busy) projectPicker = true
                        "files" -> uploadedFiles = true
                        "plugins" -> openResource("插件", "", "")
                        "models" -> if (ui.loggedIn) resource = "模型与服务商" else vm.showAuth(true)
                        "manage" -> ui.current?.let { sessionAction = it; sessionTitle = it.title; rename = true }
                        "delete" -> ui.current?.let { sessionAction = it; sessionTitle = it.title; rename = false }
                    }
                }, onMenu = { focus.clearFocus(); keyboard?.hide(); scope.launch { drawer.open() } }, onMode = { work = it; focus.clearFocus(); keyboard?.hide() }, onNew = { vm.newChat(); work = false })
                if (work) WorkSpace(onOpenChat = { work = false }, onAttach = { work = false; attach() }, onSettings = { settings = true }, onFeature = { title -> openResource(title, "", "") })
                else {
                    Transcript(ui, Modifier.weight(1f), jumpId, speech) { action, message ->
                        when (action) {
                            "edit" -> { editMessage = message; editText = message.content }
                            "regenerate" -> vm.regenerate(message)
                            "branch" -> vm.branch(message)
                            "up", "down", "none" -> vm.feedback(message, action)
                        }
                    }
                    Composer(ui, voice, onSend = vm::send, onStop = vm::stop, onAttach = ::attach, onRecord = ::record, onRemoveAttachment = vm::removeAttachment, onReasoning = { reasoningMenu = true })
                }
            }
            SocratesSnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().imePadding().padding(bottom = 90.dp, start = 12.dp, end = 12.dp))
        }
    }
    if (attachmentMenu) AttachmentSheet(onDismiss = { attachmentMenu = false }, onCamera = {
        attachmentMenu = false
        if (!ui.loggedIn) vm.showAuth(true) else try {
            val captures = java.io.File(context.cacheDir, "captures").apply { mkdirs() }
            captures.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86_400_000 }?.forEach { it.delete() }
            val image = java.io.File.createTempFile("camera-", ".jpg", captures)
            val uri = androidx.core.content.FileProvider.getUriForFile(context, context.packageName + ".files", image)
            capturedUri = uri.toString(); camera.launch(uri)
        } catch (e: Exception) { vm.error("无法打开相机，请选择照片或文件。") }
    }, onPhoto = {
        attachmentMenu = false
        if (ui.loggedIn) photoPicker.launch(arrayOf("image/*")) else vm.showAuth(true)
    }, onFileSources = {
        attachmentMenu = false
        if (ui.loggedIn) fileSourceMenu = true else vm.showAuth(true)
    }, onPlugins = { attachmentMenu = false; openResource("插件", "", "") }, onReasoning = { attachmentMenu = false; reasoningMenu = true }, reasoning = ui.reasoningEffort)
    if (fileSourceMenu) FileSourceSheet(onDismiss = { fileSourceMenu = false }, onDevice = {
        fileSourceMenu = false
        if (ui.loggedIn) filePicker.launch(arrayOf("*/*")) else vm.showAuth(true)
    }, onLibrary = { fileSourceMenu = false; openResource("资料库", "", "") })
    if (reasoningMenu) ReasoningPicker(ui.reasoningEffort, !ui.streaming && !ui.busy, onSelect = { vm.setReasoningEffort(it); reasoningMenu = false }, onDismiss = { reasoningMenu = false })
    if (projectPicker) ui.current?.let { session -> ConversationProjectPicker(session, ui.baseUrl, onAuthLost = { scope.launch { projectPicker = false; vm.logout(); vm.showAuth(true) } }, onDismiss = { projectPicker = false }, onMoved = { moved -> vm.selectSession(moved); projectPicker = false }, onError = vm::error) }
    if (uploadedFiles) ConversationFiles(ui.messages, onDismiss = { uploadedFiles = false }, onUseFile = { id, name, mime -> vm.useLibraryFile(id, name, mime); uploadedFiles = false })
    if (ui.showAuth) AuthFlowSheet(onDismiss = { vm.showAuth(false) }, baseUrl = ui.baseUrl)
    if (settings) ConnectionSheet(ui.baseUrl, ui.authBusy, ui.sheetError, { vm.configure(it) { settings = false } }, { settings = false })
    if (profile) SocratesSheet(onDismissRequest = { profile = false }, containerColor = Color.White) {
        Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(if (ui.loggedIn) ui.accountName else "Socrates", style = MaterialTheme.typography.headlineSmall)
            Text(ui.baseUrl, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
            if (ui.loggedIn) SocratesTextButton(onClick = { profile = false; account = true }) { ReferenceIcon(ReferenceGlyph.Person, null); Spacer(Modifier.width(12.dp)); Text("帐号资料与安全") }
            if (ui.loggedIn) SocratesTextButton(onClick = { profile = false; resource = "模型与服务商" }) { Text("模型与服务商") }
            if (ui.loggedIn) SocratesTextButton(onClick = { profile = false; resource = "记忆" }) { Text("记忆") }
            SocratesTextButton(onClick = { profile = false; settings = true }) { ReferenceIcon(ReferenceGlyph.Settings, null); Spacer(Modifier.width(12.dp)); Text("连接设置") }
            SocratesTextButton(onClick = { profile = false; if (ui.loggedIn) vm.logout() else vm.showAuth(true) }) { ReferenceIcon(if (ui.loggedIn) ReferenceGlyph.SignOut else ReferenceGlyph.Person, null); Spacer(Modifier.width(12.dp)); Text(if (ui.loggedIn) "退出登录" else "登录 Socrates") }
        }
    }
    if (account) AccountProfileSheet(onDismiss = { account = false })
    if (resource == "模型与服务商") ProviderSheet(onDismiss = { resource = null })
    if (resource == "教学与测验") androidx.compose.ui.window.Dialog(
        onDismissRequest = { resource = null; learningId = null; learningKind = null },
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(Modifier.fillMaxSize().background(SocratesDesign.Page)) {
            CompositionLocalProvider(LocalContentColor provides SocratesDesign.Ink) { when {
                learningId != null -> LearningSessionScreen(learningId!!, onTutorChat = { id -> resource = null; learningId = null; vm.selectSession(com.socrates.android.data.ChatSession(id = id)); work = false }, onClose = { resource = null; learningId = null; learningKind = null }, onAuthLost = { vm.refresh() })
                learningKind != null -> LearningSetupScreen(learningKind!!, onCreated = { id -> learningId = id; vm.refresh() }, onClose = { learningKind = null }, onAuthLost = { vm.refresh() })
                else -> Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text("教学与测验", style = MaterialTheme.typography.headlineMedium)
                    SocratesButton(onClick = { learningKind = "tutor" }) { Text("创建导师诊断") }
                    SocratesButton(onClick = { learningKind = "exam" }) { Text("创建测验") }
                    SocratesTextButton(onClick = { resource = null }) { Text("返回") }
                }
            } }
        }
    }
    resource?.takeUnless { it in setOf("模型与服务商", "教学与测验") }?.let { title -> FeatureSheet(title, onDismiss = { resource = null }, onAuthLost = { vm.refresh() },
        onOpenSession = { id -> resource = null; work = false; val session = ui.sessions.firstOrNull { it.id == id }; if (session?.kind == "exam" || session?.mode == "tutor") { learningId = id; resource = "教学与测验" } else vm.selectSession(com.socrates.android.data.ChatSession(id = id)) },
        onUseFile = { id, name, mime -> resource = null; work = false; vm.useLibraryFile(id, name, mime) },
        onUseProject = { id, title -> resource = null; work = false; vm.startBoundChat(id, title) },
        onUseAssistant = { id, title -> resource = null; work = false; vm.startBoundChat(id, title, assistant = true) }, onStartChat = { prompt ->
        resource = null; work = false; vm.newChat(); vm.send(prompt)
    }) }
    shareSession?.let { id -> SessionShareSheet(id) { shareSession = null } }
    if (find) SocratesSheet(onDismissRequest = { find = false }) {
        Column(Modifier.fillMaxWidth().imePadding().padding(20.dp)) {
            SocratesField(findQuery, { findQuery = it }, label = { Text("搜索当前会话") }, modifier = Modifier.fillMaxWidth())
            val matches = ui.messages.filter { findQuery.isNotBlank() && it.content.contains(findQuery, true) }
            Text(if (findQuery.isBlank()) "输入关键词" else "找到 ${matches.size} 条消息")
            LazyColumn(Modifier.heightIn(max = 400.dp)) {
                items(matches, key = { it.id }) { message ->
                    SocratesTextButton(onClick = { jumpId = message.id; find = false }) { Text(message.content, maxLines = 3, overflow = TextOverflow.Ellipsis) }
                }
            }
        }
    }
    editMessage?.let { message ->
        SocratesAlert(onDismissRequest = { editMessage = null }, title = { Text("编辑并重新发送") },
            text = { Column { Text("此操作会删除本消息之后的对话，再生成新回复。"); SocratesField(editText, { editText = it }, modifier = Modifier.heightIn(max = 300.dp)) } },
            confirmButton = { SocratesTextButton(onClick = { vm.editAndReplay(message, editText); editMessage = null }, enabled = editText.isNotBlank() && !ui.streaming && !ui.busy) { Text("确认重发") } },
            dismissButton = { SocratesTextButton(onClick = { editMessage = null }) { Text("取消") } })
    }
    sessionAction?.let { session ->
        if (rename) SocratesAlert(onDismissRequest = { sessionAction = null }, title = { Text("重命名会话") },
            text = { SocratesField(sessionTitle, { sessionTitle = it }, label = { Text("会话名称") }, singleLine = true) },
            confirmButton = { SocratesTextButton(onClick = { vm.renameSession(session, sessionTitle); sessionAction = null }, enabled = sessionTitle.isNotBlank()) { Text("保存") } },
            dismissButton = { SocratesTextButton(onClick = { sessionAction = null }) { Text("取消") } })
        else SocratesAlert(onDismissRequest = { sessionAction = null }, title = { Text(session.title.ifBlank { "会话管理" }) },
            text = { Column { SocratesTextButton(onClick = { rename = true }) { Text("重命名") }; Text("删除将永久移除此会话及其关联数据，无法撤销。") } },
            confirmButton = { SocratesTextButton(onClick = { vm.deleteSession(session); sessionAction = null }, enabled = !ui.streaming) { Text("永久删除", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { SocratesTextButton(onClick = { sessionAction = null }) { Text("取消") } })
    }
}

@Composable
private fun ChatHeader(work: Boolean, recording: Boolean, hasMessages: Boolean, session: com.socrates.android.data.ChatSession?, onConversationAction: (String) -> Unit, onMenu: () -> Unit, onMode: (Boolean) -> Unit, onNew: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().height(SocratesDesign.HeaderHeight).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        CircleAction("打开侧边栏", onMenu) { ReferenceIcon(ReferenceGlyph.Menu) }
        if (!hasMessages || work) BoxWithConstraints(Modifier.widthIn(max = 170.dp).width(170.dp).height(44.dp).clip(CircleShape).background(Color(0xFFE8E8E8)).padding(4.dp)) {
            val x by animateDpAsState(if (work) maxWidth / 2 else 0.dp, spring(stiffness = Spring.StiffnessMediumLow), label = "tab")
            Box(Modifier.offset { androidx.compose.ui.unit.IntOffset(x.roundToPx(), 0) }.width(maxWidth / 2).fillMaxHeight().background(Color.White, CircleShape))
            Row(Modifier.fillMaxSize()) {
                listOf("聊天", "工作").forEachIndexed { index, label ->
                    Box(Modifier.weight(1f).fillMaxHeight().clip(CircleShape).selectable(selected = work == (index == 1), role = androidx.compose.ui.semantics.Role.Tab, onClick = { onMode(index == 1) }), contentAlignment = Alignment.Center) { Text(label, fontSize = 14.sp, color = Ink) }
                }
            }
        } else Spacer(Modifier.weight(1f))
        Row(Modifier.clip(CircleShape).background(Color.White), verticalAlignment = Alignment.CenterVertically) {
            SocratesIconButton(onClick = if (hasMessages) onNew else { { onConversationAction("models") } }, enabled = !recording) {
                ReferenceIcon(if (hasMessages) ReferenceGlyph.Compose else ReferenceGlyph.Reasoning, if (hasMessages) "新建对话" else "模型设置", tint = if (recording) Color.LightGray else Ink)
            }
            if (hasMessages && !work) Box {
                SocratesIconButton(onClick = { menu = true }) { ReferenceIcon(ReferenceGlyph.More, "对话菜单") }
                SocratesMenu(menu, { menu = false }, modifier = Modifier.width(206.dp)) {
                    session?.title?.takeIf { it.isNotBlank() }?.let { Text(it, Modifier.padding(horizontal = 24.dp, vertical = 8.dp), color = Color.Gray, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    fun action(key: String) { menu = false; onConversationAction(key) }
                    SocratesMenuItem({ Text("分享会话链接") }, { action("link") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Share) })
                    if (session != null) {
                        SocratesMenuItem({ Text(if (com.socrates.android.data.SessionActions.isPinned(session)) "取消置顶" else "置顶") }, { action("pin") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Pin) })
                        SocratesMenuItem({ Text("添加到项目") }, { action("project") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Folder) })
                    }
                    SocratesMenuItem({ Text("插件") }, { action("plugins") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Plugin) })
                    SocratesMenuItem({ Text("已上传文件") }, { action("files") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Paperclip) })
                    SocratesMenuItem({ Text("在聊天中查找") }, { action("find") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Search) })
                    SocratesMenuItem({ Text("分享聊天文本") }, { action("share") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Share) })
                    if (session != null) {
                        SocratesMenuItem({ Text("添加到主屏幕") }, { action("home") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Plus) })
                        SocratesMenuItem({ Text("重命名") }, { action("manage") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Compose) })
                        SocratesMenuItem({ Text(if (com.socrates.android.data.SessionActions.isArchived(session)) "取消归档" else "归档") }, { action("archive") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Archive) })
                        SocratesMenuItem({ Text("删除", color = Color(0xFFB3261E)) }, { action("delete") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Trash, tint = Color(0xFFB3261E)) })
                    }
                }
            }
        }
    }
}

@Composable
private fun CircleAction(description: String, onClick: () -> Unit, modifier: Modifier = Modifier, blue: Boolean = false, enabled: Boolean = true, content: @Composable () -> Unit) {
    Box(modifier.size(44.dp).clip(CircleShape).clickable(enabled = enabled, onClick = onClick).semantics { contentDescription = description }, contentAlignment = Alignment.Center) {
        Box(Modifier.size(if (blue) 32.dp else 44.dp).background(if (blue) Blue else Color.White, CircleShape), contentAlignment = Alignment.Center) { content() }
    }
}

@Composable
private fun Transcript(ui: ChatUiState, modifier: Modifier = Modifier, jumpId: String? = null, speech: SpeechPlayback, onMessageAction: (String, ChatMessage) -> Unit = { _, _ -> }) {
    val list = rememberLazyListState()
    val tolerance = with(LocalDensity.current) { 64.dp.toPx() }
    val nearBottom by remember { derivedStateOf {
        val last = list.layoutInfo.visibleItemsInfo.lastOrNull()
        !list.canScrollForward || (last != null && last.index == list.layoutInfo.totalItemsCount - 1 &&
            last.offset + last.size - list.layoutInfo.viewportEndOffset < tolerance)
    } }
    val scope = rememberCoroutineScope()
    LaunchedEffect(jumpId) { ui.messages.indexOfFirst { it.id == jumpId }.takeIf { it >= 0 }?.let { list.animateScrollToItem(it) } }
    LaunchedEffect(ui.messages.size, ui.messages.lastOrNull()?.content?.length) {
        if (ui.messages.isNotEmpty() && (nearBottom || ui.messages.last().role == "user")) {
            withFrameNanos { }
            list.scrollToItem(ui.messages.lastIndex, Int.MAX_VALUE)
        }
    }
    Box(modifier.fillMaxWidth()) {
        LazyColumn(state = list, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 22.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
            items(ui.messages, key = { it.id }, contentType = { it.role }) { message ->
                MessageBubble(message, ui.streaming && message.id == ui.messages.lastOrNull()?.id, ui.activity, !ui.streaming && !ui.busy, speech, ui.feedbackRatings["${ui.current?.id}:${message.id}"] ?: message.wire?.optString("feedback")?.takeIf { it in setOf("up", "down") } ?: "none", onMessageAction)
            }
        }
        if (ui.busy) SocratesSpinner(Modifier.align(Alignment.TopCenter).padding(12.dp).size(20.dp), strokeWidth = 2.dp)
        AnimatedVisibility(!nearBottom && ui.messages.isNotEmpty(), Modifier.align(Alignment.BottomCenter), enter = fadeIn() + slideInVertically { it / 2 }, exit = fadeOut()) {
            CircleAction("滚动到底部", { scope.launch { list.animateScrollToItem(ui.messages.lastIndex, Int.MAX_VALUE) } }, Modifier.border(1.dp, Color(0xFFE9E9E9), CircleShape)) { ReferenceIcon(ReferenceGlyph.ArrowDown, null, Modifier.size(20.dp)) }
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage, streaming: Boolean, activity: String, actionsEnabled: Boolean = true, speech: SpeechPlayback, feedback: String, onAction: (String, ChatMessage) -> Unit = { _, _ -> }) {
    val user = message.role == "user"
    val clipboard = LocalClipboardManager.current
    val publicSummary = message.wire?.optString("publicReasoningSummary").orEmpty().takeIf { it.isNotBlank() && it != "null" }
    val turnSegments = remember(message.content, message.wire?.toString()) { AssistantTurnLayout.build(message.content, message.wire) }
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (user) Alignment.End else Alignment.Start) {
        message.imageDataUrl?.let { MessageImage(it, message.attachmentName ?: "图片"); Spacer(Modifier.height(10.dp)) }
        if (user) {
            Column(Modifier.widthIn(max = 300.dp).background(Color(0xFFF0F1FB), RoundedCornerShape(24.dp)).padding(horizontal = 18.dp, vertical = 12.dp)) {
                message.attachmentName?.let { Text("附件 · $it", fontSize = 12.sp, color = Color.Gray); Spacer(Modifier.height(6.dp)) }
                SelectionContainer { Text(message.content.substringBefore("\n\n<资料"), fontSize = 16.sp, lineHeight = 24.sp) }
            }
        } else {
            val privateThinkingExists = message.reasoning.isNotBlank()
            if (streaming || privateThinkingExists || publicSummary != null) {
                val seconds = ((message.wire?.optLong("reasoningDurationMs") ?: 0L) / 1000L).coerceAtLeast(0)
                Row(Modifier.padding(bottom = if (publicSummary == null) 6.dp else 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (streaming) SocratesSpinner(Modifier.size(13.dp), strokeWidth = 1.5.dp, color = Color.Gray)
                    else ReferenceIcon(ReferenceGlyph.Reasoning, null, Modifier.size(15.dp), tint = Color.Gray)
                    Spacer(Modifier.width(8.dp))
                    Text(if (streaming) "思考中" else "思考了 ${seconds}秒", color = Color.Gray, fontSize = 13.sp)
                }
                publicSummary?.let { Text("公开思考摘要", Modifier.padding(bottom = 2.dp), style = MaterialTheme.typography.labelSmall, color = SocratesDesign.Muted); NativeMarkdown(it, Modifier.fillMaxWidth()) }
            }
            turnSegments.forEach { segment ->
                when (segment) {
                    is AssistantTurnSegment.Text -> if (segment.value.isNotBlank()) NativeMarkdown(segment.value, Modifier.fillMaxWidth())
                    is AssistantTurnSegment.Tool -> ToolActivityCard(segment.call)
                }
            }
            if (streaming && (message.content.isBlank() || activity.isNotBlank())) Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                SocratesSpinner(Modifier.size(12.dp), strokeWidth = 1.5.dp, color = Color.Gray)
                Spacer(Modifier.width(8.dp)); Text(activity.ifBlank { "正在回复" }, color = Color.Gray, fontSize = 12.sp, maxLines = 2)
            }
            if (!streaming && message.content.isNotBlank()) {
                val context = LocalContext.current
                var menu by remember { mutableStateOf(false) }
                Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    SocratesIconButton(onClick = { clipboard.setText(AnnotatedString(message.content)) }, modifier = Modifier.size(36.dp, 44.dp)) { ReferenceIcon(ReferenceGlyph.Copy, "复制回复", Modifier.size(19.dp), Color(0xFF929292)) }
                    listOf("up" to ReferenceGlyph.ThumbUp, "down" to ReferenceGlyph.ThumbDown).forEach { (value, glyph) ->
                        SocratesIconButton(onClick = { val next = if (feedback == value) "none" else value; onAction(next, message) }, enabled = actionsEnabled, modifier = Modifier.size(36.dp, 44.dp)) { ReferenceIcon(glyph, if (value == "up") "有帮助" else "没有帮助", Modifier.size(19.dp), if (feedback == value) Ink else Color(0xFF929292)) }
                    }
                    SocratesIconButton(onClick = { speech.toggle(message.id, message.content) }, modifier = Modifier.size(36.dp, 44.dp)) { ReferenceIcon(ReferenceGlyph.Speaker, if (speech.playingId == message.id) "停止朗读" else "朗读回复", Modifier.size(19.dp), if (speech.playingId == message.id) Blue else Color(0xFF929292)) }
                    SocratesIconButton(onClick = { shareTranscript(context, listOf(message)) }, modifier = Modifier.size(36.dp, 44.dp)) { ReferenceIcon(ReferenceGlyph.Share, "分享回复文本", Modifier.size(19.dp), Color(0xFF929292)) }
                    Box {
                        SocratesIconButton(onClick = { menu = true }, modifier = Modifier.size(36.dp, 44.dp)) { ReferenceIcon(ReferenceGlyph.More, "消息操作", Modifier.size(19.dp), Color(0xFF929292)) }
                        SocratesMenu(menu, { menu = false }) {
                            SocratesMenuItem({ Text("重新生成（移除后续消息）") }, { menu = false; onAction("regenerate", message) }, enabled = actionsEnabled)
                            SocratesMenuItem({ Text("从此处创建分支") }, { menu = false; onAction("branch", message) }, enabled = actionsEnabled)
                            SocratesMenuItem({ Text("清除反馈") }, { menu = false; onAction("none", message) }, enabled = actionsEnabled)
                        }
                    }
                }
            }
        }
        MessageDetails(message.wire)
        if (user && actionsEnabled && message.content.isNotBlank()) {
            var userMenu by remember { mutableStateOf(false) }
            Box(Modifier.align(Alignment.End)) {
                SocratesIconButton(onClick = { userMenu = true }, modifier = Modifier.size(36.dp)) { ReferenceIcon(ReferenceGlyph.More, "用户消息操作", Modifier.size(17.dp), Color(0xFF929292)) }
                SocratesMenu(userMenu, { userMenu = false }) {
                    SocratesMenuItem({ Text("编辑并重发") }, { userMenu = false; onAction("edit", message) })
                    SocratesMenuItem({ Text("从此处创建分支") }, { userMenu = false; onAction("branch", message) })
                }
            }
        }
    }
}

@Composable
private fun Composer(ui: ChatUiState, voice: VoiceInput, onSend: (String) -> Boolean, onStop: () -> Unit, onAttach: () -> Unit, onRecord: () -> Unit, onRemoveAttachment: () -> Unit, onReasoning: () -> Unit) {
    var draft by rememberSaveable(ui.current?.id) { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    val keyboardOpen = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val expanded = focused || keyboardOpen || draft.contains('\n') || ui.attachment != null
    val horizontal by animateDpAsState(if (expanded || voice.active) 12.dp else 34.dp, tween(180), label = "composerInset")
    Column(Modifier.fillMaxWidth().padding(horizontal = horizontal).padding(top = 8.dp, bottom = 14.dp)) {
        AnimatedVisibility(ui.attachment != null) {
            ui.attachment?.let { a -> SocratesInputChip(selected = false, onClick = {}, label = { Text(a.name, maxLines = 1, overflow = TextOverflow.Ellipsis) }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Paperclip, null, Modifier.size(16.dp)) }, trailingIcon = { SocratesIconButton(onClick = onRemoveAttachment, Modifier.size(32.dp)) { ReferenceIcon(ReferenceGlyph.Close, "移除附件", Modifier.size(16.dp)) } }) }
        }
        val recording = voice.active
        val focusRequester = remember { FocusRequester() }
        val corner by animateDpAsState(if (expanded) 24.dp else 32.dp, tween(180), label = "composerCorner")
        // Keep the same editor composed AND placed during recording. Removing it would close the IME.
        // It reports zero height and is hidden from paint/accessibility; the real voice row takes its place.
        val hiddenEditor = if (recording) Modifier.alpha(0f).clearAndSetSemantics { } else Modifier
        Column(Modifier.fillMaxWidth().then(hiddenEditor).layout { measurable, constraints ->
            val editor = measurable.measure(constraints)
            layout(editor.width, if (recording) 0 else editor.height) { editor.placeRelative(0, 0) }
        }.clip(RoundedCornerShape(corner)).background(Color.White)
            .animateContentSize(spring(stiffness = Spring.StiffnessMediumLow))
            .padding(horizontal = 8.dp, vertical = 2.dp)) {
            Row(Modifier.fillMaxWidth().heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically) {
                AnimatedVisibility(!expanded) {
                    SocratesIconButton(onClick = onAttach, enabled = !recording && !ui.busy && !ui.streaming, modifier = Modifier.size(44.dp)) { ReferenceIcon(ReferenceGlyph.Plus, "添加附件", Modifier.size(26.dp), tint = Ink) }
                }
                DraftField(draft, { if (!recording) draft = it }, { focused = it }, if (ui.messages.isEmpty()) "询问 Socrates" else "回复 Socrates",
                    Modifier.weight(1f).focusRequester(focusRequester)
                        .padding(horizontal = if (expanded) 8.dp else 4.dp, vertical = 8.dp)
                        .heightIn(min = 24.dp, max = 150.dp))
                if (!expanded) ComposerActions(draft, ui, onRecord, onStop) { if (onSend(draft)) draft = "" }
            }
            AnimatedVisibility(expanded) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    SocratesIconButton(onClick = onAttach, enabled = !recording && !ui.busy && !ui.streaming) { ReferenceIcon(ReferenceGlyph.Plus, "添加附件", Modifier.size(27.dp), tint = Ink) }
                    Spacer(Modifier.weight(1f))
                    SocratesIconButton(onClick = onReasoning, enabled = !recording && !ui.busy && !ui.streaming) { ReferenceIcon(ReferenceGlyph.Reasoning, "推理强度", Modifier.size(23.dp), if (ui.reasoningEffort == "medium") Color(0xFF999999) else Blue) }
                    ComposerActions(draft, ui, onRecord, onStop) { if (onSend(draft)) draft = "" }
                }
            }
        }
        if (recording) VoiceComposer(voice) { phrase ->
            val accepted = onSend(phrase)
            if (!accepted) draft = phrase
            accepted
        }
    }
}

@Composable
private fun DraftField(text: String, onValue: (String) -> Unit, onFocus: (Boolean) -> Unit, placeholder: String, modifier: Modifier) {
    BasicTextField(value = text, onValueChange = onValue, textStyle = TextStyle(fontSize = 17.sp, lineHeight = 24.sp, color = Ink), cursorBrush = androidx.compose.ui.graphics.SolidColor(Blue), modifier = modifier.onFocusChanged { onFocus(it.isFocused) }.semantics { contentDescription = "消息输入框" }, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences), maxLines = 6, decorationBox = { inner -> Box { if (text.isEmpty()) Text(placeholder, fontSize = 17.sp, color = Color(0xFF999999)); inner() } })
}

@Composable
private fun ComposerActions(draft: String, ui: ChatUiState, onRecord: () -> Unit, onStop: () -> Unit, onSend: () -> Unit) {
    if (!ui.streaming && draft.isBlank() && ui.attachment == null) SocratesIconButton(onClick = onRecord, enabled = !ui.busy, modifier = Modifier.size(44.dp)) { ReferenceIcon(ReferenceGlyph.Mic, "语音输入", Modifier.size(25.dp), tint = Ink) }
    val sendable = draft.isNotBlank() || ui.attachment != null
    CircleAction(if (ui.streaming) "停止回复" else if (sendable) "发送消息" else "开始语音输入", if (ui.streaming) onStop else if (sendable) onSend else onRecord, Modifier.size(44.dp), blue = true, enabled = !ui.busy) {
        when { ui.busy -> SocratesSpinner(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp); ui.streaming -> Box(Modifier.size(13.dp).background(Color.White, RoundedCornerShape(3.dp))); sendable -> ReferenceIcon(ReferenceGlyph.ArrowUp, null, Modifier.size(23.dp), tint = Color.White); else -> VoiceMark() }
    }
}

@Composable
private fun VoiceMark() {
    Canvas(Modifier.size(21.dp)) {
        listOf(.30f, .64f, .95f, .45f, .72f).forEachIndexed { index, height -> val x = size.width * (index + .5f) / 5; drawLine(Color.White, androidx.compose.ui.geometry.Offset(x, size.height * (1 - height) / 2), androidx.compose.ui.geometry.Offset(x, size.height * (1 + height) / 2), 1.8.dp.toPx(), StrokeCap.Round) }
    }
}

@Composable
private fun VoiceComposer(voice: VoiceInput, onSend: (String) -> Boolean) {
    val bars = remember { mutableStateListOf<Float>().apply { repeat(36) { add(0f) } } }
    LaunchedEffect(voice.active) { while (voice.active) { bars.removeAt(0); bars.add(if (voice.listening) voice.amplitude else 0f); delay(75) } }
    Column {
        if (voice.transcript.isNotBlank()) Text(voice.transcript, Modifier.padding(12.dp).heightIn(max = 100.dp).verticalScroll(rememberScrollState()), color = Color.Gray, fontSize = 14.sp)
        Row(Modifier.fillMaxWidth().height(48.dp).clip(CircleShape).background(Color.White).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            SocratesIconButton(onClick = voice::cancel) { ReferenceIcon(ReferenceGlyph.Close, "取消语音", Modifier.size(24.dp)) }
            Canvas(Modifier.weight(1f).height(28.dp).semantics { contentDescription = if (voice.listening) "录音音量波形" else "语音识别已停止" }) {
                bars.forEachIndexed { index, value -> val x = size.width * (index + .5f) / bars.size; val height = (3.dp.toPx() + value * (size.height - 3.dp.toPx())); drawLine(if (index < 18) Color(0xFFCCCCCC) else Color(0xFF888888), androidx.compose.ui.geometry.Offset(x, (size.height - height) / 2), androidx.compose.ui.geometry.Offset(x, (size.height + height) / 2), 2.5.dp.toPx(), StrokeCap.Round) }
            }
            SocratesIconButton(onClick = voice::stop, enabled = voice.listening) { Box(Modifier.size(15.dp).background(Ink, RoundedCornerShape(4.dp)).semantics { contentDescription = "停止录音" }) }
            CircleAction("发送语音识别结果", { voice.send { onSend(it) } }, Modifier.size(36.dp), blue = true) { ReferenceIcon(ReferenceGlyph.ArrowUp, null, Modifier.size(24.dp), tint = Color.White) }
        }
    }
}

@Composable
private fun NativeSidebar(ui: ChatUiState, onNew: () -> Unit, onSelect: (com.socrates.android.data.ChatSession) -> Unit, onProfile: () -> Unit, onRefresh: () -> Unit, onSessionMenu: (com.socrates.android.data.ChatSession) -> Unit, onRestore: (com.socrates.android.data.ChatSession) -> Unit, onImages: () -> Unit, onLibrary: () -> Unit, onProjects: () -> Unit, onAssistants: () -> Unit, onTasks: () -> Unit, onPlugins: () -> Unit, onCodex: () -> Unit) {
    var search by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var archived by rememberSaveable { mutableStateOf(false) }
    val visibleSessions = ui.sessions.filter { com.socrates.android.data.SessionActions.isArchived(it) == archived && (query.isBlank() || it.title.contains(query, true) || it.topic.contains(query, true)) }.sortedByDescending { com.socrates.android.data.SessionActions.isPinned(it) }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 30.dp)) {
        Row(Modifier.fillMaxWidth().height(78.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Socrates", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-.5).sp)
            SocratesIconButton(onClick = { search = !search; if (!search) query = "" }) { ReferenceIcon(ReferenceGlyph.Search, "搜索会话", Modifier.size(25.dp)) }
        }
        AnimatedVisibility(search) { SocratesField(query, { query = it }, Modifier.fillMaxWidth().padding(bottom = 12.dp), placeholder = { Text("搜索历史会话") }, singleLine = true, shape = CircleShape) }
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(bottom = 16.dp)) {
            if (!search) {
                item { SidebarAction(ReferenceGlyph.Image, "图像", onImages) }
                item { SidebarAction(ReferenceGlyph.Archive, "资料库", onLibrary) }
                item { SidebarAction(ReferenceGlyph.Folder, "项目", onProjects) }
                item { SidebarAction(ReferenceGlyph.Compose, "Codex", onCodex) }
                item { SidebarAction(ReferenceGlyph.Clock, "定时任务", onTasks) }
                item { SidebarAction(ReferenceGlyph.Plugin, "插件", onPlugins) }
                item { SocratesDivider(Modifier.padding(top = 24.dp, bottom = 24.dp), color = Color(0xFFE8E8E8)) }
            }
            if (ui.loggedIn) item { SocratesTextButton(onClick = { archived = !archived }) { Text(if (archived) "返回最近对话" else "查看归档", fontSize = 13.sp, color = Color.Gray) } }
            if (ui.loggedIn && visibleSessions.isEmpty()) item {
                Column(Modifier.padding(vertical = 16.dp)) {
                    Text(if (ui.busy) "正在同步会话…" else if (query.isNotBlank()) "没有匹配的对话" else if (archived) "没有已归档的对话" else "还没有对话", fontSize = 14.sp, color = Color.Gray)
                    SocratesTextButton(onClick = onRefresh) { Text("刷新") }
                }
            }
            items(visibleSessions, key = { it.id }) { session ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).combinedClickable(onClick = { onSelect(session) }, onLongClickLabel = "管理会话", onLongClick = { onSessionMenu(session) }).padding(vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(session.title.ifBlank { session.topic.ifBlank { "新对话" } }, Modifier.weight(1f), fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (com.socrates.android.data.SessionActions.isPinned(session)) ReferenceIcon(ReferenceGlyph.Pin, "已置顶", Modifier.size(14.dp), Color.Gray)
                    if (archived) SocratesTextButton(onClick = { onRestore(session) }) { Text("恢复", fontSize = 13.sp) }
                    if (ui.current?.id == session.id) Box(Modifier.padding(start = 8.dp).size(9.dp).background(Blue, CircleShape))
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(vertical = 18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            SocratesButton(onClick = onNew, shape = CircleShape, containerColor = Blue, contentColor = Color.White, contentPadding = PaddingValues(horizontal = 22.dp, vertical = 14.dp)) { ReferenceIcon(ReferenceGlyph.Compose, null, Modifier.size(22.dp)); Spacer(Modifier.width(10.dp)); Text("聊天", fontSize = 17.sp) }
            CircleAction("帐号与设置", onProfile) { Box(Modifier.size(32.dp).background(Color(0xFF21B99F), CircleShape), contentAlignment = Alignment.Center) { Text(if (ui.loggedIn) ui.accountName.take(2).uppercase() else "S", color = Color.White, fontSize = 14.sp) } }
        }
    }
}

@Composable
private fun SidebarAction(icon: ReferenceGlyph, title: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick), verticalAlignment = Alignment.CenterVertically) {
        ReferenceIcon(icon, null, Modifier.size(23.dp), tint = Ink); Spacer(Modifier.width(14.dp)); Text(title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Ink)
    }
}
