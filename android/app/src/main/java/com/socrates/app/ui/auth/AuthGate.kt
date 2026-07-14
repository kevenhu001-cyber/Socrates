package com.socrates.app.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.socrates.app.R
import com.socrates.app.data.AppContainer
import com.socrates.app.model.Captcha
import com.socrates.app.ui.theme.SocratesDimens
import com.socrates.app.ui.theme.SocratesTheme
import kotlinx.coroutines.launch

/**
 * Auth gate — the four stage groups mirror the web client's auth HTML:
 *   Sign in, Register, Code login, Forgot/Reset.
 * Styled with SocratesColors to match the web palette exactly.
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
        if (stage in listOf(Stage.SIGNIN, Stage.REGISTER, Stage.CODE_LOGIN, Stage.FORGOT)) refreshCaptcha()
    }

    // Email verification deep link
    LaunchedEffect(verifyToken) {
        if (verifyToken != null) {
            busy = true; error = null
            val r = container.auth.verify(verifyToken)
            if (r.isFailure) error = r.exceptionOrNull()?.message
            onVerifyConsumed(); busy = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SocratesTheme.colors.bg100),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            modifier = Modifier
                .widthIn(max = 420.dp)
                .fillMaxWidth()
                .padding(SocratesDimens.grid24),
            shape = RoundedCornerShape(SocratesDimens.radius16),
            color = SocratesTheme.colors.bg200,
            tonalElevation = 0.dp,
            shadowElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(SocratesDimens.grid24),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                AuthHeader(stage = stage)

                error?.let {
                    Surface(
                        color = SocratesTheme.colors.error.copy(alpha = 0.12f),
                        shape = RoundedCornerShape(SocratesDimens.radius8)
                    ) {
                        Text(
                            it,
                            modifier = Modifier.padding(SocratesDimens.grid10),
                            color = SocratesTheme.colors.error,
                            fontSize = 12.sp
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
                            busy = true; error = null
                            scope.launch {
                                val r = container.auth.login(email, password, captcha!!.token, captchaAnswer, guest)
                                if (r.isFailure) { error = r.exceptionOrNull()?.message; refreshCaptcha() }
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
                                if (r.isSuccess) { pendingEmail = email; stage = Stage.VERIFY_SENT }
                                else error = r.exceptionOrNull()?.message
                                refreshCaptcha(); busy = false
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
                                refreshCaptcha(); busy = false
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
                                refreshCaptcha(); busy = false
                            }
                        },
                        onLogin = { email, code, captchaAnswer, guest ->
                            busy = true; error = null
                            scope.launch {
                                val r = container.auth.loginWithCode(email, code, captcha!!.token, captchaAnswer, guest)
                                if (r.isFailure) { error = r.exceptionOrNull()?.message; refreshCaptcha() }
                                busy = false
                            }
                        },
                        onSwitch = { stage = it }
                    )
                }

                Text(
                    stringResource(R.string.app_tagline),
                    color = SocratesTheme.colors.text500,
                    fontSize = 11.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = SocratesDimens.grid8)
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
            fontSize = 20.sp,
            color = SocratesTheme.colors.accent000
        )
        val subtitle = when (stage) {
            Stage.SIGNIN -> "Welcome back"
            Stage.REGISTER -> "Create your account"
            Stage.VERIFY_SENT -> "Check your inbox"
            Stage.FORGOT -> "Reset password"
            Stage.FORGOT_SENT -> "Check your inbox"
            Stage.RESET -> "Set a new password"
            Stage.RESET_OK -> "Password updated"
            Stage.CODE_LOGIN -> "Code login"
        }
        Text(
            subtitle,
            color = SocratesTheme.colors.text500,
            fontSize = 13.sp,
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}

// ──────────────────────────────────────────────
// Auth form composables
// ──────────────────────────────────────────────

@Composable
fun SignInForm(
    initialEmail: String,
    captcha: Captcha?,
    captchaError: String?,
    busy: Boolean,
    onSubmit: (String, String, String, Boolean) -> Unit,
    onCaptchaRefresh: () -> Unit,
    onSwitch: (Stage) -> Unit,
    onForgot: () -> Unit,
    onCodeLogin: () -> Unit
) {
    var email by remember { mutableStateOf(initialEmail) }
    var password by remember { mutableStateOf("") }
    var captchaAnswer by remember { mutableStateOf("") }
    var guest by remember { mutableStateOf(false) }
    var showPassword by remember { mutableStateOf(false) }

    SocratesInput(value = email, onValueChange = { email = it }, label = "Email", keyboardType = KeyboardType.Email)
    Spacer(Modifier.height(4.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        SocratesInput(
            value = password,
            onValueChange = { password = it },
            label = "Password",
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            modifier = Modifier.weight(1f)
        )
        Spacer(Modifier.width(SocratesDimens.grid8))
        IconButton(
            onClick = { showPassword = !showPassword },
            modifier = Modifier.size(SocratesDimens.iconBtnSize)
        ) {
            Icon(
                if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                contentDescription = null,
                tint = SocratesTheme.colors.text400,
                modifier = Modifier.size(18.dp)
            )
        }
    }
    SocratesCaptchaField(captcha, captchaAnswer, captchaError, onCaptchaRefresh) { captchaAnswer = it }

    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        TextButton(onClick = onForgot) {
            Text("Forgot?", color = SocratesTheme.colors.text400, fontSize = 12.sp)
        }
        Spacer(Modifier.weight(1f))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = guest, onCheckedChange = { guest = it },
                colors = CheckboxDefaults.colors(checkedColor = SocratesTheme.colors.accent000))
            Text("Guest", color = SocratesTheme.colors.text500, fontSize = 12.sp)
        }
    }

    SubmitButton(text = stringResource(R.string.auth_signin), busy = busy,
        enabled = captcha != null && email.isNotBlank() && password.isNotBlank() && captchaAnswer.isNotBlank(),
        onClick = { onSubmit(email.trim(), password, captchaAnswer, guest) })

    AuthDivider()
    OutlinedButton(
        onClick = { /* GitHub OAuth — Custom Tab */ },
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(SocratesDimens.radius10)
    ) {
        Text("GitHub", color = SocratesTheme.colors.text300)
    }
    TextButton(onClick = onCodeLogin, modifier = Modifier.fillMaxWidth()) {
        Text("Log in with code", color = SocratesTheme.colors.accent000, fontSize = 12.sp)
    }
    Spacer(Modifier.height(4.dp))
    AuthFooter(left = "No account?", action = "Sign up", onAction = { onSwitch(Stage.REGISTER) })
}

