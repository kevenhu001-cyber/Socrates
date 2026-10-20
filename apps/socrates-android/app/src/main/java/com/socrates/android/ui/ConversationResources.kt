@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.socrates.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.socrates.android.data.ApiClient
import com.socrates.android.data.ChatMessage
import com.socrates.android.data.ChatSession
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

data class ConversationFile(val id: String?, val name: String, val mime: String)

/** Uses only the actual messages, with durable file ids deduplicated in first-use order. */
fun conversationFiles(messages: List<ChatMessage>): List<ConversationFile> {
    val files = linkedMapOf<String, ConversationFile>()
    messages.forEach { message ->
        val attachments = message.wire?.optJSONArray("attachments")
        if (attachments != null) for (index in 0 until attachments.length()) {
            val row = attachments.optJSONObject(index) ?: continue
            val id = (row.opt("fileId") as? String)?.takeIf(String::isNotBlank)
            val name = (row.opt("name") as? String)?.takeIf(String::isNotBlank) ?: "附件"
            val mime = (row.opt("mime") as? String)?.takeIf(String::isNotBlank) ?: "application/octet-stream"
            files.putIfAbsent(id ?: "${message.id}:$index", ConversationFile(id, name, mime))
        }
        if ((attachments == null || attachments.length() == 0) && message.attachmentName != null) {
            files.putIfAbsent(message.id, ConversationFile(null, message.attachmentName, if (message.imageDataUrl != null) "image/*" else "application/octet-stream"))
        }
    }
    return files.values.toList()
}

@Composable
internal fun ConversationFiles(messages: List<ChatMessage>, onDismiss: () -> Unit, onUseFile: (String, String, String) -> Unit) {
    val files = remember(messages) { conversationFiles(messages) }
    SocratesSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().padding(20.dp)) {
            Text("已上传文件", style = MaterialTheme.typography.headlineSmall)
            if (files.isEmpty()) Text("此聊天尚未上传文件。", Modifier.padding(vertical = 28.dp), color = SocratesDesign.Muted)
            LazyColumn(Modifier.heightIn(max = 420.dp).padding(top = 12.dp)) {
                items(files) { file ->
                    SocratesMenuItem(text = { Column { Text(file.name); Text(if (file.id == null) "此历史附件没有可重复引用的文件记录" else "附加到下一条消息", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted) } },
                        onClick = { file.id?.let { onUseFile(it, file.name, file.mime) } }, enabled = file.id != null,
                        leadingIcon = { ReferenceIcon(ReferenceGlyph.Paperclip) })
                }
            }
            SocratesTextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.End)) { Text("关闭") }
        }
    }
}

@Composable
internal fun ConversationProjectPicker(session: ChatSession, baseUrl: String, onDismiss: () -> Unit, onAuthLost: () -> Unit,
    onMoved: (ChatSession) -> Unit, onError: (String) -> Unit) {
    val context = LocalContext.current
    val api = remember(baseUrl) { ApiClient(context, baseUrl, onAuthLost) }
    val scope = rememberCoroutineScope()
    var projects by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var revision by remember { mutableStateOf(0) }
    val currentProject = session.wire?.optString("projectId").orEmpty()
    val readGeneration = remember { java.util.concurrent.atomic.AtomicInteger(0) }
    DisposableEffect(Unit) { onDispose { readGeneration.incrementAndGet() } }
    LaunchedEffect(revision, baseUrl, session.id) {
        val generation = readGeneration.incrementAndGet()
        loading = true; error = null
        try {
            val rows = withContext(Dispatchers.IO) {
                val rows = api.requestResource("GET", "projects").optJSONArray("projects")
                if (rows == null) emptyList() else (0 until rows.length()).mapNotNull { i ->
                    rows.optJSONObject(i)?.let { row ->
                        val id = row.optString("id")
                        if (id.isBlank()) null else id to row.optString("name").ifBlank { "未命名项目" }
                    }
                }
            }
            if (readGeneration.get() == generation) projects = rows
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { if (readGeneration.get() == generation) error = e.message ?: "无法读取项目" }
        finally { if (readGeneration.get() == generation) loading = false }
    }
    fun move(id: String?) {
        if (busy) return
        busy = true; error = null
        scope.launch {
            try {
                val wire = JSONObject(session.wire?.toString() ?: "{}")
                wire.put("projectId", id ?: JSONObject.NULL)
                withContext(Dispatchers.IO) { api.requestResource("PATCH", "sessions/${session.id}", JSONObject().put("projectId", id ?: JSONObject.NULL)) }
                onMoved(session.copy(wire = wire))
            } catch (e: Exception) { error = e.message ?: "无法移动聊天"; onError(error!!) }
            finally { busy = false }
        }
    }
    SocratesSheet(onDismissRequest = { if (!busy) onDismiss() }) {
        Column(Modifier.fillMaxWidth().padding(20.dp)) {
            Text("添加到项目", style = MaterialTheme.typography.headlineSmall)
            Text(session.title.ifBlank { "当前聊天" }, Modifier.padding(top = 8.dp, bottom = 16.dp), color = SocratesDesign.Muted)
            if (loading || busy) SocratesSpinner(Modifier.align(Alignment.CenterHorizontally).padding(12.dp))
            error?.let { Text(it, color = MaterialTheme.colorScheme.error); SocratesTextButton(onClick = { revision++ }, enabled = !busy) { Text("重试") } }
            if (!loading && projects.isEmpty() && error == null) Text("还没有项目，请先在项目页创建。", Modifier.padding(vertical = 20.dp), color = SocratesDesign.Muted)
            LazyColumn(Modifier.heightIn(max = 380.dp)) {
                items(projects, key = { it.first }) { (id, name) ->
                    SocratesMenuItem(text = { Text(name) }, onClick = { move(id) }, enabled = !busy && id != currentProject,
                        leadingIcon = { ReferenceIcon(ReferenceGlyph.Folder) },
                        trailingIcon = if (id == currentProject) ({ ReferenceIcon(ReferenceGlyph.Check, "当前项目", tint = SocratesDesign.Ink) }) else null)
                }
                if (currentProject.isNotBlank() && currentProject != "null") item {
                    SocratesMenuItem({ Text("移出当前项目") }, { move(null) }, enabled = !busy, leadingIcon = { ReferenceIcon(ReferenceGlyph.Close) })
                }
            }
            SocratesTextButton(onClick = onDismiss, enabled = !busy, modifier = Modifier.align(Alignment.End)) { Text("取消") }
        }
    }
}
