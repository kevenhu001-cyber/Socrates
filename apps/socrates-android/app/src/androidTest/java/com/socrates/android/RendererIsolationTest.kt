package com.socrates.android

import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.socrates.android.ui.createRestrictedResultWebView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RendererIsolationTest {
    @Test fun rendererLoadsBundledAssetsAndBlocksExternalRequests() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        lateinit var webView: WebView
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            webView = createRestrictedResultWebView(context)
        }

        try {
            assertTrue(webView.settings.javaScriptEnabled)
            assertFalse(webView.settings.allowFileAccess)
            assertFalse(webView.settings.allowContentAccess)
            assertFalse(webView.settings.domStorageEnabled)
            assertFalse(webView.settings.javaScriptCanOpenWindowsAutomatically)

            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                val external = webView.webViewClient.shouldInterceptRequest(webView, "https://example.invalid/tracker.js")
                assertNotNull(external)
                assertEquals(0, requireNotNull(external).data.readBytes().size)
                assertTrue(webView.webViewClient.shouldOverrideUrlLoading(webView, "https://example.invalid/redirect"))
                assertFalse(webView.webViewClient.shouldOverrideUrlLoading(webView, "https://appassets.androidplatform.net/assets/render/index.html"))

                val local = webView.webViewClient.shouldInterceptRequest(webView, "https://appassets.androidplatform.net/assets/render/index.html")
                assertNotNull(local)
                assertTrue(requireNotNull(local).data.bufferedReader().use { it.readText() }.contains("Content-Security-Policy"))
            }
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync { webView.destroy() }
        }
    }
}
