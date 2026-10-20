package com.socrates.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.socrates.android.data.ChatMessage
import com.socrates.android.ui.AttachmentDraft
import com.socrates.android.ui.AttachmentStrip
import com.socrates.android.ui.MessageAttachmentList
import com.socrates.android.ui.PendingAttachment
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Compiled regression source, not a device/width acceptance claim. */
class AttachmentDraftUiTest {
    @get:Rule val compose = createComposeRule()

    private val noEdit: (String, String, String) -> String? = { _, _, _ -> null }
    private fun editorInput() = compose.onNode(
        hasSetTextAction() and hasAnyAncestor(hasTestTag("attachment-text-input")), useUnmergedTree = true)

    @Test fun emptyDraftDoesNotExposeAnAttachmentAction() {
        compose.setContent { MaterialTheme { AttachmentStrip(emptyList(), true, {}, { _, _ -> }, noEdit) } }
        compose.onNodeWithText("待发送附件", substring = true).assertDoesNotExist()
    }

    @Test fun openingStripDoesNotRemoveAnythingAndExplainsReferenceBoundary() {
        var removed = 0
        compose.setContent { MaterialTheme { AttachmentStrip(listOf(PendingAttachment("a.txt")), true, { removed++ }, { _, _ -> }, noEdit) } }
        assertEquals(0, removed)
        compose.onNodeWithText("待发送附件 1/6").assertExists()
        compose.onNodeWithText("不删除、不修改资料库原件", substring = true).assertExists()
    }

    @Test fun explicitRemoveUsesStableIdentityAndLeavesSameNameSibling() {
        val first = PendingAttachment("same.txt", key = "first")
        val second = PendingAttachment("same.txt", key = "second")
        var removed: String? = null
        compose.setContent {
            var items by remember { mutableStateOf(listOf(first, second)) }
            MaterialTheme { AttachmentStrip(items, true, { key -> removed = key; items = AttachmentDraft.remove(items, key) }, { _, _ -> }, noEdit) }
        }
        compose.onAllNodesWithContentDescription("移除附件：same.txt")[0].performClick()
        assertEquals("first", removed)
        compose.onNodeWithText("待发送附件 1/6").assertExists()
        compose.onAllNodesWithText("same.txt").assertCountEquals(1)
    }

    @Test fun busyStateDisablesRemoval() {
        var removed = false
        compose.setContent { MaterialTheme { AttachmentStrip(listOf(PendingAttachment("a.txt")), false, { removed = true }, { _, _ -> }, noEdit) } }
        compose.onNodeWithContentDescription("移除附件：a.txt").assertIsNotEnabled()
        assertFalse(removed)
    }

    @Test fun narrowStripKeepsAllItemsReachableByHorizontalScroll() {
        compose.setContent {
            MaterialTheme { Box(Modifier.width(320.dp)) {
                AttachmentStrip((1..6).map { PendingAttachment("资料$it.txt", key = "$it") }, true, {}, { _, _ -> }, noEdit)
            } }
        }
        compose.onNodeWithText("待发送附件 6/6").assertExists()
        compose.onNode(hasScrollToIndexAction()).performScrollToIndex(5)
        compose.onNodeWithContentDescription("移除附件：资料6.txt").assertIsDisplayed()
    }

    @Test fun receivedMessageListsEveryDocumentNotJustTheFirst() {
        val rows = JSONArray().put(JSONObject().put("name", "first.pdf")).put(JSONObject().put("name", "second.txt"))
        compose.setContent { MaterialTheme { MessageAttachmentList(ChatMessage(role = "user", content = "body", wire = JSONObject().put("attachments", rows))) } }
        compose.onNodeWithText("附件 · first.pdf").assertExists()
        compose.onNodeWithText("附件 · second.txt").assertExists()
    }

    @Test fun moveControlsReorderByStableKeyEvenWhenNamesMatch() {
        val first = PendingAttachment("same.txt", key = "first")
        val second = PendingAttachment("same.txt", key = "second")
        var moved: Pair<String, Int>? = null
        var orderedKeys = listOf("first", "second")
        compose.setContent {
            var items by remember { mutableStateOf(listOf(first, second)) }
            MaterialTheme {
                AttachmentStrip(items, true, {}, { key, step ->
                    moved = key to step
                    items = AttachmentDraft.move(items, key, step)
                    orderedKeys = items.map { it.key }
                }, noEdit)
            }
        }
        compose.onAllNodesWithContentDescription("后移附件：same.txt")[0].performClick()
        assertEquals("first" to 1, moved)
        assertEquals(listOf("second", "first"), orderedKeys)
        compose.onNode(hasScrollToIndexAction()).performScrollToIndex(1)
        compose.onNodeWithText("2/2").assertExists()
    }

