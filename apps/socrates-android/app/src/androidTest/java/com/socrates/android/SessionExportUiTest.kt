package com.socrates.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.socrates.android.data.TranscriptExportFormat
import com.socrates.android.data.TranscriptExportPhase
import com.socrates.android.data.TranscriptExportState
import com.socrates.android.ui.SessionExportSheet
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/** Compiled source coverage only until explicitly run on a device. */
class SessionExportUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun choosingFormatIsSingleSelectAndDoesNotSave() {
        val state = mutableStateOf(TranscriptExportState())
        var saves = 0
        compose.setContent { MaterialTheme {
            SessionExportSheet(state.value, { state.value = state.value.copy(format = it) }, { saves++ }, {})
        } }
        compose.onNodeWithText(TranscriptExportFormat.PLAIN_TEXT.label).performScrollTo().performClick()
        compose.onNode(isSelected() and hasAnyDescendant(hasText(TranscriptExportFormat.PLAIN_TEXT.label))).assertExists()
        assertEquals(TranscriptExportFormat.PLAIN_TEXT, state.value.format)
        assertEquals(0, saves)
    }

    @Test fun saveIsExplicitAndDisclosureIsVisibleAtNarrowWidth() {
        var saves = 0
        compose.setContent { MaterialTheme { Box(Modifier.width(320.dp)) {
            SessionExportSheet(TranscriptExportState(title = "测试会话", messageCount = 12), {}, { saves++ }, {})
        } } }
        compose.onNodeWithText("不是完整备份", substring = true).performScrollTo().assertExists()
        compose.onNodeWithText("正文可能含此前附加的文本资料", substring = true).performScrollTo().assertExists()
        compose.onNodeWithText("文件上限为 5 MB。", substring = true).performScrollTo().assertExists()
        compose.onNodeWithText("保存导出文件").performScrollTo().performClick()
        assertEquals(1, saves)
    }

    @Test fun choosingErrorIsAnnouncedAndCanBeRetried() {
        var saves = 0
        compose.setContent { MaterialTheme {
            SessionExportSheet(TranscriptExportState(error = "暂时无法准备导出"), {}, { saves++ }, {})
        } }
        compose.onNodeWithText("暂时无法准备导出").performScrollTo().assertExists()
        compose.onNodeWithText("保存导出文件").performScrollTo().assertIsEnabled().performClick()
        assertEquals(1, saves)
    }

    @Test fun busyExportDisablesActionsAndKeepsDismissFromClosing() {
        var saves = 0
        var formats = 0
        var dismisses = 0
        compose.setContent { MaterialTheme {
            SessionExportSheet(TranscriptExportState(phase = TranscriptExportPhase.WRITING), { formats++ }, { saves++ }, { dismisses++ })
        } }
        compose.onNodeWithText("正在写入文件…").performScrollTo().assertExists()
        compose.onNodeWithText("关闭").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText(TranscriptExportFormat.MARKDOWN.label).assertDoesNotExist()
        compose.onNodeWithText("保存导出文件").assertDoesNotExist()
        compose.runOnIdle { assertEquals(0, saves + formats + dismisses) }
    }

    @Test fun allBusyPhasesKeepCloseDisabled() {
        val phase = mutableStateOf(TranscriptExportPhase.PREPARING)
        compose.setContent { MaterialTheme {
            SessionExportSheet(TranscriptExportState(phase = phase.value), {}, {}, {})
        } }
        compose.onNodeWithText("关闭").performScrollTo().assertIsNotEnabled()
        compose.runOnIdle { phase.value = TranscriptExportPhase.PICKING }
        compose.onNodeWithText("关闭").performScrollTo().assertIsNotEnabled()
    }

    @Test fun completedExportShowsSuggestedNameAndCanClose() {
        var closes = 0
        compose.setContent { MaterialTheme {
            SessionExportSheet(TranscriptExportState(phase = TranscriptExportPhase.COMPLETE, fileName = "会话.md"), {}, {}, { closes++ })
        } }
        compose.onNodeWithText("保存已完成。建议文件名：会话.md；实际名称以所选位置为准。").performScrollTo().assertExists()
        compose.onNodeWithText("关闭").performScrollTo().assertIsEnabled().performClick()
        assertEquals(1, closes)
    }
}
