package com.socrates.android.data

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

/** POST /search searches the authenticated account, including archived sessions. No cursor exists. */
enum class SearchScope(val wire: String, val label: String) {
    ALL("all", "全部"), SESSIONS("sessions", "会话"), MESSAGES("messages", "消息全文")
}
data class SearchHit(val kind: String, val id: String, val sessionId: String, val title: String, val snippet: String) {
    val key: String get() = "$kind:$sessionId:$id"
}
class GlobalSearchRepository(private val request: (String, String, JSONObject?) -> JSONObject) {
    companion object {
        const val LIMIT = 50
        const val MAX_QUERY = 200
        private val safeId = Regex("[A-Za-z0-9_-]{1,128}")
        fun validId(value: String) = safeId.matches(value)
        // ts_headline adds these exact delimiters. Everything else stays literal text, never HTML.
        fun plainSnippet(value: String) = value.replace("<mark>", "").replace("</mark>", "")
    }
    fun search(query: String, scope: SearchScope): List<SearchHit> {
        val q = query.trim()
        require(q.isNotEmpty() && q.length <= MAX_QUERY) { "请输入 1–$MAX_QUERY 个字符。" }
        val response = request("POST", "search", JSONObject().put("q", q).put("scope", scope.wire).put("limit", LIMIT))
        val rows = response.optJSONArray("hits") ?: error("服务器未返回搜索结果，请重试。")
        return (0 until minOf(rows.length(), LIMIT)).mapNotNull { index ->
            val row = rows.optJSONObject(index) ?: return@mapNotNull null
            val kind = row.opt("kind") as? String ?: return@mapNotNull null
            val id = row.opt("id") as? String ?: return@mapNotNull null
            val sessionId = row.opt("sessionId") as? String ?: return@mapNotNull null
            if (kind !in setOf("session", "message") || !validId(id) || !validId(sessionId)) return@mapNotNull null
            SearchHit(kind, id, sessionId, (row.opt("title") as? String).orEmpty(),
                plainSnippet((row.opt("snippet") as? String).orEmpty()))
        }.distinctBy { it.key }
    }
}

data class GlobalSearchState(
    val query: String = "", val scope: SearchScope = SearchScope.ALL,
    val loading: Boolean = false, val searched: Boolean = false,
    val hits: List<SearchHit> = emptyList(), val error: String? = null,
)
/** One explicit search per submit; edits invalidate old results immediately, including non-cooperative IO. */
class GlobalSearchController(private val scope: CoroutineScope, private val search: suspend (String, SearchScope) -> List<SearchHit>) {
    private val mutable = MutableStateFlow(GlobalSearchState())
    val state = mutable.asStateFlow()
    private var job: Job? = null
    private var generation = 0L
    @Synchronized fun edit(query: String = mutable.value.query, filter: SearchScope = mutable.value.scope) {
        generation++; job?.cancel()
        mutable.value = GlobalSearchState(query = query, scope = filter)
    }
    fun clear() = edit("", SearchScope.ALL)
    @Synchronized fun submit() {
        val before = mutable.value
        val q = before.query.trim()
        if (q.isEmpty() || q.length > GlobalSearchRepository.MAX_QUERY) {
            mutable.value = before.copy(error = "请输入 1–${GlobalSearchRepository.MAX_QUERY} 个字符。")
            return
        }
        val epoch = ++generation
        job?.cancel()
        mutable.value = before.copy(loading = true, searched = false, hits = emptyList(), error = null)
        job = scope.launch {
            try {
                val hits = search(q, before.scope)
                ensureActive()
                publish(epoch) { it.copy(loading = false, searched = true, hits = hits) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                publish(epoch) { it.copy(loading = false, error = e.message ?: "搜索失败，请重试。") }
            }
        }
    }
    @Synchronized private fun publish(epoch: Long, update: (GlobalSearchState) -> GlobalSearchState) {
        if (epoch == generation) mutable.value = update(mutable.value)
    }
}

object SearchNavigation {
    fun messageId(session: ChatSession, hit: SearchHit): String? =
        if (hit.kind == "message" && session.id == hit.sessionId) session.messages.firstOrNull { it.id == hit.id }?.id else null
}
