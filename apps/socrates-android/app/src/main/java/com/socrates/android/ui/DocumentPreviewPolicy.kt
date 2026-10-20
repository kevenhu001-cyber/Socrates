package com.socrates.android.ui

import org.json.JSONObject

/** Client-side mirror of GET /api/files/:id/content's previewable MIME contract. */
object DocumentPreviewPolicy {
    const val MAX_PDF_BYTES: Int = 20 * 1024 * 1024

    private val plainTextMimes = setOf("application/json", "text/plain", "text/csv", "text/markdown")
    private val parserMimes = setOf(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/epub+zip", "application/rtf",
    )

    /** Reads server-shaped mimeType, with legacy mime as fallback, stripping parameters. */
    fun mime(raw: JSONObject): String {
        val value = (raw.opt("mimeType") as? String)?.takeUnless { it.isBlank() }
            ?: (raw.opt("mime") as? String).orEmpty()
        return value.substringBefore(';').trim().lowercase()
    }

    fun isFile(raw: JSONObject): Boolean = raw.optString("_collection") != "artifacts"

    fun isPdf(raw: JSONObject): Boolean = isFile(raw) && mime(raw) == "application/pdf"

    /** Exact content route set; accepting every text subtype would overstate support. */
    fun canExtractText(raw: JSONObject): Boolean = isFile(raw) &&
        (mime(raw) in plainTextMimes || mime(raw) in parserMimes || mime(raw) == "application/pdf")
}

data class DocumentTextPreview(
    val text: String,
    val truncated: Boolean,
    val metadata: List<Pair<String, String>>,
) {
    companion object {
        private val metadataLabels = mapOf(
            "pageCount" to "页数",
            "sheetCount" to "工作表数",
            "slideCount" to "幻灯片数",
            "warnings" to "警告数",
            "format" to "格式",
        )

        /** Parses the actual content endpoint response; malformed/missing text is a contract error. */
        fun fromResponse(response: JSONObject): DocumentTextPreview {
            val value = response.opt("text")
            require(value is String) { "预览响应缺少有效的 text 字符串字段" }
            val truncated = response.opt("truncated") as? Boolean ?: false
            val meta = response.optJSONObject("meta")
            val metadata = mutableListOf<Pair<String, String>>()
            if (meta != null) {
                metadataLabels.forEach { (key, label) ->
                    if (!meta.has(key) || meta.isNull(key)) return@forEach
                    when (val item = meta.opt(key)) {
                        is String -> metadata.add(label to item)
                        is Number -> metadata.add(label to item.toString())
                        is Boolean -> metadata.add(label to item.toString())
                    }
                }
            }
            return DocumentTextPreview(value, truncated, metadata)
        }
    }
}

/** Splits for bounded UI rendering without changing text or separating UTF-16 surrogate pairs. */
object DocumentTextPaging {
    fun pages(text: String, maxChars: Int = 6000): List<String> {
        require(maxChars >= 2) { "maxChars 必须至少为 2" }
        if (text.isEmpty()) return emptyList()
        val result = ArrayList<String>(1 + (text.length - 1) / maxChars)
        var start = 0
        while (start < text.length) {
            var end = start + minOf(maxChars, text.length - start)
            if (end < text.length && end > start &&
                Character.isHighSurrogate(text[end - 1]) && Character.isLowSurrogate(text[end])) {
                end--
            }
            result.add(text.substring(start, end))
            start = end
        }
        return result
    }
}
