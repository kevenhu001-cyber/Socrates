package com.socrates.android.ui

import android.app.Application
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.socrates.android.data.ApiClient
import com.socrates.android.data.FeatureItem
import com.socrates.android.data.FeatureModels
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.time.ZonedDateTime
import java.util.concurrent.atomic.AtomicLong

 data class FeatureState(
    val kind: String = "", val items: List<FeatureItem> = emptyList(), val legacyPluginItems: List<FeatureItem> = emptyList(), val selected: FeatureItem? = null,
    val connectorConfigured: Boolean = false, val openConnectorAvailable: Boolean = false,
    val loading: Boolean = false, val busy: Boolean = false, val error: String? = null, val notice: String? = null,
    val name: String = "", val description: String = "", val prompt: String = "", val frequency: String = "once",
    val systemPrompt: String = "", val memoryCursor: String? = null, val includeDisabledMemories: Boolean = true,
    val taskAt: String = ZonedDateTime.now().plusHours(1).withSecond(0).withNano(0).toOffsetDateTime().toString(),
    val imageBytes: ByteArray? = null, val imageLoading: Boolean = false, val codexEnabled: Boolean = false, val needsConfirmation: String? = null, val unauthorized: Boolean = false
)

class FeatureViewModel(application: Application) : AndroidViewModel(application) {
    private val prefs = application.getSharedPreferences("socrates_native_settings", 0)
    private val _state = kotlinx.coroutines.flow.MutableStateFlow(FeatureState())
    val state = _state
    private fun newClient() = ApiClient(getApplication<Application>()) {
        _state.value = _state.value.copy(unauthorized = true)
    }
    private var api = newClient()
    private val generation = AtomicLong(0)
    private var listJob: Job? = null
    private var mutationJob: Job? = null
    private var connectorRefreshJob: Job? = null
    private val connectorRefreshLock = Any()
    private val pendingConnectorRefresh = linkedSetOf<String>()
    private var imageJob: Job? = null
    private val thumbnailCache = object : LruCache<String, Bitmap>(12 * 1024 * 1024) { override fun sizeOf(key: String, value: Bitmap) = value.byteCount }
    private val thumbnailPermits = Semaphore(2)
    @Volatile private var thumbnailEpoch = 0L

    fun open(kind: String) {
        listJob?.cancel(); mutationJob?.cancel(); connectorRefreshJob?.cancel(); imageJob?.cancel(); generation.incrementAndGet()
        thumbnailEpoch++
        thumbnailCache.evictAll()
        api = newClient()
        _state.value = FeatureState(kind = kind, loading = true)
        if (kind == "Codex") {
            _state.value = FeatureState(kind = kind, notice = "此页面仅展示真实运行记录；Codex 对话工作区需要主应用运行时，当前没有独立创建/编辑 API。")
            loadCodex(); return
        }
        if (!api.isLoggedIn) { _state.value = _state.value.copy(loading = false, error = "请先登录 Socrates 帐号。"); return }
        load()
    }

    private fun path(): Pair<String, String> = when (_state.value.kind) {
        "项目" -> "projects" to "projects"
        "记忆" -> "memory" to "memories"
        "资料库" -> "files" to "files"
        "图像" -> "creations/images" to "images"
        "助手" -> "creations/items/assistants" to "items"
        "定时任务" -> "scheduled-tasks" to "tasks"
        "插件" -> "project-connectors" to "connectors"
        else -> "" to ""
    }

