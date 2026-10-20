package com.socrates.android.ui

/** Selection and staging helpers for all-or-nothing attachment loading. */
object AttachmentBatch {
    /** Deduplicate by equality, retaining first-seen order, and reject rather than clip over-capacity batches. */
    fun <T> selection(items: List<T>, existingCount: Int): List<T> {
        if (items.isEmpty()) return emptyList()
        require(existingCount in 0..AttachmentDraft.MAX_COUNT) { "现有附件数量无效。" }
        val unique = items.distinct()
        val remaining = AttachmentDraft.MAX_COUNT - existingCount
        require(unique.size <= remaining) {
            "剩余容量为 $remaining 个附件，所选 ${unique.size} 个附件超过上限。本次未添加任何附件，请重新选择不超过 $remaining 个。"
        }
        return unique
    }

    /** Stage each item privately; callers receive a new complete list only when every read succeeds. */
    suspend fun <T> load(
        items: List<T>,
        existing: List<PendingAttachment>,
        checkActive: () -> Unit,
        read: suspend (T, List<PendingAttachment>) -> PendingAttachment,
    ): List<PendingAttachment> {
        var staged = existing
        items.forEach { item ->
            checkActive()
            val next = read(item, staged)
            staged = AttachmentDraft.append(staged, next)
            checkActive()
        }
        return staged
    }
}

/** One-shot identity gate for asynchronous picker completions; entirely in-memory. */
class AttachmentPickerGate {
    private var pending: AttachmentLoadScope? = null

    fun begin(account: Long, draftKey: String): String {
        val scope = AttachmentLoadScope(account, draftKey)
        pending = scope
        return scope.request
    }

    fun cancel(ticket: String?) {
        if (ticket != null && pending?.request == ticket) pending = null
    }

    fun consume(ticket: String, account: Long, draftKey: String): AttachmentLoadScope? {
        val scope = pending ?: return null
        if (scope.request != ticket) return null
        pending = null
        return scope.takeIf { it.account == account && it.draftKey == draftKey }
    }

    fun clear() {
        pending = null
    }
}
