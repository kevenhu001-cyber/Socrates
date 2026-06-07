package com.socrates.app.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.socrates.app.R
import com.socrates.app.data.AppContainer
import com.socrates.app.model.Captcha
import kotlinx.coroutines.launch

/**
 * The four auth states correspond to the four HTML views in the web
 * app: Sign in, Register, Code login, Forgot/Reset. We render them as
 * a stacked set and switch visibility — much simpler than juggling
 * fragments and matches what the web client does.
 */
@Composable
fun AuthGate(
    container: AppContainer,
    verifyToken: String?,
    onVerifyConsumed: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var stage by remember { mutableStateOf(Stage.SIGNIN) }
    var captcha by remember { mutableStateOf<Captcha?>(null) }
    var captchaError by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var resetToken by remember { mutableStateOf<String?>(null) }
    var pendingEmail by remember { mutableStateOf("") }
    val lastEmail by container.prefs.lastEmail.collectAsState(initial = "")

    val refreshCaptcha: () -> Unit = {
        scope.launch {
            captcha = container.auth.captcha().getOrNull()
            captchaError = if (captcha == null) stringResource(R.string.auth_captcha_failed) else null
        }
    }

    LaunchedEffect(Unit) { refreshCaptcha() }
    LaunchedEffect(stage) {
        // Re-fetch a captcha every time the user lands on a fresh stage
        if (stage == Stage.SIGNIN || stage == Stage.REGISTER || stage == Stage.CODE_LOGIN || stage == Stage.FORGOT) {
            refreshCaptcha()
        }
    }

    // Email verification deep link
    LaunchedEffect(verifyToken) {
        if (verifyToken != null) {
            busy = true
            error = null
            val r = container.auth.verify(verifyToken)
            if (r.isFailure) error = r.exceptionOrNull()?.message
            onVerifyConsumed()
            busy = false
        }
    }

    val gradient = Brush.verticalGradient(
        listOf(
            MaterialTheme.colorScheme.background,
            MaterialTheme.colorScheme.surface,
        )
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(gradient),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            modifier = Modifier
                .widthIn(max = 420.dp)
                .fillMaxWidth()
                .padding(24.dp),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp,
            shadowElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                AuthHeader(stage = stage)
                error?.let {
                    Surface(
                        color = MaterialTheme.colorScheme.errorContainer,
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            it,
                            modifier = Modifier.padding(10.dp),
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }

                when (stage) {
                    Stage.SIGNIN -> SignInForm(
                        initialEmail = lastEmail,
                        captcha = captcha,
                        captchaError = captchaError,
                        busy = busy,
                        onSubmit = { email, password, captchaAnswer, guest ->
                            busy = true
                            error = null
                            scope.launch {
                                val r = container.auth.login(email, password, captcha!!.token, captchaAnswer, guest)
                                if (r.isFailure) {
                                    error = r.exceptionOrNull()?.message
                                    refreshCaptcha()
                                }
                                busy = false
                            }
                        },
                        onCaptchaRefresh = refreshCaptcha,
                        onSwitch = { stage = it },
                        onForgot = { stage = Stage.FORGOT },
                        onCodeLogin = { stage = Stage.CODE_LOGIN }
                    )
                    Stage.REGISTER -> RegisterForm(
                        initialEmail = lastEmail,
                        captcha = captcha,
                        captchaError = captchaError,
                        busy = busy,
                        onSubmit = { email, password, captchaAnswer ->
                            busy = true; error = null
                            scope.launch {
                                val r = container.auth.register(email, password, captcha!!.token, captchaAnswer)
                                if (r.isSuccess) {
                                    pendingEmail = email
                                    stage = Stage.VERIFY_SENT
                                } else error = r.exceptionOrNull()?.message
                                refreshCaptcha()
                                busy = false
                            }
                        },
                        onCaptchaRefresh = refreshCaptcha,
                        onSwitch = { stage = it }
                    )
                    Stage.VERIFY_SENT -> VerifySent(
                        email = pendingEmail,
                        onSwitch = { stage = Stage.SIGNIN },
                        onResend = {
                            scope.launch {
                                refreshCaptcha()
                                container.auth.register(pendingEmail, "resend-temp-pass-1234", captcha!!.token, "")
                            }
                        }
                    )
                    Stage.FORGOT -> ForgotForm(
                        initialEmail = lastEmail,
                        captcha = captcha,
                        captchaError = captchaError,
                        busy = busy,
                        onSubmit = { email, captchaAnswer ->
                            busy = true; error = null
                            scope.launch {
                                val r = container.auth.forgotPassword(email, captcha!!.token, captchaAnswer)
                                if (r.isSuccess) { pendingEmail = email; stage = Stage.FORGOT_SENT }
                                else error = r.exceptionOrNull()?.message
                                refreshCaptcha()
                                busy = false
                            }
                        },
                        onSwitch = { stage = it },
                        onCaptchaRefresh = refreshCaptcha
                    )
                    Stage.FORGOT_SENT -> ForgotSent(
                        email = pendingEmail,
                        onSwitch = { stage = Stage.SIGNIN }
                    )
                    Stage.RESET -> ResetForm(
                        token = resetToken ?: "",
                        busy = busy,
                        onSubmit = { password ->
                            busy = true; error = null
                            scope.launch {
                                val r = container.auth.resetPassword(resetToken ?: "", password)
                                if (r.isSuccess) stage = Stage.RESET_OK
                                else error = r.exceptionOrNull()?.message
                                busy = false
                            }
                        }
                    )
                    Stage.RESET_OK -> ResetOk(onSwitch = { stage = Stage.SIGNIN })
                    Stage.CODE_LOGIN -> CodeLoginForm(
                        initialEmail = lastEmail,
                        captcha = captcha,
                        captchaError = captchaError,
                        busy = busy,
                        onSendCode = { email, captchaAnswer ->
                            busy = true; error = null
                            scope.launch {
                                val r = container.auth.sendCode(email, captcha!!.token, captchaAnswer)
                                if (r.isSuccess) pendingEmail = email
                                else error = r.exceptionOrNull()?.message
                                refreshCaptcha()
                                busy = false
                            }
                        },
                        onLogin = { email, code, captchaAnswer, guest ->
                            busy = true; error = null
                            scope.launch {
                                val r = container.auth.loginWithCode(email, code, captcha!!.token, captchaAnswer, guest)
                                if (r.isFailure) {
                                    error = r.exceptionOrNull()?.message
                                    refreshCaptcha()
                                }
                                busy = false
                            }
                        },
                        onSwitch = { stage = it }
                    )
                }

                Text(
                    stringResource(R.string.app_tagline),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                )
            }
        }
    }
}

