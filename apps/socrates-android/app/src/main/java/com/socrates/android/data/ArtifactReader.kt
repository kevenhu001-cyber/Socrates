package com.socrates.android.data

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.Response
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/** Native reader budgets, not server limits. Reject whole responses rather than invent partial history. */
object ArtifactReaderPolicy {
    const val MAX_RESPONSE_BYTES = 4 * 1024 * 1024
    const val MAX_SOURCE_UNITS = 1_000_000
    const val MAX_VERSIONS = 100
    fun requireId(id: String) = require(id.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "无效的作品 ID。" }
}

/** Check identity before every retry and before exposing a response; stale 401s never clear a new login. */
internal fun readScopedArtifact(
    isCurrent: () -> Boolean,
    send: () -> Response,
    refresh: () -> Boolean,
    invalidate: () -> Unit,
): JSONObject = readScopedJson(isCurrent, send, refresh, invalidate, ::readArtifactJson)

/** Shared identity guard; each read-only resource retains its own response decoder and budget. */
internal fun readScopedJson(
    isCurrent: () -> Boolean,
    send: () -> Response,
    refresh: () -> Boolean,
    invalidate: () -> Unit,
    decode: (Response) -> JSONObject,
): JSONObject {
    fun checkScope() { if (!isCurrent()) throw CancellationException("读取的登录身份已改变。") }
    checkScope()
    val first = send()
    if (!isCurrent()) { first.close(); checkScope() }
    val response = if (first.code == 401) {
        first.close()
        checkScope()
        if (!refresh()) { checkScope(); throw ApiException(401, "Session expired") }
        checkScope()
        send().also { retry ->
            if (!isCurrent()) { retry.close(); checkScope() }
            if (retry.code == 401) { retry.close(); invalidate(); checkScope(); throw ApiException(401, "Session expired") }
        }
    } else first
    val result = decode(response)
    checkScope()
    return result
}

/** Both Content-Length and actual streamed bytes are bounded, including error responses. */
internal fun readArtifactJson(response: Response): JSONObject = response.use {
    val body = it.body ?: throw ApiException(it.code, "作品响应为空。")
    val limit = ArtifactReaderPolicy.MAX_RESPONSE_BYTES
    if (!it.isSuccessful) {
        // Do not expose arbitrary response text or read a large error body.
        throw ApiException(it.code, "无法读取作品（HTTP ${it.code}）。")
    }
    require(body.contentLength() <= limit) { "作品响应超过原生读取上限（4 MiB），本次未加载。" }
    val output = ByteArrayOutputStream()
    body.byteStream().use { input ->
        val buffer = ByteArray(8192)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            require(output.size() + count <= limit) { "作品响应超过原生读取上限（4 MiB），本次未加载。" }
            output.write(buffer, 0, count)
        }
    }
    try { JSONObject(output.toString(Charsets.UTF_8.name())) }
    catch (_: Exception) { throw ApiException(it.code, "作品响应格式无效。") }
}

data class ArtifactSource(
    val id: String, val title: String, val type: String, val language: String?,
    val version: Int, val source: String, val updatedAt: String?,
)
data class ArtifactRevision(val version: Int, val source: String, val createdAt: String?)

class ArtifactReaderRepository(private val request: (String, Boolean) -> JSONObject) {
    fun current(id: String): ArtifactSource {
        ArtifactReaderPolicy.requireId(id)
        val row = request(id, false)
        check(row.opt("id") == id) { "服务器返回的作品身份不匹配。" }
        val source = source(row)
        return ArtifactSource(id, string(row, "title"), string(row, "type"), optionalString(row, "language"),
            version(row), source, optionalString(row, "updatedAt"))
    }
    fun versions(id: String): List<ArtifactRevision> {
        ArtifactReaderPolicy.requireId(id)
        val rows = request(id, true).optJSONArray("versions") ?: error("服务器未返回有效版本列表。")
        check(rows.length() <= ArtifactReaderPolicy.MAX_VERSIONS) { "版本超过原生读取上限（100 条），本次未加载历史。" }
        val seen = mutableSetOf<Int>()
        var total = 0L
        return (0 until rows.length()).map { index ->
            val row = rows.optJSONObject(index) ?: error("版本记录格式无效。")
            check(row.opt("artifactId") == id) { "版本记录不属于当前作品。" }
            val number = version(row)
            check(seen.add(number)) { "版本号重复，请刷新后重试。" }
            val source = source(row)
            total += source.length
            check(total <= ArtifactReaderPolicy.MAX_SOURCE_UNITS) { "历史原文合计超过 1,000,000 个 UTF-16 单元，本次未加载历史。" }
            ArtifactRevision(number, source, optionalString(row, "createdAt"))
        }.sortedByDescending { it.version }
    }
    private fun string(row: JSONObject, key: String): String = row.opt(key) as? String ?: error("作品字段 $key 格式无效。")
    private fun optionalString(row: JSONObject, key: String): String? {
        val value = row.opt(key)
        if (value == null || value == JSONObject.NULL) return null
        return value as? String ?: error("作品字段 $key 格式无效。")
    }
    private fun source(row: JSONObject): String = string(row, "source").also {
        check(it.length <= ArtifactReaderPolicy.MAX_SOURCE_UNITS) { "作品原文超过 1,000,000 个 UTF-16 单元，本次未加载。" }
    }
    private fun version(row: JSONObject): Int {
        val value = row.opt("version")
        check(value is Int && value > 0) { "作品版本号格式无效。" }
        return value
    }
}

