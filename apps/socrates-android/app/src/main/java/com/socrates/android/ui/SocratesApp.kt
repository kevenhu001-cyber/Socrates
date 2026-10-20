@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.socrates.android.ui

import android.app.Activity
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
import androidx.compose.ui.semantics.heading
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
import com.socrates.android.data.SessionHistory
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val Ink = SocratesDesign.Ink

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SocratesApp(vm: ChatViewModel = viewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    var composerDraft by rememberSaveable(ui.composerDraft.key) { mutableStateOf(ui.composerDraft.initialText) }
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
    var voiceSettings by remember(ui.loggedIn, ui.baseUrl, ui.accountName) { mutableStateOf(false) }
    val voicePreferences by vm.voicePreferences.state.collectAsStateWithLifecycle()
    DisposableEffect(vm, voiceSettings) {
        val wasOpen = voiceSettings
        onDispose { if (wasOpen) vm.voicePreferences.dismiss() }
    }
    var learningKind by remember { mutableStateOf<String?>(null) }
    var learningId by remember { mutableStateOf<String?>(null) }
    var shareSession by remember { mutableStateOf<String?>(null) }
    val exportState by vm.transcriptExport.state.collectAsStateWithLifecycle()
    var exportPickerTicket by rememberSaveable { mutableStateOf<String?>(null) }
    val exportPicker = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val ticket = exportPickerTicket
        exportPickerTicket = null
        val uri = result.data?.data?.takeIf { result.resultCode == Activity.RESULT_OK && it.scheme == "content" }
        vm.transcriptExport.picked(ticket, if (uri == null) null else { bytes ->
            com.socrates.android.data.TranscriptExport.write(bytes) { context.contentResolver.openOutputStream(uri, "wt") }
        })
    }
    DisposableEffect(vm, ui.composerDraft.key) {
        onDispose { vm.transcriptExport.clear() }
    }
    var find by remember { mutableStateOf(false) }
    var findQuery by remember { mutableStateOf("") }
    var jumpId by remember(ui.current?.id) { mutableStateOf(ui.searchJump) }
    var globalSearch by remember { mutableStateOf(false) }
    var searchOpenError by remember { mutableStateOf<String?>(null) }
    var pendingSearchHit by remember { mutableStateOf<com.socrates.android.data.SearchHit?>(null) }
    val searchState by vm.globalSearch.state.collectAsStateWithLifecycle()
    LaunchedEffect(ui.searchJump) { ui.searchJump?.let { jumpId = it } }
    DisposableEffect(vm, globalSearch) {
        val wasOpen = globalSearch
        onDispose { if (wasOpen) { vm.cancelSearchOpening(); vm.globalSearch.clear() } }
    }
    var editMessage by remember { mutableStateOf<ChatMessage?>(null) }
    var editText by remember { mutableStateOf("") }
    var sessionAction by remember { mutableStateOf<com.socrates.android.data.ChatSession?>(null) }
    var tagSession by remember(ui.loggedIn, ui.baseUrl, ui.accountName) { mutableStateOf<com.socrates.android.data.ChatSession?>(null) }
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
    fun beginRecording() {
        val current = vm.state.value
        val preference = vm.voicePreferences.state.value
        if (current.streaming || current.busy) return
        if (current.loggedIn && !preference.canRecord) {
            vm.error("请在语音输入偏好中重新读取并确认账号语言后再录音。")
            voiceSettings = true
            return
        }
        voice.start(if (current.loggedIn) preference.confirmed!! else com.socrates.android.data.VoiceLanguage.AUTO)
    }
    val audioPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) beginRecording() else vm.error("麦克风权限未开启，可以继续使用文字输入。") }
    var filePickerTicket by rememberSaveable { mutableStateOf<String?>(null) }
    var photoPickerTicket by rememberSaveable { mutableStateOf<String?>(null) }
    var cameraTicket by rememberSaveable { mutableStateOf<String?>(null) }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        val ticket = filePickerTicket; filePickerTicket = null
        if (ticket != null) vm.attachPicked(uris, ticket)
    }
    var attachmentMenu by remember { mutableStateOf(false) }
    var fileSourceMenu by remember { mutableStateOf(false) }
    var capturedUri by rememberSaveable { mutableStateOf<String?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val ticket = cameraTicket; cameraTicket = null
        if (ticket != null) vm.attachPicked(if (saved) capturedUri?.let { listOf(android.net.Uri.parse(it)) }.orEmpty() else emptyList(), ticket)
        capturedUri = null
    }
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        val ticket = photoPickerTicket; photoPickerTicket = null
        if (ticket != null) vm.attachPicked(uris, ticket)
    }
    fun attachmentPickerReady(): Boolean {
        val current = vm.state.value
        if (!current.loggedIn) { vm.showAuth(true); return false }
        if (current.busy || current.streaming) { vm.error("请先等待当前操作完成，再添加附件。"); return false }
        if (current.attachments.size >= AttachmentDraft.MAX_COUNT) { vm.error("每条消息最多添加 ${AttachmentDraft.MAX_COUNT} 个附件。"); return false }
        return true
    }
    fun attach() { if (attachmentPickerReady()) attachmentMenu = true }
    fun record() {
        if (ui.streaming || ui.busy) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) beginRecording() else audioPermission.launch(Manifest.permission.RECORD_AUDIO)
    }
    fun openResource(title: String, path: String, key: String) {
        scope.launch { drawer.close() }
        if (!ui.loggedIn) { vm.showAuth(true); return }
        resource = title
    }
    fun openGlobalResult(hit: com.socrates.android.data.SearchHit) {
        searchOpenError = null
        vm.openSearchHit(hit, onOpened = { session, unlocated ->
            globalSearch = false; vm.globalSearch.clear(); work = false
            if (session.kind == "exam" || session.mode == "tutor") { learningId = session.id; learningKind = null; resource = "教学与测验" }
            if (unlocated) vm.error(if (session.kind == "exam" || session.mode == "tutor") "已打开学习会话；该视图暂不支持消息定位。" else "已打开会话，但匹配消息已变化或不存在。")
        }, onFailure = { searchOpenError = it })
    }
    LaunchedEffect(ui.loggedIn, ui.baseUrl) { if (!ui.loggedIn) { globalSearch = false; pendingSearchHit = null; searchOpenError = null; jumpId = null; projectPicker = false; uploadedFiles = false; reasoningMenu = false; resource = null; account = false; shareSession = null; learningId = null; learningKind = null } }
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
                    onPlugins = { openResource("插件", "/plugins", "plugins") }, onCodex = { openResource("Codex", "/projects", "projects") },
                    onGlobalSearch = { if (!ui.loggedIn) vm.showAuth(true) else { globalSearch = true; searchOpenError = null; scope.launch { drawer.close() } } })
            }
        }
    ) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFFF8F8F8), Color(0xFFFDFDFD), Color(0xFFFDFDFD), Color(0xFFF7F7F7))))) {
            // AppSafeInsets adds the bottom gesture zone to safeDrawing; consume once at the viewport.
            Column(Modifier.fillMaxSize().windowInsetsPadding(AppSafeInsets)) {
                ChatHeader(work, voice.active, ui.messages.isNotEmpty(), ui.current, onConversationAction = { action ->
                    when (action) {
                        "share" -> shareTranscript(context, ui.messages)
                        "export" -> vm.openTranscriptExport()
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
                    Composer(ui, voice, composerDraft, onDraftChange = { composerDraft = it }, onSend = vm::send, onStop = vm::stop, onAttach = ::attach, onRecord = ::record, onRemoveAttachment = vm::removeAttachment,
                        onMoveAttachment = { key, step -> vm.moveAttachment(ui.composerDraft.key, key, step) },
                        onEditAttachment = { key, original, text -> vm.editAttachmentText(ui.composerDraft.key, key, original, text) },
                        onReasoning = { reasoningMenu = true })
                }
            }
            SocratesSnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).windowInsetsPadding(AppSafeInsets.only(WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom)).padding(bottom = 90.dp, start = 12.dp, end = 12.dp))
        }
    }
    if (attachmentMenu) AttachmentSheet(onDismiss = { attachmentMenu = false }, onCamera = {
        attachmentMenu = false
        if (attachmentPickerReady()) try {
            val captures = java.io.File(context.cacheDir, "captures").apply { mkdirs() }
            captures.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86_400_000 }?.forEach { it.delete() }
            val image = java.io.File.createTempFile("camera-", ".jpg", captures)
            val uri = androidx.core.content.FileProvider.getUriForFile(context, context.packageName + ".files", image)
            val ticket = vm.beginAttachmentPicker()
            if (ticket != null) { capturedUri = uri.toString(); cameraTicket = ticket; camera.launch(uri) }
        } catch (e: Exception) { vm.cancelAttachmentPicker(cameraTicket); cameraTicket = null; capturedUri = null; vm.error("无法打开相机，请选择照片或文件。") }
    }, onPhoto = {
        attachmentMenu = false
        if (attachmentPickerReady()) vm.beginAttachmentPicker()?.let { ticket ->
            photoPickerTicket = ticket
            try { photoPicker.launch(arrayOf("image/*")) }
            catch (e: Exception) { vm.cancelAttachmentPicker(ticket); photoPickerTicket = null; vm.error("无法打开照片选择器，请尝试从设备选择。") }
        }
    }, onFileSources = {
        attachmentMenu = false
        if (ui.loggedIn) fileSourceMenu = true else vm.showAuth(true)
    }, onPlugins = { attachmentMenu = false; openResource("插件", "", "") }, onReasoning = { attachmentMenu = false; reasoningMenu = true }, reasoning = ui.reasoningEffort)
    if (fileSourceMenu) FileSourceSheet(onDismiss = { fileSourceMenu = false }, onDevice = {
        fileSourceMenu = false
        if (attachmentPickerReady()) vm.beginAttachmentPicker()?.let { ticket ->
            filePickerTicket = ticket
            try { filePicker.launch(arrayOf("*/*")) }
            catch (e: Exception) { vm.cancelAttachmentPicker(ticket); filePickerTicket = null; vm.error("无法打开系统文件选择器，请重试。") }
        }
    }, onLibrary = { fileSourceMenu = false; openResource("资料库", "", "") })
    if (reasoningMenu) ReasoningPicker(ui.reasoningEffort, !ui.streaming && !ui.busy, onSelect = { vm.setReasoningEffort(it); reasoningMenu = false }, onDismiss = { reasoningMenu = false })
    if (projectPicker) ui.current?.let { session -> ConversationProjectPicker(session, ui.baseUrl, onAuthLost = { scope.launch { projectPicker = false; vm.logout(); vm.showAuth(true) } }, onDismiss = { projectPicker = false }, onMoved = { moved -> vm.selectSession(moved); projectPicker = false }, onError = vm::error) }
    if (uploadedFiles) ConversationFiles(ui.messages, onDismiss = { uploadedFiles = false }, onUseFile = { id, name, mime -> vm.useLibraryFile(id, name, mime); uploadedFiles = false })
    if (ui.showAuth) AuthFlowSheet(onDismiss = { vm.showAuth(false) }, baseUrl = ui.baseUrl)
    if (settings) ConnectionSheet(ui.baseUrl, ui.authBusy, ui.sheetError, { vm.configure(it) { settings = false } }, { settings = false })
    if (profile) SocratesSheet(onDismissRequest = { profile = false }, containerColor = Color.White) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(if (ui.loggedIn) ui.accountName else "Socrates", style = MaterialTheme.typography.headlineSmall)
            Text(ui.baseUrl, style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            if (ui.loggedIn) SocratesTextButton(onClick = { profile = false; account = true }) { ReferenceIcon(ReferenceGlyph.Person, null); Spacer(Modifier.width(12.dp)); Text("帐号资料与安全") }
            if (ui.loggedIn) SocratesTextButton(onClick = { profile = false; resource = "模型与服务商" }) { Text("模型与服务商") }
            if (ui.loggedIn) SocratesTextButton(onClick = { profile = false; resource = "记忆" }) { Text("记忆") }
            if (ui.loggedIn) SocratesTextButton(onClick = { profile = false; voiceSettings = true; vm.voicePreferences.load() }) { ReferenceIcon(ReferenceGlyph.Mic, null); Spacer(Modifier.width(12.dp)); Text("语音输入偏好") }
            SocratesTextButton(onClick = { profile = false; settings = true }) { ReferenceIcon(ReferenceGlyph.Settings, null); Spacer(Modifier.width(12.dp)); Text("连接设置") }
            SocratesTextButton(onClick = { profile = false; if (ui.loggedIn) vm.logout() else vm.showAuth(true) }) { ReferenceIcon(if (ui.loggedIn) ReferenceGlyph.SignOut else ReferenceGlyph.Person, null); Spacer(Modifier.width(12.dp)); Text(if (ui.loggedIn) "退出登录" else "登录 Socrates") }
        }
    }
    if (voiceSettings && ui.loggedIn) VoicePreferencesSheet(voicePreferences, vm.voicePreferences::edit,
        vm.voicePreferences::save, vm.voicePreferences::load, { voiceSettings = false })
    if (account) AccountProfileSheet(onDismiss = { account = false })
    if (resource == "模型与服务商") ProviderSheet(accountKey = ui.accountName, onDismiss = { resource = null })
    if (resource == "教学与测验") androidx.compose.ui.window.Dialog(
        onDismissRequest = { resource = null; learningId = null; learningKind = null },
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)
    ) {
        Box(Modifier.fillMaxSize().background(SocratesDesign.Page)) {
            Box(Modifier.fillMaxSize().windowInsetsPadding(AppSafeInsets)) {
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
    }
    resource?.takeUnless { it in setOf("模型与服务商", "教学与测验") }?.let { title -> FeatureSheet(title, onDismiss = { resource = null }, onAuthLost = { vm.refresh() },
        onOpenSession = { id -> resource = null; work = false; val session = ui.sessions.firstOrNull { it.id == id }; if (session?.kind == "exam" || session?.mode == "tutor") { learningId = id; resource = "教学与测验" } else vm.selectSession(com.socrates.android.data.ChatSession(id = id)) },
        onUseFile = { id, name, mime -> resource = null; work = false; vm.useLibraryFile(id, name, mime) },
        onUseProject = { id, title -> if (vm.startBoundChat(id, title)) { resource = null; work = false } },
        onUseAssistant = { id, title, source -> if (vm.startBoundChat(id, title, assistant = true, source = source)) { resource = null; work = false } }, onStartChat = { prompt ->
        resource = null; work = false; vm.newChat(); vm.send(prompt)
    }) }
    shareSession?.let { id -> SessionShareSheet(id) { shareSession = null } }
    if (exportState.isOpen) SessionExportSheet(exportState,
        onFormat = vm.transcriptExport::choose,
        onSave = { vm.transcriptExport.prepare { request ->
            exportPickerTicket = request.ticket
            exportPicker.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = request.mimeType
                putExtra(Intent.EXTRA_TITLE, request.fileName)
            })
        } }, onDismiss = vm.transcriptExport::dismiss)
    tagSession?.takeIf { ui.loggedIn }?.let { session ->
        SessionTagEditor(session, SessionHistory.knownTags(ui.sessions), ui.tagsSaving, !ui.busy && !ui.streaming,
            ui.tagsError, onSave = { tags -> vm.saveSessionTags(session, tags) { tagSession = null } }, onDismiss = { tagSession = null })
    }
    if (globalSearch && ui.loggedIn) GlobalSearchSheet(searchState, ui.sessions, ui.searchOpening, !ui.streaming && !ui.busy && !ui.tagsSaving,
        searchOpenError, onEdit = { query, filter -> searchOpenError = null; vm.cancelSearchOpening(); vm.globalSearch.edit(query, filter) },
        onSubmit = { searchOpenError = null; vm.cancelSearchOpening(); vm.globalSearch.submit() }, onOpen = { hit ->
            if (hit.sessionId != ui.current?.id && (composerDraft.isNotBlank() || ui.attachments.isNotEmpty())) pendingSearchHit = hit
            else openGlobalResult(hit)
        }, onDismiss = { globalSearch = false; pendingSearchHit = null; searchOpenError = null; vm.cancelSearchOpening(); vm.globalSearch.clear() })
    pendingSearchHit?.takeIf { globalSearch && ui.loggedIn }?.let { hit ->
        SocratesAlert(onDismissRequest = { pendingSearchHit = null }, title = { Text("离开当前聊天？") },
            text = { Text("当前有未发送文字或附件。切换到另一普通聊天会清空这些内容；打开失败或进入学习页面则保留。") },
            confirmButton = { SocratesTextButton(onClick = { pendingSearchHit = null; openGlobalResult(hit) }, enabled = !ui.busy && !ui.streaming && !ui.tagsSaving) { Text("打开会话") } },
            dismissButton = { SocratesTextButton(onClick = { pendingSearchHit = null }) { Text("取消") } })
    }
    if (find) SocratesSheet(onDismissRequest = { find = false }) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(20.dp)) {
            SocratesField(findQuery, { findQuery = it }, label = { Text("搜索当前会话") }, modifier = Modifier.fillMaxWidth())
            val matches = ui.messages.filter { findQuery.isNotBlank() && it.content.contains(findQuery, true) }
            Text(if (findQuery.isBlank()) "输入关键词" else "找到 ${matches.size} 条消息")
            LazyColumn(Modifier.heightIn(max = 400.dp)) {
                items(matches, key = { it.id }) { message ->
                    SocratesTextButton(onClick = { jumpId = SearchJump(message.id); find = false }) { Text(message.content, maxLines = 3, overflow = TextOverflow.Ellipsis) }
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
            text = { Column {
                SocratesTextButton(onClick = { rename = true }) { Text("重命名") }
                SocratesTextButton(onClick = { vm.clearTagsError(); tagSession = session; sessionAction = null }, enabled = !ui.busy && !ui.streaming) { Text("管理标签") }
                Text("删除将永久移除此会话及其关联数据，无法撤销。")
            } },
            confirmButton = { SocratesTextButton(onClick = { vm.deleteSession(session); sessionAction = null }, enabled = !ui.streaming) { Text("永久删除", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { SocratesTextButton(onClick = { sessionAction = null }) { Text("取消") } })
    }
}

@Composable
internal fun ChatHeader(work: Boolean, recording: Boolean, hasMessages: Boolean, session: com.socrates.android.data.ChatSession?, onConversationAction: (String) -> Unit, onMenu: () -> Unit, onMode: (Boolean) -> Unit, onNew: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Box(Modifier.testTag("chat-header").fillMaxWidth().heightIn(min = SocratesDesign.HeaderHeight).padding(horizontal = 14.dp, vertical = 8.dp)) {
        CircleAction("打开侧边栏", onMenu, Modifier.align(Alignment.CenterStart)) { ReferenceIcon(ReferenceGlyph.Menu) }
        if (!hasMessages || work) Box(Modifier.align(Alignment.Center).padding(horizontal = 52.dp)) {
            ChatModeSwitch(work, onMode, Modifier.testTag("chat-mode-switch").widthIn(max = 170.dp).fillMaxWidth())
        }
        Row(Modifier.align(Alignment.CenterEnd), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            SocratesIconButton(onClick = if (hasMessages) onNew else { { onConversationAction("models") } }, enabled = !recording) {
                ReferenceIcon(if (hasMessages) ReferenceGlyph.Compose else ReferenceGlyph.Reasoning, if (hasMessages) "新建对话" else "模型设置", tint = if (recording) SocratesDesign.Disabled else Ink)
            }
            if (hasMessages && !work) Box {
                SocratesIconButton(onClick = { menu = true }) { ReferenceIcon(ReferenceGlyph.More, "对话菜单") }
                SocratesMenu(menu, { menu = false }, modifier = Modifier.width(206.dp)) {
                    session?.title?.takeIf { it.isNotBlank() }?.let { Text(it, Modifier.padding(horizontal = 24.dp, vertical = 8.dp), color = SocratesDesign.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis) }
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
                    SocratesMenuItem({ Text("导出聊天文件") }, { action("export") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Archive) })
                    if (session != null) {
                        SocratesMenuItem({ Text("添加到主屏幕") }, { action("home") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Plus) })
                        SocratesMenuItem({ Text("重命名") }, { action("manage") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Compose) })
                        SocratesMenuItem({ Text(if (com.socrates.android.data.SessionActions.isArchived(session)) "取消归档" else "归档") }, { action("archive") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Archive) })
                        SocratesMenuItem({ Text("删除", color = SocratesDesign.Danger) }, { action("delete") }, leadingIcon = { ReferenceIcon(ReferenceGlyph.Trash, tint = SocratesDesign.Danger) })
                    }
                }
            }
        }
    }
}