enum class Stage {
    SIGNIN, REGISTER, VERIFY_SENT, FORGOT, FORGOT_SENT, RESET, RESET_OK, CODE_LOGIN
}

@Composable
private fun AuthHeader(stage: Stage) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text(
            "Socrates",
            fontFamily = FontFamily.Serif,
            fontWeight = FontWeight.Medium,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.primary
        )
        val subtitle = when (stage) {
            Stage.SIGNIN -> "Welcome back"
            Stage.REGISTER -> "Create your account"
            Stage.VERIFY_SENT -> "Check your inbox"
            Stage.FORGOT -> stringResource(R.string.auth_reset_title)
            Stage.FORGOT_SENT -> "Check your inbox"
            Stage.RESET -> "Set a new password"
            Stage.RESET_OK -> "Password updated"
            Stage.CODE_LOGIN -> stringResource(R.string.auth_code_title)
        }
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
internal fun CaptchaField(captcha: Captcha?, error: String?, onRefresh: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Text(
            captcha?.question ?: "—",
            modifier = Modifier.width(72.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.titleMedium
        )
        OutlinedTextField(
            value = "",
            onValueChange = { /* values are bound by parent through state */ },
            label = { Text(stringResource(R.string.auth_solving)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            singleLine = true,
            modifier = Modifier.weight(1f)
        )
        IconButton(onClick = onRefresh) {
            Icon(
                androidx.compose.material.icons.Icons.Filled.Refresh,
                contentDescription = "Refresh"
            )
        }
    }
    if (error != null) {
        Text(
            error,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall
        )
    }
}

@Composable
internal fun SubmitButton(text: String, busy: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        modifier = Modifier.fillMaxWidth().height(48.dp),
        shape = RoundedCornerShape(10.dp)
    ) {
        if (busy) CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
        else Text(text)
    }
}
