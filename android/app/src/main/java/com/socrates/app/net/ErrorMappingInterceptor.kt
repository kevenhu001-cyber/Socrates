package com.socrates.app.net

import okhttp3.Interceptor
import okhttp3.Response
import okio.IOException

/**
 * Translates the backend's `{detail, code, title}` JSON error shape
 * into a single, easy-to-display message on the exception path.
 * The web app does the same in `apiFetch`; replicating it here keeps
 * error strings consistent across platforms.
 */
class ErrorMappingInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val r = chain.proceed(chain.request())
        if (r.isSuccessful) return r
        val raw = r.peekBody(2048).string()
        val code = r.code
        val parsed = runCatching {
            Regex("\"(?:detail|message|title|error)\"\\s*:\\s*\"([^\"]+)\"")
                .find(raw)?.groupValues?.getOrNull(1)
        }.getOrNull()
        val msg = parsed ?: when (code) {
            401 -> "Wrong email or password"
            403 -> "Forbidden"
            404 -> "Not found"
            409 -> "Conflict"
            429 -> "Too many requests"
            in 500..599 -> "Server error"
            else -> "HTTP $code"
        }
        throw ApiException(code, msg, raw)
    }
}

class ApiException(
    val httpStatus: Int,
    val userMessage: String,
    val raw: String
) : IOException("[$httpStatus] $userMessage")
