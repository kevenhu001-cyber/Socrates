package com.socrates.android

import android.content.ActivityNotFoundException
import android.content.Intent
import com.socrates.android.ui.BrowserLogin
import org.junit.Assert.*
import org.junit.Test
import androidx.test.platform.app.InstrumentationRegistry

/** These tests inspect intents using an injected dispatcher, never opening a real browser. */
class BrowserLoginTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    @Test fun targetsOnlyChromeAndTheFixedHttpsOriginWithoutCredentials() {
        val intent = BrowserLogin.intent()
        assertEquals(Intent.ACTION_VIEW, intent.action)
        assertEquals("com.android.chrome", intent.`package`)
        assertEquals("https://app.topodrive.top", intent.dataString)
        assertTrue(intent.hasCategory(Intent.CATEGORY_BROWSABLE))
        assertTrue(intent.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
        assertNull(intent.data?.query)
        assertNull(intent.data?.fragment)
        assertNull(intent.data?.userInfo)
        assertNull(intent.extras)
    }

    @Test fun dispatchedIntentMeansBrowserOpenedNotNativeAuthenticated() {
        var dispatched: Intent? = null
        val result = BrowserLogin.launch(context) { dispatched = it }
        assertEquals(BrowserLogin.Result.Opened, result)
        assertEquals(BrowserLogin.WEB_URL, dispatched?.dataString)
    }

    @Test fun missingChromeDoesNotSilentlyFallBackToAnotherBrowser() {
        var attempts = 0
        val result = BrowserLogin.launch(context) { attempts++; throw ActivityNotFoundException() }
        assertEquals(BrowserLogin.Result.ChromeUnavailable, result)
        assertEquals(1, attempts)
    }

    @Test fun systemRestrictionIsReportedWithoutMarkingAnyAccountLoggedIn() {
        val result = BrowserLogin.launch(context) { throw SecurityException("fixture restriction") }
        assertEquals(BrowserLogin.Result.LaunchFailed, result)
    }
}
