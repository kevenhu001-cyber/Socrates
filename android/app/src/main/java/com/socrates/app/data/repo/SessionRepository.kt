package com.socrates.app.data.repo

import com.socrates.app.data.local.SessionCache
import com.socrates.app.data.local.SessionRow
import com.socrates.app.data.remote.ApiService
import com.socrates.app.model.CreateSessionRequest
import com.socrates.app.model.SessionDetail
import com.socrates.app.model.SessionSummary
import com.socrates.app.model.UpdateSessionRequest
import com.socrates.app.util.Log
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.Dispatchers

/**
 * The sidebar's "Recents" list is the union of the server-side list
 * (authoritative) and the local Room cache (fast, works offline). The
 * server list is refreshed on every auth-boot and after every save.
 */
class SessionRepository(
    private val api: ApiService,
    private val cache: SessionCache,
) {

    fun observe(): Flow<List<SessionRow>> = cache.sessionDao.observe()

    /** Fetches the authoritative list from the server and writes to cache. */
    suspend fun refresh(): Result<List<SessionSummary>> = runCatching {
        val list = api.listSessions()
        cache.sessionDao.upsertAll(list.map { it.toRow() })
        list
    }

    suspend fun create(req: CreateSessionRequest): Result<SessionDetail> = runCatching {
        val d = api.createSession(req)
        cache.sessionDao.upsert(d.toRow())
        d
    }

    suspend fun get(id: String): Result<SessionDetail> = runCatching {
        val d = api.getSession(id)
        cache.sessionDao.upsert(d.toRow())
        d
    }

    suspend fun save(id: String, req: UpdateSessionRequest): Result<SessionDetail> = runCatching {
        val d = api.updateSession(id, req)
        cache.sessionDao.upsert(d.toRow())
        d
    }

    suspend fun delete(id: String): Result<Unit> = runCatching {
        runCatching { api.deleteSession(id) }
        cache.sessionDao.delete(id)
        Unit
    }

    /** Local-only "did the user already have this on device?" lookup. */
    suspend fun localById(id: String): SessionRow? = cache.sessionDao.byId(id)
}

private fun SessionSummary.toRow() = SessionRow(
    id = id,
    title = title,
    topic = topic,
    mode = mode,
    preview = preview,
    createdAt = createdAt,
    updatedAt = updatedAt,
    pinned = false
)

private fun SessionDetail.toRow() = SessionRow(
    id = id,
    title = title,
    topic = topic,
    mode = mode,
    preview = messages.lastOrNull { it.role == "user" }?.content?.take(140),
    createdAt = createdAt,
    updatedAt = updatedAt,
    pinned = false
)
