package com.socrates.android.ui

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.socrates.android.data.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import org.json.JSONObject
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.Instant
import java.util.UUID

private const val MAX_ATTACHMENT = 20 * 1024 * 1024

data class ResourceRow(val id: String, val title: String, val detail: String)
data class ChatUiState(
    val sessions: List<ChatSession> = emptyList(), val current: ChatSession? = null,
    val messages: List<ChatMessage> = emptyList(), val streaming: Boolean = false,
    val busy: Boolean = false, val authBusy: Boolean = false, val loggedIn: Boolean = false,
    val showAuth: Boolean = false, val error: String? = null, val sheetError: String? = null,
    val baseUrl: String = ApiClient.DEFAULT_BASE_URL, val accountName: String = "登录",
    val activity: String = "", val attachments: List<PendingAttachment> = emptyList(),
    val resources: List<ResourceRow> = emptyList(), val resourceLoading: Boolean = false,
    val resourceError: String? = null,
    val reasoningEffort: String = "medium",
    val feedbackRatings: Map<String, String> = emptyMap(),
    val tagsSaving: Boolean = false, val tagsError: String? = null,
    val composerDraft: ComposerDraft = ComposerDraft(),
    val searchJump: SearchJump? = null,
    val searchOpening: Boolean = false,
)

data class SearchJump(val messageId: String, val key: String = UUID.randomUUID().toString())

