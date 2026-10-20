package com.socrates.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.socrates.android.ui.ToolActivityCard
import com.socrates.android.ui.ToolOutputValue
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Compiled source regressions; not device validation until explicitly executed. */
class ToolOutputUiTest {
    @get:Rule val compose = createComposeRule()

    private fun show(content: @Composable () -> Unit) {
        compose.setContent { MaterialTheme { Column(Modifier.verticalScroll(rememberScrollState())) { content() } } }
    }

    private fun click(text: String) { compose.onNodeWithText(text).performScrollTo().performClick() }

    @Test fun codePreviewCanReturnToLiteralSourceAndCopiesOnlyOnRequest() {
        val raw = "```python\nprint('<script>')\n```"
        val copies = mutableListOf<String>()
        show { ToolOutputValue("结果", raw, copyText = { copies += it }) }
        compose.onNodeWithTag("tool-output-text").assertTextEquals("print('<script>')")
        assertEquals(emptyList<String>(), copies)
        click("复制完整原文")
        assertEquals(listOf(raw), copies)
        click("查看原文")
        compose.onNodeWithTag("tool-output-text").assertTextEquals(raw)
        click("返回预览")
        compose.onNodeWithTag("tool-output-text").assertTextEquals("print('<script>')")
    }

    @Test fun jsonFormattingAndHtmlRemainNativeText() {
        show { ToolOutputValue("结果", "{\"html\":\"<img src=x onerror=alert(1)>\"}") }
        compose.onNodeWithText("JSON · 格式化预览").assertExists()
        compose.onNodeWithTag("tool-output-text").assertTextEquals("{\n  \"html\": \"<img src=x onerror=alert(1)>\"\n}")
    }

    @Test fun errorsPreserveFencesAndDoNotOfferFormatting() {
        val raw = "```json\n{\"error\":true}\n```"
        show { ToolOutputValue("错误输出", raw, format = false) }
        compose.onNodeWithTag("tool-output-text").assertTextEquals(raw)
        compose.onNodeWithText("查看原文").assertDoesNotExist()
        compose.onNodeWithText("JSON · 格式化预览").assertDoesNotExist()
    }

    @Test fun longOutputHasExplicitTruncationAndBoundedPageNavigation() {
        show { Box(Modifier.width(320.dp)) { ToolOutputValue("结果", "a".repeat(6000) + "tail") } }
        compose.onNodeWithText("预览已截断", substring = true).assertExists()
        click("分段阅读原文")
        compose.onNodeWithText("上一段").assertIsNotEnabled()
        click("下一段")
        compose.onNodeWithText("原文 · 第 2 / 2 段").assertExists()
        compose.onNodeWithTag("tool-output-text").assertTextEquals("tail")
        compose.onNodeWithText("下一段").assertIsNotEnabled()
        click("上一段")
        click("返回预览")
        compose.onNodeWithText("预览已截断", substring = true).assertExists()
    }

    @Test fun oversizedClipboardRequiresOpeningPagesAndCopiesOnlyCurrentPage() {
        val raw = "x".repeat(60001)
        val copies = mutableListOf<String>()
        show { ToolOutputValue("结果", raw, copyText = { copies += it }) }
        compose.onNodeWithText("复制完整原文").assertDoesNotExist()
        click("打开原文分段")
        assertEquals(emptyList<String>(), copies)
        click("复制当前段原文")
        assertEquals(listOf("x".repeat(6000)), copies)
    }

    @Test fun replacementResetsPageAndCopyFeedback() {
        val raw = mutableStateOf("x".repeat(6000) + "tail")
        show { ToolOutputValue("结果", raw.value, copyText = {}) }
        click("分段阅读原文")
        click("下一段")
        click("复制完整原文")
        compose.onNodeWithText("已复制到系统剪贴板").assertExists()
        compose.runOnIdle { raw.value = "replacement" }
        compose.onNodeWithTag("tool-output-text").assertTextEquals("replacement")
        compose.onNodeWithText("原文 · 第 2 / 2 段").assertDoesNotExist()
        compose.onNodeWithText("已复制到系统剪贴板").assertDoesNotExist()
    }

