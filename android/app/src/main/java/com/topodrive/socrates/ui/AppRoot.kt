package com.topodrive.socrates.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.core.graphics.toColorInt
import com.topodrive.socrates.icons.SocIcons
import com.topodrive.socrates.theme.LocalFontScale
import com.topodrive.socrates.theme.LocalSocratesColors
import com.topodrive.socrates.theme.SocratesTheme
import com.topodrive.socrates.theme.ThemePreference
import com.topodrive.socrates.vm.AppState
import androidx.compose.runtime.CompositionLocalProvider
import kotlinx.coroutines.launch

/**
 * Root composable — the Android shell mirroring the web `#app` layout:
 * left drawer (Sidebar), top bar, main content area, composer, plus the
 * overlay modals (search / model picker / share / settings / API keys).
 */
@Composable
fun AppRoot(app: AppState) {
    val themePref by app.themePref.collectAsState()
    val fontScale by app.fontScale.collectAsState()
    val bgOverride by app.bgOverrideDark.collectAsState()
    val bgOverrideL by app.bgOverrideLight.collectAsState()
    val authStage by app.authStage.collectAsState()

    val pref = when (themePref) {
        "light" -> ThemePreference.LIGHT
        "system" -> ThemePreference.SYSTEM
        else -> ThemePreference.DARK
    }

    SocratesTheme(pref) {
        val base = LocalSocratesColors.current
        // display-prefs background override — the web lets users pick page bg
        val overrideHex = if (base.dark) bgOverride else bgOverrideL
        val colors = if (overrideHex != null) {
            try { base.copy(background = Color(overrideHex.toColorInt())) } catch (_: Exception) { base }
        } else base

        CompositionLocalProvider(
            LocalSocratesColors provides colors,
            LocalFontScale provides fontScale,
        ) {
            when (authStage) {
                AppState.AuthStage.LOADING -> Splash()
                AppState.AuthStage.SIGNED_OUT -> AuthScreen(app)
                AppState.AuthStage.SIGNED_IN -> MainShell(app)
            }
        }
    }
}

@Composable
private fun Splash() {
    val c = LocalSocratesColors.current
    Box(Modifier.fillMaxSize().background(c.background), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = c.textMuted, modifier = Modifier.size(30.dp), strokeWidth = 2.dp)
    }
}

@Composable
private fun MainShell(app: AppState) {
    val c = LocalSocratesColors.current
    val screen by app.screen.collectAsState()
    val drawerOpen by app.drawerOpen.collectAsState()
    val searchOpen by app.searchOpen.collectAsState()
    val settingsOpen by app.settingsOpen.collectAsState()
    val apiKeysOpen by app.apiKeysOpen.collectAsState()
    val modelPickerOpen by app.modelPickerOpen.collectAsState()
    val shareOpen by app.shareOpen.collectAsState()
    val snack by app.snackbar.collectAsState()

    val ctx = androidx.compose.ui.platform.LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) scope.launch { attachUri(ctx, app, uri, "image") }
    }

    val drawerState = androidx.compose.material3.rememberDrawerState(
        if (drawerOpen) androidx.compose.material3.DrawerValue.Open else androidx.compose.material3.DrawerValue.Closed,
    )
    LaunchedEffect(drawerOpen) {
        if (drawerOpen) drawerState.open() else drawerState.close()
    }
    LaunchedEffect(drawerState.isOpen) {
        if (drawerState.isOpen != drawerOpen) app.openDrawer(drawerState.isOpen)
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = { ModalDrawerSheet(drawerContainerColor = c.surface, drawerContentColor = c.text) { Sidebar(app) } },
        gesturesEnabled = true,
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .background(c.background)
                .statusBarsPadding()
                .imePadding(),
        ) {
            TopBar(app)
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (screen) {
                    AppState.Screen.HOME -> HomeScreen(app) { imagePicker.launch("image/*") }
                    AppState.Screen.CHAT -> ChatScreen(app)
                    AppState.Screen.PROJECTS -> ProjectsPanel(app)
                    AppState.Screen.LIBRARY -> LibraryPanel(app)
                    AppState.Screen.ARTIFACTS -> ArtifactsPanel(app)
                    AppState.Screen.SCHEDULED -> ScheduledPanel(app)
                    AppState.Screen.PLUGINS -> PluginsPanel(app)
                    AppState.Screen.EXAM -> ExamPanel(app)
                    AppState.Screen.KNOWLEDGE -> KnowledgePanel(app)
                    AppState.Screen.MISTAKES -> MistakesPanel(app)
                    AppState.Screen.MORE -> MorePanel(app)
                    AppState.Screen.SKILLS -> SkillsPanel(app)
                }
            }
            if (screen == AppState.Screen.HOME || screen == AppState.Screen.CHAT) {
                Composer(app)
            }
        }
    }

    if (searchOpen) SearchOverlay(app)
    if (modelPickerOpen) ModelPickerSheet(app)
    if (shareOpen) ShareSheet(app)
    if (settingsOpen) SettingsSheet(app)
    if (apiKeysOpen) ApiKeysSheet(app)

    snack?.let { msg ->
        Box(Modifier.fillMaxSize()) {
            Snackbar(
                modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
                containerColor = c.surfaceRaised,
                contentColor = c.text,
                action = { TextButton(onClick = { app.clearToast() }) { Text("OK", color = c.text) } },
            ) { Text(msg) }
        }
    }
}
