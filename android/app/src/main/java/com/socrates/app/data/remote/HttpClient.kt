package com.socrates.app.data.remote

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.socrates.app.BuildConfig
import com.socrates.app.data.local.PreferencesStore
import com.socrates.app.net.CookieStore
import com.socrates.app.net.CsrfInterceptor
import com.socrates.app.net.ErrorMappingInterceptor
import com.socrates.app.net.SseFactory
import com.socrates.app.util.Log
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * Owns the singleton OkHttp client and Retrofit instance. The same
 * OkHttp client backs both the Retrofit-generated [ApiService] and the
 * raw [SseFactory] used for streaming — they share the cookie jar and
 * the CSRF interceptor, so an `sid` set by `/api/auth/login` is
 * immediately available to the SSE connection.
 */
class HttpClient(private val prefs: PreferencesStore) {

    private val cookieStore = CookieStore(prefs)

    private val logging = HttpLoggingInterceptor { msg -> Log.d("http", msg) }.apply {
        level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.HEADERS
        else HttpLoggingInterceptor.Level.BASIC
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieStore)
        .addInterceptor(CsrfInterceptor(prefs))
        .addInterceptor(ErrorMappingInterceptor())
        .addInterceptor(logging)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)   // SSE: no read deadline
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    val sseFactory = SseFactory(client)

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
        coerceInputValues = true
    }

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.BASE_URL)
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    val api: ApiService = retrofit.create(ApiService::class.java)

    /** Proactively fetch a CSRF token, mirroring the web app's boot. */
    suspend fun warmCsrf() {
        runCatching { api.csrfToken() }
    }
}
