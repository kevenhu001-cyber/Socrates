package com.socrates.android

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.socrates.android.data.FeatureItem
import com.socrates.android.ui.DocumentPreview
import com.socrates.android.ui.DocumentPreviewState
import com.socrates.android.ui.DocumentTextPreview
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test

/** Code-only coverage: compile here; device execution is deliberately not requested. */
class DocumentTextSearchUiTest {
    @get:Rule val compose = createComposeRule()
    private fun file(id: String = "document-find") = FeatureItem(id, "notes.txt", "", JSONObject().put("mimeType", "text/plain"))
    private fun preview(text: String, truncated: Boolean = false) = DocumentPreviewState(text = DocumentTextPreview(text, truncated, emptyList()))
    private fun query() = compose.onNode(hasSetTextAction())
    private fun search(value: String) {
        query().performScrollTo().performTextReplacement(value)
        compose.onNodeWithText("查找文字").performScrollTo().performClick()
    }
    private fun waitFor(label: String) {
        compose.waitUntil(5_000) { compose.onAllNodesWithText(label).fetchSemanticsNodes().isNotEmpty() }
    }
    private fun content(text: String, truncated: Boolean = false) {
        compose.setContent {
            MaterialTheme { Column(Modifier.width(320.dp).verticalScroll(rememberScrollState())) {
                DocumentPreview(file(), preview(text, truncated), {}, {})
            } }
        }
    }

    @Test fun findsAcrossSegmentsAndNavigatesWithoutClaimingPdfPages() {
        content("needle" + "x".repeat(5994) + "NEEDLE")
        search("needle")
        waitFor("第 1 / 2 处")
        compose.onNodeWithText("上一处").assertIsNotEnabled()
        compose.onNodeWithText("下一处").performScrollTo().performClick()
        waitFor("文字分段 2 / 2（非原文页码）")
        compose.onNodeWithText("第 2 / 2 处").assertExists()
        compose.onNodeWithText("下一处").assertIsNotEnabled()
        compose.onNodeWithTag("document-text-segment").assertTextEquals("NEEDLE")
    }

    @Test fun matchAcrossSegmentBoundaryRemainsExplicitAndCopyable() {
        content("x".repeat(5999) + "needle")
        search("needle")
        waitFor("第 1 / 1 处")
        compose.onNodeWithText("当前命中跨越文字分段，可用下一段继续阅读；分段不是原文页码。").assertExists()
        compose.onNodeWithText("下一段").performScrollTo().performClick()
        compose.onNodeWithTag("document-text-segment").assertTextEquals("eedle")
    }

    @Test fun editingAndClearingRemoveOldResultsAndRepeatedSearchReturnsToFirst() {
        content("needle" + "x".repeat(5994) + "needle")
        search("needle")
        waitFor("第 1 / 2 处")
        compose.onNodeWithText("下一处").performScrollTo().performClick()
        waitFor("第 2 / 2 处")
        compose.onNodeWithText("查找文字").performScrollTo().performClick()
        waitFor("第 1 / 2 处")
        query().performScrollTo().performTextReplacement("missing")
        compose.onNodeWithText("第 1 / 2 处").assertDoesNotExist()
        compose.onNodeWithText("查找文字").performScrollTo().performClick()
        waitFor("当前提取文字中未找到匹配。")
        compose.onNodeWithText("清除查找").performScrollTo().performClick()
        compose.onNodeWithText("当前提取文字中未找到匹配。").assertDoesNotExist()
        compose.onNodeWithText("查找文字").assertIsNotEnabled()
    }

    @Test fun identityOrContentChangeClearsQueryMatchesAndPosition() {
        val item = mutableStateOf(file())
        val state = mutableStateOf(preview("needle"))
        compose.setContent { MaterialTheme { Column(Modifier.verticalScroll(rememberScrollState())) {
            DocumentPreview(item.value, state.value, {}, {})
        } } }
        search("needle")
        waitFor("第 1 / 1 处")
        compose.runOnIdle { item.value = file("different-file") }
        query().assertTextEquals("")
        compose.onNodeWithText("第 1 / 1 处").assertDoesNotExist()
        search("needle")
        waitFor("第 1 / 1 处")
        compose.runOnIdle { state.value = preview("replacement") }
        query().assertTextEquals("")
        compose.onNodeWithTag("document-text-segment").assertTextEquals("replacement")
    }

    @Test fun truncationAndResultCapAreNeverReportedAsWholeDocumentCoverage() {
        content("x".repeat(1001), truncated = true)
        search("x")
        waitFor("第 1 / 1000 处（仅列出前 1000 处，仍有更多匹配）")
        compose.onNodeWithText("服务器已截断提取内容，以下并非完整文档。").assertExists()
        compose.onNodeWithText("仅查找已加载的提取文字，忽略大小写、按字面匹配；不搜索 PDF 原件或未提取内容。").assertExists()
    }

    @Test fun excessiveQueryIsRejectedWithoutSilentlyTruncatingAndEmptyExtractionHasNoSearch() {
        val state = mutableStateOf(preview("document"))
        compose.setContent { MaterialTheme { Column(Modifier.verticalScroll(rememberScrollState())) {
            DocumentPreview(file(), state.value, {}, {})
        } } }
        query().performScrollTo().performTextReplacement("a".repeat(201))
        compose.onNodeWithText("查找文字").assertIsNotEnabled()
        compose.onNodeWithText("查找文字最多 200 个字符，请缩短后重试。").assertExists()
        compose.runOnIdle { state.value = preview("") }
        compose.onNodeWithText("在提取文字中查找").assertDoesNotExist()
        compose.onNodeWithText("未提取到可显示的文字。扫描件或纯图片文档可能需要 OCR。").assertExists()
    }
}
