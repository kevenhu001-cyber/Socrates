package com.socrates.app.net

import com.socrates.app.data.local.PreferencesStore
import kotlinx.coroutines.runBlocking
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * Persistent cookie jar backed by DataStore. We only need a small,
 * domain-scoped set (`sid`, `csrf`, `session`), so we serialise as
 * plain text and tolerate the occasional re-load on cold start.
 *
 * The class is registered with OkHttp via [okhttp3.OkHttpClient.Builder.cookieJar].
 */
class CookieStore(private val prefs: PreferencesStore) : CookieJar {

    private val cache = mutableMapOf<String, List<Cookie>>()
    private val lock = Any()

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        synchronized(lock) {
            cache[url.host]?.let { cookies ->
                return cookies.filter { it.matches(url) }
            }
        }
        // Cold load from DataStore. OkHttp calls this on a worker thread so
        // a blocking read is acceptable.
        val raw = runBlocking { prefs.cookies() } ?: return emptyList()
        synchronized(lock) {
            val list = raw.split("|").mapNotNull { entry ->
                runCatching { Cookie.parse(url, entry) }.getOrNull()
            }
            cache[url.host] = list
            return list.filter { it.matches(url) }
        }
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        synchronized(lock) {
            val existing = (cache[url.host] ?: emptyList()).toMutableList()
            cookies.forEach { c ->
                existing.removeAll { it.name == c.name }
                existing.add(c)
            }
            cache[url.host] = existing
            runBlocking {
                prefs.setCookies(existing.joinToString("|") { it.toString() })
                // Mirror the CSRF cookie into a typed key so the interceptor
                // can read it without parsing every cookie on every call.
                val csrf = existing.firstOrNull { it.name == "csrf" }?.value
                prefs.setCsrf(csrf)
            }
        }
    }

    fun clear() {
        synchronized(lock) { cache.clear() }
        runBlocking { prefs.clearAuth() }
    }
}
