package com.socrates.android

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.socrates.android.ui.PdfPageViewport
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Compile-only in code parity passes; none of these assertions imply device validation. */
class PdfPageViewportUiTest {
    @get:Rule val compose = createComposeRule()
    private fun bitmap() = Bitmap.createBitmap(300, 400, Bitmap.Config.ARGB_8888)
    private fun viewport() = compose.onNodeWithTag("pdf-page-viewport")
    private fun content() {
        val page = bitmap()
        compose.setContent { MaterialTheme {
            Column(Modifier.width(320.dp).verticalScroll(rememberScrollState())) {
                PdfPageViewport(page, "真实页面入口测试", "file-1/page-1")
            }
        } }
    }
    private fun zoomIn() = compose.onNodeWithText("放大").performScrollTo().performClick()
    private fun zoomOut() = compose.onNodeWithText("缩小").performScrollTo().performClick()
    private fun customAction(label: String) {
        val action = viewport().fetchSemanticsNode().config[SemanticsActions.CustomActions].first { it.label == label }
        compose.runOnIdle { assertTrue(action.action()) }
    }

    @Test fun fitStartsWithExplicitLimitsAndReadableControls() {
        content()
        compose.onNodeWithText("缩放 100%").assertExists()
        compose.onNodeWithText("缩小").assertIsNotEnabled()
        compose.onNodeWithText("适合页面").assertIsNotEnabled()
        compose.onNodeWithText("放大").assertIsEnabled()
        compose.onNodeWithContentDescription("真实页面入口测试").assertExists()
    }
    @Test fun buttonZoomClampsAtFourTimesAndCanReset() {
        content()
        repeat(6) { zoomIn() }
        compose.onNodeWithText("缩放 400%").assertExists()
        compose.onNodeWithText("放大").assertIsNotEnabled()
        zoomOut()
        compose.onNodeWithText("缩放 350%").assertExists()
        compose.onNodeWithText("适合页面").performScrollTo().performClick()
        compose.onNodeWithText("缩放 100%").assertExists()
        compose.onNodeWithText("缩小").assertIsNotEnabled()
    }
    @Test fun changedPageIdentityResetsEvenWhenBitmapInstanceIsReused() {
        val page = bitmap()
        val identity = mutableStateOf("file-1/page-1")
        compose.setContent { MaterialTheme { Column { PdfPageViewport(page, "页面", identity.value) } } }
        compose.onNodeWithText("放大").performClick()
        compose.onNodeWithText("缩放 150%").assertExists()
        compose.runOnIdle { identity.value = "file-1/page-2" }
        compose.onNodeWithText("缩放 100%").assertExists()
        compose.onNodeWithText("缩小").assertIsNotEnabled()
        compose.onNodeWithText("放大").assertIsEnabled().performClick()
        compose.onNodeWithText("缩放 150%").assertExists()
    }
    @Test fun newRasterForSamePageDoesNotKeepOldTransform() {
        val page = mutableStateOf(bitmap())
        compose.setContent { MaterialTheme { Column { PdfPageViewport(page.value, "页面", "same-page") } } }
        compose.onNodeWithText("放大").performClick()
        compose.onNodeWithText("缩放 150%").assertExists()
        compose.runOnIdle { page.value = bitmap() }
        compose.onNodeWithText("缩放 100%").assertExists()
        compose.onNodeWithText("放大").assertIsEnabled().performClick()
        compose.onNodeWithText("缩放 150%").assertExists()
    }
    @Test fun doubleTapTogglesZoomAndReset() {
        content()
        viewport().performScrollTo().performTouchInput { doubleClick(center) }
        compose.onNodeWithText("缩放 200%").assertExists()
        viewport().performTouchInput { doubleClick(center) }
        compose.onNodeWithText("缩放 100%").assertExists()
    }
    @Test fun accessibilityProvidesZoomResetAndDirectionalReading() {
        content()
        customAction("放大 PDF")
        compose.onNodeWithText("缩放 150%").assertExists()
        listOf("向右阅读 PDF", "向左阅读 PDF", "向下阅读 PDF", "向上阅读 PDF").forEach(::customAction)
        customAction("重置 PDF 缩放")
        compose.onNodeWithText("缩放 100%").assertExists()
    }

    @Test fun pinchChangesScaleWithoutPageNavigation() {
        content()
        viewport().performScrollTo().performTouchInput {
            pinch(Offset(center.x - 25f, center.y), Offset(center.x + 25f, center.y),
                Offset(center.x - 80f, center.y), Offset(center.x + 80f, center.y))
        }
        compose.onNodeWithText("缩小").assertIsEnabled()
        compose.onNodeWithText("适合页面").assertIsEnabled()
        compose.onNodeWithContentDescription("真实页面入口测试").assertExists()
    }

    @Test fun newDragAtClampedBottomEdgeCanScrollParent() {
        val page = bitmap()
        lateinit var scroll: androidx.compose.foundation.ScrollState
        compose.setContent { MaterialTheme {
            scroll = rememberScrollState()
            Column(Modifier.width(320.dp).height(600.dp).verticalScroll(scroll)) {
                PdfPageViewport(page, "页面", "page")
                Spacer(Modifier.height(1200.dp))
            }
        } }
        customAction("放大 PDF")
        // Move the page to its bottom edge using non-touch, accessible reading actions.
        repeat(5) { customAction("向下阅读 PDF") }
        viewport().performTouchInput { swipeUp() }
        compose.runOnIdle { assertTrue(scroll.value > 0) }
    }
}