    fun load() {
        if (_state.value.kind == "Codex") { loadCodex(); return }
        listJob?.cancel()
        val token = generation.incrementAndGet()
        _state.value = _state.value.copy(loading = true, busy = false, error = null)
        listJob = viewModelScope.launch {
            try {
                val (endpoint, key) = path()
                val kind = _state.value.kind
                val result = withContext(Dispatchers.IO) {
                    when (kind) {
                        "记忆" -> api.requestResourceQuery("GET", endpoint, mapOf("limit" to "50", "includeDisabled" to _state.value.includeDisabledMemories.toString()))
                        "资料库" -> {
                            val files = loadAllPages("files", "files")
                            val artifacts = loadAllPages("artifacts", "artifacts")
                            JSONObject().put("files", files).put("artifacts", artifacts)
                        }
                        "插件" -> {
                            val catalog = api.requestResource("GET", "project-connectors")
                            val legacy = runCatching { api.requestResource("GET", "plugins") }.getOrDefault(JSONObject())
                            catalog.put("legacyPlugins", legacy.optJSONArray("plugins") ?: org.json.JSONArray())
                        }
                        else -> api.requestResource("GET", endpoint)
                    }
                }
                val rows = when (kind) {
                    "资料库" -> {
                        val files = FeatureModels.items(result, "files", listOf("name", "title"))
                        val artifacts = FeatureModels.items(result, "artifacts", listOf("name", "title")).onEach { it.raw.put("_collection", "artifacts") }
                        files + artifacts
                    }
                    "插件" -> FeatureModels.items(result, key, listOf("name")).onEach { it.raw.put("_recordType", "connector") }
                    else -> FeatureModels.items(result, key, if (kind == "图像") listOf("name", "title") else if (kind == "记忆") listOf("text") else listOf("title", "name"))
                }
                val legacyPlugins = if (kind == "插件") FeatureModels.items(result, "legacyPlugins", listOf("name")) else _state.value.legacyPluginItems
                if (generation.get() == token) _state.value = _state.value.copy(
                    items = rows,
                    legacyPluginItems = legacyPlugins,
                    connectorConfigured = if (kind == "插件") result.optBoolean("configured") else _state.value.connectorConfigured,
                    openConnectorAvailable = if (kind == "插件") result.optJSONObject("openConnector")?.let { it.optBoolean("available") || it.optBoolean("cloud") } == true else _state.value.openConnectorAvailable,
                    selected = _state.value.selected?.let { selected -> rows.firstOrNull { it.id == selected.id } ?: selected },
                    loading = false, error = null,
                    memoryCursor = result.optString("nextCursor").takeIf { kind == "记忆" && it.isNotBlank() && it != "null" },
                )
            } catch (e: Exception) { if (generation.get() == token) _state.value = _state.value.copy(loading = false, unauthorized = (e as? com.socrates.android.data.ApiException)?.statusCode == 401, error = e.message ?: "加载失败，请重试。") }
        }
    }

    private suspend fun loadAllPages(endpoint: String, key: String): org.json.JSONArray {
        val all = org.json.JSONArray(); val seen = mutableSetOf<String>(); var cursor: String? = null
        do {
            kotlinx.coroutines.currentCoroutineContext().ensureActive()
            val query = mutableMapOf("limit" to "100"); cursor?.let { query["cursor"] = it }
            val page = api.requestResourceQuery("GET", endpoint, query)
            val rows = page.optJSONArray(key) ?: org.json.JSONArray()
            for (index in 0 until rows.length()) all.put(rows.opt(index))
            cursor = page.optString("nextCursor").takeIf { it.isNotBlank() && it != "null" }
            check(cursor == null || seen.add(cursor!!)) { "$endpoint 分页游标未前进，请稍后重试。" }
        } while (cursor != null)
        return all
    }

    private fun loadCodex() {
        val token = generation.incrementAndGet()
        listJob = viewModelScope.launch {
            try {
                val response = withContext(Dispatchers.IO) { api.requestResource("GET", "agent-runs/capabilities") }
                if (generation.get() == token) _state.value = _state.value.copy(loading = false, codexEnabled = response.optBoolean("enabled"), notice = if (response.optBoolean("enabled")) "Codex 工作区已启用；原生端不提供工作区编辑器。" else "服务端未启用 Codex 工作区，无法创建 Codex 任务。")
                val runs = withContext(Dispatchers.IO) { api.requestResource("GET", "agent-runs") }
                if (generation.get() == token) _state.value = _state.value.copy(items = FeatureModels.items(runs, "runs", listOf("task", "summary")), loading = false)
            } catch (e: Exception) { if (generation.get() == token) _state.value = _state.value.copy(loading = false, error = e.message ?: "无法读取 Codex 能力") }
        }
    }

