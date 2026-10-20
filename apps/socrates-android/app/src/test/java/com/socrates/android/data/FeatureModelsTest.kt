package com.socrates.android.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FeatureModelsTest {
    @Test fun parsesServerItemsAndKeepsRawDetail() {
        val parsed = FeatureModels.items(JSONObject("""{"projects":[{"id":"p-1","name":"Research","description":"A project","color":"blue"}]}"""), "projects")
        assertEquals(1, parsed.size)
        assertEquals("Research", parsed.single().title)
        assertEquals("A project", parsed.single().description)
        assertEquals("blue", parsed.single().raw.getString("color"))
    }

    @Test fun emptyOrMissingEnvelopeProducesEmptyState() {
        assertTrue(FeatureModels.items(JSONObject("{}"), "files").isEmpty())
        assertTrue(FeatureModels.items(JSONObject("""{"files":[null,{}]}"""), "files", listOf("name", "title")).isEmpty())
    }

    @Test fun fileNamesAndTaskTitlesResolveServerFieldVariants() {
        val files = FeatureModels.items(JSONObject("""{"files":[{"id":"f1","name":"notes.pdf","mimeType":"application/pdf"}]}"""), "files", listOf("name", "title"))
        assertEquals("notes.pdf", files.single().title)
        assertEquals("application/pdf", files.single().description)
        val task = FeatureModels.items(JSONObject("""{"runs":[{"id":"r1","task":"Build feature","status":"completed"}]}"""), "runs", listOf("task", "summary"))
        assertEquals("Build feature", task.single().title)
        assertEquals("completed", task.single().description)
    }
    @Test fun memoryPageRetainsServerFieldsAndCursor() {
        val page = FeatureModels.memoryPage(JSONObject("""{"memories":[{"id":"m1","text":"Prefer concise answers","scope":"global","enabled":false,"source":"user"}],"nextCursor":"2026-10-20T10:00:00.000Z"}"""))
        assertEquals("2026-10-20T10:00:00.000Z", page.nextCursor)
        val memory = page.memories.single()
        assertEquals("Prefer concise answers", memory.title)
        assertEquals("global", memory.raw.getString("scope"))
        assertEquals(false, memory.raw.getBoolean("enabled"))
        assertEquals("user", memory.raw.getString("source"))
    }

    @Test fun memoryPageWithoutCursorIsTerminal() {
        assertEquals(null, FeatureModels.memoryPage(JSONObject("""{"memories":[]}""")).nextCursor)
    }
}
