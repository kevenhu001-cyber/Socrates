package com.socrates.android.data

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import com.socrates.android.BuildConfig
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okio.BufferedSource
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.URLEncoder
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

data class ChatMessage(
    val id: String = UUID.randomUUID().toString(), val role: String, val content: String,
    val reasoning: String = "", val createdAt: String? = null,
    val imageDataUrl: String? = null, val attachmentName: String? = null,
    val wire: JSONObject? = null,
)
data class ChatSession(
    val id: String = UUID.randomUUID().toString(), val title: String = "", val topic: String = "",
    val mode: String = "chat", val phase: String = "chat", val kind: String = "chat",
    val messages: List<ChatMessage> = emptyList(), val createdAt: String? = null, val updatedAt: String? = null,
    val wire: JSONObject? = null,
)
data class SessionPage(val sessions: List<ChatSession>, val nextCursor: String?)
data class UploadedFile(val id: String, val name: String, val mimeType: String, val size: Long)
data class ChatActivity(val event: String, val payload: JSONObject)
class ApiException(val statusCode: Int, message: String, val responseBody: String? = null) : IOException(message)
class ChatStream internal constructor(private val cancelAction: () -> Unit) {
    private val cancelled = AtomicBoolean(false)
    fun cancel() { if (cancelled.compareAndSet(false, true)) cancelAction() }
    val isCancelled: Boolean get() = cancelled.get()
}

/** Incremental SSE event decoder; feed complete lines (without CR/LF), then call finish(). */
internal class SseDecoder(
    private val onDelta: (String) -> Unit,
    private val onReasoning: (String) -> Unit,
    private val onActivity: (ChatActivity) -> Unit,
    private val onRawDelta: (String) -> Unit = {},
) {
    private var event = "message"
    private val data = StringBuilder()
    var done: Boolean = false
        private set
    private val inlineThink = InlineThinkScanner(onDelta, onReasoning)

    fun acceptLine(rawLine: String) {
        if (done) return
        val line = rawLine.removeSuffix("\r")
        if (line.isEmpty()) { dispatch(); return }
        if (line.startsWith(":")) return
        val colon = line.indexOf(':')
        val field = if (colon < 0) line else line.substring(0, colon)
        val value = if (colon < 0) "" else line.substring(colon + 1).removePrefix(" ")
        when (field) {
            "event" -> event = value
            "data" -> data.append(value).append('\n')
        }
    }
    fun finish() { if (!done && data.isNotEmpty()) dispatch(); inlineThink.finish() }
    private fun dispatch() {
        val raw = data.toString().removeSuffix("\n")
        val current = event
        event = "message"; data.setLength(0)
        if (raw == "[DONE]") { inlineThink.finish(); done = true; return }
        if (raw.isEmpty()) return
        if (current == "error") throw IOException(errorMessage(raw))
        if (current != "message") {
            val rows = runCatching { JSONArray(raw) }.getOrNull()
            if (rows != null) {
                for (index in 0 until rows.length()) rows.optJSONObject(index)?.let { onActivity(ChatActivity(current, it)) }
                return
            }
        }
        val json = try { JSONObject(raw) } catch (_: Exception) { null }
        if (json == null) {
            if (current == "message") emitContent(raw) else onActivity(ChatActivity(current, JSONObject().put("data", raw)))
            return
        }
        if (current != "message") { onActivity(ChatActivity(current, json)); return }
        if (json.has("error") && !json.isNull("error")) throw IOException(errorMessage(raw))
        if (json.opt("delta") is String) { emitContent(json.getString("delta")); return }
        val choices = json.optJSONArray("choices")
        val delta = choices?.optJSONObject(0)?.optJSONObject("delta") ?: json.optJSONObject("delta")
        if (delta != null) {
            delta.optString("content").takeIf(String::isNotEmpty)?.let(::emitContent)
            listOf("reasoning_content", "reasoning", "thinking").forEach { key -> emitText(delta.opt(key), onReasoning) }
            return
        }
        // Non-chat structured server events are surfaced as activities.
        onActivity(ChatActivity("message", json))
    }
    private fun emitContent(raw: String) {
        if (raw.isEmpty()) return
        onRawDelta(raw)
        inlineThink.push(raw)
    }
    private fun errorMessage(raw: String): String {
        val obj = try { JSONObject(raw) } catch (_: Exception) { null }
        return obj?.optString("message")?.takeIf { it.isNotBlank() }
            ?: obj?.optString("error")?.takeIf { it.isNotBlank() } ?: raw
    }
    private fun emitText(value: Any?, sink: (String) -> Unit) {
        when (value) {
            is String -> if (value.isNotEmpty()) sink(value)
            is JSONObject -> value.optString("text").takeIf(String::isNotEmpty)?.let(sink)
            is JSONArray -> for (i in 0 until value.length()) emitText(value.opt(i), sink)
        }
    }
}

