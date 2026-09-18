package com.topodrive.socrates

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import com.topodrive.socrates.ui.AppRoot
import com.topodrive.socrates.vm.AppState

class MainActivity : ComponentActivity() {

    private lateinit var appState: AppState

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        appState = ViewModelProvider(this)[AppState::class.java]
        handleDeepLink(intent)
        setContent {
            AppRoot(appState)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    /**
     * Deep links:
     *  - socrates://auth/callback?exchangeToken=…   (GitHub OAuth round trip)
     *  - socrates://auth/callback?token=…           (email verify → sign in)
     *  - socrates://auth/callback?error=…           (OAuth failure)
     */
    private fun handleDeepLink(intent: Intent?) {
        val uri: Uri = intent?.data ?: return
        if (uri.scheme != "socrates") return
        when (uri.host) {
            "auth" -> {
                val exchange = uri.getQueryParameter("exchangeToken")
                val token = uri.getQueryParameter("token")
                val err = uri.getQueryParameter("error")
                when {
                    !exchange.isNullOrBlank() -> appState.oauthExchange(exchange) { appState.toast(it) }
                    !token.isNullOrBlank() -> appState.mobileVerify(token) { ok ->
                        if (!ok) appState.toast("Verification failed")
                    }
                    !err.isNullOrBlank() -> appState.toast(err)
                }
            }
            "session", "s" -> {
                uri.lastPathSegment?.let { appState.openSession(it) }
            }
        }
    }
}
