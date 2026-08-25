---
title: When a tutor should say it is unsure
description: On the conditions under which a model admitting uncertainty is more useful than a fluent guess.
canonical: https://topodrive.top/research/tutor-curiosity/
last-updated: 2026-08-25
---

# When a tutor should say it is unsure

> On the conditions under which a model admitting uncertainty is more useful than a fluent guess.

*Jules Laurent · Tutoring lead · 10 min · May 14, 2026*

## The problem with a smooth answer

A fluent sentence is a bad signal when the answer is uncertain. Learners cannot tell the difference between a confident answer and a confident-sounding answer. The model can — it has access to its own uncertainty — but it usually chooses to ignore the signal because the alternative is a less readable reply.

The cost is large: a confident-sounding guess, repeated, becomes a misconception that the learner has to unlearn later.

This is one of the oldest problems in tutoring, and it predates the existence of language models. Human tutors face the same pressure: a confident-sounding answer is more readable than a hedged answer, and the learner is happier in the moment. The tutor who hedges looks uncertain, and an uncertain tutor is a tutor the learner is less likely to come back to. The tutor who does not hedge is, in many cases, the tutor who is doing the learner a disservice.

The reason this problem is sharper for a model is that the model can be *consistently* confident-sounding, in a way that no human tutor can. A human tutor who is uncertain shows it in their face, in their pace, in the small hedges that human speech naturally produces. A model produces clean text, and clean text reads as confidence, and confidence reads as knowledge. The model's uncertainty is invisible to the learner unless the model chooses to surface it.

We spent the first year of Socrates shipping the tutor without explicit uncertainty handling, and we saw the cost in the transcripts. A learner would ask a question at the edge of the tutor's competence—say, the exact circumstances under which a particular theorem fails—and the tutor would respond with a fluent paragraph that confidently asserted a slightly wrong edge case. The learner, having no way to know that the edge case was wrong, would incorporate it into their model. Two sessions later, when the learner encountered the real edge case, they would have to unlearn the wrong one. The unlearning is expensive. The original misconception is what is cheap to produce and what we were producing too much of.

## Three ways to make uncertainty useful

We have been testing three patterns for admitting uncertainty in ways that *help* the learner:

1. **Honest pause.** The tutor says "I'm not certain — let me think about this for a moment, then I'll tell you what I would guess."
2. **Show the boundary.** The tutor states what it is sure about, then states the boundary condition where it stops being sure.
3. **Ask the user.** The tutor asks the learner what they have tried, and uses that as evidence.

Each pattern is a different way of converting the model's internal uncertainty into something the learner can act on. The honest pause converts uncertainty into *time*: the learner gets a moment to consider whether they, too, are uncertain, and the tutor gets a moment to think. The boundary statement converts uncertainty into *epistemic structure*: the learner is shown, in plain language, where the model's knowledge ends and its guesswork begins. The ask-the-user pattern converts uncertainty into *collaboration*: the tutor treats the learner as a source of evidence rather than a recipient of answers.

The three patterns are not mutually exclusive. In a single difficult session, a tutor might honestly pause, then state the boundary, then ask the user what they have already ruled out. We have found that the order matters: the honest pause should come first, because it buys the model the time it needs to actually consider the boundary. The boundary statement should come second, because it is most useful after the model has had time to think. The ask-the-user should come last, because it is most useful after the learner has seen the boundary and can now contribute more pointedly.

## What we saw

In a small internal study, honest-pause moments were followed by a sharper question than fluent-confidence moments in 68% of cases. The cases where honest pause *hurt* were when the learner's question was simple and well-defined — there, the pause felt like a stall.

The current behavior is a hybrid: short pause for simple questions, longer pause for difficult ones.

The hybrid is what we ship, but it is not what we would design if we had unlimited engineering time. The hybrid is a heuristic: if the question is a factual lookup (a date, a definition, a formula), the tutor skips the pause entirely. If the question is a worked problem at the learner's current level, the tutor uses a 0.5-second pause. If the question is at the edge of the tutor's competence or at the edge of the topic's structure, the tutor uses a 2.5-second pause. The thresholds are empirical and were tuned against a held-out set of 200 transcripts in March 2026.

