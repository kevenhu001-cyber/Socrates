package com.socrates.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.socrates.android.data.ApiClient
import com.socrates.android.data.BrowserLoginHandoff

/** Chrome still owns authentication. This page never collects credentials or adopts a session. */
@Composable
fun AuthFlowSheet(
    onDismiss: () -> Unit,
    openBrowser: (() -> BrowserLogin.Result)? = null,
    baseUrl: String = ApiClient.DEFAULT_BASE_URL,
) {
    val context = LocalContext.current
    // A connection change must not keep a previous server's launch status.
    var opened by rememberSaveable(baseUrl) { mutableStateOf(false) }
    var error by rememberSaveable(baseUrl) { mutableStateOf<String?>(null) }
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
            dismissOnBackPress = false,
            dismissOnClickOutside = false,
        ),
    ) {
        BackHandler(onBack = onDismiss)
        LoginLanding(
            opened = opened,
            error = error,
            onDismiss = onDismiss,
            onContinue = {
                when (openBrowser?.invoke() ?: BrowserLogin.open(context, baseUrl)) {
                    BrowserLogin.Result.Opened -> { opened = true; error = null }
                    BrowserLogin.Result.ChromeUnavailable -> {
                        opened = false
                        error = "未找到可用的 Chrome。请安装或启用 Chrome 后重试。"
                    }
                    BrowserLogin.Result.LaunchFailed -> {
                        opened = false
                        error = if (!BrowserLoginHandoff.productionBase(baseUrl))
                            "浏览器登录仅支持生产服务器；自定义服务器帐号保持不变，请在连接设置切回生产服务器。"
                        else "系统不允许启动 Chrome。请检查设备的浏览器访问限制后重试。"
                    }
                }
            },
            modifier = Modifier.fillMaxSize().background(Color.White)
                .windowInsetsPadding(WindowInsets.safeDrawing),
        )
    }
}

/** Bounded, scroll-first content: no fixed-height hero, weighted gaps or bottom-pinned CTA. */
@Composable
internal fun LoginLanding(
    opened: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onContinue: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier) {
        // Center independently of the close control's width; 44dp target on both sides.
        Box(Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(horizontal = 16.dp)) {
            Text(
                "Socrates",
                modifier = Modifier.align(Alignment.Center).padding(horizontal = 52.dp).testTag("login-brand"),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = SocratesDesign.Ink,
                textAlign = TextAlign.Center,
            )
            SocratesIconButton(onClick = onDismiss, modifier = Modifier.align(Alignment.CenterEnd)) {
                ReferenceIcon(ReferenceGlyph.Close, "关闭登录", tint = SocratesDesign.Ink)
            }
        }
        BoxWithConstraints(Modifier.fillMaxWidth().weight(1f).testTag("login-viewport")) {
            // Scroll measures unbounded vertically. Set its *content* minimum to the finite
            // viewport, so it centers on tall windows and grows naturally on short/large-type ones.
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                    .heightIn(min = maxHeight).padding(horizontal = 24.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Column(
                    Modifier.widthIn(max = 400.dp).fillMaxWidth().testTag("login-content"),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        "欢迎使用 Socrates",
                        modifier = Modifier.fillMaxWidth().semantics { heading() },
                        style = MaterialTheme.typography.headlineMedium.copy(fontSize = 30.sp, lineHeight = 38.sp),
                        fontWeight = FontWeight.SemiBold,
                        color = SocratesDesign.Ink,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "登录，让思考继续。",
                        style = MaterialTheme.typography.bodyLarge,
                        color = SocratesDesign.Muted,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(32.dp))
                    error?.let {
                        Text(
                            it,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                                .semantics { liveRegion = LiveRegionMode.Assertive },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    SocratesButton(
                        onClick = onContinue,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("login-continue"),
                        shape = CircleShape,
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 14.dp),
                    ) {
                        ReferenceIcon(ReferenceGlyph.Globe, null, Modifier.size(20.dp))
                        Spacer(Modifier.width(10.dp))
                        Text(
                            if (opened) "重新打开 Chrome" else "通过 Chrome 继续",
                            modifier = Modifier.weight(1f, fill = false),
                            style = MaterialTheme.typography.titleMedium,
                            textAlign = TextAlign.Center,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    SocratesTextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                        Text("返回应用，保留草稿", textAlign = TextAlign.Center)
                    }
                    if (opened) {
                        Text(
                            "已打开 Chrome；完成登录后将返回此应用。",
                            modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
                                .semantics { liveRegion = LiveRegionMode.Polite },
                            style = MaterialTheme.typography.bodyMedium,
                            color = SocratesDesign.Ink,
                            textAlign = TextAlign.Center,
                        )
                    }
                    Spacer(Modifier.height(28.dp))
                    SocratesDivider()
                    Spacer(Modifier.height(20.dp))
                    Column(
                        Modifier.fillMaxWidth().background(SocratesDesign.Selected, RoundedCornerShape(16.dp))
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("在浏览器中安全登录", style = MaterialTheme.typography.titleSmall, color = SocratesDesign.Ink)
                        Text(
                            "登录、注册或找回密码均在 Chrome 中完成，成功后安全返回应用。",
                            style = MaterialTheme.typography.bodyMedium,
                            color = SocratesDesign.Muted,
                        )
                        Text("app.topodrive.top", style = MaterialTheme.typography.bodySmall, color = SocratesDesign.Ink)
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(
                        "应用不读取 Chrome 中的密码或 Cookie。",
                        modifier = Modifier.fillMaxWidth(),
                        style = MaterialTheme.typography.bodySmall,
                        color = SocratesDesign.Muted,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}
