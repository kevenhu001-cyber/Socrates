package com.socrates.android.ui

import java.io.File
import org.junit.Assert.*
import org.junit.Test

/** Source wiring contracts only; these are not rendered/pixel or device assertions. */
class FeatureScreensContractTest {
    private val directory = listOf(
        File("src/main/java/com/socrates/android/ui"),
        File("app/src/main/java/com/socrates/android/ui"),
        File("apps/socrates-android/app/src/main/java/com/socrates/android/ui"),
    ).first { it.isDirectory }
    private fun source(name: String) = File(directory, name).readText()

    @Test fun fullScreenDirectoriesAndReadersClearCutoutsAndTheBottomGestureZone() {
        listOf("FeatureScreens.kt", "ArtifactReaderSheet.kt", "AgentRunReaderSheet.kt",
            "ArtifactComparisonSheet.kt", "TaskExecutionSheet.kt").forEach { name ->
            val text = source(name)
            assertTrue("$name must consume AppSafeInsets", text.contains("windowInsetsPadding(AppSafeInsets)"))
            assertFalse("$name must not add a second status bar pad", text.contains("statusBarsPadding()"))
            assertFalse("$name must not add a second navigation bar pad", text.contains("navigationBarsPadding()"))
        }
    }

    @Test fun sheetsInsideTheInsetHostDoNotAddAnotherNavigationBarPad() {
        // SocratesSheet already pads with AppSafeInsets; a nested navigationBarsPadding leaves a blank strip.
        listOf("SessionShareSheet.kt", "ProjectResourcesSheet.kt").forEach { name ->
            assertFalse(name, source(name).contains("navigationBarsPadding"))
        }
    }

    @Test fun documentTilesGrowWithFontScaleWhileImageTilesStayBounded() {
        val text = source("FeatureScreens.kt")
        assertTrue(text.contains("if (imageFile) Modifier.height(tileHeight) else Modifier.heightIn(min = tileHeight)"))
    }

    @Test fun pluginDirectoryNeverRendersTheInstalledCarouselTwice() {
        val text = source("FeatureScreens.kt")
        assertTrue(text.contains("if (installed.isNotEmpty() && !connectedOnly)"))
        assertTrue(text.contains("查看已连接 ›"))
    }

    @Test fun artifactsCannotOfferTheirIdAsAConversationFile() {
        assertTrue(source("FeatureScreens.kt").contains("item.raw.optString(\"_collection\") != \"artifacts\""))
    }

    @Test fun fullScreenLearningDialogAlsoClearsCutoutsAndTheGestureZone() {
        val app = source("SocratesApp.kt")
        val learning = app.substringAfter("if (resource == \"教学与测验\")").substringBefore("resource?.takeUnless")
        assertTrue(learning.contains("decorFitsSystemWindows = false"))
        assertTrue(learning.contains("windowInsetsPadding(AppSafeInsets)"))
        assertTrue(learning.contains("Modifier.fillMaxSize().background(SocratesDesign.Page)"))
    }

    @Test fun findAndProfileSheetsScrollOnShortWindows() {
        val app = source("SocratesApp.kt")
        assertTrue(app.contains("Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(20.dp))"))
        assertTrue(app.contains("Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp)"))
    }

    @Test fun providerManagerClearsSystemBarsAndOwnsBackInsideItsDialog() {
        val text = source("ProviderSheet.kt")
        assertTrue(text.contains("fun ProviderSheet(accountKey: String, onDismiss: () -> Unit)"))
        assertTrue(text.contains("key = \"providers-\$accountKey-\$server\""))
        assertTrue(text.contains("decorFitsSystemWindows = false"))
        assertTrue(text.contains("windowInsetsPadding(AppSafeInsets)"))
        assertTrue(text.contains("heightIn(min = 60.dp)"))
        val dialogBody = text.substringAfter("Dialog(onDismissRequest = onDismiss").substringBefore("deleting?.let")
        assertTrue("BackHandler must live in the dialog window to receive back", dialogBody.contains("BackHandler"))
    }

    @Test fun providerManagerViewStateIsScopedToTheSignedInAccount() {
        val app = source("SocratesApp.kt")
        assertTrue(app.contains("ProviderSheet(accountKey = ui.accountName"))
    }

    @Test fun longChipRowsScrollInsteadOfClipping() {
        assertTrue(source("LearningScreens.kt").contains("Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())"))
        assertTrue(source("GlobalSearchSheet.kt").contains("Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())"))
    }

    @Test fun shareSheetScrollsAndProjectEmptyStateMatchesTheVisibleFilter() {
        assertTrue(source("SessionShareSheet.kt").contains("verticalScroll(rememberScrollState())"))
        val project = source("ProjectResourcesSheet.kt")
        assertTrue(project.contains("val visibleSessions = sessions.filter"))
        assertTrue(project.contains("if (visibleSessions.isEmpty())"))
        assertTrue(project.contains("items(visibleSessions, key = { it.id })"))
    }

    @Test fun attachmentsAreLabeledOnceAndMissingRunDetailsAreExplained() {
        assertFalse("MessageDetails must not repeat MessageAttachmentList labels", source("MessageDetails.kt").contains("\"附件 · \""))
        assertTrue(source("TaskExecutionSheet.kt").contains("尚未获取到最近一次运行记录详情"))
        assertTrue(source("ChatActions.kt").contains("heightIn(min = 58.dp)"))
        assertTrue(source("AttachmentTextEditor.kt").contains("SocratesAlert("))
    }
}
