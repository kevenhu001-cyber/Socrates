package com.socrates.android.data

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ProviderRepositoryTest {
    @Test fun providerParsingUsesSafeServerFieldsOnly() {
        val p = ProviderEntry.fromJson(JSONObject("""{"id":"x","label":"Test","url":"https://example.com/v1","model":"real-model","keyHint":"abcd1234","hasKey":true,"isActive":true,"isBuiltIn":false,"isMultimodal":false,"key":"must-not-be-used"}"""))
        assertEquals("real-model", p.model); assertEquals("abcd1234", p.keyHint); assertTrue(p.hasKey); assertFalse(p.isBuiltIn); assertFalse(p.isMultimodal)
    }
    @Test fun emptyKeyHintAndFalseFlagsParseSafely() {
        val p = ProviderEntry.fromJson(JSONObject("""{"id":"b","label":"Built in","url":"","model":"","keyHint":null}"""))
        assertNull(p.keyHint); assertFalse(p.hasKey); assertFalse(p.isActive); assertFalse(p.isBuiltIn)
    }
}
