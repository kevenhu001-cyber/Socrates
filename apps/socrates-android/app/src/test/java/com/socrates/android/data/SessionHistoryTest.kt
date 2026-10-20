package com.socrates.android.data

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.ZonedDateTime

class SessionHistoryTest {
    private fun session(id: String = "session-1", title: String = "对话", date: String? = null, raw: String = "{}") =
        ChatSession(id = id, title = title, updatedAt = date, wire = JSONObject(raw))

    @Test fun tagsReadOnlyRealStringValuesAndDoNotMutateWire() {
        val row = session(raw = """{"tags":["数学",null,7,"","数学","物理"],"extra":{"x":1}}""")
        assertEquals(listOf("数学", "物理"), SessionHistory.tags(row))
        val changed = SessionHistory.withTags(row, listOf("新标签"))
        assertEquals(1, changed.wire!!.getJSONObject("extra").getInt("x"))
        assertEquals(listOf("数学", "物理"), SessionHistory.tags(row))
        assertEquals(listOf("新标签"), SessionHistory.tags(changed))
    }

    @Test fun vocabularyDeduplicatesAndSortsWithoutInventingTags() {
        val rows = listOf(session(raw = """{"tags":["z","a"]}"""), session(raw = """{"tags":["a","b"]}"""), session())
        assertEquals(listOf("a", "b", "z"), SessionHistory.knownTags(rows))
        assertTrue(SessionHistory.knownTags(emptyList()).isEmpty())
    }

    @Test fun commaInputIsTrimmedDeduplicatedAndBounded() {
        assertEquals(listOf("数学", "physics", "化学"), SessionHistory.addTags(listOf("数学"), " 数学，physics,化学, "))
        assertEquals(emptyList<String>(), SessionHistory.addTags(emptyList(), " ， , "))
        assertThrows(IllegalArgumentException::class.java) { SessionHistory.addTags(emptyList(), "长".repeat(31)) }
        assertThrows(IllegalArgumentException::class.java) { SessionHistory.addTags((1..12).map(Int::toString), "13") }
    }

    @Test fun filtersCombineArchiveExactTagAndSummarySearchWithoutSearchingUnloadedBodies() {
        val rows = listOf(
            session("one", raw = """{"tags":["数学"],"preview":"积分步骤"}"""),
            session("two", raw = """{"tags":["数学分析"],"archivedAt":"2026-10-01T00:00:00Z"}"""),
            session("three", title = "English", raw = """{"tags":[],"messages":[{"content":"隐藏内容"}]}"""),
        )
        assertEquals(listOf("one"), SessionHistory.filter(rows, " 积分 ", false, "数学").map { it.id })
        assertEquals(listOf("three"), SessionHistory.filter(rows, "ENGLISH", false).map { it.id })
        assertEquals(listOf("two"), SessionHistory.filter(rows, "", true, "数学分析").map { it.id })
        assertTrue(SessionHistory.filter(rows, "", true, "数学").isEmpty())
        assertTrue(SessionHistory.filter(rows, "隐藏内容", false).isEmpty())
    }

    @Test fun pinnedRowsAreFirstAndOthersUseLatestTimestampsNotIncomingListOrder() {
        val rows = listOf(session("old", date = "2025-01-01T00:00:00Z"), session("new", date = "2026-01-01T00:00:00Z"),
            session("pinned", date = "2024-01-01T00:00:00Z", raw = """{"pinned":true}"""), session("unknown"))
        assertEquals(listOf("pinned", "new", "old", "unknown"), SessionHistory.filter(rows, "", false).map { it.id })
    }

    @Test fun groupsFollowLocalCalendarDaysAndUnknownDatesAreHonest() {
        val now = ZonedDateTime.parse("2026-10-20T00:30:00+08:00[Asia/Shanghai]")
        assertEquals("今天", SessionHistory.groupLabel(session(date = "2026-10-19T16:00:00Z"), now))
        assertEquals("昨天", SessionHistory.groupLabel(session(date = "2026-10-19T15:59:59Z"), now))
        assertEquals("过去 7 天", SessionHistory.groupLabel(session(date = "2026-10-13T16:00:00Z"), now))
        assertEquals("过去 30 天", SessionHistory.groupLabel(session(date = "2026-10-01T00:00:00Z"), now))
        assertEquals("8月", SessionHistory.groupLabel(session(date = "2026-08-01T00:00:00Z"), now))
        assertEquals("2025年", SessionHistory.groupLabel(session(date = "2025-08-01T00:00:00Z"), now))
        assertEquals("日期未知", SessionHistory.groupLabel(session(date = "invalid"), now))
        assertEquals("已置顶", SessionHistory.groupLabel(session(raw = """{"pinned":true}"""), now))
    }

    @Test fun daylightSavingDoesNotMoveYesterdayIntoPreviousWeek() {
        val now = ZonedDateTime.parse("2026-11-02T00:30:00-05:00[America/New_York]")
        assertEquals("昨天", SessionHistory.groupLabel(session(date = "2026-11-01T04:01:00Z"), now))
    }

    @Test fun tagSaveUsesActualPutContractAndClearSendsAnEmptyArray() {
        val requests = mutableListOf<Triple<String, String, JSONObject?>>()
        val repository = SessionTagRepository { method, path, body -> requests.add(Triple(method, path, body)); JSONObject().put("tags", body!!.getJSONArray("tags")) }
        assertEquals(listOf("数学"), repository.save("real-session", listOf("数学")))
        assertEquals("PUT", requests[0].first)
        assertEquals("sessions/real-session/tags", requests[0].second)
        assertEquals("数学", requests[0].third!!.getJSONArray("tags").getString(0))
        assertTrue(repository.save("real-session", emptyList()).isEmpty())
        assertEquals(0, requests[1].third!!.getJSONArray("tags").length())
    }

    @Test fun invalidTagsOrPathNeverReachNetwork() {
        val repository = SessionTagRepository { _, _, _ -> fail("Must not request invalid input"); JSONObject() }
        listOf(listOf(""), listOf(" tag"), listOf("a", "a"), listOf("x".repeat(31)), (1..13).map(Int::toString)).forEach { tags ->
            assertThrows(IllegalArgumentException::class.java) { repository.save("s1", tags) }
        }
        listOf("../other", "s/tags?x", "https://host", "").forEach { id ->
            assertThrows(IllegalArgumentException::class.java) { repository.save(id, emptyList()) }
        }
    }

    @Test fun errorsAndMissingConfirmationAreNotReportedAsSaved() {
        assertThrows(java.io.IOException::class.java) {
            SessionTagRepository { _, _, _ -> throw java.io.IOException("offline") }.save("s1", listOf("a"))
        }
        assertThrows(IllegalStateException::class.java) {
            SessionTagRepository { _, _, _ -> JSONObject() }.save("s1", emptyList())
        }
        assertThrows(IllegalArgumentException::class.java) {
            SessionTagRepository { _, _, _ -> JSONObject().put("tags", JSONArray().put(42)) }.save("s1", emptyList())
        }
    }
}
