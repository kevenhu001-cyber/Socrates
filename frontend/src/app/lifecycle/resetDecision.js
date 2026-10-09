/** Keep the reset confirmation rule separate from its side effects. */
export function shouldConfirmReset({
  examWasOpen,
  examTopic,
  examQuestions,
  examSubmitted,
  topic,
  knowledgeNodes,
  messages,
  confirmActiveSession,
  chatStreaming,
}) {
  const examIsDirty = Boolean(examWasOpen)
    || (typeof examTopic === 'string' && examTopic.length > 0
      && Array.isArray(examQuestions) && examQuestions.length > 0)
    || Boolean(examSubmitted);
  const hasActiveSession = Boolean(topic)
    || (Array.isArray(knowledgeNodes) && knowledgeNodes.length > 0)
    || (Array.isArray(messages) && messages.length > 0);
  return examIsDirty || (hasActiveSession && (confirmActiveSession || chatStreaming));
}
