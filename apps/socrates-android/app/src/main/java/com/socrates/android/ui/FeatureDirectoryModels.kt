package com.socrates.android.ui

import com.socrates.android.data.FeatureItem

/** Filtering uses only fields present in the corresponding API resources. */
internal object FeatureDirectoryModels {
    fun filter(items: List<FeatureItem>, query: String, kind: String, taskFilter: String, libraryFilter: String): List<FeatureItem> {
        return items.filter { item ->
            val queryMatch = query.isBlank() || item.title.contains(query, true) || item.description.contains(query, true)
            val status = item.raw.optString("status").lowercase()
            val taskMatch = kind != "定时任务" || when (taskFilter) {
                "已开启" -> status == "pending" || status == "active"
                "已暂停" -> status == "paused"
                "已完成" -> status == "completed"
                else -> true
            }
            // The backend file/image resources have no documented folder/favorite taxonomy.
            val mime = item.raw.optString("mimeType").ifBlank { item.raw.optString("mime") }
            val libraryMatch = kind != "资料库" || when (libraryFilter) { "全部" -> true; "图像" -> mime.startsWith("image/"); else -> false }
            queryMatch && taskMatch && libraryMatch
        }
    }
}
