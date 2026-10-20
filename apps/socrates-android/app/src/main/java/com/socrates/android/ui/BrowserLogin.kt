package com.socrates.android.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.socrates.android.data.BrowserLoginHandoff

/** Chrome owns the sid; the app keeps only encrypted, short-lived PKCE state. */
object BrowserLogin {
    const val WEB_URL = "https://app.topodrive.top"
    const val CHROME_PACKAGE = "com.android.chrome"
    private const val PREF = "browser_login_pending"
    enum class Result { Opened, ChromeUnavailable, LaunchFailed }
    data class Pending(val code: String, val verifier: String)

    private fun prefs(context: Context) = EncryptedSharedPreferences.create(
        context.applicationContext, PREF,
        MasterKey.Builder(context.applicationContext).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    /** Compatibility helper only; real login uses start() to create PKCE state. */
    fun intent(): Intent = browserIntent(Uri.parse(WEB_URL))

    private fun browserIntent(uri: Uri) = Intent(Intent.ACTION_VIEW, uri)
        .addCategory(Intent.CATEGORY_BROWSABLE).setPackage(CHROME_PACKAGE)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    @Synchronized
    fun start(context: Context, baseUrl: String, now: Long = System.currentTimeMillis()): Intent {
        require(BrowserLoginHandoff.productionBase(baseUrl)) { "浏览器登录仅支持生产服务器，请先切回生产连接。" }
        val verifier = BrowserLoginHandoff.newVerifier()
        val state = BrowserLoginHandoff.newState()
        check(prefs(context).edit().clear().putString("state", state).putString("verifier", verifier)
            .putLong("created", now).commit()) { "无法安全保存登录请求。" }
        val challenge = BrowserLoginHandoff.challenge(verifier)
        return browserIntent(Uri.parse("$WEB_URL/?native_login=1&state=$state&code_challenge=$challenge"))
    }

    fun open(context: Context, baseUrl: String): Result = launch(context, baseUrl, context::startActivity)

    internal fun launch(context: Context, baseUrl: String = "$WEB_URL/api/v2", startActivity: (Intent) -> Unit): Result = try {
        startActivity(start(context, baseUrl))
        Result.Opened
    } catch (_: ActivityNotFoundException) {
        clear(context)
        Result.ChromeUnavailable
    } catch (_: Exception) {
        clear(context)
        Result.LaunchFailed
    }

    @Synchronized
    fun consume(context: Context, uri: Uri?, now: Long = System.currentTimeMillis()): Pending? = try {
        val store = prefs(context)
        val state = store.getString("state", null)
        val verifier = store.getString("verifier", null)
        val created = store.getLong("created", 0L)
        // Persist consumption before using either value, including rejected callbacks.
        if (!store.edit().clear().commit() || state == null || verifier == null || uri == null) null
        else BrowserLoginHandoff.parseCallback(uri.toString(), state, verifier, created, now)
            ?.let { Pending(it.code, it.verifier) }
    } catch (_: Exception) {
        clear(context)
        null
    }

    @Synchronized
    fun clear(context: Context) {
        try { prefs(context).edit().clear().commit() }
        catch (_: Exception) { /* Storage failure must not expose a secret or crash the login UI. */ }
    }
}
