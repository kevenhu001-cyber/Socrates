package com.socrates.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.socrates.android.data.FeatureItem
import com.socrates.android.data.LibraryResourceKey
import com.socrates.android.data.LibrarySelectionState
import com.socrates.android.ui.LibraryDeleteConfirmation
import com.socrates.android.ui.LibrarySelectionToolbar
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/** Compiled regression source only; no emulator/device execution in this iteration. */
class LibrarySelectionUiTest {
    @get:Rule val compose = createComposeRule()
    private fun item(id: String, title: String, collection: String = "files") =
        FeatureItem(id, title, raw = JSONObject().put("_collection", collection))
    private val file = item("same", "文件标题")
    private val artifact = item("same", "作品标题", "artifacts")

    @Test fun selectionEntryUsesExplicitCallback() {
        var opened = 0
        compose.setContent {
            MaterialTheme {
                LibrarySelectionToolbar(listOf(file), listOf(file), LibrarySelectionState(), false, true,
                    { opened++ }, {}, {}, {}, {}, {})
            }
        }
        compose.onNodeWithText("选择资料").performClick()
        assertEquals(1, opened)
        compose.onNodeWithText("永久删除").assertDoesNotExist()
    }

    @Test fun narrowToolbarDisclosesHiddenSelectionAndVisibleSelectAllScope() {
        var selectedVisible = 0
        compose.setContent {
            MaterialTheme {
                Box(Modifier.width(320.dp)) {
                    LibrarySelectionToolbar(listOf(file, artifact), listOf(file),
                        LibrarySelectionState(selection = setOf(LibraryResourceKey("artifacts", "same"))), true, true,
                        {}, {}, { selectedVisible++ }, {}, {}, {})
                }
            }
        }
        compose.onNodeWithText("已选 1 项（含当前筛选外 1 项）").assertExists()
        compose.onNodeWithText("全选当前结果").assertIsDisplayed().performClick()
        assertEquals(1, selectedVisible)
        compose.onNodeWithText("删除所选").assertIsDisplayed()
    }

    @Test fun busyStateDisablesConflictingSelectionAndDeletionActions() {
        compose.setContent {
            MaterialTheme {
                LibrarySelectionToolbar(listOf(file), listOf(file), LibrarySelectionState(
                    selection = setOf(LibraryResourceKey("files", "same")), busy = true), true, false,
                    {}, {}, {}, {}, {}, {})
            }
        }
        compose.onNodeWithText("取消选择当前结果").assertIsNotEnabled()
        compose.onNodeWithText("清空选择").assertIsNotEnabled()
        compose.onNodeWithText("正在删除…").assertIsNotEnabled()
        compose.onNodeWithText("完成选择").assertIsNotEnabled()
    }

    @Test fun confirmationNamesExactCollectionsAndCancelDoesNotConfirm() {
        var confirmed = 0; var canceled = 0
        compose.setContent {
            MaterialTheme {
                LibraryDeleteConfirmation(listOf(LibraryResourceKey("files", "same"), LibraryResourceKey("artifacts", "same")),
                    listOf(file, artifact), false, { confirmed++ }, { canceled++ })
            }
        }
        compose.onNodeWithText("永久删除 2 项资料？").assertExists()
        compose.onNodeWithText("文件标题（文件）").assertExists()
        compose.onNodeWithText("作品标题（作品）").assertExists()
        compose.onNodeWithText("取消").performClick()
        assertEquals(0, confirmed); assertEquals(1, canceled)
    }

    @Test fun permanentDeleteRequiresExplicitConfirmationCallback() {
        var confirmed = 0
        compose.setContent {
            MaterialTheme {
                LibraryDeleteConfirmation(listOf(LibraryResourceKey("files", "same")), listOf(file), false, { confirmed++ }, {})
            }
        }
        assertEquals(0, confirmed)
        compose.onNodeWithText("永久删除").performClick()
        assertEquals(1, confirmed)
    }

    @Test fun uncertainFailuresOfferDetailsAndRefreshWithoutAutomaticResubmission() {
        var refreshed = 0; var deleted = 0
        compose.setContent {
            MaterialTheme {
                LibrarySelectionToolbar(listOf(file), listOf(file), LibrarySelectionState(
                    selection = setOf(LibraryResourceKey("files", "same")),
                    failures = mapOf(LibraryResourceKey("files", "same") to "删除请求未确认：timeout。请先刷新后重试。")), true, true,
                    {}, {}, {}, {}, { deleted++ }, { refreshed++ })
            }
        }
        compose.onNodeWithText("刷新资料库").performClick()
        assertEquals(1, refreshed); assertEquals(0, deleted)
        compose.onNodeWithText("查看未确认项目").performClick()
        compose.onNodeWithText("未确认删除的项目").assertExists()
        compose.onNodeWithText("文件标题（文件）").assertExists()
        compose.onNodeWithText("删除请求未确认：timeout。请先刷新后重试。").assertExists()
    }
}
