package com.socrates.android.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.json.JSONArray
import java.io.IOException

data class TaskRunArtifact(val id: String, val name: String, val type: String)
data class TaskRunDetail(
    val id: String, val status: String, val task: String, val summary: String,
    val error: String, val startedAt: String, val completedAt: String,
    val artifacts: List<TaskRunArtifact>,
)
data class TaskExecutionSnapshot(
    val taskId: String, val title: String, val status: String, val agentKind: String,
    val lastRunAt: String, val runCount: Int, val sessionId: String?, val runId: String?,
    val run: TaskRunDetail? = null, val runError: String? = null,
)
data class TaskExecutionState(
    val taskId: String? = null, val loading: Boolean = false,
    val snapshot: TaskExecutionSnapshot? = null, val error: String? = null,
    val sessionLoading: Boolean = false, val session: ChatSession? = null,
    val sessionError: String? = null,
)

/** The API has no task-scoped history endpoint. Native tasks only persist messages;
 * workspace tasks additionally reference ONE agent run via lastRunId. Never infer
 * task ownership from titles, prompts, or an account-wide run list. */
class TaskExecutionRepository(private val request: (String, String, JSONObject?) -> JSONObject) {
    companion object {
        private val safeId = Regex("[A-Za-z0-9_-]{1,128}")
        fun validId(value: String) = safeId.matches(value)
        private fun text(row: JSONObject, key: String) = (row.opt(key) as? String).orEmpty()
        private fun reference(row: JSONObject, key: String): String? {
            val value = row.opt(key)
            if (value == null || value == JSONObject.NULL || value == "") return null
            require(value is String && validId(value)) { "服务器返回了无效的执行关联，请刷新重试。" }
            return value
        }
    }

    fun runNow(taskId: String): FeatureItem {
        require(validId(taskId)) { "无效的任务 ID。" }
        val result = try {
            request("POST", "scheduled-tasks/$taskId/run", null)
        } catch (e: CancellationException) { throw e
        } catch (e: IOException) {
            if (e is ApiException && e.statusCode in 400..499) throw e
            // One submission only. Transport failure cannot prove execution did not occur.
            throw IOException("运行请求未确认，任务可能仍在执行。请先查看并刷新执行结果，确认后再决定是否重新运行。", e)
        }
        return FeatureModels.items(JSONObject().put("tasks", JSONArray().put(result)), "tasks", listOf("title", "name"))
            .firstOrNull { it.id == taskId }
            ?: error("服务器未返回更新后的任务；请查看并刷新执行结果，不要立即重复运行。")
    }

    fun read(taskId: String): TaskExecutionSnapshot {
        require(validId(taskId)) { "无效的任务 ID。" }
        // There is no GET /scheduled-tasks/:id: refresh the authenticated task list.
        val rows = request("GET", "scheduled-tasks", null).optJSONArray("tasks")
            ?: error("服务器未返回任务列表，请重试。")
        val task = (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }
            .firstOrNull { it.opt("id") == taskId }
            ?: throw ApiException(404, "任务已删除或不可访问，请返回任务列表。")
        val snapshot = TaskExecutionSnapshot(
            taskId = taskId, title = text(task, "title"), status = text(task, "status"),
            agentKind = text(task, "agentKind"), lastRunAt = text(task, "lastRunAt"),
            runCount = task.optInt("runCount", 0).coerceAtLeast(0),
            sessionId = reference(task, "sessionId"), runId = reference(task, "lastRunId"),
        )
        val runId = snapshot.runId ?: return snapshot
        return try {
            val envelope = request("GET", "agent-runs/$runId", null)
            val run = envelope.optJSONObject("run") ?: error("服务器未返回运行详情，请刷新重试。")
            check(run.opt("id") == runId) { "服务器返回的运行记录不匹配，请刷新重试。" }
            val artifacts = envelope.optJSONArray("artifacts")
            val items = (0 until (artifacts?.length() ?: 0)).mapNotNull { index ->
                val artifact = artifacts?.optJSONObject(index) ?: return@mapNotNull null
                val id = text(artifact, "id")
                if (!validId(id)) return@mapNotNull null
                TaskRunArtifact(id, text(artifact, "name"), text(artifact, "type"))
            }.distinctBy { it.id }
            snapshot.copy(run = TaskRunDetail(runId, text(run, "status"), text(run, "task"),
                text(run, "summary"), text(run, "error"), text(run, "startedAt"),
                text(run, "completedAt"), items))
        } catch (e: CancellationException) { throw e
        } catch (e: Exception) {
            if ((e as? ApiException)?.statusCode == 401) throw e
            // Retain the task's real session link when an independent run has disappeared.
            snapshot.copy(runError = if ((e as? ApiException)?.statusCode == 404)
                "最近运行记录已删除或不可访问；仍可查看任务的关联会话。"
                else e.message ?: "运行详情加载失败，请刷新重试。")
        }
    }
}

