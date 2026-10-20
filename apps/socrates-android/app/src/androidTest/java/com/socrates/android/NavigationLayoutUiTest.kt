package com.socrates.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.socrates.android.data.ChatSession
import com.socrates.android.ui.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Device tests for later execution. Compiling this source is NOT executing it. */
class NavigationLayoutUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun modesExposeSelectionAndDoNotRepeatTheSelectedAction() {
        var changes = 0
        compose.setContent {
            var work by remember { mutableStateOf(false) }
            SocratesTheme { ChatModeSwitch(work, { work = it; changes++ }, Modifier.width(170.dp)) }
        }
        compose.onNodeWithText("聊天").assertIsSelected().performClick()
        compose.runOnIdle { assertEquals(0, changes) }
        compose.onNodeWithText("工作").performClick().assertIsSelected()
        compose.onNodeWithText("聊天").assertIsNotSelected().performClick().assertIsSelected()
        compose.runOnIdle { assertEquals(2, changes) }
    }

    @Test fun narrowLargeTypeHeaderCentersSwitchAndKeepsActionsSeparate() {
        var density = 1f
        var menu = 0
        var models = 0
        compose.setContent {
            val base = LocalDensity.current
            density = base.density
            CompositionLocalProvider(LocalDensity provides Density(base.density, 2f)) {
                SocratesTheme {
                    Box(Modifier.requiredSize(320.dp, 180.dp)) {
                        ChatHeader(false, false, false, null, { if (it == "models") models++ }, { menu++ }, {}, {})
                    }
                }
            }
        }
        val header = compose.onNodeWithTag("chat-header").fetchSemanticsNode().boundsInRoot
        val switch = compose.onNodeWithTag("chat-mode-switch").fetchSemanticsNode().boundsInRoot
        val left = compose.onNodeWithContentDescription("打开侧边栏").fetchSemanticsNode().boundsInRoot
        val right = compose.onNodeWithContentDescription("模型设置").fetchSemanticsNode().boundsInRoot
        assertEquals(header.center.x, switch.center.x, 1f)
        assertTrue(left.right <= switch.left)
        assertTrue(switch.right <= right.left)
        listOf("聊天", "工作").forEach {
            val bounds = compose.onNodeWithText(it).fetchSemanticsNode().boundsInRoot
            assertTrue(bounds.width >= 44f * density - 1f)
            assertTrue(bounds.height >= 44f * density - 1f)
        }
        compose.onNodeWithContentDescription("打开侧边栏").performClick()
        compose.onNodeWithContentDescription("模型设置").performClick()
        compose.runOnIdle { assertEquals(1, menu); assertEquals(1, models) }
    }

    @Test fun conversationHeaderKeepsNewChatAndMenuInsteadOfInventingRoutes() {
        var newChat = 0
        compose.setContent {
            SocratesTheme {
                Box(Modifier.requiredSize(320.dp, 180.dp)) {
                    ChatHeader(false, false, true, null, {}, {}, {}, { newChat++ })
                }
            }
        }
        compose.onNodeWithText("工作").assertDoesNotExist()
        compose.onNodeWithContentDescription("新建对话").performClick()
        compose.onNodeWithContentDescription("对话菜单").performClick()
        compose.onNodeWithText("在聊天中查找").assertIsDisplayed()
        compose.runOnIdle { assertEquals(1, newChat) }
    }

    @Test fun shortLargeTypeDrawerCanScrollToBothBottomControlsEvenWithSearchExpanded() {
        var profile = 0
        var newChat = 0
        compose.setContent {
            val base = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(base.density, 2f)) {
                SocratesTheme {
                    Box(Modifier.requiredSize(256.dp, 300.dp)) {
                        Sidebar(onNew = { newChat++ }, onProfile = { profile++ })
                    }
                }
            }
        }
        compose.onNodeWithContentDescription("搜索会话").performClick()
        compose.onNodeWithTag("sidebar-list").performScrollToNode(hasContentDescription("帐号与设置"))
        compose.onNodeWithContentDescription("帐号与设置").assertIsDisplayed().performClick()
        compose.onNodeWithText("聊天").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(1, profile); assertEquals(1, newChat) }
    }

    @Test fun longHistoryStillAllowsFooterAccessInOneLazyList() {
        compose.setContent {
            SocratesTheme {
                Box(Modifier.requiredSize(256.dp, 360.dp)) {
                    Sidebar(ChatUiState(loggedIn = true, sessions = (1..50).map {
                        ChatSession(id = "layout-test-$it", title = "回归夹具 $it")
                    }))
                }
            }
        }
        compose.onNodeWithTag("sidebar-list").performScrollToNode(hasContentDescription("帐号与设置"))
        compose.onNodeWithContentDescription("帐号与设置").assertIsDisplayed().assertHasClickAction()
        compose.onNodeWithText("聊天").assertIsDisplayed().assertHasClickAction()
    }

    @Test fun drawerOverlayCoversTheHostWindowAndKeepsItsFooterOnScreen() {
        val drawer = SocratesDrawerState()
        compose.setContent {
            SocratesTheme {
                Box(Modifier.testTag("drawer-host").requiredSize(320.dp, 480.dp)) {
                    SocratesNavigationDrawer(drawer, gesturesEnabled = false, drawerContent = {
                        SocratesDrawerSheet(Modifier.fillMaxWidth(.8f)) {
                            Text("Socrates")
                            Box(Modifier.weight(1f))
                            Text("聊天", Modifier.testTag("drawer-footer"), fontSize = 17.sp)
                        }
                    }) { Text("会话", Modifier.testTag("drawer-content")) }
                }
            }
        }
        val host = compose.onNodeWithTag("drawer-host").fetchSemanticsNode().boundsInRoot
        compose.runOnIdle { drawer.open() }
        val overlay = compose.onNodeWithTag("drawer-overlay").fetchSemanticsNode().boundsInRoot
        assertEquals(host.left, overlay.left, 1f)
        assertEquals(host.top, overlay.top, 1f)
        assertEquals(host.right, overlay.right, 1f)
        assertEquals(host.bottom, overlay.bottom, 1f)
        compose.onNodeWithTag("drawer-content").assertDoesNotExist()
        val footer = compose.onNodeWithTag("drawer-footer").fetchSemanticsNode().boundsInRoot
        assertTrue("footer must stay inside the window", footer.bottom <= host.bottom + 1f)
        assertEquals(host.bottom, footer.bottom, 1f)
        compose.onNodeWithTag("drawer-scrim").performClick()
        compose.onNodeWithTag("drawer-overlay").assertDoesNotExist()
        compose.onNodeWithTag("drawer-content").assertIsDisplayed()
    }

    @Composable
    private fun Sidebar(ui: ChatUiState = ChatUiState(), onNew: () -> Unit = {}, onProfile: () -> Unit = {}) {
        NativeSidebar(ui, onNew, {}, onProfile, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {})
    }
}
