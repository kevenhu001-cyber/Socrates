package com.socrates.android

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.socrates.android.ui.SocratesRadio
import com.socrates.android.ui.SocratesSwitch
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Interaction checks only: a compiled test is not a screenshot or pixel comparison. */
class CustomControlsUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun passiveRadioLetsItsParentRowReceiveTheTouch() {
        val selected = mutableStateOf(false)
        compose.setContent {
            MaterialTheme {
                Row(Modifier.selectable(selected.value, role = Role.RadioButton, onClick = { selected.value = !selected.value })) {
                    SocratesRadio(selected.value, null, Modifier.testTag("indicator"))
                    Text("测试选项")
                }
            }
        }
        compose.onNodeWithTag("indicator", useUnmergedTree = true).performTouchInput { click(center) }
        compose.runOnIdle { assertTrue(selected.value) }
    }

    @Test fun ownedSwitchExposesAndChangesItsCheckedState() {
        val checked = mutableStateOf(false)
        compose.setContent { MaterialTheme { SocratesSwitch(checked.value, { checked.value = it }, Modifier.testTag("switch")) } }
        compose.onNodeWithTag("switch").assertIsOff().performClick().assertIsOn()
        compose.runOnIdle { assertTrue(checked.value) }
    }
}
