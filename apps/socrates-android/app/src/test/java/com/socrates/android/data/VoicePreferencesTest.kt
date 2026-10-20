package com.socrates.android.data

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.Locale

class VoicePreferencesTest {
    private fun response(value: Any? = "auto", include: Boolean = true) = JSONObject().put(
        "preferences", JSONObject().apply { if (include) put("voiceLanguage", value) }
    )

    @Test fun loadUsesExactGetPathAndMissingLanguageDefaultsToAuto() {
        var args: List<Any?>? = null
        val repo = VoicePreferencesRepository { method, path, body -> args = listOf(method, path, body); response(include = false) }
        assertEquals(VoiceLanguage.AUTO, repo.load())
        assertEquals(listOf("GET", "users/me/preferences", null), args)
    }

    @Test fun loadParsesSupportedWireValues() {
        listOf("auto" to VoiceLanguage.AUTO, "zh-CN" to VoiceLanguage.CHINESE, "en-US" to VoiceLanguage.ENGLISH).forEach { (wire, language) ->
            assertEquals(language, VoicePreferencesRepository { _, _, _ -> response(wire) }.load())
        }
    }

    @Test fun malformedPreferencesAreNotSilentlyDefaulted() {
        listOf(JSONObject(), JSONObject().put("preferences", JSONObject.NULL), JSONObject().put("preferences", "bad")).forEach { payload ->
            try { VoicePreferencesRepository { _, _, _ -> payload }.load(); fail("expected invalid preferences") }
            catch (_: IllegalStateException) { }
        }
    }

    @Test fun nullAndUnknownLanguageValuesAreNotSilentlyDefaulted() {
        listOf(JSONObject.NULL, "fr-FR", 4, false).forEach { value ->
            try { VoicePreferencesRepository { _, _, _ -> response(value) }.load(); fail("expected unsupported language: $value") }
            catch (_: IllegalStateException) { }
        }
    }

    @Test fun saveUsesExactPatchPathAndOnlyVoiceLanguageField() {
        var args: List<Any?>? = null
        val repo = VoicePreferencesRepository { method, path, body -> args = listOf(method, path, body); response("zh-CN") }
        assertEquals(VoiceLanguage.CHINESE, repo.save(VoiceLanguage.CHINESE))
        assertEquals("PATCH", args!![0]); assertEquals("users/me/preferences", args!![1])
        val body = args!![2] as JSONObject
        assertEquals(setOf("voiceLanguage"), body.keys().asSequence().toSet())
        assertEquals("zh-CN", body.getString("voiceLanguage"))
    }

    @Test fun saveRequiresServerConfirmationToMatchRequestedLanguage() {
        try { VoicePreferencesRepository { _, _, _ -> response("en-US") }.save(VoiceLanguage.CHINESE); fail("expected mismatch") }
        catch (_: IllegalStateException) { }
    }

    @Test fun saveAutoStillRequiresExplicitServerConfirmation() {
        try { VoicePreferencesRepository { _, _, _ -> response(include = false) }.save(VoiceLanguage.AUTO); fail("expected missing confirmation") }
        catch (_: IllegalStateException) { }
    }

    @Test fun recognitionTagUsesDeviceLocaleForAutoAndFixedTagsForExplicitLanguages() {
        assertEquals("zh-CN", VoiceLanguage.AUTO.recognitionTag(Locale.forLanguageTag("zh-CN")))
        assertEquals("en-US", VoiceLanguage.AUTO.recognitionTag(Locale.US))
        assertEquals("en-US", VoiceLanguage.AUTO.recognitionTag(Locale.ROOT))
        assertEquals("zh-CN", VoiceLanguage.CHINESE.recognitionTag(Locale.US))
        assertEquals("en-US", VoiceLanguage.ENGLISH.recognitionTag(Locale.CHINA))
    }

