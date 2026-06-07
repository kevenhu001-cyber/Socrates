package com.socrates.app.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.socrates.app.data.AppContainer
import com.socrates.app.data.repo.AgentStreamEvent
import com.socrates.app.model.AgentRequest
import com.socrates.app.model.ChatDelta
import com.socrates.app.model.ChatMessage
import com.socrates.app.model.ChatRequest
import com.socrates.app.model.KnowledgeNode
import com.socrates.app.model.SessionDetail
import com.socrates.app.model.SessionMessage
import com.socrates.app.model.UpdateSessionRequest
import com.socrates.app.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Single ViewModel for the whole chat surface. Holds the active
 * session, the streamed assistant message, the knowledge graph, the
 * diagnostic/quiz state, and the running agent job. The sidebar
 * observes `activeSessionId` and `knowledge` for its sub-panels.
 */
class ChatViewModel(private val container: AppContainer) : ViewModel() {

    /* ----- State ----- */

    data class UiState(
        val phase: Phase = Phase.TOPIC,
        val topic: String = "",
        val title: String? = null,
        val sessionId: String? = null,
        val messages: List<SessionMessage> = emptyList(),
        val knowledge: List<KnowledgeNode> = emptyList(),
        val mistakes: Int = 0,
        val busy: Boolean = false,
        val streaming: Boolean = false,
        val error: String? = null,
        val tier: String = "diophantus",
        val mode: ChatMode = ChatMode.TUTOR
    )

    enum class Phase { TOPIC, DIAGNOSTIC, EXPLAIN, CHAT }
    enum class ChatMode { TUTOR, CHAT, AGENT }
    data class AgentState(
        val running: Boolean = false,
        val thinking: String = "",
        val text: String = "",
        val steps: List<AgentStep> = emptyList(),
        val error: String? = null
    )
    data class AgentStep(val name: String, val input: JsonObject?, val output: String?, val ok: Boolean = true)

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    private val _agent = MutableStateFlow(AgentState())
    val agent: StateFlow<AgentState> = _agent.asStateFlow()

    private var chatJob: Job? = null
    private var agentJob: Job? = null

    val scope: CoroutineScope get() = viewModelScope

    fun setMode(mode: ChatMode) = _ui.update { it.copy(mode = mode) }
    fun setTopic(value: String) = _ui.update { it.copy(topic = value, error = null) }

    /** Begin a new session for the current topic. */
    fun beginTopic() {
        val topic = _ui.value.topic.trim()
        if (topic.isEmpty()) return
        viewModelScope.launch {
            _ui.update { it.copy(busy = true, error = null) }
            val res = container.sessions.create(
                com.socrates.app.model.CreateSessionRequest(topic = topic, mode = "tutor")
            )
            res.onSuccess { d ->
                _ui.update {
                    it.copy(
                        sessionId = d.id,
                        title = d.title,
                        topic = d.topic ?: topic,
                        messages = d.messages,
                        knowledge = d.knowledge,
                        phase = Phase.EXPLAIN,
                        busy = false
                    )
                }
            }.onFailure { e ->
                _ui.update { it.copy(busy = false, error = e.message) }
            }
        }
    }

    fun loadSession(id: String) {
        if (_ui.value.sessionId == id) return
        viewModelScope.launch {
            _ui.update { it.copy(busy = true, error = null) }
            val r = container.sessions.get(id)
            r.onSuccess { d ->
                _ui.update {
                    it.copy(
                        sessionId = d.id,
                        title = d.title,
                        topic = d.topic ?: "",
                        messages = d.messages,
                        knowledge = d.knowledge,
                        mistakes = d.mistakes.size,
                        phase = if (d.messages.isEmpty()) Phase.EXPLAIN else Phase.CHAT,
                        busy = false
                    )
                }
            }.onFailure { e ->
                _ui.update { it.copy(busy = false, error = e.message) }
            }
        }
    }

    fun resetToTopic() {
        chatJob?.cancel()
        agentJob?.cancel()
        _ui.value = UiState(tier = _ui.value.tier)
    }

    /* ----- Tutor/chat streaming ----- */

