package com.socrates.android.ui

import java.io.File
import org.junit.Assert.*
import org.junit.Test

/** Source wiring contracts only; these are not rendered/pixel or device assertions. */
class LoginLayoutContractTest {
    private val sourceDirectory = listOf(
        File("src/main/java/com/socrates/android/ui"),
        File("app/src/main/java/com/socrates/android/ui"),
        File("apps/socrates-android/app/src/main/java/com/socrates/android/ui"),
    ).first { it.isDirectory }
    private fun source(name: String) = File(sourceDirectory, name).readText()

    @Test fun loginHasOneEntryPointAndKeepsChromeHandoffAndAllLaunchOutcomes() {
        val login = source("LoginScreen.kt")
        assertFalse(source("UtilityScreens.kt").contains("fun AuthFlowSheet("))
        assertTrue(login.contains("BrowserLogin.open(context, baseUrl)"))
        listOf("Opened", "ChromeUnavailable", "LaunchFailed").forEach {
            assertTrue(login.contains("BrowserLogin.Result.$it ->"))
        }
        assertTrue(login.contains("BrowserLoginHandoff.productionBase(baseUrl)"))
        assertTrue(login.contains("rememberSaveable(baseUrl)"))
        assertFalse(login.contains("SocratesField("))
        assertFalse(login.contains("authenticated("))
        assertFalse(login.contains("exchangeBrowserLogin("))
    }

    @Test fun loginCentersBrandIndependentlyAndConstrainsTheActionColumn() {
        val login = source("LoginScreen.kt")
        assertTrue(login.contains("align(Alignment.Center).padding(horizontal = 52.dp)"))
        assertTrue(login.contains("align(Alignment.CenterEnd)"))
        assertTrue(login.contains("widthIn(max = 400.dp).fillMaxWidth()"))
        assertTrue(login.contains("heightIn(min = 52.dp)"))
        assertFalse(login.contains("Spacer(Modifier.size(48.dp))"))
    }

    @Test fun loginCentersOnlyAfterScrollSoShortWindowsCanGrowAndScroll() {
        val login = source("LoginScreen.kt")
        assertTrue(Regex("verticalScroll\\(rememberScrollState\\(\\)\\)\\s*\\.heightIn\\(min = maxHeight\\)").containsMatchIn(login))
        assertTrue(login.contains("verticalArrangement = Arrangement.Center"))
        assertTrue(login.indexOf("testTag(\"login-continue\")") < login.indexOf("在浏览器中安全登录\""))
        assertTrue(login.contains("LiveRegionMode.Assertive"))
        assertTrue(login.contains("LiveRegionMode.Polite"))
        assertTrue(login.contains("semantics { heading() }"))
    }

    @Test fun fullScreenContentAndSheetsAlsoAvoidHorizontalCutoutsAndIme() {
        // safeDrawing is Compose's union of system bars, display cutout and IME.
        assertTrue(source("LoginScreen.kt").contains("windowInsetsPadding(WindowInsets.safeDrawing)"))
        val app = source("SocratesApp.kt")
        assertTrue(app.contains("Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing))"))
        assertTrue(app.contains("windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 24.dp)"))
        assertTrue(app.contains("WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom)"))
        assertTrue(source("SocratesControls.kt").contains("windowInsetsPadding(WindowInsets.safeDrawing), contentAlignment = Alignment.BottomCenter"))
    }

    @Test fun closeBackRetryAndDraftReturnRemainExplicitRealActions() {
        val login = source("LoginScreen.kt")
        assertTrue(login.contains("BackHandler(onBack = onDismiss)"))
        assertTrue(login.contains("dismissOnClickOutside = false"))
        assertTrue(login.contains("SocratesIconButton(onClick = onDismiss"))
        assertTrue(login.contains("SocratesTextButton(onClick = onDismiss"))
        assertTrue(login.contains("返回应用，保留草稿"))
        assertTrue(login.contains("if (opened) \"重新打开 Chrome\" else \"通过 Chrome 继续\""))
    }
}