    @Test fun controllerLoadsExplicitlyAndSaveConfirmsOnlyAfterSuccessfulResponse() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var loads = 0; var saves = 0
            val c = VoicePreferencesController(scope, { loads++; VoiceLanguage.AUTO }, { saves++; it })
            assertEquals(0, loads); c.load()
            assertEquals(1, loads); assertEquals(VoiceLanguage.AUTO, c.state.value.confirmed)
            c.edit(VoiceLanguage.CHINESE); c.save()
            assertEquals(1, saves); assertEquals(VoiceLanguage.CHINESE, c.state.value.confirmed)
            assertNotNull(c.state.value.message)
        } finally { scope.cancel() }
    }

    @Test fun failedLoadCanBeRetried() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var attempts = 0
            val c = VoicePreferencesController(scope, { if (++attempts == 1) error("offline") else VoiceLanguage.ENGLISH }, { it })
            c.load(); assertTrue(c.state.value.needsRefresh); assertNull(c.state.value.confirmed)
            c.load(); assertEquals(2, attempts); assertEquals(VoiceLanguage.ENGLISH, c.state.value.confirmed); assertFalse(c.state.value.needsRefresh)
        } finally { scope.cancel() }
    }

    @Test fun failedSaveIsNotAutomaticallyRetriedAndRequiresRefreshWhilePreservingDraft() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var saves = 0; var loads = 0
            val c = VoicePreferencesController(scope, { loads++; VoiceLanguage.AUTO }, { saves++; error("uncertain write") })
            c.load(); c.edit(VoiceLanguage.CHINESE); c.save()
            assertEquals(1, saves); assertEquals(1, loads)
            assertEquals(VoiceLanguage.AUTO, c.state.value.confirmed); assertEquals(VoiceLanguage.CHINESE, c.state.value.selected)
            assertTrue(c.state.value.needsRefresh); assertFalse(c.state.value.canSave)
        } finally { scope.cancel() }
    }

    @Test fun busySaveRejectsEditAndDuplicateSave() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val response = CompletableDeferred<VoiceLanguage>(); var saves = 0
            val c = VoicePreferencesController(scope, { VoiceLanguage.AUTO }, { saves++; response.await() })
            c.load(); c.edit(VoiceLanguage.CHINESE); c.save()
            assertTrue(c.state.value.saving); c.edit(VoiceLanguage.ENGLISH); c.save()
            assertEquals(VoiceLanguage.CHINESE, c.state.value.selected); assertEquals(1, saves)
            response.complete(VoiceLanguage.CHINESE); assertEquals(VoiceLanguage.CHINESE, c.state.value.confirmed)
        } finally { scope.cancel() }
    }

    @Test fun unauthorizedFailureClearsStateAndInvokesAuthCallback() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var authLost = 0
            val c = VoicePreferencesController(scope, { VoiceLanguage.AUTO }, { throw ApiException(401, "unauthorized") }, { authLost++ })
            c.load(); c.edit(VoiceLanguage.CHINESE); c.save()
            assertEquals(1, authLost); assertEquals(VoicePreferencesState(), c.state.value)
        } finally { scope.cancel() }
    }

    @Test fun clearRejectsNonCooperativeLateLoadResponse() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val deferred = CompletableDeferred<VoiceLanguage>()
            val c = VoicePreferencesController(scope, { withContext(NonCancellable) { deferred.await() } }, { it })
            c.load(); c.clear(); deferred.complete(VoiceLanguage.ENGLISH)
            assertEquals(VoicePreferencesState(), c.state.value)
        } finally { scope.cancel() }
    }

    @Test fun dismissRejectsNonCooperativeLateSaveAndMarksRefreshNeeded() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val deferred = CompletableDeferred<VoiceLanguage>()
            val c = VoicePreferencesController(scope, { VoiceLanguage.AUTO }, { withContext(NonCancellable) { deferred.await() } })
            c.load(); c.edit(VoiceLanguage.CHINESE); c.save(); c.dismiss()
            deferred.complete(VoiceLanguage.CHINESE)
            assertEquals(VoiceLanguage.AUTO, c.state.value.confirmed); assertEquals(VoiceLanguage.AUTO, c.state.value.selected)
            assertFalse(c.state.value.saving); assertTrue(c.state.value.needsRefresh)
        } finally { scope.cancel() }
    }

    @Test fun confirmedValueDoesNotChangeBeforeSaveConfirmation() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val deferred = CompletableDeferred<VoiceLanguage>()
            val c = VoicePreferencesController(scope, { VoiceLanguage.AUTO }, { deferred.await() })
            c.load(); c.edit(VoiceLanguage.ENGLISH); c.save()
            assertEquals(VoiceLanguage.AUTO, c.state.value.confirmed); assertEquals(VoiceLanguage.ENGLISH, c.state.value.selected)
            deferred.complete(VoiceLanguage.ENGLISH); assertEquals(VoiceLanguage.ENGLISH, c.state.value.confirmed)
        } finally { scope.cancel() }
    }
}
