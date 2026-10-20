package com.socrates.android.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import kotlin.coroutines.coroutineContext

object AgentRunReaderPolicy {
    const val MAX_RESPONSE_BYTES = 1024 * 1024
    const val MAX_JSON_DEPTH = 64
    const val MAX_EVENTS = 80
    const val MAX_ARTIFACTS = 100
    const val MAX_FIELD_UNITS = 100_000
    const val MAX_TOTAL_UNITS = 500_000
    fun requireId(id: String) = require(id.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "无效的运行 ID。" }
}

data class AgentRunDetail(
    val id: String, val task: String, val status: String, val summary: String? = null,
    val error: String? = null, val model: String? = null, val mode: String? = null,
    val kind: String? = null, val source: String? = null, val providerMode: String? = null,
    val sessionId: String? = null, val projectId: String? = null, val workspaceId: String? = null,
    val threadId: String? = null, val startedAt: String? = null, val completedAt: String? = null,
    val usage: String? = null,
)
data class AgentRunArtifact(val id: String, val name: String? = null, val type: String, val language: String? = null, val createdAt: String? = null)
data class AgentRunLogEvent(val runId: String, val sequence: Long, val event: String, val data: String, val createdAt: String? = null)
data class AgentRunSnapshot(val run: AgentRunDetail, val artifacts: List<AgentRunArtifact> = emptyList(), val events: List<AgentRunLogEvent> = emptyList())

/** Bounded JSON-body reader. Errors never include arbitrary server body text and response ownership is always consumed. */
internal fun readAgentRunJson(response: Response): JSONObject = response.use {
    val body = it.body ?: throw ApiException(it.code, "运行详情响应为空。")
    val limit = AgentRunReaderPolicy.MAX_RESPONSE_BYTES
    if (!it.isSuccessful) throw ApiException(it.code, "无法读取运行详情（HTTP ${it.code}）。")
    require(body.contentLength() <= limit) { "运行详情响应超过 1 MiB，本次未加载。" }
    val output = ByteArrayOutputStream()
    body.byteStream().use { input ->
        val buffer = ByteArray(8192)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            require(output.size() + count <= limit) { "运行详情响应超过 1 MiB，本次未加载。" }
            output.write(buffer, 0, count)
        }
    }
    try {
        val raw = Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(output.toByteArray())).toString()
        requireJsonDepth(raw)
        JSONObject(raw)
    }
    catch (_: Exception) { throw ApiException(it.code, "运行详情响应格式无效。") }
}

