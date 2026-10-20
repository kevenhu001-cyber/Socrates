package com.socrates.android.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZonedDateTime

/** Uses the lightweight session summaries. Never claims to search unloaded message bodies. */
object SessionHistory {
    const val MAX_TAGS = 12
    const val MAX_TAG_LENGTH = 30

    fun tags(session: ChatSession): List<String> {
        val rows = session.wire?.optJSONArray("tags") ?: return emptyList()
        return (0 until rows.length()).mapNotNull { (rows.opt(it) as? String)?.takeIf(String::isNotBlank) }.distinct()
    }

    fun knownTags(sessions: List<ChatSession>): List<String> = sessions.flatMap(::tags).distinct().sorted()

    /** Same comma-separated input and bounds as the Web tag editor; reject overflow, don't silently drop tags. */
    fun addTags(current: List<String>, input: String): List<String> {
        val additions = input.split(',', '，').map { it.trim() }.filter(String::isNotEmpty)
        require(additions.all { it.length <= MAX_TAG_LENGTH }) { "每个标签最多 $MAX_TAG_LENGTH 个字符。" }
        val result = (current + additions).distinct()
        require(result.size <= MAX_TAGS) { "每个会话最多 $MAX_TAGS 个标签。" }
        return result
    }

    fun withTags(session: ChatSession, tags: List<String>): ChatSession = session.copy(
        wire = (session.wire?.let { JSONObject(it.toString()) } ?: JSONObject()).put("tags", JSONArray(tags)),
    )

    fun filter(sessions: List<ChatSession>, query: String, archived: Boolean, tag: String? = null): List<ChatSession> {
        val needle = query.trim()
        return sessions.filter { session ->
            SessionActions.isArchived(session) == archived && (tag == null || tag in tags(session)) &&
                (needle.isBlank() || (listOf(session.title, session.topic, session.wire?.opt("preview") as? String ?: "") + tags(session))
                    .any { it.contains(needle, ignoreCase = true) })
        }.sortedWith(compareByDescending<ChatSession> { SessionActions.isPinned(it) }
            .thenByDescending { timestamp(it) ?: Instant.MIN })
    }

    private fun timestamp(session: ChatSession): Instant? = sequenceOf(session.updatedAt, session.createdAt)
        .filterNotNull().mapNotNull { runCatching { Instant.parse(it) }.getOrNull() }.firstOrNull()

    /** Calendar-day boundaries respect the user's time zone, including daylight-saving changes. */
    fun groupLabel(session: ChatSession, now: ZonedDateTime = ZonedDateTime.now()): String {
        if (SessionActions.isPinned(session)) return "已置顶"
        val date = timestamp(session)?.atZone(now.zone)?.toLocalDate() ?: return "日期未知"
        val today = now.toLocalDate()
        return when {
            !date.isBefore(today) -> "今天"
            date == today.minusDays(1) -> "昨天"
            !date.isBefore(today.minusDays(7)) -> "过去 7 天"
            !date.isBefore(today.minusDays(30)) -> "过去 30 天"
            date.year == today.year -> "${date.monthValue}月"
            else -> "${date.year}年"
        }
    }
}

/** The tag endpoint atomically replaces links; an empty list clears tags without deleting the session. */
class SessionTagRepository(private val request: (String, String, JSONObject?) -> JSONObject) {
    fun save(sessionId: String, tags: List<String>): List<String> {
        require(sessionId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "无效的会话 ID。" }
        require(tags.size <= SessionHistory.MAX_TAGS && tags.distinct().size == tags.size &&
            tags.all { it.isNotBlank() && it == it.trim() && it.length <= SessionHistory.MAX_TAG_LENGTH }) { "标签格式无效。" }
        val response = request("PUT", "sessions/$sessionId/tags", JSONObject().put("tags", JSONArray(tags)))
        val saved = response.optJSONArray("tags") ?: throw IllegalStateException("服务器未确认标签保存，请重试。")
        require((0 until saved.length()).all { saved.opt(it) is String }) { "服务器返回的标签格式无效。" }
        return (0 until saved.length()).map { saved.getString(it) }.distinct()
    }
}