/** Explicit refresh only, no polling. Closing, switching tasks, refreshing, and account
 * disposal invalidate both reads, even when the underlying blocking IO ignores cancel. */
class TaskExecutionController(
    private val scope: CoroutineScope,
    private val read: suspend (String) -> TaskExecutionSnapshot,
    private val readSession: suspend (String) -> ChatSession,
    private val onUnauthorized: () -> Unit = {},
) {
    private val mutable = MutableStateFlow(TaskExecutionState())
    val state = mutable.asStateFlow()
    private var epoch = 0L
    private var job: Job? = null
    private var sessionJob: Job? = null

    @Synchronized fun open(taskId: String) {
        if (!TaskExecutionRepository.validId(taskId)) return
        epoch++; job?.cancel(); sessionJob?.cancel()
        mutable.value = TaskExecutionState(taskId = taskId)
        refresh()
    }
    @Synchronized fun clear() {
        epoch++; job?.cancel(); sessionJob?.cancel()
        mutable.value = TaskExecutionState()
    }
    @Synchronized fun refresh() {
        val id = mutable.value.taskId ?: return
        if (mutable.value.loading) return
        val generation = ++epoch
        job?.cancel(); sessionJob?.cancel()
        mutable.value = TaskExecutionState(taskId = id, loading = true)
        job = scope.launch {
            try {
                val result = read(id)
                ensureActive()
                check(result.taskId == id) { "任务记录不匹配，请重试。" }
                publish(generation) { it.copy(loading = false, snapshot = result) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                publish(generation) { it.copy(loading = false, error = e.message ?: "执行结果加载失败，请重试。") }
                unauthorized(generation, e)
            }
        }
    }
    @Synchronized fun loadSession() {
        val before = mutable.value
        val id = before.snapshot?.sessionId ?: return
        if (before.loading || before.sessionLoading || !TaskExecutionRepository.validId(id)) return
        val generation = epoch
        mutable.value = before.copy(sessionLoading = true, session = null, sessionError = null)
        sessionJob = scope.launch {
            try {
                val session = readSession(id)
                ensureActive()
                check(session.id == id) { "服务器返回的关联会话不匹配，请重试。" }
                publish(generation) { it.copy(sessionLoading = false, session = session) }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                publish(generation) { it.copy(sessionLoading = false, sessionError = if ((e as? ApiException)?.statusCode == 404)
                    "关联会话已删除或不可访问。" else e.message ?: "关联会话加载失败，请重试。") }
                unauthorized(generation, e)
            }
        }
    }
    @Synchronized private fun publish(generation: Long, update: (TaskExecutionState) -> TaskExecutionState) {
        if (generation == epoch) mutable.value = update(mutable.value)
    }
    @Synchronized private fun unauthorized(generation: Long, e: Exception) {
        if (generation == epoch && (e as? ApiException)?.statusCode == 401) {
            clear(); onUnauthorized()
        }
    }
}