@Composable
private fun CircleAction(description: String, onClick: () -> Unit, modifier: Modifier = Modifier, accent: Boolean = false, enabled: Boolean = true, content: @Composable () -> Unit) {
    Box(modifier.size(44.dp).clip(CircleShape).clickable(enabled = enabled, onClick = onClick).semantics { contentDescription = description }, contentAlignment = Alignment.Center) {
        Box(Modifier.size(if (accent) 36.dp else 44.dp).background(if (accent) SocratesDesign.Accent else Color.White, CircleShape), contentAlignment = Alignment.Center) { content() }
    }
}

@Composable
private fun Transcript(ui: ChatUiState, modifier: Modifier = Modifier, jumpId: SearchJump? = null, speech: SpeechPlayback, onMessageAction: (String, ChatMessage) -> Unit = { _, _ -> }) {
    val list = rememberLazyListState()
    var handledJump by remember(ui.current?.id) { mutableStateOf<String?>(null) }
    val tolerance = with(LocalDensity.current) { 64.dp.toPx() }
    val nearBottom by remember { derivedStateOf {
        val last = list.layoutInfo.visibleItemsInfo.lastOrNull()
        !list.canScrollForward || (last != null && last.index == list.layoutInfo.totalItemsCount - 1 &&
            last.offset + last.size - list.layoutInfo.viewportEndOffset < tolerance)
    } }
    val scope = rememberCoroutineScope()
    LaunchedEffect(ui.current?.id, jumpId, ui.messages.size, ui.messages.lastOrNull()?.content?.length) {
        val index = if (jumpId != null && jumpId.key != handledJump) ui.messages.indexOfFirst { it.id == jumpId.messageId } else -1
        if (index >= 0) {
            handledJump = jumpId?.key
            list.scrollToItem(index)
        } else if (ui.messages.isNotEmpty() && (nearBottom || ui.messages.last().role == "user")) {
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
            CircleAction("滚动到底部", { scope.launch { list.animateScrollToItem(ui.messages.lastIndex, Int.MAX_VALUE) } }, Modifier.border(1.dp, SocratesDesign.Line, CircleShape)) { ReferenceIcon(ReferenceGlyph.ArrowDown, null, Modifier.size(20.dp)) }
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
        MessageAttachmentList(message)
        if (user) {
            Column(Modifier.widthIn(max = 300.dp).background(Color(0xFFF4F4F4), RoundedCornerShape(18.dp)).padding(horizontal = 18.dp, vertical = 12.dp)) {
                SelectionContainer { Text(message.content.substringBefore("\n\n<资料"), fontSize = 16.sp, lineHeight = 24.sp) }
            }
        } else {
            val privateThinkingExists = message.reasoning.isNotBlank()
            if (streaming || privateThinkingExists || publicSummary != null) {
                val seconds = ((message.wire?.optLong("reasoningDurationMs") ?: 0L) / 1000L).coerceAtLeast(0)
                Row(Modifier.padding(bottom = if (publicSummary == null) 6.dp else 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (streaming) SocratesSpinner(Modifier.size(13.dp), strokeWidth = 1.5.dp, color = SocratesDesign.Muted)
                    else ReferenceIcon(ReferenceGlyph.Reasoning, null, Modifier.size(15.dp), tint = SocratesDesign.Muted)
                    Spacer(Modifier.width(8.dp))
                    Text(if (streaming) "思考中" else "思考了 ${seconds}秒", color = SocratesDesign.Muted, fontSize = 13.sp)
                }
                publicSummary?.let { Text("公开思考摘要", Modifier.padding(bottom = 2.dp), style = MaterialTheme.typography.labelSmall, color = SocratesDesign.Muted); NativeMarkdown(it, Modifier.fillMaxWidth()) }
            }
            turnSegments.forEachIndexed { index, segment ->
                when (segment) {
                    is AssistantTurnSegment.Text -> if (segment.value.isNotBlank()) NativeMarkdown(
                        segment.value, Modifier.fillMaxWidth(), streaming = AssistantTurnLayout.isLiveTextTail(turnSegments, index, streaming)
                    )
                    is AssistantTurnSegment.Tool -> ToolActivityCard(segment.call)
                }
            }
            if (streaming && (message.content.isBlank() || activity.isNotBlank())) Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                SocratesSpinner(Modifier.size(12.dp), strokeWidth = 1.5.dp, color = SocratesDesign.Muted)
                Spacer(Modifier.width(8.dp)); Text(activity.ifBlank { "正在回复" }, color = SocratesDesign.Muted, fontSize = 12.sp, maxLines = 2)
            }
            if (!streaming && message.content.isNotBlank()) {
                val context = LocalContext.current
                var menu by remember { mutableStateOf(false) }
                Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    SocratesIconButton(onClick = { clipboard.setText(AnnotatedString(message.content)) }, modifier = Modifier.size(36.dp, 44.dp)) { ReferenceIcon(ReferenceGlyph.Copy, "复制回复", Modifier.size(19.dp), SocratesDesign.Muted) }
                    listOf("up" to ReferenceGlyph.ThumbUp, "down" to ReferenceGlyph.ThumbDown).forEach { (value, glyph) ->
                        SocratesIconButton(onClick = { val next = if (feedback == value) "none" else value; onAction(next, message) }, enabled = actionsEnabled, modifier = Modifier.size(36.dp, 44.dp)) { ReferenceIcon(glyph, if (value == "up") "有帮助" else "没有帮助", Modifier.size(19.dp), if (feedback == value) Ink else SocratesDesign.Muted) }
                    }
                    SocratesIconButton(onClick = { speech.toggle(message.id, message.content) }, modifier = Modifier.size(36.dp, 44.dp)) { ReferenceIcon(ReferenceGlyph.Speaker, if (speech.playingId == message.id) "停止朗读" else "朗读回复", Modifier.size(19.dp), if (speech.playingId == message.id) Ink else SocratesDesign.Muted) }
                    SocratesIconButton(onClick = { shareTranscript(context, listOf(message)) }, modifier = Modifier.size(36.dp, 44.dp)) { ReferenceIcon(ReferenceGlyph.Share, "分享回复文本", Modifier.size(19.dp), SocratesDesign.Muted) }
                    Box {
                        SocratesIconButton(onClick = { menu = true }, modifier = Modifier.size(36.dp, 44.dp)) { ReferenceIcon(ReferenceGlyph.More, "消息操作", Modifier.size(19.dp), SocratesDesign.Muted) }
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
                SocratesIconButton(onClick = { userMenu = true }, modifier = Modifier.size(36.dp)) { ReferenceIcon(ReferenceGlyph.More, "用户消息操作", Modifier.size(17.dp), SocratesDesign.Muted) }
                SocratesMenu(userMenu, { userMenu = false }) {
                    SocratesMenuItem({ Text("编辑并重发") }, { userMenu = false; onAction("edit", message) })
                    SocratesMenuItem({ Text("从此处创建分支") }, { userMenu = false; onAction("branch", message) })
                }
            }
        }
    }
}

@Composable
private fun Composer(ui: ChatUiState, voice: VoiceInput, draft: String, onDraftChange: (String) -> Unit, onSend: (String) -> Boolean, onStop: () -> Unit, onAttach: () -> Unit, onRecord: () -> Unit, onRemoveAttachment: (String) -> Unit,
    onMoveAttachment: (String, Int) -> Unit, onEditAttachment: (String, String, String) -> String?, onReasoning: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val keyboardOpen = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val expanded = focused || keyboardOpen || draft.contains('\n') || ui.attachments.isNotEmpty()
    val horizontal by animateDpAsState(if (expanded || voice.active) 12.dp else 34.dp, tween(180), label = "composerInset")
    Column(Modifier.fillMaxWidth().padding(horizontal = horizontal).padding(top = 8.dp, bottom = 14.dp)) {
        key(ui.composerDraft.key) {
            AttachmentStrip(ui.attachments, !ui.busy && !ui.streaming && !voice.active, onRemoveAttachment, onMoveAttachment, onEditAttachment)
        }
        val recording = voice.active
        val focusRequester = remember { FocusRequester() }
        LaunchedEffect(ui.composerDraft.key) {
            if (ui.composerDraft.initialText.isNotEmpty()) focusRequester.requestFocus()
        }
        val shape = RoundedCornerShape(SocratesDesign.ComposerRadius)
        // Keep the same editor composed AND placed during recording. Removing it would close the IME.
        // It reports zero height and is hidden from paint/accessibility; the real voice row takes its place.
        val hiddenEditor = if (recording) Modifier.alpha(0f).clearAndSetSemantics { } else Modifier
        Column(Modifier.fillMaxWidth().then(hiddenEditor).layout { measurable, constraints ->
            val editor = measurable.measure(constraints)
            layout(editor.width, if (recording) 0 else editor.height) { editor.placeRelative(0, 0) }
        }.clip(shape).background(Color.White).border(1.dp, Color(0x1F000000), shape)
            .animateContentSize(spring(stiffness = Spring.StiffnessMediumLow))
            .padding(horizontal = 8.dp, vertical = 2.dp)) {
            Row(Modifier.fillMaxWidth().heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically) {
                AnimatedVisibility(!expanded) {
                    SocratesIconButton(onClick = onAttach, enabled = !recording && !ui.busy && !ui.streaming, modifier = Modifier.size(44.dp)) { ReferenceIcon(ReferenceGlyph.Plus, "添加附件", Modifier.size(26.dp), tint = Ink) }
                }
                DraftField(draft, { if (!recording) onDraftChange(it) }, { focused = it }, if (ui.messages.isEmpty()) "询问 Socrates" else "回复 Socrates",
                    Modifier.weight(1f).focusRequester(focusRequester)
                        .padding(horizontal = if (expanded) 8.dp else 4.dp, vertical = 8.dp)
                        .heightIn(min = 24.dp, max = 150.dp))
                if (!expanded) ComposerActions(draft, ui, onRecord, onStop) { if (onSend(draft)) onDraftChange("") }
            }
            AnimatedVisibility(expanded) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    SocratesIconButton(onClick = onAttach, enabled = !recording && !ui.busy && !ui.streaming) { ReferenceIcon(ReferenceGlyph.Plus, "添加附件", Modifier.size(27.dp), tint = Ink) }
                    Spacer(Modifier.weight(1f))
                    SocratesIconButton(onClick = onReasoning, enabled = !recording && !ui.busy && !ui.streaming) { ReferenceIcon(ReferenceGlyph.Reasoning, "推理强度", Modifier.size(23.dp), if (ui.reasoningEffort == "medium") SocratesDesign.Muted else SocratesDesign.Ink) }
                    ComposerActions(draft, ui, onRecord, onStop) { if (onSend(draft)) onDraftChange("") }
                }
            }
        }
        if (recording) VoiceComposer(voice) { phrase ->
            val accepted = onSend(phrase)
            onDraftChange(if (accepted) "" else phrase)
            accepted
        }
    }
}