    suspend fun thumbnail(id: String, rawUrl: String): Bitmap? {
        require(rawUrl.isBlank() || rawUrl == "/api/files/$id/raw" || rawUrl == "/api/v2/files/$id/raw") { "服务端未提供有效的图片原文件路径。" }
        val epoch = thumbnailEpoch
        thumbnailCache.get(id)?.let { return it }
        return thumbnailPermits.withPermit {
            thumbnailCache.get(id)?.let { return@withPermit it }
            val bytes = withContext(Dispatchers.IO) { api.downloadFile(id, 8 * 1024 * 1024) }
            withContext(Dispatchers.Default) {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext null
                var sample = 1
                while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 512) sample *= 2
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            }?.also { if (thumbnailEpoch == epoch) thumbnailCache.put(id, it) }
        }
    }

    fun setName(value: String) { _state.value = _state.value.copy(name = value) }
    fun setDescription(value: String) { _state.value = _state.value.copy(description = value) }
    fun setPrompt(value: String) { _state.value = _state.value.copy(prompt = value) }
    fun setScheduledTemplate(title: String, prompt: String) { _state.value = _state.value.copy(name = title.take(120), prompt = prompt, frequency = "once", taskAt = ZonedDateTime.now().plusHours(1).withSecond(0).withNano(0).toOffsetDateTime().toString()) }
    fun setSystemPrompt(value: String) { _state.value = _state.value.copy(systemPrompt = value) }
    fun setIncludeDisabledMemories(value: Boolean) { _state.value = _state.value.copy(includeDisabledMemories = value); load() }
    fun loadMoreMemories() {
        val cursor = _state.value.memoryCursor ?: return
        if (_state.value.loading || _state.value.busy) return
        val token = generation.incrementAndGet(); _state.value = _state.value.copy(loading = true, error = null)
        listJob = viewModelScope.launch { try {
            val page = withContext(Dispatchers.IO) { api.requestResourceQuery("GET", "memory", mapOf("limit" to "50", "includeDisabled" to _state.value.includeDisabledMemories.toString(), "cursor" to cursor)) }
            val rows = FeatureModels.items(page, "memories", listOf("text"))
            if (generation.get() == token) _state.value = _state.value.copy(items = _state.value.items + rows, memoryCursor = page.optString("nextCursor").takeIf { it.isNotBlank() && it != "null" }, loading = false)
        } catch (e: Exception) { if (generation.get() == token) _state.value = _state.value.copy(loading = false, error = e.message ?: "加载失败") } }
    }
    fun setFrequency(value: String) { _state.value = _state.value.copy(frequency = value) }
    fun setTaskAt(value: String) { _state.value = _state.value.copy(taskAt = value) }
    fun select(item: FeatureItem?) {
        val instructions = item?.raw?.optString("source")?.let { source -> runCatching { JSONObject(source).optString("instructions") }.getOrDefault(source) }.orEmpty()
        imageJob?.cancel()
        _state.value = _state.value.copy(selected = item, imageBytes = null, imageLoading = false, name = item?.title.orEmpty(), description = if (_state.value.kind == "助手") instructions else if (_state.value.kind == "记忆") item?.raw?.optString("text").orEmpty() else item?.raw?.optString("description").orEmpty(), systemPrompt = item?.raw?.optString("systemPrompt").orEmpty(), prompt = item?.raw?.optString("prompt").orEmpty(), frequency = item?.raw?.optString("frequency")?.takeIf { it.isNotBlank() } ?: "once", taskAt = item?.raw?.optString("nextRunAt")?.takeIf { it.isNotBlank() && it != "null" } ?: _state.value.taskAt)
        if (item != null && _state.value.kind == "图像") {
            _state.value = _state.value.copy(imageLoading = true)
            imageJob = viewModelScope.launch { try { val rawUrl = item.raw.optString("url")
                // Download by the authenticated resource ID, never an arbitrary server-supplied URL.
                // Match the thumbnail contract for legacy and v2 file responses.
                require(rawUrl.isBlank() || rawUrl == "/api/files/${item.id}/raw" || rawUrl == "/api/v2/files/${item.id}/raw") { "服务端未提供有效的图片原文件路径。" }
                val bytes = withContext(Dispatchers.IO) { api.downloadFile(item.id, 8 * 1024 * 1024) }; if (_state.value.selected?.id == item.id) _state.value = _state.value.copy(imageBytes = bytes, imageLoading = false) } catch (e: Exception) { if (_state.value.selected?.id == item.id) _state.value = _state.value.copy(imageLoading = false, error = e.message ?: "图片预览加载失败") } }
        }
    }
    fun requestDelete(item: FeatureItem) { _state.value = _state.value.copy(needsConfirmation = item.id) }
    fun cancelDelete() { _state.value = _state.value.copy(needsConfirmation = null) }

    fun createImage() = mutate {
        val prompt = _state.value.prompt.trim()
        require(prompt.isNotEmpty()) { "请输入图片描述。" }
        withContext(Dispatchers.IO) { api.requestResource("POST", "creations/images", JSONObject().put("prompt", prompt)) }
        _state.value = _state.value.copy(notice = "图片已生成。", prompt = "")
        load()
    }

    fun save() = mutate {
        val s = _state.value; val current = s.selected
        require(s.kind == "记忆" || s.name.isNotBlank()) { "名称不能为空。" }
        val body = JSONObject()
        val method: String; val endpoint: String
        when (s.kind) {
            "项目" -> { body.put("name", s.name).put("description", s.description).put("systemPrompt", s.systemPrompt); method = if (current == null) "POST" else "PATCH"; endpoint = "projects" + (current?.let { "/${it.id}" } ?: "") }
            "记忆" -> { require(s.description.isNotBlank()) { "记忆内容不能为空。" }; body.put("text", s.description); method = if (current == null) "POST" else "PATCH"; endpoint = "memory" + (current?.let { "/${it.id}" } ?: "") }
            "定时任务" -> {
                require(s.prompt.isNotBlank()) { "执行内容不能为空。" }
                require(s.frequency in setOf("once", "hourly", "daily", "weekly", "monthly")) { "请选择支持的重复频率。" }
                val instant = runCatching { java.time.OffsetDateTime.parse(s.taskAt.trim()).toInstant() }.getOrElse { throw IllegalArgumentException("请输入 ISO 8601 日期时间，并包含时区偏移。") }
                require(instant.isAfter(java.time.Instant.now())) { "运行时间必须晚于当前时间。" }
                body.put("title", s.name).put("prompt", s.prompt).put("frequency", s.frequency).put("nextRunAt", instant.toString())
                method = if (current == null) "POST" else "PATCH"; endpoint = "scheduled-tasks" + (current?.let { "/${it.id}" } ?: "")
            }
            "插件" -> { body.put("name", s.name).put("description", s.description).put("type", "extension"); method = if (current == null) "POST" else "PATCH"; endpoint = "plugins" + (current?.let { "/${it.id}" } ?: "") }
            "助手" -> { val source = current?.raw?.optString("source").orEmpty(); val config = runCatching { JSONObject(source) }.getOrElse { JSONObject() }; config.put("instructions", s.description); body.put("title", s.name).put("source", config.toString()); method = if (current == null) "POST" else "PATCH"; endpoint = "creations/items/assistants" + (current?.let { "/${it.id}" } ?: "") }
            "资料库" -> {
                require(current != null) { "请使用下方上传按钮添加资料。" }
                val collection = current.raw.optString("_collection").ifBlank { "files" }
                if (collection == "artifacts") body.put("title", s.name) else body.put("name", s.name)
                method = "PATCH"; endpoint = "$collection/${current.id}"
            }
            else -> throw IllegalStateException("此页面不支持创建或编辑。")
        }
        withContext(Dispatchers.IO) { api.requestResource(method, endpoint, body) }
        _state.value = _state.value.copy(selected = null, notice = "已保存。")
        load()
    }

    fun toggle(item: FeatureItem) = mutate {
        val (endpoint, body) = when (_state.value.kind) {
            "定时任务" -> "scheduled-tasks/${item.id}" to JSONObject().put("status", ScheduledTaskPresentation.toggledStatus(item.raw.optString("status")))
            "记忆" -> "memory/${item.id}/${if (item.raw.optBoolean("enabled", true)) "disable" else "enable"}" to JSONObject()
            "插件" -> "plugins/${item.id}" to JSONObject().put("isEnabled", !item.raw.optBoolean("isEnabled", true))
            else -> throw IllegalStateException("此项目不支持切换。")
        }
        withContext(Dispatchers.IO) { if (_state.value.kind == "记忆") api.requestResource("POST", endpoint) else api.requestResource("PATCH", endpoint, body) }; load()
    }

    fun runTask(item: FeatureItem) = mutate {
        require(_state.value.kind == "定时任务")
        withContext(Dispatchers.IO) { api.requestResource("POST", "scheduled-tasks/${item.id}/run") }
        _state.value = _state.value.copy(notice = "任务已运行；请刷新最近会话查看结果。")
        load()
    }

    fun connectConnector(id: String, body: JSONObject = JSONObject(), onAuthorizationUrl: (String) -> Unit = {}) = mutate {
        require(id.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "无效的连接器 ID。" }
        val result = withContext(Dispatchers.IO) { api.requestResource("POST", "project-connectors/$id/connect", body) }
        val authorizationUrl = result.optString("authorizationUrl")
        if (authorizationUrl.isNotBlank()) {
            val uri = Uri.parse(authorizationUrl)
            require(uri.scheme == "https" && !uri.host.isNullOrBlank()) { "连接器返回了无效的授权地址。" }
            synchronized(connectorRefreshLock) { pendingConnectorRefresh += id }
            _state.value = _state.value.copy(notice = "请在浏览器完成授权，返回后刷新连接状态。")
            load()
            onAuthorizationUrl(authorizationUrl)
        } else {
            _state.value = _state.value.copy(notice = if (result.optString("status") == "connected") "连接成功。" else "连接请求已提交。")
            load()
        }
    }

    fun refreshConnectorStatus(id: String) = mutate {
        require(id.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "无效的连接器 ID。" }
        withContext(Dispatchers.IO) { api.requestResource("GET", "project-connectors/$id/status") }
        load()
    }

    fun refreshConnectorStatuses() {
        val initiated = _state.value.items.filter { it.raw.optString("_recordType") == "connector" && it.raw.optJSONObject("connection")?.optString("status") == "initiated" }.map { it.id }
        val pending = synchronized(connectorRefreshLock) { (initiated + pendingConnectorRefresh).distinct() }
        if (pending.isEmpty() || connectorRefreshJob?.isActive == true) return
        connectorRefreshJob = viewModelScope.launch {
            val refreshed = withContext(Dispatchers.IO) {
                pending.filter { id -> runCatching { api.requestResource("GET", "project-connectors/$id/status") }.isSuccess }
            }
            synchronized(connectorRefreshLock) { pendingConnectorRefresh.removeAll(refreshed.toSet()) }
            load()
        }
    }

    fun disconnectConnector(id: String) = mutate {
        require(id.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "无效的连接器 ID。" }
        withContext(Dispatchers.IO) { api.requestResource("DELETE", "project-connectors/$id/connection") }
        load()
    }

    fun deleteConfirmed() = mutate {
        val id = _state.value.needsConfirmation ?: return@mutate
        val selected = _state.value.items.firstOrNull { it.id == id }
        val endpoint = when (_state.value.kind) { "项目" -> "projects/$id"; "记忆" -> "memory/$id"; "资料库" -> "${selected?.raw?.optString("_collection")?.ifBlank { "files" } ?: "files"}/$id"; "图像" -> "files/$id"; "助手" -> "creations/items/assistants/$id"; "定时任务" -> "scheduled-tasks/$id"; "插件" -> "plugins/$id"; else -> throw IllegalStateException("不支持删除") }
        withContext(Dispatchers.IO) { api.requestResource("DELETE", endpoint) }
        _state.value = _state.value.copy(needsConfirmation = null, selected = null, notice = "已删除。")
        load()
    }

    fun upload(uri: Uri) = mutate {
        withContext(Dispatchers.IO) {
            val resolver = getApplication<Application>().contentResolver
            var fileName = "upload"
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) fileName = it.getString(0) ?: fileName }
            val mime = resolver.getType(uri) ?: "application/octet-stream"
            val local = File(getApplication<Application>().cacheDir, "feature-${System.nanoTime()}-${fileName.replace(Regex("[^\\p{L}\\p{N}._-]"), "_").take(100)}")
            try {
                resolver.openInputStream(uri)?.use { input -> local.outputStream().use { output ->
                    val buffer = ByteArray(8192); var total = 0L
                    while (true) { val count = input.read(buffer); if (count < 0) break; total += count; require(total <= 25L * 1024 * 1024) { "文件不能超过 25 MB。" }; output.write(buffer, 0, count) }
                } } ?: error("无法读取文件")
                api.uploadFile(local, mimeType = mime)
            } finally { local.delete() }
        }
        _state.value = _state.value.copy(notice = "上传成功。")
        load()
    }

    private fun mutate(block: suspend () -> Unit) {
        if (_state.value.busy) return
        val token = generation.incrementAndGet()
        _state.value = _state.value.copy(busy = true, error = null, notice = null)
        mutationJob = viewModelScope.launch {
            try { block(); if (generation.get() == token) _state.value = _state.value.copy(busy = false) }
            catch (e: Exception) { if (generation.get() == token) _state.value = _state.value.copy(busy = false, unauthorized = (e as? com.socrates.android.data.ApiException)?.statusCode == 401, error = e.message ?: "操作失败，请重试。") }
        }
    }
}
