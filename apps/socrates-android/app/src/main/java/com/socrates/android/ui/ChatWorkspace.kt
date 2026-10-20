package com.socrates.android.ui

import com.socrates.android.data.ChatSession
import org.json.JSONObject
import java.util.UUID

/** UI-only seed. Never serialize a conversation starter as a message or session field. */
data class ComposerDraft(val initialText: String = "", val key: String = UUID.randomUUID().toString())

object ChatWorkspace {
    /** A fresh scope also resets consecutive unbound chats (both have a null session id). */
    fun open(ui: ChatUiState, session: ChatSession? = null, starter: String = ""): ChatUiState = ui.copy(
        current = session,
        messages = session?.messages.orEmpty(),
        attachments = emptyList(),
        activity = "",
        busy = false,
        composerDraft = ComposerDraft(starter),
        searchJump = null,
        searchOpening = false,
    )

    fun openSearch(ui: ChatUiState, full: ChatSession, messageId: String?, learning: Boolean): ChatUiState {
        if (learning) return ui.copy(busy = false, searchOpening = false)
        val opened = if (ui.current?.id == full.id) ui.copy(current = full, messages = full.messages,
            busy = false, searchOpening = false) else open(ui, full)
        return opened.copy(searchJump = messageId?.let { SearchJump(it) })
    }

    fun bound(ui: ChatUiState, id: String, title: String, assistant: Boolean, source: String?): ChatUiState {
        val wire = JSONObject().put(if (assistant) "assistantId" else "projectId", id)
        val starter = if (assistant) AssistantConfig.fromSource(source).starter else ""
        return open(ui, ChatSession(title = title, wire = wire), starter)
    }
}