/** Native synchronous data client. Network methods run on caller's thread; use Dispatchers.IO. */
class ApiClient(context: Context, initialBaseUrl: String = DEFAULT_BASE_URL, private val onAuthLost: (() -> Unit)? = null) {
    companion object {
        const val DEFAULT_BASE_URL = "https://app.topodrive.top/api/v2"
        private const val PREFS_NAME = "socrates_api_session"
        private val TOKEN_REFRESH_LOCK = Any()
        @Volatile private var authGeneration: Long = 0
        private const val TOKEN_KEY = "mobile_token_pair"
        private const val BASE_URL_KEY = "base_url"
    }
    private val appContext = context.applicationContext
    private val prefs: SharedPreferences by lazy {
        val key = MasterKey.Builder(appContext).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(appContext, PREFS_NAME, key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    }
    private val streamHttp = OkHttpClient.Builder().connectTimeout(30, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).writeTimeout(60, TimeUnit.SECONDS).build()
    private val http = streamHttp.newBuilder().readTimeout(30, TimeUnit.SECONDS).build()
    @Volatile private var activeStream: okhttp3.Call? = null
    @Volatile var baseUrl: String = validateBaseUrl(prefs.getString(BASE_URL_KEY, initialBaseUrl) ?: initialBaseUrl)
        set(value) {
            val valid = validateBaseUrl(value)
            if (valid != field) synchronized(this) {
                if (valid != field) { authGeneration++; activeStream?.cancel(); activeStream = null; prefs.edit().remove(TOKEN_KEY).putString(BASE_URL_KEY, valid).apply(); field = valid }
            }
        }
    val isLoggedIn: Boolean get() = try { tokens().optString("accessToken").isNotBlank() } catch (_: Exception) { false }
    @Synchronized private fun tokens(): JSONObject = try {
        if (prefs.getString(BASE_URL_KEY, baseUrl) != baseUrl) JSONObject()
        else JSONObject(prefs.getString(TOKEN_KEY, "{}") ?: "{}").let { pair ->
            if (pair.has("_server") && pair.optString("_server") != baseUrl) JSONObject() else pair
        }
    } catch (_: Exception) { JSONObject() }
    private fun saveTokens(json: JSONObject) {
        if (prefs.getString(BASE_URL_KEY, baseUrl) != baseUrl) throw ApiException(409, "连接已改变，请重新登录。")
        prefs.edit().putString(TOKEN_KEY, JSONObject(json.toString()).put("_server", baseUrl).toString()).apply()
    }
    private fun clearTokens() { prefs.edit().remove(TOKEN_KEY).apply() }
    private fun requireTokens(json: JSONObject) {
        if (json.optString("accessToken").isBlank() || json.optString("refreshToken").isBlank()) throw ApiException(502, "服务器返回的登录凭据不完整。")
    }

    private fun validateBaseUrl(input: String): String {
        val normalized = input.trim().trimEnd('/')
        val uri = Uri.parse(normalized)
        val loopback = uri.host?.lowercase() in setOf("localhost", "127.0.0.1", "::1", "10.0.2.2")
        require(uri.userInfo == null && uri.query == null && uri.fragment == null) { "API 地址不能包含帐号、查询参数或片段。" }
        require(uri.host != null && (uri.scheme == "https" || (BuildConfig.DEBUG && uri.scheme == "http" && loopback))) {
            "Backend URL must use HTTPS (debug HTTP is allowed only for loopback)."
        }
        return normalized
    }

    /** Browser handoff is deliberately pinned to production, independent of the configurable API base URL. */
    fun exchangeBrowserLogin(code: String, verifier: String): JSONObject {
        val generation = authGeneration
        val expectedBase = synchronized(this) { baseUrl.also { if (!BrowserLoginHandoff.productionBase(it)) throw ApiException(400, "浏览器登录仅支持生产服务器；自定义服务器帐号保持不变。") } }
        require(code.matches(Regex("[0-9a-f]{64}")) && verifier.matches(Regex("[A-Za-z0-9_-]{43,128}"))) { "浏览器登录回调无效。" }
        val request = Request.Builder().url("https://app.topodrive.top/api/v2/auth/mobile/browser/exchange")
            .post(JSONObject().put("code", code).put("codeVerifier", verifier).toString().toRequestBody(JSON_MEDIA))
            .header("Content-Type", "application/json").build()
        val exchangeHttp = http.newBuilder().followRedirects(false).followSslRedirects(false).build()
        val result = exchangeHttp.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw ApiException(response.code, "浏览器登录交换失败。")
            JSONObject(body)
        }
        synchronized(this) { if (generation != authGeneration || baseUrl != expectedBase || !BrowserLoginHandoff.productionBase(baseUrl)) throw ApiException(409, "服务器连接或登录状态已改变，请重新开始登录。"); requireTokens(result); saveTokens(result) }
        return result.optJSONObject("user") ?: currentUser()
    }

