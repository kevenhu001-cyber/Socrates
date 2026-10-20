package com.socrates.android.ui

import androidx.compose.ui.unit.Density
import java.io.File
import org.junit.Assert.*
import org.junit.Test

/** Arrangement math and source wiring only, not rendered Android UI tests. */
class NavigationLayoutTest {
    private fun arrange(viewport: Int, vararg sizes: Int): IntArray = IntArray(sizes.size).also { result ->
        with(SidebarFooterArrangement) { with(Density(1f)) { arrange(viewport, sizes, result) } }
    }

    @Test fun underfilledDrawerKeepsFooterAtBottom() {
        assertArrayEquals(intArrayOf(0, 78, 126, 510), arrange(600, 78, 48, 48, 90))
    }

    @Test fun exactFitHasNoExtraGap() {
        assertArrayEquals(intArrayOf(0, 78, 126), arrange(216, 78, 48, 90))
    }

    @Test fun overflowNeverOverlapsFooterWithEarlierContent() {
        assertArrayEquals(intArrayOf(0, 120, 340), arrange(280, 120, 220, 140))
    }

    @Test fun emptyAndFooterOnlyAreSafe() {
        assertArrayEquals(intArrayOf(), arrange(300))
        assertArrayEquals(intArrayOf(210), arrange(300, 90))
        assertArrayEquals(intArrayOf(0), arrange(40, 90))
    }

    @Test fun zeroHeightSearchItemDoesNotChangeBottomAnchor() {
        assertArrayEquals(intArrayOf(0, 78, 78, 510), arrange(600, 78, 0, 48, 90))
    }

    private val directory = listOf(File("src/main/java/com/socrates/android/ui"),
        File("app/src/main/java/com/socrates/android/ui"),
        File("apps/socrates-android/app/src/main/java/com/socrates/android/ui")).first { it.isDirectory }
    private fun source(name: String) = File(directory, name).readText()

    @Test fun headerRetainsModeVisibilityAndRealAdjacentActions() {
        val app = source("SocratesApp.kt").substringAfter("internal fun ChatHeader").substringBefore("private fun CircleAction")
        assertTrue(app.contains("if (!hasMessages || work)"))
        assertTrue(app.contains("ChatModeSwitch(work, onMode"))
        assertTrue(app.contains("onConversationAction(\"models\")"))
        assertTrue(app.contains("if (hasMessages) onNew"))
        assertTrue(app.contains("if (hasMessages && !work)"))
        assertTrue(app.contains("Modifier.align(Alignment.CenterEnd)"))
        assertFalse(app.contains("height(SocratesDesign.HeaderHeight)"))
    }

    @Test fun segmentedCapsuleHasRaisedSelectionAndFullSizeTabTargets() {
        val layout = source("NavigationLayout.kt")
        listOf("selectableGroup()", "heightIn(min = 44.dp)", "role = Role.Tab",
            "shadow(if (selected) 2.dp else 0.dp", "if (selected) Color.White",
            "background(SocratesDesign.PillSelected)", "if (!selected) onMode(mode)").forEach {
            assertTrue("Missing segment contract: $it", layout.contains(it))
        }
    }

    @Test fun drawerHasOneSafeScrollableViewportAndAllSectionsAreItems() {
        val app = source("SocratesApp.kt").substringAfter("internal fun NativeSidebar")
        assertEquals(1, Regex("LazyColumn\\(").findAll(app).count())
        assertTrue(app.contains("windowInsetsPadding(AppSafeInsets)"))
        assertTrue(app.contains("verticalArrangement = SidebarFooterArrangement"))
        listOf("sidebar-header", "sidebar-search", "sidebar-footer").forEach {
            assertTrue(app.contains("item(key = \"$it\")"))
        }
        assertTrue(app.contains("heightIn(min = 48.dp)"))
        assertTrue(app.contains("heightIn(min = 44.dp)"))
        assertFalse(app.contains("height(48.dp)"))
        assertFalse(app.contains("Modifier.weight(1f), contentPadding"))
    }

    @Test fun drawerIsAnInWindowOverlaySoTheScrimAndFooterCoverTheRealWindow() {
        val controls = source("SocratesControls.kt")
        val drawer = controls.substringAfter("fun SocratesNavigationDrawer").substringBefore("fun SocratesDrawerSheet")
        assertFalse("A separate Dialog window is inset by the status bar on some OEMs", drawer.contains("Dialog("))
        assertFalse(drawer.contains("DialogWindowProvider"))
        assertTrue(drawer.contains("BackHandler { drawerState.close() }"))
        assertTrue(drawer.contains("Modifier.clearAndSetSemantics {}"))
        assertTrue(controls.contains("WindowInsets.systemGestures.only(WindowInsetsSides.Bottom)"))
    }
}
