package com.topodrive.socrates.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.topodrive.socrates.R
import com.topodrive.socrates.icons.SocIcons
import com.topodrive.socrates.theme.LocalSocratesColors
import com.topodrive.socrates.theme.NewsreaderFamily
import com.topodrive.socrates.vm.AppState

private enum class AuthView { SIGNIN, REGISTER, CODE, FORGOT, VERIFY_SENT, VERIFYING }

/**
 * Auth gate — port of the web `#authGate` card: segmented Sign in / Create
 * account tabs, GitHub OAuth, email+password, email-code login, forgot
 * password, guest checkbox, and verify-in-progress views.
 */
@Composable
fun AuthScreen(app: AppState) {
    val c = LocalSocratesColors.current
    val ctx = LocalContext.current
    var view by remember { mutableStateOf(AuthView.SIGNIN) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<String?>(null) }

    Box(
        Modifier.fillMaxSize().background(c.background).imePadding(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(24.dp))
            Image(
                painterResource(R.drawable.logo),
                contentDescription = null,
                modifier = Modifier.size(52.dp),
            )
            Spacer(Modifier.height(14.dp))
            Text(
                "Socrates",
                color = c.text,
                fontSize = 26.sp,
                fontFamily = NewsreaderFamily,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                stringResource(R.string.auth_tagline),
                color = c.textMuted,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(28.dp))

            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .background(c.surface)
                    .border(1.dp, c.borderSubtle, RoundedCornerShape(20.dp))
                    .padding(20.dp),
            ) {
                when (view) {
                    AuthView.VERIFYING -> {
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(color = c.text, modifier = Modifier.size(28.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.height(14.dp))
                            Text(stringResource(R.string.auth_verify_checking), color = c.textMuted, fontSize = 14.sp)
                        }
                    }
                    AuthView.VERIFY_SENT -> {
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(SocIcons.Mail, null, tint = c.textMuted, modifier = Modifier.size(28.dp))
                            Spacer(Modifier.height(12.dp))
                            Text(stringResource(R.string.auth_verify_sent), color = c.text, fontSize = 14.sp, textAlign = TextAlign.Center)
                            Spacer(Modifier.height(16.dp))
                            SocButton(stringResource(R.string.auth_back), { view = AuthView.SIGNIN }, primary = false, small = true)
                        }
                    }
                    AuthView.FORGOT -> {
                        Text(stringResource(R.string.auth_reset_password), color = c.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(14.dp))
                        SocField(email, { email = it }, stringResource(R.string.auth_email),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                        Spacer(Modifier.height(14.dp))
                        val verifySentMsg = stringResource(R.string.auth_verify_sent)
                        SocButton(stringResource(R.string.auth_reset_password), {
                            busy = true; error = null
                            app.forgot(email) { err ->
                                busy = false
                                if (err == null) { info = verifySentMsg; view = AuthView.SIGNIN }
                                else error = err
                            }
                        }, Modifier.fillMaxWidth(), loading = busy)
                        Spacer(Modifier.height(10.dp))
                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            Text(
                                stringResource(R.string.auth_back),
                                color = c.textMuted, fontSize = 13.sp,
                                modifier = Modifier.clickable { view = AuthView.SIGNIN },
                            )
                        }
                    }
                    AuthView.CODE -> {
                        Text(stringResource(R.string.auth_login_with_code), color = c.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(14.dp))
                        SocField(email, { email = it }, stringResource(R.string.auth_email),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                        Spacer(Modifier.height(10.dp))
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            SocField(code, { code = it.filter(Char::isDigit).take(8) }, stringResource(R.string.auth_code),
                                modifier = Modifier.weight(1f),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                            Spacer(Modifier.width(10.dp))
                            SocButton(stringResource(R.string.auth_send_code), {
                                busy = true; error = null
                                app.sendCode(email) { err -> busy = false; error = err }
                            }, primary = false, small = true)
                        }
                        Spacer(Modifier.height(14.dp))
                        SocButton(stringResource(R.string.auth_sign_in), {
                            busy = true; error = null
                            app.loginWithCode(email, code) { err -> busy = false; error = err }
                        }, Modifier.fillMaxWidth(), loading = busy)
                        Spacer(Modifier.height(10.dp))
                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            Text(
                                stringResource(R.string.auth_back),
                                color = c.textMuted, fontSize = 13.sp,
                                modifier = Modifier.clickable { view = AuthView.SIGNIN },
                            )
                        }
                    }
                    else -> {
                        // Sign in / Create account segmented tabs
                        Segmented(
                            listOf("signin" to stringResource(R.string.auth_sign_in), "register" to stringResource(R.string.auth_create_account)),
                            if (view == AuthView.REGISTER) "register" else "signin",
                            { view = if (it == "register") AuthView.REGISTER else AuthView.SIGNIN; error = null },
                            Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(16.dp))

                        // GitHub OAuth
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(c.surfaceRaised)
                                .border(1.dp, c.borderSubtle, RoundedCornerShape(12.dp))
                                .clickable(enabled = !busy) {
                                    busy = true; error = null
                                    val i = android.content.Intent(
                                        android.content.Intent.ACTION_VIEW,
                                        android.net.Uri.parse(com.topodrive.socrates.data.Api.githubOAuthStartUrl()),
                                    )
                                    ctx.startActivity(i)
                                    busy = false
                                }
                                .padding(vertical = 12.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(SocIcons.GitHub, null, tint = c.text, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(10.dp))
                            Text(stringResource(R.string.auth_continue_github), color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        }

                        Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.weight(1f).height(1.dp).background(c.borderSubtle))
                            Text(stringResource(R.string.auth_or), color = c.textFaint, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 10.dp))
                            Box(Modifier.weight(1f).height(1.dp).background(c.borderSubtle))
                        }

                        SocField(email, { email = it }, stringResource(R.string.auth_email),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                        Spacer(Modifier.height(10.dp))
                        SocField(password, { password = it }, stringResource(R.string.auth_password),
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                        if (view == AuthView.REGISTER) {
                            Spacer(Modifier.height(10.dp))
                            SocField(confirm, { confirm = it }, stringResource(R.string.auth_confirm_password),
                                visualTransformation = PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                        }
                        Spacer(Modifier.height(14.dp))
                        SocButton(
                            if (view == AuthView.REGISTER) stringResource(R.string.auth_create_account) else stringResource(R.string.auth_sign_in),
                            {
                                error = null
                                if (view == AuthView.REGISTER) {
                                    if (password != confirm) { error = "Passwords don't match"; return@SocButton }
                                    busy = true
                                    app.register(email, password) { err ->
                                        busy = false
                                        if (err == null) view = AuthView.VERIFY_SENT else error = err
                                    }
                                } else {
                                    busy = true
                                    app.login(email, password) { err -> busy = false; error = err }
                                }
                            },
                            Modifier.fillMaxWidth(),
                            loading = busy,
                        )
                        Spacer(Modifier.height(10.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(
                                stringResource(R.string.auth_forgot),
                                color = c.textMuted, fontSize = 13.sp,
                                modifier = Modifier.clickable { view = AuthView.FORGOT },
                            )
                            Text(
                                stringResource(R.string.auth_login_with_code),
                                color = c.textMuted, fontSize = 13.sp,
                                modifier = Modifier.clickable { view = AuthView.CODE },
                            )
                        }
                        Spacer(Modifier.height(16.dp))
                        // Guest checkbox — mirrors the web's inert flag
                        var guest by remember { mutableStateOf(false) }
                        Row(
                            Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { guest = !guest }
                                .padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                Modifier.size(16.dp).clip(RoundedCornerShape(4.dp))
                                    .border(1.dp, c.borderStrong, RoundedCornerShape(4.dp))
                                    .background(if (guest) c.accent else Color.Transparent),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (guest) Icon(SocIcons.Check, null, tint = c.onAccent, modifier = Modifier.size(11.dp))
                            }
                            Spacer(Modifier.width(10.dp))
                            Text(stringResource(R.string.auth_continue_guest), color = c.textMuted, fontSize = 13.sp)
                        }
                    }
                }

                if (error != null) {
                    Spacer(Modifier.height(12.dp))
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(c.dangerSoft)
                            .padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(SocIcons.AlertCircle, null, tint = c.danger, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(error!!, color = c.danger, fontSize = 13.sp)
                    }
                }
                if (info != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(info!!, color = c.success, fontSize = 13.sp)
                }
            }
            Spacer(Modifier.height(40.dp))
        }
    }
}