    fun login(email: String, password: String): JSONObject {
        val generation = authGeneration
        val result = jsonRequest("POST", "/auth/mobile/login", JSONObject().put("email", email).put("password", password), authenticated = false)
        synchronized(this) {
            if (generation != authGeneration) throw ApiException(409, "连接或登录状态已改变，请重试。")
            requireTokens(result); saveTokens(result)
        }
        return result.optJSONObject("user") ?: JSONObject()
    }
    fun loginWithCode(email: String, code: String): JSONObject {
        val generation = authGeneration
        val result = jsonRequest("POST", "/auth/mobile/login-with-code", JSONObject().put("email", email).put("code", code), authenticated = false)
        synchronized(this) {
            if (generation != authGeneration) throw ApiException(409, "连接或登录状态已改变，请重试。")
            requireTokens(result); saveTokens(result)
        }
        return result.optJSONObject("user") ?: JSONObject()
    }
    fun sendLoginCode(email: String): JSONObject = jsonRequest("POST", "/auth/send-code", JSONObject().put("email", email), authenticated = false)
    fun currentUser(): JSONObject = jsonRequest("GET", "/auth/me").optJSONObject("user") ?: JSONObject()
    fun logout() {
        val captured = synchronized(this) {
            val base = baseUrl; val refresh = tokens().optString("refreshToken")
            authGeneration++; activeStream?.cancel(); activeStream = null; clearTokens()
            base to refresh
        }
        if (captured.second.isNotBlank()) try {
            val body = JSONObject().put("refreshToken", captured.second).toString().toRequestBody(JSON_MEDIA)
            val request = Request.Builder().url(captured.first + "/auth/mobile/logout").post(body).header("Content-Type", "application/json").build()
            http.newCall(request).execute().close()
        } catch (_: IOException) { /* local logout already completed */ }
    }
    /** Immediately clears local credentials and closes any active stream without making a network request. */
    @Synchronized fun invalidateSession() { authGeneration++; activeStream?.cancel(); activeStream = null; clearTokens(); onAuthLost?.invoke() }

