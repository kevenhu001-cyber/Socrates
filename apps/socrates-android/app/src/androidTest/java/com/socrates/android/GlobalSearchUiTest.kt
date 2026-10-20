package com.socrates.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.socrates.android.data.*
import com.socrates.android.ui.GlobalSearchSheet
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Source compilation only in this iteration; execution requires an explicitly authorized device. */
class GlobalSearchUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun editsScopesAndExplicitSubmitUseCallbacks() {
        var edited = ""
        var filter = SearchScope.ALL
        var submitted = 0
        compose.setContent {
            MaterialTheme {
                GlobalSearchSheet(GlobalSearchState(query = "query"), emptyList(), false, true, null,
                    { q, s -> edited = q; filter = s }, { submitted++ }, {}, {})
            }
        }
        compose.onNodeWithText("消息全文").performClick()
        assertEquals(SearchScope.MESSAGES, filter)
        assertEquals("query", edited)
        compose.onNodeWithText("搜索", useUnmergedTree = true).performClick()
        assertEquals(1, submitted)
    }

    @Test fun messageHitUsesKnownSessionTitleAndLiteralSnippet() {
        val hit = SearchHit("message", "m1", "s1", "", "<script>literal</script>")
        var selected: SearchHit? = null
        compose.setContent {
            MaterialTheme {
                GlobalSearchSheet(GlobalSearchState(query = "query", searched = true, hits = listOf(hit)),
                    listOf(ChatSession(id = "s1", title = "真实会话标题")), false, true, null,
                    { _, _ -> }, {}, { selected = it }, {})
            }
        }
        compose.onNodeWithText("<script>literal</script>").performScrollTo().assertExists()
        compose.onNodeWithText("真实会话标题").performClick()
        assertEquals(hit, selected)
    }

    @Test fun failedSearchCanRetryAndEmptyStateIsNotShownAsUnsearched() {
        var retried = 0
        compose.setContent {
            MaterialTheme {
                GlobalSearchSheet(GlobalSearchState(query = "query", error = "网络失败"), emptyList(), false, true, null,
                    { _, _ -> }, { retried++ }, {}, {})
            }
        }
        compose.onNodeWithText("网络失败").performScrollTo().assertExists()
        compose.onNodeWithText("重试搜索").performScrollTo().performClick()
        assertEquals(1, retried)
        compose.onNodeWithText("没有匹配结果，可调整关键词或检索范围。").assertDoesNotExist()
    }

    @Test fun openingDisablesResultAndKeepsCloseAvailable() {
        var opened = 0
        var dismissed = 0
        compose.setContent {
            MaterialTheme {
                GlobalSearchSheet(GlobalSearchState(query = "query", searched = true,
                    hits = listOf(SearchHit("session", "s1", "s1", "结果标题", "摘录"))),
                    emptyList(), true, false, null, { _, _ -> }, {}, { opened++ }, { dismissed++ })
            }
        }
        compose.onNodeWithText("结果标题").performScrollTo().assertIsNotEnabled()
        assertEquals(0, opened)
        compose.onNodeWithText("关闭").performScrollTo().performClick()
        assertEquals(1, dismissed)
    }
}