@Composable
fun RegisterForm(
    initialEmail: String,
    captcha: Captcha?,
    captchaError: String?,
    busy: Boolean,
    onSubmit: (String, String, String) -> Unit,
    onCaptchaRefresh: () -> Unit,
    onSwitch: (Stage) -> Unit
) {
    var email by remember { mutableStateOf(initialEmail) }
    var password by remember { mutableStateOf("") }
    var captchaAnswer by remember { mutableStateOf("") }

    SocratesInput(value = email, onValueChange = { email = it }, label = "Email", keyboardType = KeyboardType.Email)
    Spacer(Modifier.height(4.dp))
    SocratesInput(value = password, onValueChange = { password = it }, label = "Password",
        visualTransformation = PasswordVisualTransformation(),
        supportingText = "At least 8 characters")
    SocratesCaptchaField(captcha, captchaAnswer, captchaError, onCaptchaRefresh) { captchaAnswer = it }
    SubmitButton(text = stringResource(R.string.auth_send_verification), busy = busy,
        enabled = captcha != null && email.isNotBlank() && password.length >= 8 && captchaAnswer.isNotBlank(),
        onClick = { onSubmit(email.trim(), password, captchaAnswer) })
    AuthFooter(left = "Already verified?", action = "Sign in", onAction = { onSwitch(Stage.SIGNIN) })
}

@Composable
fun VerifySent(email: String, onSwitch: (Stage) -> Unit, onResend: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text("Check your inbox", color = SocratesTheme.colors.accent000, fontSize = 16.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(SocratesDimens.grid8))
        Text("Verification link sent to $email", color = SocratesTheme.colors.text500, fontSize = 13.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(SocratesDimens.grid16))
        OutlinedButton(onClick = onResend, modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(SocratesDimens.radius10)) { Text("Resend link") }
        TextButton(onClick = { onSwitch(Stage.SIGNIN) }, modifier = Modifier.fillMaxWidth()) {
            Text("Use a different email", color = SocratesTheme.colors.accent000, fontSize = 12.sp)
        }
    }
}

@Composable
fun ForgotForm(
    initialEmail: String,
    captcha: Captcha?,
    captchaError: String?,
    busy: Boolean,
    onSubmit: (String, String) -> Unit,
    onSwitch: (Stage) -> Unit,
    onCaptchaRefresh: () -> Unit
) {
    var email by remember { mutableStateOf(initialEmail) }
    var captchaAnswer by remember { mutableStateOf("") }

    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { onSwitch(Stage.SIGNIN) }) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = SocratesTheme.colors.text400)
        }
        Text("Reset password", fontSize = 16.sp, fontWeight = FontWeight.Medium, color = SocratesTheme.colors.text100)
    }
    Text("Enter your email and we'll send a reset link.", color = SocratesTheme.colors.text500, fontSize = 13.sp)
    SocratesInput(value = email, onValueChange = { email = it }, label = "Email", keyboardType = KeyboardType.Email)
    SocratesCaptchaField(captcha, captchaAnswer, captchaError, onCaptchaRefresh) { captchaAnswer = it }
    SubmitButton(text = "Send reset link", busy = busy,
        enabled = captcha != null && email.isNotBlank() && captchaAnswer.isNotBlank(),
        onClick = { onSubmit(email.trim(), captchaAnswer) })
}

