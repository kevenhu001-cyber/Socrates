package com.socrates.app.data.repo

import com.socrates.app.data.local.MistakeRow
import com.socrates.app.data.local.SessionCache
import com.socrates.app.data.remote.ApiService
import com.socrates.app.model.SessionMistake
import kotlinx.coroutines.flow.Flow

class MistakeRepository(
    private val api: ApiService,
    private val cache: SessionCache,
) {
    fun observe(): Flow<List<MistakeRow>> = cache.mistakeDao.observe()
    suspend fun count(): Int = cache.mistakeDao.count()

    suspend fun refreshFromSession(id: String): Result<List<SessionMistake>> = runCatching {
        val detail = api.getSession(id)
        cache.mistakeDao.upsertAll(detail.mistakes.map { it.toRow(id) })
        detail.mistakes
    }

    suspend fun save(mistake: SessionMistake, sessionId: String?): Result<Unit> = runCatching {
        cache.mistakeDao.upsert(mistake.toRow(sessionId))
        Unit
    }

    suspend fun delete(id: String) = cache.mistakeDao.delete(id)
}

private fun SessionMistake.toRow(sessionId: String?) = MistakeRow(
    id = id ?: java.util.UUID.randomUUID().toString(),
    sessionId = sessionId,
    question = question,
    userAnswer = userAnswer,
    correctAnswer = correctAnswer,
    explanation = explanation,
    nodeName = nodeName,
    createdAt = createdAt
)
