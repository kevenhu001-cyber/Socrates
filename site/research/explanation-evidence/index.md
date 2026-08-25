---
title: When a clear explanation becomes evidence
description: Three years of A/B data on "explain this in your own words" prompts.
canonical: https://topodrive.top/research/explanation-evidence/
last-updated: 2026-08-25
---

# When a clear explanation becomes evidence

> Three years of A/B data on "explain this in your own words" prompts.

*Mira Mendel · Explanation lead · 9 min · Jul 29, 2026*

## The "explain it back" prompt, three years on

Three years of A/B data on "explain this in your own words" prompts, both inside Socrates and in the broader literature, converge on the same result: the prompt works, but not for the reason most people assume. It does not primarily improve retention. It produces a *signal*.

The textbook version of this prompt goes back a long way. Ask a learner to put a freshly taught idea into their own words and the literature predicts a small-to-moderate lift in delayed recall. We have replicated that lift in our own data, and the size of the effect is consistent with what Chi, Rittle-Johnson, and the ICAP group have reported across decades of self-explanation studies. The replication is not the interesting part. What is interesting is what the prompt does *alongside* the lift: it writes down, in plain language, exactly which parts of the idea the learner can defend and which parts they are still carrying for the tutor.

When we first shipped the prompt in 2023, we treated it as a closure ritual. A learner explained an idea, the tutor thanked them, and we moved on. The lift on the next session's recall prompt was about 9 percentage points, which was encouraging but not dramatic. The thing we missed for the first eighteen months was that every explanation was quietly filing a complaint. A learner who could re-state the definition of gradient descent fluently but could not say why the learning rate mattered at the *boundary* between convergence and divergence was telling us, in their own words, that they had the surface and not the structure. We were not reading the complaint. We were measuring only whether they could reproduce the surface on demand.

The reframing came in late 2024, after we re-scored about 4,000 transcripts looking not at *what* the learner explained but at *where the explanation went vague*. The pattern was so consistent across subjects that we stopped treating it as noise and started treating it as the prompt's actual product. The "explain it back" prompt is, first and foremost, an instrument. It generates the most reliable diagnostic signal we have of what the learner has not yet assembled. The retention lift is a side effect.

This matters because the literature has been chasing the lift. Hundreds of self-explanation studies measure post-test scores and conclude that the technique "works." It does work, but the size of the effect depends almost entirely on what the learner is being asked to do *after* they explain. If they are simply asked to re-explain next week, the lift is small and noisy. If they are asked, in the moment of the seam, to commit to one of three follow-up framings, the lift becomes larger and more stable. The prompt is doing the same diagnostic work in both cases. The difference is what the tutor does with the diagnostic.

## What we see in the seam

The most common seam is the boundary condition. A learner will explain a definition with confidence, then hesitate at the first edge case. They will be precise about a formula, then vague about the moment when the formula stops applying. They will describe a method crisply, then reach for "and then you just…" at exactly the place where the method actually requires a judgment.

This pattern is hard to fake, and it is hard to recover from without help. We see it most clearly when the learner has tried to explain to an imagined audience—a friend, a younger student, a future version of themselves. The imagined audience does the work of compressing the idea, and the compression exposes the part that is still on loan from the previous answer.

A concrete example, anonymised from a programming session in March 2026: a learner was asked to explain list comprehensions in Python. Their first four sentences were textbook clean. They then tried to explain what happens when the comprehension is nested, and the sentence ended mid-thought with "…and then the inner one just… processes things." The inner comprehension does not "process things." It produces an iterable that the outer comprehension consumes, and the order in which those two are evaluated is the entire reason nested comprehensions are useful rather than merely cute. The learner knew the syntax. They did not have the model. The seam was at the exact point where the model would have to do work.

A second example, from a history session in November 2025: a learner was asked to explain why the Treaty of Westphalia is treated as a founding moment for the modern state system. They gave a fluent four-sentence summary, then said, "and after that, you basically have the idea of sovereignty as we understand it today." "Basically" and "as we understand it today" are doing an enormous amount of work in that sentence. They are hiding the entire interpretive question of *which* Westphalian settlement scholars are invoking when they make that claim, and whether the sovereignty they describe is the seventeenth-century juridical concept or the nineteenth-century statist one. The seam was not a vocabulary gap. It was a question the learner had not realised they were answering.

A third example, from a mathematics session in January 2026: a learner explained the chain rule fluently, then paused when asked where the rule stops applying. Their answer—"well, it works whenever you can differentiate the inside, I guess"—was technically defensible and almost entirely empty. The actual edge, the case where the outer function is not differentiable at the inner point, was the thing the learner could not see. The seam was at the boundary the rule does not reach.

