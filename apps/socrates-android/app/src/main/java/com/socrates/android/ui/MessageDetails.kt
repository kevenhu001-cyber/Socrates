package com.socrates.android.ui

import android.content.Intent
import android.net.Uri
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import com.socrates.android.data.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.nio.charset.StandardCharsets

@Composable
fun ToolActivityCard(call: JSONObject) {
    var expanded by remember(call.optString("id")) { mutableStateOf(false) }
    val failed = call.optBoolean("isError") || call.optString("progressPhase") in setOf("failed", "error")
    val phase = call.optString("progressPhase")
    val state = when {
        failed -> "失败"
        phase in setOf("completed", "done") -> "已完成"
        phase in setOf("awaiting", "awaiting_approval") -> "等待确认"
        else -> "进行中"
    }
    SocratesOutlinedCard(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
            SocratesTextButton(onClick = { expanded = !expanded }, contentPadding = PaddingValues(vertical = 4.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(call.optString("name").ifBlank { "工具" }, style = MaterialTheme.typography.titleSmall, color = SocratesDesign.Ink)
                    val status = call.optString("userMessage").ifBlank { call.optString("progressPhase").ifBlank { state } }
                    Text(status.take(160), style = MaterialTheme.typography.bodySmall, color = if (failed) MaterialTheme.colorScheme.error else SocratesDesign.Muted, maxLines = 2)
                }
                Text(if (expanded) "收起" else state, style = MaterialTheme.typography.labelMedium, color = if (failed) MaterialTheme.colorScheme.error else SocratesDesign.Muted)
            }
            if (expanded) {
                Spacer(Modifier.height(6.dp))
                val arguments = call.opt("input")?.takeUnless { it == JSONObject.NULL }
                    ?: call.opt("argumentsText")?.takeUnless { it == JSONObject.NULL }
                arguments?.let { DetailValue("输入", displayJson(it)) }
                call.opt("approval")?.takeUnless { it == JSONObject.NULL }?.let { DetailValue("审批", displayJson(it)) }
                val preview = call.optString("_liveOutput")
                if (preview.isNotBlank()) DetailValue("运行输出", preview)
                val outputs = toolOutputs(call)
                outputs.forEachIndexed { index, output ->
                    when (output.optString("kind")) {
                        "visualization" -> output.optJSONObject("spec")?.let { RichResultView(JSONObject().put("kind", "visualization").put("spec", it), it.optString("template")) }
                        "artifact" -> ArtifactResult(output.optString("fileId"), output.optString("mimeType"), output.optString("name"))
                        "text" -> output.optString("text").takeIf(String::isNotBlank)?.let { DetailValue(if (output.optString("stream") == "stderr") "错误输出" else "结果", it) }
                        else -> DetailValue("结果 ${index + 1}", output.optString("raw").ifBlank { output.toString(2) })
                    }
                }
                call.optJSONArray("results")?.takeIf { it.length() > 0 }?.let { DetailValue("补充结果", displayJson(it)) }
                call.optJSONArray("attachments")?.let { attachments ->
                    for (index in 0 until minOf(attachments.length(), 20)) {
                        val attachment = attachments.optJSONObject(index)
                        if (attachment == null) {
                            DetailValue("附件 ${index + 1}", attachments.opt(index).toString())
                            continue
                        }
                        val fileId = attachment.optString("fileId").ifBlank { attachment.optString("id") }
                        val mime = attachment.optString("mimeType").ifBlank { attachment.optString("mime") }
                        val dataUrl = attachment.optString("dataUrl")
                        when {
                            fileId.isNotBlank() -> ArtifactResult(fileId, mime, attachment.optString("name"))
                            dataUrl.startsWith("data:image/") && dataUrl.length <= 2_000_000 -> RichResultView(JSONObject().put("kind", "artifact").put("mimeType", dataUrl.substringAfter("data:").substringBefore(';')).put("content", dataUrl.substringAfter(',', "")).put("name", attachment.optString("name")), "artifact")
                            else -> DetailValue("附件 · ${attachment.optString("name").ifBlank { "文件" }}", attachment.toString(2))
                        }
                    }
                }
                if (outputs.isEmpty()) {
                    call.opt("output")?.takeUnless { it == JSONObject.NULL }?.let { DetailValue("结果", displayJson(it)) }
                }
                listOf("errorText" to "错误", "error" to "错误", "stderr" to "错误输出", "detail" to "详情").forEach { (key, label) ->
                    call.opt(key)?.takeUnless { it == JSONObject.NULL }?.toString()?.takeIf(String::isNotBlank)?.let { DetailValue(label, it) }
                }
                call.optJSONArray("artifacts")?.let { artifacts ->
                    for (index in 0 until artifacts.length()) {
                        val artifact = artifacts.optJSONObject(index) ?: continue
                        if (toolOutputs(call).none { it.optString("kind") == "artifact" && it.optString("fileId") == artifact.optString("id") }) {
                            ArtifactResult(artifact.optString("id"), artifact.optString("mimeType"), artifact.optString("name"))
                        }
                    }
                }
                call.opt("plan")?.takeUnless { it == JSONObject.NULL }?.let { DetailValue("计划", displayJson(it)) }
                call.opt("steps")?.takeUnless { it == JSONObject.NULL }?.let { DetailValue("步骤", displayJson(it)) }
            }
        }
    }
}