data class ArtifactReaderState(
    val artifactId: String? = null, val current: ArtifactSource? = null,
    val loading: Boolean = false, val error: String? = null,
    val versions: List<ArtifactRevision> = emptyList(), val versionsLoaded: Boolean = false,
    val versionsLoading: Boolean = false, val versionsError: String? = null,
    val selectedVersion: Int? = null,
) {
    val selectedRevision: ArtifactRevision? get() = versions.firstOrNull { it.version == selectedVersion }
}

/** Only keeps explicitly fetched data in memory. Each refresh/open/close invalidates previous work. */
class ArtifactReaderController(
    private val scope: CoroutineScope,
    private val readCurrent: suspend (String) -> ArtifactSource,
    private val readVersions: suspend (String) -> List<ArtifactRevision>,
    private val onUnauthorized: () -> Unit = {},
) {
    private val mutable = MutableStateFlow(ArtifactReaderState())
    val state = mutable.asStateFlow()
    private var epoch = 0L
    private var currentJob: Job? = null
    private var versionsJob: Job? = null

    @Synchronized fun clear() {
        epoch++; currentJob?.cancel(); versionsJob?.cancel()
        mutable.value = ArtifactReaderState()
    }
    @Synchronized fun open(id: String) {
        clear()
        try { ArtifactReaderPolicy.requireId(id) }
        catch (_: IllegalArgumentException) { mutable.value = ArtifactReaderState(artifactId = id, error = "无效的作品 ID。"); return }
        val token = epoch
        mutable.value = ArtifactReaderState(artifactId = id, loading = true)
        currentJob = scope.launch {
            try {
                val result = readCurrent(id)
                ensureActive()
                check(result.id == id) { "作品身份不匹配。" }
                publish(token) { it.copy(current = result, loading = false) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { failed(token, e, false) }
        }
    }
    @Synchronized fun refresh() {
        val before = mutable.value
        if (!before.loading) before.artifactId?.let(::open)
    }
    @Synchronized fun loadVersions() {
        val before = mutable.value
        val id = before.artifactId ?: return
        if (before.current == null || before.loading || before.versionsLoading || before.versionsLoaded) return
        val token = epoch
        mutable.value = before.copy(versionsLoading = true, versionsError = null)
        versionsJob = scope.launch {
            try {
                val result = readVersions(id)
                ensureActive()
                publish(token) { it.copy(versions = result, versionsLoaded = true, versionsLoading = false) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { failed(token, e, true) }
        }
    }
    @Synchronized fun select(version: Int?) {
        val before = mutable.value
        if (before.loading || before.current == null || (version != null && before.versions.none { it.version == version })) return
        mutable.value = before.copy(selectedVersion = version)
    }
    @Synchronized private fun publish(token: Long, update: (ArtifactReaderState) -> ArtifactReaderState) {
        if (token == epoch) mutable.value = update(mutable.value)
    }
    @Synchronized private fun failed(token: Long, error: Exception, history: Boolean) {
        if (token != epoch) return
        if (error is ApiException && error.statusCode == 401) { clear(); onUnauthorized(); return }
        val message = when {
            error is ApiException && error.statusCode == 404 -> "作品已删除或当前账号不可访问；未将其当作空内容。"
            error is IllegalArgumentException || error is IllegalStateException -> error.message ?: "作品数据无效。"
            else -> "无法读取作品，请手动重试。"
        }
        mutable.value = if (history) mutable.value.copy(versionsLoading = false, versionsError = message)
            else mutable.value.copy(loading = false, error = message)
    }
}
