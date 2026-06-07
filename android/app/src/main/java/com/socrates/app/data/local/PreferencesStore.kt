package com.socrates.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("socrates_prefs")

/**
 * Thin wrapper around DataStore. We keep it synchronous from the call
 * sites' perspective by exposing `Flow` for reactive state and
 * suspending `readX` for one-shot lookups (CSRF token, last user).
 */
class PreferencesStore(private val context: Context) {

    private object Keys {
        val CSRF = stringPreferencesKey("csrf")
        val COOKIES = stringPreferencesKey("cookie_store")
        val THEME = stringPreferencesKey("theme")          // "light" | "dark" | "system"
        val FONT_STEP = intPreferencesKey("font_step")     // 0..3
        val WIDTH_STEP = intPreferencesKey("width_step")   // 0..3
        val GUEST = booleanPreferencesKey("guest")
        val LAST_EMAIL = stringPreferencesKey("last_email")
    }

    val theme: Flow<String> = context.dataStore.data.map { it[Keys.THEME] ?: "system" }
    val fontStep: Flow<Int> = context.dataStore.data.map { it[Keys.FONT_STEP] ?: 1 }
    val widthStep: Flow<Int> = context.dataStore.data.map { it[Keys.WIDTH_STEP] ?: 1 }
    val isGuest: Flow<Boolean> = context.dataStore.data.map { it[Keys.GUEST] ?: false }
    val lastEmail: Flow<String> = context.dataStore.data.map { it[Keys.LAST_EMAIL].orEmpty() }

    suspend fun csrf(): String? = context.dataStore.data.first()[Keys.CSRF]

    suspend fun setCsrf(value: String?) {
        context.dataStore.edit { p ->
            if (value == null) p.remove(Keys.CSRF) else p[Keys.CSRF] = value
        }
    }

    suspend fun setCookies(cookies: String) {
        context.dataStore.edit { it[Keys.COOKIES] = cookies }
    }

    suspend fun cookies(): String? = context.dataStore.data.first()[Keys.COOKIES]

    suspend fun setTheme(value: String) {
        context.dataStore.edit { it[Keys.THEME] = value }
    }

    suspend fun setFontStep(value: Int) {
        context.dataStore.edit { it[Keys.FONT_STEP] = value.coerceIn(0, 3) }
    }

    suspend fun setWidthStep(value: Int) {
        context.dataStore.edit { it[Keys.WIDTH_STEP] = value.coerceIn(0, 3) }
    }

    suspend fun setGuest(value: Boolean) {
        context.dataStore.edit { it[Keys.GUEST] = value }
    }

    suspend fun setLastEmail(value: String) {
        context.dataStore.edit { it[Keys.LAST_EMAIL] = value }
    }

    suspend fun clearAuth() {
        context.dataStore.edit {
            it.remove(Keys.CSRF)
            it.remove(Keys.COOKIES)
        }
    }
}