@Composable
private fun DraftField(text: String, onValue: (String) -> Unit, onFocus: (Boolean) -> Unit, placeholder: String, modifier: Modifier) {
    BasicTextField(value = text, onValueChange = onValue, textStyle = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, color = Ink), cursorBrush = androidx.compose.ui.graphics.SolidColor(Ink), modifier = modifier.onFocusChanged { onFocus(it.isFocused) }.semantics { contentDescription = "消息输入框" }, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences), maxLines = 6, decorationBox = { inner -> Box { if (text.isEmpty()) Text(placeholder, fontSize = 16.sp, color = SocratesDesign.Placeholder); inner() } })
}

@Composable
private fun ComposerActions(draft: String, ui: ChatUiState, onRecord: () -> Unit, onStop: () -> Unit, onSend: () -> Unit) {
    if (!ui.streaming && draft.isBlank() && ui.attachments.isEmpty()) SocratesIconButton(onClick = onRecord, enabled = !ui.busy, modifier = Modifier.size(44.dp)) { ReferenceIcon(ReferenceGlyph.Mic, "语音输入", Modifier.size(25.dp), tint = Ink) }
    val sendable = draft.isNotBlank() || ui.attachments.isNotEmpty()
    CircleAction(if (ui.streaming) "停止回复" else if (sendable) "发送消息" else "开始语音输入", if (ui.streaming) onStop else if (sendable) onSend else onRecord, Modifier.size(44.dp), accent = true, enabled = !ui.busy) {
        when { ui.busy -> SocratesSpinner(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp); ui.streaming -> Box(Modifier.size(12.dp).background(Color.White, RoundedCornerShape(3.dp))); sendable -> ReferenceIcon(ReferenceGlyph.ArrowUp, null, Modifier.size(20.dp), tint = Color.White); else -> VoiceMark() }
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
        if (voice.transcript.isNotBlank()) Text(voice.transcript, Modifier.padding(12.dp).heightIn(max = 100.dp).verticalScroll(rememberScrollState()), color = SocratesDesign.Muted, fontSize = 14.sp)
        Row(Modifier.fillMaxWidth().height(48.dp).clip(CircleShape).background(Color.White).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            SocratesIconButton(onClick = voice::cancel) { ReferenceIcon(ReferenceGlyph.Close, "取消语音", Modifier.size(24.dp)) }
            Canvas(Modifier.weight(1f).height(28.dp).semantics { contentDescription = if (voice.listening) "录音音量波形" else "语音识别已停止" }) {
                bars.forEachIndexed { index, value -> val x = size.width * (index + .5f) / bars.size; val height = (3.dp.toPx() + value * (size.height - 3.dp.toPx())); drawLine(if (index < 18) Color(0xFFCCCCCC) else Color(0xFF888888), androidx.compose.ui.geometry.Offset(x, (size.height - height) / 2), androidx.compose.ui.geometry.Offset(x, (size.height + height) / 2), 2.5.dp.toPx(), StrokeCap.Round) }
            }
            SocratesIconButton(onClick = voice::stop, enabled = voice.listening) { Box(Modifier.size(15.dp).background(Ink, RoundedCornerShape(4.dp)).semantics { contentDescription = "停止录音" }) }
            CircleAction("发送语音识别结果", { voice.send { onSend(it) } }, Modifier.size(44.dp), accent = true) { ReferenceIcon(ReferenceGlyph.ArrowUp, null, Modifier.size(20.dp), tint = Color.White) }
        }
    }
}

