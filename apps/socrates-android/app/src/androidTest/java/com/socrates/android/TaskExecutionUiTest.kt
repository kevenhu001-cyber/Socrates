package com.socrates.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.socrates.android.data.*
import com.socrates.android.ui.TaskExecutionSheet
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/** Source regression coverage; deliberately not executed on a device in this iteration. */
class TaskExecutionUiTest {
    @get:Rule val compose = createComposeRule()

    private fun text(value: String): SemanticsNodeInteraction {
        compose.onNodeWithTag("task-execution-content").performScrollToNode(hasText(value))
        return compose.onNodeWithText(value)
    }

    @Test fun nativeWithoutRunExplainsSessionResultsWithoutClaimingNotExecuted() {
        compose.setContent {
            MaterialTheme {
                TaskExecutionSheet(TaskExecutionState(snapshot = TaskExecutionSnapshot(
                    taskId = "task-1", title = "Native task", status = "completed", agentKind = "native",
                    lastRunAt = "2026-01-02", runCount = 2, sessionId = null, runId = null,
                )), {}, {}, {})
            }
        }
        text("普通任务的结果写入关联会话，不生成独立运行记录。").assertExists()
        compose.onNodeWithText("未执行").assertDoesNotExist()
    }

    @Test fun realRunShowsMappedStatusFullSummaryAndFailure() {
        compose.setContent {
            MaterialTheme {
                TaskExecutionSheet(TaskExecutionState(snapshot = TaskExecutionSnapshot(
                    taskId = "t", title = "标题", status = "failed", agentKind = "codex", lastRunAt = "time",
                    runCount = 4, sessionId = null, runId = "r", run = TaskRunDetail(
                        id = "r", status = "failed", task = "task", summary = "摘要全文\n第二行 <b>原文</b>",
                        error = "实际错误", startedAt = "开始", completedAt = "结束", artifacts = emptyList(),
                    ),
                )), {}, {}, {})
            }
        }
        text("失败").assertExists()
        text("摘要全文\n第二行 <b>原文</b>").assertExists()
        text("实际错误").assertExists()
    }

    @Test fun sessionButtonLoadsReadOnlyAndShowsActualRoleAndMessageText() {
        var loaded = 0
        compose.setContent {
            MaterialTheme {
                TaskExecutionSheet(TaskExecutionState(
                    snapshot = TaskExecutionSnapshot("t", "标题", "completed", "native", "", 1, "s", null),
                    session = ChatSession(id = "s", title = "真实会话标题", messages = listOf(
                        ChatMessage(id = "m", role = "assistant", content = "真实消息原文"),
                    )),
                ), {}, { loaded++ }, {})
            }
        }
        text("查看关联会话（只读）").performClick()
        assertEquals(1, loaded)
        text("关联会话：真实会话标题").assertExists()
        text("真实消息原文").assertExists()
        text("此关联会话可能包含其他轮次；不保证其中每条消息都来自本次任务。以下内容只读。").assertExists()
    }

    @Test fun retryAndCloseUseCallbacks() {
        var refreshed = 0
        var dismissed = 0
        compose.setContent {
            MaterialTheme {
                TaskExecutionSheet(TaskExecutionState(error = "网络失败"), { refreshed++ }, {}, { dismissed++ })
            }
        }
        compose.onNodeWithText("重试").performClick()
        compose.onNodeWithText("关闭").performClick()
        assertEquals(1, refreshed)
        assertEquals(1, dismissed)
    }

    @Test fun loadingDisablesRefreshAndSessionLoadingButton() {
        compose.setContent {
            MaterialTheme {
                TaskExecutionSheet(TaskExecutionState(
                    loading = true, sessionLoading = true,
                    snapshot = TaskExecutionSnapshot("t", "标题", "running", "native", "", 1, "s", null),
                ), {}, {}, {})
            }
        }
        text("刷新中…").assertIsNotEnabled()
        text("正在加载会话…").assertIsNotEnabled()
        text("关闭").assertIsEnabled()
    }
}
