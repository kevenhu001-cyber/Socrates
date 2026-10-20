package com.socrates.android.ui

import com.socrates.android.data.ChatMessage
import com.socrates.android.data.ChatSession
import org.junit.Assert.*
import org.junit.Test

class ChatWorkspaceTest {
    private val source = """{"description":"A helper","instructions":"Private rules","starter":"Explain this\nstep by step"}"""

    @Test fun assistantStarterIsOnlyAnEditableDraftAndNeverAnAutomaticMessage() {
        val result = ChatWorkspace.bound(ChatUiState(loggedIn = true), "assistant-id", "My helper", true, source)
        assertEquals("Explain this\nstep by step", result.composerDraft.initialText)
        assertEquals("assistant-id", result.current!!.wire!!.getString("assistantId"))
        assertEquals("My helper", result.current.title)
        assertTrue(result.messages.isEmpty())
        assertTrue(result.current.messages.isEmpty())
        assertFalse(result.streaming)
        assertFalse(result.busy)
        assertEquals(setOf("assistantId"), result.current.wire!!.keys().asSequence().toSet())
    }

    @Test fun repeatedAssistantLaunchesHaveFreshSessionAndDraftIdentities() {
        val first = ChatWorkspace.bound(ChatUiState(), "same-id", "Same", true, source)
        val second = ChatWorkspace.bound(first, "same-id", "Same", true, source)
        assertNotEquals(first.current!!.id, second.current!!.id)
        assertNotEquals(first.composerDraft.key, second.composerDraft.key)
        assertEquals(first.composerDraft.initialText, second.composerDraft.initialText)
    }

    @Test fun consecutiveUnboundNewChatsResetEvenThoughBothSessionIdsAreNull() {
        val first = ChatWorkspace.open(ChatUiState())
        val second = ChatWorkspace.open(first)
        assertNull(first.current)
        assertNull(second.current)
        assertNotEquals(first.composerDraft.key, second.composerDraft.key)
        assertEquals("", second.composerDraft.initialText)
    }

    @Test fun switchingFromAssistantToProjectCannotLeakStarterOrAssistantBinding() {
        val assistant = ChatWorkspace.bound(ChatUiState(), "assistant-id", "Helper", true, source)
        val project = ChatWorkspace.bound(assistant, "project-id", "Project", false, source)
        assertEquals("", project.composerDraft.initialText)
        assertEquals("project-id", project.current!!.wire!!.getString("projectId"))
        assertFalse(project.current.wire!!.has("assistantId"))
        assertNotEquals(assistant.composerDraft.key, project.composerDraft.key)
    }

    @Test fun openingHistoryResetsDraftButKeepsActualMessagesAndWireUnchanged() {
        val assistant = ChatWorkspace.bound(ChatUiState(), "assistant-id", "Helper", true, source)
        val session = ChatSession(messages = listOf(ChatMessage(role = "user", content = "Actual history")))
        val opened = ChatWorkspace.open(assistant, session)
        assertEquals("", opened.composerDraft.initialText)
        assertEquals(session.messages, opened.messages)
        assertSame(session, opened.current)
        assertNotEquals(assistant.composerDraft.key, opened.composerDraft.key)
    }

    @Test fun openingWorkspaceDropsOldAttachmentAndActivityButPreservesAccountAndPreferences() {
        val before = ChatUiState(loggedIn = true, accountName = "Owner", reasoningEffort = "high",
            attachments = listOf(PendingAttachment("old.txt")), activity = "Old progress", busy = true)
        val opened = ChatWorkspace.bound(before, "assistant-id", "Helper", true, source)
        assertTrue(opened.attachments.isEmpty())
        assertEquals("", opened.activity)
        assertFalse(opened.busy)
        assertTrue(opened.loggedIn)
        assertEquals("Owner", opened.accountName)
        assertEquals("high", opened.reasoningEffort)
        assertFalse(before.attachments.isEmpty())
    }

    @Test fun malformedMissingAndNonTextStartersNeverCreateInventedDrafts() {
        listOf(null, "not JSON", "{}", """{"starter":null}""", """{"starter":true}""",
            """{"starter":{"text":"not a string"}}""").forEach { malformed ->
            val result = ChatWorkspace.bound(ChatUiState(), "assistant-id", "Helper", true, malformed)
            assertEquals("", result.composerDraft.initialText)
            assertTrue(result.messages.isEmpty())
        }
    }

    @Test fun unrelatedStateUpdatesDoNotReseedOrChangeDraftScope() {
        val original = ChatWorkspace.bound(ChatUiState(), "assistant-id", "Helper", true, source)
        val updated = original.copy(busy = true, activity = "Loading", reasoningEffort = "low")
        assertSame(original.composerDraft, updated.composerDraft)
    }

    @Test fun workspaceSwitchClearsSearchJumpWithoutChangingSource() {
        val before = ChatUiState(searchJump = SearchJump("message-id"))
        assertNull(ChatWorkspace.open(before).searchJump)
        assertNull(ChatWorkspace.open(before, ChatSession(id = "another")).searchJump)
        assertEquals("message-id", before.searchJump!!.messageId)
    }

    @Test fun searchingWithinCurrentChatPreservesDraftAndAttachment() {
        val before = ChatUiState(current = ChatSession(id = "same"), composerDraft = ComposerDraft("unsent"),
            attachments = listOf(PendingAttachment("draft.txt")), busy = true, searchOpening = true)
        val full = ChatSession(id = "same", messages = listOf(ChatMessage(id = "message", role = "user", content = "body")))
        val opened = ChatWorkspace.openSearch(before, full, "message", false)
        assertSame(before.composerDraft, opened.composerDraft)
        assertSame(before.attachments, opened.attachments)
        assertEquals(full.messages, opened.messages)
        assertEquals("message", opened.searchJump!!.messageId)
        assertFalse(opened.busy); assertFalse(opened.searchOpening)
    }

    @Test fun openingLearningResultPreservesUnderlyingChatAndDraft() {
        val before = ChatUiState(current = ChatSession(id = "old"), composerDraft = ComposerDraft("unsent"),
            attachments = listOf(PendingAttachment("draft.txt")), busy = true, searchOpening = true)
        val opened = ChatWorkspace.openSearch(before, ChatSession(id = "exam", kind = "exam"), null, true)
        assertSame(before.current, opened.current)
        assertSame(before.composerDraft, opened.composerDraft)
        assertSame(before.attachments, opened.attachments)
        assertFalse(opened.busy); assertFalse(opened.searchOpening)
    }

    @Test fun confirmedCrossSessionSearchUsesFreshDraftScopeAndUniqueJumpRequests() {
        val before = ChatUiState(current = ChatSession(id = "old"), composerDraft = ComposerDraft("unsent"), attachments = listOf(PendingAttachment("draft.txt")))
        val first = ChatWorkspace.openSearch(before, ChatSession(id = "new"), "message", false)
        val repeated = ChatWorkspace.openSearch(first, ChatSession(id = "new"), "message", false)
        assertEquals("", first.composerDraft.initialText)
        assertNotEquals(before.composerDraft.key, first.composerDraft.key)
        assertTrue(first.attachments.isEmpty())
        assertNotEquals(first.searchJump!!.key, repeated.searchJump!!.key)
        assertSame(first.composerDraft, repeated.composerDraft)
    }
}
