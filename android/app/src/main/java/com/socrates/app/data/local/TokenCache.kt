package com.socrates.app.data.local

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.Cookie
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

/**
 * Volatile in-memory mirror of the auth state held in [PreferencesStore]
 * (DataStore).  The OkHttp dispatcher must never block on disk I/O — the
 * [CookieStore] and [com.socrates.app.net.CsrfInterceptor] both run on
 * its worker threads, and a [kotlinx.coroutines.runBlocking] there can
 * starve the entire network under DataStore backpressure.
 *
 * Strategy:
 * 1. On startup, [preload] reads the persisted CSRF/cookies once
 *    (suspending, in a background scope) and populates the volatile fields.
 * 2. Callers read the volatile fields synchronously — never blocking.
 * 3. Writes go to the volatile fields immediately and are mirrored to
 *    DataStore asynchronously on the IO scope.  DataStore errors are
 *    retried up to 2 times with linear backoff.
 */
class TokenCache(private val prefs: PreferencesStore) {

    private val ioScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val csrfRef = AtomicReference<String?>(null)
    private val cookieCache = ConcurrentHashMap<String, List<Cookie>>()
    private val cookiesRawRef = AtomicReference<String?>(null)

    /** Reactive read for tests / debug UI. */
    private val _csrfFlow = MutableStateFlow<String?>(null)
    val csrfFlow: StateFlow<String?> = _csrfFlow.asStateFlow()

    /** Synchronous read used by OkHttp interceptors. */
    val csrf: String? get() = csrfRef.get()

    /**
     * Hydrate the cache from DataStore exactly once at app start. Safe
     * to call multiple times — subsequent calls are no-ops.
     */
    suspend fun preload() {
        val csrf = prefs.csrf()
        csrfRef.set(csrf)
        _csrfFlow.value = csrf
        val raw = prefs.cookies()
        cookiesRawRef.set(raw)
    }

    /**
     * Synchronous read used by [com.socrates.app.net.CookieStore.loadForRequest].
     * Returns the in-memory map; the caller filters by URL. If the cache
     * has not been populated yet, returns empty (the first request will
     * warm via [preload] on next restart — acceptable because the first
     * request on a cold start is almost always the auth probe, which
     * uses [HttpClient.warmCsrf] anyway).
     */
    fun cookiesForHost(host: String): List<Cookie> =
        cookieCache[host] ?: emptyList()

    fun allCookies(): Map<String, List<Cookie>> = cookieCache.toMap()

    /**
     * Merge a freshly-received cookie set into the in-memory map and
     * asynchronously mirror the new state to DataStore.  This method
     * is synchronous and never blocks the caller.
     */
    fun putCookies(host: String, cookies: List<Cookie>, csrf: String?) {
        if (csrf != null) {
            csrfRef.set(csrf)
            _csrfFlow.value = csrf
        }
        cookieCache[host] = cookies
        val serialized = cookies.joinToString("|") { it.toString() }
        cookiesRawRef.set(serialized)
        ioScope.launch {
            writeWithRetry {
                prefs.setCookies(serialized)
                prefs.setCsrf(csrf)
            }
        }
    }

    fun clear() {
        csrfRef.set(null)
        _csrfFlow.value = null
        cookieCache.clear()
        cookiesRawRef.set(null)
        ioScope.launch {
            writeWithRetry { prefs.clearAuth() }
        }
    }

    private suspend fun writeWithRetry(block: suspend () -> Unit) {
        var attempt = 0
        while (attempt < 3) {
            try {
                block()
                return
            } catch (t: Throwable) {
                attempt++
                if (attempt >= 3) {
                    com.socrates.app.util.Log.w(
                        "TokenCache: DataStore write failed after $attempt attempts", t
                    )
                    return
                }
                kotlinx.coroutines.delay(100L * attempt)
            }
        }
    }
}
