package com.socrates.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.socrates.android.data.ApiClient
import com.socrates.android.ui.BrowserLogin
import com.socrates.android.ui.ChatViewModel
import com.socrates.android.ui.SocratesApp
import com.socrates.android.ui.SocratesTheme
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
        )
        setContent { SocratesTheme { SocratesApp() } }
        handleCallback(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleCallback(intent)
    }

    private fun handleCallback(callbackIntent: Intent?) {
        if (callbackIntent?.action != Intent.ACTION_VIEW || callbackIntent.data == null) return
        val uri = callbackIntent.data
        // Do not retain a code-bearing Intent through Activity recreation.
        callbackIntent.data = null
        val vm = ViewModelProvider(this)[ChatViewModel::class.java]
        val accepted = BrowserLogin.consume(this, uri)
        if (accepted == null) {
            vm.error("浏览器登录链接无效、已使用或已过期，请从应用重新发起登录。")
            return
        }
        lifecycleScope.launch {
            try {
                val user = withContext(Dispatchers.IO) {
                    ApiClient(applicationContext).exchangeBrowserLogin(accepted.code, accepted.verifier)
                }
                vm.authenticated(user)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // Never log codes, verifiers, token responses or credential-bearing URLs.
                vm.error("浏览器登录未完成，请从应用重新尝试。")
            }
        }
    }
}
