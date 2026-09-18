package com.topodrive.socrates.vm

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.topodrive.socrates.data.Api
import com.topodrive.socrates.data.Artifact
import com.topodrive.socrates.data.Attachment
import com.topodrive.socrates.data.FileEntry
import com.topodrive.socrates.data.Memory
import com.topodrive.socrates.data.Message
import com.topodrive.socrates.data.Mistake
import com.topodrive.socrates.data.ApiKeyProvider
import com.topodrive.socrates.data.Prefs
import com.topodrive.socrates.data.Project
import com.topodrive.socrates.data.ScheduledTask
import com.topodrive.socrates.data.Session
import com.topodrive.socrates.data.ShareInfo
import com.topodrive.socrates.data.Sse
import com.topodrive.socrates.data.User
import com.topodrive.socrates.util.ChatSupport
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Central app store — the Android analogue of `mobile/src/stores/appStore.ts`.
 * One shared instance drives auth, session list, the active conversation,
 * streaming, and the side panels.
 */
class AppState(app: Application) : AndroidViewModel(app) {

    /* ── Auth ── */
    enum class AuthStage { LOADING, SIGNED_OUT, SIGNED_IN }

    private val _authStage = MutableStateFlow(AuthStage.LOADING)
    val authStage: StateFlow<AuthStage> = _authStage
    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user

    /* ── Session list & active session ── */
    private val _sessions = MutableStateFlow<List<Session>>(emptyList())
    val sessions: StateFlow<List<Session>> = _sessions
    private val _sessionsLoading = MutableStateFlow(false)
    val sessionsLoading: StateFlow<Boolean> = _sessionsLoading
    private var nextCursor: String? = null

    private val _active = MutableStateFlow<Session?>(null)
    val active: StateFlow<Session?> = _active
    private val _activeMessages = MutableStateFlow<List<Message>>(emptyList())
    val activeMessages: StateFlow<List<Message>> = _activeMessages
    private val _messagesLoading = MutableStateFlow(false)
    val messagesLoading: StateFlow<Boolean> = _messagesLoading

    /* ── Streaming ── */
    private val _isStreaming = MutableStateFlow(false)
    val isStreaming: StateFlow<Boolean> = _isStreaming
    private val _streamText = MutableStateFlow("")
    val streamText: StateFlow<String> = _streamText
    private val _streamReasoning = MutableStateFlow("")
    val streamReasoning: StateFlow<String> = _streamReasoning
    private val _streamTools = MutableStateFlow<List<com.topodrive.socrates.data.ToolCall>>(emptyList())
    val streamTools: StateFlow<List<com.topodrive.socrates.data.ToolCall>> = _streamTools
    private val _streamError = MutableStateFlow<String?>(null)
    val streamError: StateFlow<String?> = _streamError
    private var streamJob: Job? = null
    private var pendingUserMessage: Message? = null

    /* ── Chat prefs ── */
    private val _appMode = MutableStateFlow("chat") // chat|tutor
    val appMode: StateFlow<String> = _appMode
    private val _effort = MutableStateFlow("medium")
    val effort: StateFlow<String> = _effort
    private val _incognito = MutableStateFlow(false)
    val incognito: StateFlow<Boolean> = _incognito
    private val _providers = MutableStateFlow<List<ApiKeyProvider>>(emptyList())
    val providers: StateFlow<List<ApiKeyProvider>> = _providers
    private val _selectedModel = MutableStateFlow<String?>(null)
    val selectedModel: StateFlow<String?> = _selectedModel

    /* ── Panels data ── */
    private val _projects = MutableStateFlow<List<Project>>(emptyList())
    val projects: StateFlow<List<Project>> = _projects
    private val _tasks = MutableStateFlow<List<ScheduledTask>>(emptyList())
    val tasks: StateFlow<List<ScheduledTask>> = _tasks
    private val _files = MutableStateFlow<List<FileEntry>>(emptyList())
    val files: StateFlow<List<FileEntry>> = _files
    private val _artifacts = MutableStateFlow<List<Artifact>>(emptyList())
    val artifacts: StateFlow<List<Artifact>> = _artifacts
    private val _memories = MutableStateFlow<List<Memory>>(emptyList())
    val memories: StateFlow<List<Memory>> = _memories
    private val _mistakes = MutableStateFlow<List<Mistake>>(emptyList())
    val mistakes: StateFlow<List<Mistake>> = _mistakes
    private val _knowledge = MutableStateFlow<kotlinx.serialization.json.JsonObject?>(null)
    val knowledge: StateFlow<kotlinx.serialization.json.JsonObject?> = _knowledge
    private val _tags = MutableStateFlow<List<String>>(emptyList())
    val tags: StateFlow<List<String>> = _tags

