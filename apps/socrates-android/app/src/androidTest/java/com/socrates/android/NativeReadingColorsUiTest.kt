package com.socrates.android

import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.socrates.android.ui.MarkdownSource
import com.socrates.android.ui.NativeMarkdown
import com.socrates.android.ui.NativeReadingColors
import com.socrates.android.ui.SocratesTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Source-level integration assertions over real TextViews, not pixel or accessibility acceptance. */
@RunWith(AndroidJUnit4::class)
class NativeReadingColorsUiTest {
    @get:Rule val composeRule = createAndroidComposeRule<ComponentActivity>()

    private fun views(): List<TextView> {
        val found = mutableListOf<TextView>()
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            fun visit(view: View) {
                if (view is TextView) found += view
                if (view is ViewGroup) for (index in 0 until view.childCount) visit(view.getChildAt(index))
            }
            visit(composeRule.activity.window.decorView)
        }
        return found
    }

    private fun show(markdown: String, streaming: Boolean = false) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent {
                SocratesTheme { NativeMarkdown(text = markdown, streaming = streaming) }
            }
        }
    }

    @Test
    fun themeRolesSharePaletteAndNativeBodyListQuoteAndTableCellsUsePrimaryText() {
        var themeRoles = emptyList<Int>()
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent {
                SocratesTheme {
                    themeRoles = listOf(
                        androidx.compose.material3.MaterialTheme.colorScheme.onBackground.toArgb(),
                        androidx.compose.material3.MaterialTheme.colorScheme.onSurface.toArgb(),
                    )
                }
            }
        }
        composeRule.waitForIdle()
        assertEquals(listOf(NativeReadingColors.textPrimary, NativeReadingColors.textPrimary), themeRoles)

        show("Body text\n\n- List text\n\n> Quote text\n\n| Cell |\n| --- |\n| Table text |")
        composeRule.waitUntil(15_000) {
            val all = views()
            listOf("Body text", "List text", "Quote text", "Cell", "Table text").all { token ->
                all.any { it.text.toString().contains(token) }
            }
        }
        val all = views()
        listOf("Body text", "List text", "Quote text", "Cell", "Table text").forEach { token ->
            val view = all.first { it.text.toString().contains(token) }
            assertEquals("unexpected TextView color for $token", NativeReadingColors.textPrimary, view.currentTextColor)
        }
    }

    @Test
    fun markdownSourcePreviewAndStreamingToFinalRevisionRemainStable() {
        val source = "First line\nSecond line"
        assertEquals(source, MarkdownSource.preview(source, streaming = false).markdown)
        val live = androidx.compose.runtime.mutableStateOf("Stream text")
        val streaming = androidx.compose.runtime.mutableStateOf(true)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent {
                SocratesTheme { NativeMarkdown(text = live.value, streaming = streaming.value) }
            }
        }
        composeRule.waitUntil(15_000) { views().any { it.text.toString().contains("Stream text") } }
        composeRule.runOnIdle {
            live.value = "Final text\nwith soft break"
            streaming.value = false
        }
        composeRule.waitUntil(15_000) { views().any { it.text.toString().contains("Final text") } }
        val rendered = views().first { it.text.toString().contains("Final text") }
        assertEquals(NativeReadingColors.textPrimary, rendered.currentTextColor)
        assertEquals("Final text\nwith soft break", rendered.text.toString())
    }
}