@Composable
internal fun NativeSidebar(ui: ChatUiState, onNew: () -> Unit, onSelect: (com.socrates.android.data.ChatSession) -> Unit, onProfile: () -> Unit, onRefresh: () -> Unit, onSessionMenu: (com.socrates.android.data.ChatSession) -> Unit, onRestore: (com.socrates.android.data.ChatSession) -> Unit, onImages: () -> Unit, onLibrary: () -> Unit, onProjects: () -> Unit, onAssistants: () -> Unit, onTasks: () -> Unit, onPlugins: () -> Unit, onCodex: () -> Unit, onGlobalSearch: () -> Unit) {
    var search by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var archived by rememberSaveable { mutableStateOf(false) }
    var tag by rememberSaveable(ui.loggedIn, ui.baseUrl, ui.accountName) { mutableStateOf<String?>(null) }
    var now by remember { mutableStateOf(java.time.ZonedDateTime.now()) }
    LaunchedEffect(Unit) { while (true) { delay(60_000); now = java.time.ZonedDateTime.now() } }
    val knownTags = remember(ui.sessions) { SessionHistory.knownTags(ui.sessions) }
    val visibleSessions = remember(ui.sessions, query, archived, tag) { SessionHistory.filter(ui.sessions, query, archived, tag) }
    val groups = remember(visibleSessions, now) { visibleSessions.groupBy { SessionHistory.groupLabel(it, now) } }
    LazyColumn(Modifier.testTag("sidebar-list").fillMaxSize().windowInsetsPadding(AppSafeInsets).padding(horizontal = 24.dp),
        contentPadding = PaddingValues(bottom = 8.dp), verticalArrangement = SidebarFooterArrangement) {
        item(key = "sidebar-header") {
            Row(Modifier.fillMaxWidth().heightIn(min = 78.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Socrates", Modifier.weight(1f), fontSize = 22.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-.5).sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                SocratesIconButton(onClick = { search = !search; if (!search) { query = ""; tag = null } }) { ReferenceIcon(ReferenceGlyph.Search, if (search) "关闭会话搜索" else "搜索会话", Modifier.size(25.dp)) }
            }
        }
        item(key = "sidebar-search") {
            AnimatedVisibility(search) {
                Column(Modifier.padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SocratesField(query, { query = it }, Modifier.fillMaxWidth(), placeholder = { Text("搜索标题、摘要或标签") }, singleLine = true, shape = CircleShape)
                    Text("在已同步会话的标题、主题、摘要和标签中查找，不搜索消息全文。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
                    SocratesTextButton(onClick = onGlobalSearch) { Text("在服务器搜索消息全文") }
                    if (knownTags.isNotEmpty() || tag != null) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        SocratesFilterChip(selected = tag == null, onClick = { tag = null }, label = { Text("全部标签") })
                        (knownTags + listOfNotNull(tag)).distinct().forEach { label ->
                            SocratesFilterChip(selected = tag == label, onClick = { tag = if (tag == label) null else label }, label = { Text(label, maxLines = 1) })
                        }
                    }
                }
            }
        }
        if (!search) {
            item { SidebarAction(ReferenceGlyph.Image, "图像", onImages) }
            item { SidebarAction(ReferenceGlyph.Archive, "资料库", onLibrary) }
            item { SidebarAction(ReferenceGlyph.Folder, "项目", onProjects) }
            item { SidebarAction(ReferenceGlyph.Compose, "Codex", onCodex) }
            item { SidebarAction(ReferenceGlyph.Clock, "定时任务", onTasks) }
            item { SidebarAction(ReferenceGlyph.Plugin, "插件", onPlugins) }
            item { SocratesDivider(Modifier.padding(top = 24.dp, bottom = 24.dp)) }
        }
        if (ui.loggedIn) item { SocratesTextButton(onClick = { archived = !archived }) { Text(if (archived) "返回最近对话" else "查看归档", fontSize = 13.sp, color = SocratesDesign.Muted) } }
        if (ui.loggedIn && visibleSessions.isEmpty()) item {
            Column(Modifier.padding(vertical = 16.dp)) {
                Text(if (ui.busy) "正在同步会话…" else if (query.isNotBlank() || tag != null) "没有匹配的对话" else if (archived) "没有已归档的对话" else "还没有对话", fontSize = 14.sp, color = SocratesDesign.Muted)
                SocratesTextButton(onClick = onRefresh) { Text("刷新") }
            }
        }
        groups.forEach { (label, sessions) ->
            item(key = "group-$label") { Text(label, Modifier.padding(top = 16.dp, bottom = 6.dp).semantics { heading() }, style = MaterialTheme.typography.labelMedium, color = SocratesDesign.Muted) }
            items(sessions, key = { it.id }) { session ->
                Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(SocratesDesign.RowRadius)).combinedClickable(onClick = { onSelect(session) }, onLongClickLabel = "管理会话", onLongClick = { onSessionMenu(session) }).padding(vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(session.title.ifBlank { session.topic.ifBlank { "新对话" } }, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val tags = SessionHistory.tags(session)
                        if (tags.isNotEmpty()) Text(tags.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val preview = session.wire?.opt("preview") as? String
                        if (query.isNotBlank() && !preview.isNullOrBlank()) Text(preview, style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    if (com.socrates.android.data.SessionActions.isPinned(session)) ReferenceIcon(ReferenceGlyph.Pin, "已置顶", Modifier.size(14.dp), SocratesDesign.Muted)
                    if (archived) SocratesTextButton(onClick = { onRestore(session) }) { Text("恢复", fontSize = 13.sp) }
                    if (ui.current?.id == session.id) Box(Modifier.padding(start = 8.dp).size(9.dp).background(SocratesDesign.Accent, CircleShape))
                }
            }
        }
        item(key = "sidebar-footer") {
            Row(Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SocratesButton(onClick = onNew, modifier = Modifier.weight(1f, fill = false), shape = CircleShape, containerColor = SocratesDesign.Accent, contentColor = Color.White, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)) { ReferenceIcon(ReferenceGlyph.Compose, null, Modifier.size(20.dp)); Spacer(Modifier.width(10.dp)); Text("聊天", fontSize = 16.sp) }
                CircleAction("帐号与设置", onProfile) { Box(Modifier.size(24.dp).background(SocratesDesign.Avatar, CircleShape), contentAlignment = Alignment.Center) { Text(if (ui.loggedIn) ui.accountName.take(2).uppercase() else "S", color = Color.White, fontSize = 10.sp) } }
            }
        }
    }
}

@Composable
private fun SidebarAction(icon: ReferenceGlyph, title: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(SocratesDesign.RowRadius)).clickable(onClick = onClick).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        ReferenceIcon(icon, null, Modifier.size(24.dp), tint = Ink); Spacer(Modifier.width(12.dp)); Text(title, Modifier.weight(1f), fontSize = 16.sp, color = Ink)
    }
}
