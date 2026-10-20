package com.socrates.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject

class AssistantConfigTest {
    @Test fun parsesAllSharedAssistantFields() {
        val config = AssistantConfig.fromSource("""{"description":"About","instructions":"Teach carefully","starter":"Start here"}""")
        assertEquals("About", config.description)
        assertEquals("Teach carefully", config.instructions)
        assertEquals("Start here", config.starter)
    }

    @Test fun editingRecognizedFieldsPreservesUnknownContractExtensions() {
        val config = AssistantConfig.fromSource("""{"description":"old","instructions":"old rules","starter":"old start","futureOption":{"enabled":true},"tags":["math"]}""")
        val saved = JSONObject(config.copy(description = "new", instructions = "new rules", starter = "new start").toSource())
        assertEquals("new", saved.getString("description"))
        assertEquals("new rules", saved.getString("instructions"))
        assertEquals("new start", saved.getString("starter"))
        assertTrue(saved.getJSONObject("futureOption").getBoolean("enabled"))
        assertEquals("math", saved.getJSONArray("tags").getString(0))
    }

    @Test fun legacyOrMalformedSourceDegradesWithoutInventingValues() {
        val malformed = AssistantConfig.fromSource("not json")
        assertEquals("", malformed.description)
        assertEquals("", malformed.instructions)
        assertEquals("", malformed.starter)
        assertTrue(malformed.extraFields.length() == 0)
        val absent = JSONObject(AssistantConfig().toSource())
        assertFalse(absent.has("futureOption"))
    }

    @Test fun nonTextFieldsAreNotCoercedIntoVisibleBusinessContent() {
        val config = AssistantConfig.fromSource("""{"description":false,"instructions":["rule"],"starter":{"text":"hello"}}""")
        assertEquals("", config.description)
        assertEquals("", config.instructions)
        assertEquals("", config.starter)
    }

    @Test fun literalNullTextIsNotConfusedWithJsonNull() {
        assertEquals("null", AssistantConfig.fromSource("""{"starter":"null"}""").starter)
        assertEquals("", AssistantConfig.fromSource("""{"starter":null}""").starter)
    }
}
