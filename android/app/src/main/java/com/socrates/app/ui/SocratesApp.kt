package com.socrates.app.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.socrates.app.data.AppContainer
import com.socrates.app.model.User
import com.socrates.app.ui.auth.AuthGate
import com.socrates.app.ui.main.MainShell
import com.socrates.app.ui.theme.SocratesTheme
import com.socrates.app.util.Log
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.sin
import kotlin.math.cos

/**
 * Top-level Composable. Watches the auth state and swaps between the
 * gate and the main shell. Deep-link verification (from email links)
 * is dispatched here so the gate can react to the URL.
 */
@Composable
fun SocratesApp(
    container: AppContainer,
    user: User?,
    initialVerifyToken: String?,
    onDeepLinkConsumed: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var verifyToken by remember { mutableStateOf(initialVerifyToken) }
    val booting = remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        container.http.warmCsrf()
        container.auth.probe()
        booting.value = false
    }

    LaunchedEffect(initialVerifyToken) {
        if (initialVerifyToken != null) {
            verifyToken = initialVerifyToken
            onDeepLinkConsumed()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        if (booting.value) {
            BootLoading()
        } else if (user == null) {
            AuthGate(
                container = container,
                verifyToken = verifyToken,
                onVerifyConsumed = { verifyToken = null }
            )
        } else {
            MainShell(
                container = container,
                onSignOut = {
                    scope.launch {
                        container.auth.logout()
                    }
                }
            )
        }
    }
}

/**
 * Animated boot screen with Socrates clock logo, name, and a pulsing
 * loading dots indicator — mirrors the web's .boot-loading-logo.
 */
@Composable
private fun BootLoading() {
    val transition = rememberInfiniteTransition(label = "bootPulse")
    val pulseAlpha by transition.animateFloat(
        initialValue = 0.5f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(800),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse",
    )
    val dotsTransition = rememberInfiniteTransition(label = "dotsBounce")
    val dot1Alpha by dotsTransition.animateFloat(0.3f, 1f, tween(600), RepeatMode.Reverse, label = "dot1")
    val dot2Alpha by dotsTransition.animateFloat(0.3f, 1f, tween(600, delayMillis = 200), RepeatMode.Reverse, label = "dot2")
    val dot3Alpha by dotsTransition.animateFloat(0.3f, 1f, tween(600, delayMillis = 400), RepeatMode.Reverse, label = "dot3")

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Canvas(modifier = Modifier.size(48.dp).alpha(pulseAlpha)) {
                val strokeW = size.minDimension * 0.07f
                val c = center
                val outerR = size.minDimension / 2f - strokeW
                val clockColor = SocratesTheme.colors.accent000
                drawCircle(color = clockColor, radius = outerR, style = Stroke(width = strokeW * 1.4f))
                val angle = Math.toRadians(30.0)
                val handLen = outerR * 0.6f
                drawLine(clockColor, c, Offset(c.x + handLen * sin(angle).toFloat(), c.y - handLen * cos(angle).toFloat()), strokeW * 0.7f, StrokeCap.Round)
                drawLine(clockColor, c, Offset(c.x, c.y - outerR * 0.4f), strokeW * 1.3f, StrokeCap.Round)
                drawCircle(color = clockColor, radius = outerR * 0.25f, style = Stroke(width = strokeW))
            }
            Spacer(Modifier.height(12.dp))
            Text(
                "Socrates",
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.SemiBold,
                fontSize = 20.sp,
                color = SocratesTheme.colors.text100,
                letterSpacing = (-0.02).sp,
            )
            Spacer(Modifier.height(8.dp))
            // Loading dots
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf(dot1Alpha, dot2Alpha, dot3Alpha).forEach { a ->
                    Box(
                        modifier = Modifier
                            .size(5.dp)
                            .alpha(a)
                            .background(
                                SocratesTheme.colors.text500,
                                shape = androidx.compose.foundation.shape.CircleShape,
                            )
                    )
                }
            }
        }
    }
}
