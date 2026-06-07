package com.socrates.app.data.repo

import com.socrates.app.data.remote.ApiService
import com.socrates.app.model.AgentDone
import com.socrates.app.model.AgentError
import com.socrates.app.model.AgentRequest
import com.socrates.app.model.AgentText
import com.socrates.app.model.AgentThinking
import com.socrates.app.model.AgentToolResult
import com.socrates.app.model.AgentToolUse
import com.socrates.app.model.ChatMessage
import com.socrates.app.model.ChatRequest
import com.socrates.app.net.SseEvent
import com.socrates.app.net.SseFactory
import com.socrates.app.util.Log
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.Dispatchers

/**
 * Streaming layer. The web app's [SseFactory] collapses the wire
 * format into typed events; this layer turns them into UI-meaningful
 * streams. ViewModels never touch the SSE protocol directly.
 */
class ChatRepository(
    private val api: ApiService,
    private val sse: SseFactory,
) {

    /**
     * Tutor chat. Returns a flow of partial deltas plus a terminal
     * "done"/"error" marker. Cancellation propagates to OkHttp's
     * `EventSource.cancel()` via the producer coroutine.
     */
    fun streamChat(req: ChatRequest): Flow<ChatDelta> = flow {
        sse.open("${com.socrates.app.BuildConfig.BASE_URL}api/chat/stream", json(req)).collect { ev ->
            when (ev) {
                is SseEvent.Message -> {
                    val payload = ev.payload ?: return@collect
                    val choices = payload.asJsonObject["choices"] ?: return@collect
                    val first = choices.asJsonArray.firstOrNull() ?: return@collect
                    val content = first.asJsonObject["delta"]?.asJsonObject?.get("content")?.asString
                    if (content != null) {
                        emit(ChatDelta(listOf(com.socrates.app.model.ChatChoice(
                            delta = com.socrates.app.model.ChatDeltaContent(content = content)
                        ))))
                    }
                }
                is SseEvent.Failure -> {
                    Log.w("chat stream failure: ${ev.message}")
                    throw java.io.IOException(ev.message)
                }
                SseEvent.Closed -> return@collect
                is SseEvent.Open -> { /* nothing */ }
            }
        }
    }.flowOn(Dispatchers.IO)

    /**
     * Agent run. The wire protocol uses named events, so we forward
     * every line to a typed [AgentStreamEvent] before the ViewModel
     * touches it.
     */
    fun runAgent(req: AgentRequest): Flow<AgentStreamEvent> = flow {
        sse.open("${com.socrates.app.BuildConfig.BASE_URL}api/agent/run", json(req)).collect { ev ->
            when (ev) {
                is SseEvent.Message -> emit(mapAgent(ev))
                is SseEvent.Failure -> emit(AgentStreamEvent.Error(ev.message))
                SseEvent.Closed -> return@collect
                is SseEvent.Open -> { /* nothing */ }
            }
        }
    }.flowOn(Dispatchers.IO)

    /** Non-streaming chat — used for cheap short-form calls (title gen, …). */
    suspend fun chatOnce(messages: List<ChatMessage>, maxTokens: Int = 250): Result<ChatMessage> =
        runCatching {
            api.chatNonStream(ChatRequest(messages = messages, max_tokens = maxTokens))
        }

    private fun mapAgent(ev: SseEvent.Message): AgentStreamEvent {
        val data = ev.payload?.toString().orEmpty()
        return when (ev.type) {
            "thinking" -> AgentStreamEvent.Thinking(
                runCatching { json.decodeFromString(AgentThinking.serializer(), data) }
                    .getOrNull()?.delta.orEmpty()
            )
            "text" -> AgentStreamEvent.Text(
                runCatching { json.decodeFromString(AgentText.serializer(), data) }
                    .getOrNull()?.delta.orEmpty()
            )
            "tool_use" -> {
                val parsed = runCatching { json.decodeFromString(AgentToolUse.serializer(), data) }.getOrNull()
                if (parsed != null) AgentStreamEvent.ToolUse(parsed.name, parsed.input)
                else AgentStreamEvent.Error("malformed tool_use")
            }
            "tool_result" -> {
                val parsed = runCatching { json.decodeFromString(AgentToolResult.serializer(), data) }.getOrNull()
                if (parsed != null) AgentStreamEvent.ToolResult(parsed.name, parsed.ok, parsed.output, parsed.error)
                else AgentStreamEvent.Error("malformed tool_result")
            }
            "done" -> {
                val parsed = runCatching { json.decodeFromString(AgentDone.serializer(), data) }.getOrNull()
                AgentStreamEvent.Done(parsed?.steps ?: 0, parsed?.usedTools ?: emptyList(), parsed?.durationMs ?: 0)
            }
            "error" -> {
                val parsed = runCatching { json.decodeFromString(AgentError.serializer(), data) }.getOrNull()
                AgentStreamEvent.Error(parsed?.message ?: "agent error")
            }
            "start", "step" -> AgentStreamEvent.Heartbeat
            else -> AgentStreamEvent.Heartbeat
        }
    }

    private fun json(req: Any): String =
        kotlinx.serialization.json.Json.encodeToString(
            kotlinx.serialization.serializer(req::class.java),
            req
        )
}

sealed interface AgentStreamEvent {
    data class Thinking(val delta: String) : AgentStreamEvent
    data class Text(val delta: String) : AgentStreamEvent
    data class ToolUse(val name: String, val input: kotlinx.serialization.json.JsonObject) : AgentStreamEvent
    data class ToolResult(val name: String, val ok: Boolean, val output: String?, val error: String?) : AgentStreamEvent
    data class Done(val steps: Int, val usedTools: List<String>, val durationMs: Long) : AgentStreamEvent
    data class Error(val message: String) : AgentStreamEvent
    data object Heartbeat : AgentStreamEvent
}
