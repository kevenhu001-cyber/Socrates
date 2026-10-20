package com.socrates.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.socrates.android.data.VoiceLanguage
import com.socrates.android.data.VoicePreferencesState
import com.socrates.android.ui.VoicePreferencesSheet
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Source compilation only: no device or emulator is used for this increment. */
class VoicePreferencesUiTest {
    @get:Rule val compose = createComposeRule()
    @Test fun selectingLanguageDoesNotSaveAutomatically() {
        var selected: VoiceLanguage? = null
        var saved = 0
        compose.setContent { MaterialTheme {
            VoicePreferencesSheet(VoicePreferencesState(confirmed = VoiceLanguage.AUTO), { selected = it }, { saved++ }, {}, {})
        } }
        compose.onNodeWithText("English").performScrollTo().performClick()
        assertEquals(VoiceLanguage.ENGLISH, selected)
        assertEquals(0, saved)
        compose.onNodeWithText("保存语言偏好").performScrollTo().assertIsNotEnabled()
    }
    @Test fun dirtySelectionRequiresExplicitSaveAtNarrowWidth() {
        var saved = 0
        compose.setContent { MaterialTheme { Box(Modifier.width(320.dp)) {
            VoicePreferencesSheet(VoicePreferencesState(confirmed = VoiceLanguage.AUTO, selected = VoiceLanguage.CHINESE), {}, { saved++ }, {}, {})
        } } }
        compose.onNodeWithText("中文").performScrollTo().assertIsSelected()
        compose.onNodeWithText("保存语言偏好").performScrollTo().performClick()
        assertEquals(1, saved)
    }
    @Test fun loadingDisablesSelectionAndSaveButAllowsClose() {
        compose.setContent { MaterialTheme {
            VoicePreferencesSheet(VoicePreferencesState(loading = true), {}, {}, {}, {})
        } }
        compose.onNodeWithText("正在读取账号偏好…").performScrollTo().assertExists()
        compose.onNodeWithText("中文").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("保存语言偏好").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("关闭").performScrollTo().assertIsEnabled()
    }
    @Test fun savingDisablesConflictingActions() {
        var dismissed = 0
        compose.setContent { MaterialTheme {
            VoicePreferencesSheet(VoicePreferencesState(confirmed = VoiceLanguage.AUTO, selected = VoiceLanguage.ENGLISH, saving = true), {}, {}, {}, { dismissed++ })
        } }
        compose.onNodeWithText("English").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("保存中…").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("重新读取（放弃未保存选择）").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("关闭").performScrollTo().assertIsNotEnabled()
        assertEquals(0, dismissed)
    }
    @Test fun dirtyCloseOffersContinueOrExplicitDiscard() {
        var dismissed = 0
        compose.setContent { MaterialTheme {
            VoicePreferencesSheet(VoicePreferencesState(confirmed = VoiceLanguage.AUTO, selected = VoiceLanguage.ENGLISH), {}, {}, {}, { dismissed++ })
        } }
        compose.onNodeWithText("关闭").performScrollTo().performClick()
        compose.onNodeWithText("继续编辑").performClick()
        assertEquals(0, dismissed)
        compose.onNodeWithText("关闭").performScrollTo().performClick()
        compose.onNodeWithText("放弃并关闭").performClick()
        assertEquals(1, dismissed)
    }
    @Test fun uncertainSaveKeepsDraftButOnlyAllowsReload() {
        var reloads = 0
        compose.setContent { MaterialTheme {
            VoicePreferencesSheet(VoicePreferencesState(confirmed = VoiceLanguage.AUTO, selected = VoiceLanguage.ENGLISH,
                needsRefresh = true, error = "保存结果未确认"), {}, {}, { reloads++ }, {})
        } }
        compose.onNodeWithText("保存结果未确认").performScrollTo().assertExists()
        compose.onNodeWithText("保存语言偏好").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("重新读取（放弃未保存选择）").performScrollTo().performClick()
        assertEquals(1, reloads)
    }
}