    fun send(text: String) {
        val topic = _ui.value.topic
        val sessionId = _ui.value.sessionId
        if (text.isBlank() || sessionId == null) return
        val userMsg = SessionMessage(role = "user", content = text.trim())
        val placeholder = SessionMessage(role = "assistant", content = "")
        val prior = _ui.value.messages
        _ui.update { it.copy(messages = prior + userMsg + placeholder, streaming = true, error = null) }
        val history = (prior + userMsg).map { ChatMessage(it.role, it.content) }

        chatJob?.cancel()
        chatJob = viewModelScope.launch {
            try {
                var acc = ""
                container.chat.streamChat(
                    ChatRequest(
                        messages = history,
                        temperature = 0.5,
                        max_tokens = 1024,
                        sessionId = sessionId,
                        mode = "tutor"
                    )
                ).collect { delta ->
                    val piece = delta.choices.firstOrNull()?.delta?.content
                    if (!piece.isNullOrEmpty()) {
                        acc += piece
                        _ui.update { st ->
                            st.copy(messages = st.messages.dropLast(1) + SessionMessage(role = "assistant", content = acc))
                        }
                    }
                }
                _ui.update { it.copy(streaming = false) }
                persistAfterTurn(acc)
            } catch (e: Exception) {
                Log.w("chat failed", e)
                _ui.update { it.copy(streaming = false, error = e.message ?: "Chat failed") }
            }
        }
    }

    fun stop() {
        chatJob?.cancel()
        agentJob?.cancel()
        _ui.update { it.copy(streaming = false) }
    }

    private suspend fun persistAfterTurn(assistantText: String) {
        val s = _ui.value
        val sid = s.sessionId ?: return
        val messages = s.messages
        container.sessions.save(
            sid,
            UpdateSessionRequest(
                title = s.title ?: s.topic.take(60),
                topic = s.topic,
                messages = messages
            )
        )
    }

    /* ----- Agent ----- */

    fun runAgent(task: String) {
        if (task.isBlank()) return
        _agent.value = AgentState(running = true)
        agentJob = viewModelScope.launch {
            val req = AgentRequest(task = task, sessionId = _ui.value.sessionId)
            val steps = mutableListOf<AgentStep>()
            try {
                container.chat.runAgent(req).collect { ev ->
                    when (ev) {
                        is AgentStreamEvent.Thinking -> _agent.update { it.copy(thinking = it.thinking + ev.delta) }
                        is AgentStreamEvent.Text -> {
                            _agent.update { it.copy(thinking = "", text = it.text + ev.delta) }
                        }
                        is AgentStreamEvent.ToolUse -> {
                            _agent.update { it.copy(thinking = "") }
                            steps.add(AgentStep(name = ev.name, input = ev.input, output = null))
                            _agent.update { it.copy(steps = steps.toList()) }
                        }
                        is AgentStreamEvent.ToolResult -> {
                            val idx = steps.indexOfLast { s -> s.name == ev.name && s.output == null }
                            if (idx >= 0) {
                                steps[idx] = steps[idx].copy(output = ev.output ?: ev.error, ok = ev.ok)
                                _agent.update { it.copy(steps = steps.toList()) }
                            }
                        }
                        is AgentStreamEvent.Done -> _agent.update { it.copy(running = false) }
                        is AgentStreamEvent.Error -> _agent.update { it.copy(running = false, error = ev.message) }
                        AgentStreamEvent.Heartbeat -> { /* no-op */ }
                    }
                }
            } catch (e: Exception) {
                Log.w("agent failed", e)
                _agent.update { it.copy(running = false, error = e.message ?: "Agent failed") }
            }
        }
    }

    fun stopAgent() {
        agentJob?.cancel()
        _agent.update { it.copy(running = false) }
    }

    /* ----- Knowledge ----- */

    fun markNode(id: String?, name: String, status: String) {
        val s = _ui.value
        val existing = s.knowledge.toMutableList()
        val idx = existing.indexOfFirst { it.id == id || it.name == name }
        val node = KnowledgeNode(id = existing.getOrNull(idx)?.id ?: name, name = name, status = status)
        if (idx >= 0) existing[idx] = node else existing.add(node)
        _ui.update { it.copy(knowledge = existing) }
        viewModelScope.launch {
            s.sessionId?.let { sid ->
                container.sessions.save(sid, UpdateSessionRequest(knowledge = existing))
            }
        }
    }

    class Factory(private val container: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = ChatViewModel(container) as T
    }
}