/** Strictly preflight JSON syntax and nesting before the more permissive org.json parser. */
private fun requireJsonDepth(raw: String) {
    class Scanner {
        private var index = 0
        private fun whitespace() {
            while (index < raw.length && raw[index] in " \t\r\n") index++
        }
        private fun take(ch: Char): Boolean {
            whitespace()
            if (index < raw.length && raw[index] == ch) { index++; return true }
            return false
        }
        private fun expect(ch: Char) { require(take(ch)) { "Invalid JSON" } }
        fun scan() {
            whitespace()
            value(0)
            whitespace()
            require(index == raw.length) { "Invalid JSON trailing content" }
        }
        private fun value(parentDepth: Int) {
            whitespace()
            require(index < raw.length) { "Missing JSON value" }
            when (raw[index]) {
                '{' -> container(parentDepth + 1, true)
                '[' -> container(parentDepth + 1, false)
                '"' -> string()
                't' -> literal("true")
                'f' -> literal("false")
                'n' -> literal("null")
                '-', in '0'..'9' -> number()
                else -> throw IllegalArgumentException("Invalid JSON value")
            }
        }
        private fun container(depth: Int, obj: Boolean) {
            require(depth <= AgentRunReaderPolicy.MAX_JSON_DEPTH) { "运行详情 JSON 嵌套超过 64 层，本次未加载。" }
            index++
            if (take(if (obj) '}' else ']')) return
            while (true) {
                if (obj) { string(); expect(':'); value(depth) } else value(depth)
                if (take(if (obj) '}' else ']')) return
                expect(',')
            }
        }
        private fun string() {
            expect('"')
            while (index < raw.length) {
                val ch = raw[index++]
                when {
                    ch == '"' -> return
                    ch == '\\' -> {
                        require(index < raw.length) { "Invalid JSON escape" }
                        when (raw[index++]) {
                            '"', '\\', '/', 'b', 'f', 'n', 'r', 't' -> Unit
                            'u' -> repeat(4) {
                                require(index < raw.length && (raw[index] in '0'..'9' || raw[index] in 'a'..'f' || raw[index] in 'A'..'F')) { "Invalid JSON unicode escape" }
                                index++
                            }
                            else -> throw IllegalArgumentException("Invalid JSON escape")
                        }
                    }
                    ch.code < 0x20 -> throw IllegalArgumentException("Invalid JSON string")
                }
            }
            throw IllegalArgumentException("Unterminated JSON string")
        }
        private fun literal(text: String) {
            require(raw.regionMatches(index, text, 0, text.length)) { "Invalid JSON literal" }
            index += text.length
        }
        private fun number() {
            if (raw[index] == '-') index++
            require(index < raw.length) { "Invalid JSON number" }
            if (raw[index] == '0') {
                index++
                require(index == raw.length || raw[index] !in '0'..'9') { "Invalid JSON number" }
            } else {
                require(raw[index] in '1'..'9') { "Invalid JSON number" }
                while (index < raw.length && raw[index] in '0'..'9') index++
            }
            if (index < raw.length && raw[index] == '.') {
                index++
                val start = index
                while (index < raw.length && raw[index] in '0'..'9') index++
                require(index > start) { "Invalid JSON fraction" }
            }
            if (index < raw.length && raw[index] in "eE") {
                index++
                if (index < raw.length && raw[index] in "+-") index++
                val start = index
                while (index < raw.length && raw[index] in '0'..'9') index++
                require(index > start) { "Invalid JSON exponent" }
            }
        }
    }
    Scanner().scan()
}

class AgentRunReaderRepository(private val request: (String) -> JSONObject) {
    fun read(id: String): AgentRunSnapshot {
        AgentRunReaderPolicy.requireId(id)
        val response = request(id)
        val runJson = response.optJSONObject("run") ?: error("服务器未返回有效运行详情。")
        check(runJson.opt("id") == id) { "服务器返回的运行身份不匹配。" }
        val budget = TextBudget()
        budget.add(id)
        fun required(row: JSONObject, key: String): String = row.opt(key) as? String
            ?: error("运行字段 $key 格式无效。")
        fun optional(row: JSONObject, key: String): String? {
            val v = row.opt(key)
            if (v == null || v == JSONObject.NULL) return null
            return v as? String ?: error("运行字段 $key 格式无效。")
        }
        val task = budget.add(required(runJson, "task"))
        val status = budget.add(required(runJson, "status"))
        check(status.isNotEmpty()) { "运行状态不能为空。" }
        val usageValue = runJson.opt("usage")
        val usage = when (usageValue) {
            null, JSONObject.NULL -> null
            is JSONObject -> budget.add(usageValue.toString())
            else -> error("运行字段 usage 格式无效。")
        }
        fun runOptional(key: String) = optional(runJson, key)?.let(budget::add)
        val run = AgentRunDetail(id, task, status, runOptional("summary"), runOptional("error"), runOptional("model"),
            runOptional("mode"), runOptional("kind"), runOptional("source"), runOptional("providerMode"),
            runOptional("sessionId"), runOptional("projectId"), runOptional("workspaceId"), runOptional("threadId"),
            runOptional("startedAt"), runOptional("completedAt"), usage)
        val artifactRows = response.optJSONArray("artifacts") ?: error("服务器未返回有效运行产物列表。")
        check(artifactRows.length() <= AgentRunReaderPolicy.MAX_ARTIFACTS) { "运行产物超过原生读取上限（100 条）。" }
        val seen = mutableSetOf<String>()
        val artifacts = (0 until artifactRows.length()).map { i ->
            val row = artifactRows.optJSONObject(i) ?: error("运行产物格式无效。")
            val artifactId = budget.add(required(row, "id"))
            check(seen.add(artifactId)) { "运行产物 ID 重复。" }
            AgentRunArtifact(artifactId, optional(row, "name")?.let(budget::add), budget.add(required(row, "type")),
                optional(row, "language")?.let(budget::add), optional(row, "createdAt")?.let(budget::add))
        }
        val eventRows = response.optJSONArray("events") ?: error("服务器未返回有效运行日志。")
        check(eventRows.length() <= AgentRunReaderPolicy.MAX_EVENTS) { "运行日志超过原生读取上限（80 条）。" }
        var previous = 0L
        val events = (0 until eventRows.length()).map { i ->
            val row = eventRows.optJSONObject(i) ?: error("运行日志格式无效。")
            val eventRunId = row.opt("runId") as? String ?: error("运行日志归属格式无效。")
            budget.add(eventRunId)
            check(eventRunId == id) { "运行日志不属于当前运行。" }
            val rawSequence = row.opt("sequence")
            val sequence = when (rawSequence) {
                is Int -> rawSequence.toLong()
                is Long -> rawSequence
                else -> error("运行日志序号格式无效。")
            }
            check(sequence > previous && sequence > 0) { "运行日志序号必须严格递增。" }
            previous = sequence
            val eventName = budget.add(required(row, "event"))
            val dataJson = row.optJSONObject("data") ?: error("运行日志数据格式无效。")
            val data = budget.add(dataJson.toString())
            AgentRunLogEvent(eventRunId, sequence, eventName, data, optional(row, "createdAt")?.let(budget::add))
        }
        return AgentRunSnapshot(run, artifacts, events)
    }

