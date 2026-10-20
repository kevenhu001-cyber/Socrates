package com.socrates.android.ui

import com.socrates.android.data.ChatWire
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AttachmentEditingTest {
    private fun document(key: String, text: String = "body") = PendingAttachment("same.txt", key = key, text = text,
        wire = JSONObject().put("id", "wire-$key").put("fileId", "file-$key").put("kind", "document")
            .put("name", "same.txt").put("text", text).put("future", JSONObject().put("v", 1)))

    @Test fun movingForwardPreservesIdentityAndOtherItems() {
        val source = listOf(document("a"), document("b"), document("c"))
        val moved = AttachmentDraft.move(source, "b", -1)
        assertEquals(listOf("b", "a", "c"), moved.map { it.key })
        assertSame(source[1], moved[0])
        assertEquals(listOf("a", "b", "c"), source.map { it.key })
    }

    @Test fun movingBackwardPreservesSameNameSiblings() {
        val source = listOf(document("a"), document("b"), document("c"))
        assertEquals(listOf("a", "c", "b"), AttachmentDraft.move(source, "b", 1).map { it.key })
    }

    @Test fun boundaryAndMissingIdentityReturnOriginalList() {
        val source = listOf(document("a"), document("b"))
        assertSame(source, AttachmentDraft.move(source, "a", -1))
        assertSame(source, AttachmentDraft.move(source, "b", 1))
        assertSame(source, AttachmentDraft.move(source, "missing", 1))
        assertTrue(AttachmentDraft.move(emptyList(), "missing", -1).isEmpty())
    }

    @Test fun invalidMovementIsRejectedWithoutOverflow() {
        listOf(0, 2, Int.MAX_VALUE, Int.MIN_VALUE).forEach { step ->
            assertThrows(IllegalArgumentException::class.java) { AttachmentDraft.move(listOf(document("a")), "a", step) }
        }
    }

    @Test fun editedTextIsSynchronizedWithWireWithoutChangingOriginal() {
        val original = document("a", "old")
        val edited = AttachmentDraft.editText(listOf(original), "a", "new").single()
        assertEquals("new", edited.text)
        assertEquals("new", edited.wire!!.getString("text"))
        assertEquals("a", edited.key)
        assertEquals("file-a", edited.wire.getString("fileId"))
        assertEquals("wire-a", edited.wire.getString("id"))
        assertEquals("same.txt", edited.name)
        assertEquals("old", original.text)
        assertEquals("old", original.wire!!.getString("text"))
        edited.wire.getJSONObject("future").put("v", 2)
        assertEquals(1, original.wire.getJSONObject("future").getInt("v"))
    }

    @Test fun editingSameNameUsesStableKeyOnly() {
        val source = listOf(document("a", "first"), document("b", "second"))
        val edited = AttachmentDraft.editText(source, "b", "changed")
        assertSame(source[0], edited[0])
        assertEquals(listOf("first", "changed"), edited.map { it.text })
    }

    @Test fun missingIdentityDoesNotCreateAnAttachment() {
        val source = listOf(document("a"))
        assertThrows(IllegalArgumentException::class.java) { AttachmentDraft.editText(source, "missing", "new") }
        assertEquals("body", source.single().text)
    }

    @Test fun imageDataOrImageMetadataCannotBeTextEdited() {
        val inline = PendingAttachment("image.png", key = "i", imageDataUrl = "data:image/png,abc")
        val durable = PendingAttachment("image.png", key = "d", wire = JSONObject().put("kind", "image"))
        listOf(inline, durable).forEach {
            assertFalse(AttachmentDraft.canEdit(it))
            assertThrows(IllegalArgumentException::class.java) { AttachmentDraft.editText(listOf(it), it.key, "new") }
        }
    }

    @Test fun emptyDocumentCanBeEditedAgain() {
        val cleared = AttachmentDraft.editText(listOf(document("a")), "a", "").single()
        assertTrue(AttachmentDraft.canEdit(cleared))
        assertEquals("restored", AttachmentDraft.editText(listOf(cleared), "a", "restored").single().text)
    }

    @Test fun perItemLimitAcceptsExactBoundaryAndRejectsExcessWithoutMutation() {
        val source = listOf(document("a"))
        assertEquals(100_000, AttachmentDraft.editText(source, "a", "x".repeat(100_000)).single().text.length)
        assertThrows(IllegalArgumentException::class.java) { AttachmentDraft.editText(source, "a", "x".repeat(100_001)) }
        assertEquals("body", source.single().text)
    }

    @Test fun editorCountsUtf16WithoutTruncatingEmoji() {
        val source = listOf(document("a"))
        val text = "\uD83D\uDE00".repeat(50_000)
        assertEquals(text, AttachmentDraft.editText(source, "a", text).single().text)
        assertThrows(IllegalArgumentException::class.java) { AttachmentDraft.editText(source, "a", text + "x") }
    }

    @Test fun combinedDocumentBudgetIncludesEveryWrapper() {
        val source = listOf(document("a", "x".repeat(100_000)), document("b", "old"))
        val wrapper = "\n\n<资料 name=\"same.txt\">\n\n</资料>".length
        val fits = "y".repeat(200_000 - 100_000 - wrapper * 2)
        val edited = AttachmentDraft.editText(source, "b", fits)
        assertEquals(200_000, AttachmentDraft.message("", edited).content.length)
        assertThrows(IllegalArgumentException::class.java) { AttachmentDraft.editText(source, "b", fits + "y") }
        assertEquals("old", source[1].text)
    }

    @Test fun sendStillChecksCombinedMainMessageBudgetAfterEdit() {
        val edited = AttachmentDraft.editText(listOf(document("a")), "a", "x".repeat(100_000))
        assertThrows(IllegalArgumentException::class.java) { AttachmentDraft.message("y".repeat(100_000), edited) }
        assertEquals(100_000, edited.single().text.length)
    }

    @Test fun sendingEditedTextNeverReinsertsOriginalWireText() {
        val edited = AttachmentDraft.editText(listOf(document("a", "original-secret")), "a", "new")
        val message = AttachmentDraft.message("inspect", edited)
        val request = ChatWire.content(message) as String
        assertFalse(request.contains("original-secret"))
        assertEquals(message.content, request)
        assertEquals("new", message.wire!!.getJSONArray("attachments").getJSONObject(0).getString("text"))
    }

    @Test fun clearingTextRetainsReferenceWithoutReinsertingOldText() {
        val edited = AttachmentDraft.editText(listOf(document("a", "original-secret")), "a", "")
        val message = AttachmentDraft.message("inspect", edited)
        assertEquals("inspect", ChatWire.content(message))
        val row = message.wire!!.getJSONArray("attachments").getJSONObject(0)
        assertEquals("", row.getString("text"))
        assertEquals("file-a", row.getString("fileId"))
    }

    @Test fun missingWireIsCreatedWithCurrentTextAndStableIdentity() {
        val source = PendingAttachment("plain.txt", text = "old", key = "stable")
        val edited = AttachmentDraft.editText(listOf(source), "stable", "new").single()
        assertEquals("stable", edited.wire!!.getString("id"))
        assertEquals("new", edited.wire.getString("text"))
        assertEquals("document", edited.wire.getString("kind"))
        assertNull(source.wire)
    }

    @Test fun movedAndEditedOrderSurvivesMessageHydrationAndResave() {
        val source = listOf(document("a", "one"), document("b", "two"), document("c", "three"))
        val edited = AttachmentDraft.editText(AttachmentDraft.move(source, "b", -1), "b", "changed")
        val message = AttachmentDraft.message("inspect", edited)
        assertTrue(message.content.indexOf("changed") < message.content.indexOf("one"))
        val saved = ChatWire.message(ChatWire.hydrateMessage(ChatWire.message(message)))
        val rows = saved.getJSONArray("attachments")
        assertEquals(listOf("file-b", "file-a", "file-c"), (0 until rows.length()).map { rows.getJSONObject(it).getString("fileId") })
        assertEquals("changed", rows.getJSONObject(0).getString("text"))
    }

    @Test fun whitespaceEditPreservedInWireButDoesNotGenerateDocumentBody() {
        val edited = AttachmentDraft.editText(listOf(document("a")), "a", "  \n")
        val message = AttachmentDraft.message("inspect", edited)
        assertEquals("inspect", ChatWire.content(message))
        assertEquals("  \n", message.wire!!.getJSONArray("attachments").getJSONObject(0).getString("text"))
    }
}
