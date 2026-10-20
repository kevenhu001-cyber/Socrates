package com.socrates.android.data

import org.json.JSONArray
import org.json.JSONObject

data class ProviderEntry(val id: String, val label: String, val url: String, val model: String, val keyHint: String?, val hasKey: Boolean, val isActive: Boolean, val isBuiltIn: Boolean, val isMultimodal: Boolean) {
    companion object {
        fun fromJson(row: JSONObject) = ProviderEntry(row.optString("id"), row.optString("label"), row.optString("url"), row.optString("model"), row.optString("keyHint").takeIf { it.isNotBlank() && it != "null" }, row.optBoolean("hasKey"), row.optBoolean("isActive"), row.optBoolean("isBuiltIn"), row.optBoolean("isMultimodal"))
    }
}

/** Client for authenticated user API-key providers and the server-managed system model catalog. */
class ProviderRepository(private val api: ApiClient) {
    fun list(): List<ProviderEntry> {
        val rows = api.requestResource("GET", "api-keys").optJSONArray("providers") ?: JSONArray()
        return (0 until rows.length()).map { ProviderEntry.fromJson(rows.optJSONObject(it) ?: JSONObject()) }
    }
    fun activate(id: String) { api.requestResource("PATCH", "api-keys/${path(id)}", JSONObject().put("isActive", true)) }
    fun create(label: String, url: String, model: String, key: String, multimodal: Boolean) {
        require(key.isNotEmpty()) { "请输入 API 密钥" }
        api.requestResource("POST", "api-keys", JSONObject().put("label", label).put("url", url).put("model", model).put("key", key).put("isMultimodal", multimodal))
    }
    fun update(id: String, label: String, url: String, model: String, key: String?, multimodal: Boolean) {
        val body = JSONObject().put("label", label).put("url", url).put("model", model).put("isMultimodal", multimodal)
        key?.takeIf(String::isNotEmpty)?.let { body.put("key", it) }
        api.requestResource("PATCH", "api-keys/${path(id)}", body)
    }
    fun delete(id: String) { api.requestResource("DELETE", "api-keys/${path(id)}") }
    private fun path(id: String) = java.net.URLEncoder.encode(id, "UTF-8")
}
