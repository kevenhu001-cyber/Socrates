package com.socrates.android

import android.graphics.pdf.PdfDocument
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import com.socrates.android.data.FeatureItem
import com.socrates.android.ui.DocumentPreview
import com.socrates.android.ui.DocumentPreviewState
import com.socrates.android.ui.DocumentTextPreview
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicInteger

/** Compiled on code-only parity passes; execution requires a separately authorized device run. */
class DocumentPreviewUiTest {
    @get:Rule val compose = createComposeRule()
    private fun file(mime: String = "application/pdf") = FeatureItem(
        id = "preview-test", title = "preview.pdf", description = "",
        raw = JSONObject().put("mimeType", mime),
    )

    @Test fun textLoadRecomposesAndTruncationIsExplicit() {
        val state = mutableStateOf(DocumentPreviewState(textLoading = true))
        compose.setContent { MaterialTheme { Column { DocumentPreview(file(), state.value, {}, {}) } } }
        compose.onNodeWithText("正在提取文档文字…").assertExists()
        compose.runOnIdle {
            state.value = DocumentPreviewState(text = DocumentTextPreview("接口返回的文字", true, listOf("页数" to "2")))
        }
        compose.onNodeWithText("接口返回的文字").assertExists()
        compose.onNodeWithText("服务器已截断提取内容，以下并非完整文档。").assertExists()
        compose.onNodeWithText("页数：2").assertExists()
    }

    @Test fun textPagingKeepsSegmentsSelectableWithoutPretendingToBeDocumentPages() {
        val state = DocumentPreviewState(text = DocumentTextPreview("a".repeat(6000) + "末段", false, emptyList()))
        compose.setContent { MaterialTheme { Column(Modifier.verticalScroll(rememberScrollState())) { DocumentPreview(file("text/plain"), state, {}, {}) } } }
        compose.onNodeWithText("文字分段 1 / 2（非原文页码）").assertExists()
        compose.onNodeWithText("下一段").performScrollTo().performClick()
        compose.onNodeWithText("末段").assertExists()
        compose.onNodeWithText("文字分段 2 / 2（非原文页码）").assertExists()
        compose.onNodeWithText("下一段").assertIsNotEnabled()
    }

    @Test fun failedExtractionHasIndependentRetryAndRawPdfIsOptIn() {
        val retries = AtomicInteger()
        val downloads = AtomicInteger()
        compose.setContent {
            MaterialTheme { Column { DocumentPreview(file(), DocumentPreviewState(textError = "提取失败"), { retries.incrementAndGet() }, { downloads.incrementAndGet() }) } }
        }
        compose.onNodeWithText("提取失败").assertExists()
        compose.onNodeWithText("重试预览").performClick()
        assertEquals(1, retries.get())
        assertEquals(0, downloads.get())
        compose.onNodeWithText("PDF 原件").performClick()
        assertEquals(1, downloads.get())
    }

    @Test fun unsupportedMimeDoesNotExposeFileContentActions() {
        val item = file("application/msword")
        compose.setContent { MaterialTheme { Column { DocumentPreview(item, DocumentPreviewState(), {}, {}) } } }
        compose.onNodeWithText("此文件类型暂无原生文档预览，可在对话中附加。").assertExists()
        compose.onNodeWithText("加载提取文字").assertDoesNotExist()
    }

    @Test fun nativePdfRendersRealPagesAndReleasesTemporaryFiles() {
        val bytes = ByteArrayOutputStream().use { output ->
            val document = PdfDocument()
            try {
                repeat(2) { index ->
                    val page = document.startPage(PdfDocument.PageInfo.Builder(300, 400, index + 1).create())
                    page.canvas.drawColor(android.graphics.Color.WHITE)
                    document.finishPage(page)
                }
                document.writeTo(output)
            } finally {
                document.close()
            }
            output.toByteArray()
        }
        compose.setContent { MaterialTheme { Column(Modifier.verticalScroll(rememberScrollState())) { DocumentPreview(file(), DocumentPreviewState(pdfBytes = bytes), {}, {}) } } }
        compose.onNodeWithText("PDF 原件").performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithContentDescription("preview.pdf，第 1 页").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("下一页").performScrollTo().performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithContentDescription("preview.pdf，第 2 页").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("第 2 / 2 页").assertExists()
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        assertTrue(context.cacheDir.listFiles().orEmpty().none { it.name.startsWith("document-preview-") })
    }
}
