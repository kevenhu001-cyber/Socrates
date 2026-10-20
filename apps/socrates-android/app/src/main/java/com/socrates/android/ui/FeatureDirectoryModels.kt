package com.socrates.android.ui

import com.socrates.android.data.FeatureItem

/** Filtering uses only fields present in the corresponding API resources. */
internal object FeatureDirectoryModels {
    fun filter(items: List<FeatureItem>, query: String, kind: String, taskFilter: String, libraryFilter: String, projectFilter: String = "全部"): List<FeatureItem> {
        return items.filter { item ->
            val queryMatch = query.isBlank() || item.title.contains(query, true) || item.description.contains(query, true)
            val status = item.raw.optString("status").lowercase()
            val taskMatch = kind != "定时任务" || when (taskFilter) {
                "已开启" -> status == "pending" || status == "active"
                "已暂停" -> status == "paused"
                "已完成" -> status == "completed"
                else -> true
            }
            val mime = item.raw.optString("mimeType").ifBlank { item.raw.optString("mime") }
            val itemKind = item.raw.optString("kind")
            val image = itemKind == "image" || mime.startsWith("image/") || Regex(".*\\.(png|jpe?g|webp|gif|svg|avif)$", RegexOption.IGNORE_CASE).matches(item.title)
            val libraryMatch = kind != "资料库" || when (libraryFilter) {
                "全部", "推荐" -> true
                "收藏" -> item.raw.optBoolean("pinned") || item.raw.optBoolean("favorite")
                "文件夹" -> itemKind == "folder"
                "图像" -> image
                else -> true
            }
            val shared = item.raw.optBoolean("shared") || item.raw.optBoolean("isShared") || item.raw.optString("visibility") == "shared"
            val projectMatch = kind != "项目" || when (projectFilter) {
                "我创建的" -> !shared
                "与你共享" -> shared
                else -> true
            }
            queryMatch && taskMatch && libraryMatch && projectMatch
        }
    }
}
