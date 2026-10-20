package com.socrates.android.ui

import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.graphics.createBitmap
import com.socrates.android.data.FeatureItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File

// PdfRenderer is native and not interruptible mid-page. Serialize rasterization and bound
// bitmap dimensions; switching files never leaves a renderer/descriptor/temp file open.
// Published bitmaps belong to Compose/Android's GC: do not recycle on disposal while a
// render-thread display list may still reference them. Unpublished failures recycle below.
private val pdfRenderPermit = Semaphore(1)
private data class RenderedPdfPage(val bitmap: Bitmap, val pageCount: Int)
private data class PdfPageState(val page: RenderedPdfPage? = null, val error: String? = null)

private suspend fun renderPdfPage(bytes: ByteArray, pageIndex: Int, cacheDir: File): RenderedPdfPage =
    pdfRenderPermit.withPermit {
        withContext(Dispatchers.IO) {
            ensureActive()
            val temporary = File.createTempFile("document-preview-", ".pdf", cacheDir)
            try {
                temporary.outputStream().use { it.write(bytes) }
                ensureActive()
                ParcelFileDescriptor.open(temporary, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                    PdfRenderer(descriptor).use { renderer ->
                        require(renderer.pageCount > 0) { "PDF 没有可显示的页面。" }
                        renderer.openPage(pageIndex.coerceIn(0, renderer.pageCount - 1)).use { page ->
                            val size = PdfPageSizing.fit(page.width, page.height)
                            val bitmap = createBitmap(size.first, size.second, Bitmap.Config.ARGB_8888)
                            try {
                                bitmap.eraseColor(AndroidColor.WHITE)
                                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                                ensureActive()
                                RenderedPdfPage(bitmap, renderer.pageCount)
                            } catch (error: Throwable) {
                                bitmap.recycle()
                                throw error
                            }
                        }
                    }
                }
            } finally {
                temporary.delete()
            }
        }
    }

@Composable
fun DocumentPreview(item: FeatureItem, state: DocumentPreviewState, retryText: () -> Unit, loadPdf: () -> Unit) {
    if (!DocumentPreviewPolicy.isFile(item.raw)) return
    val pdf = DocumentPreviewPolicy.isPdf(item.raw)
    val textSupported = DocumentPreviewPolicy.canExtractText(item.raw)
    if (!pdf && !textSupported) {
        Text("此文件类型暂无原生文档预览，可在对话中附加。", color = SocratesDesign.Muted, style = MaterialTheme.typography.bodySmall)
        return
    }
    var original by remember(item.id) { mutableStateOf(false) }
    SocratesCard(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("文档预览", style = MaterialTheme.typography.titleSmall)
            if (pdf) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SocratesFilterChip(selected = !original, onClick = { original = false }, label = { Text("提取文字") })
                    SocratesFilterChip(selected = original, onClick = {
                        original = true
                        if (state.pdfBytes == null && !state.pdfLoading) loadPdf()
                    }, label = { Text("PDF 原件") })
                }
            }
            if (original) {
                Text("原件预览限 20 MB，按页显示；加密或损坏的 PDF 可能无法打开。", color = SocratesDesign.Muted, style = MaterialTheme.typography.bodySmall)
                when {
                    state.pdfLoading -> PreviewLoading("正在加载 PDF 原件…")
                    state.pdfError != null -> PreviewError(state.pdfError, loadPdf)
                    state.pdfBytes != null -> key(item.id, state.pdfBytes) { NativePdfPreview(item.title, state.pdfBytes) }
                    else -> SocratesOutlinedButton(onClick = loadPdf) { Text("加载 PDF 原件") }
                }
            } else {
                Text("由服务器提取文字；文档版式、图片、表格与公式可能无法完整保留。", color = SocratesDesign.Muted, style = MaterialTheme.typography.bodySmall)
                when {
                    state.textLoading -> PreviewLoading("正在提取文档文字…")
                    state.textError != null -> PreviewError(state.textError, retryText)
                    state.text != null -> DocumentTextReader(item.id, state.text)
                    else -> SocratesOutlinedButton(onClick = retryText) { Text("加载提取文字") }
                }
            }
        }
    }
}

@Composable
private fun NativePdfPreview(title: String, bytes: ByteArray) {
    val cacheDir = LocalContext.current.cacheDir
    var index by remember(bytes) { mutableIntStateOf(0) }
    var count by remember(bytes) { mutableIntStateOf(0) }
    var retry by remember(bytes) { mutableIntStateOf(0) }
    val state by key(bytes, index, retry) {
        produceState(PdfPageState()) {
            try {
                value = PdfPageState(page = renderPdfPage(bytes, index, cacheDir))
            } catch (error: kotlinx.coroutines.CancellationException) { throw error
            } catch (_: Exception) {
                value = PdfPageState(error = "此页无法渲染。PDF 可能已加密、损坏或不受系统支持；可重试或改看提取文字。")
            }
        }
    }
    val page = state.page
    LaunchedEffect(page?.pageCount) { page?.let { count = it.pageCount } }
    when {
        state.error != null -> PreviewError(state.error!!) { retry++ }
        page == null -> PreviewLoading("正在渲染第 ${index + 1} 页…")
        else -> PdfPageViewport(page.bitmap, "$title，第 ${index + 1} 页", index)
    }
    if (count > 0) {
        Text("第 ${index + 1} / $count 页", color = SocratesDesign.Muted, style = MaterialTheme.typography.labelSmall)
        PreviewPager(index, count, { index-- }, { index++ }, unit = "页", enabled = page != null || state.error != null)
    }
}

@Composable
private fun PreviewPager(index: Int, count: Int, previous: () -> Unit, next: () -> Unit, unit: String, enabled: Boolean = true) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        SocratesOutlinedButton(onClick = previous, enabled = enabled && index > 0, modifier = Modifier.fillMaxWidth()) { Text("上一$unit") }
        SocratesOutlinedButton(onClick = next, enabled = enabled && index + 1 < count, modifier = Modifier.fillMaxWidth()) { Text("下一$unit") }
    }
}

@Composable
private fun PreviewLoading(label: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SocratesSpinner(Modifier.size(20.dp))
        Text(label, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun PreviewError(message: String, retry: () -> Unit) {
    Text(message, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    SocratesOutlinedButton(onClick = retry, modifier = Modifier.fillMaxWidth()) { Text("重试预览") }
}