The case where honest pause *hurt* is worth describing in detail. A learner asks "what is the capital of France?" The tutor pauses. The learner, who did not need the tutor to think, is left waiting. The pause reads as either confusion or delay, neither of which is what the learner needed. The lesson is that uncertainty admission is not free. It has a social cost, and the cost is only worth paying when the benefit is real. A tutor that pauses on every question is, in effect, telling the learner that every question is difficult, and that is a miscalibration.

The case where honest pause helped the most is also worth describing. A learner asks "is it ever correct to use a for-comprehension in Scala with a side effect?" This is a question at the edge of the topic. The tutor pauses. The learner, who had been bracing for an unqualified "no, never," is given a moment to consider their own view. The tutor then responds: "I think the community consensus is no, but the boundary is fuzzy and there are some cases where it is used—let me describe the cases I have seen, and you can tell me whether they fit what you are doing." The pause converted what would have been a flat assertion into a small negotiation, and the negotiation produced a more useful answer.

## What the data says

The 62 reviewed sessions produced 214 answer episodes where a factual error was possible:

| Condition | Outcome |
| --- | --- |
| Error caught, boundary named | 61% |
| Error caught, no boundary | 27% |
| Useful follow-up, boundary + next step | 64% |

Naming a boundary and stopping stalled sessions; naming a boundary and attaching a next step produced the follow-up questions that make tutoring useful.

A note on "error caught." This is the rate at which the tutor, in the reviewed sessions, actually noticed its own error and corrected it. The reviewed sessions are a stratified sample of production transcripts from February 2026. The error rate in the sampled sessions was 14%, which is consistent with what we see in our regular quality audits. "Error caught, boundary named" means the tutor caught the error and named the boundary condition that produced it. "Error caught, no boundary" means the tutor caught the error but did not name the boundary. The gap between 61% and 27% is the value of the boundary statement: catching an error without naming the boundary produces a small lift in learner outcomes; catching an error and naming the boundary produces a much larger lift.

A note on "useful follow-up, boundary + next step." This is the share of cases in which the learner, after the tutor's response, sent a follow-up question that was on-topic and that built on the tutor's prior message. The follow-up is what we are, in the end, optimising for. A tutoring session that produces follow-up questions is a session that is doing its job. A tutoring session that produces silence is a session that is not. The 64% number is the highest of the three, and it is the one that justifies the design choice to attach a next step whenever a boundary is named.

The "boundary + next step" finding is one we did not expect to be so clean. We had expected the next step to be a small additional lift, on top of the lift from the boundary statement. We did not expect the next step to be a large additional lift, on the order of 37 percentage points over the boundary-only condition. The most plausible interpretation is that a next step gives the learner something to *do*, and "something to do" is the prerequisite for a follow-up question. A learner who has been told where the tutor's knowledge ends, but who has not been told what to try next, is a learner who has to invent the next move. A learner who has been told where the knowledge ends *and* what to try next is a learner who has been handed the next move.

## How we measured it

Anonymised sessions from February 2026 logs across mathematics, programming, and history, coded by two reviewers with a third resolving disagreements. The pattern held in all three subjects, with the largest effect in programming.

The largest effect in programming is, on reflection, unsurprising. Programming is the subject in which the boundary conditions are most clearly defined and most often wrong. A learner who is learning about, say, Python's GIL, or JavaScript's event loop, or Rust's borrow checker, is a learner who is encountering precise boundaries that the model can easily fudge. The fudging reads as confidence, and the confidence reads as knowledge, and the learner ends up with a wrong model that is hard to dislodge. The boundary statement is, in programming, the most valuable single intervention we have.

The pattern also held in history, which surprised us. We had expected history to be the subject in which boundary statements would be least useful, because history is the subject in which most "facts" are actually interpretations. The data says otherwise. Learners who received a boundary statement in a history session produced useful follow-up questions at almost the same rate as learners in programming. The most plausible interpretation is that boundary statements are useful not because they tell the learner where the truth ends, but because they tell the learner where the *model's* certainty ends. The latter is useful in every subject, even subjects in which the underlying truth is fuzzy.

