package com.topodrive.socrates.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "socrates")

/**
 * Credential + preference persistence — the Android analogue of the web
 * client's token store (`mobile/src/data/api/tokenStore.ts`) and
 * localStorage-backed display prefs.
 */
class Prefs(private val context: Context) {
    private val ds get() = context.dataStore

    private val KEY_ACCESS = stringPreferencesKey("auth.accessToken")
    private val KEY_REFRESH = stringPreferencesKey("auth.refreshToken")
    private val KEY_EXPIRES = stringPreferencesKey("auth.expiresAt")
    private val KEY_REFRESH_EXPIRES = stringPreferencesKey("auth.refreshExpiresAt")
    private val KEY_USER_JSON = stringPreferencesKey("auth.userJson")

    private val KEY_THEME = stringPreferencesKey("display.theme") // system|light|dark
    private val KEY_FONT_SCALE = floatPreferencesKey("display.fontScale")
    private val KEY_CONTENT_WIDTH = floatPreferencesKey("display.contentWidth")
    private val KEY_SHOW_GRID = booleanPreferencesKey("display.showGrid")
    private val KEY_BG_DARK = stringPreferencesKey("display.bgDark")
    private val KEY_BG_LIGHT = stringPreferencesKey("display.bgLight")
    private val KEY_LANG = stringPreferencesKey("display.lang") // zh|en|system
    private val KEY_MODEL = stringPreferencesKey("chat.model")
    private val KEY_EFFORT = stringPreferencesKey("chat.effort")
    private val KEY_MODE = stringPreferencesKey("chat.mode")
    private val KEY_DRAFT_PREFIX = "draft."
    private val KEY_ONBOARD_DISMISSED = stringPreferencesKey("home.dismissedActions")

    data class Tokens(
        val accessToken: String?,
        val refreshToken: String?,
        val expiresAt: String?,
        val refreshExpiresAt: String?,
    ) {
        val isLoggedIn get() = !accessToken.isNullOrEmpty()
    }

    suspend fun readTokens(): Tokens = ds.data.map {
        Tokens(
            it[KEY_ACCESS], it[KEY_REFRESH], it[KEY_EXPIRES], it[KEY_REFRESH_EXPIRES],
        )
    }.first()

    suspend fun writeTokens(pair: MobileTokenPair) = ds.edit {
        it[KEY_ACCESS] = pair.accessToken
        it[KEY_REFRESH] = pair.refreshToken
        it[KEY_EXPIRES] = pair.expiresAt
        it[KEY_REFRESH_EXPIRES] = pair.refreshExpiresAt
    }

    suspend fun clearTokens() = ds.edit {
        it.remove(KEY_ACCESS); it.remove(KEY_REFRESH)
        it.remove(KEY_EXPIRES); it.remove(KEY_REFRESH_EXPIRES)
        it.remove(KEY_USER_JSON)
    }

    suspend fun readUserJson(): String? = ds.data.map { it[KEY_USER_JSON] }.first()
    suspend fun writeUserJson(json: String) = ds.edit { it[KEY_USER_JSON] = json }

    /* Display prefs — mirror frontend displayPrefs.js keys. */
    suspend fun theme(): String = ds.data.map { it[KEY_THEME] ?: "dark" }.first()
    suspend fun setTheme(v: String) = ds.edit { it[KEY_THEME] = v }
    suspend fun fontScale(): Float = ds.data.map { it[KEY_FONT_SCALE] ?: 1.125f }.first()
    suspend fun setFontScale(v: Float) = ds.edit { it[KEY_FONT_SCALE] = v }
    suspend fun contentWidth(): Float = ds.data.map { it[KEY_CONTENT_WIDTH] ?: 1f }.first()
    suspend fun setContentWidth(v: Float) = ds.edit { it[KEY_CONTENT_WIDTH] = v }
    suspend fun showGrid(): Boolean = ds.data.map { it[KEY_SHOW_GRID] ?: false }.first()
    suspend fun setShowGrid(v: Boolean) = ds.edit { it[KEY_SHOW_GRID] = v }
    suspend fun bgOverride(dark: Boolean): String? = ds.data.map { it[if (dark) KEY_BG_DARK else KEY_BG_LIGHT] }.first()
    suspend fun setBgOverride(dark: Boolean, v: String?) = ds.edit {
        val k = if (dark) KEY_BG_DARK else KEY_BG_LIGHT
        if (v == null) it.remove(k) else it[k] = v
    }
    suspend fun lang(): String = ds.data.map { it[KEY_LANG] ?: "system" }.first()
    suspend fun setLang(v: String) = ds.edit { it[KEY_LANG] = v }

    suspend fun selectedModel(): String? = ds.data.map { it[KEY_MODEL] }.first()
    suspend fun setSelectedModel(v: String?) = ds.edit { if (v == null) it.remove(KEY_MODEL) else it[KEY_MODEL] = v }
    suspend fun reasoningEffort(): String = ds.data.map { it[KEY_EFFORT] ?: "medium" }.first()
    suspend fun setReasoningEffort(v: String) = ds.edit { it[KEY_EFFORT] = v }
    suspend fun appMode(): String = ds.data.map { it[KEY_MODE] ?: "chat" }.first()
    suspend fun setAppMode(v: String) = ds.edit { it[KEY_MODE] = v }

    suspend fun draft(sessionId: String): String = ds.data.map { it[stringPreferencesKey(KEY_DRAFT_PREFIX + sessionId)] ?: "" }.first()
    suspend fun saveDraft(sessionId: String, v: String) = ds.edit {
        val k = stringPreferencesKey(KEY_DRAFT_PREFIX + sessionId)
        if (v.isEmpty()) it.remove(k) else it[k] = v
    }

    suspend fun dismissedActions(): Set<String> = ds.data.map {
        (it[KEY_ONBOARD_DISMISSED] ?: "").split(',').filter { s -> s.isNotBlank() }.toSet()
    }.first()
    suspend fun dismissAction(id: String) = ds.edit {
        val cur = (it[KEY_ONBOARD_DISMISSED] ?: "").split(',').filter { s -> s.isNotBlank() }.toMutableSet()
        cur.add(id)
        it[KEY_ONBOARD_DISMISSED] = cur.joinToString(",")
    }
}
