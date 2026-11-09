# Reliable learning cards in Intelligence UI

Code inspection found competing generation grammars: the global learning prompt
required nested XML while the native UI accepted JSON/OpenUI without quiz,
question or knowledge-card nodes. Common model output therefore either missed a
renderer or lost fields in XML attributes. The legacy quiz parser also filtered
out unknown answer letters, so an invalid AC key could silently become A, accepted
duplicate/empty options, and treated multi="false" as a multi-choice flag. Ungraded
questions updated failed-attempt state. These are reproducible code risks; no
production generation-failure rate was measured.

New learning content uses one native format:

```json
{"version":1,"nodes":[{"id":"check","type":"learning","kind":"quiz","q":"Which number is even?","options":[{"letter":"A","text":"2","explanation":"Divisible by 2."},{"letter":"B","text":"3","explanation":"Odd."}],"correct":"A"}]}
```

The same node supports practice, definition, flashcard, example, theorem, proof,
derivation, key-point and step. These reuse existing shared learning components
and the existing grading, mistake-book, review, markdown and math adapters; no
parallel card design or grading system was introduced. The card bundle is lazy.

`packages/core/src/learningUi.js` owns normalization and field validation shared
by server, patches and browser history. Recognizable card/type/field aliases,
string option lists, letter-keyed option maps, wrapped item arrays, lower-case
keys and multi-key arrays are normalized deterministically. Correct answers are
never inferred from numeric indexes or answer text. Duplicate/empty options,
unknown answer letters, missing front/back, nontext content and incomplete
cards produce located errors. All omissions for the card are reported together
with a complete learning-specific repair example. Invented OpenUI learning
functions get this repair contract rather than chart payload advice.

The global learning policy and live tool schema now teach the same JSON grammar.
Default conversation still uses prose, without unsolicited quizzes or redundant
knowledge cards. Written-answer practice is reserved for an explicit request.
A quiz without an established rubric must explicitly declare graded:false and
omit its key; submission records the choice without inventing a verdict or
increasing failed attempts. Answers/explanations stay hidden until submission.
Streaming cards remain read-only until settled; malformed history cards retain
public readable content without exposing hidden solutions or removing healthy
siblings. Per-card error boundaries isolate unexpected renderer exceptions.
Unsafe or oversized documents still fail closed before history recovery.

Legacy XML remains readable. Duplicate/empty options now fall back safely; an
invalid key becomes wholly ungraded rather than a partially guessed rubric.
Empty knowledge/recall cards no longer mount blank shells. No database migration,
new dependency or deployment is required. Server and frontend should ship
together; roll back both to restore the previous schema/prompt. Universal App and
Android keep unknown fields and their existing generic tool-result fallback;
this native learning node renderer is added to the Vite baseline.
