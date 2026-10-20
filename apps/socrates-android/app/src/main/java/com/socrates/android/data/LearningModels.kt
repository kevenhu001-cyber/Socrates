package com.socrates.android.data

import org.json.JSONArray
import org.json.JSONObject

/** Native representation of the web client's session-backed learning payloads. */
data class LearningQuestion(val index: Int, val type: String, val prompt: String, val options: List<Pair<String, String>>, val answer: String, val accepted: List<String>, val explanation: String)
data class LearningGrade(val correct: Int, val total: Int, val percent: Int, val results: Map<Int, Boolean>)

object LearningModels {
    val types = listOf("multiple-choice", "fill-blank", "short-answer")
    fun examQuestions(data: JSONObject): List<LearningQuestion> {
        val rows = data.optJSONArray("questions") ?: JSONArray()
        return (0 until rows.length()).mapNotNull { i ->
            val row = rows.optJSONObject(i) ?: return@mapNotNull null
            val prompt = row.optString("q").ifBlank { row.optString("question") }
            if (prompt.isBlank() || row.optString("type") == "error") return@mapNotNull null
            val opts = row.optJSONArray("opts") ?: JSONArray()
            val options = (0 until opts.length()).mapNotNull { j -> opts.optJSONObject(j)?.let { it.optString("letter").ifBlank { ('A' + j).toString() } to it.optString("text").ifBlank { it.optString("label") } } }
            val accepted = row.optJSONArray("answers")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter(String::isNotBlank) } ?: emptyList()
            LearningQuestion(i, row.optString("type").takeIf { it in types } ?: "fill-blank", prompt, options, row.optString("answer"), accepted, row.optString("explanation"))
        }
    }
    fun grade(questions: List<LearningQuestion>, answers: JSONObject): LearningGrade {
        val results = linkedMapOf<Int, Boolean>()
        questions.forEach { q ->
            val raw = answers.opt(q.index.toString())
            val value = raw?.toString()?.trim().orEmpty()
            val right = when (q.type) {
                "multiple-choice" -> {
                    val numeric = value.toIntOrNull()
                    val selected = if (raw is Number || numeric != null) q.options.getOrNull((raw as? Number)?.toInt() ?: numeric!!)?.first else q.options.firstOrNull { it.first.equals(value, true) }?.first
                    selected != null && selected == q.answer
                }
                "fill-blank" -> q.accepted.any { it.trim().equals(value, true) }
                else -> { val terms = q.answer.lowercase().split(Regex("[,\\s]+") ).filter { it.length > 3 }; terms.isEmpty() || terms.any { value.lowercase().contains(it) } }
            }
            results[q.index] = right
        }
        val total = results.size; val correct = results.values.count { it }
        return LearningGrade(correct, total, if (total == 0) 0 else (correct * 100.0 / total).toInt().let { kotlin.math.round(correct * 100.0 / total).toInt() }, results)
    }
    fun answeredCount(questions: List<LearningQuestion>, answers: JSONObject): Int = questions.count { q ->
        val value = answers.opt(q.index.toString())
        when (q.type) { "multiple-choice" -> value is Number || value is String && value.isNotBlank(); else -> value is Number || value is String && value.isNotBlank() }
    }
    fun examPrompt(topic: String, count: Int, difficulty: String, type: String, language: String, instructions: String, index: Int, prior: List<String>): String = buildString {
        append("Create exactly one assessment question about $topic. Return only a JSON object with fields q, type, opts, answer, answers, explanation.\n")
        append("Difficulty: $difficulty. Language: $language. Type: $type. This is question ${index + 1} of $count. ")
        append("Avoid duplicating these earlier questions: ${prior.joinToString(" | ")}. ")
        when (type) {
            "multiple-choice" -> append("Provide 4 options as [{letter:'A',text:'...'}], and answer as the correct letter.")
            "fill-blank" -> append("Provide accepted exact answers in answers array.")
            else -> append("Provide answer as concise key facts or keywords for grading.")
        }
        append(" Include a concise explanation. ${instructions.trim()}")
    }
    fun diagnosticPrompt(topic: String, index: Int, count: Int, language: String, prior: List<String>): String =
        "You are a thoughtful diagnostic tutor. Generate exactly one multiple-choice self-assessment question for $topic, in $language. This is question ${index + 1} of $count; test a different angle than: ${prior.joinToString(" | ")}. Return only JSON {\"q\":\"...\",\"knowledgePoint\":\"...\",\"opts\":[{\"letter\":\"A\",\"text\":\"...\",\"level\":\"internalized\"},{\"letter\":\"B\",\"text\":\"...\",\"level\":\"fuzzy\"},{\"letter\":\"C\",\"text\":\"...\",\"level\":\"blank\"}]}. Options represent the learner's honest self-assessed knowledge level, not right/wrong answers."
    fun parseDiagnostic(text: String, index: Int): JSONObject? = runCatching {
        val obj = JSONObject(text.substring(text.indexOf('{').takeIf { it >= 0 } ?: return null, text.lastIndexOf('}') + 1))
        val q = obj.optString("q").ifBlank { obj.optString("question") }; val opts = obj.optJSONArray("opts") ?: obj.optJSONArray("options")
        if (q.isBlank() || opts == null || opts.length() < 2) null else JSONObject().put("q", q).put("opts", opts).put("knowledgePoint", obj.optString("knowledgePoint")).put("nodeIdx", index)
    }.getOrNull()
    /** Apply diagnostic outcomes as durable tutor knowledge nodes and choose an initial lesson stage. */
    fun applyDiagnostic(topic: String, questions: JSONArray, answers: JSONObject): Pair<JSONArray, JSONObject> {
        val levels = mutableListOf<String>()
        for (i in 0 until questions.length()) {
            val q = questions.optJSONObject(i) ?: continue
            val options = q.optJSONArray("opts") ?: continue
            val rawChoice = answers.opt(i.toString())
            val choice = when (rawChoice) { is Number -> rawChoice.toInt(); else -> rawChoice?.toString()?.toIntOrNull() ?: -1 }
            val option = options.optJSONObject(choice)
            val level = option?.optString("level")?.takeIf { it in setOf("internalized", "fuzzy", "blank") } ?: "blank"
            levels += level
        }
        val status = when { levels.isEmpty() -> "blank"; levels.all { it == "internalized" } -> "internalized"; levels.any { it != "blank" } -> "fuzzy"; else -> "blank" }
        val nodes = JSONArray().put(JSONObject().put("name", topic).put("status", status).put("questions", questions.length()).put("selfAssessment", JSONObject().put("internalized", levels.count { it == "internalized" }).put("fuzzy", levels.count { it == "fuzzy" }).put("blank", levels.count { it == "blank" })))
        val subtopics = JSONArray().put(JSONObject().put("name", topic).put("status", status).put("objective", "Master $topic").put("exampleCount",2).put("practiceCount",1).put("inspectionType","concept").put("prerequisites",JSONArray()).put("fromBasics",true))
        val plan = JSONObject().put("subtopics", subtopics).put("currentSubtopicIdx",0).put("createdAt",System.currentTimeMillis())
        return nodes to plan
    }

    /** Real instructional voice contract for ChatViewModel's non-persistent _systemPrompt context. */
    fun tutorSystemPrompt(session: ChatSession): String {
        val wire = session.wire ?: JSONObject()
        val stage = wire.optString("teachingStage", "motivate")
        val nodes = wire.optJSONArray("kbNodes")
        val node = nodes?.optJSONObject(wire.optInt("currentNode", 0))?.optString("name")?.takeIf(String::isNotBlank) ?: session.topic
        val stageInstruction = when(stage) {
            "motivate" -> "Begin warmly, connect the learner's goal to $node, and ask one brief question to reveal their intuition."
            "define" -> "Define $node precisely and incrementally: explain the core idea, use a concrete example, then ask one Socratic check question."
            "develop" -> "Develop the idea in $node through one new line of reasoning, building on the established definition."
            "illustrate" -> "Work through concrete examples of $node without repeating earlier explanations."
            "exercise" -> "Give one focused practice problem on $node without revealing the answer. Wait for the learner's attempt, then give specific feedback."
            "check" -> "Check durable understanding of $node with a new transfer question; adapt to misconceptions rather than merely praising."
            else -> "Summarize what the learner can do, identify one remaining gap, and propose a concrete next step for $node."
        }
        return "You are Socrates, an adaptive Socratic tutor. This is a real lesson, not a generic chat. Topic: ${session.topic}. Current knowledge node: $node. Teaching stage: $stage. $stageInstruction Be accurate, kind, concise, ask one question at a time, never invent the learner's answer, and use the learner's language."
    }

    /** Pure progress update to call after each completed learner turn; persisted on the existing session. */
    fun advanceTutorProgress(session: ChatSession, learnerText: String): ChatSession {
        if(session.kind != "tutor") return session
        val wire=JSONObject(session.wire?.toString() ?: "{}")
        val stage=wire.optString("teachingStage", "motivate")
        val substantive = learnerText.trim().length > 40 && learnerText.trim().split(Regex("\\s+")).size > 8
        val count=wire.optInt("substantiveCount", 0) + if(substantive) 1 else 0
        val stages = listOf("motivate", "define", "develop", "illustrate", "exercise", "check")
        val next = if (substantive && stage != "check") stages.getOrElse(stages.indexOf(stage)+1) { "check" } else stage
        if (stage == "exercise") wire.put("practiceAttempts", wire.optInt("practiceAttempts")+1)
        if (next == "exercise" && stage != next) wire.put("practiceAttempts",0).put("practicePhase","foundation")
        wire.put("teachingStage",next).put("substantiveCount",count)
        return session.copy(wire=wire)
    }
}
