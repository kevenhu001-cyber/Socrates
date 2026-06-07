package com.socrates.app.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/* ============================================================
   Auth & captcha
   ============================================================ */

@Serializable
data class Captcha(
    val token: String,
    val question: String
)

@Serializable
data class User(
    val id: String,
    val email: String,
    val tier: String = "diophantus",
    val plan: String? = null,
    val displayName: String? = null,
    val isGuest: Boolean = false
)

@Serializable
data class AuthResponse(val user: User)

@Serializable
data class MeResponse(val user: User)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
    val captchaToken: String,
    val captchaAnswer: String
)

@Serializable
data class RegisterRequest(
    val email: String,
    val password: String,
    val captchaToken: String,
    val captchaAnswer: String
)

@Serializable
data class ForgotRequest(val email: String, val captchaToken: String, val captchaAnswer: String)

@Serializable
data class ResetRequest(val token: String, val password: String)

@Serializable
data class ResetInfo(val email: String?, val ok: Boolean = true)

@Serializable
data class SendCodeRequest(val email: String, val captchaToken: String, val captchaAnswer: String)

@Serializable
data class CodeLoginRequest(
    val email: String,
    val code: String,
    val captchaToken: String,
    val captchaAnswer: String
)

/* ============================================================
   Sessions
   ============================================================ */

@Serializable
data class SessionSummary(
    val id: String,
    val title: String? = null,
    val topic: String? = null,
    val mode: String = "tutor",
    val preview: String? = null,
    val createdAt: Long,
    val updatedAt: Long
)

@Serializable
data class SessionDetail(
    val id: String,
    val title: String? = null,
    val topic: String? = null,
    val mode: String = "tutor",
    val messages: List<SessionMessage> = emptyList(),
    val knowledge: List<KnowledgeNode> = emptyList(),
    val mistakes: List<SessionMistake> = emptyList(),
    val createdAt: Long,
    val updatedAt: Long
)

@Serializable
data class SessionMessage(
    val id: String? = null,
    val role: String,                  // "user" | "assistant" | "system"
    val content: String,
    val type: String? = null,          // "explain" | "quiz" | "example" | "practice" | "diagnostic"
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class KnowledgeNode(
    val id: String? = null,
    val name: String,
    val status: String = "blank",      // "internalized" | "fuzzy" | "blank"
    val depth: Int = 0
)

@Serializable
data class SessionMistake(
    val id: String? = null,
    val question: String,
    val userAnswer: String,
    val correctAnswer: String? = null,
    val explanation: String? = null,
    val nodeName: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class CreateSessionRequest(
    val topic: String,
    val mode: String = "tutor",
    val title: String? = null
)

@Serializable
data class UpdateSessionRequest(
    val title: String? = null,
    val topic: String? = null,
    val mode: String? = null,
    val messages: List<SessionMessage>? = null,
    val knowledge: List<KnowledgeNode>? = null
)

/* ============================================================
   Chat / streaming
   ============================================================ */

@Serializable
data class ChatRequest(
    val messages: List<ChatMessage>,
    val temperature: Double = 0.5,
    val max_tokens: Int = 1024,
    val sessionId: String? = null,
    val mode: String = "tutor"
)

@Serializable
data class ChatMessage(val role: String, val content: String)

@Serializable
data class ChatDelta(
    val choices: List<ChatChoice> = emptyList()
)

@Serializable
data class ChatChoice(
    val delta: ChatDeltaContent = ChatDeltaContent(),
    val finishReason: String? = null
)

@Serializable
data class ChatDeltaContent(val content: String? = null, val role: String? = null)

@Serializable
data class ChatError(val message: String)

/* ============================================================
   Agent
   ============================================================ */

@Serializable
data class AgentRequest(
    val task: String,
    val maxSteps: Int = 25,
    val sessionId: String? = null
)

@Serializable
data class AgentEvent(
    val event: String,
    val data: JsonElement
)

@Serializable
data class AgentStart(val runId: String)

@Serializable
data class AgentThinking(val delta: String)

@Serializable
data class AgentText(val delta: String)

@Serializable
data class AgentToolUse(val name: String, val input: JsonObject)

@Serializable
data class AgentToolResult(
    val name: String,
    val ok: Boolean = true,
    val output: String? = null,
    val error: String? = null
)

@Serializable
data class AgentDone(
    val steps: Int,
    val usedTools: List<String>,
    val durationMs: Long
)

@Serializable
data class AgentError(val message: String)

/* ============================================================
   API keys
   ============================================================ */

@Serializable
data class ApiProvider(
    val id: String,
    val label: String,
    val url: String,
    val model: String,
    val isActive: Boolean = false,
    val isBuiltIn: Boolean = false
)

@Serializable
data class ApiProviderList(
    val activeId: String? = null,
    val providers: List<ApiProvider>
)

@Serializable
data class CreateProviderRequest(
    val label: String,
    val url: String,
    val model: String,
    val key: String
)

@Serializable
data class UpdateProviderRequest(
    val label: String? = null,
    val url: String? = null,
    val model: String? = null,
    val key: String? = null,
    val isActive: Boolean? = null
)

/* ============================================================
   Share
   ============================================================ */

@Serializable
data class ShareRequest(val visibility: String = "public")

@Serializable
data class ShareResponse(val token: String, val url: String, val visibility: String = "public")

@Serializable
data class CaptchaCheck(val ok: Boolean, val token: String? = null, val message: String? = null)