    @Test fun failedCopyReportsFailureWithoutSuccess() {
        show { ToolOutputValue("结果", "data", copyText = { error("denied") }) }
        click("复制完整原文")
        compose.onNodeWithText("无法复制，请选择文字后重试").assertExists()
        compose.onNodeWithText("已复制到系统剪贴板").assertDoesNotExist()
    }

    @Test fun actualToolCardKeepsTextOutputSafeAndStderrLiteral() {
        val call = JSONObject().put("id", "test").put("name", "python").put("progressPhase", "completed")
            .put("outputs", JSONArray().put(JSONObject().put("kind", "text").put("text", "```python\nprint(1)\n```"))
                .put(JSONObject().put("kind", "text").put("stream", "stderr").put("text", "{\"failure\":true}")))
        show { ToolActivityCard(call) }
        click("python")
        compose.onNodeWithText("print(1)").assertExists()
        compose.onNodeWithText("错误输出").assertExists()
        compose.onNodeWithText("{\"failure\":true}").assertExists()
    }

    private fun readerSpanCount(): Int = compose.onNodeWithTag("tool-output-text")
        .fetchSemanticsNode().config[SemanticsProperties.Text].single().spanStyles.size

    @Test fun labelledCodeUsesOnlyNativeColorSpansAndOriginalClearsThem() {
        val raw = "```python\nif True: print('<script>') # note\n```"
        show { ToolOutputValue("结果", raw) }
        compose.onNodeWithText("代码 · python · 词法着色").assertExists()
        compose.onNodeWithText("颜色仅辅助阅读", substring = true).assertExists()
        assertTrue(readerSpanCount() > 0)
        compose.onNodeWithTag("tool-output-text").assertTextEquals("if True: print('<script>') # note")
        click("查看原文")
        compose.onNodeWithTag("tool-output-text").assertTextEquals(raw)
        assertEquals(0, readerSpanCount())
        compose.onNodeWithText("颜色仅辅助阅读", substring = true).assertDoesNotExist()
        click("返回预览")
        assertTrue(readerSpanCount() > 0)
    }

    @Test fun jsonGetsColorWithoutChangingDisplayedOrCopiedText() {
        val raw = "{\"amount\":9007199254740993,\"safe\":false}"
        val copies = mutableListOf<String>()
        show { ToolOutputValue("结果", raw, copyText = { copies += it }) }
        assertTrue(readerSpanCount() > 0)
        compose.onNodeWithTag("tool-output-text").assertTextEquals("{\n  \"amount\": 9007199254740993,\n  \"safe\": false\n}")
        click("复制完整原文")
        assertEquals(listOf(raw), copies)
    }

    @Test fun unsupportedFenceDoesNotGuessLanguage() {
        show { ToolOutputValue("结果", "```html\n<script>alert(1)</script>\n```") }
        compose.onNodeWithText("代码 · html（无语法高亮）").assertExists()
        compose.onNodeWithTag("tool-output-text").assertTextEquals("<script>alert(1)</script>")
        assertEquals(0, readerSpanCount())
    }

    @Test fun errorAndTruncatedOutputsNeverGetColor() {
        val value = mutableStateOf("```python\nif True: print(1)\n```")
        val format = mutableStateOf(false)
        show { ToolOutputValue("结果", value.value, format = format.value) }
        assertEquals(0, readerSpanCount())
        compose.runOnIdle {
            format.value = true
            value.value = "```python\n" + "if True: print(1)\n".repeat(400) + "```"
        }
        compose.onNodeWithText("预览已截断", substring = true).assertExists()
        assertEquals(0, readerSpanCount())
        click("分段阅读原文")
        assertEquals(0, readerSpanCount())
    }

    @Test fun changingFormatAndSourceClearsOldSpansAndCopyFeedback() {
        val value = mutableStateOf("```ts\nconst value = true;\n```")
        val format = mutableStateOf(true)
        show { ToolOutputValue("结果", value.value, format = format.value, copyText = {}) }
        assertTrue(readerSpanCount() > 0)
        click("复制完整原文")
        compose.runOnIdle { format.value = false }
        assertEquals(0, readerSpanCount())
        compose.onNodeWithText("已复制到系统剪贴板").assertDoesNotExist()
        compose.runOnIdle { format.value = true; value.value = "plain replacement" }
        assertEquals(0, readerSpanCount())
        compose.onNodeWithTag("tool-output-text").assertTextEquals("plain replacement")
    }
}
