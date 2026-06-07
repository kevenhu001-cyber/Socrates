package com.socrates.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.socrates.app.data.AppContainer
import com.socrates.app.model.User
import com.socrates.app.ui.auth.AuthGate
import com.socrates.app.ui.main.MainShell
import com.socrates.app.util.Log
import kotlinx.coroutines.launch

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
            Surface(
                modifier = Modifier.fillMaxSize(),
                color = MaterialTheme.colorScheme.background
            ) { }
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
