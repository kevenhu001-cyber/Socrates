package com.socrates.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.socrates.android.data.*
import com.socrates.android.ui.AgentRunReaderSheet
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/** Source compilation only; real touch, clipboard, accessibility and narrow-screen behavior need a device. */
class AgentRunReaderUiTest {
    @get:Rule val compose = createComposeRule()
    private fun snapshot(id: String = "run-1", task: String = "<script>notExecuted()</script>", events: Int = 0) = AgentRunSnapshot(
        run = AgentRunDetail(id = id, task = task, status = "running"),
        events = (1..events).map { AgentRunLogEvent(runId = id, sequence = it.toLong(), event = "unknown_event", data = "{\"text\":\"payload-$it\"}") },
    )
    private fun click(text: String) {
        compose.onNodeWithTag("agent-run-reader-content").performScrollToNode(hasText(text))
        compose.onNodeWithText(text).performClick()
    }

    @Test fun openingIsReadOnlyAndRefreshRequiresExplicitAction() {
        var reads = 0; val copies = mutableListOf<String>()
        compose.setContent { MaterialTheme {
            AgentRunReaderSheet(AgentRunReaderState(runId = "run-1", snapshot = snapshot()), { reads++ }, {}, copies::add)
        } }
        assertEquals(0, reads); assertEquals(emptyList<String>(), copies)
        compose.onNodeWithText("只读快照；不会创建", substring = true).assertExists()
        compose.onNodeWithText("继续运行").assertDoesNotExist()
        compose.onNodeWithText("重试运行").assertDoesNotExist()
        compose.onNodeWithText("批准运行").assertDoesNotExist()
        click("重新读取运行记录"); assertEquals(1, reads)
    }

    @Test fun loadingDisablesRefreshButAllowsCloseAndDoesNotInventEmptyEvents() {
        var closed = 0
        compose.setContent { MaterialTheme {
            AgentRunReaderSheet(AgentRunReaderState(runId = "run-1", loading = true), {}, { closed++ })
        } }
        compose.onNodeWithText("读取中…").assertIsNotEnabled()
        compose.onNodeWithText("本次快照未返回事件；不代表从未运行。").assertDoesNotExist()
        compose.onNodeWithText("关闭").performClick(); assertEquals(1, closed)
    }

    @Test fun failedSnapshotOffersReadRetryAndNoFakeSuccess() {
        var reads = 0
        compose.setContent { MaterialTheme {
            AgentRunReaderSheet(AgentRunReaderState(runId = "run-1", error = "运行记录已删除或不可访问。"), { reads++ }, {})
        } }
        compose.onNodeWithText("运行记录已删除或不可访问。").assertExists()
        click("重试读取运行记录"); assertEquals(1, reads)
        compose.onNodeWithText("当前读取状态", substring = true).assertDoesNotExist()
    }

    @Test fun taskAndUnknownStatusRemainPlainTextWithoutExecution() {
        val s = snapshot().let { it.copy(run = it.run.copy(status = "future_status")) }
        compose.setContent { MaterialTheme {
            AgentRunReaderSheet(AgentRunReaderState(runId = "run-1", snapshot = s), {}, {})
        } }
        compose.onNodeWithText("当前读取状态：其他状态（见服务端原值）").assertExists()
        compose.onNodeWithTag("agent-run-reader-content").performScrollToNode(hasText("<script>notExecuted()</script>"))
        compose.onNodeWithText("<script>notExecuted()</script>").assertExists()
        compose.onNodeWithTag("agent-run-reader-content").performScrollToNode(hasText("future_status"))
        compose.onNodeWithText("future_status").assertExists()
    }

    @Test fun eventFragmentHasHonestLimitsAndLocalPaginationAt320Dp() {
        compose.setContent { MaterialTheme { Box(Modifier.width(320.dp)) {
            AgentRunReaderSheet(AgentRunReaderState(runId = "run-1", snapshot = snapshot(events = 80)), {}, {})
        } } }
        click("事件片段（80）")
        compose.onNodeWithText("服务端详情只返回最早至多 80 条事件", substring = true).assertExists()
        click("下一页")
        compose.onNodeWithTag("agent-run-reader-content").performScrollToNode(hasText("已返回片段 · 第 2 / 8 页"))
        compose.onNodeWithText("已返回片段 · 第 2 / 8 页").assertExists()
        click("阅读事件 #11 载荷")
        compose.onNodeWithTag("agent-run-reader-content").performScrollToNode(hasText("{\"text\":\"payload-11\"}"))
        compose.onNodeWithText("{\"text\":\"payload-11\"}").assertExists()
        click("概况"); click("事件片段（80）")
        compose.onNodeWithTag("agent-run-reader-content").performScrollToNode(hasText("已返回片段 · 第 1 / 8 页"))
        compose.onNodeWithText("上一页").assertIsNotEnabled()
        compose.onNodeWithText("{\"text\":\"payload-11\"}").assertDoesNotExist()
    }

    @Test fun emptyEventsAndArtifactMetadataDoNotClaimNoWorkOrDownload() {
        val s = snapshot().copy(artifacts = listOf(AgentRunArtifact(id = "art-1", name = "<b>real name</b>", type = "html")))
        compose.setContent { MaterialTheme {
            AgentRunReaderSheet(AgentRunReaderState(runId = "run-1", snapshot = s), {}, {})
        } }
        click("事件片段（0）")
        compose.onNodeWithTag("agent-run-reader-content").performScrollToNode(hasText("本次快照未返回事件；不代表从未运行。"))
        compose.onNodeWithText("本次快照未返回事件；不代表从未运行。").assertExists()
        click("关联作品（1）")
        compose.onNodeWithTag("agent-run-reader-content").performScrollToNode(hasText("<b>real name</b>"))
        compose.onNodeWithText("<b>real name</b>").assertExists()
        compose.onNodeWithText("下载作品").assertDoesNotExist()
    }

    @Test fun replacingSnapshotDestroysEventPayloadAndTabState() {
        val state = mutableStateOf(AgentRunReaderState(runId = "run-1", snapshot = snapshot(events = 1)))
        compose.setContent { MaterialTheme { AgentRunReaderSheet(state.value, {}, {}) } }
        click("事件片段（1）"); click("阅读事件 #1 载荷")
        compose.runOnIdle { state.value = AgentRunReaderState(runId = "run-2", snapshot = snapshot("run-2", "new task", 1)) }
        compose.onNodeWithText("收起事件载荷").assertDoesNotExist()
        compose.onNodeWithText("概况").assertIsSelected()
        compose.onNodeWithTag("agent-run-reader-content").performScrollToNode(hasText("new task"))
        compose.onNodeWithText("new task").assertExists()
    }
}