    /* ── UI state ── */
    enum class Screen { HOME, CHAT, PROJECTS, LIBRARY, ARTIFACTS, SCHEDULED, PLUGINS, EXAM, KNOWLEDGE, MISTAKES, MORE, SKILLS }
    private val _screen = MutableStateFlow(Screen.HOME)
    val screen: StateFlow<Screen> = _screen
    private val _drawerOpen = MutableStateFlow(false)
    val drawerOpen: StateFlow<Boolean> = _drawerOpen
    private val _searchOpen = MutableStateFlow(false)
    val searchOpen: StateFlow<Boolean> = _searchOpen
    private val _settingsOpen = MutableStateFlow(false)
    val settingsOpen: StateFlow<Boolean> = _settingsOpen
    private val _apiKeysOpen = MutableStateFlow(false)
    val apiKeysOpen: StateFlow<Boolean> = _apiKeysOpen
    private val _modelPickerOpen = MutableStateFlow(false)
    val modelPickerOpen: StateFlow<Boolean> = _modelPickerOpen
    private val _shareOpen = MutableStateFlow(false)
    val shareOpen: StateFlow<Boolean> = _shareOpen
    private val _shareInfo = MutableStateFlow<ShareInfo?>(null)
    val shareInfo: StateFlow<ShareInfo?> = _shareInfo
    private val _pendingAttachments = MutableStateFlow<List<Attachment>>(emptyList())
    val pendingAttachments: StateFlow<List<Attachment>> = _pendingAttachments
    private val _snackbar = MutableStateFlow<String?>(null)
    val snackbar: StateFlow<String?> = _snackbar
    private val _composerPrefill = MutableStateFlow<String?>(null)
    val composerPrefill: StateFlow<String?> = _composerPrefill
    fun prefillComposer(text: String) { _composerPrefill.value = text }
    fun consumePrefill() { _composerPrefill.value = null }

    /* ── Display prefs ── */
    private val _themePref = MutableStateFlow("dark")
    val themePref: StateFlow<String> = _themePref
    private val _fontScale = MutableStateFlow(1.125f)
    val fontScale: StateFlow<Float> = _fontScale
    private val _contentWidth = MutableStateFlow(1f)
    val contentWidth: StateFlow<Float> = _contentWidth
    private val _showGrid = MutableStateFlow(false)
    val showGrid: StateFlow<Boolean> = _showGrid
    private val _bgOverrideDark = MutableStateFlow<String?>(null)
    val bgOverrideDark: StateFlow<String?> = _bgOverrideDark
    private val _bgOverrideLight = MutableStateFlow<String?>(null)
    val bgOverrideLight: StateFlow<String?> = _bgOverrideLight

    private val prefs get() = Api.prefs

    init {
        viewModelScope.launch {
            _themePref.value = prefs.theme()
            _fontScale.value = prefs.fontScale()
            _contentWidth.value = prefs.contentWidth()
            _showGrid.value = prefs.showGrid()
            _bgOverrideDark.value = prefs.bgOverride(true)
            _bgOverrideLight.value = prefs.bgOverride(false)
            _effort.value = prefs.reasoningEffort()
            _appMode.value = prefs.appMode()
            _selectedModel.value = prefs.selectedModel()
            val tokens = prefs.readTokens()
            if (tokens.isLoggedIn) {
                _authStage.value = AuthStage.SIGNED_IN
                bootstrap()
            } else {
                _authStage.value = AuthStage.SIGNED_OUT
            }
        }
    }

    /* ═══════════ Auth ═══════════ */

