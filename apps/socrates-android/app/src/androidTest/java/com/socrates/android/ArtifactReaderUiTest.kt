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

/** Source regressions only: compiled, not executed without an explicitly authorized device. */
class ArtifactReaderUiTest {
    @get:Rule val compose = createComposeRule()
    private fun current(source: String = "<script>untrusted()</script>") = ArtifactSource("a-1", "真实记录标题", "html", null, 3, source, null)
    private fun click(text: String) {
        compose.onNodeWithTag("artifact-reader-content").performScrollToNode(hasText(text))
        compose.onNodeWithText(text).performClick()
    }

    @Test fun sourceIsLiteralAndCopyIsExplicitAndHistoryIsNotAutomatic() {
        var history = 0
        val copies = mutableListOf<String>()
        compose.setContent { MaterialTheme {
            ArtifactReaderSheet(ArtifactReaderState(artifactId = "a-1", current = current()), {}, { history++ }, {}, {}, copies::add)
        } }
        compose.onNodeWithTag("tool-output-text").assertTextEquals("<script>untrusted()</script>")
        assertEquals(emptyList<String>(), copies); assertEquals(0, history)
        click("复制完整原文"); assertEquals(listOf("<script>untrusted()</script>"), copies)
        click("读取历史版本"); assertEquals(1, history)
    }

    @Test fun selectingHistoryAndReturningCurrentUsesExactSnapshotAndResetsReader() {
        val state = mutableStateOf(ArtifactReaderState(artifactId = "a-1", current = current("current"), versionsLoaded = true,
            versions = listOf(ArtifactRevision(2, "old source", null))))
        compose.setContent { MaterialTheme {
            ArtifactReaderSheet(state.value, {}, {}, { state.value = state.value.copy(selectedVersion = it) }, {})
        } }
        click("阅读版本 2")
        compose.onNodeWithTag("tool-output-text").assertTextEquals("old source")
        click("返回当前原文")
        compose.onNodeWithTag("tool-output-text").assertTextEquals("current")
    }

    @Test fun loadingBlocksRefreshButNotCloseAndDoesNotInventEmptyContent() {
        var closed = 0
        compose.setContent { MaterialTheme {
            ArtifactReaderSheet(ArtifactReaderState(artifactId = "a-1", loading = true), {}, {}, {}, { closed++ })
        } }
        compose.onNodeWithText("读取中…").assertIsNotEnabled()
        compose.onNodeWithText("此记录的原文为空。").assertDoesNotExist()
        compose.onNodeWithText("关闭").performClick(); assertEquals(1, closed)
    }

    @Test fun failedHistoryKeepsCurrentAndOffersIndependentRetry() {
        var retries = 0
        compose.setContent { MaterialTheme {
            ArtifactReaderSheet(ArtifactReaderState(artifactId = "a-1", current = current("body"), versionsError = "历史读取失败"), {}, { retries++ }, {}, {})
        } }
        compose.onNodeWithTag("tool-output-text").assertTextEquals("body")
        click("重试读取历史版本"); assertEquals(1, retries)
        compose.onNodeWithText("历史读取失败").assertExists()
    }

    @Test fun emptyHistoryExplainsMissingSnapshotsWithoutInventingInitialVersion() {
        compose.setContent { MaterialTheme {
            ArtifactReaderSheet(ArtifactReaderState(artifactId = "a-1", current = current(""), versionsLoaded = true), {}, {}, {}, {})
        } }
        compose.onNodeWithText("此记录的原文为空。").assertExists()
        compose.onNodeWithTag("artifact-reader-content").performScrollToNode(hasText("服务端没有保存的版本快照", substring = true))
        compose.onNodeWithText("服务端没有保存的版本快照", substring = true).assertExists()
        compose.onNodeWithText("阅读版本 1").assertDoesNotExist()
    }

    @Test fun longSourceCanReadAllSegmentsWithoutFormattingOrSilentLoss() {
        compose.setContent { MaterialTheme {
            ArtifactReaderSheet(ArtifactReaderState(artifactId = "a-1", current = current("x".repeat(6000) + "尾部😀")), {}, {}, {}, {})
        } }
        click("分段阅读原文")
        click("下一段")
        compose.onNodeWithTag("tool-output-text").assertTextEquals("尾部😀")
        compose.onNodeWithText("下一段").assertIsNotEnabled()
    }
}