@Composable
private fun DetailValue(label: String, value: String) {
    Column(Modifier.fillMaxWidth().padding(top = 9.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = SocratesDesign.Muted)
        SelectionContainer { Text(value, style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Ink) }
    }
}

private fun toolOutputs(call: JSONObject): List<JSONObject> {
    val persisted = call.optJSONArray("outputs")
    if (persisted != null && persisted.length() > 0) {
        return (0 until persisted.length()).map { index ->
            val item = persisted.opt(index)
            val objectValue = item as? JSONObject
            if (objectValue != null && objectValue.optString("kind") in setOf("visualization", "artifact", "text")) objectValue
            else JSONObject().put("kind", "unknown").put("raw", displayJson(item))
        }
    }
    val result = mutableListOf<JSONObject>()
    val spec = call.optJSONObject("visualization") ?: call.optJSONObject("spec")
        ?: if (call.optString("name") == "render_visualization") call.optJSONObject("input")?.takeIf { it.optInt("version") == 1 } else null
    if (spec != null) result += JSONObject().put("kind", "visualization").put("spec", spec)
    val artifacts = call.optJSONArray("artifacts")
    if (artifacts != null) for (index in 0 until artifacts.length()) {
        val item = artifacts.opt(index)
        val artifact = if (item is JSONObject) item else JSONObject().put("id", item.toString())
        result += JSONObject().put("kind", "artifact").put("fileId", artifact.optString("id"))
            .put("mimeType", artifact.optString("mimeType")).put("name", artifact.optString("name"))
    }
    val output = call.opt("output")
    if (output != null && output != JSONObject.NULL) result += JSONObject().put("kind", "text").put("text", displayJson(output))
    call.optString("stderr").takeIf(String::isNotBlank)?.let { result += JSONObject().put("kind", "text").put("stream", "stderr").put("text", it) }
    return result
}

private fun displayJson(value: Any): String = when (value) {
    is JSONObject -> value.toString(2)
    is JSONArray -> value.toString(2)
    else -> value.toString()
}

