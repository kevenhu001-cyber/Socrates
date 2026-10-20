package com.socrates.android.data

import org.json.JSONArray
import org.json.JSONObject

data class FeatureItem(val id: String, val title: String, val description: String = "", val raw: JSONObject = JSONObject())

data class FeatureDirectory(val items: List<FeatureItem>, val cursor: String? = null)
data class MemoryPage(val memories: List<FeatureItem>, val nextCursor: String?)

/** Parses list envelopes without discarding unknown server fields. */
object FeatureModels {
    fun items(root: JSONObject, key: String, titleKeys: List<String> = listOf("title", "name", "displayName")): List<FeatureItem> {
        val rows = root.optJSONArray(key) ?: JSONArray()
        return (0 until rows.length()).mapNotNull { index -> rows.optJSONObject(index)?.takeIf { it.optString("id").isNotBlank() }?.let { row ->
            val title = titleKeys.firstNotNullOfOrNull { keyName -> row.optString(keyName).takeIf { it.isNotBlank() && it != "null" } }.orEmpty().ifBlank { "未命名" }
            val detail = listOf("description", "mimeType", "status", "kind", "frequency").firstNotNullOfOrNull { keyName -> row.optString(keyName).takeIf { it.isNotBlank() && it != "null" } }.orEmpty()
            FeatureItem(row.optString("id"), title, detail, JSONObject(row.toString()))
        } }
    }

    fun memoryPage(root: JSONObject): MemoryPage = MemoryPage(
        memories = items(root, "memories", listOf("text")),
        nextCursor = root.optString("nextCursor").takeIf { it.isNotBlank() && it != "null" },
    )

    fun detailText(item: FeatureItem): String = item.raw.toString(2)
}
