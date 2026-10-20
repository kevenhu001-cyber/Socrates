@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.socrates.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.socrates.android.data.ApiClient
import com.socrates.android.data.ChatSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

private data class ResourceFile(val id: String, val name: String, val mime: String, val size: Long, val sessionId: String?)
private data class ResourceProject(val id: String, val name: String)

/**
 * Project resource browser. Sessions are moveable using the session upsert contract. The current
 * files API has no project-file association endpoint: files can only be listed/uploaded/renamed/
 * permanently deleted, so this sheet deliberately never treats unlinking as file deletion.
 */
@Composable
fun ProjectResourcesSheet(projectId: String, onDismiss: () -> Unit, onOpenSession: (String) -> Unit) {
    val context = LocalContext.current
    val api = remember { ApiClient(context) }
    val scope = rememberCoroutineScope()
    val sessions = remember { mutableStateListOf<ChatSession>() }
    val files = remember { mutableStateListOf<ResourceFile>() }
    var showOther by remember { mutableStateOf(false) }
    var tab by remember { mutableStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var moveTarget by remember { mutableStateOf<ChatSession?>(null) }
    var availableProjects by remember { mutableStateOf<List<ResourceProject>>(emptyList()) }

    fun load() {
        loading = true
        error = null
        scope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    val allSessions = api.listSessions()
                    val projectEnvelope = api.requestResource("GET", "projects")
                    val projectRows = projectEnvelope.optJSONArray("projects") ?: JSONArray()
                    val allProjects = (0 until projectRows.length()).mapNotNull { index ->
                        val row = projectRows.optJSONObject(index) ?: return@mapNotNull null
                        val id = row.optString("id")
                        if (id.isBlank() || id == projectId) null else ResourceProject(id, row.optString("name", "项目"))
                    }
                    val allFiles = mutableListOf<ResourceFile>()
                    var cursor: String? = null
                    val seen = mutableSetOf<String>()
                    do {
                        val query = buildMap { put("limit", "200"); cursor?.let { put("cursor", it) } }
                        val page = api.requestResourceQuery("GET", "files", query)
                        val rows = page.optJSONArray("files") ?: JSONArray()
                        for (i in 0 until rows.length()) {
                            val row = rows.optJSONObject(i) ?: continue
                            val id = row.optString("id")
                            if (id.isNotBlank()) allFiles += ResourceFile(id, row.optString("name", "文件"), row.optString("mimeType"), row.optLong("size"), row.optString("sessionId").takeIf { it.isNotBlank() && it != "null" })
                        }
                        cursor = page.optString("nextCursor").takeIf { it.isNotBlank() && it != "null" }
                        if (cursor != null && !seen.add(cursor!!)) throw IllegalStateException("资料库分页游标未前进")
                    } while (cursor != null)
                    Triple(allSessions, allFiles, allProjects)
                }
                sessions.clear(); sessions.addAll(result.first)
                files.clear(); files.addAll(result.second)
                availableProjects = result.third
            } catch (e: Exception) {
                error = e.message ?: "项目资料加载失败"
            } finally { loading = false }
        }
    }

    fun move(session: ChatSession, targetProject: String?) {
        if (busyId != null) return
        busyId = session.id; error = null
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    // List endpoints intentionally omit messages. Load detail before save; saveSession
                    // merges the summary response into the complete wire body, retaining messages.
                    val full = api.getSession(session.id)
                    val wire = JSONObject(full.wire?.toString() ?: "{}")
                    if (targetProject == null) wire.put("projectId", JSONObject.NULL) else wire.put("projectId", targetProject)
                    api.saveSession(full.copy(wire = wire))
                }
                load()
            } catch (e: Exception) { error = e.message ?: "移动会话失败" }
            finally { busyId = null }
        }
    }

    LaunchedEffect(projectId) { load() }

    SocratesSheet(onDismissRequest = { if (busyId == null) onDismiss() }) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("项目资源", style = MaterialTheme.typography.headlineSmall)
                SocratesTextButton(onClick = onDismiss, enabled = busyId == null) { Text("关闭") }
            }
            SocratesTabs(selectedTabIndex = tab) {
                SocratesTab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("会话 (${sessions.count { it.wire?.optString("projectId") == projectId }})") })
                SocratesTab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("资料库 (${files.size})") })
            }
            if (loading) Row(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.Center) { SocratesSpinner() }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 10.dp)) }
            if (!loading && error == null && tab == 0) {
                SocratesTextButton(onClick = { showOther = !showOther }) { Text(if(showOther) "仅看当前项目" else "从其他会话移入此项目") }
                if (sessions.isEmpty()) Text("此项目还没有会话。", modifier = Modifier.padding(16.dp))
                LazyColumn(Modifier.heightIn(max = 430.dp)) {
                    items(sessions.filter { showOther || it.wire?.optString("projectId") == projectId }, key = { it.id }) { session ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column(Modifier.weight(1f)) {
                                Text(session.title.ifBlank { session.topic.ifBlank { "未命名会话" } }, style = MaterialTheme.typography.titleMedium)
                                Text(session.updatedAt.orEmpty(), style = MaterialTheme.typography.bodySmall)
                                SocratesTextButton(onClick = { onOpenSession(session.id) }) { Text("打开会话") }
                            }
                            Column {
                                if (session.wire?.optString("projectId") != projectId) SocratesButton(onClick = { move(session, projectId) }, enabled = busyId == null) { Text("移入此项目") }
                                else SocratesOutlinedButton(onClick = { moveTarget = session }, enabled = busyId == null) { Text("移出项目") }
                                SocratesTextButton(onClick = { moveTarget = session.copy(wire = JSONObject(session.wire?.toString() ?: "{}").put("_moveIn", true)) }, enabled = busyId == null && availableProjects.isNotEmpty() && session.wire?.optString("projectId") == projectId) { Text("移入其他项目") }
                            }
                        }
                        SocratesDivider()
                    }
                }
            }
            if (!loading && error == null && tab == 1) {
                Text("显示完整资料库列表。服务端当前没有项目文件关联/移除接口；不会通过删除文件来模拟移除关联。文件若属于某个项目会话，可在会话内容中查看。", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 10.dp))
                if (files.isEmpty()) Text("资料库为空。", modifier = Modifier.padding(16.dp))
                LazyColumn(Modifier.heightIn(max = 370.dp)) {
                    items(files, key = { it.id }) { file ->
                        Column(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
                            Text(file.name, style = MaterialTheme.typography.titleMedium)
                            Text("${file.mime.ifBlank { "未知类型" }} · ${file.size} bytes" + (file.sessionId?.let { " · 会话附件" } ?: ""), style = MaterialTheme.typography.bodySmall)
                        }
                        SocratesDivider()
                    }
                }
            }
            if (!loading && error != null) SocratesButton(onClick = { load() }, modifier = Modifier.padding(bottom = 20.dp)) { Text("重试") }
        }
    }

    moveTarget?.takeIf { it.wire?.optBoolean("_moveIn") != true }?.let { session ->
        SocratesAlert(
            onDismissRequest = { if (busyId == null) moveTarget = null },
            title = { Text("移出项目？") },
            text = { Text("会话将保留并移至未归属项目状态，不会删除会话内容。") },
            confirmButton = { SocratesTextButton(onClick = { moveTarget = null; move(session, null) }, enabled = busyId == null) { Text("移出") } },
            dismissButton = { SocratesTextButton(onClick = { moveTarget = null }) { Text("取消") } },
        )
    }
    moveTarget?.takeIf { it.wire?.optBoolean("_moveIn") == true }?.let { markedSession ->
        SocratesAlert(
            onDismissRequest = { if (busyId == null) moveTarget = null },
            title = { Text("选择目标项目") },
            text = {
                Column {
                    availableProjects.forEach { destination ->
                        SocratesTextButton(onClick = {
                            moveTarget = null
                            move(markedSession, destination.id)
                        }, enabled = busyId == null) { Text(destination.name) }
                    }
                    if (availableProjects.isEmpty()) Text("没有其他项目。")
                }
            },
            confirmButton = { SocratesTextButton(onClick = { moveTarget = null }) { Text("取消") } },
        )
    }
}
