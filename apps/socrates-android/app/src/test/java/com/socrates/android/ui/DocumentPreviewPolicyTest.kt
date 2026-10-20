package com.socrates.android.ui

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class DocumentPreviewPolicyTest {
    @Test fun mimeNormalizesServerFieldsAndParameters() {
        assertEquals("application/pdf", DocumentPreviewPolicy.mime(JSONObject().put("mimeType", " Application/PDF ; charset=binary ")))
        assertEquals("text/plain", DocumentPreviewPolicy.mime(JSONObject().put("mime", "TEXT/PLAIN; charset=utf-8")))
        assertEquals("", DocumentPreviewPolicy.mime(JSONObject()))
        assertEquals("text/plain", DocumentPreviewPolicy.mime(JSONObject().put("mimeType", JSONObject.NULL).put("mime", "text/plain")))
        assertEquals("", DocumentPreviewPolicy.mime(JSONObject().put("mimeType", 7).put("mime", JSONObject())))
    }

    @Test fun previewabilityMatchesContentRouteNotUploadAllowList() {
        val supported = listOf(
            "text/plain", "text/csv", "text/markdown", "application/json", "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/epub+zip", "application/rtf",
        )
        supported.forEach { assertTrue("$it", DocumentPreviewPolicy.canExtractText(JSONObject().put("mimeType", it))) }
        // Some parser modules and upload types are not exposed by GET /files/:id/content.
        listOf("text/html", "text/xml", "text/x-kotlin", "application/octet-stream", "image/png", "application/vnd.ms-powerpoint",
            "text/rtf", "application/msword", "application/vnd.ms-excel", "application/vnd.oasis.opendocument.text",
            "application/vnd.oasis.opendocument.spreadsheet", "application/vnd.oasis.opendocument.presentation")
            .forEach { assertFalse("$it must not be claimed", DocumentPreviewPolicy.canExtractText(JSONObject().put("mimeType", it))) }
    }

    @Test fun fileAndPdfClassificationExcludesArtifacts() {
        val artifact = JSONObject().put("_collection", "artifacts").put("mimeType", "application/pdf")
        assertFalse(DocumentPreviewPolicy.isFile(artifact))
        assertFalse(DocumentPreviewPolicy.isPdf(artifact))
        assertFalse(DocumentPreviewPolicy.canExtractText(artifact))
        assertTrue(DocumentPreviewPolicy.isPdf(JSONObject().put("mimeType", "application/pdf; version=1.7")))
        assertFalse(DocumentPreviewPolicy.isPdf(JSONObject().put("mimeType", "application/x-pdf")))
    }

    @Test fun responseRequiresStringTextAndUsesOnlyBooleanTruncated() {
        val preview = DocumentTextPreview.fromResponse(JSONObject()
            .put("ok", true).put("id", "opaque-server-id").put("text", "原始内容")
            .put("truncated", true).put("meta", JSONObject().put("pageCount", 4)))
        assertEquals("原始内容", preview.text)
        assertTrue(preview.truncated)
        assertEquals(listOf("页数" to "4"), preview.metadata)
        assertFalse(DocumentTextPreview.fromResponse(JSONObject().put("text", "x").put("truncated", "true")).truncated)
        listOf(JSONObject(), JSONObject().put("text", JSONObject()), JSONObject().put("text", 7), JSONObject().put("text", JSONObject.NULL))
            .forEach { raw ->
                try {
                    DocumentTextPreview.fromResponse(raw)
                    fail("expected a useful type-contract exception")
                } catch (expected: IllegalArgumentException) {
                    assertTrue(expected.message.orEmpty().contains("text"))
                }
            }
    }

    @Test fun metadataIsRestrictedToKnownSimpleParserFields() {
        val meta = JSONObject().put("pageCount", 2).put("sheetCount", 3).put("slideCount", 4)
            .put("warnings", 1).put("format", "xls").put("secret", "not a display field")
            .put("nested", JSONObject().put("value", "hidden"))
        val items = DocumentTextPreview.fromResponse(JSONObject().put("text", "").put("meta", meta)).metadata
        assertEquals(listOf("页数" to "2", "工作表数" to "3", "幻灯片数" to "4", "警告数" to "1", "格式" to "xls"), items)
    }

    @Test fun pagingPreservesTextAndDoesNotSplitSurrogatePairs() {
        assertTrue(DocumentTextPaging.pages("").isEmpty())
        val source = "a😀bc😀d"
        val pages = DocumentTextPaging.pages(source, 3)
        assertEquals(source, pages.joinToString(""))
        assertTrue(pages.all { it.length <= 3 })
        pages.forEach { page ->
            assertFalse(page.isNotEmpty() && Character.isHighSurrogate(page.last()))
            assertFalse(page.isNotEmpty() && Character.isLowSurrogate(page.first()))
        }
        assertEquals(listOf("abc", "def"), DocumentTextPaging.pages("abcdef", 3))
        assertEquals(listOf(source), DocumentTextPaging.pages(source, Int.MAX_VALUE))
        try {
            DocumentTextPaging.pages("x", 1)
            fail("maxChars must be at least 2")
        } catch (_: IllegalArgumentException) { }
    }
}
