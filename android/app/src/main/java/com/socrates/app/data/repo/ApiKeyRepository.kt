package com.socrates.app.data.repo

import com.socrates.app.data.remote.ApiService
import com.socrates.app.model.ApiProvider
import com.socrates.app.model.ApiProviderList
import com.socrates.app.model.CreateProviderRequest
import com.socrates.app.model.UpdateProviderRequest

class ApiKeyRepository(private val api: ApiService) {

    suspend fun list(): Result<ApiProviderList> = runCatching { api.listApiKeys() }
    suspend fun create(req: CreateProviderRequest): Result<ApiProvider> = runCatching { api.createApiKey(req) }
    suspend fun update(id: String, req: UpdateProviderRequest): Result<ApiProvider> = runCatching { api.updateApiKey(id, req) }
    suspend fun activate(id: String): Result<ApiProvider> = runCatching {
        api.updateApiKey(id, UpdateProviderRequest(isActive = true))
    }
    suspend fun delete(id: String): Result<Unit> = runCatching {
        runCatching { api.deleteApiKey(id) }
        Unit
    }
}