@Composable
fun ForgotSent(email: String, onSwitch: (Stage) -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text("Check your inbox", color = SocratesTheme.colors.accent000, fontSize = 16.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(SocratesDimens.grid8))
        Text("Reset link sent to $email", color = SocratesTheme.colors.text500, fontSize = 13.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(SocratesDimens.grid16))
        Button(onClick = { onSwitch(Stage.SIGNIN) }, modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(SocratesDimens.radius10)) { Text("Back to sign in") }
    }
}

@Composable
fun ResetForm(token: String, busy: Boolean, onSubmit: (String) -> Unit) {
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var mismatch by remember { mutableStateOf<String?>(null) }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Set new password", fontSize = 16.sp, fontWeight = FontWeight.Medium, color = SocratesTheme.colors.text100)
        Text("Choose a new password for your account.", color = SocratesTheme.colors.text500, fontSize = 13.sp)
        SocratesInput(value = password, onValueChange = { password = it }, label = "New password",
            visualTransformation = PasswordVisualTransformation())
        SocratesInput(value = confirm, onValueChange = { confirm = it; mismatch = null }, label = "Confirm password",
            visualTransformation = PasswordVisualTransformation(),
            isError = mismatch != null, supportingText = mismatch)
        SubmitButton(text = "Reset password", busy = busy,
            enabled = token.isNotBlank(),
            onClick = {
                if (password != confirm) mismatch = "Passwords don't match"
                else if (password.length < 8) mismatch = "At least 8 characters"
                else onSubmit(password)
            })
    }
}

@Composable
fun ResetOk(onSwitch: (Stage) -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text("Password updated", color = SocratesTheme.colors.text100, fontSize = 14.sp)
        Spacer(Modifier.height(12.dp))
        Button(onClick = { onSwitch(Stage.SIGNIN) }, modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(SocratesDimens.radius10)) { Text("Sign in") }
    }
}

@Composable
fun CodeLoginForm(
    initialEmail: String,
    captcha: Captcha?,
    captchaError: String?,
    busy: Boolean,
    onSendCode: (String, String) -> Unit,
    onLogin: (String, String, String, Boolean) -> Unit,
    onSwitch: (Stage) -> Unit
) {
    var email by remember { mutableStateOf(initialEmail) }
    var code by remember { mutableStateOf("") }
    var captchaAnswer by remember { mutableStateOf("") }
    var guest by remember { mutableStateOf(false) }
    var codeSent by remember { mutableStateOf(false) }

    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { onSwitch(Stage.SIGNIN) }) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = SocratesTheme.colors.text400)
        }
        Text("Code login", fontSize = 16.sp, fontWeight = FontWeight.Medium, color = SocratesTheme.colors.text100)
    }
    Text("Get a one-time code sent to your email.", color = SocratesTheme.colors.text500, fontSize = 13.sp)
    SocratesInput(value = email, onValueChange = { email = it }, label = "Email", keyboardType = KeyboardType.Email)
    if (codeSent) {
        SocratesInput(value = code, onValueChange = { code = it }, label = "Verification code",
            keyboardType = KeyboardType.NumberPassword, supportingText = "6-digit code")
    }
    SocratesCaptchaField(captcha, captchaAnswer, captchaError, {}) { captchaAnswer = it }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = guest, onCheckedChange = { guest = it },
            colors = CheckboxDefaults.colors(checkedColor = SocratesTheme.colors.accent000))
        Text("Guest", color = SocratesTheme.colors.text500, fontSize = 12.sp)
    }
    if (codeSent) {
        SubmitButton(text = "Log in", busy = busy,
            enabled = captcha != null && code.length == 6,
            onClick = { onLogin(email.trim(), code, captchaAnswer, guest) })
    } else {
        SubmitButton(text = stringResource(R.string.auth_send_code), busy = busy,
            enabled = captcha != null && email.isNotBlank() && captchaAnswer.isNotBlank(),
            onClick = { onSendCode(email.trim(), captchaAnswer); codeSent = true })
    }
}

// ──────────────────────────────────────────────
// Shared UI components
// ──────────────────────────────────────────────