Across the 1,847 episodes we logged between October 2025 and June 2026, the seam appeared in one of three shapes. About 41% of the time, it was a *boundary-condition* seam: the learner could describe the central case but not where the central case stopped applying. About 35% of the time, it was a *hedge* seam: the learner's explanation was fluent but saturated with hedges like "basically," "I guess," "kind of," and "or something," each of which marked a place where the model had not been built. About 24% of the time, it was a *step* seam: the learner could describe the start and the end of a procedure but could not justify one of the steps in the middle. All three shapes are diagnostic, and all three are recoverable—but only if the tutor is listening for them and only if the tutor waits for the explanation to land before intervening.

## What we tried next

For a year we have asked the tutor to listen for the seam and offer a follow-up question at exactly that point. The failure mode was instructive: the tutor sometimes inserted a follow-up too early, before the learner had time to find the gap themselves. The interruption felt like a quiz, not a conversation.

The exact failure looked like this. A learner would say something like "and then the algorithm sorts the list by…" and hesitate for a beat. The old tutor, eager to be helpful, would jump in with "do you mean it sorts by the pivot value, or by index?" The learner, who had been about to say "by the pivot value, because we are choosing a partition point," would be cut off and asked to choose between two options that did not yet feel like options to them. The follow-up was technically correct and pedagogically awful. It converted the seam from a moment of productive uncertainty into a multiple-choice question. The learner either guessed or asked the tutor to confirm what they had been about to say, and the diagnostic value of the explanation evaporated.

The current behaviour is closer to waiting. The tutor finishes the learner's explanation, marks the seam silently, and then offers one of three prompts: say it back to me in fewer words; give me an example where the idea almost fails; or explain it as if to someone who already knows the basics. All three are small re-framings of the same idea—compression, edge, transfer—and we are still measuring which of them moves retention most.

The waiting is the harder design choice. It is much easier to ship a tutor that asks a follow-up the moment it detects a hedge. It is much harder to ship a tutor that holds the follow-up in reserve until the explanation is done. The reason we hold it in reserve is that the seam is more reliable when the learner has reached it on their own. An explanation that ends with the learner catching the gap and naming it is worth several explanations that end with the tutor pointing at the gap from outside. The diagnostic value is in the catching.

There is a second reason to wait. When the tutor interrupts, it implicitly tells the learner that fluent language is the goal and hesitation is a problem. That is the wrong lesson. Hesitation at a seam is the *good* case. It is the moment where the model has to be built. A tutor that treats hesitation as a signal to act is, in effect, training the learner out of the very behaviour the tutor is supposed to be rewarding. We do not want a learner who produces smoother explanations. We want a learner who produces explanations that *find their own seams*.

The three prompts—compression, edge, transfer—are not arbitrary. They are the three framings we have seen learners use, unprompted, when they are asked to recover a half-formed idea. The compression prompt ("say it back to me in fewer words") is the one that forces the learner to discard a borrowed phrase and find their own. The edge prompt ("give me an example where the idea almost fails") is the one that surfaces the boundary condition the learner has been glossing. The transfer prompt ("explain it as if to someone who already knows the basics") is the one that lets the learner skip the surface and rebuild the model. We pick which of the three to offer based on which shape of seam we detected. We do not yet have a strong signal that one is better than the others, and the A/B comparison is the next thing we plan to publish.

## What we have stopped believing

We used to think that a longer explanation was a better explanation. The data no longer supports that. Learners whose explanations run on the shorter side, but who can re-shape the idea on demand, consistently outperform learners whose explanations are long and stable.

The old assumption was intuitive: a learner who can say more must know more. The data contradicts this cleanly. A long explanation is often the most efficient way to *hide* a seam, because the surrounding fluent text gives the tutor, the learner, and any observer enough material to mistake fluency for understanding. A short explanation, by contrast, has nowhere to hide. If the learner cannot find a clean way to say the idea in two sentences, the gap is visible. If they can, the gap is gone.

This is not a novel finding. The distinction between *fluency* and *mastery* has been a staple of instructional psychology since at least the 1970s. What is new, in our data, is the size of the gap. Learners whose explanations were short and re-shapable scored 74% on a two-week transfer task. Learners whose explanations were long and stable scored 52%. The 22-percentage-point gap is, by educational-intervention standards, very large. It is the gap we would expect between a method that works and a method that does not, not the gap between two variants of the same method.

The reason this matters for product design is that it reverses a default. The default in tutoring software, and in much educational practice, is to reward length. Longer essays are read as better essays. Longer explanations are read as better explanations. The instinct is human and well-meaning, and it is wrong. A tutor that praises length is teaching the learner to pad. A tutor that praises re-shapeability is teaching the learner to find and repair their own seams.

## What the data says

Between October 2025 and June 2026 we logged 1,847 explanation episodes in which the tutor asked a learner to re-shape an idea in their own words.

| Finding | Share |
| --- | --- |
| Seam detected before any probe | 61% |
| Short re-shape, strong transfer | 74% |
| Long stable re-statement | 52% |

Learners who produced a long, fluent, stable explanation did measurably worse on a two-week transfer task than learners whose explanations were shorter but could be re-shaped on demand.