@Composable
private fun ArtifactResult(fileId: String, mimeType: String, name: String) {
    if (fileId.isBlank()) return
    val context = LocalContext.current
    var loading by remember(fileId) { mutableStateOf(false) }
    var result by remember(fileId) { mutableStateOf<ArtifactPayload?>(null) }
    var error by remember(fileId) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val normalizedMime = mimeType.ifBlank { "application/octet-stream" }
    LaunchedEffect(fileId, normalizedMime) {
        if (normalizedMime == "text/html" || normalizedMime == "application/xhtml+xml" || normalizedMime.startsWith("image/") || normalizedMime.startsWith("text/")) {
            loading = true
            try {
                val baseUrl = context.getSharedPreferences("socrates_native_settings", 0).getString("baseUrl", ApiClient.DEFAULT_BASE_URL) ?: ApiClient.DEFAULT_BASE_URL
                val bytes = withContext(Dispatchers.IO) { ApiClient(context, baseUrl).downloadFile(fileId, 20 * 1024 * 1024) }
                result = when {
                    normalizedMime.startsWith("image/") -> ArtifactPayload("base64", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP))
                    else -> ArtifactPayload("text", bytes.toString(StandardCharsets.UTF_8))
                }
            } catch (exception: Exception) { error = exception.message ?: "无法读取生成文件。" }
            finally { loading = false }
        }
    }
    Column(Modifier.fillMaxWidth().padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("生成文件 · ${name.ifBlank { fileId }}", style = MaterialTheme.typography.labelMedium, color = SocratesDesign.Muted)
        when {
            loading -> SocratesSpinner(Modifier.size(20.dp))
            result != null && normalizedMime.startsWith("image/") -> RichResultView(JSONObject().put("kind", "artifact").put("mimeType", normalizedMime).put("content", result!!.value).put("encoding", result!!.encoding).put("name", name), "artifact")
            result != null -> RichResultView(JSONObject().put("kind", "artifact").put("mimeType", normalizedMime).put("content", result!!.value).put("name", name), "artifact")
            error != null -> Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        if (!normalizedMime.startsWith("image/") && normalizedMime != "text/html" && normalizedMime != "application/xhtml+xml" && !normalizedMime.startsWith("text/")) {
            SocratesTextButton(onClick = {
                if (loading) return@SocratesTextButton
                loading = true
                scope.launch {
                    try {
                        val baseUrl = context.getSharedPreferences("socrates_native_settings", 0).getString("baseUrl", ApiClient.DEFAULT_BASE_URL) ?: ApiClient.DEFAULT_BASE_URL
                        val bytes = withContext(Dispatchers.IO) { ApiClient(context, baseUrl).downloadFile(fileId, 20 * 1024 * 1024) }
                        val cache = File(context.cacheDir, "generated").apply { mkdirs() }
                        val safeName = name.ifBlank { fileId }.replace(Regex("[^\\p{L}\\p{N}._-]"), "_").take(100)
                        val file = File(cache, safeName).apply { writeBytes(bytes) }
                        val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
                        val view = Intent(Intent.ACTION_VIEW).setDataAndType(uri, normalizedMime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        context.startActivity(Intent.createChooser(view, "打开生成文件"))
                    } catch (exception: Exception) { error = exception.message ?: "无法打开生成文件。" }
                    finally { loading = false }
                }
            }) { Text(if (loading) "正在准备…" else "下载并打开") }
        }
    }
}

private data class ArtifactPayload(val encoding: String, val value: String)

@Composable
internal fun RichResultView(payload: JSONObject, heightTemplate: String) {
    val context = LocalContext.current
    val encoded = remember(payload.toString()) {
        android.util.Base64.encodeToString(payload.toString().toByteArray(StandardCharsets.UTF_8), android.util.Base64.NO_WRAP)
    }
    val webView = remember(context) { createRestrictedResultWebView(context) }
    DisposableEffect(webView) { onDispose { webView.stopLoading(); webView.loadUrl("about:blank"); webView.destroy() } }
    val height = when (heightTemplate) { "geometry_3d", "whiteboard" -> 460.dp; "flowchart", "sequence", "state", "tree", "mindmap", "network", "concept_map" -> 360.dp; else -> 320.dp }
    AndroidView(
        factory = { webView },
        modifier = Modifier.fillMaxWidth().height(height).testTag("socrates-rich-result"),
        update = { view ->
            if (view.tag != encoded) {
                val html = context.assets.open("render/index.html").bufferedReader().use { it.readText() }
                    .replace("data-payload=\"\"", "data-payload=\"$encoded\"")
                view.loadDataWithBaseURL("https://appassets.androidplatform.net/assets/render/", html, "text/html", "UTF-8", null)
                view.tag = encoded
            }
        },
    )
}

internal fun createRestrictedResultWebView(context: android.content.Context): WebView {
    val loader = WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
        .build()
    fun blockedResponse() = WebResourceResponse("text/plain", "UTF-8", ByteArrayInputStream(ByteArray(0)))
    fun localAsset(uri: Uri) = uri.scheme == "https" && uri.host == "appassets.androidplatform.net" && uri.path?.startsWith("/assets/") == true
    fun intercept(uri: Uri) = if (localAsset(uri)) loader.shouldInterceptRequest(uri) ?: blockedResponse() else blockedResponse()

    return WebView(context).apply {
        settings.javaScriptEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.domStorageEnabled = false
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(false)
        settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.safeBrowsingEnabled = true
        webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: android.webkit.WebResourceRequest): WebResourceResponse = intercept(request.url)
            @Suppress("DEPRECATION")
            override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse = intercept(Uri.parse(url))
            override fun shouldOverrideUrlLoading(view: WebView, request: android.webkit.WebResourceRequest): Boolean = !localAsset(request.url)
            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = !localAsset(Uri.parse(url))
        }
    }
}

/** Keep non-tool message metadata separate from the ordered tool rows. */
@Composable
fun MessageDetails(wire: JSONObject?) {
    val sources = wire?.optJSONArray("sources")
    if (sources != null && sources.length() > 0) {
        Text("来源", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp))
        for (i in 0 until sources.length()) {
            val source = sources.optJSONObject(i)
            val title = source?.optString("title")?.ifBlank { source.optString("name") }.orEmpty()
            val url = source?.optString("url").orEmpty()
            SelectionContainer { Text(listOf(title, url).filter(String::isNotBlank).joinToString("\n").ifBlank { sources.opt(i).toString() }, style = MaterialTheme.typography.bodySmall) }
        }
    }
    val attachments = wire?.optJSONArray("attachments")
    if (attachments != null) for (i in 0 until attachments.length()) {
        val attachment = attachments.optJSONObject(i) ?: continue
        if (attachment.optString("kind") != "image" || attachment.optString("dataUrl").isBlank())
            Text("附件 · " + attachment.optString("name").ifBlank { "文件" }, style = MaterialTheme.typography.labelMedium)
    }
}
