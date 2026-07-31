/* Task 2.2 — short per-stage directive used by buildSocraticMessages
   and buildFollowUpMessages. Keeping it in one place means the
   stage names and their instructions never drift apart. */
export function stageInstruction(stage){
  switch(stage){
    case "motivate":   return "Give a short motivation and one concrete intuition. Do not define the concept yet.";
    case "define":     return "Give the precise definition and only the essential first derivation. Build on the motivation already shown.";
    case "develop":    return "Add the next layer of the concept and at most one worked example. Do not restart from the definition.";
    case "illustrate": return "Give at most two worked examples with clear progression. Do not repeat the preceding exposition.";
    case "exercise":   return "Give exactly one transfer practice problem and wait for the student's attempt.";
    case "check":      return "Give brief feedback and exactly one short quiz. Do not add another example or practice problem.";
    default:           return "Advance the lesson by one focused step.";
  }
}

/* Shared "from basics" directive — used by all three prompt paths so
   the wording stays identical. The cold-start diagnostic only sets
   DEPTH (how detailed / how many examples); it never changes WHERE
   we start — we always begin from the most essential core definition.
   Reference: P_teaching-plan, P_level-consistency, P_knowledge-point. */
export var BASELINE_LEVEL = "baseline (not mastery) — depth cue only, always start from the core definition";

export function fromBasicsDirective(node, opts){
  var status=(node&&node.status)||"unknown";
  var continuation=!!(opts&&opts.continuation);
  if(continuation){
    return "FOUNDATION ANCHOR FOR THIS FOLLOW-UP:\n"+
      "The core definition has already been introduced in the conversation. Refer back to it in at most one sentence when it helps, but do not restate the definition, derivation, examples, or summary. Only revisit the foundation in detail if the student's answer shows a specific misconception.\n\n";
  }
  return "CRITICAL — TWO PRINCIPLES YOU MUST FOLLOW FOR THIS SUB-TOPIC:\n"+
    "Principle 1 (DEPTH ONLY): The cold-start diagnostic for this sub-topic is '"+status+
      "'. This result tells you ONLY how detailed your explanation should be:\n"+
    "  - 'fuzzy' / 'internalized' (some familiarity): fewer examples (1-2), less scaffolding, faster pace, less repetition of basics.\n"+
    "  - 'blank' (no familiarity): more examples (3+), more analogies, more scaffolding, slower pace, more emphasis on definitions.\n"+
    "  The diagnostic does NOT mean the student has mastered anything.\n"+
    "Principle 2 (ALWAYS START FROM THE FOUNDATION): Regardless of the diagnostic result — fuzzy, blank, or skipped — "+
      "you MUST begin this sub-topic from the most essential, foundational core definition and build up layer by layer. "+
      "Never start from a mid-level detail, application, or shortcut. Never assume the student already knows the core definition "+
      "even if the diagnostic said 'fuzzy'.\n\n";
}

/* Per-turn output limits. The long textbook prompt remains useful for
   precision, but its generic depth rules must not force every stage to
   regenerate the same lesson. This directive is appended after the generic
   prompt so the current stage and conversation history win. */
export function tutorTurnDirective(stage, isFirst){
  var opening=isFirst
    ? "This is the opening turn for the current sub-topic."
    : "This is a continuation turn. The student has already seen earlier material in the conversation.";
  var scope;
  switch(stage){
    case "motivate":
      scope="Use 2-4 focused paragraphs, one concrete intuition, and no more than one closing question. Do not emit example, practice, or quiz scaffolds yet.";
      break;
    case "define":
      scope="Use 3-5 focused paragraphs and at most one definition or key-point scaffold. Do not repeat the motivation or previously established foundation.";
      break;
    case "develop":
      scope="Use 3-6 focused paragraphs and at most one example scaffold. Add new reasoning only; do not replay earlier examples or conclusions.";
      break;
    case "illustrate":
      scope="Use at most two example scaffolds in this turn. Keep the surrounding explanation brief and do not restate the whole lesson.";
      break;
    case "exercise":
      scope="Use 1-2 short setup paragraphs and exactly one practice scaffold. Stop after presenting it and wait for the student's attempt.";
      break;
    case "check":
      scope="Keep the response concise. Give brief feedback and exactly one quiz scaffold, with no new example or practice scaffold.";
      break;
    default:
      scope="Keep this turn focused on one new idea and avoid repeating material already visible in the conversation.";
  }
  return "TURN-SCOPE RULES. These rules override generic textbook length defaults above. "+opening+" "+scope+
    " Never pad with synonyms, repeated definitions, repeated derivation steps, or a second conclusion. Every paragraph must add new information.";
}