    fun login(email: String, password: String, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                val r = Api.login(email, password)
                prefs.writeTokens(
                    com.topodrive.socrates.data.MobileTokenPair(r.accessToken, r.refreshToken, r.expiresAt, r.refreshExpiresAt),
                )
                _user.value = r.user
                _authStage.value = AuthStage.SIGNED_IN
                bootstrap()
            } catch (e: Api.ApiError) {
                onError(e.body?.message ?: e.body?.error ?: e.message ?: "sign in failed")
            } catch (e: Exception) {
                onError(e.message ?: "sign in failed")
            }
        }
    }

    fun loginWithCode(email: String, code: String, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                val r = Api.loginWithCode(email, code)
                prefs.writeTokens(
                    com.topodrive.socrates.data.MobileTokenPair(r.accessToken, r.refreshToken, r.expiresAt, r.refreshExpiresAt),
                )
                _user.value = r.user
                _authStage.value = AuthStage.SIGNED_IN
                bootstrap()
            } catch (e: Exception) { onError(e.message ?: "code sign-in failed") }
        }
    }

    fun sendCode(email: String, onDone: (String?) -> Unit) {
        viewModelScope.launch {
            try { Api.sendCode(email); onDone(null) } catch (e: Exception) { onDone(e.message) }
        }
    }

    fun register(email: String, password: String, onDone: (String?) -> Unit) {
        viewModelScope.launch {
            try { Api.register(email, password); onDone(null) } catch (e: Exception) { onDone(e.message) }
        }
    }

    fun forgot(email: String, onDone: (String?) -> Unit) {
        viewModelScope.launch {
            try { Api.forgotPassword(email); onDone(null) } catch (e: Exception) { onDone(e.message) }
        }
    }

    fun oauthExchange(exchangeToken: String, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                val pair = Api.oauthExchange(exchangeToken)
                prefs.writeTokens(pair)
                _user.value = try { Api.me() } catch (_: Exception) { null }
                _authStage.value = AuthStage.SIGNED_IN
                bootstrap()
            } catch (e: Exception) { onError(e.message ?: "oauth failed") }
        }
    }

    fun mobileVerify(token: String, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                val r = Api.mobileVerify(token)
                prefs.writeTokens(
                    com.topodrive.socrates.data.MobileTokenPair(r.accessToken, r.refreshToken, r.expiresAt, r.refreshExpiresAt),
                )
                _user.value = r.user
                _authStage.value = AuthStage.SIGNED_IN
                bootstrap()
                onDone(true)
            } catch (_: Exception) { onDone(false) }
        }
    }

    fun logout() {
        viewModelScope.launch {
            val rt = prefs.readTokens().refreshToken
            try { Api.mobileLogout(rt) } catch (_: Exception) {}
            prefs.clearTokens()
            _user.value = null
            _sessions.value = emptyList()
            _active.value = null
            _activeMessages.value = emptyList()
            _screen.value = Screen.HOME
            _authStage.value = AuthStage.SIGNED_OUT
        }
    }

    /* ═══════════ Bootstrap ═══════════ */

    fun bootstrap() {
        viewModelScope.launch {
            if (_user.value == null) {
                _user.value = try { Api.me() } catch (_: Exception) { null }
            }
            refreshSessions()
            refreshProviders()
            refreshTags()
            // Warm the side panels lazily
            refreshProjects()
        }
    }

    fun refreshSessions() {
        viewModelScope.launch {
            _sessionsLoading.value = true
            try {
                val (list, cursor) = Api.listSessions(50)
                nextCursor = cursor
                _sessions.value = list.sortedWith(
                    compareByDescending<Session> { it.pinned }.thenByDescending { it.updatedAt ?: it.createdAt ?: "" },
                )
            } catch (_: Exception) {}
            _sessionsLoading.value = false
        }
    }

    fun loadMoreSessions() {
        val c = nextCursor ?: return
        viewModelScope.launch {
            try {
                val (list, cursor) = Api.listSessions(50, c)
                nextCursor = cursor
                _sessions.value = (_sessions.value + list).distinctBy { it.id }
            } catch (_: Exception) {}
        }
    }

    fun refreshProviders() {
        viewModelScope.launch {
            try { _providers.value = Api.listApiKeys() } catch (_: Exception) {}
        }
    }

    fun refreshTags() {
        viewModelScope.launch {
            try { _tags.value = Api.listTags() } catch (_: Exception) {}
        }
    }

    fun refreshProjects() {
        viewModelScope.launch {
            try { _projects.value = Api.listProjects() } catch (_: Exception) {}
        }
    }

    fun refreshTasks() {
        viewModelScope.launch {
            try { _tasks.value = Api.listScheduledTasks() } catch (_: Exception) {}
        }
    }

    fun refreshFiles() {
        viewModelScope.launch {
            try { _files.value = Api.listFiles() } catch (_: Exception) {}
        }
    }

    fun refreshArtifacts() {
        viewModelScope.launch {
            try { _artifacts.value = Api.listArtifacts() } catch (_: Exception) {}
        }
    }

    fun refreshMemories() {
        viewModelScope.launch {
            try { _memories.value = Api.listMemories() } catch (_: Exception) {}
        }
    }

    fun refreshMistakes() {
        viewModelScope.launch {
            try { _mistakes.value = Api.listMistakes() } catch (_: Exception) {}
        }
    }

    fun refreshKnowledge() {
        viewModelScope.launch {
            try { _knowledge.value = Api.listKnowledge() } catch (_: Exception) {}
        }
    }

    /* ═══════════ Navigation ═══════════ */

    fun openScreen(s: Screen) {
        _screen.value = s
        _drawerOpen.value = false
        when (s) {
            Screen.PROJECTS -> refreshProjects()
            Screen.SCHEDULED -> refreshTasks()
            Screen.LIBRARY -> refreshFiles()
            Screen.ARTIFACTS -> refreshArtifacts()
            Screen.MISTAKES -> refreshMistakes()
            Screen.KNOWLEDGE -> refreshKnowledge()
            else -> {}
        }
    }

    fun openDrawer(v: Boolean) { _drawerOpen.value = v }
    fun openSearch(v: Boolean) { _searchOpen.value = v }
    fun openSettings(v: Boolean) { _settingsOpen.value = v }
    fun openApiKeys(v: Boolean) { _apiKeysOpen.value = v }
    fun openModelPicker(v: Boolean) { _modelPickerOpen.value = v }
    fun openShare(v: Boolean) { _shareOpen.value = v; if (v) loadShare() }
    fun toast(msg: String) { _snackbar.value = msg }
    fun clearToast() { _snackbar.value = null }

    fun setMode(mode: String) {
        _appMode.value = mode
        viewModelScope.launch { prefs.setAppMode(mode) }
    }

    fun setEffort(e: String) {
        _effort.value = e
        viewModelScope.launch { prefs.setReasoningEffort(e) }
    }

    fun setIncognito(v: Boolean) { _incognito.value = v }

    fun setSelectedModel(id: String?) {
        _selectedModel.value = id
        viewModelScope.launch { prefs.setSelectedModel(id) }
    }

    /* ═══════════ Session ops ═══════════ */

    fun newChat(projectId: String? = null) {
        streamJob?.cancel()
        _isStreaming.value = false
        _active.value = null
        _activeMessages.value = emptyList()
        _pendingAttachments.value = emptyList()
        _streamError.value = null
        _screen.value = Screen.HOME
        if (projectId != null) {
            // create on first send — remember target
            pendingProjectId = projectId
        } else pendingProjectId = null
    }

    private var pendingProjectId: String? = null

    fun openSession(id: String) {
        _screen.value = Screen.CHAT
        _messagesLoading.value = true
        viewModelScope.launch {
            try {
                val s = Api.getSession(id)
                _active.value = s
                _activeMessages.value = s.messages ?: emptyList()
            } catch (_: Exception) {
                toast("Couldn't load conversation")
            }
            _messagesLoading.value = false
        }
        _drawerOpen.value = false
    }

    fun pinSession(s: Session, pin: Boolean) {
        viewModelScope.launch {
            try {
                Api.patchSession(s.id, mapOf("pinned" to pin))
                refreshSessions()
            } catch (_: Exception) {}
        }
    }

    fun renameSession(s: Session, title: String) {
        viewModelScope.launch {
            try {
                Api.patchSession(s.id, mapOf("title" to title))
                refreshSessions()
            } catch (_: Exception) {}
        }
    }

    fun archiveSession(s: Session) {
        viewModelScope.launch {
            try {
                Api.archiveSession(s.id)
                if (_active.value?.id == s.id) newChat()
                refreshSessions()
            } catch (_: Exception) {}
        }
    }

    fun deleteSession(s: Session) {
        viewModelScope.launch {
            try {
                Api.deleteSession(s.id)
                if (_active.value?.id == s.id) newChat()
                refreshSessions()
            } catch (_: Exception) {}
        }
    }

    fun setSessionTags(s: Session, tags: List<String>) {
        viewModelScope.launch {
            try {
                Api.patchSession(s.id, mapOf("tags" to tags))
                refreshSessions()
            } catch (_: Exception) {}
        }
    }

    /* ═══════════ Composer ═══════════ */

    fun addAttachment(a: Attachment) { _pendingAttachments.value = _pendingAttachments.value + a }
    fun removeAttachment(id: String) { _pendingAttachments.value = _pendingAttachments.value.filter { it.id != id } }

    /* ═══════════ Chat send (port of appStore.sendMessage) ═══════════ */

    fun sendMessage(text: String) {
        val body = text.trim()
        if (body.isEmpty() && _pendingAttachments.value.isEmpty()) return
        if (_isStreaming.value) return

        val atts = _pendingAttachments.value
        _pendingAttachments.value = emptyList()

        val existing = _active.value
        val isNew = existing == null
        val sessionId = existing?.id ?: "s_${ChatSupport.uid()}"
        val mode = _appMode.value
        val kind = if (mode == "tutor") "tutor" else (existing?.kind ?: "chat")

        val userMsg = Message(
            id = "m_${ChatSupport.uid()}",
            clientId = ChatSupport.uid(),
            role = "user",
            rawText = body,
            attachments = atts.ifEmpty { null },
            createdAt = now(),
        )
        val prior = _activeMessages.value
        val messages = prior + userMsg

        val session = (existing ?: Session(
            id = sessionId,
            topic = ChatSupport.sessionTitle("", body),
            mode = mode,
            kind = kind,
            projectId = pendingProjectId ?: existing?.projectId,
        )).let { s ->
            if (isNew && s.title.isNullOrBlank()) s.copy(title = ChatSupport.sessionTitle(s.topic, body)) else s
        }

        _active.value = session.copy(messages = messages)
        _activeMessages.value = messages
        _screen.value = Screen.CHAT
        pendingProjectId = null
        pendingUserMessage = userMsg

        startStream(session, messages)
    }

    /** Stream an assistant reply for the current tail of `messages` — shared by
     *  send, retry, and edit-and-resend. */
    private fun startStream(session: Session, messages: List<Message>) {
        _isStreaming.value = true
        _streamError.value = null
        _streamText.value = ""
        _streamReasoning.value = ""
        _streamTools.value = emptyList()

        streamJob = viewModelScope.launch {
            val state = ChatSupport.StreamState()
            val handler = object : Sse.Handler {
                override fun onEvent(event: String, data: String) {
                    ChatSupport.applyFrame(state, event, data)
                    val (t, r, tools) = state.snapshot()
                    _streamText.value = t
                    _streamReasoning.value = r
                    _streamTools.value = tools
                }
                override fun onError(e: Exception) {
                    _streamError.value = e.message ?: "stream failed"
                }
                override fun onDone() {}
            }

            try {
                // Persist the session + user turn first so the stream can join it.
                if (!_incognito.value && _user.value != null) {
                    try { Api.upsertSession(session, messages) } catch (_: Exception) {}
                }

                val history = ChatSupport.buildChatHistory(messages)
                val reqBody = buildJsonObject {
                    put("mode", session.mode)
                    put("temperature", 0.7)
                    put("max_tokens", 4096)
                    put("messages", history)
                    put("reasoning_effort", _effort.value)
                    _selectedModel.value?.let { put("providerId", it) }
                }

                Sse.post("/chat/stream?sessionId=${Api.enc(session.id)}", reqBody, handler)
            } catch (e: Exception) {
                _streamError.value = e.message
            } finally {
                _isStreaming.value = false
                // Commit the assistant message, then persist.
                val (t, r, tools) = state.snapshot()
                val thinkSplit = ChatSupport.extractThink(t)
                val reasoning = (listOfNotNull(r.ifBlank { null }, thinkSplit.reasoning)).joinToString("\n").ifBlank { null }
                val visible = if (thinkSplit.reasoning != null) thinkSplit.visible else t
                if (visible.isNotBlank() || reasoning != null || tools.isNotEmpty() || state.error == null) {
                    val assistant = Message(
                        id = "m_${ChatSupport.uid()}",
                        role = "assistant",
                        rawText = visible,
                        reasoningContent = reasoning,
                        toolCalls = tools.ifEmpty { null },
                        createdAt = now(),
                    )
                    val finalMessages = _activeMessages.value + assistant
                    _activeMessages.value = finalMessages
                    _active.value = _active.value?.copy(messages = finalMessages)
                    if (!_incognito.value && _user.value != null) {
                        try { Api.upsertSession(_active.value ?: session, finalMessages) } catch (_: Exception) {}
                        refreshSessions()
                    }
                }
                _streamText.value = ""
                _streamReasoning.value = ""
                _streamTools.value = emptyList()
            }
        }
    }

    fun stopStreaming() {
        streamJob?.cancel()
        _isStreaming.value = false
        val (t, r, tools) = Triple(_streamText.value, _streamReasoning.value, _streamTools.value)
        if (t.isNotBlank() || tools.isNotEmpty()) {
            val assistant = Message(
                id = "m_${ChatSupport.uid()}",
                role = "assistant",
                rawText = t,
                reasoningContent = r.ifBlank { null },
                toolCalls = tools.ifEmpty { null },
                createdAt = now(),
            )
            _activeMessages.value = _activeMessages.value + assistant
        }
        _streamText.value = ""
        _streamReasoning.value = ""
        _streamTools.value = emptyList()
    }

    /** Re-run the last user turn (regenerate), matching the web retry affordance. */
    fun retryLast() {
        if (_isStreaming.value) return
        val msgs = _activeMessages.value
        val lastUserIdx = msgs.indexOfLast { it.role == "user" }
        if (lastUserIdx < 0) return
        val trimmed = msgs.subList(0, lastUserIdx + 1)
        _activeMessages.value = trimmed
        _active.value = _active.value?.copy(messages = trimmed)
        val session = _active.value ?: return
        startStream(session, trimmed)
    }

    /** Edit a user message and resend from it — drops everything after it. */
    fun editAndResend(messageId: String, newText: String) {
        if (_isStreaming.value) return
        val msgs = _activeMessages.value
        val idx = msgs.indexOfFirst { it.id == messageId }
        if (idx < 0) return
        val kept = msgs.subList(0, idx) + msgs[idx].copy(rawText = newText)
        _activeMessages.value = kept
        _active.value = _active.value?.copy(messages = kept)
        val session = _active.value ?: return
        startStream(session, kept)
    }

    /* ═══════════ Share ═══════════ */

    private fun loadShare() {
        val s = _active.value ?: return
        viewModelScope.launch {
            _shareInfo.value = try { Api.getShare(s.id) } catch (_: Exception) { null }
        }
    }

    fun createShareLink() {
        val s = _active.value ?: return
        viewModelScope.launch {
            try { _shareInfo.value = Api.createShare(s.id) } catch (_: Exception) {}
        }
    }

    fun deleteShareLink() {
        val s = _active.value ?: return
        viewModelScope.launch {
            try { Api.deleteShare(s.id); _shareInfo.value = null } catch (_: Exception) {}
        }
    }

    /* ═══════════ Projects CRUD ═══════════ */

    fun createProject(name: String, desc: String?, color: String?, icon: String?, prompt: String?) {
        viewModelScope.launch {
            try { Api.createProject(name, desc, color, icon, prompt); refreshProjects() } catch (_: Exception) {}
        }
    }
    fun deleteProject(id: String) {
        viewModelScope.launch {
            try { Api.deleteProject(id); refreshProjects() } catch (_: Exception) {}
        }
    }

    /* ═══════════ Scheduled ═══════════ */

    fun createTask(title: String, prompt: String, freq: String, nextRunAt: String?) {
        viewModelScope.launch {
            try { Api.createScheduledTask(title, prompt, freq, _active.value?.id, nextRunAt); refreshTasks() } catch (_: Exception) {}
        }
    }
    fun runTask(id: String) {
        viewModelScope.launch {
            try { Api.runScheduledTask(id); refreshTasks() } catch (_: Exception) {}
        }
    }
    fun deleteTask(id: String) {
        viewModelScope.launch {
            try { Api.deleteScheduledTask(id); refreshTasks() } catch (_: Exception) {}
        }
    }

    /* ═══════════ API keys ═══════════ */

    fun addProvider(label: String?, url: String, model: String, key: String, multimodal: Boolean, onDone: (String?) -> Unit) {
        viewModelScope.launch {
            try {
                Api.createApiKey(label, url, model, key, multimodal)
                refreshProviders()
                onDone(null)
            } catch (e: Exception) { onDone(e.message) }
        }
    }
    fun activateProvider(id: String) {
        viewModelScope.launch {
            try { Api.patchApiKey(id, mapOf("isActive" to true)); refreshProviders() } catch (_: Exception) {}
        }
    }
    fun deleteProvider(id: String) {
        viewModelScope.launch {
            try { Api.deleteApiKey(id); refreshProviders() } catch (_: Exception) {}
        }
    }

    /* ═══════════ Memory ═══════════ */

    fun addMemory(text: String) {
        viewModelScope.launch {
            try { Api.createMemory(text); refreshMemories() } catch (_: Exception) {}
        }
    }
    fun toggleMemory(m: Memory, enabled: Boolean) {
        viewModelScope.launch {
            try { Api.patchMemory(m.id, enabled = enabled); refreshMemories() } catch (_: Exception) {}
        }
    }
    fun deleteMemory(id: String) {
        viewModelScope.launch {
            try { Api.deleteMemory(id); refreshMemories() } catch (_: Exception) {}
        }
    }

    /* ═══════════ Mistakes ═══════════ */

    fun toggleMistake(m: Mistake, resolved: Boolean) {
        viewModelScope.launch {
            try { Api.patchMistake(m.id, resolved); refreshMistakes() } catch (_: Exception) {}
        }
    }
    fun deleteMistake(id: String) {
        viewModelScope.launch {
            try { Api.deleteMistake(id); refreshMistakes() } catch (_: Exception) {}
        }
    }

    /* ═══════════ Profile / prefs ═══════════ */

    fun updateProfile(displayName: String?, instructions: String?) {
        viewModelScope.launch {
            try {
                val u = Api.updateMe(
                    mapOf("displayName" to displayName, "customInstructions" to instructions),
                )
                _user.value = u
            } catch (_: Exception) {}
        }
    }

    fun setThemePref(v: String) {
        _themePref.value = v
        viewModelScope.launch { prefs.setTheme(v) }
    }
    fun setFontScale(v: Float) {
        _fontScale.value = v
        viewModelScope.launch { prefs.setFontScale(v) }
    }
    fun setContentWidth(v: Float) {
        _contentWidth.value = v
        viewModelScope.launch { prefs.setContentWidth(v) }
    }
    fun setShowGrid(v: Boolean) {
        _showGrid.value = v
        viewModelScope.launch { prefs.setShowGrid(v) }
    }
    fun setBgOverride(dark: Boolean, hex: String?) {
        if (dark) _bgOverrideDark.value = hex else _bgOverrideLight.value = hex
        viewModelScope.launch { prefs.setBgOverride(dark, hex) }
    }

    /* ═══════════ Search ═══════════ */

    suspend fun searchServer(query: String): kotlinx.serialization.json.JsonObject? =
        try { Api.search(query) } catch (_: Exception) { null }

    fun searchSessionsLocal(query: String): List<Session> {
        val q = query.trim().lowercase()
        if (q.isEmpty()) return emptyList()
        return _sessions.value.filter {
            (it.title ?: it.topic).lowercase().contains(q) ||
                it.preview.orEmpty().lowercase().contains(q) ||
                it.tags.orEmpty().any { t -> t.lowercase().contains(q) }
        }
    }

    private fun now(): String = java.time.Instant.now().toString()
}
