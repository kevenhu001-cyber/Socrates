package com.socrates.android.bridge

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.HapticFeedbackConstants
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Two-way JavaScript bridge interface between the Android host and the Socrates Web SPA.
 */
class SocratesNativeBridge(
    private val context: Context,
    private val webViewProvider: () -> WebView?,
    private val onPageReady: () -> Unit = {}
) {
    private val scope = CoroutineScope(Dispatchers.Main)

    @JavascriptInterface
    fun performHaptic(type: String) {
        scope.launch {
            val webView = webViewProvider()
            when (type.lowercase()) {
                "tick" -> {
                    if (webView?.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK) != true) {
                        vibrateFallback(10, 50)
                    }
                }
                "success" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        if (webView?.performHapticFeedback(HapticFeedbackConstants.CONFIRM) != true) {
                            vibrateFallback(20, 80)
                        }
                    } else {
                        vibrateFallback(20, 80)
                    }
                }
                "warning" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        if (webView?.performHapticFeedback(HapticFeedbackConstants.REJECT) != true) {
                            vibrateFallback(30, 120)
                        }
                    } else {
                        vibrateFallback(30, 120)
                    }
                }
                else -> {
                    webView?.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                }
            }
        }
    }

    private fun vibrateFallback(durationMs: Long, amplitude: Int) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.vibrate(
                    VibrationEffect.createOneShot(durationMs, amplitude.coerceIn(1, 255))
                )
            } else {
                @Suppress("DEPRECATION")
                val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator?.vibrate(VibrationEffect.createOneShot(durationMs, amplitude.coerceIn(1, 255)))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator?.vibrate(durationMs)
                }
            }
        } catch (_: Exception) {
            // vibration is optional
        }
    }

    @JavascriptInterface
    fun notifyPageReady() {
        scope.launch {
            onPageReady()
        }
    }

    @JavascriptInterface
    fun postMessage(messageJson: String) {
        // Can be extended for future native plugin/analytics hooks
    }

    /**
     * Dispatch keyboard height in DP directly to the web SPA.
     */
    fun dispatchKeyboardHeight(heightDp: Float) {
        scope.launch {
            val script = "window.__socratesNative?.onKeyboardHeight($heightDp);"
            webViewProvider()?.evaluateJavascript(script, null)
        }
    }

    /**
     * Dispatch system insets (status bar, navigation bar, display cutouts) in DP.
     */
    fun dispatchSystemInsets(topDp: Float, bottomDp: Float, leftDp: Float, rightDp: Float) {
        scope.launch {
            val script = """
                window.__socratesNative?.setSystemInsets({
                    top: $topDp,
                    bottom: $bottomDp,
                    left: $leftDp,
                    right: $rightDp
                });
            """.trimIndent()
            webViewProvider()?.evaluateJavascript(script, null)
        }
    }

    /**
     * Dispatch back press. Callback receives true if web consumed it (e.g. dismissed modal/drawer).
     */
    fun dispatchBackPress(onResult: (consumed: Boolean) -> Unit) {
        scope.launch {
            val webView = webViewProvider()
            if (webView == null) {
                onResult(false)
                return@launch
            }
            webView.evaluateJavascript("Boolean(window.__socratesNative?.handleBackPress?.())") { result ->
                val consumed = result == "true"
                onResult(consumed)
            }
        }
    }
}
