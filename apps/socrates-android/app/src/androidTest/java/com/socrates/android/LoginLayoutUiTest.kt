package com.socrates.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.socrates.android.ui.LoginLanding
import com.socrates.android.ui.SocratesTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Auth content geometry only; compile checks do not count as executing these tests. */
class LoginLayoutUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun brandIsCenteredRatherThanBalancedAgainstAnUnequalSpacer() {
        compose.setContent {
            SocratesTheme {
                Box(Modifier.requiredSize(320.dp, 600.dp)) {
                    LoginLanding(false, null, {}, {}, Modifier.requiredSize(320.dp, 600.dp))
                }
            }
        }
        val brand = compose.onNodeWithTag("login-brand").fetchSemanticsNode().boundsInRoot
        val viewport = compose.onNodeWithTag("login-viewport").fetchSemanticsNode().boundsInRoot
        assertEquals(viewport.center.x, brand.center.x, 1f)
        compose.onNodeWithContentDescription("关闭登录").assertHasClickAction()
    }

    @Test fun wideWindowKeepsContentAndActionsOnOneBoundedCenterAxis() {
        var density = 1f
        compose.setContent {
            density = LocalDensity.current.density
            SocratesTheme {
                LoginLanding(false, null, {}, {}, Modifier.requiredSize(720.dp, 720.dp))
            }
        }
        val content = compose.onNodeWithTag("login-content").fetchSemanticsNode().boundsInRoot
        val viewport = compose.onNodeWithTag("login-viewport").fetchSemanticsNode().boundsInRoot
        val action = compose.onNodeWithTag("login-continue").fetchSemanticsNode().boundsInRoot
        assertEquals(400f * density, content.width, 1f)
        assertEquals(viewport.center.x, content.center.x, 1f)
        assertEquals(content.left, action.left, 1f)
        assertEquals(content.right, action.right, 1f)
    }

    @Test fun shortWindowAndLargeTypeKeepActionsAndFooterReachableWithoutClipping() {
        var continued = 0
        var dismissed = 0
        var density = 1f
        compose.setContent {
            val base = LocalDensity.current
            density = base.density
            CompositionLocalProvider(LocalDensity provides Density(base.density, fontScale = 2f)) {
                SocratesTheme {
                    LoginLanding(false, "请检查浏览器后重试。", { dismissed++ }, { continued++ },
                        Modifier.requiredSize(320.dp, 360.dp))
                }
            }
        }
        compose.onNodeWithTag("login-continue").performScrollTo().performClick()
        val action = compose.onNodeWithTag("login-continue").fetchSemanticsNode().boundsInRoot
        assertTrue(action.height >= 52f * density - 1f)
        compose.onNodeWithText("应用不读取 Chrome 中的密码或 Cookie。").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("返回应用，保留草稿").performScrollTo().performClick()
        compose.runOnIdle {
            assertEquals(1, continued)
            assertEquals(1, dismissed)
        }
    }
}
