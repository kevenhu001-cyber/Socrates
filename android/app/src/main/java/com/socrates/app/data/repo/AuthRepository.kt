package com.socrates.app.data.repo

import com.socrates.app.data.local.PreferencesStore
import com.socrates.app.data.remote.ApiService
import com.socrates.app.data.remote.HttpClient
import com.socrates.app.model.Captcha
import com.socrates.app.model.CodeLoginRequest
import com.socrates.app.model.ForgotRequest
import com.socrates.app.model.LoginRequest
import com.socrates.app.model.RegisterRequest
import com.socrates.app.model.ResetRequest
import com.socrates.app.model.SendCodeRequest
import com.socrates.app.model.User
import com.socrates.app.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Owns the auth state machine. ViewModels observe [currentUser] and
 * re-render the gate/main shell on change. All network calls go
 * through [api] which already attaches the CSRF token.
 */
class AuthRepository(
    private val api: ApiService,
    private val prefs: PreferencesStore,
) {

    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    suspend fun captcha(): Result<Captcha> = runCatching { api.captcha() }
        .onFailure { Log.w("captcha unavailable — continuing", it) }

    suspend fun login(
        email: String,
        password: String,
        captchaToken: String,
        captchaAnswer: String,
        guest: Boolean,
    ): Result<User> = runCatching {
        val r = api.login(LoginRequest(email, password, captchaToken, captchaAnswer))
        prefs.setGuest(guest)
        prefs.setLastEmail(email)
        _currentUser.value = r.user
        r.user
    }

    suspend fun register(email: String, password: String, captchaToken: String, captchaAnswer: String): Result<Unit> =
        runCatching { api.register(RegisterRequest(email, password, captchaToken, captchaAnswer)) }
            .map { prefs.setLastEmail(email) }

    suspend fun verify(token: String): Result<User> = runCatching {
        val r = api.verify(token)
        _currentUser.value = r.user
        r.user
    }

    suspend fun forgotPassword(email: String, captchaToken: String, captchaAnswer: String): Result<Unit> =
        runCatching { api.forgotPassword(ForgotRequest(email, captchaToken, captchaAnswer)) }

    suspend fun resetPassword(token: String, password: String): Result<Unit> =
        runCatching { api.resetPassword(ResetRequest(token, password)) }

    suspend fun resetInfo(token: String): Result<String?> = runCatching { api.resetInfo(token).email }

    suspend fun sendCode(email: String, captchaToken: String, captchaAnswer: String): Result<Unit> =
        runCatching { api.sendCode(SendCodeRequest(email, captchaToken, captchaAnswer)) }

    suspend fun loginWithCode(
        email: String,
        code: String,
        captchaToken: String,
        captchaAnswer: String,
        guest: Boolean
    ): Result<User> = runCatching {
        val r = api.loginWithCode(CodeLoginRequest(email, code, captchaToken, captchaAnswer))
        prefs.setGuest(guest)
        prefs.setLastEmail(email)
        _currentUser.value = r.user
        r.user
    }

    suspend fun logout(): Result<Unit> = runCatching {
        runCatching { api.logout() }     // best effort
        _currentUser.value = null
        prefs.clearAuth()
        Unit
    }

    suspend fun deleteAccount(): Result<Unit> = runCatching {
        runCatching { api.deleteAccount() }
        _currentUser.value = null
        prefs.clearAuth()
        Unit
    }

    /**
     * Probe the server for a current session. Called once at app boot.
     * 200 → set the user; 401 → leave them null and show the gate.
     */
    suspend fun probe(): User? {
        val me = runCatching { api.me() }.getOrNull() ?: return null
        _currentUser.value = me.user
        return me.user
    }
}