    fun listSessions(includeArchived: Boolean = true): List<ChatSession> {
        val output = mutableListOf<ChatSession>(); var cursor: String? = null; val seen = mutableSetOf<String>()
        do {
            val suffix = "?limit=50" + (if (includeArchived) "&archived=true" else "") + (cursor?.let { "&cursor=${encode(it)}" } ?: "")
            val page = jsonRequest("GET", "/sessions$suffix"); val rows = page.optJSONArray("sessions") ?: JSONArray()
            for (i in 0 until rows.length()) output += parseSession(rows.optJSONObject(i) ?: JSONObject())
            cursor = page.optString("nextCursor").takeIf { it.isNotBlank() && it != "null" }
            if (cursor != null && !seen.add(cursor)) throw IOException("Session pagination cursor did not advance")
        } while (cursor != null)
        return output
    }
    fun listSessionPage(cursor: String? = null): SessionPage {
        val suffix = "?limit=50" + (cursor?.let { "&cursor=${encode(it)}" } ?: "")
        val json = jsonRequest("GET", "/sessions$suffix"); val rows = json.optJSONArray("sessions") ?: JSONArray()
        return SessionPage((0 until rows.length()).map { parseSession(rows.optJSONObject(it) ?: JSONObject()) }, json.optString("nextCursor").takeIf { it.isNotBlank() && it != "null" })
    }
    fun getSession(id: String): ChatSession = parseSession(jsonRequest("GET", "/sessions/${encodePath(id)}"))
    fun saveSession(session: ChatSession): ChatSession {
        val messages = JSONArray()
        session.messages.forEach { messages.put(ChatWire.message(it)) }
        val body = session.wire?.let { JSONObject(it.toString()) } ?: JSONObject()
        body.put("id", session.id).put("title", session.title).put("topic", session.topic).put("mode", session.mode).put("phase", session.phase).put("kind", session.kind).put("messages", messages)
        session.createdAt?.let { body.put("createdAt", it) }; session.updatedAt?.let { body.put("updatedAt", it) }
        // The server intentionally returns a scalar summary, not messages/examData/teachingPlan.
        val summary = jsonRequest("POST", "/sessions", body)
        summary.keys().forEach { key -> body.put(key, summary.opt(key)) }
        return parseSession(body)
    }

