// chat/socraticDirectives.ts — per-stage instruction strings used by
// buildSocraticMessages and buildFollowUpMessages. Keeping them in one
// place means stage names and their instructions never drift apart.

export function stageInstruction(stage: string): string {
  switch (stage) {
    case "motivate": return "Give motivation and context for why this concept matters. Do not define it yet.";
    case "define": return "Now give the precise definition and core development (8-20 paragraphs minimum, generally longer — verbose and descriptive, every term unpacked in plain words, every derivation step shown, no skipped work).";
    case "develop": return "Develop the concept in depth with worked examples.";
    case "illustrate": return "Provide 2-3 worked examples with progression.";
    case "exercise": return "Present a practice problem for the student to attempt.";
    case "check": return "Check understanding with a quick quiz, then move to the next sub-topic.";
    default: return "Advance the lesson one stage.";
  }
}

/* Shared "from basics" directive — used by all three prompt paths so
   the wording stays identical. The cold-start diagnostic only sets
   DEPTH (how detailed / how many examples); it never changes WHERE
   we start — we always begin from the most essential core definition.
   Reference: P_teaching-plan, P_level-consistency, P_knowledge-point. */
export const BASELINE_LEVEL = "baseline (not mastery) — depth cue only, always start from the core definition";

export function fromBasicsDirective(node: { status?: string } | null | undefined): string {
  const status = (node && node.status) || "unknown";
  return "CRITICAL — TWO PRINCIPLES YOU MUST FOLLOW FOR THIS SUB-TOPIC:\n" +
    "Principle 1 (DEPTH ONLY): The cold-start diagnostic for this sub-topic is '" + status +
      "'. This result tells you ONLY how detailed your explanation should be:\n" +
    "  - 'fuzzy' / 'internalized' (some familiarity): fewer examples (1-2), less scaffolding, faster pace, less repetition of basics.\n" +
    "  - 'blank' (no familiarity): more examples (3+), more analogies, more scaffolding, slower pace, more emphasis on definitions.\n" +
    "  The diagnostic does NOT mean the student has mastered anything.\n" +
    "Principle 2 (ALWAYS START FROM THE FOUNDATION): Regardless of the diagnostic result — fuzzy, blank, or skipped — " +
      "you MUST begin this sub-topic from the most essential, foundational core definition and build up layer by layer. " +
      "Never start from a mid-level detail, application, or shortcut. Never assume the student already knows the core definition " +
      "even if the diagnostic said 'fuzzy'.\n\n";
}
