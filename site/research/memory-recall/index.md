---
title: The route back to an idea
description: A study of why a changed prompt can surface a concept more reliably than a repeated answer.
canonical: https://topodrive.top/research/memory-recall/
last-updated: 2026-08-25
---

# The route back to an idea

> A study of why a changed prompt can surface a concept more reliably than a repeated answer.

*Sora Reyes · Memory co-author · 10 min · Aug 12, 2026*

## The question we kept seeing

Learners who asked the same question a second time, in different words, retained the answer more reliably than learners who saw it rephrased for them. The difference was small in any single session, but visible across weeks.

The observation surfaced in a place we were not looking for it. We had been reviewing retention data for a separate study on spaced repetition and noticed that learners who came back to a topic after a gap, and who *themselves* rephrased the original question rather than recognising the tutor's rephrased version, did better on the one-week recall prompt. The effect was small—about 4 percentage points in the first month we looked at it—and we almost dismissed it as noise. What kept us looking was that the effect was monotone across cohorts. Every subgroup we checked showed the same direction, and the magnitude grew as the rephrasings grew more substantively different from the original.

The naive explanation is that rephrasing is itself a form of retrieval practice, and the small lift is just the lift from retrieval. We tested that explanation directly and it is wrong. The lift from retrieval practice, in our data, is about 6 percentage points for a single rephrasing. The lift we were seeing was 17 percentage points for the "almost clear" subgroup—more than the lift retrieval alone could explain. The additional lift was coming from somewhere else.

The somewhere else, we eventually concluded, is that a rephrasing is not a single act. It is a small chain: the learner notices that they have forgotten the original framing, retrieves the idea well enough to put new words around it, and then tests those new words against the original idea for fit. Each step in the chain is a small act of construction, and each construction is, in the language of the literature, an *elaboration*. Elaborations are the most reliable route to durable retention that cognitive psychology has found. We were not getting the lift because the learner had rephrased. We were getting the lift because the learner had rephrased *and then tested the rephrase against the original*.

## What we changed

We changed two default behaviors:

1. When a learner asks the same question twice in a row, we now respond with a *different* shape rather than a *different* surface — for example, from a definition to a comparison, not from English to English.
2. We log the change in shape, not the change in wording, when measuring recall.

The first change is the more visible one. When a learner asks "what is the chain rule?" and then, three days later, asks "what is the chain rule?" again, the old tutor would respond with the same definition in slightly different English. The new tutor responds with a *comparison*: "here is the chain rule, and here is the product rule—what is the same, and what is different?" The shape of the response is different. The surface is also different, but that is incidental. The shape change is what matters.

We chose comparison as the first new shape for a specific reason. Comparison is one of the most reliable elaborative operations in the literature. When a learner is asked to say what is the same and what is different between two ideas, they are forced to identify the underlying features of each idea, because the comparison will only make sense if the features are explicit. A learner who can compare the chain rule to the product rule has, in effect, built a small model of both. A learner who can only re-state the chain rule has built a small surface for one.

The second change—logging the change in shape rather than the change in wording—was the one that made the measurement possible. Until we made this change, we had been measuring recall by counting word overlap between the original and the rephrased version. That metric is a measure of surface similarity, not of shape similarity. Two definitions that use different words have low surface similarity; a definition and a comparison have low surface similarity too. By the surface metric, we could not tell the difference between a re-shape and a re-word. Once we logged the change in shape, the effect became visible.

## What we saw

Three months in, the small-effect-size finding held across cohorts: rewrites that change the shape outperform rewrites that change the surface, on average by 11 percentage points on the recall prompt one week later. The cohort sizes are small enough that we do not yet treat this as a stable finding, but the direction has held in every subgroup.

The subgroups we have looked at are: subject (mathematics, programming, history, economics), prior session count (1–3, 4–10, 11+), self-reported confidence at the time of the original question (low, medium, high), and time-of-day of the original question. The shape-effect direction held in every subgroup. The magnitude varied: the smallest effect was in the high-confidence subgroup (7 percentage points) and the largest was in the medium-confidence subgroup (15 percentage points). The high-confidence subgroup is the one we expected to show the smallest effect, because a learner who is already confident has less to elaborate on. The medium-confidence subgroup is the one we expected to show the largest effect, because a learner who is "almost clear" has the most to gain from a small additional construction.

We did not expect the low-confidence subgroup to show only a 9-percentage-point effect. Our prior was that the low-confidence subgroup would benefit most, on the theory that they have the most to learn. The data says otherwise. The most plausible interpretation is that a learner who is at "low confidence" is not yet at the threshold where they can attempt a re-shape; the re-shape requires some minimum of confidence to attempt, and below that threshold the re-shape is not actually attempted, even when the tutor offers it. This is a hypothesis, not a finding. The next study will test it directly.

## Why we publish this

We publish these notes to make our decisions legible. If the tutor behaves a particular way during a session, there is usually a note here that explains why.

The decision to publish these notes is itself a product decision. We have learned that the learners who use Socrates longest, and who get the most out of it, are the learners who develop a working theory of how the tutor behaves. A learner who understands that the tutor will offer a comparison when they ask the same question twice is a learner who can use that knowledge to ask better questions. A learner who does not have that understanding is a learner who is occasionally surprised by the tutor's behaviour, and surprised learners ask fewer follow-up questions.

