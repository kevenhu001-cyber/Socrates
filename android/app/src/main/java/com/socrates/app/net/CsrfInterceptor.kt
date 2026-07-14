package com.socrates.app.net

import com.socrates.app.data.local.PreferencesStore
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Attaches the CSRF token to every state-changing request, exactly the
 * way the web client's `apiFetch` helper does. The token is read from
 * DataStore (where the [CookieStore] keeps a mirror copy); if absent,
 * the request proceeds — the server will return 403 and the caller can
 * trigger a re-warm by calling [com.socrates.app.data.remote.HttpClient.warmCsrf].
 */
class CsrfInterceptor(private val prefs: PreferencesStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val method = original.method.uppercase()
        if (method == "GET" || method == "HEAD" || method == "OPTIONS") {
            return chain.proceed(original)
        }
        val token = runBlocking { prefs.csrf() } ?: return chain.proceed(original)
        return chain.proceed(
            original.newBuilder()
                .header("X-CSRF-Token", token)
                .build()
        )
    }
}
