package com.topodrive.socrates.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * SSE client — port of `mobile/src/data/sse/sseClient.ts`. OkHttp-backed
 * streaming POST with the same frame protocol as the web fetch reader:
 * frames separated by a blank line, `event:` name + `data:` payload lines,
 * terminated by `data: [DONE]`.
 */
object Sse {
    class SseError(message: String, val status: Int = 0) : Exception(message)

    interface Handler {
        fun onEvent(event: String, data: String)
        fun onError(e: Exception)
        fun onDone()
    }

    /**
     * POST `path` with JSON `body` and stream SSE. Blocks the calling
     * coroutine until the stream ends (use `Job.cancel()` to abort —
     * OkHttp's Call is closed on cancellation via try/finally).
     * Handles a single 401 → refresh → retry like the RN client.
     */
    suspend fun post(
        path: String,
        body: JsonObject,
        handler: Handler,
        extraHeaders: Map<String, String> = emptyMap(),
    ) = withContext(Dispatchers.IO) {
        var attempt = 0
        while (true) {
            attempt++
            val tokens = Api.prefs.readTokens()
            val req = Request.Builder()
                .url("${Api.baseUrl}$path")
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .header("Accept", "text/event-stream")
                .header("Cache-Control", "no-cache")
                .apply {
                    if (!tokens.accessToken.isNullOrEmpty()) header("Authorization", "Bearer ${tokens.accessToken}")
                    for ((k, v) in extraHeaders) header(k, v)
                }
                .build()
            val call = Api.streamHttp.newCall(req)
            try {
                call.execute().use { resp ->
                    if (resp.code == 401 && attempt == 1) {
                        if (Api.refreshAccessToken()) return@use else throw SseError("Unauthorized", 401)
                    } else if (!resp.isSuccessful) {
                        throw SseError("HTTP ${resp.code}", resp.code)
                    } else {
                        val src = resp.body?.source() ?: throw SseError("Empty response body", resp.code)
                        val buf = StringBuilder()
                        while (!src.exhausted()) {
                            val line = src.readUtf8Line() ?: break
                            when {
                                line.isEmpty() -> {
                                    // dispatch accumulated frame
                                    dispatch(buf.toString(), handler)
                                    buf.setLength(0)
                                }
                                else -> {
                                    buf.append(line).append('\n')
                                }
                            }
                        }
                        if (buf.isNotEmpty()) dispatch(buf.toString(), handler)
                        handler.onDone()
                        return@withContext
                    }
                }
                if (attempt >= 2) return@withContext
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) { call.cancel(); throw e }
                handler.onError(e)
                return@withContext
            } finally {
                if (call.isExecuted() && !call.isCanceled()) call.cancel()
            }
        }
    }

    /** Dispatch one raw SSE frame (multi-line `data:` is concatenated). */
    private fun dispatch(frame: String, handler: Handler) {
        var event = "message"
        val data = StringBuilder()
        for (raw in frame.split('\n')) {
            val line = raw.trimEnd('\r')
            when {
                line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                line.startsWith("data:") -> {
                    if (data.isNotEmpty()) data.append('\n')
                    data.append(line.removePrefix("data:").trimStart())
                }
            }
        }
        val payload = data.toString()
        if (payload.isEmpty()) return
        handler.onEvent(event, payload)
    }
}
