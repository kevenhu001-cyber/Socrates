package com.topodrive.socrates.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Kotlin port of `packages/contracts/src/index.ts`. Field names match the
 *  wire shape exactly; everything optional stays nullable. */

@Serializable
data class User(
    val id: String,
    val email: String,
    val displayName: String? = null,
    val tier: String? = null,
    val plan: String? = null,
    val isGuest: Boolean = false,
    val verifiedAt: String? = null,
    val createdAt: String? = null,
    val customInstructions: String? = null,
    val preferences: JsonObject? = null,
    val defaultModel: String? = null,
)

@Serializable
data class Attachment(
    val id: String,
    val kind: String,
    val docKind: String? = null,
    val name: String,
    val mime: String = "",
    val dataUrl: String? = null,
    val text: String? = null,
    val truncated: Boolean = false,
    val size: Long = 0,
    val fileId: String? = null,
)

@Serializable
data class ToolCall(
    val id: String,
    val name: String,
    val input: JsonElement? = null,
    val output: String? = null,
    val isError: Boolean = false,
    val plan: JsonElement? = null,
    val spec: JsonElement? = null,
    val executionId: String? = null,
    val durationMs: Double? = null,
    val progressPhase: String? = null,
    val argumentsText: String? = null,
    val stderr: String? = null,
    val errorText: String? = null,
    val userMessage: String? = null,
    val detail: String? = null,
    val retryable: Boolean? = null,
    val artifacts: List<ToolArtifactRef>? = null,
    val results: List<JsonObject>? = null,
    val textOffset: Int? = null,
    val visualization: JsonElement? = null,
    /** Local-only UI state: "running" while streamed, "done"/"error" at rest. */
    val status: String? = null,
)

@Serializable
data class ToolArtifactRef(
    val id: String,
    val mimeType: String? = null,
    val name: String? = null,
)

@Serializable
data class Message(
    val id: String? = null,
    val clientId: String? = null,
    val role: String, // "user" | "assistant" | "system" | "tool"
    val rawText: String? = null,
    val content: String? = null,
    val html: String? = null,
    val type: String? = null,
    val reasoningContent: String? = null,
    val attachments: List<Attachment>? = null,
    val toolCalls: List<ToolCall>? = null,
    val createdAt: String? = null,
    val feedback: String? = null,
) {
    val text: String get() = rawText ?: content ?: ""
}

@Serializable
data class ExamData(
    val topic: String? = null,
    val difficulty: String? = null,
    val count: Int? = null,
    val lang: String? = null,
    val types: List<String>? = null,
    val questions: List<JsonElement>? = null,
    val answers: JsonObject? = null,
    val submitted: Boolean = false,
    val results: JsonElement? = null,
)

@Serializable
data class Session(
    val id: String,
    val title: String? = null,
    val topic: String = "",
    val domain: String? = null,
    val mode: String = "chat", // "chat" | "tutor"
    val phase: String? = null,
    val kind: String? = null, // "chat" | "tutor" | "exam"
    val examData: ExamData? = null,
    val projectId: String? = null,
    val pinned: Boolean = false,
    val archivedAt: String? = null,
    val preview: String? = null,
    val totalQ: Int? = null,
    val currentNode: Int? = null,
    val branchedFrom: JsonElement? = null,
    val tags: List<String>? = null,
    val updatedAt: String? = null,
    val createdAt: String? = null,
    val messages: List<Message>? = null,
    val kbNodes: List<JsonElement>? = null,
    val mistakes: List<JsonElement>? = null,
    val streamingText: String? = null,
    val streamingReasoning: String? = null,
    // TutorState
    val teachingStage: String? = null,
    val currentExampleIdx: Int? = null,
    val practiceAttempts: Int? = null,
    val practicePhase: String? = null,
    val teachingPlan: JsonElement? = null,
    val boundariesHistory: List<JsonElement>? = null,
    val mistakeFilter: String? = null,
)

@Serializable
data class Project(
    val id: String,
    val name: String,
    val description: String? = null,
    val color: String? = null,
    val icon: String? = null,
    val systemPrompt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class ScheduledTask(
    val id: String,
    val title: String,
    val prompt: String,
    val sessionId: String? = null,
    val cronExpression: String? = null,
    val frequency: String = "once",
    val status: String = "pending",
    val nextRunAt: String? = null,
    val lastRunAt: String? = null,
    val runCount: Int = 0,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class KnowledgeNode(
    val nodeName: String? = null,
    val status: String = "fuzzy",
    val sessionId: String,
    val sessionTitle: String? = null,
)

@Serializable
data class Mistake(
    val id: String,
    val sessionId: String? = null,
    val nodeName: String? = null,
    val questionContent: String,
    val userAnswer: String? = null,
    val correctAnswer: String? = null,
    val source: String? = null,
    val isResolved: Boolean = false,
    val collectedAt: String? = null,
    val resolvedAt: String? = null,
)

@Serializable
data class Memory(
    val id: String,
    val text: String,
    val scope: String? = null,
    val projectId: String? = null,
    val source: String? = null,
    val enabled: Boolean = true,
    val confidence: Double? = null,
    val createdAt: String? = null,
)

@Serializable
data class ApiKeyProvider(
    val id: String,
    val label: String? = null,
    val url: String,
    val model: String,
    val keyHint: String? = null,
    val isActive: Boolean = false,
    val isBuiltIn: Boolean = false,
    val isMultimodal: Boolean = false,
    val hasKey: Boolean = false,
    val createdAt: String? = null,
)

@Serializable
data class MobileTokenPair(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: String = "",
    val refreshExpiresAt: String = "",
)

@Serializable
data class MobileAuthResponse(
    val user: User,
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: String = "",
    val refreshExpiresAt: String = "",
)

@Serializable
data class ApiErrorBody(
    val error: String? = null,
    val code: String? = null,
    val message: String? = null,
    val detail: String? = null,
    val retryAfterSeconds: Int? = null,
)

@Serializable
data class FileEntry(
    val id: String,
    val name: String = "",
    val mimeType: String = "",
    val size: Long = 0,
    val kind: String = "",
    val createdAt: String? = null,
    val sessionId: String? = null,
)

@Serializable
data class Artifact(
    val id: String,
    val type: String? = null,
    val title: String? = null,
    val name: String? = null,
    val content: String? = null,
    val language: String? = null,
    val sessionId: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class SearchHit(
    val sessionId: String? = null,
    val title: String? = null,
    val snippet: String? = null,
    val score: Double? = null,
    val kind: String? = null,
)

@Serializable
data class ShareInfo(
    val token: String? = null,
    val url: String? = null,
    val visibility: String = "private",
)
