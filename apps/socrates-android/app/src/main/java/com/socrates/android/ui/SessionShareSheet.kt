package com.socrates.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.socrates.android.data.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionShareSheet(sessionId: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val api = remember { ApiClient(context) }
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var visibility by remember { mutableStateOf("unlisted") }
    var token by remember { mutableStateOf("") }
    fun perform(method: String) {
        if (busy) return
        busy = true; error = null
        scope.launch {
            try {
                val result = withContext(Dispatchers.IO) { api.requestResource(method, "sessions/$sessionId/share", if (method == "POST") JSONObject().put("visibility", visibility) else null) }
                token = if (method == "DELETE") "" else result.optString("token").takeIf { it != "null" }.orEmpty()
                if (method == "GET" && result.optString("visibility") in setOf("public", "unlisted")) visibility = result.optString("visibility")
            } catch (e: Exception) { error = e.message ?: "分享操作失败" }
            finally { busy = false }
        }
    }
    LaunchedEffect(sessionId) { perform("GET") }
    val link = remember(token, api.baseUrl) {
        if (token.isBlank()) "" else api.baseUrl.toHttpUrl().newBuilder().encodedPath("/").query(null).addQueryParameter("share", token).build().toString()
    }
    SocratesSheet(onDismissRequest = { if (!busy) onDismiss() }) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("分享会话链接", style = MaterialTheme.typography.headlineSmall)
            Text("创建链接会让其他人按所选可见性查看会话内容。不要分享密码或私人资料。重新创建会替换旧链接。")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SocratesFilterChip(selected = visibility == "unlisted", onClick = { if (!busy) visibility = "unlisted" }, label = { Text("仅持有链接") })
                SocratesFilterChip(selected = visibility == "public", onClick = { if (!busy) visibility = "public" }, label = { Text("公开") })
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (link.isNotBlank()) {
                Text(link)
                Row {
                    SocratesTextButton(onClick = { clipboard.setText(AnnotatedString(link)) }, enabled = !busy) { Text("复制链接") }
                    SocratesTextButton(onClick = { perform("DELETE") }, enabled = !busy) { Text("撤销链接") }
                }
            }
            SocratesButton(onClick = { perform("POST") }, enabled = !busy) { Text(if (busy) "处理中…" else if (token.isBlank()) "创建分享链接" else "更新分享链接") }
        }
    }
}