A note on what "strong transfer" means in this table: it means the learner produced a short re-shape, then went on to solve a re-worded problem in an unseen context with no further help from the tutor. The unseen context is important. We did not measure whether the learner could solve the *same* problem; we measured whether they could solve a problem that shared the underlying structure but used different vocabulary, different numbers, and a different surface. That is the test of whether the model has actually been built. The learners who scored "strong transfer" were the ones whose explanations contained a real model, however compressed.

A note on the 61%: this is the share of episodes in which a seam was visible in the learner's explanation *before* the tutor asked any probe question. In other words, the seam was already in the transcript before we did anything. This is the number that changed our minds. The diagnostic is not something we have to extract from the learner with effort. The learner is already producing it. We just have to learn to read it.

A note on the cohort: the 1,847 episodes came from 612 unique learners across mathematics, programming, history, and economics. The pattern held across all four subjects. The largest absolute gap between short-reshapable and long-stable explanations was in mathematics (74% vs. 49%); the smallest was in history (74% vs. 55%). Programming and economics fell between. We do not yet know whether the smaller history gap reflects a genuinely smaller effect or a smaller sample within history. The history subgroup was the smallest of the four.

## How we measured it

Three coders marked sampled transcripts for boundary-condition vagueness, hedge phrases, and omitted edge cases (inter-rater agreement κ = 0.74). A seam is the first sentence where an explanation stops being specific. Transfer was measured with a delayed, re-worded problem in an unseen context.

The coding scheme was deliberately narrow. A sentence was marked as a seam only if all three of the following were true: (a) the sentence contained a hedge ("basically," "I guess," "kind of," "or something"), *or* the sentence was about a boundary condition and contained no specific example, *or* the sentence described a step in a procedure without justifying the step; (b) at least one of the three coders agreed; and (c) the sentence was not a request for clarification from the learner (we did not count "wait, what do you mean by X?" as a seam, because that is the learner catching the seam, not the seam itself). The inter-rater κ of 0.74 is on the lower end of what we usually see for transcript coding, which we attribute to the genuinely fuzzy boundary between "the learner is being imprecise on purpose" and "the learner is being imprecise because they have not built the model yet."

The transfer test was designed to be resistant to surface-matching. Each learner was given a problem in the same topic but with different numbers, different vocabulary, and a different surface presentation. The problem was scored on a four-point rubric by two raters blind to condition. A score of 3 or 4 counted as "strong transfer." The raters agreed on 81% of scores; disagreements were resolved by a third rater.

### Methodology timeline

1. **Sample** — Stratified sampling of explanation episodes from Oct 2025 – Jun 2026.
2. **Code** — Three independent coders marked seam locations and types.
3. **Transfer test** — Two-week delayed problem in an unseen context.
4. **Reconcile** — Disagreements resolved by a fourth reviewer.

A note on what we did *not* measure. We did not measure the learner's subjective experience of being asked to re-shape. We did not measure whether the learner thought the prompt was helpful or annoying. We did not measure whether the tutor's follow-up was perceived as warm or cold. Those measurements are in the next study. The current study is, intentionally, a measurement of *what the learner can do*, not of *how the learner felt about doing it*.

## Coming next

> **The value of an honest pause.** Learners often sense a seam the moment it forms, but rarely say so. The next note tracks how an *honest pause* — the courage to admit uncertainty — opens the next useful question.

## Open questions

We do not yet know whether the three follow-up prompts—compression, edge, transfer—work equally across subjects, or whether the seam signal degrades once learners learn the tutor's marking behaviour.

We also do not know whether the 22-percentage-point transfer gap holds at one month, or whether it is a two-week artefact. The four-week follow-up is on the calendar for September 2026.

A third open question is whether the prompt works for learners who are already strong at self-explanation. The current data over-represents learners who were assigned to "explain it back" because the tutor had detected early signals of a seam. We do not yet know whether prompting every learner to re-shape, including those who would not have produced a seam, produces a lift or just produces fatigue.

## Related reading

- [Memory · The route back to an idea](https://topodrive.top/research/memory-recall/)
- [Tutoring · When a tutor should say it is unsure](https://topodrive.top/research/tutor-curiosity/)

## References

1. Chi, M. T. H., de Leeuw, N., Chiu, M.-H., & LaVancher, C. (1994). Eliciting self-explanations improves understanding. *Cognitive Science*, 18(3), 439–477.
2. Chi, M. T. H., & Wylie, R. (2014). The ICAP framework: Linking cognitive engagement to active learning outcomes. *Educational Psychologist*, 49(4), 219–243.
3. Rittle-Johnson, B., Loehr, A. M., & Durkin, K. (2017). Promoting self-explanation to improve mathematics learning: A meta-analysis. *Educational Psychology Review*, 29(3), 599–625.
4. Mayer, R. E. (2004). Should there be a three-strikes rule against pure discovery learning? *American Psychologist*, 59(1), 14–19.

[Read on the site](https://topodrive.top/research/explanation-evidence/)
