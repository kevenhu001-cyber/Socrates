package com.socrates.android.ui

import org.json.JSONObject

/** Config stored verbatim as JSON in creations assistant artifact.source. */
data class AssistantConfig(
    val description: String = "",
    val instructions: String = "",
    val starter: String = "",
    val extraFields: JSONObject = JSONObject(),
) {
    fun toSource(): String = JSONObject(extraFields.toString())
        .put("description", description)
        .put("instructions", instructions)
        .put("starter", starter)
        .toString()

    companion object {
        fun fromSource(source: String?): AssistantConfig {
            val parsed = source?.let { runCatching { JSONObject(it) }.getOrNull() } ?: JSONObject()
            val extras = JSONObject(parsed.toString())
            listOf("description", "instructions", "starter").forEach(extras::remove)
            return AssistantConfig(
                description = (parsed.opt("description") as? String).orEmpty(),
                instructions = (parsed.opt("instructions") as? String).orEmpty(),
                starter = (parsed.opt("starter") as? String).orEmpty(),
                extraFields = extras,
            )
        }
    }
}
