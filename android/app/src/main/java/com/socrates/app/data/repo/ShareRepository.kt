package com.socrates.app.data.repo

import com.socrates.app.data.remote.ApiService
import com.socrates.app.model.SessionDetail
import com.socrates.app.model.ShareRequest
import com.socrates.app.model.ShareResponse

class ShareRepository(private val api: ApiService) {
    suspend fun create(sessionId: String, visibility: String = "public"): Result<ShareResponse> =
        runCatching { api.createShare(sessionId, ShareRequest(visibility)) }

    suspend fun revoke(sessionId: String): Result<Unit> = runCatching {
        runCatching { api.deleteShare(sessionId) }
        Unit
    }

    suspend fun get(sessionId: String): Result<ShareResponse?> = runCatching { api.getShare(sessionId) }

    suspend fun view(token: String): Result<SessionDetail> = runCatching { api.viewShare(token) }
}
