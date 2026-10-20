package com.socrates.android

import android.text.method.LinkMovementMethod
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.sp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.socrates.android.ui.NativeMarkdown
import com.socrates.android.ui.NativeReadingTypography
import com.socrates.android.ui.SocratesTheme
import com.socrates.android.ui.applyMarkdownProseTypography
import com.socrates.android.ui.markdownTextView
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Compiled integration coverage; executing this requires a device, not a pixel parity assertion. */
@RunWith(AndroidJUnit4::class)
class NativeReadingTypographyUiTest {
    @get:Rule val composeRule = createAndroidComposeRule<ComponentActivity>()

    private fun withViews(assertion: (List<TextView>) -> Unit) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val found = mutableListOf<TextView>()
            fun visit(view: View) {
                if (view is TextView) found += view
                if (view is ViewGroup) for (index in 0 until view.childCount) visit(view.getChildAt(index))
            }
            visit(composeRule.activity.window.decorView)
            assertion(found)
        }
    }

    private fun hasText(token: String): Boolean {
        var found = false
        withViews { found = it.any { view -> view.text.toString().contains(token) } }
        return found
    }

    private fun assertProse(view: TextView) {
        val metrics = view.paint.fontMetricsInt
        assertEquals(NativeReadingTypography.extraLineSpacingPx(view.textSize,
            (metrics.descent - metrics.ascent).toFloat()), view.lineSpacingExtra, .01f)
        assertEquals(1f, view.lineSpacingMultiplier, 0f)
        assertFalse(view.includeFontPadding)
        assertTrue(view.isTextSelectable)
        assertTrue(view.movementMethod is LinkMovementMethod)
    }

    @Test fun bodyListQuoteAndDeepFallbackUseProsePolicyWhileTableRetainsMetrics() {
        val deep = "> ".repeat(14) + "Deep leaf"
        var tableTextPx = 0f
        var tableSpacingPx = 0f
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent {
                SocratesTheme {
                    with(LocalDensity.current) {
                        tableTextPx = 14.sp.toPx()
                        tableSpacingPx = 7.sp.toPx()
                    }
                    NativeMarkdown("Body leaf\nsoft line\n\n- List leaf\n\n> Quote leaf\n\n$deep\n\n| Cell |\n| --- |\n| Table leaf |")
                }
            }
        }
        composeRule.waitUntil(15_000) {
            listOf("Body leaf", "List leaf", "Quote leaf", "Deep leaf", "Table leaf").all(::hasText)
        }
        withViews { all ->
            listOf("Body leaf", "List leaf", "Quote leaf", "Deep leaf").forEach { token ->
                assertProse(all.first { it.text.toString().contains(token) })
            }
            val cell = all.first { it.text.toString().contains("Table leaf") }
            assertEquals(tableTextPx, cell.textSize, .01f)
            assertEquals(tableSpacingPx, cell.lineSpacingExtra, .01f)
        }
    }

    @Test fun streamingToFinalRetainsPolicyAndSoftBreaks() {
        val source = mutableStateOf("Stream leaf")
        val streaming = mutableStateOf(true)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.setContent {
                SocratesTheme { NativeMarkdown(source.value, streaming = streaming.value) }
            }
        }
        composeRule.waitUntil(15_000) { hasText("Stream leaf") }
        composeRule.runOnIdle {
            source.value = "Final leaf\nsoft line"
            streaming.value = false
        }
        composeRule.waitUntil(15_000) { hasText("Final leaf") }
        withViews { all ->
            val view = all.first { it.text.toString().contains("Final leaf") }
            assertProse(view)
            assertEquals("Final leaf\nsoft line", view.text.toString())
        }
    }

    @Test fun reusedHostRecalculatesAfterTextSizeChangeWithoutChangingSelection() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val view = markdownTextView(composeRule.activity, 17f, 0f)
            applyMarkdownProseTypography(view, 17f)
            assertProse(view)
            applyMarkdownProseTypography(view, 34f)
            assertEquals(34f, view.textSize, .01f)
            assertProse(view)
        }
    }
}
