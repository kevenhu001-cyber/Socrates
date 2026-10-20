package com.socrates.android.ui

import com.socrates.android.data.ChatMessage
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AttachmentDraftTest {
    private fun item(name: String, key: String = name, text: String = "", image: String? = null, wire: JSONObject? = null) =
        PendingAttachment(name = name, key = key, text = text, imageDataUrl = image, wire = wire)

    @Test fun appendPreservesOrderAcrossMultipleAttachments() {
        val first = AttachmentDraft.append(emptyList(), item("a", "1"))
        val result = AttachmentDraft.append(AttachmentDraft.append(first, item("b", "2")), item("c", "3"))
        assertEquals(listOf("1", "2", "3"), result.map { it.key })
    }

    @Test fun sameNameAttachmentsRemainDistinctByKey() {
        val result = AttachmentDraft.append(listOf(item("report.pdf", "one")), item("report.pdf", "two"))
        assertEquals(2, result.size)
        assertEquals(listOf("one", "two"), result.map { it.key })
    }

    @Test fun removingOneSameNameAttachmentLeavesTheOther() {
        val original = listOf(item("same", "first"), item("same", "second"))
        assertEquals(listOf("second"), AttachmentDraft.remove(original, "first").map { it.key })
        assertEquals(2, original.size)
    }

    @Test fun draftAcceptsSixAttachments() {
        var list = emptyList<PendingAttachment>()
        repeat(6) { list = AttachmentDraft.append(list, item("$it", "key-$it")) }
        assertEquals(6, list.size)
    }

    @Test fun seventhDraftAttachmentIsRejectedWithoutChangingOriginal() {
        val original = (0 until 6).map { item("$it", "key-$it") }
        assertThrows(IllegalArgumentException::class.java) { AttachmentDraft.append(original, item("seventh", "7")) }
        assertEquals(6, original.size)
    }

    @Test fun duplicateKeyIsRejected() {
        val original = listOf(item("first", "same-key"))
        assertThrows(IllegalArgumentException::class.java) { AttachmentDraft.append(original, item("other", "same-key")) }
        assertEquals(listOf("first"), original.map { it.name })
    }

    @Test fun acceptsImageAggregateExactlyFourMillionCharacters() {
        val result = AttachmentDraft.append(listOf(item("one", "1", image = "x".repeat(2_000_000))),
            item("two", "2", image = "y".repeat(2_000_000)))
        assertEquals(2, result.size)
    }

    @Test fun imageAggregateOverFourMillionIsRejectedAndOriginalUnaffected() {
        val original = listOf(item("image", "one", image = "x".repeat(2_000_000)),
            item("image", "two", image = "y".repeat(2_000_000)))
        assertThrows(IllegalArgumentException::class.java) {
            AttachmentDraft.append(original, item("third", "three", image = "z"))
        }
        assertEquals(2, original.size)
        assertEquals(2_000_000, original.first().imageDataUrl!!.length)
    }

    @Test fun acceptsSingleImageExactlyTwoMillionAtMessageCreation() {
        val message = AttachmentDraft.message("", listOf(item("image", "i", image = "x".repeat(2_000_000))))
        assertEquals(2_000_000, message.wire!!.getJSONArray("attachments").getJSONObject(0).getString("dataUrl").length)
    }

    @Test fun rejectsSingleImageAboveTwoMillionAtMessageCreation() {
        assertThrows(IllegalArgumentException::class.java) {
            AttachmentDraft.message("", listOf(item("image", "i", image = "x".repeat(2_000_001))))
        }
    }

    @Test fun messageTextLimitIncludesDocumentWrapper() {
        val wrapperSize = "\n\n<资料 name=\"n\">\n\n</资料>".length
        val fits = AttachmentDraft.message("", listOf(item("n", "k", text = "x".repeat(200_000 - wrapperSize))))
        assertEquals(200_000, fits.content.length)
        assertThrows(IllegalArgumentException::class.java) {
            AttachmentDraft.message("", listOf(item("n", "k", text = "x".repeat(200_001 - wrapperSize))))
        }
    }

    @Test fun messageTextAndDocumentTextShareTwoHundredThousandLimit() {
        val result = AttachmentDraft.message("prefix", listOf(item("d", "k", text = "body")))
        assertEquals("prefix\n\n<资料 name=\"d\">\nbody\n</资料>", result.content)
    }

    @Test fun failedAppendDoesNotMutateSourceList() {
        val source = listOf(item("a", "a"))
        assertThrows(IllegalArgumentException::class.java) { AttachmentDraft.append(source, item("b", "a")) }
        assertEquals(listOf("a"), source.map { it.key })
    }

    @Test fun messageWireDeepCopiesAttachmentAndPreservesUnknownFields() {
        val sourceWire = JSONObject().put("id", "durable").put("kind", "document")
            .put("future", JSONObject().put("nested", 7))
        val message = AttachmentDraft.message("hello", listOf(item("doc", "k", wire = sourceWire)))
        val stored = message.wire!!.getJSONArray("attachments").getJSONObject(0)
        stored.getJSONObject("future").put("nested", 8)
        assertEquals(7, sourceWire.getJSONObject("future").getInt("nested"))
        assertEquals("durable", stored.getString("id"))
        assertEquals(8, stored.getJSONObject("future").getInt("nested"))
    }

    @Test fun everyImageIsRetainedInDurableMessageAttachments() {
        val message = AttachmentDraft.message("inspect", (1..4).map { item("img$it", "k$it", image = "data:image/png,$it") })
        val rows = message.wire!!.getJSONArray("attachments")
        assertEquals(4, rows.length())
        for (index in 0 until rows.length()) assertTrue(rows.getJSONObject(index).has("dataUrl"))
    }

    @Test fun loadScopeMatchesOnlySameAccountDraftAndRequestInstance() {
        val scope = AttachmentLoadScope(10L, "draft-A", "request-1")
        assertTrue(scope.matches(10L, "draft-A", scope))
        assertFalse(scope.matches(11L, "draft-A", scope))
        assertFalse(scope.matches(10L, "draft-B", scope))
        assertFalse(scope.matches(10L, "draft-A", AttachmentLoadScope(10L, "draft-A", "request-2")))
        assertFalse(scope.matches(10L, "draft-A", null))
    }

    @Test fun attachmentPreviewsReturnEveryMetadataRowInOrder() {
        val message = ChatMessage(role = "user", content = "", wire = JSONObject().put("attachments", JSONArray()
            .put(JSONObject().put("name", "one").put("kind", "document"))
            .put(JSONObject().put("name", "two").put("kind", "image").put("dataUrl", "data:image/png,abc"))))
        val previews = messageAttachmentPreviews(message)
        assertEquals(listOf("one", "two"), previews.map { it.name })
        assertNull(previews[0].dataUrl)
        assertEquals("data:image/png,abc", previews[1].dataUrl)
    }

    @Test fun previewsUseSafeNameAndOnlyImageDataUrls() {
        val rows = JSONArray()
            .put(JSONObject().put("name", " ").put("kind", "image").put("dataUrl", "data:image/png,x"))
            .put(JSONObject().put("name", "not-image").put("kind", "document").put("dataUrl", "data:image/png,y"))
            .put(JSONObject().put("name", "bad-url").put("kind", "image").put("dataUrl", "https://x"))
        val previews = messageAttachmentPreviews(ChatMessage(role = "user", content = "", wire = JSONObject().put("attachments", rows)))
        assertEquals("未命名附件", previews[0].name)
        assertEquals("data:image/png,x", previews[0].dataUrl)
        assertNull(previews[1].dataUrl)
        assertNull(previews[2].dataUrl)
    }

    @Test fun legacyPreviewFieldsAreUsedWhenWireHasNoAttachments() {
        val previews = messageAttachmentPreviews(ChatMessage(role = "user", content = "", attachmentName = "old.png", imageDataUrl = "data:image/png,old"))
        assertEquals(listOf(MessageAttachmentPreview("old.png", "data:image/png,old")), previews)
    }

    @Test fun legacyPreviewFallsBackToImageNameAndEmptyMessageHasNoPreview() {
        assertEquals(listOf(MessageAttachmentPreview("图片", "legacy")),
            messageAttachmentPreviews(ChatMessage(role = "user", content = "", imageDataUrl = "legacy")))
        assertTrue(messageAttachmentPreviews(ChatMessage(role = "user", content = "plain")).isEmpty())
    }

    @Test fun nonEmptyWireAttachmentsTakePrecedenceOverLegacyFields() {
        val message = ChatMessage(role = "user", content = "", attachmentName = "old", imageDataUrl = "old-url",
            wire = JSONObject().put("attachments", JSONArray().put(JSONObject().put("name", "new").put("kind", "document"))))
        assertEquals(listOf(MessageAttachmentPreview("new", null)), messageAttachmentPreviews(message))
    }

    @Test fun singleImageAboveLimitIsRejectedBeforeItEntersDraft() {
        assertThrows(IllegalArgumentException::class.java) {
            AttachmentDraft.append(emptyList(), item("image", image = "x".repeat(2_000_001)))
        }
    }

    @Test fun multipleDocumentsAndImagesReachExistingChatContentWithoutLossOrDuplication() {
        val message = AttachmentDraft.message("inspect", listOf(
            item("one.txt", text = "first body"), item("two.txt", text = "second body"),
            item("one.png", image = "data:image/png;base64,QQ=="),
            item("two.png", image = "data:image/png;base64,Qg==")))
        val parts = com.socrates.android.data.ChatWire.content(message) as JSONArray
        assertEquals(3, parts.length())
        val text = parts.getJSONObject(0).getString("text")
        assertEquals(message.content, text)
        assertTrue(text.contains("first body")); assertTrue(text.contains("second body"))
        assertEquals("data:image/png;base64,QQ==", parts.getJSONObject(1).getJSONObject("image_url").getString("url"))
        assertEquals("data:image/png;base64,Qg==", parts.getJSONObject(2).getJSONObject("image_url").getString("url"))
    }

    @Test fun reloadingAndResavingMessagePreservesEveryAttachmentAndDurableId() {
        val source = listOf(item("same.txt", "first", wire = JSONObject().put("fileId", "file-1").put("name", "same.txt")),
            item("same.txt", "second", wire = JSONObject().put("fileId", "file-2").put("name", "same.txt")))
        val row = com.socrates.android.data.ChatWire.message(AttachmentDraft.message("body", source))
        val reloaded = com.socrates.android.data.ChatWire.hydrateMessage(row)
        val resaved = com.socrates.android.data.ChatWire.message(reloaded).getJSONArray("attachments")
        assertEquals(2, resaved.length())
        assertEquals("file-1", resaved.getJSONObject(0).getString("fileId"))
        assertEquals("file-2", resaved.getJSONObject(1).getString("fileId"))
        assertEquals(listOf("same.txt", "same.txt"), messageAttachmentPreviews(reloaded).map { it.name })
    }

    @Test fun historicalPreviewLimitIsTwentyNotSixDraftItems() {
        val rows = JSONArray()
        repeat(21) { rows.put(JSONObject().put("name", "file-$it")) }
        val previews = messageAttachmentPreviews(ChatMessage(role = "user", content = "", wire = JSONObject().put("attachments", rows)))
        assertEquals(20, previews.size)
        assertEquals("file-19", previews.last().name)
    }
}
