package com.socrates.app.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.socrates.app.R
import com.socrates.app.model.Captcha

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

    OutlinedTextField(
        value = email, onValueChange = { email = it },
        label = { Text(stringResource(R.string.auth_email)) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
        singleLine = true, modifier = Modifier.fillMaxWidth()
    )
    OutlinedTextField(
        value = password, onValueChange = { password = it },
        label = { Text(stringResource(R.string.auth_password)) },
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
        singleLine = true, modifier = Modifier.fillMaxWidth()
    )
    CaptchaField(captcha, captchaAnswer, captchaError, onCaptchaRefresh) { captchaAnswer = it }

    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        TextButton(onClick = onForgot) {
            Text(stringResource(R.string.auth_forgot), textDecoration = TextDecoration.Underline)
        }
        Spacer(modifier = Modifier.weight(1f))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = guest, onCheckedChange = { guest = it })
            Text(stringResource(R.string.auth_guest), style = MaterialTheme.typography.bodySmall)
        }
    }

    SubmitButton(stringResource(R.string.auth_signin), busy, captcha != null && email.isNotBlank() && password.isNotBlank() && captchaAnswer.isNotBlank()) {
        onSubmit(email.trim(), password, captchaAnswer, guest)
    }
    AuthDivider()
    OutlinedButton(
        onClick = { /* GitHub OAuth opens in a Custom Tab — implemented in Phase 2 */ },
        modifier = Modifier.fillMaxWidth()
    ) { Text(stringResource(R.string.auth_github)) }
    TextButton(onClick = onCodeLogin, modifier = Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.auth_code_login))
    }
    Spacer(Modifier.height(4.dp))
    AuthFooter(left = stringResource(R.string.auth_no_account), onLeft = { onSwitch(Stage.REGISTER) })
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

    OutlinedTextField(
        value = email, onValueChange = { email = it },
        label = { Text(stringResource(R.string.auth_email)) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
        singleLine = true, modifier = Modifier.fillMaxWidth()
    )
    OutlinedTextField(
        value = password, onValueChange = { password = it },
        label = { Text(stringResource(R.string.auth_password)) },
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
        supportingText = { Text("At least 8 characters") },
        singleLine = true, modifier = Modifier.fillMaxWidth()
    )
    CaptchaField(captcha, captchaAnswer, captchaError, onCaptchaRefresh) { captchaAnswer = it }
    SubmitButton(stringResource(R.string.auth_send_verification), busy,
        captcha != null && email.isNotBlank() && password.length >= 8 && captchaAnswer.isNotBlank()
    ) { onSubmit(email.trim(), password, captchaAnswer) }
    AuthFooter(left = stringResource(R.string.auth_already_verified), onLeft = { onSwitch(Stage.SIGNIN) })
}

@Composable
fun VerifySent(email: String, onSwitch: (Stage) -> Unit, onResend: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text(
            stringResource(R.string.auth_check_inbox),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.primary
        )
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.auth_check_inbox_msg, email),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = onResend, modifier = Modifier.fillMaxWidth()) { Text("Resend link") }
        TextButton(onClick = { onSwitch(Stage.SIGNIN) }, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.auth_use_different))
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
            Icon(Icons.Default.ArrowBack, contentDescription = "Back")
        }
        Text(stringResource(R.string.auth_reset_title), style = MaterialTheme.typography.titleLarge)
    }
    Text(stringResource(R.string.auth_reset_lede), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    OutlinedTextField(
        value = email, onValueChange = { email = it },
        label = { Text(stringResource(R.string.auth_email)) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
        singleLine = true, modifier = Modifier.fillMaxWidth()
    )
    CaptchaField(captcha, captchaAnswer, captchaError, onCaptchaRefresh) { captchaAnswer = it }
    SubmitButton("Send reset link", busy,
        captcha != null && email.isNotBlank() && captchaAnswer.isNotBlank()
    ) { onSubmit(email.trim(), captchaAnswer) }
}

@Composable
fun ForgotSent(email: String, onSwitch: (Stage) -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.auth_check_inbox), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.auth_reset_sent_msg, email), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))
        Button(onClick = { onSwitch(Stage.SIGNIN) }, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.auth_back_signin))
        }
    }
}

@Composable
fun ResetForm(token: String, busy: Boolean, onSubmit: (String) -> Unit) {
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var mismatch by remember { mutableStateOf<String?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Set new password", style = MaterialTheme.typography.titleLarge)
        Text("Choose a new password for your account.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text(stringResource(R.string.auth_new_password)) }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = confirm, onValueChange = { confirm = it; mismatch = null }, label = { Text(stringResource(R.string.auth_confirm_password)) }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth(), isError = mismatch != null, supportingText = { mismatch?.let { Text(it) } })
        Button(onClick = {
            if (password != confirm) mismatch = "Passwords don't match"
            else if (password.length < 8) mismatch = "Password must be at least 8 characters"
            else onSubmit(password)
        }, enabled = !busy && token.isNotBlank(), modifier = Modifier.fillMaxWidth().height(48.dp), shape = RoundedCornerShape(10.dp)) {
            Text("Reset password")
        }
    }
}

@Composable
fun ResetOk(onSwitch: (Stage) -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.auth_password_updated), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        Button(onClick = { onSwitch(Stage.SIGNIN) }, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.auth_signin))
        }
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
        IconButton(onClick = { onSwitch(Stage.SIGNIN) }) { Icon(Icons.Default.ArrowBack, contentDescription = "Back") }
        Text(stringResource(R.string.auth_code_title), style = MaterialTheme.typography.titleLarge)
    }
    Text(stringResource(R.string.auth_code_lede), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text(stringResource(R.string.auth_email)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), singleLine = true, modifier = Modifier.fillMaxWidth())
    if (codeSent) {
        OutlinedTextField(value = code, onValueChange = { code = it }, label = { Text(stringResource(R.string.auth_code_label)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), singleLine = true, modifier = Modifier.fillMaxWidth())
    }
    CaptchaField(captcha, captchaAnswer, captchaError, { /* refresh */ }) { captchaAnswer = it }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = guest, onCheckedChange = { guest = it })
        Text(stringResource(R.string.auth_guest), style = MaterialTheme.typography.bodySmall)
    }
    if (codeSent) {
        SubmitButton("Log in", busy, captcha != null && code.length == 6) { onLogin(email.trim(), code, captchaAnswer, guest) }
    } else {
        SubmitButton(stringResource(R.string.auth_send_code), busy, captcha != null && email.isNotBlank() && captchaAnswer.isNotBlank()) {
            onSendCode(email.trim(), captchaAnswer)
            codeSent = true
        }
    }
}

@Composable
internal fun AuthDivider() {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        HorizontalDivider(modifier = Modifier.weight(1f))
        Text("  or  ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider(modifier = Modifier.weight(1f))
    }
}

@Composable
internal fun AuthFooter(left: String, onLeft: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.Center) {
        Text(left, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        TextButton(onClick = onLeft) { Text("Sign in", maxLines = 1) }
    }
}
