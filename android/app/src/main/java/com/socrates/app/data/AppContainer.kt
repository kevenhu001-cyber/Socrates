package com.socrates.app.data

import android.content.Context
import com.socrates.app.data.local.PreferencesStore
import com.socrates.app.data.local.SessionCache
import com.socrates.app.data.remote.ApiService
import com.socrates.app.data.remote.HttpClient
import com.socrates.app.data.repo.ApiKeyRepository
import com.socrates.app.data.repo.AuthRepository
import com.socrates.app.data.repo.ChatRepository
import com.socrates.app.data.repo.MistakeRepository
import com.socrates.app.data.repo.SessionRepository
import com.socrates.app.data.repo.ShareRepository

/**
 * Hand-rolled service locator. Held by [com.socrates.app.SocratesApp] and
 * read by ViewModels via the Activity's `applicationContext as SocratesApp`.
 */
interface AppContainer {
    val prefs: PreferencesStore
    val cache: SessionCache
    val http: HttpClient
    val api: ApiService
    val auth: AuthRepository
    val sessions: SessionRepository
    val chat: ChatRepository
    val mistakes: MistakeRepository
    val apiKeys: ApiKeyRepository
    val shares: ShareRepository
}

class DefaultAppContainer(context: Context) : AppContainer {

    override val prefs = PreferencesStore(context.applicationContext)
    override val cache = SessionCache(context.applicationContext)
    override val http = HttpClient(prefs)
    override val api: ApiService = http.api

    override val auth = AuthRepository(api, prefs)
    override val sessions = SessionRepository(api, cache)
    override val chat = ChatRepository(api, http.sseFactory)
    override val mistakes = MistakeRepository(api, cache)
    override val apiKeys = ApiKeyRepository(api)
    override val shares = ShareRepository(api)
}