    fun streamChat(sessionId: String, messages: List<ChatMessage>, onDelta: (String) -> Unit, onReasoning: (String) -> Unit = {}, onActivity: (ChatActivity) -> Unit = {}, onDone: (Throwable?) -> Unit = {}, context: JSONObject? = null, onRawDelta: (String) -> Unit = {}): ChatStream {
        val wireMessages = JSONArray()
        context?.optString("_systemPrompt")?.takeIf { it.isNotBlank() }?.let {
            wireMessages.put(JSONObject().put("role", "system").put("content", it))
        }
        messages.takeLast(60).forEach { original ->
            val attachmentWire = original.wire?.let { JSONObject(it.toString()) }
            val attachments = attachmentWire?.optJSONArray("attachments")
            if (attachments != null) for (index in 0 until attachments.length()) {
                val attachment = attachments.optJSONObject(index) ?: continue
                val fileId = attachment.optString("fileId")
                if (attachment.optString("kind") == "image" && attachment.optString("dataUrl").isBlank() && fileId.isNotBlank()) {
                    attachment.put("dataUrl", AttachmentImage.dataUrl(downloadFile(fileId)))
                }
            }
            val msg = original.copy(wire = attachmentWire)
            if (msg.role in setOf("user", "assistant", "system")) wireMessages.put(JSONObject().put("role", msg.role).put("content", ChatWire.content(msg)).apply {
                if (msg.reasoning.isNotBlank()) put("reasoning_content", msg.reasoning)
            })
        }
        val payload = JSONObject().put("sessionId", sessionId).put("mode", if (context?.optString("mode") == "tutor") "tutor" else "chat").put("messages", wireMessages).apply {
            SessionActions.addReasoningEffort(this, context?.optString("reasoning_effort")?.takeIf { it.isNotBlank() })
            listOf("projectId", "assistantId").forEach { key -> (context?.opt(key) as? String)?.takeIf { it.isNotBlank() }?.let { put(key, it) } }
        }
        val request = authorizedRequest("POST", "/chat/stream?sessionId=${encode(sessionId)}", payload.toString().toRequestBody(JSON_MEDIA)).header("Accept", "text/event-stream").build()
        val handle = ChatStream { activeStream?.cancel() }
        var failure: Throwable? = null
        try {
            var call = streamHttp.newCall(request); activeStream = call
            var response = call.execute()
            if (response.code == 401 && !isAuthEndpoint(request)) {
                response.close()
                if (!refreshTokens(request.header("Authorization")?.removePrefix("Bearer "))) throw ApiException(401, "Session expired")
                call = streamHttp.newCall(request.newBuilder().header("Authorization", "Bearer ${tokens().optString("accessToken")}").build()); activeStream = call
                response = call.execute()
            }
            response.use {
                if (it.code == 401 && !isAuthEndpoint(request)) { invalidateSession(); throw ApiException(401, "Session expired") }
                if (!it.isSuccessful) throw apiException(it.code, it.body?.string().orEmpty())
                val source = it.body?.source() ?: throw IOException("Empty SSE response")
                consumeSse(source, onDelta, onReasoning, onActivity, onRawDelta)
            }
        } catch (error: Throwable) { if (!handle.isCancelled) failure = error }
        finally { activeStream = null; onDone(failure) }
        return handle
    }
    fun cancelStream() { activeStream?.cancel() }
    /** Diagnostic questions are local-only in the shared contract; scope encrypted drafts by server and verified account. */
    private fun learningDraftKey(owner: String, sessionId: String): String {
        require(owner.isNotBlank() && sessionId.isNotBlank())
        val digest = java.security.MessageDigest.getInstance("SHA-256").digest("$baseUrl|$owner|$sessionId".toByteArray())
        return "learning-draft:" + digest.joinToString("") { "%02x".format(it) }
    }
    fun saveLearningDraft(owner: String, sessionId: String, data: JSONObject) {
        prefs.edit().putString(learningDraftKey(owner, sessionId), data.toString()).apply()
    }
    fun readLearningDraft(owner: String, sessionId: String): JSONObject? =
        prefs.getString(learningDraftKey(owner, sessionId), null)?.let { runCatching { JSONObject(it) }.getOrNull() }

