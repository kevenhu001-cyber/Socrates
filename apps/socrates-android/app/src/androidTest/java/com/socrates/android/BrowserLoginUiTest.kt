package com.socrates.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.socrates.android.ui.AuthFlowSheet
import com.socrates.android.ui.BrowserLogin
import com.socrates.android.ui.SocratesTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class BrowserLoginUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun unavailableChromeCanBeRetriedWithoutAnyNativeCredentials() {
        var attempts = 0
        compose.setContent {
            SocratesTheme {
                AuthFlowSheet(onDismiss = {}, openBrowser = {
                    attempts++
                    if (attempts == 1) BrowserLogin.Result.ChromeUnavailable else BrowserLogin.Result.Opened
                })
            }
        }
        compose.onNodeWithText("通过 Chrome 继续").performScrollTo().performClick()
        compose.onNodeWithText("未找到可用的 Chrome", substring = true).assertExists()
        compose.onNodeWithText("通过 Chrome 继续").performScrollTo().performClick()
        compose.onNodeWithText("重新打开 Chrome").assertExists()
        compose.onNodeWithText("已打开 Chrome；完成登录后将返回此应用。").assertExists()
        compose.onNodeWithText("邮箱").assertDoesNotExist()
        compose.onNodeWithText("密码").assertDoesNotExist()
        compose.runOnIdle { assertEquals(2, attempts) }
    }

    @Test fun returningToAppRemainsAnExplicitDismissNotAnAuthenticationCallback() {
        var dismissed = 0
        compose.setContent {
            SocratesTheme { AuthFlowSheet(onDismiss = { dismissed++ }, openBrowser = { BrowserLogin.Result.Opened }) }
        }
        compose.onNodeWithText("返回应用，保留草稿").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(1, dismissed) }
    }
}
