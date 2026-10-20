package com.socrates.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.socrates.android.data.ArtifactReaderState
import com.socrates.android.data.ArtifactRevision
import com.socrates.android.data.ArtifactSource
import com.socrates.android.ui.ArtifactReaderSheet
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/** Compile-only in this task; these assertions are not device validation. */
class ArtifactComparisonUiTest {
    @get:Rule val compose = createComposeRule()
    private fun state(source: String = "new\n", old: String = "old\n") = ArtifactReaderState(
        artifactId = "a-1", current = ArtifactSource("a-1", "真实作品", "text", null, 3, source, null),
        versionsLoaded = true, versions = listOf(ArtifactRevision(2, old, null)),
    )
    private fun click(text: String) {
        compose.onNodeWithTag("artifact-comparison-content").performScrollToNode(hasText(text))
        compose.onNodeWithText(text).performClick()
    }
    private fun open() {
        compose.onNodeWithTag("artifact-reader-content").performScrollToNode(hasText("选择版本并对比"))
        compose.onNodeWithText("选择版本并对比").performClick()
    }
    private fun computed(summary: String) {
        click("计算所选版本差异")
        compose.waitUntil(5000) { runCatching { compose.onNodeWithText("计算所选版本差异").assertIsEnabled() }.isSuccess }
        compose.onNodeWithTag("artifact-comparison-content").performScrollToNode(hasText(summary))
        compose.onNodeWithText(summary).assertExists()
    }

    @Test fun openingIsReadOnlyAndCalculationIsExplicit() {
        var reads = 0
        val copies = mutableListOf<String>()
        compose.setContent { MaterialTheme { ArtifactReaderSheet(state(), { reads++ }, { reads++ }, {}, {}, copies::add) } }
        open()
        compose.onNodeWithText("起点：历史快照 · 版本 2").assertExists()
        compose.onNodeWithText("终点：当前原文 · 版本 3").assertExists()
        compose.onNodeWithTag("artifact-diff-page").assertDoesNotExist()
        assertEquals(0, reads); assertEquals(emptyList<String>(), copies)
        computed("新增 1 行 · 删除 1 行")
        assertEquals(0, reads); assertEquals(emptyList<String>(), copies)
    }

    @Test fun exactSameVersionNumberDoesNotMergeCurrentAndHistory() {
        val snapshot = state("same\r\n", "same\r\n").copy(versions = listOf(ArtifactRevision(3, "same\r\n", null)))
        compose.setContent { MaterialTheme { ArtifactReaderSheet(snapshot, {}, {}, {}, {}) } }
        open(); computed("两份原文完全相同。")
        compose.onNodeWithTag("artifact-comparison-content").performScrollToNode(hasText("不变 · 起点 1 → 终点 1 · 行尾 CRLF"))
        compose.onNodeWithText("不变 · 起点 1 → 终点 1 · 行尾 CRLF").assertExists()
    }

    @Test fun swapClearsPreviousResultAndReversesCounts() {
        compose.setContent { MaterialTheme { ArtifactReaderSheet(state("", "removed\n"), {}, {}, {}, {}) } }
        open(); computed("新增 0 行 · 删除 1 行")
        click("交换起点与终点")
        compose.onNodeWithTag("artifact-diff-page").assertDoesNotExist()
        computed("新增 1 行 · 删除 0 行")
    }

    @Test fun twoHistoricalRecordsCanBeComparedAndSameRecordIsBlocked() {
        val snapshot = state().copy(versions = listOf(ArtifactRevision(2, "two\n", null), ArtifactRevision(1, "one\n", null)))
        compose.setContent { MaterialTheme { ArtifactReaderSheet(snapshot, {}, {}, {}, {}) } }
        open()
        click("终点：当前原文 · 版本 3")
        compose.onNodeWithText("历史快照 · 版本 2").performClick()
        computed("新增 1 行 · 删除 1 行")
        click("终点：历史快照 · 版本 2")
        compose.onNodeWithText("历史快照 · 版本 1").performClick()
        compose.onNodeWithText("计算所选版本差异").assertIsNotEnabled()
        compose.onNodeWithTag("artifact-diff-page").assertDoesNotExist()
    }

    @Test fun longInputIsRejectedWithoutBlockingOriginalReader() {
        compose.setContent { MaterialTheme { ArtifactReaderSheet(state("x".repeat(120001)), {}, {}, {}, {}) } }
        open(); click("计算所选版本差异")
        compose.waitUntil(5000) { runCatching { compose.onNodeWithText("计算所选版本差异").assertIsEnabled() }.isSuccess }
        compose.onNodeWithTag("artifact-comparison-content").performScrollToNode(hasTestTag("artifact-diff-rejected"))
        compose.onNodeWithTag("artifact-diff-rejected").assertExists()
        compose.onNodeWithTag("artifact-diff-page").assertDoesNotExist()
        compose.onNodeWithText("关闭对比").performClick()
        compose.onNodeWithTag("artifact-reader-content").assertExists()
    }

    @Test fun pagesExposeAllRowsWithoutClaimingOnlyChangedLines() {
        val source = (1..41).joinToString("") { "$it\n" }
        compose.setContent { MaterialTheme { ArtifactReaderSheet(state(source, source), {}, {}, {}, {}) } }
        open(); computed("两份原文完全相同。")
        compose.onNodeWithTag("artifact-diff-page").assertTextEquals("对比第 1 / 2 页 · 共 41 条行记录")
        click("下一页差异")
        compose.onNodeWithTag("artifact-diff-page").assertTextEquals("对比第 2 / 2 页 · 共 41 条行记录")
        compose.onNodeWithText("下一页差异").assertIsNotEnabled()
        compose.onNodeWithTag("artifact-comparison-content").performScrollToNode(hasText("不变 · 起点 41 → 终点 41 · 行尾 LF"))
        compose.onNodeWithText("不变 · 起点 41 → 终点 41 · 行尾 LF").assertExists()
    }

    @Test fun htmlIsLiteralAndCopyContainsOnlyExactLine() {
        val copies = mutableListOf<String>()
        compose.setContent { MaterialTheme { ArtifactReaderSheet(state("<script>x()</script>\r\n", ""), {}, {}, {}, {}, copies::add) } }
        open(); computed("新增 1 行 · 删除 0 行")
        click("复制完整原文")
        assertEquals(listOf("<script>x()</script>\r\n"), copies)
        compose.onNode(hasTestTag("tool-output-text") and hasAnyAncestor(hasTestTag("artifact-comparison-content")))
            .assertTextEquals("<script>x()</script>\r\n")
    }

    @Test fun readerInvalidationDisposesComparisonAndOldData() {
        val snapshot = mutableStateOf(state())
        compose.setContent { MaterialTheme { ArtifactReaderSheet(snapshot.value, {}, {}, {}, {}) } }
        open(); computed("新增 1 行 · 删除 1 行")
        compose.runOnIdle { snapshot.value = ArtifactReaderState() }
        compose.onNodeWithText("关闭对比").assertDoesNotExist()
        compose.onNodeWithTag("artifact-diff-page").assertDoesNotExist()
        compose.onNodeWithText("选择版本并对比").assertDoesNotExist()
    }
}