class ChatViewModel(application: Application) : AndroidViewModel(application) {
    private val preferences = application.getSharedPreferences("socrates_native_settings", 0)
    private val _state = MutableStateFlow(ChatUiState())
    val state = _state.asStateFlow()
    private val api: ApiClient = ApiClient(application, preferences.getString("baseUrl", ApiClient.DEFAULT_BASE_URL) ?: ApiClient.DEFAULT_BASE_URL) {
        turnEpoch++; loadEpoch++; accountEpoch++
        globalSearch.clear()
        transcriptExport.clear()
        voicePreferences.clear()
        _state.update { ChatUiState(baseUrl = it.baseUrl, showAuth = true, error = "登录已过期，请重新登录。") }
    }
    val globalSearch: GlobalSearchController = GlobalSearchController(viewModelScope) { query, scope ->
        withContext(Dispatchers.IO) {
            GlobalSearchRepository { method, path, body -> api.requestResource(method, path, body) }.search(query, scope)
        }
    }
    private val voicePreferencesRepository = VoicePreferencesRepository { method, path, body -> api.requestResource(method, path, body) }
    val voicePreferences = VoicePreferencesController(viewModelScope,
        loadPreference = { withContext(Dispatchers.IO) { voicePreferencesRepository.load() } },
        savePreference = { language -> withContext(Dispatchers.IO) { voicePreferencesRepository.save(language) } },
        onAuthLost = { _state.update { ChatUiState(baseUrl = it.baseUrl, showAuth = true) } })
    val transcriptExport = TranscriptExportController(viewModelScope)
    fun openTranscriptExport() {
        val current = _state.value
        if (current.streaming || current.busy || current.messages.isEmpty()) return
        if (!transcriptExport.open(current.current?.title.orEmpty(), current.messages))
            error("请先完成或取消已有的文件选择，再重新导出。")
    }
    private var turnJob: Job? = null
    private var searchOpenJob: Job? = null
    private var searchOpenEpoch: Long? = null
    @Volatile private var turnEpoch = 0L
    @Volatile private var loadEpoch = 0L
    @Volatile private var stopped = false
    @Volatile private var accountEpoch = 0L
    init {
        _state.update { it.copy(baseUrl = api.baseUrl, loggedIn = api.isLoggedIn) }
        if (api.isLoggedIn) { voicePreferences.load(); refresh() }
    }
    fun error(message: String) { _state.update { it.copy(error = message) } }
    fun clearError() { _state.update { it.copy(error = null) } }
    fun showAuth(show: Boolean) { _state.update { it.copy(showAuth = show, sheetError = null) } }
    fun login(email: String, password: String) {
        if (_state.value.authBusy) return
        _state.update { it.copy(authBusy = true, sheetError = null) }
        viewModelScope.launch {
            try {
                val user = withContext(Dispatchers.IO) { api.login(email, password) }
                _state.update { it.copy(authBusy = false, loggedIn = true, showAuth = false, accountName = user.optString("displayName").takeIf { n -> n.isNotBlank() && n != "null" } ?: email.substringBefore('@')) }
                voicePreferences.clear(); voicePreferences.load()
                refresh()
            } catch (e: Exception) { _state.update { it.copy(authBusy = false, sheetError = e.message ?: "登录失败") } }
        }
    }
    /** Called only after the shared ApiClient has persisted a successful token pair. */
    fun authenticated(user: JSONObject) {
        stop(); turnJob?.cancel(); turnEpoch++; accountEpoch++; loadEpoch++
        globalSearch.clear()
        transcriptExport.clear()
        voicePreferences.clear()
        _state.update { ChatUiState(baseUrl = api.baseUrl, loggedIn = true,
            accountName = user.optString("displayName").takeIf { n -> n.isNotBlank() && n != "null" }
                ?: user.optString("email").substringBefore('@').ifBlank { "我的帐号" }) }
        voicePreferences.load()
        refresh()
    }
    fun setReasoningEffort(value: String) {
        _state.update { it.copy(reasoningEffort = SessionActions.reasoningEffort(value)) }
    }
    fun clearTagsError() { _state.update { it.copy(tagsError = null) } }
    fun saveSessionTags(session: ChatSession, tags: List<String>, onSaved: () -> Unit) {
        val before = _state.value
        if (!before.loggedIn || before.streaming || before.busy || before.tagsSaving) return
        val epoch = accountEpoch
        if (!_state.compareAndSet(before, before.copy(tagsSaving = true, tagsError = null))) return
        viewModelScope.launch {
            try {
                val saved = withContext(Dispatchers.IO) {
                    SessionTagRepository { method, path, body -> api.requestResource(method, path, body) }.save(session.id, tags)
                }
                if (epoch != accountEpoch) return@launch
                // Merge into the latest records, not the editor's stale summary or message snapshot.
                _state.update { ui -> ui.copy(
                    sessions = ui.sessions.map { if (it.id == session.id) SessionHistory.withTags(it, saved) else it },
                    current = ui.current?.let { if (it.id == session.id) SessionHistory.withTags(it, saved) else it },
                    tagsSaving = false, tagsError = null,
                ) }
                onSaved()
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == accountEpoch) _state.update { it.copy(tagsError = e.message ?: "标签保存失败，请重试。") } }
            finally { if (epoch == accountEpoch) _state.update { it.copy(tagsSaving = false) } }
        }
    }
    fun togglePinned(session: ChatSession) {
        if (_state.value.streaming || _state.value.busy || !_state.value.loggedIn) return
        updateSessionAction(session, "pin")
    }
    fun archiveSession(session: ChatSession) {
        if (_state.value.streaming || _state.value.busy || !_state.value.loggedIn) return
        updateSessionAction(session, "archive")
    }
    fun restoreSession(session: ChatSession) {
        if (_state.value.streaming || _state.value.busy || !_state.value.loggedIn) return
        updateSessionAction(session, "restore")
    }
    private fun updateSessionAction(session: ChatSession, action: String) {
        val epoch = accountEpoch
        val before = _state.value
        if (!before.loggedIn || before.streaming || before.busy) return
        if (!_state.compareAndSet(before, before.copy(busy = true))) return
        val latest = before.current?.takeIf { it.id == session.id } ?: before.sessions.firstOrNull { it.id == session.id } ?: session
        val pinned = !SessionActions.isPinned(latest)
        viewModelScope.launch {
            var reload = false
            try {
                val response = withContext(Dispatchers.IO) { when (action) {
                    "pin" -> api.requestResource("PATCH", "sessions/${session.id}", JSONObject().put("pinned", pinned))
                    "archive" -> api.requestResource("POST", "sessions/${session.id}/archive")
                    else -> api.requestResource("DELETE", "sessions/${session.id}/archive")
                } }
                if (epoch != accountEpoch) return@launch
                // Merge the changed field into each newest record, never replace its wire with an old snapshot.
                val archivedAt = (response.opt("archivedAt") as? String) ?: Instant.now().toString()
                fun updated(row: ChatSession): ChatSession = row.copy(wire = when (action) {
                    "pin" -> SessionActions.pinned(row.wire, pinned)
                    "archive" -> SessionActions.archived(row.wire, archivedAt)
                    else -> SessionActions.archived(row.wire, null)
                })
                _state.update { state -> state.copy(
                    current = state.current?.let { if (it.id == session.id) updated(it) else it },
                    sessions = state.sessions.map { if (it.id == session.id) updated(it) else it }) }
                reload = true
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == accountEpoch) _state.update { it.copy(error = e.message ?: "会话操作失败") } }
            finally { if (epoch == accountEpoch) _state.update { it.copy(busy = false) } }
            if (reload && epoch == accountEpoch) refresh()
        }
    }
    fun renameSession(session: ChatSession, title: String) {
        if (title.isBlank() || _state.value.streaming) return
        val epoch = accountEpoch
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { api.requestResource("PATCH", "sessions/${session.id}", JSONObject().put("title", title.trim().take(200))) }
                if (epoch == accountEpoch) _state.update { ui -> ui.copy(sessions = ui.sessions.map { if (it.id == session.id) it.copy(title = title.trim()) else it }, current = ui.current?.let { if (it.id == session.id) it.copy(title = title.trim()) else it }) }
            } catch (e: Exception) { if (epoch == accountEpoch) error(e.message ?: "重命名失败") }
        }
    }
    fun deleteSession(session: ChatSession) {
        if (_state.value.streaming) { error("请先停止回复，再删除会话。"); return }
        val epoch = accountEpoch
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { api.requestResource("DELETE", "sessions/${session.id}") }
                if (epoch == accountEpoch) _state.update { ui -> ui.copy(sessions = ui.sessions.filterNot { it.id == session.id },
                    current = ui.current?.takeUnless { it.id == session.id }, messages = if (ui.current?.id == session.id) emptyList() else ui.messages,
                    composerDraft = if (ui.current?.id == session.id) ComposerDraft() else ui.composerDraft,
                    attachments = if (ui.current?.id == session.id) emptyList() else ui.attachments) }
            } catch (e: Exception) { if (epoch == accountEpoch) error(e.message ?: "删除失败") }
        }
    }
    fun logout() {
        stop(); turnEpoch++; loadEpoch++; accountEpoch++
        globalSearch.clear()
        transcriptExport.clear()
        voicePreferences.clear()
        _state.update { ChatUiState(baseUrl = api.baseUrl, authBusy = true) }
        viewModelScope.launch {
            try { withContext(Dispatchers.IO) { api.logout() } }
            finally { _state.update { it.copy(authBusy = false) } }
        }
    }
    fun configure(url: String, onSaved: () -> Unit) {
        if (_state.value.authBusy) return
        if (_state.value.streaming) { _state.update { it.copy(sheetError = "请先停止当前回复，再切换服务器。") }; return }
        _state.update { it.copy(authBusy = true, sheetError = null) }
        viewModelScope.launch {
            try {
                val changed = url.trimEnd('/') != api.baseUrl
                if (changed) {
                    stop(); turnEpoch++; loadEpoch++; accountEpoch++
                    globalSearch.clear()
                    transcriptExport.clear()
                    voicePreferences.clear()
                    withContext(Dispatchers.IO) {
                        api.baseUrl = url
                        preferences.edit().putString("baseUrl", api.baseUrl).apply()
                    }
                    _state.value = ChatUiState(baseUrl = api.baseUrl)
                } else _state.update { it.copy(authBusy = false) }
                onSaved()
            } catch (e: Exception) { _state.update { it.copy(authBusy = false, sheetError = e.message ?: "地址无效") } }
        }
    }
    fun refresh() {
        if (attachmentLoad?.let(::attachmentScopeValid) == true) return
        if (!api.isLoggedIn) { showAuth(true); return }
        val epoch = ++loadEpoch
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    val user = api.currentUser()
                    if (epoch == loadEpoch) _state.update { it.copy(accountName = user.optString("displayName").takeIf { n -> n.isNotBlank() && n != "null" } ?: user.optString("email").substringBefore('@').ifBlank { "我的帐号" }) }
                    api.listSessions()
                }
                if (epoch == loadEpoch) _state.update { it.copy(sessions = result, busy = false) }
            } catch (e: Exception) { if (epoch == loadEpoch) _state.update { it.copy(busy = false, error = e.message ?: "无法加载会话") } }
        }
    }
    fun newChat() {
        if (_state.value.streaming) { error("请先停止当前回复，再开启新对话。"); return }
        loadEpoch++
        _state.update { ChatWorkspace.open(it) }
    }
    fun startBoundChat(id: String, title: String, assistant: Boolean = false, source: String? = null): Boolean {
        if (_state.value.streaming) { error("请先停止当前回复，再切换工作区。"); return false }
        if (!api.isLoggedIn) { showAuth(true); return false }
        loadEpoch++
        _state.update { ChatWorkspace.bound(it, id, title, assistant, source) }
        return true
    }
    fun selectSession(session: ChatSession) {
        if (_state.value.streaming) { error("请先停止当前回复，再切换对话。"); return }
        val epoch = ++loadEpoch
        _state.update { ChatWorkspace.open(it, session).copy(busy = true) }
        viewModelScope.launch {
            try {
                val full = withContext(Dispatchers.IO) { api.getSession(session.id) }
                if (epoch == loadEpoch) _state.update { it.copy(current = full, messages = full.messages, busy = false) }
            } catch (e: Exception) { if (epoch == loadEpoch) _state.update { it.copy(busy = false, error = e.message ?: "无法打开会话") } }
        }
    }
    fun openSessionById(id: String) {
        if (id.isBlank() || id.length > 128) return
        if (!api.isLoggedIn) { showAuth(true); return }
        selectSession(ChatSession(id = id))
    }
    fun openSearchHit(hit: SearchHit, onOpened: (ChatSession, Boolean) -> Unit, onFailure: (String) -> Unit) {
        val before = _state.value
        if (!before.loggedIn) { showAuth(true); return }
        if (before.streaming || before.busy || before.tagsSaving) { onFailure("请先等待当前操作完成或停止回复，再打开搜索结果。"); return }
        if (!GlobalSearchRepository.validId(hit.sessionId)) return
        val epoch = ++loadEpoch
        val account = accountEpoch
        searchOpenEpoch = epoch
        _state.update { it.copy(busy = true, searchOpening = true) }
        searchOpenJob = viewModelScope.launch {
            try {
                val full = withContext(Dispatchers.IO) { api.getSession(hit.sessionId) }
                if (epoch != loadEpoch || account != accountEpoch) return@launch
                val messageId = SearchNavigation.messageId(full, hit)
                val learning = full.kind == "exam" || full.mode == "tutor"
                // Do not replace the current conversation or draft until the real session loads successfully.
                _state.update { ui -> ChatWorkspace.openSearch(ui, full, messageId, learning) }
                onOpened(full, hit.kind == "message" && (messageId == null || learning))
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == loadEpoch && account == accountEpoch) onFailure(e.message ?: "无法打开会话，请重试。") }
            finally {
                if (epoch == loadEpoch && account == accountEpoch) _state.update { it.copy(busy = false, searchOpening = false) }
                if (searchOpenEpoch == epoch) searchOpenEpoch = null
            }
        }
    }
    fun cancelSearchOpening() {
        if (searchOpenEpoch != null && searchOpenEpoch == loadEpoch) {
            loadEpoch++
            _state.update { it.copy(busy = false, searchOpening = false) }
        }
        searchOpenEpoch = null
        searchOpenJob?.cancel()
    }
    fun send(text: String): Boolean = sendInternal(text)
    private fun sendInternal(text: String, replay: ChatMessage? = null): Boolean {
        val snapshot = _state.value
        if (snapshot.streaming || snapshot.busy || attachmentLoad?.let(::attachmentScopeValid) == true || (text.isBlank() && snapshot.attachments.isEmpty())) return false
        if (!api.isLoggedIn) { showAuth(true); return false }
        if (snapshot.current?.let { it.kind == "exam" } == true) {
            error("测验请使用作答与评分页面，不能作为普通聊天发送。"); return false
        }
        val user = try {
            replay?.copy(content = text.trim()) ?: AttachmentDraft.message(text, snapshot.attachments)
        } catch (e: IllegalArgumentException) { error(e.message ?: "附件无法发送。"); return false }
        var session = (snapshot.current ?: ChatSession(title = text.trim().take(40).ifBlank { snapshot.attachments.firstOrNull()?.name ?: "新对话" }, createdAt = Instant.now().toString())).copy(messages = snapshot.messages + user)
        val assistant = ChatMessage(role = "assistant", content = "")
        val epoch = ++turnEpoch; stopped = false
        val turnStartedAt = android.os.SystemClock.elapsedRealtime()
        _state.update { it.copy(current = session, messages = session.messages + assistant, attachments = if (replay == null) emptyList() else snapshot.attachments, streaming = true, activity = "正在思考") }
        turnJob = viewModelScope.launch {
            var failure: Throwable? = null
            var sessionSaved = false
            val textBuffer = StringBuilder(); val rawTextBuffer = StringBuilder(); val reasoningBuffer = StringBuilder(); val lock = Any()
            val tools = ToolHistory()
            var latestActivity = "正在思考"
            var revision = 0L
            var publishedRevision = -1L
            fun publish() {
                val chunk = synchronized(lock) {
                    if (revision == publishedRevision) null else {
                        publishedRevision = revision
                        Triple(textBuffer.toString(), reasoningBuffer.toString(), tools.snapshot(rawTextBuffer.toString()).put("reasoningDurationMs", (android.os.SystemClock.elapsedRealtime() - turnStartedAt).coerceAtLeast(0)))
                    }
                } ?: return
                val (body, reason, toolWire) = chunk
                if (turnEpoch == epoch) _state.update { ui -> ui.copy(messages = ui.messages.map { if (it.id == assistant.id) it.copy(content = body, reasoning = reason, wire = toolWire) else it }, activity = latestActivity) }
            }
            val ticker = launch { while (isActive) { delay(32); publish() } }
            try {
                withContext(Dispatchers.IO) {
                    val saved = api.saveSession(session)
                    sessionSaved = true
                    session = session.copy(id = saved.id.ifBlank { session.id }, wire = (session.wire?.let { JSONObject(it.toString()) } ?: JSONObject()).apply { saved.wire?.let { wire -> wire.keys().forEach { key -> put(key, wire.get(key)) } } })
                    if (!stopped && turnEpoch == epoch) api.streamChat(session.id, session.messages,
                        onDelta = { synchronized(lock) { textBuffer.append(it); revision++ } },
                        onReasoning = { synchronized(lock) { reasoningBuffer.append(it); revision++ } },
                        onActivity = { event -> synchronized(lock) {
                            tools.accept(event)
                            latestActivity = event.payload.optString("summary").ifBlank { event.payload.optString("message").ifBlank { event.payload.optString("label").ifBlank { event.payload.optString("name").ifBlank { "正在使用工具" } } } }.take(180)
                            revision++
                        } },
                        onRawDelta = { raw -> synchronized(lock) { rawTextBuffer.append(raw); revision++ } },
                        onDone = { failure = it }, context = JSONObject(session.wire?.toString() ?: "{}").put("mode", session.mode).put("reasoning_effort", _state.value.reasoningEffort).apply { if (session.mode == "tutor") put("_systemPrompt", LearningModels.tutorSystemPrompt(session)) })
                }
            } catch (e: Exception) { failure = e }
            finally {
                ticker.cancel(); publish()
                if (turnEpoch == epoch) {
                    var full = session.copy(messages = _state.value.messages.filter { it.content.isNotBlank() || it.role == "user" || (it.wire?.optJSONArray("toolCalls")?.length() ?: 0) > 0 }, updatedAt = Instant.now().toString())
                    if (session.mode == "tutor" && failure == null && !stopped) full = LearningModels.advanceTutorProgress(full, user.content)
                    try { if (sessionSaved) withContext(Dispatchers.IO) { api.saveSession(full) } } catch (e: Exception) { if (failure == null) failure = e }
                    if (turnEpoch == epoch) _state.update { ui -> ui.copy(streaming = false, current = full, messages = full.messages, sessions = listOf(full) + ui.sessions.filterNot { it.id == full.id }, activity = "", error = if (!stopped) failure?.message else null) }
                }
            }
        }
        return true
    }
    /** Persist the server rewind before generating, so stale later turns cannot return on reload. */
    fun editAndReplay(anchor: ChatMessage, revised: String) {
        val ui = _state.value; val session = ui.current ?: return
        if (ui.streaming || ui.busy || revised.isBlank()) return
        if (session.kind == "exam") { error("教学与测验请使用对应学习流程。"); return }
        val index = ui.messages.indexOfFirst { it.id == anchor.id }
        if (index < 0 || anchor.role != "user") return
        val epoch = accountEpoch
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val key = anchor.wire?.optString("clientId")?.takeIf(String::isNotBlank) ?: anchor.id
                    api.requestResourceQuery("PATCH", "messages/$key", mapOf("sessionId" to session.id), JSONObject().put("content", revised.trim()).put("discardFollowing", true))
                }
                if (epoch == accountEpoch) {
                    _state.update { it.copy(busy = false, messages = ui.messages.take(index), current = session.copy(messages = ui.messages.take(index))) }
                    sendInternal(revised, anchor)
                }
            } catch (e: Exception) { if (epoch == accountEpoch) _state.update { it.copy(busy = false, error = e.message ?: "编辑失败；未发起重新生成，请刷新确认会话状态。") } }
        }
    }
    fun regenerate(message: ChatMessage) {
        ChatWire.userAnchor(_state.value.messages, message.id)?.let { editAndReplay(it, it.content) }
    }
    fun branch(message: ChatMessage) {
        val ui = _state.value; val current = ui.current ?: return
        if (ui.streaming || ui.busy) return
        val epoch = accountEpoch
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            try {
                val branch = ChatWire.branch(current.copy(messages = ui.messages), message.id)
                val saved = withContext(Dispatchers.IO) { api.saveSession(branch) }
                val adopted = branch.copy(id = saved.id, wire = saved.wire)
                if (epoch == accountEpoch) _state.update { ChatWorkspace.open(it, adopted).copy(sessions = listOf(adopted) + it.sessions) }
            } catch (e: Exception) { if (epoch == accountEpoch) _state.update { it.copy(busy = false, error = e.message ?: "创建分支失败") } }
        }
    }
    fun feedback(message: ChatMessage, rating: String) {
        if (rating !in setOf("up", "down", "none")) return
        val epoch = accountEpoch
        val before = _state.value
        val session = before.current ?: return
        if (!before.loggedIn || before.streaming || before.busy || before.messages.none { it.id == message.id }) return
        if (!_state.compareAndSet(before, before.copy(busy = true))) return
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val key = message.wire?.optString("clientId")?.takeIf(String::isNotBlank) ?: message.id
                    api.requestResourceQuery("PUT", "messages/$key/feedback", mapOf("sessionId" to session.id), JSONObject().put("rating", rating))
                }
                if (epoch == accountEpoch) _state.update { it.copy(
                    feedbackRatings = it.feedbackRatings + ("${session.id}:${message.id}" to rating), error = "反馈已保存。") }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == accountEpoch) _state.update { it.copy(error = e.message ?: "反馈失败") } }
            finally { if (epoch == accountEpoch) _state.update { it.copy(busy = false) } }
        }
    }
    fun stop() { stopped = true; api.cancelStream() }
    @Volatile private var attachmentLoad: AttachmentLoadScope? = null
    // Kept only in this ViewModel: a process-recreated picker must not import into a new account/draft.
    private val attachmentPicker = AttachmentPickerGate()
    fun beginAttachmentPicker(): String? {
        val ui = _state.value
        if (!ui.loggedIn || !api.isLoggedIn) { showAuth(true); return null }
        if (ui.busy || ui.streaming || attachmentLoad?.let(::attachmentScopeValid) == true) {
            error("请先等待当前操作完成，再添加附件。"); return null
        }
        if (ui.attachments.size >= AttachmentDraft.MAX_COUNT) {
            error("每条消息最多添加 ${AttachmentDraft.MAX_COUNT} 个附件。"); return null
        }
        return attachmentPicker.begin(accountEpoch, ui.composerDraft.key)
    }
    fun cancelAttachmentPicker(ticket: String?) {
        attachmentPicker.cancel(ticket)
    }
    fun attachPicked(uris: List<Uri>, ticket: String) {
        val picker = attachmentPicker.consume(ticket, accountEpoch, _state.value.composerDraft.key) ?: return
        if (uris.isEmpty()) return
        val selected = try { AttachmentBatch.selection(uris, _state.value.attachments.size) }
        catch (e: IllegalArgumentException) { error(e.message ?: "所选附件超过剩余名额。"); return }
        val scope = beginAttachment(picker.draftKey) ?: return
        val existing = _state.value.attachments
        viewModelScope.launch {
            try {
                val attachments = withContext(Dispatchers.IO) {
                    AttachmentBatch.load(selected, existing, { requireAttachmentScope(scope) }) { uri, staged ->
                        readDeviceAttachment(uri, scope, staged)
                    }
                }
                if (!attachmentScopeValid(scope)) return@launch
                _state.update { ui ->
                    if (!scope.matches(accountEpoch, ui.composerDraft.key, attachmentLoad)) ui
                    else ui.copy(attachments = attachments, busy = false)
                }
                attachmentLoad = null
            } catch (e: Exception) {
                failAttachment(scope, if (e is CancellationException) e else
                    IllegalArgumentException("本次所选附件未加入草稿，原有附件保留。${e.message ?: "附件处理失败"}。已上传的文件可能仍在资料库中。", e))
                if (e is CancellationException) throw e
            }
        }
    }
    private fun attachmentScopeValid(scope: AttachmentLoadScope): Boolean =
        scope.matches(accountEpoch, _state.value.composerDraft.key, attachmentLoad)
    private fun requireAttachmentScope(scope: AttachmentLoadScope) {
        if (!attachmentScopeValid(scope)) throw CancellationException("Attachment draft scope changed")
    }
    private fun beginAttachment(draftKey: String): AttachmentLoadScope? {
        val before = _state.value
        if (draftKey != before.composerDraft.key) return null // Deliberately ignore a picker from an old chat/account.
        if (before.busy || before.streaming || attachmentLoad?.let(::attachmentScopeValid) == true) {
            error("当前操作尚未完成，未添加所选附件。请完成后重新选择。"); return null
        }
        if (!api.isLoggedIn) { showAuth(true); return null }
        if (before.attachments.size >= AttachmentDraft.MAX_COUNT) { error("每条消息最多添加 ${AttachmentDraft.MAX_COUNT} 个附件。"); return null }
        val scope = AttachmentLoadScope(accountEpoch, draftKey)
        if (!_state.compareAndSet(before, before.copy(busy = true))) return null
        attachmentLoad = scope
        return scope
    }
    private fun finishAttachment(scope: AttachmentLoadScope, attachment: PendingAttachment) {
        if (!attachmentScopeValid(scope)) return
        _state.update { ui ->
            if (!scope.matches(accountEpoch, ui.composerDraft.key, attachmentLoad)) return@update ui
            try { ui.copy(attachments = AttachmentDraft.append(ui.attachments, attachment), busy = false) }
            catch (e: IllegalArgumentException) { ui.copy(busy = false, error = e.message) }
        }
        attachmentLoad = null
    }
    private fun failAttachment(scope: AttachmentLoadScope, error: Exception) {
        if (!attachmentScopeValid(scope)) return
        _state.update { ui ->
            if (!scope.matches(accountEpoch, ui.composerDraft.key, attachmentLoad)) ui
            else ui.copy(busy = false, error = if (error is CancellationException) null else error.message ?: "附件处理失败")
        }
        attachmentLoad = null
    }
    fun removeAttachment(key: String) {
        _state.update { if (it.busy || it.streaming || attachmentLoad?.let(::attachmentScopeValid) == true) it else it.copy(attachments = AttachmentDraft.remove(it.attachments, key)) }
    }
    fun moveAttachment(draftKey: String, key: String, step: Int) {
        _state.update { ui ->
            if (ui.composerDraft.key != draftKey || ui.busy || ui.streaming || attachmentLoad?.let(::attachmentScopeValid) == true) ui
            else ui.copy(attachments = AttachmentDraft.move(ui.attachments, key, step))
        }
    }
    /** Returns a local validation error; never performs a file write or network request. */
    fun editAttachmentText(draftKey: String, key: String, originalText: String, text: String): String? {
        while (true) {
            val ui = _state.value
            if (ui.composerDraft.key != draftKey) return "聊天已切换，未应用本次修改。"
            if (ui.busy || ui.streaming || attachmentLoad?.let(::attachmentScopeValid) == true) return "当前操作尚未完成，未应用本次修改。"
            val attachment = ui.attachments.firstOrNull { it.key == key } ?: return "该附件已不在当前草稿中。"
            if (attachment.text != originalText) return "附件文字已改变，请重新打开后编辑。"
            val edited = try { AttachmentDraft.editText(ui.attachments, key, text) }
            catch (e: IllegalArgumentException) { return e.message ?: "无法应用文字修改。" }
            if (_state.compareAndSet(ui, ui.copy(attachments = edited))) return null
        }
    }
    fun useLibraryFile(id: String, name: String, mime: String) {
        if (!GlobalSearchRepository.validId(id)) { error("无效的文件 ID。"); return }
        val scope = beginAttachment(_state.value.composerDraft.key) ?: return
        viewModelScope.launch {
            try {
                val attachment = withContext(Dispatchers.IO) {
                    requireAttachmentScope(scope)
                    val file = api.requestResource("GET", "files/$id")
                    requireAttachmentScope(scope)
                    val actualMime = file.optString("mimeType").ifBlank { mime }
                    val actualName = file.optString("name").ifBlank { name }
                    if (actualMime.startsWith("image/")) {
                        val bytes = api.downloadFile(id)
                        requireAttachmentScope(scope)
                        require(bytes.isNotEmpty()) { "图片内容为空" }
                        AttachmentImage.dataUrl(bytes).let { data -> PendingAttachment(actualName, imageDataUrl = data, wire = ChatWire.attachment(actualName, actualMime, bytes.size.toLong(), id, dataUrl = data)) }
                    } else {
                        val result = api.requestResource("GET", "files/$id/content")
                        requireAttachmentScope(scope)
                        val text = result.optString("text").take(100_000)
                        require(text.isNotBlank()) { "该文件没有可读取的文本，暂不能用于对话。" }
                        PendingAttachment(actualName, text = text, wire = ChatWire.attachment(actualName, actualMime, file.optLong("size"), id, text))
                    }
                }
                finishAttachment(scope, attachment)
            } catch (e: Exception) { failAttachment(scope, e); if (e is CancellationException) throw e }
        }
    }
    /** Same per-file path for camera, photos and documents; the batch retains one busy/scope lease. */
    private fun readDeviceAttachment(uri: Uri, scope: AttachmentLoadScope, staged: List<PendingAttachment>): PendingAttachment {
        requireAttachmentScope(scope)
        val resolver = getApplication<Application>().contentResolver
        var name = "attachment"
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                name = cursor.getString(0) ?: name
                if (!cursor.isNull(1)) require(cursor.getLong(1) <= MAX_ATTACHMENT) { "附件不能超过 20 MB" }
            }
        }
        val bytes = resolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            var total = 0
            while (true) {
                requireAttachmentScope(scope)
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                require(total <= MAX_ATTACHMENT) { "附件不能超过 20 MB" }
                output.write(buffer, 0, read)
            }
            output.toByteArray()
        } ?: throw java.io.IOException("无法读取文件")
        require(bytes.size <= MAX_ATTACHMENT) { "附件不能超过 20 MB" }
        val mime = resolver.getType(uri) ?: "application/octet-stream"
        val directory = File(getApplication<Application>().cacheDir, "uploads").apply { mkdirs() }
        val local = File(directory, "${System.nanoTime()}-${name.replace(Regex("[^\\p{L}\\p{N}._-]"), "_").take(100)}")
        return try {
            local.writeBytes(bytes)
            if (mime.startsWith("image/")) {
                require(bytes.size <= 8 * 1024 * 1024) { "图片不能超过 8 MB" }
                requireAttachmentScope(scope)
                val dataUrl = AttachmentImage.dataUrl(bytes)
                AttachmentDraft.append(staged, PendingAttachment(name, imageDataUrl = dataUrl))
                requireAttachmentScope(scope)
                val uploaded = api.uploadFile(local, mimeType = mime)
                requireAttachmentScope(scope)
                PendingAttachment(name, imageDataUrl = dataUrl, wire = ChatWire.attachment(name, mime, bytes.size.toLong(), uploaded.id, dataUrl = dataUrl))
            } else {
                requireAttachmentScope(scope)
                val extracted = api.extractFile(local, mime)
                requireAttachmentScope(scope)
                require(extracted.optBoolean("ok", true)) { extracted.optString("error", "文件解析失败") }
                val text = extracted.optString("text").take(100_000)
                require(text.isNotBlank()) { "该文件没有可提取的文本，请尝试其他格式。" }
                AttachmentDraft.append(staged, PendingAttachment(name, text = text))
                requireAttachmentScope(scope)
                val uploaded = api.uploadFile(local, mimeType = mime)
                requireAttachmentScope(scope)
                PendingAttachment(name, text = text, wire = ChatWire.attachment(name, mime, bytes.size.toLong(), uploaded.id, text))
            }
        } finally { local.delete() }
    }
    fun loadResource(path: String, key: String) {
        if (!api.isLoggedIn) { showAuth(true); return }
        _state.update { it.copy(resources = emptyList(), resourceLoading = true, resourceError = null) }
        viewModelScope.launch {
            try {
                val rows = withContext(Dispatchers.IO) {
                    val root = api.readResource(path.trimStart('/')); val array = root.optJSONArray(key)
                    (0 until (array?.length() ?: 0)).mapNotNull { index -> array?.optJSONObject(index)?.let { item ->
                        ResourceRow(item.optString("id"), item.optString("title").ifBlank { item.optString("name").ifBlank { item.optString("displayName", "未命名") } }, item.optString("description").ifBlank { item.optString("mimeType").ifBlank { item.optString("status") } })
                    } }
                }
                _state.update { it.copy(resources = rows, resourceLoading = false) }
            } catch (e: Exception) { _state.update { it.copy(resourceLoading = false, resourceError = e.message ?: "无法读取目录") } }
        }
    }
    override fun onCleared() { attachmentPicker.clear(); attachmentLoad = null; api.cancelStream(); super.onCleared() }
}