    private class TextBudget {
        private var total = 0L
        fun add(value: String): String {
            check(value.length <= AgentRunReaderPolicy.MAX_FIELD_UNITS) { "运行详情字段超过 100,000 个 UTF-16 单元。" }
            total += value.length
            check(total <= AgentRunReaderPolicy.MAX_TOTAL_UNITS) { "运行详情文字合计超过 500,000 个 UTF-16 单元。" }
            return value
        }
    }
}

data class AgentRunReaderState(val runId: String? = null, val snapshot: AgentRunSnapshot? = null, val loading: Boolean = false, val error: String? = null)

class AgentRunReaderController(
    private val scope: CoroutineScope,
    private val read: suspend (String) -> AgentRunSnapshot,
    private val onUnauthorized: () -> Unit = {},
) {
    private val mutable = MutableStateFlow(AgentRunReaderState())
    val state = mutable.asStateFlow()
    private var epoch = 0L
    private var job: Job? = null

    @Synchronized fun clear() { epoch++; job?.cancel(); job = null; mutable.value = AgentRunReaderState() }
    @Synchronized fun open(id: String) {
        clear()
        try { AgentRunReaderPolicy.requireId(id) }
        catch (_: IllegalArgumentException) { mutable.value = AgentRunReaderState(runId = id, error = "无效的运行 ID。"); return }
        start(id)
    }
    @Synchronized fun refresh() {
        val before = mutable.value
        val id = before.runId ?: return
        if (before.loading) return
        start(id)
    }
    @Synchronized private fun start(id: String) {
        val token = epoch
        mutable.value = AgentRunReaderState(runId = id, loading = true)
        job = scope.launch {
            try {
                val result = read(id)
                coroutineContext.ensureActive()
                check(result.run.id == id) { "运行身份不匹配。" }
                synchronized(this@AgentRunReaderController) { if (token == epoch) mutable.value = AgentRunReaderState(id, result) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                synchronized(this@AgentRunReaderController) {
                    if (token != epoch) return@synchronized
                    if (e is ApiException && e.statusCode == 401) {
                        epoch++; job = null; mutable.value = AgentRunReaderState(); onUnauthorized()
                    } else {
                        val message = when {
                            e is ApiException && e.statusCode == 404 -> "运行记录不可访问或已删除；未将其当作空日志。"
                            e is IllegalArgumentException || e is IllegalStateException -> e.message ?: "运行详情无效。"
                            else -> "无法读取运行详情，请手动重试。"
                        }
                        mutable.value = AgentRunReaderState(id, loading = false, error = message)
                    }
                }
            }
        }
    }
}
