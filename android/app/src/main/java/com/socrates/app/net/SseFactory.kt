package com.socrates.app.net

import com.socrates.app.data.local.PreferencesStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources

/**
 * Wraps the OkHttp `EventSources` factory into a Flow-based API. We
 * expose two functions:
 *  - [streamChat]  – OpenAI-style `data: {choices:[{delta:{content:...}}]}` lines
 *  - [streamAgent] – multi-event SSE with `event:` + `data:` pairs
 *
 * The factory is the only place in the app that knows how to interpret
 * the wire format. Repositories consume [SseEvent] and never see the
 * raw text.
 */
class SseFactory(private val client: OkHttpClient) {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    /** Cold flow that returns once the SSE channel closes. */
    fun open(url: String, body: String, headers: Map<String, String> = emptyMap()): Flow<SseEvent> =
        callbackFlow {
            val req = Request.Builder()
                .url(url)
                .headers(headers.toHeaders())
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()

            val listener = object : EventSourceListener() {
                override fun onOpen(eventSource: EventSource, response: Response) {
                    trySend(SseEvent.Open(response.code))
                }

                override fun onEvent(
                    eventSource: EventSource,
                    id: String?,
                    type: String?,
                    data: String
                ) {
                    val payload = runCatching { json.parseToJsonElement(data) }.getOrNull()
                    trySend(SseEvent.Message(type ?: "message", data, payload))
                }

                override fun onClosed(eventSource: EventSource) {
                    trySend(SseEvent.Closed)
                    close()
                }

                override fun onFailure(
                    eventSource: EventSource,
                    t: Throwable?,
                    response: Response?
                ) {
                    trySend(SseEvent.Failure(t?.message ?: "stream error", response?.code ?: -1))
                    close(t)
                }
            }

            val source = EventSources.createFactory(client).newEventSource(req, listener)
            awaitClose { source.cancel() }
        }.flowOn(Dispatchers.IO)
}

sealed interface SseEvent {
    data class Open(val code: Int) : SseEvent
    data class Message(val type: String, val raw: String, val payload: JsonElement?) : SseEvent
    data object Closed : SseEvent
    data class Failure(val message: String, val code: Int) : SseEvent
}

private fun Map<String, String>.toHeaders(): okhttp3.Headers {
    val b = okhttp3.Headers.Builder()
    forEach { (k, v) -> b.add(k, v) }
    return b.build()
}

/* Helpers to unwrap the SSE payload. Kept here so repositories don't
   depend on the kotlinx.serialization internals. */

fun SseEvent.Message.dataAsObject(): JsonObject? =
    (payload as? JsonObject)

fun SseEvent.Message.stringField(name: String): String? =
    (payload as? JsonObject)?.get(name)?.jsonPrimitive?.contentOrNull
