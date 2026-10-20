package com.socrates.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONObject

/** Inspect real structured results without executing model-authored HTML or JavaScript. */
@Composable
fun MessageDetails(wire: JSONObject?) {
    val calls = wire?.optJSONArray("toolCalls")
    if (calls != null) for (i in 0 until calls.length()) {
        val call = calls.optJSONObject(i) ?: continue
        var expanded by remember(call.optString("id")) { mutableStateOf(false) }
        SocratesOutlinedCard(Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Column(Modifier.padding(10.dp)) {
                SocratesTextButton(onClick = { expanded = !expanded }) {
                    Text(call.optString("name").ifBlank { "工具" } + " · " + when (call.optString("progressPhase")) { "completed" -> "已完成"; "failed" -> "失败"; else -> call.optString("progressPhase").ifBlank { "执行记录" } })
                }
                if (expanded) {
                    listOf("input" to "输入", "argumentsText" to "参数", "output" to "结果", "errorText" to "错误", "stderr" to "错误输出", "detail" to "详情").forEach { (key, title) ->
                        call.opt(key)?.takeIf { it != JSONObject.NULL && it.toString().isNotBlank() }?.let { value ->
                            Text(title, style = MaterialTheme.typography.labelMedium)
                            SelectionContainer { Text(value.toString(), style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                    val artifacts = call.optJSONArray("artifacts")
                    if (artifacts != null) for (a in 0 until artifacts.length()) {
                        val artifact = artifacts.optJSONObject(a) ?: continue
                        Text("生成文件 · " + artifact.optString("name").ifBlank { artifact.optString("id") }, style = MaterialTheme.typography.bodySmall)
                    }
                    if (call.has("visualization") || call.has("spec")) Text("此结果含交互式可视化，原生端尚不支持交互。", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
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
