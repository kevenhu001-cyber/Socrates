package com.socrates.app.data.remote

import com.socrates.app.model.*
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

/**
 * Retrofit interface that mirrors the web client's `/api/*` surface.
 * Every state-changing call expects the caller to attach the
 * `X-CSRF-Token` header — the OkHttp [com.socrates.app.net.CsrfInterceptor]
 * does that automatically by reading it from the persistent cookie jar.
 */
interface ApiService {

    /* ----- Auth ----- */

    @GET("api/auth/me")
    suspend fun me(): MeResponse

    @GET("api/auth/csrf-token")
    suspend fun csrfToken(): ResponseBody

    @POST("api/auth/login")
    suspend fun login(@Body req: LoginRequest): AuthResponse

    @POST("api/auth/register")
    suspend fun register(@Body req: RegisterRequest): ResponseBody

    @GET("api/auth/verify")
    suspend fun verify(@Query("token") token: String): AuthResponse

    @POST("api/auth/logout")
    suspend fun logout(): ResponseBody

    @POST("api/auth/forgot-password")
    suspend fun forgotPassword(@Body req: ForgotRequest): ResponseBody

    @POST("api/auth/reset-password")
    suspend fun resetPassword(@Body req: ResetRequest): ResponseBody

    @GET("api/auth/reset-info")
    suspend fun resetInfo(@Query("token") token: String): ResetInfo

    @POST("api/auth/send-code")
    suspend fun sendCode(@Body req: SendCodeRequest): ResponseBody

    @POST("api/auth/login-with-code")
    suspend fun loginWithCode(@Body req: CodeLoginRequest): AuthResponse

    @HTTP(method = "DELETE", path = "api/auth/account", hasBody = true)
    suspend fun deleteAccount(): ResponseBody

    /* ----- Captcha ----- */

    @GET("api/captcha/generate")
    suspend fun captcha(): Captcha

    /* ----- Sessions ----- */

    @GET("api/sessions")
    suspend fun listSessions(): List<SessionSummary>

    @POST("api/sessions")
    suspend fun createSession(@Body req: CreateSessionRequest): SessionDetail

    @GET("api/sessions/{id}")
    suspend fun getSession(@Path("id") id: String): SessionDetail

    @PATCH("api/sessions/{id}")
    suspend fun updateSession(@Path("id") id: String, @Body req: UpdateSessionRequest): SessionDetail

    @HTTP(method = "DELETE", path = "api/sessions/{id}", hasBody = false)
    suspend fun deleteSession(@Path("id") id: String): ResponseBody

    /* ----- Share ----- */

    @GET("api/sessions/{id}/share")
    suspend fun getShare(@Path("id") id: String): ShareResponse

    @POST("api/sessions/{id}/share")
    suspend fun createShare(@Path("id") id: String, @Body req: ShareRequest): ShareResponse

    @HTTP(method = "DELETE", path = "api/sessions/{id}/share", hasBody = false)
    suspend fun deleteShare(@Path("id") id: String): ResponseBody

    @GET("api/shares/{token}")
    suspend fun viewShare(@Path("token") token: String): SessionDetail

    /* ----- API keys ----- */

    @GET("api/api-key")
    suspend fun listApiKeys(): ApiProviderList

    @POST("api/api-key")
    suspend fun createApiKey(@Body req: CreateProviderRequest): ApiProvider

    @PATCH("api/api-key/{id}")
    suspend fun updateApiKey(@Path("id") id: String, @Body req: UpdateProviderRequest): ApiProvider

    @HTTP(method = "DELETE", path = "api/api-key/{id}", hasBody = false)
    suspend fun deleteApiKey(@Path("id") id: String): ResponseBody

    /* ----- Migration (web → native) ----- */

    @POST("api/migrate")
    suspend fun migrate(@Body payload: Map<String, @JvmSuppressWildcards Any?>): ResponseBody

    /* ----- Non-streaming chat (used for short-form tasks like title gen) ----- */

    @POST("api/chat")
    suspend fun chatNonStream(@Body req: ChatRequest): ChatMessage
}
