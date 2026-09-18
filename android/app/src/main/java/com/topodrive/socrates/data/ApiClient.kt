package com.topodrive.socrates.data

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * API client — port of `mobile/src/data/api/client.ts`. Talks to the same
 * `/api/v2` surface as the web SPA and the Expo shell, with single-flight
 * refresh-token rotation on 401.
 */
internal object Api {
    const val DEFAULT_BASE = "https://app.topodrive.top/api/v2"

    var baseUrl: String = DEFAULT_BASE
        private set

    fun setBaseUrl(url: String) {
        baseUrl = url.trim().trimEnd('/')
    }

    val webBaseUrl: String get() = baseUrl.replace(Regex("/api(/v2)?$"), "")

    /** Auth endpoints live under `/api` (not `/api/v2`) — see mobile config.ts. */
    val authBaseUrl: String get() = "$webBaseUrl/api"

    fun githubOAuthStartUrl(): String =
        "$authBaseUrl/auth/oauth/github/mobile/start?redirect_uri=${enc("socrates://auth/callback")}"

    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
        isLenient = true
    }

    val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    /** Separate client for long-lived SSE — no read timeout. */
    val streamHttp = http.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build()

    lateinit var prefs: Prefs

    class ApiError(val status: Int, message: String, val body: ApiErrorBody? = null) : Exception(message) {
        val code: String? get() = body?.code
    }

    private val refreshMutex = Mutex()

    /** Refresh the bearer once; returns false if unrecoverable. Single-flight. */
    suspend fun refreshAccessToken(): Boolean = refreshMutex.withLock {
        val current = prefs.readTokens()
        val rt = current.refreshToken ?: return@withLock false
        val resp = rawRequest(
            "POST", "/auth/mobile/refresh",
            jsonBody("refreshToken" to rt),
            withAuth = false,
        )
        if (!resp.isSuccessful) {
            prefs.clearTokens()
            return@withLock false
        }
        val pair = try {
            json.decodeFromString<MobileTokenPair>(resp.body?.string() ?: "")
        } catch (_: Exception) { return@withLock false }
        prefs.writeTokens(
            pair.copy(
                refreshToken = pair.refreshToken.ifEmpty { rt },
                expiresAt = pair.expiresAt.ifEmpty { current.expiresAt ?: "" },
                refreshExpiresAt = pair.refreshExpiresAt.ifEmpty { current.refreshExpiresAt ?: "" },
            ),
        )
        true
    }

    fun jsonBody(vararg pairs: Pair<String, Any?>): RequestBody {
        val obj = buildJsonObject {
            for ((k, v) in pairs) {
                when (v) {
                    null -> {}
                    is String -> put(k, JsonPrimitive(v))
                    is Number -> put(k, JsonPrimitive(v))
                    is Boolean -> put(k, JsonPrimitive(v))
                    is JsonElement -> put(k, v)
                    else -> put(k, JsonPrimitive(v.toString()))
                }
            }
        }
        return obj.toString().toRequestBody("application/json".toMediaType())
    }

    fun jsonBody(obj: JsonObject): RequestBody = obj.toString().toRequestBody("application/json".toMediaType())

    internal fun rawRequest(method: String, path: String, body: RequestBody? = null, withAuth: Boolean = true, headers: Map<String, String> = emptyMap()): okhttp3.Response {
        val b = Request.Builder().url("$baseUrl$path")
        b.header("Accept", "application/json")
        if (body != null && body.contentType()?.subtype != "form-data") {
            b.header("Content-Type", body.contentType()?.toString() ?: "application/json")
        }
        for ((k, v) in headers) b.header(k, v)
        when (method.uppercase()) {
            "GET" -> b.get()
            "DELETE" -> if (body != null) b.delete(body) else b.delete()
            "POST" -> b.post(body ?: ByteArray(0).toRequestBody("application/json".toMediaTypeOrNull()))
            "PATCH" -> b.patch(body ?: ByteArray(0).toRequestBody("application/json".toMediaTypeOrNull()))
            "PUT" -> b.put(body ?: ByteArray(0).toRequestBody("application/json".toMediaTypeOrNull()))
        }
        val req = if (withAuth) {
            // synchronous caller path — tokens read by wrapping in blocking call sites
            b.build()
        } else b.build()
        return http.newCall(req).execute()
    }

    internal suspend fun authorizedRequest(method: String, path: String, body: RequestBody? = null, headers: Map<String, String> = emptyMap()): okhttp3.Response {
        val tokens = prefs.readTokens()
        val hdrs = buildMap {
            putAll(headers)
            if (!tokens.accessToken.isNullOrEmpty()) put("Authorization", "Bearer ${tokens.accessToken}")
        }
        val req = Request.Builder().url("$baseUrl$path").apply {
            header("Accept", "application/json")
            if (body != null && body.contentType()?.subtype != "form-data") {
                header("Content-Type", body.contentType()?.toString() ?: "application/json")
            }
            for ((k, v) in hdrs) header(k, v)
            when (method.uppercase()) {
                "GET" -> get()
                "DELETE" -> if (body != null) delete(body) else delete()
                "POST" -> post(body ?: ByteArray(0).toRequestBody("application/json".toMediaTypeOrNull()))
                "PATCH" -> patch(body ?: ByteArray(0).toRequestBody("application/json".toMediaTypeOrNull()))
                "PUT" -> put(body ?: ByteArray(0).toRequestBody("application/json".toMediaTypeOrNull()))
            }
        }.build()
        return http.newCall(req).execute()
    }

    suspend inline fun <reified T> request(method: String, path: String, body: RequestBody? = null, retry: Boolean = true, headers: Map<String, String> = emptyMap()): T {
        var resp = try {
            authorizedRequest(method, path, body, headers)
        } catch (e: Exception) {
            throw ApiError(0, e.message ?: "Network unavailable", ApiErrorBody(code = "NETWORK"))
        }
        if (resp.code == 401 && retry && !path.startsWith("/auth/")) {
            resp.close()
            if (refreshAccessToken()) {
                resp = try {
                    authorizedRequest(method, path, body, headers)
                } catch (e: Exception) {
                    throw ApiError(0, e.message ?: "Network unavailable", ApiErrorBody(code = "NETWORK"))
                }
            }
        }
        val text = resp.body?.string() ?: ""
        if (!resp.isSuccessful) {
            val errBody = try { json.decodeFromString<ApiErrorBody>(text) } catch (_: Exception) { ApiErrorBody(message = text) }
            throw ApiError(resp.code, errBody.message ?: errBody.detail ?: errBody.error ?: "HTTP ${resp.code}", errBody)
        }
        if (text.isBlank()) {
            @Suppress("UNCHECKED_CAST")
            return Unit as T
        }
        val trimmed = text.trim()
        if (T::class == String::class) {
            @Suppress("UNCHECKED_CAST")
            return trimmed as T
        }
        return try {
            json.decodeFromString<T>(trimmed)
        } catch (e: Exception) {
            // Some endpoints return bare JSON scalars/objects
            if (T::class == JsonObject::class) {
                @Suppress("UNCHECKED_CAST")
                return json.parseToJsonElement(trimmed).jsonObject as T
            }
            throw ApiError(resp.code, "Unexpected response", null)
        }
    }

    suspend inline fun <reified T> get(path: String): T = request("GET", path)
    suspend inline fun <reified T> post(path: String, vararg fields: Pair<String, Any?>): T =
        request("POST", path, jsonBody(*fields))
    suspend inline fun <reified T> postJson(path: String, obj: JsonObject): T = request("POST", path, jsonBody(obj))
    suspend inline fun <reified T> patch(path: String, vararg fields: Pair<String, Any?>): T =
        request("PATCH", path, jsonBody(*fields))
    suspend inline fun <reified T> patchJson(path: String, obj: JsonObject): T = request("PATCH", path, jsonBody(obj))
    suspend inline fun <reified T> put(path: String, vararg fields: Pair<String, Any?>): T =
        request("PUT", path, jsonBody(*fields))
    suspend inline fun <reified T> delete(path: String): T = request("DELETE", path)

    /* ── Auth ── */
    suspend fun login(email: String, password: String): MobileAuthResponse =
        request("POST", "/auth/mobile/login", jsonBody("email" to email, "password" to password), retry = false)

    suspend fun loginWithCode(email: String, code: String): MobileAuthResponse =
        request("POST", "/auth/mobile/login-with-code", jsonBody("email" to email, "code" to code), retry = false)

    suspend fun sendCode(email: String): JsonObject =
        request("POST", "/auth/send-code", jsonBody("email" to email), retry = false)

    suspend fun register(email: String, password: String): JsonObject =
        request("POST", "/auth/register", jsonBody("email" to email, "password" to password), retry = false)

    suspend fun resendVerification(email: String): JsonObject =
        request("POST", "/auth/resend-verification", jsonBody("email" to email), retry = false)

    suspend fun forgotPassword(email: String): JsonObject =
        request("POST", "/auth/forgot-password", jsonBody("email" to email), retry = false)

    suspend fun me(): User =
        request<JsonObject>("GET", "/auth/me").let { json.decodeFromJsonElement(User.serializer(), it["user"] ?: it) }

    suspend fun oauthExchange(exchangeToken: String): MobileTokenPair =
        request("POST", "/auth/mobile/oauth/exchange", jsonBody("exchangeToken" to exchangeToken), retry = false)

    suspend fun mobileLogout(refreshToken: String?) =
        request<JsonObject?>("POST", "/auth/mobile/logout", jsonBody("refreshToken" to refreshToken), retry = false)

    suspend fun mobileVerify(token: String): MobileAuthResponse =
        request("GET", "/auth/mobile/verify?token=${enc(token)}", retry = false)

    /** One-time WebView hand-off into an allow-listed SPA target. */
    suspend fun webSession(target: String): JsonObject =
        postJson("/auth/mobile/web-session", buildJsonObject { put("target", JsonPrimitive(target)) })

    /* ── Sessions ── */
    suspend fun listSessions(limit: Int = 50, cursor: String? = null): Pair<List<Session>, String?> {
        val obj = request<JsonObject>("GET", "/sessions?limit=$limit${cursor?.let { "&cursor=$it" } ?: ""}")
        val sessions = obj["sessions"]?.let { json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Session.serializer()), it) } ?: emptyList()
        val next = obj["nextCursor"]?.jsonPrimitive?.contentOrNull
        return sessions to next
    }

    suspend fun getSession(id: String): Session = get("/sessions/${enc(id)}")

    suspend fun upsertSession(session: Session, messages: List<Message>): Session {
        val obj = buildJsonObject {
            put("id", JsonPrimitive(session.id))
            put("topic", JsonPrimitive(session.topic))
            session.title?.let { put("title", JsonPrimitive(it)) }
            put("mode", JsonPrimitive(session.mode))
            session.kind?.let { put("kind", JsonPrimitive(it)) }
            session.phase?.let { put("phase", JsonPrimitive(it)) }
            session.projectId?.let { put("projectId", JsonPrimitive(it)) }
            session.pinned.let { put("pinned", JsonPrimitive(it)) }
            session.tags?.let { tags -> put("tags", kotlinx.serialization.json.JsonArray(tags.map { JsonPrimitive(it) })) }
            session.examData?.let { put("examData", json.encodeToJsonElement(ExamData.serializer(), it)) }
            put("messages", json.encodeToJsonElement(kotlinx.serialization.builtins.ListSerializer(Message.serializer()), messages))
            session.teachingStage?.let { put("teachingStage", JsonPrimitive(it)) }
            session.currentNode?.let { put("currentNode", JsonPrimitive(it)) }
        }
        return postJson("/sessions", obj)
    }

    suspend fun patchSession(id: String, fields: Map<String, Any?>): Session =
        patchJson("/sessions/${enc(id)}", buildJsonObject {
            for ((k, v) in fields) {
                when (v) {
                    null -> {}
                    is String -> put(k, JsonPrimitive(v))
                    is Number -> put(k, JsonPrimitive(v))
                    is Boolean -> put(k, JsonPrimitive(v))
                    is JsonElement -> put(k, v)
                    is List<*> -> put(k, kotlinx.serialization.json.JsonArray(v.map { JsonPrimitive(it.toString()) }))
                    else -> put(k, JsonPrimitive(v.toString()))
                }
            }
        })

    suspend fun archiveSession(id: String) = request<JsonObject?>("POST", "/sessions/${enc(id)}/archive")
    suspend fun deleteSession(id: String) = request<JsonObject?>("DELETE", "/sessions/${enc(id)}")

    suspend fun listArchivedSessions(): List<Session> {
        val obj = request<JsonObject>("GET", "/sessions/archived")
        return obj["sessions"]?.let { json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Session.serializer()), it) } ?: emptyList()
    }

    suspend fun listTags(): List<String> {
        val obj = request<JsonObject>("GET", "/tags")
        return obj["tags"]?.let {
            json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(kotlinx.serialization.serializer<String>()), it)
        } ?: emptyList()
    }

    /* ── Chat ── */
    fun chatStreamUrl(sessionId: String) = "$baseUrl/chat/stream?sessionId=${enc(sessionId)}"

    suspend fun chat(request: JsonObject): JsonObject = postJson("/chat", request)

    /* ── Messages ── */
    suspend fun editMessage(id: String, content: String, regenerate: Boolean = false) =
        request<JsonObject?>("PATCH", "/messages/${enc(id)}", jsonBody("content" to content, "regenerate" to regenerate))
    suspend fun regenerateMessage(id: String) = request<JsonObject?>("POST", "/messages/${enc(id)}/regenerate")
    suspend fun feedbackMessage(id: String, rating: String, reason: String? = null) =
        request<JsonObject?>("PUT", "/messages/${enc(id)}/feedback", jsonBody("rating" to rating, "reason" to reason))
    suspend fun copyEvent(id: String) = request<JsonObject?>("POST", "/messages/${enc(id)}/copy-event")

    /* ── Share ── */
    suspend fun getShare(sessionId: String): ShareInfo = get("/sessions/${enc(sessionId)}/share")
    suspend fun createShare(sessionId: String): ShareInfo =
        request("POST", "/sessions/${enc(sessionId)}/share", jsonBody("visibility" to "unlisted"))
    suspend fun deleteShare(sessionId: String) = request<JsonObject?>("DELETE", "/sessions/${enc(sessionId)}/share")
    fun shareAbsolute(url: String): String = if (url.startsWith("http")) url else "$webBaseUrl$url"

    /* ── API keys (BYO providers) ── */
    suspend fun listApiKeys(): List<ApiKeyProvider> {
        val obj = request<JsonObject>("GET", "/api-key")
        return obj["providers"]?.let {
            json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(ApiKeyProvider.serializer()), it)
        } ?: emptyList()
    }
    suspend fun createApiKey(label: String?, url: String, model: String, key: String, isMultimodal: Boolean): JsonObject =
        request("POST", "/api-key", jsonBody("label" to label, "url" to url, "model" to model, "key" to key, "isMultimodal" to isMultimodal))
    suspend fun patchApiKey(id: String, fields: Map<String, Any?>): JsonObject =
        patchJson("/api-key/${enc(id)}", buildJsonObject {
            for ((k, v) in fields) {
                when (v) {
                    null -> {}
                    is String -> put(k, JsonPrimitive(v))
                    is Boolean -> put(k, JsonPrimitive(v))
                    else -> put(k, JsonPrimitive(v.toString()))
                }
            }
        })
    suspend fun deleteApiKey(id: String) = request<JsonObject?>("DELETE", "/api-key/${enc(id)}")

    /* ── Projects ── */
    suspend fun listProjects(): List<Project> {
        val obj = request<JsonObject>("GET", "/projects")
        return obj["projects"]?.let { json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Project.serializer()), it) } ?: emptyList()
    }
    suspend fun createProject(name: String, description: String? = null, color: String? = null, icon: String? = null, systemPrompt: String? = null): Project =
        post("/projects", "name" to name, "description" to description, "color" to color, "icon" to icon, "systemPrompt" to systemPrompt)
    suspend fun patchProject(id: String, fields: Map<String, Any?>): Project =
        patchJson("/projects/${enc(id)}", buildJsonObject {
            for ((k, v) in fields) if (v != null) put(k, JsonPrimitive(v.toString()))
        })
    suspend fun deleteProject(id: String) = request<JsonObject?>("DELETE", "/projects/${enc(id)}")

    /* ── Scheduled tasks ── */
    suspend fun listScheduledTasks(): List<ScheduledTask> {
        val obj = request<JsonObject>("GET", "/scheduled-tasks")
        return obj["tasks"]?.let { json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(ScheduledTask.serializer()), it) } ?: emptyList()
    }
    suspend fun createScheduledTask(title: String, prompt: String, frequency: String = "once", sessionId: String? = null, nextRunAt: String? = null): ScheduledTask =
        post("/scheduled-tasks", "title" to title, "prompt" to prompt, "frequency" to frequency, "sessionId" to sessionId, "nextRunAt" to nextRunAt)
    suspend fun patchScheduledTask(id: String, fields: Map<String, Any?>): ScheduledTask =
        patchJson("/scheduled-tasks/${enc(id)}", buildJsonObject {
            for ((k, v) in fields) {
                when (v) {
                    null -> {}
                    is String -> put(k, JsonPrimitive(v))
                    is Boolean -> put(k, JsonPrimitive(v))
                    is Number -> put(k, JsonPrimitive(v))
                    else -> put(k, JsonPrimitive(v.toString()))
                }
            }
        })
    suspend fun runScheduledTask(id: String): ScheduledTask = post("/scheduled-tasks/${enc(id)}/run")
    suspend fun deleteScheduledTask(id: String) = request<JsonObject?>("DELETE", "/scheduled-tasks/${enc(id)}")

    /* ── Files ── */
    suspend fun listFiles(): List<FileEntry> {
        val obj = request<JsonObject>("GET", "/files")
        return obj["files"]?.let { json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(FileEntry.serializer()), it) } ?: emptyList()
    }

    suspend fun uploadFile(fileName: String, mimeType: String, bytes: ByteArray, sessionId: String? = null): FileEntry {
        if (bytes.size > 25 * 1024 * 1024) throw ApiError(413, "Files must be smaller than 25 MB", ApiErrorBody(code = "PAYLOAD_TOO_LARGE"))
        val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaTypeOrNull()))
        if (sessionId != null) builder.addFormDataPart("sessionId", sessionId)
        val tokens = prefs.readTokens()
        val req = Request.Builder().url("$baseUrl/files").post(builder.build()).apply {
            if (!tokens.accessToken.isNullOrEmpty()) header("Authorization", "Bearer ${tokens.accessToken}")
        }.build()
        val resp = http.newCall(req).execute()
        val text = resp.body?.string() ?: ""
        if (!resp.isSuccessful) {
            val err = try { json.decodeFromString<ApiErrorBody>(text) } catch (_: Exception) { ApiErrorBody(message = text) }
            throw ApiError(resp.code, err.message ?: "Upload failed (${resp.code})", err)
        }
        return json.decodeFromString(text)
    }

    suspend fun fileContent(id: String): JsonObject = get("/files/${enc(id)}/content")
    fun fileRawUrl(id: String) = "$baseUrl/files/${enc(id)}/raw"

    /* ── Artifacts ── */
    suspend fun listArtifacts(): List<Artifact> {
        val obj = request<JsonObject>("GET", "/artifacts")
        return obj["artifacts"]?.let { json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Artifact.serializer()), it) } ?: emptyList()
    }
    suspend fun getArtifact(id: String): Artifact = get("/artifacts/${enc(id)}")

    /* ── Memory ── */
    suspend fun listMemories(): List<Memory> {
        val obj = request<JsonObject>("GET", "/memory?limit=100&includeDisabled=true")
        return obj["memories"]?.let { json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Memory.serializer()), it) } ?: emptyList()
    }
    suspend fun createMemory(text: String): Memory = post("/memory", "text" to text, "source" to "user")
    suspend fun patchMemory(id: String, text: String? = null, enabled: Boolean? = null): Memory {
        val obj = buildJsonObject {
            text?.let { put("text", JsonPrimitive(it)) }
            enabled?.let { put("enabled", JsonPrimitive(it)) }
        }
        return patchJson("/memory/${enc(id)}", obj)
    }
    suspend fun deleteMemory(id: String) = request<JsonObject?>("DELETE", "/memory/${enc(id)}")

    /* ── Mistakes / knowledge ── */
    suspend fun listMistakes(resolved: Boolean? = null): List<Mistake> {
        val obj = request<JsonObject>("GET", "/mistakes?limit=100${resolved?.let { "&resolved=$it" } ?: ""}")
        return obj["items"]?.let { json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Mistake.serializer()), it) } ?: emptyList()
    }
    suspend fun patchMistake(id: String, resolved: Boolean): Mistake =
        patch("/mistakes/${enc(id)}", "isResolved" to resolved)
    suspend fun deleteMistake(id: String) = request<JsonObject?>("DELETE", "/mistakes/${enc(id)}")

    suspend fun listKnowledge(status: String? = null): JsonObject =
        get("/knowledge-boundary${status?.let { "?status=$it" } ?: ""}")

    /* ── User prefs ── */
    suspend fun updateMe(fields: Map<String, Any?>): User =
        patchJson("/users/me", buildJsonObject {
            for ((k, v) in fields) {
                when (v) {
                    null -> {}
                    is String -> put(k, JsonPrimitive(v))
                    is JsonElement -> put(k, v)
                    else -> put(k, JsonPrimitive(v.toString()))
                }
            }
        })

    /* ── Usage ── */
    suspend fun usageDaily(days: Int = 30): JsonObject = get("/usage/daily?days=$days")
    suspend fun usageLimits(): JsonObject = get("/usage/limits")

    /* ── Search ── */
    suspend fun search(query: String, limit: Int = 30): JsonObject =
        request("POST", "/search", jsonBody("query" to query, "limit" to limit))

    /* ── Voice transcription ── */
    suspend fun transcribe(fileName: String, mimeType: String, bytes: ByteArray): String {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaTypeOrNull()))
            .build()
        val tokens = prefs.readTokens()
        val req = Request.Builder().url("$baseUrl/voice/transcribe").post(body).apply {
            if (!tokens.accessToken.isNullOrEmpty()) header("Authorization", "Bearer ${tokens.accessToken}")
        }.build()
        val resp = http.newCall(req).execute()
        val text = resp.body?.string() ?: ""
        if (!resp.isSuccessful) throw ApiError(resp.code, "Transcription failed (${resp.code})")
        val obj = json.parseToJsonElement(text).jsonObject
        return obj["text"]?.jsonPrimitive?.contentOrNull ?: obj["transcript"]?.jsonPrimitive?.contentOrNull ?: ""
    }

    fun enc(v: String) = java.net.URLEncoder.encode(v, "UTF-8")

    /* ── Exam generation (port of frontend/src/exam.js flow) ── */
    suspend fun generateExamQuestions(prompt: String): JsonObject {
        val body = buildJsonObject {
            put("mode", JsonPrimitive("chat"))
            put("messages", kotlinx.serialization.json.JsonArray(listOf(
                buildJsonObject {
                    put("role", JsonPrimitive("user"))
                    put("content", JsonPrimitive(prompt))
                },
            )))
            put("temperature", JsonPrimitive(0.4))
            put("max_tokens", JsonPrimitive(4096))
        }
        return postJson("/chat", body)
    }
}
