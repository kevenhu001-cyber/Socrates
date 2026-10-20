package com.socrates.android.data

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ChatWireTest {
    @Test fun attachmentMatchesRequiredServerFieldsAndRetainsDurableReference() {
        val a = ChatWire.attachment("私有文档.pdf", "application/pdf", 1234, "file-id", "正文")
        assertTrue(a.getString("id").isNotBlank())
        assertEquals("document", a.getString("kind")); assertEquals("application/pdf", a.getString("mime"))
        assertEquals(1234L, a.getLong("size")); assertEquals("file-id", a.getString("fileId"))
        assertEquals("正文", a.getString("text"))
    }
    @Test fun overLimitInlineImageIsOmittedButDurableFileIsPreserved() {
        val a = ChatWire.attachment("image", "image/png", 2_000_001, "durable", dataUrl = "x".repeat(2_000_001))
        assertFalse(a.has("dataUrl")); assertEquals("durable", a.getString("fileId"))
    }
    @Test fun messagePreservesUnknownFieldsAndDoesNotMutateInput() {
        val raw = JSONObject().put("clientId", "stable").put("toolCalls", JSONArray().put(JSONObject().put("id", "tool"))).put("future", JSONObject().put("x", 1))
        val result = ChatWire.message(ChatMessage(id = "server-id", role = "assistant", content = "new", wire = raw))
        assertEquals("stable", result.getString("clientId")); assertEquals(1, result.getJSONObject("future").getInt("x"))
        assertEquals("new", result.getString("rawText")); assertFalse(raw.has("rawText"))
        assertEquals(1, result.getJSONArray("toolCalls").length())
    }
    @Test fun oldInlineThinkingMessagesHydrateIntoPrivateReasoningAndVisibleOffsets() {
        val raw = "Before <think>secret thought</think> after"
        val wire = JSONObject().put("id", "assistant").put("role", "assistant").put("rawText", raw)
            .put("toolCalls", JSONArray().put(JSONObject().put("id", "tool").put("name", "search").put("textOffset", raw.indexOf("after"))))
        val hydrated = ChatWire.hydrateMessage(wire)
        assertEquals("Before  after", hydrated.content)
        assertEquals("secret thought", hydrated.reasoning)
        assertFalse(hydrated.content.contains("secret"))
        assertEquals("Before  ".length, hydrated.wire!!.getJSONArray("toolCalls").getJSONObject(0).getInt("textOffset"))
        assertEquals(raw, wire.getString("rawText"))
    }
    @Test fun plainAndMultimodalContentRemainGeneral() {
        assertEquals("任意内容", ChatWire.content(ChatMessage(role = "user", content = "任意内容")))
        val raw = JSONObject().put("attachments", JSONArray().put(ChatWire.attachment("图", "image/png", 1, dataUrl = "data:image/png;base64,QQ==")))
        val parts = ChatWire.content(ChatMessage(role = "user", content = "解释", wire = raw)) as JSONArray
        assertEquals("解释", parts.getJSONObject(0).getString("text")); assertEquals("image_url", parts.getJSONObject(1).getString("type"))
    }
    @Test fun branchRekeysMessagesRetainsContextAndDoesNotModifySource() {
        val user = ChatMessage(id = "u", role = "user", content = "hello", wire = JSONObject().put("id", "u").put("clientId", "client").put("turnRuntime", JSONObject()))
        val answer = ChatMessage(id = "a", role = "assistant", content = "answer")
        val source = ChatSession(id = "source", title = "title", messages = listOf(user, answer), wire = JSONObject().put("projectId", "project").put("assistantId", "assistant").put("streamingText", "stale"))
        val fork = ChatWire.branch(source, "u")
        assertNotEquals(source.id, fork.id); assertEquals(1, fork.messages.size); assertNotEquals("u", fork.messages[0].id)
        assertEquals("project", fork.wire!!.getString("projectId")); assertEquals("source", fork.wire.getJSONObject("branchedFrom").getString("sessionId"))
        assertFalse(fork.wire.has("streamingText")); assertFalse(fork.messages[0].wire!!.has("clientId")); assertTrue(user.wire!!.has("clientId"))
    }
    @Test fun regenerateTargetsOnlyThePrecedingUserTurn() {
        val rows = listOf(ChatMessage(id = "u1", role = "user", content = "first"), ChatMessage(id = "a1", role = "assistant", content = "one"), ChatMessage(id = "u2", role = "user", content = "second"))
        assertEquals("u1", ChatWire.userAnchor(rows, "a1")?.id); assertNull(ChatWire.userAnchor(rows, "missing"))
    }
    @Test fun toolEventsMergeByIdAndCompleteWithStructuredResults() {
        val history = ToolHistory()
        assertFalse(history.accept(ChatActivity("agent", JSONObject().put("id", "agent"))))
        assertTrue(history.accept(ChatActivity("tool_call_delta", JSONObject().put("index", 0).put("arguments", "{\"q\":\"test\"}"))))
        history.accept(ChatActivity("tool_use", JSONObject().put("index", 0).put("id", "t").put("name", "web_search").put("input", JSONObject().put("q", "test"))))
        history.accept(ChatActivity("tool_result", JSONObject().put("id", "t").put("ok", true).put("output", JSONObject().put("count", 2)).put("artifacts", JSONArray().put("file"))))
        val calls = history.snapshot().getJSONArray("toolCalls")
        assertEquals(1, calls.length()); val call = calls.getJSONObject(0)
        assertEquals("t", call.getString("id")); assertEquals("completed", call.getString("progressPhase")); assertFalse(call.getBoolean("isError"))
        assertEquals("file", call.getJSONArray("artifacts").getJSONObject(0).getString("id")); assertEquals(2, JSONObject(call.getString("output")).getInt("count"))
    }
    @Test fun toolFailureAndSnapshotAreStable() {
        val h = ToolHistory(); h.accept(ChatActivity("tool_result", JSONObject().put("id", "failed").put("ok", false).put("errorText", "denied")))
        val snapshot = h.snapshot(); snapshot.getJSONArray("toolCalls").getJSONObject(0).put("name", "mutated")
        val call = h.snapshot().getJSONArray("toolCalls").getJSONObject(0)
        assertTrue(call.getBoolean("isError")); assertNotEquals("mutated", call.getString("name")); assertEquals("denied", call.getString("errorText"))
    }
    @Test fun toolProgressApprovalAndPublicSummaryRemainStructured() {
        val history = ToolHistory()
        history.accept(ChatActivity("tool_use", JSONObject().put("id", "t").put("name", "workspace").put("textOffset", 4)))
        history.accept(ChatActivity("tool_approval", JSONObject().put("toolCallId", "t").put("runId", "run").put("approvalId", "approval").put("status", "pending")))
        history.accept(ChatActivity("public_reasoning_summary", JSONObject().put("text", "Public summary")))
        val snapshot = history.snapshot()
        val call = snapshot.getJSONArray("toolCalls").getJSONObject(0)
        assertEquals("awaiting_approval", call.getString("progressPhase"))
        assertEquals("approval", call.getJSONObject("approval").getString("approvalId"))
        assertEquals(4, call.getInt("textOffset"))
        assertEquals("Public summary", snapshot.getString("publicReasoningSummary"))
    }
    @Test fun toolOffsetsAreRebasedWhenAThinkTagCompletesAfterTheEvent() {
        val history = ToolHistory()
        val offset = "Before <thi".length
        history.accept(ChatActivity("tool_use", JSONObject().put("id", "t").put("name", "search").put("textOffset", offset)))
        assertEquals(offset, history.snapshot().getJSONArray("toolCalls").getJSONObject(0).getInt("textOffset"))
        val completedRawText = "Before <think>private</think> answer"
        assertEquals("Before ".length, history.snapshot(completedRawText).getJSONArray("toolCalls").getJSONObject(0).getInt("textOffset"))
    }
    @Test fun pendingApprovalResultIsNotRenderedAsFailure() {
        val history = ToolHistory()
        history.accept(ChatActivity("tool_use", JSONObject().put("id", "t").put("name", "workspace")))
        history.accept(ChatActivity("tool_result", JSONObject().put("id", "t").put("ok", false).put("status", "awaiting_approval")
            .put("approval", JSONObject().put("approvalId", "approval-1").put("status", "pending"))))
        val call = history.snapshot().getJSONArray("toolCalls").getJSONObject(0)
        assertEquals("awaiting_approval", call.getString("progressPhase"))
        assertFalse(call.getBoolean("isError"))
    }
}
