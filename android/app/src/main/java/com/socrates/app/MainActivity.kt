package com.socrates.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.socrates.app.ui.SocratesApp
import com.socrates.app.ui.theme.SocratesTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        val container = (application as SocratesApp).container

        setContent {
            SocratesTheme(container.prefs) {
                val user by container.auth.currentUser.collectAsState()
                val deepLinkToken = extractTokenFromIntent(intent)
                Surface(modifier = Modifier.fillMaxSize()) {
                    SocratesApp(
                        container = container,
                        user = user,
                        initialVerifyToken = deepLinkToken,
                        onDeepLinkConsumed = { /* no-op */ }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // Route to VerifyTokenEffect — handled inside SocratesApp via the
        // savedStateHandle, so a simple re-set of content is enough.
        val token = extractTokenFromIntent(intent)
        if (token != null) {
            intent.removeExtra(EXTRA_VERIFY)
            setContent {
                SocratesTheme((application as SocratesApp).container.prefs) {
                    val user by (application as SocratesApp).container.auth.currentUser.collectAsState()
                    Surface(modifier = Modifier.fillMaxSize()) {
                        SocratesApp(
                            container = (application as SocratesApp).container,
                            user = user,
                            initialVerifyToken = token,
                            onDeepLinkConsumed = { /* no-op */ }
                        )
                    }
                }
            }
        }
    }

    private fun extractTokenFromIntent(intent: Intent?): String? {
        if (intent == null) return null
        val data: Uri = intent.data ?: return null
        if (data.host == "app.topodrive.top") {
            // Email link: https://app.topodrive.top/?token=... or ?reset_token=...
            val token = data.getQueryParameter("token")
            if (!token.isNullOrBlank()) return token
            val reset = data.getQueryParameter("reset_token")
            if (!reset.isNullOrBlank()) {
                intent.putExtra(EXTRA_RESET, reset)
                return null
            }
        }
        if (data.scheme == "socrates") {
            return data.getQueryParameter("token")
        }
        return null
    }

    companion object {
        const val EXTRA_VERIFY = "socrates.verify"
        const val EXTRA_RESET = "socrates.reset"
    }
}