@Composable
internal fun SocratesInput(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    isError: Boolean = false,
    supportingText: String? = null,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            visualTransformation = visualTransformation,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = ImeAction.Next),
            textStyle = MaterialTheme.typography.bodyMedium.copy(
                color = SocratesTheme.colors.text100,
                fontSize = 14.sp
            ),
            modifier = Modifier
                .fillMaxWidth()
                .background(SocratesTheme.colors.bg000, RoundedCornerShape(SocratesDimens.radius10))
                .then(
                    if (isError) Modifier.border(
                        0.5.dp,
                        SocratesTheme.colors.error.copy(alpha = 0.5f),
                        RoundedCornerShape(SocratesDimens.radius10)
                    ) else Modifier
                )
                .padding(SocratesDimens.grid12)
        ) { innerTextField ->
            if (value.isEmpty()) {
                Text(
                    label,
                    color = SocratesTheme.colors.text400,
                    fontSize = 14.sp
                )
            }
            innerTextField()
        }
        if (supportingText != null) {
            Text(
                supportingText,
                color = if (isError) SocratesTheme.colors.error else SocratesTheme.colors.text500,
                fontSize = 11.sp,
                modifier = Modifier.padding(start = 4.dp, top = 2.dp)
            )
        }
    }
}

@Composable
internal fun SocratesCaptchaField(
    captcha: Captcha?,
    answer: String,
    error: String?,
    onRefresh: () -> Unit,
    onAnswerChange: (String) -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SocratesDimens.radius8))
            .background(SocratesTheme.colors.bg300)
            .padding(horizontal = SocratesDimens.grid12, vertical = SocratesDimens.grid8)
    ) {
        Text(
            captcha?.question ?: "—",
            modifier = Modifier.width(72.dp),
            color = SocratesTheme.colors.text100,
            fontSize = 16.sp,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Medium
        )
        Spacer(Modifier.width(SocratesDimens.grid8))
        BasicTextField(
            value = answer,
            onValueChange = onAnswerChange,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            textStyle = MaterialTheme.typography.bodyMedium.copy(
                color = SocratesTheme.colors.text100,
                fontFamily = FontFamily.Monospace,
                textAlign = TextAlign.Center,
                fontSize = 16.sp
            ),
            modifier = Modifier
                .width(64.dp)
                .background(SocratesTheme.colors.bg300, RoundedCornerShape(SocratesDimens.radius8))
                .then(
                    if (captcha != null) Modifier.border(
                        0.5.dp,
                        SocratesTheme.colors.border300.copy(alpha = 0.18f),
                        RoundedCornerShape(SocratesDimens.radius8)
                    ) else Modifier
                )
                .padding(vertical = 6.dp, horizontal = SocratesDimens.grid8)
        ) { innerTextField ->
            if (answer.isEmpty()) {
                Text("?", color = SocratesTheme.colors.text500, fontSize = 16.sp, textAlign = TextAlign.Center)
            }
            innerTextField()
        }
        Spacer(Modifier.width(SocratesDimens.grid8))
        IconButton(onClick = onRefresh, modifier = Modifier.size(SocratesDimens.iconBtnSize)) {
            Icon(Icons.Default.Refresh, contentDescription = "Refresh captcha",
                tint = SocratesTheme.colors.text400, modifier = Modifier.size(16.dp))
        }
    }
    if (error != null) {
        Text(error, color = SocratesTheme.colors.error, fontSize = 11.sp, modifier = Modifier.padding(start = 4.dp, top = 2.dp))
    }
}

@Composable
internal fun SubmitButton(text: String, busy: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        modifier = Modifier.fillMaxWidth().height(48.dp),
        shape = RoundedCornerShape(SocratesDimens.radius10),
        colors = ButtonDefaults.buttonColors(
            containerColor = SocratesTheme.colors.accent000,
            contentColor = SocratesTheme.colors.oncolor100,
            disabledContainerColor = SocratesTheme.colors.accent000.copy(alpha = 0.4f)
        )
    ) {
        if (busy) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = SocratesTheme.colors.oncolor100
            )
        } else Text(text, fontWeight = FontWeight.Medium)
    }
}

@Composable
internal fun AuthDivider() {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        HorizontalDivider(modifier = Modifier.weight(1f), color = SocratesTheme.colors.border100.copy(alpha = 0.2f))
        Text("  or  ", color = SocratesTheme.colors.text500, fontSize = 12.sp)
        HorizontalDivider(modifier = Modifier.weight(1f), color = SocratesTheme.colors.border100.copy(alpha = 0.2f))
    }
}

@Composable
internal fun AuthFooter(left: String, action: String, onAction: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.Center) {
        Text(left, color = SocratesTheme.colors.text500, fontSize = 12.sp)
        TextButton(onClick = onAction) {
            Text(action, color = SocratesTheme.colors.accent000, fontSize = 12.sp)
        }
    }
}
