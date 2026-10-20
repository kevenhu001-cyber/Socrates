package com.socrates.android.data

import org.json.JSONObject

/** Explicit mapping to implemented /api/v2/auth routes; paths are intentionally relative. */
class AuthOperations(private val api: ApiClient) {
    fun register(email: String, password: String) = api.requestResource("POST", "auth/register", JSONObject().put("email", email).put("password", password), false)
    fun login(email: String, password: String) = api.login(email, password)
    fun sendCode(email: String) = api.sendLoginCode(email)
    fun loginWithCode(email: String, code: String) = api.loginWithCode(email, code)
    fun forgotPassword(email: String) = api.requestResource("POST", "auth/forgot-password", JSONObject().put("email", email), false)
    fun resetPassword(token: String, password: String) = api.requestResource("POST", "auth/reset-password", JSONObject().put("token", token).put("password", password), false)
    fun changePassword(oldPassword: String, newPassword: String) = api.requestResource("POST", "auth/password", JSONObject().put("oldPassword", oldPassword).put("newPassword", newPassword))
    fun me() = api.currentUser()
    fun usage() = api.requestResource("GET", "account/usage")
}
