package com.socrates.android.ui

import com.socrates.android.data.ChatMessage
import com.socrates.android.data.ChatSession
import com.socrates.android.data.SessionActions
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class CustomUiContractTest {
    @Test fun allVisibleControlsUseTheOwnedDesignSystem() {
        val directory = listOf(File("src/main/java/com/socrates/android/ui"), File("app/src/main/java/com/socrates/android/ui"), File("apps/socrates-android/app/src/main/java/com/socrates/android/ui")).firstOrNull { it.isDirectory }
        assertNotNull("UI source directory must be available for the control contract", directory)
        val stock = Regex("\\b(Button|TextButton|IconButton|OutlinedTextField|TextField|FilterChip|Card|AlertDialog|DropdownMenu|DropdownMenuItem|ModalBottomSheet|ListItem|TabRow|Tab|Switch|RadioButton|CircularProgressIndicator|ModalNavigationDrawer|ModalDrawerSheet)\\s*\\(")
        val violations = directory!!.walkTopDown().filter { it.extension == "kt" }.flatMap { source -> source.readLines().mapIndexedNotNull { i, line -> if (stock.containsMatchIn(line)) "${source.name}:${i + 1}" else null }.asSequence() }.toList()
        assertTrue("Stock control calls found: $violations", violations.isEmpty())
        val primitives = File(directory, "SocratesControls.kt").readText()
        assertTrue(primitives.contains("BasicTextField("))
        assertTrue(primitives.contains("Dialog("))
        assertTrue(primitives.contains("Canvas("))
    }

    @Test fun conversationFilesKeepOnlyRealMessageAttachmentsAndDeduplicateDurableIds() {
        val row = JSONObject().put("fileId", "fixture-file").put("name", "fixture.txt").put("mime", "text/plain")
        val messages = listOf(ChatMessage(role = "user", content = "", wire = JSONObject().put("attachments", JSONArray().put(row))),
            ChatMessage(role = "assistant", content = "", wire = JSONObject().put("attachments", JSONArray().put(JSONObject(row.toString())))))
        assertEquals(listOf(ConversationFile("fixture-file", "fixture.txt", "text/plain")), conversationFiles(messages))
        assertTrue(conversationFiles(emptyList()).isEmpty())
        assertTrue(conversationFiles(listOf(ChatMessage(role = "user", content = "plain text"))).isEmpty())
    }

    @Test fun legacyAttachmentsDoNotInventAReusableFileId() {
        val message = ChatMessage(role = "user", content = "", attachmentName = "legacy.txt")
        val file = conversationFiles(listOf(message)).single()
        assertNull(file.id)
        assertEquals("legacy.txt", file.name)
    }

    @Test fun archivedAndPinnedReadersHandleMissingAndExplicitNullWithoutMutatingInput() {
        val wire = JSONObject().put("archivedAt", JSONObject.NULL).put("pinned", true)
        val session = ChatSession(title = "fixture", wire = wire)
        assertTrue(SessionActions.isPinned(session))
        assertFalse(SessionActions.isArchived(session))
        assertFalse(SessionActions.isArchived(session.copy(wire = JSONObject().put("archivedAt", "null"))))
        assertFalse(SessionActions.isArchived(session.copy(wire = null)))
        assertTrue(SessionActions.isArchived(session.copy(wire = JSONObject().put("archivedAt", "2026-01-01T00:00:00Z"))))
        assertEquals(JSONObject.NULL, wire.get("archivedAt"))
    }
}
