package com.socrates.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test

/** Offline smoke tests: no production account, server writes, or fabricated responses. */
class NativeUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun homeShowsReferenceControls() {
        compose.onNodeWithText("聊天").assertIsDisplayed()
        compose.onNodeWithText("工作").assertIsDisplayed()
        compose.onNodeWithContentDescription("消息输入框").assertExists()
        compose.onNodeWithContentDescription("打开侧边栏").assertExists()
        compose.onNodeWithText("询问 Socrates").assertIsDisplayed()
        capture("home")
    }

    @Test fun drawerShowsNativeNavigation() {
        compose.onNodeWithContentDescription("打开侧边栏").performClick()
        compose.onNodeWithText("Socrates").assertIsDisplayed()
        compose.onNodeWithText("资料库").assertIsDisplayed()
        compose.onNodeWithText("项目").assertIsDisplayed()
        compose.onNodeWithText("定时任务").assertIsDisplayed()
        capture("drawer")
        compose.onNodeWithContentDescription("搜索会话").performClick()
        compose.onNodeWithText("搜索历史会话").assertIsDisplayed()
    }

    @Test fun workTabShowsActionableCards() {
        compose.onNodeWithText("工作").performClick()
        compose.onNodeWithText("把想法，变成进展。").assertIsDisplayed()
        compose.onNodeWithText("继续对话").performClick()
        compose.onNodeWithText("询问 Socrates").assertIsDisplayed()
    }

    @Test fun sendingWithoutAccountOpensAuthAndPreservesDraft() {
        compose.onNodeWithContentDescription("消息输入框").performTextInput("测试消息")
        compose.onNodeWithContentDescription("发送消息").performClick()
        compose.onNodeWithText("在 Chrome 中登录").assertIsDisplayed()
        compose.onNodeWithText("通过 Chrome 继续").assertExists()
        compose.onNodeWithText("邮箱").assertDoesNotExist()
        compose.onNodeWithText("密码").assertDoesNotExist()
    }
    @Test fun tappingEditorKeepsFocusAcrossExpansionAndAcceptsMoreText() {
        val input = compose.onNodeWithContentDescription("消息输入框")
        input.performClick()
        compose.waitForIdle()
        input.assertIsFocused()
        input.performTextInput("第一段")
        compose.waitForIdle()
        input.assertIsFocused()
        input.performTextInput("，继续输入\n第二行")
        input.assertTextContains("第一段，继续输入\n第二行")
        compose.onNodeWithContentDescription("发送消息").assertIsDisplayed()
        capture("composer-editing")
    }
    @Test fun attachmentPopupHasRealCameraPhotoAndDocumentActions() {
        compose.onNodeWithContentDescription("添加附件").performClick()
        listOf("拍照", "照片", "文件", "插件", "推理强度").forEach {
            compose.onNodeWithText(it).assertIsDisplayed()
        }
        compose.onNodeWithText("文件").performClick()
        compose.onNodeWithText("从设备选择").assertIsDisplayed()
        compose.onNodeWithText("从资料库选择").assertIsDisplayed()
    }
    @Test fun browserLoginExplainsThatReturningDoesNotAuthenticateNativeApi() {
        compose.onNodeWithContentDescription("消息输入框").performTextInput("保留草稿")
        compose.onNodeWithContentDescription("发送消息").performClick()
        compose.onNodeWithText("app.topodrive.top").assertIsDisplayed()
        compose.onNodeWithText("返回此应用不会自动登录", substring = true).assertExists()
        compose.onNodeWithText("密码登录").assertDoesNotExist()
        compose.onNodeWithText("验证码登录").assertDoesNotExist()
        compose.onNodeWithContentDescription("关闭登录").performClick()
        compose.onNodeWithContentDescription("消息输入框").assertTextContains("保留草稿")
    }
    @Test fun closingLoginRetainsTheUnsentDraft() {
        compose.onNodeWithContentDescription("消息输入框").performTextInput("未发送的内容")
        compose.onNodeWithContentDescription("发送消息").performClick()
        compose.onNodeWithContentDescription("关闭登录").performClick()
        compose.onNodeWithContentDescription("消息输入框").assertTextContains("未发送的内容")
    }

    @Test fun reasoningPickerUsesRealSupportedValuesAndKeepsDraft() {
        compose.onNodeWithContentDescription("消息输入框").performTextInput("未发送的草稿")
        compose.onNodeWithContentDescription("推理强度").performClick()
        listOf("不启用", "轻量", "标准", "深入").forEach { compose.onNodeWithText(it).assertIsDisplayed() }
        compose.onNodeWithText("深入").performClick()
        compose.onNodeWithContentDescription("消息输入框").assertTextContains("未发送的草稿")
        compose.onNodeWithContentDescription("推理强度").performClick()
        compose.onNodeWithContentDescription("已选择").assertExists()
    }

    @Test fun drawerClosesWithoutMaterialDrawerAnchors() {
        compose.onNodeWithContentDescription("打开侧边栏").performClick()
        compose.onNodeWithText("资料库").assertIsDisplayed()
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        compose.onNodeWithContentDescription("打开侧边栏").assertIsDisplayed()
        compose.onNodeWithContentDescription("消息输入框").assertExists()
    }

    private fun capture(name: String) {
        compose.waitForIdle()
        val bitmap = requireNotNull(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot())
        val directory = java.io.File(compose.activity.filesDir, "ui-evidence").apply { mkdirs() }
        java.io.File(directory, "$name.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
}