The notes are also how we hold ourselves accountable. A claim that the tutor behaves in a particular way is a claim that can be checked against a published note. If a note says "the tutor waits for the explanation to land before offering a follow-up" and a transcript shows the tutor interrupting, that is a bug we can find and fix. The notes are not just descriptions of intent; they are contracts.

A third reason to publish, which we came to value later: the notes are how we recruit. The kind of learner who reads research notes before choosing a tutor is, on average, the kind of learner who will use the tutor well. We do not write the notes to be a marketing surface, but we have learned that they function as one, and we are comfortable with that.

## What the data says

Across the six-week intervention, 184 learners completed at least one recall cycle in each condition:

| Prompt condition | One-week delayed recall |
| --- | --- |
| Verbatim re-ask | 41% |
| Re-framed prompt | 58% |
| Re-framed, "almost clear" ideas | 63% |

The gap between the first two rows is the average treatment effect; the "almost clear" subgroup is the one the product now designs around.

A note on what "verbatim re-ask" means in this table. The verbatim condition is the control: the tutor responds with the same definition in slightly different English, and the recall prompt one week later is scored for accuracy against the original answer. The 41% number is the recall rate in that condition. The re-framed condition is the treatment: the tutor responds with a comparison (or another shape change) instead of a re-worded definition, and the recall prompt is the same as in the control. The 58% number is the recall rate in that condition. The gap—17 percentage points—is the average treatment effect.

A note on the "almost clear" subgroup. This is the subset of learners whose self-reported confidence at the time of the original question was 3 or 4 on a 5-point scale. In the verbatim condition, their recall rate was 42%, almost identical to the control. In the re-framed condition, their recall rate was 63%, 21 percentage points higher. This is the subgroup that the product now designs around. When we talk about "shape change," we are usually talking about the shape change that works for this subgroup.

A note on the cohort. The 184 learners were recruited from active users who had completed at least three prior sessions and who had agreed to participate in recall studies. They were randomly assigned to one of the two conditions for the full six-week window. The recall prompt was sent at the end of the window. We did not measure retention at intermediate intervals; we measured it once.

## How we measured it

Both groups received identical review intervals and total review time; only the surface of the prompt differed. Retention used a delayed free-recall prompt scored blindly by two raters, controlling for subject, prior session count, and self-reported confidence. The effect held across every shape pair, with the smallest effect for surface-only rewording.

The free-recall prompt was a single sentence asking the learner to write down, in their own words, what the original answer had been. We deliberately did not give the learner any cues—no multiple-choice options, no fill-in-the-blank, no hint of the original wording. Free recall is the hardest form of retention test, and it is the one that most cleanly measures what the learner has actually constructed, as opposed to what they can recognise.

The two raters scored each response on a four-point rubric: 0 (no relevant content), 1 (some relevant content but the central idea is missing), 2 (the central idea is present but supporting detail is wrong or missing), 3 (the central idea is present and supporting detail is largely correct). A score of 2 or 3 counted as "recalled." The inter-rater κ was 0.78, which is acceptable for this kind of rubric.

The "shape pair" finding is one we want to call out. We tried four different shape changes: definition to comparison, definition to example, definition to worked-problem, and definition to contrast (definition paired with a near-neighbour that the learner was likely to confuse it with). Every shape change produced a positive effect over the verbatim control, but the magnitude varied. The largest effect was for comparison (17 percentage points), and the smallest was for surface-only rewording (4 percentage points). This is the cleanest evidence in our data that the *kind* of change matters more than the *amount* of change.

### Methodology timeline

1. **Recruit** — 184 active learners, balanced by subject and prior session count.
2. **Randomise** — Each learner assigned to verbatim or re-framed recall for the full window.
3. **Measure** — Delayed free-recall at one week, scored blindly by two raters (κ = 0.78).
4. **Replicate** — Four-week follow-up scheduled for September 2026 with same protocol.

A note on what we did *not* measure. We did not measure the learner's subjective experience of the re-framed prompt. We do not know whether learners found the comparison more helpful, more confusing, more interesting, or more off-putting than the verbatim re-ask. The next study will include a short subjective-experience instrument.

## Coming next

> **When a clear explanation becomes evidence.** If a re-framed recall is the *route* back, what happens when a learner has to articulate the idea in their own words first? The next note examines three years of "explain it back" data.

## Open questions

Whether the effect survives to one month; whether it holds under time pressure; and whether confident learners still benefit, or re-framing mostly helps the "almost clear" middle. A four-week follow-up is planned for September.

A fourth open question: does the shape effect depend on the kind of shape? We have data on comparison, example, worked-problem, and contrast. We do not have data on analogy, on counter-example, or on a shape we have not yet named. The literature suggests that analogy is a particularly strong elaborative operation, especially for abstract ideas, but we have not yet measured it.

A fifth open question, which we have begun to think about: does the shape effect compound across multiple recall cycles? A learner who re-shapes once and then re-shapes again, with a different shape, might do better than a learner who re-shapes once and then is re-tested verbatim. Or the second re-shape might interfere with the first. We do not yet know.

## Related reading

- [Explanation · When a clear explanation becomes evidence](https://topodrive.top/research/explanation-evidence/)
- [Practice · What learners keep after a session](https://topodrive.top/research/what-learners-keep/)

## References

1. Karpicke, J. D., & Roediger, H. L. (2008). The critical importance of retrieval for learning. *Science*, 319(5865), 966–968.
2. Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science*, 17(3), 249–255.
3. Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin*, 132(3), 354–380.
4. Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest*, 14(1), 4–58.

[Read on the site](https://topodrive.top/research/memory-recall/)
