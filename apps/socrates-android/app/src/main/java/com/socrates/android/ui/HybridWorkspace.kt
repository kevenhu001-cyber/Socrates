package com.socrates.android.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsAnimation
import android.webkit.ConsoleMessage
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import com.socrates.android.bridge.SocratesNativeBridge

private const val SPA_DOMAIN = "appassets.androidplatform.net"
private const val SPA_INDEX_URL = "https://$SPA_DOMAIN/index.html"

/**
 * High-performance, pixel-perfect Hybrid Workspace Container.
 * Hosts the Vite SPA via WebViewAssetLoader for 0ms cold-start and full Web API compatibility.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun HybridWorkspace(
    modifier: Modifier = Modifier,
    onBackExit: () -> Unit = {},
    onThemeMode: (Boolean) -> Unit = {}
) {
    val context = LocalContext.current
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var isBackInterceptActive by remember { mutableStateOf(false) }
    val systemDark = isSystemInDarkTheme()
    var resolvedDark by remember { mutableStateOf<Boolean?>(null) }
    val canvasColor = if (resolvedDark ?: systemDark) Color.Black else Color(0xFFF8F8F8)

    val bridge = remember {
        SocratesNativeBridge(
            context = context,
            webViewProvider = { webViewRef },
            onPageReady = {},
            onThemeMode = { dark ->
                resolvedDark = dark
                onThemeMode(dark)
            }
        )
    }

    // Intercept system back press and query the SPA overlay stack first
    BackHandler(enabled = true) {
        if (isBackInterceptActive) return@BackHandler
        isBackInterceptActive = true
        bridge.dispatchBackPress { consumed ->
            isBackInterceptActive = false
            if (!consumed) {
                // SPA has no open modals or drawer; exit or delegate to Activity
                onBackExit()
            }
        }
    }

    Box(modifier = modifier.fillMaxSize().background(canvasColor)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                createConfiguredWebView(ctx, bridge, canvasColor.toArgb()) { wv ->
                    webViewRef = wv
                }
            },
            update = { wv ->
                webViewRef = wv
                wv.setBackgroundColor(canvasColor.toArgb())
            }
        )
    }

    DisposableEffect(Unit) {
        onDispose {
            webViewRef?.let { wv ->
                wv.stopLoading()
                wv.removeJavascriptInterface("SocratesAndroid")
                (wv.parent as? ViewGroup)?.removeView(wv)
                wv.destroy()
            }
            webViewRef = null
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
private fun createConfiguredWebView(
    context: Context,
    bridge: SocratesNativeBridge,
    backgroundColor: Int,
    onCreated: (WebView) -> Unit
): WebView {
    val assetLoader = WebViewAssetLoader.Builder()
        .setDomain(SPA_DOMAIN)
        .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(context))
        .build()

    val webView = WebView(context).apply {
        layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        setBackgroundColor(backgroundColor)
        isVerticalScrollBarEnabled = false
        isHorizontalScrollBarEnabled = false

        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            loadWithOverviewMode = true
            useWideViewPort = true
            displayZoomControls = false
            builtInZoomControls = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            textZoom = 100
        }

        addJavascriptInterface(bridge, "SocratesAndroid")

        webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                return assetLoader.shouldInterceptRequest(url)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
            }
        }

        webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                // Forward console messages to Logcat in debug builds if desired
                return super.onConsoleMessage(consoleMessage)
            }
        }
    }

    setupWindowInsetsListener(webView, bridge)
    webView.loadUrl(SPA_INDEX_URL)
    onCreated(webView)
    return webView
}

/**
 * Attach WindowInsetsAnimationCallback (API 30+) for frame-accurate soft keyboard height synchronization,
 * plus standard WindowInsets for status/navigation bar cutouts.
 */
private fun setupWindowInsetsListener(view: View, bridge: SocratesNativeBridge) {
    val density = view.resources.displayMetrics.density

    ViewCompat.setOnApplyWindowInsetsListener(view) { _, insets ->
        val safeInsets = insets.getInsets(
            WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
        )
        bridge.dispatchSystemInsets(
            topDp = safeInsets.top / density,
            bottomDp = safeInsets.bottom / density,
            leftDp = safeInsets.left / density,
            rightDp = safeInsets.right / density
        )

        // If below API 30, also dispatch keyboard height on apply insets
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            val imeHeight = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            bridge.dispatchKeyboardHeight(imeHeight / density)
        }
        insets
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        view.setWindowInsetsAnimationCallback(object : WindowInsetsAnimation.Callback(DISPATCH_MODE_STOP) {
            override fun onProgress(
                insets: WindowInsets,
                runningAnimations: MutableList<WindowInsetsAnimation>
            ): WindowInsets {
                val imeBottom = insets.getInsets(WindowInsets.Type.ime()).bottom
                bridge.dispatchKeyboardHeight(imeBottom / density)
                return insets
            }

            override fun onEnd(animation: WindowInsetsAnimation) {
                super.onEnd(animation)
                val imeBottom = view.rootWindowInsets?.getInsets(WindowInsets.Type.ime())?.bottom ?: 0
                bridge.dispatchKeyboardHeight(imeBottom / density)
            }
        })
    }
}
