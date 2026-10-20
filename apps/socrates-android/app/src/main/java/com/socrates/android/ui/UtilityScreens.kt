package com.socrates.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.graphics.Color

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectionSheet(baseUrl: String, busy: Boolean, error: String?, onSave: (String) -> Unit, onDismiss: () -> Unit) {
    var address by rememberSaveable(baseUrl) { mutableStateOf(baseUrl) }
    SocratesSheet(onDismissRequest = onDismiss, containerColor = Color.White) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("连接 Socrates", style = MaterialTheme.typography.headlineSmall)
            Text("切换服务器会退出当前原生帐号，避免凭据被发送到其他服务器。浏览器登录仅支持生产服务器，不会把生产帐号保存到自定义服务器。", color = SocratesDesign.Muted)
            SocratesField(address, { address = it }, Modifier.fillMaxWidth(), enabled = !busy, label = { Text("API 地址（包含 /api/v2）") }, singleLine = true, shape = RoundedCornerShape(20.dp), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
            Text("生产环境仅支持 HTTPS；调试版本允许连接本机开发服务。", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Muted)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            SocratesButton(onClick = { onSave(address.trim()) }, enabled = !busy && address.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("保存连接") }
        }
    }
}

@Composable
fun WorkSpace(onOpenChat: () -> Unit, onAttach: () -> Unit, onSettings: () -> Unit, onFeature: (String) -> Unit = {}) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Spacer(Modifier.height(24.dp))
        Text("把想法，变成进展。", style = MaterialTheme.typography.headlineMedium)
        Text("与 Socrates 一起思考、整理和探索。", color = SocratesDesign.Muted)
        Spacer(Modifier.height(12.dp))
        listOf(Triple("继续对话", "连接你的 Socrates 会话", onOpenChat), Triple("添加资料", "从设备选择文件作为对话背景", onAttach), Triple("连接设置", "管理你的 Socrates API 服务", onSettings)).forEach { (title, subtitle, action) ->
            SocratesCard(onClick = action, shape = RoundedCornerShape(24.dp), containerColor = Color.White, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(title, style = MaterialTheme.typography.titleMedium)
                    Text(subtitle, color = SocratesDesign.Muted, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        listOf("项目", "资料库", "助手", "定时任务", "图像", "记忆", "模型与服务商", "教学与测验", "插件", "Codex").forEach { feature ->
            SocratesCard(onClick = { onFeature(feature) }, shape = RoundedCornerShape(24.dp), containerColor = Color.White, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(24.dp)) { Text(feature, style = MaterialTheme.typography.titleMedium) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountProfileSheet(onDismiss: () -> Unit) {
    val vm: AuthViewModel = androidx.lifecycle.viewmodel.compose.viewModel()
    val s by vm.state.collectAsStateWithLifecycle()
    var old by remember { mutableStateOf("") }; var next by remember { mutableStateOf("") }; var confirm by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { vm.loadAccount() }
    val sheetState = rememberModalBottomSheetState(confirmValueChange = { target -> !s.busy || target != SheetValue.Hidden })
    SocratesSheet(onDismissRequest={if(!s.busy) onDismiss()},sheetState=sheetState,containerColor=Color.White) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text("帐号资料",style=MaterialTheme.typography.headlineSmall)
            Text("邮箱：${s.user?.optString("email")?.takeIf{it!="null"}.orEmpty()}")
            Text("显示名称：${s.user?.optString("displayName")?.takeIf{it!="null"}.orEmpty().ifBlank{"未设置"}}")
            Text("方案：${s.user?.optString("tier")?.takeIf{it!="null"}.orEmpty().ifBlank{"未提供"}}")
            Text("会话数：${s.usage?.optJSONObject("usage")?.optInt("sessionCount",0) ?: 0}")
            SocratesDivider(); Text("修改密码",style=MaterialTheme.typography.titleMedium)
            SocratesField(old,{old=it},Modifier.fillMaxWidth(),enabled=!s.busy,label={Text("当前密码")},visualTransformation=PasswordVisualTransformation(),singleLine=true)
            SocratesField(next,{next=it},Modifier.fillMaxWidth(),enabled=!s.busy,label={Text("新密码（8–64 位）")},visualTransformation=PasswordVisualTransformation(),singleLine=true)
            SocratesField(confirm,{confirm=it},Modifier.fillMaxWidth(),enabled=!s.busy,label={Text("确认新密码")},visualTransformation=PasswordVisualTransformation(),singleLine=true)
            s.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}; s.message?.let{Text(it,color=MaterialTheme.colorScheme.primary)}
            SocratesButton(onClick={vm.changePassword(old,next,confirm)},enabled=!s.busy,modifier=Modifier.fillMaxWidth()){Text(if(s.busy)"处理中…" else "更新密码")}
            Text("帐号资料目前为只读；后端没有提供原生端可用的资料修改接口。",style=MaterialTheme.typography.bodySmall,color=SocratesDesign.Muted)
        }
    }
}