    /** Read an owned image without exposing tokens in URLs or loading an unbounded response. */
    fun downloadFile(id: String, maxBytes: Int = 8 * 1024 * 1024): ByteArray {
        require(id.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "无效的文件 ID" }
        require(maxBytes in 1..(20 * 1024 * 1024))
        return execute(authorizedRequest("GET", "/files/$id/raw").build()).use { response ->
            if (!response.isSuccessful) throw apiException(response.code, response.body?.string().orEmpty())
            val body = response.body ?: throw IOException("文件内容为空")
            require(body.contentLength() <= maxBytes) { "图片不能超过 8 MB" }
            body.byteStream().use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    require(output.size() + count <= maxBytes) { "图片不能超过 8 MB" }
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
        }
    }
    fun uploadFile(file: File, sessionId: String? = null, mimeType: String = "application/octet-stream"): UploadedFile {
        require(file.isFile) { "File does not exist: ${file.path}" }
        val multipart = MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("file", file.name, file.asRequestBody(mimeType.toMediaType())).apply { sessionId?.let { addFormDataPart("sessionId", it) } }.build()
        val json = parseJson(execute(authorizedRequest("POST", "/files", multipart).build())); val f = json.optJSONObject("file") ?: json
        return UploadedFile(f.optString("id"), f.optString("name", file.name), f.optString("mimeType", mimeType), f.optLong("size", file.length()))
    }
    fun extractFile(file: File, mimeType: String = "application/octet-stream"): JSONObject {
        require(file.isFile) { "File does not exist: ${file.path}" }
        val multipart = MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("file", file.name, file.asRequestBody(mimeType.toMediaType())).build()
        return parseJson(execute(authorizedRequest("POST", "/files/extract", multipart).build()))
    }
    /** Read a server resource using a non-empty relative path (absolute URLs and traversal are rejected). */
    fun readResource(path: String): JSONObject {
        return requestResource("GET", path)
    }
    /** Same-origin API operations shared by native feature modules. Never accepts absolute URLs. */
    fun requestResource(method: String, path: String, body: JSONObject? = null, authenticated: Boolean = true): JSONObject {
        val clean = path.trim()
        require(clean.isNotBlank() && !clean.startsWith("/") && !clean.contains(":") && !clean.contains('\\') && !clean.contains('#') && !clean.contains('%') && clean.substringBefore('?').split('/').none { it == ".." || it == "." || it.isBlank() }) { "Resource path must be relative" }
        require(method in setOf("GET", "POST", "PUT", "PATCH", "DELETE")) { "Unsupported HTTP method" }
        val payload = if (method in setOf("POST", "PUT", "PATCH")) body ?: JSONObject() else body
        return jsonRequest(method, "/$clean", payload, authenticated)
    }
    /** Encode values separately from a validated same-origin resource path. */
    fun requestResourceQuery(method: String, path: String, query: Map<String, String>, body: JSONObject? = null): JSONObject {
        require(path.matches(Regex("[A-Za-z0-9_/-]+")) && path.split('/').all { it.isNotBlank() }) { "Resource path must be relative" }
        require(method in setOf("GET", "POST", "PUT", "PATCH", "DELETE"))
        val target = url("/$path").toHttpUrl().newBuilder().apply { query.forEach { (key, value) -> addQueryParameter(key, value) } }.build()
        val payload = if (method in setOf("POST", "PUT", "PATCH")) body ?: JSONObject() else body
        return parseJson(execute(authorizedRequest(method, "/$path", payload?.toString()?.toRequestBody(JSON_MEDIA)).url(target).build()))
    }
    private fun jsonRequest(method: String, path: String, body: JSONObject? = null, authenticated: Boolean = true): JSONObject {
        val request: Request = if (authenticated) authorizedRequest(method, path, body?.toString()?.toRequestBody(JSON_MEDIA)).build()
            else Request.Builder().url(url(path)).method(method, body?.toString()?.toRequestBody(JSON_MEDIA)).header("Accept", "application/json").apply { if (body != null) header("Content-Type", "application/json") }.build()
        return parseJson(execute(request))
    }
    private fun authorizedRequest(method: String, path: String, body: RequestBody? = null): Request.Builder = Request.Builder().url(url(path)).method(method, body).header("Accept", "application/json").apply {
        val access = tokens().optString("accessToken"); if (access.isNotBlank()) header("Authorization", "Bearer $access")
        if (body != null && body.contentType()?.subtype != "form-data") header("Content-Type", "application/json")
    }
    private fun isAuthEndpoint(request: Request): Boolean {
        val path = request.url.encodedPath
        return path.contains("/auth/mobile/") || listOf("send-code", "register", "forgot-password", "reset-password", "resend-verification", "password").any { path.endsWith("/auth/$it") }
    }
    private fun execute(request: Request): okhttp3.Response {
        val first = http.newCall(request).execute()
        if (first.code != 401 || isAuthEndpoint(request)) return first
        first.close()
        val oldAccess = request.header("Authorization")?.removePrefix("Bearer ")
        if (!refreshTokens(oldAccess)) throw ApiException(401, "Session expired")
        val retry = request.newBuilder().header("Authorization", "Bearer ${tokens().optString("accessToken")}").build()
        val response = http.newCall(retry).execute()
        if (response.code == 401 && !isAuthEndpoint(retry)) { response.close(); invalidateSession(); throw ApiException(401, "Session expired") }
        return response
    }
    /** One refresh request at a time. Only definitive 401/403 invalidates credentials; transient failures preserve them. */
    private fun refreshTokens(observedAccess: String? = null): Boolean {
      synchronized(TOKEN_REFRESH_LOCK) {
        val generation = authGeneration
        val refreshBase = baseUrl
        val current = tokens(); val access = current.optString("accessToken")
        if (!observedAccess.isNullOrBlank() && access.isNotBlank() && access != observedAccess) return true
        val refresh = current.optString("refreshToken"); if (refresh.isBlank()) return false
        val body = JSONObject().put("refreshToken", refresh).toString().toRequestBody(JSON_MEDIA)
        val req = Request.Builder().url(refreshBase + "/auth/mobile/refresh").post(body).header("Content-Type", "application/json").build()
        return http.newCall(req).execute().use { response ->
            if (generation != authGeneration || refreshBase != baseUrl) false
            else if (response.code == 401 || response.code == 403) { clearTokens(); authGeneration++; onAuthLost?.invoke(); false }
            else if (!response.isSuccessful) throw apiException(response.code, response.body?.string().orEmpty())
            else { val result = parseJson(response); requireTokens(result); saveTokens(result); true }
        }
    }
    }
    private fun parseJson(response: okhttp3.Response): JSONObject {
        response.use { val text = it.body?.string().orEmpty(); if (!it.isSuccessful) throw apiException(it.code, text); if (text.isBlank()) return JSONObject()
            return try { JSONObject(text) } catch (_: Exception) { throw ApiException(it.code, "Invalid JSON response", text) } }
    }
    private fun apiException(status: Int, text: String): ApiException {
        val message = try { JSONObject(text).optString("message").ifBlank { JSONObject(text).optString("error") } } catch (_: Exception) { "" }
        return ApiException(status, message.ifBlank { "HTTP $status" }, text)
    }
    private fun url(path: String) = baseUrl + if (path.startsWith('/')) path else "/$path"
    private fun consumeSse(source: BufferedSource, onDelta: (String) -> Unit, onReasoning: (String) -> Unit, onActivity: (ChatActivity) -> Unit, onRawDelta: (String) -> Unit) {
        val decoder = SseDecoder(onDelta, onReasoning, onActivity, onRawDelta)
        while (!decoder.done && !source.exhausted()) decoder.acceptLine(source.readUtf8Line() ?: break)
        decoder.finish()
        if (!decoder.done) throw IOException("回复连接提前断开，已保留收到的内容。")
    }
    private fun parseSession(json: JSONObject): ChatSession {
        val array = json.optJSONArray("messages") ?: JSONArray()
        val messages = (0 until array.length()).map { i -> ChatWire.hydrateMessage(array.optJSONObject(i) ?: JSONObject()) }
        return ChatSession(id = json.optString("id"), title = json.optString("title"), topic = json.optString("topic"), mode = json.optString("mode", "chat"), phase = json.optString("phase", "chat"), kind = json.optString("kind", "chat"), messages = messages, createdAt = json.optString("createdAt").takeIf { it.isNotBlank() && it != "null" }, updatedAt = json.optString("updatedAt").takeIf { it.isNotBlank() && it != "null" }, wire = JSONObject(json.toString()))
    }
    private fun encode(value: String) = URLEncoder.encode(value, "UTF-8")
    private fun encodePath(value: String) = Uri.encode(value)
    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
}