    @Test fun reorderButtonsAreDisabledAtBothEnds() {
        compose.setContent {
            MaterialTheme { AttachmentStrip(listOf(PendingAttachment("first.txt"), PendingAttachment("last.txt")), true, {}, { _, _ -> }, noEdit) }
        }
        compose.onNodeWithContentDescription("前移附件：first.txt").assertIsNotEnabled()
        compose.onNodeWithContentDescription("后移附件：first.txt").assertIsEnabled()
        compose.onNode(hasScrollToIndexAction()).performScrollToIndex(1)
        compose.onNodeWithContentDescription("后移附件：last.txt").assertIsNotEnabled()
        compose.onNodeWithContentDescription("前移附件：last.txt").assertIsEnabled()
    }

    @Test fun busyStateDisablesAllNewAttachmentOperations() {
        compose.setContent {
            MaterialTheme { AttachmentStrip(listOf(PendingAttachment("doc.txt")), false, {}, { _, _ -> }, noEdit) }
        }
        compose.onNodeWithContentDescription("前移附件：doc.txt").assertIsNotEnabled()
        compose.onNodeWithContentDescription("后移附件：doc.txt").assertIsNotEnabled()
        compose.onNodeWithContentDescription("编辑附件文字：doc.txt").assertIsNotEnabled()
    }

    @Test fun imagesHaveNoTextEditingEntry() {
        compose.setContent {
            MaterialTheme { AttachmentStrip(listOf(PendingAttachment("photo.png", imageDataUrl = "data:image/png;base64,AA==")), true, {}, { _, _ -> }, noEdit) }
        }
        compose.onNodeWithContentDescription("编辑附件文字：photo.png").assertDoesNotExist()
    }

    @Test fun editRequiresExplicitApplyAndPassesAttachmentIdentityAndOriginalText() {
        val attachment = PendingAttachment("doc.txt", text = "old", key = "doc-key")
        var applied: Triple<String, String, String>? = null
        compose.setContent {
            MaterialTheme {
                AttachmentStrip(listOf(attachment), true, {}, { _, _ -> }, { key, original, text ->
                    applied = Triple(key, original, text)
                    null
                })
            }
        }
        compose.onNodeWithContentDescription("编辑附件文字：doc.txt").performClick()
        editorInput().performTextClearance()
        editorInput().performTextInput("new")
        assertNull(applied)
        compose.onNodeWithTag("attachment-text-apply").performClick()
        assertEquals(Triple("doc-key", "old", "new"), applied)
    }

    @Test fun cancellingDirtyEditOffersContinueOrDiscard() {
        var applied = false
        compose.setContent {
            MaterialTheme { AttachmentStrip(listOf(PendingAttachment("doc.txt", text = "old")), true, {}, { _, _ -> }, { _, _, _ -> applied = true; null }) }
        }
        compose.onNodeWithContentDescription("编辑附件文字：doc.txt").performClick()
        editorInput().performTextClearance()
        editorInput().performTextInput("unsaved")
        compose.onNodeWithText("取消").performClick()
        compose.onNodeWithText("继续编辑").assertExists()
        compose.onNodeWithText("放弃修改").performClick()
        editorInput().assertDoesNotExist()
        assertFalse(applied)
    }

    @Test fun rejectedApplyShowsExactErrorAndKeepsEditorOpen() {
        val error = "附件文字总量过长，未应用本次修改。请缩短文字。"
        compose.setContent {
            MaterialTheme { AttachmentStrip(listOf(PendingAttachment("doc.txt", text = "old")), true, {}, { _, _ -> }, { _, _, _ -> error }) }
        }
        compose.onNodeWithContentDescription("编辑附件文字：doc.txt").performClick()
        editorInput().performTextClearance()
        editorInput().performTextInput("changed")
        compose.onNodeWithTag("attachment-text-apply").performClick()
        compose.onNodeWithText(error).assertExists()
        editorInput().assertExists()
    }

    @Test fun editorRejectsOverLimitInputWithoutChangingEmptyDraft() {
        compose.setContent {
            MaterialTheme { AttachmentStrip(listOf(PendingAttachment("doc.txt", text = "")), true, {}, { _, _ -> }, { _, _, _ -> null }) }
        }
        compose.onNodeWithContentDescription("编辑附件文字：doc.txt").performClick()
        editorInput().performTextClearance()
        editorInput().performTextInput("x".repeat(100_001))
        compose.onNodeWithText("每份附件文字最多 100,000 字符，超长输入未加入。", substring = true).assertExists()
        editorInput().assertTextEquals("")
        compose.onNodeWithTag("attachment-text-apply").assertIsNotEnabled()

    }
    @Test fun clearingExistingTextCanBeExplicitlyApplied() {
        var applied: String? = null
        compose.setContent {
            MaterialTheme { AttachmentStrip(listOf(PendingAttachment("doc.txt", text = "old")), true,
                {}, { _, _ -> }, { _, _, text -> applied = text; null }) }
        }
        compose.onNodeWithContentDescription("编辑附件文字：doc.txt").performClick()
        editorInput().performTextClearance()
        compose.onNodeWithTag("attachment-text-apply").assertIsEnabled().performClick()
        assertEquals("", applied)
    }
}
