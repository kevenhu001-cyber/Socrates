// @ts-check
/**
 * Strip chat-template artifacts that some reasoning / instruct-tuned
 * models leak into the stream.
 *
 * Used by both the streaming doRender path and the final formatMsg
 * pass so the user never sees ..., ,
 * [INST]...[/INST], <s>, etc. as raw text — both in the live bubble
 * and in the final rendered output.
 */
/**
 * @param {string} t
 * @returns {string}
 */
export function stripChatArtifacts(t) {
  if (!t) return t;
  /* Multi-line blocks first: ... including any
     system-prompt body the model also leaked. Non-greedy so the first
      closes the block. */
  t = t.replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/g, '');
  /* Standalone chat-template tokens (angle-pipe-word-pipe-angle). */
  t = t.replace(/<\|[a-z_]+\|>/gi, '');
  /* Llama 1 / SentencePiece boundary tokens. */
  t = t.replace(/<\/?s>/g, '');
  /* Llama 2 chat format markers. */
  t = t.replace(/\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>/g, '');
  /* Tidy whitespace the strip left behind: drop trailing spaces
     before a newline, collapse 3+ consecutive newlines back to 2
     so we don't get big blank paragraphs in the rendered output. */
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return t;
}