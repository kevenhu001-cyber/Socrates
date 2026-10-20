package com.socrates.android.ui

import java.net.URI
import java.net.URLDecoder

internal object AuthValidation {
    fun validEmail(value: String): Boolean = value.trim().let {
        it.length <= 254 && Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(it)
    }
    fun validPassword(value: String): Boolean = value.length in 8..64
    fun validCode(value: String): Boolean = Regex("[0-9]{6}").matches(value)
    fun resetToken(input: String): String {
        val value = input.trim()
        if (value.isEmpty()) return ""
        if (!value.contains("://")) return value
        val uri = runCatching { URI(value) }.getOrNull() ?: return ""
        val candidates = listOfNotNull(uri.rawQuery, uri.rawFragment?.substringAfter('?', uri.rawFragment))
        return candidates.asSequence().flatMap { it.split('&').asSequence() }
            .firstOrNull { it.substringBefore('=') == "token" }?.substringAfter('=', "")
            ?.let { runCatching { URLDecoder.decode(it, "UTF-8") }.getOrDefault("") }.orEmpty()
    }
}