### Methodology timeline

1. **Sample** — Sessions from Feb 2026 production logs across math, programming, history.
2. **Anonymise** — Personal identifiers removed before coding.
3. **Code** — Two reviewers independently mark boundary, next step, and error catches.
4. **Reconcile** — Disagreements resolved by a third reviewer; result holds across subjects.

A note on the size of the reviewer pool. We used the same three reviewers across the entire study. Each reviewer saw every session. The inter-rater κ was 0.79, which is acceptable for this kind of coding. The lower κ is in part a reflection of the genuinely fuzzy boundary between "the tutor named a boundary" and "the tutor named something that could be interpreted as a boundary." We revised the rubric mid-study to require the boundary to be in a specific syntactic form ("the boundary is," "this stops working when," "I'm not sure about"), which raised the κ to 0.84 in the second half of the study.

## Coming next

> **Back to the research index.** This series closes on an open question — the right *amount* of boundary-marking. We will keep tracking long-term trust and return visits, and publish all results quarterly, including the negative ones.

## Open questions

How much boundary-marking is too much? Whether learners come to trust a frequently uncertain tutor over a longer horizon. And whether model-calibrated or tutor-selected uncertainty matters more—which boundaries to name may matter more than how to phrase them.

The "how much is too much" question is the one we are most worried about. A tutor that names a boundary on every answer is, in effect, a tutor that does not commit to anything. The learner, who came for answers, gets hedges. The hedges are accurate but they are not what the learner wanted. The current production behaviour is to name a boundary only when the model's calibrated uncertainty exceeds a threshold; the threshold is tuned, but it is not principled, and we are aware that we are optimising against a moving target.

The long-term trust question is the one we have least data on. We have some evidence that learners who encounter frequent boundary statements in their first month have higher retention at six months, on the theory that they have built a more accurate model of what the tutor does and does not know. We do not yet know whether that higher retention translates into higher return visits. The next study will measure return visits as a primary outcome.

The calibrated-versus-selected question is the one we have argued about most internally. Model-calibrated uncertainty is the number the model already has—it is the probability the model assigns to its own answer. Tutor-selected uncertainty is the human-curated set of boundaries that the model is told to name. Our current production system is a blend: the model is allowed to name any boundary its calibrated uncertainty exceeds the threshold for, but there is also a small set of boundaries that the system always names, regardless of calibration (the GIL example above is one of these). The blend is pragmatic. We do not yet know whether either pure strategy would be better.

A fourth open question, which we have not yet begun to study: does the value of the boundary statement depend on the learner's prior relationship with the tutor? A learner who has had ten sessions with the tutor may interpret a boundary statement as "the tutor is being careful," while a learner in their first session may interpret the same statement as "the tutor does not know." The framing matters, and we do not yet have data on how to frame.

## Related reading

- [Practice · What learners keep after a session](https://topodrive.top/research/what-learners-keep/)
- [Practice · The value of an honest pause](https://topodrive.top/research/honest-pause/)

## References

1. Graesser, A. C., Person, N., & Magliano, J. (1995). Collaborative dialogue patterns in naturalistic one-to-one tutoring. *Applied Cognitive Psychology*, 9(6), 495–522.
2. Aleven, V., & Koedinger, K. R. (2002). An effective metacognitive strategy: Learning by doing and explaining with a computer-based Cognitive Tutor. *Cognition and Instruction*, 20(2), 181–238.
3. Lichtenstein, S., Fischhoff, B., & Phillips, L. D. (1982). Calibration of probabilities: The state of the art to 1980. In *Judgment under Uncertainty* (pp. 306–334). Cambridge University Press.
4. Koriat, A. (1997). Monitoring one's own knowledge during study. *Journal of Experimental Psychology: LMC*, 23(1), 132–147.

[Read on the site](https://topodrive.top/research/tutor-curiosity/)
