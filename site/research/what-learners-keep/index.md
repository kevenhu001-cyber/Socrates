---
title: What learners keep after a session
description: A small study on the parts of a conversation that people actually revisit a week later.
canonical: https://topodrive.top/research/what-learners-keep/
last-updated: 2026-08-25
---

# What learners keep after a session

> A small study on the parts of a conversation that people actually revisit a week later.

*Rin Park · Practice co-author · 9 min · Apr 30, 2026*

## How we ran the study

We asked a small group of active learners to opt in to a one-week follow-up. We collected two numbers: how many sessions they had started in the window, and how many times they had revisited a *specific* moment in a session. We chose "revisit" because it is a behavioral signal: the learner explicitly asked the tutor to bring something back.

The choice of "revisit" as the primary signal was deliberate. A learner who voluntarily opens a session from a week ago and asks the tutor to bring back a specific moment is a learner who has, on some level, decided that moment was worth their time. A learner who merely recognises the moment when prompted is a learner who has not made that decision. The first is a measure of what the learner *keeps*; the second is a measure of what the learner *has*. The two are not the same, and the difference matters for what we are trying to learn.

A second design choice was the opt-in. We did not want to recruit a random sample of all learners; we wanted learners who were willing to be re-contacted a week after a session and who were willing to spend ten minutes on a follow-up form. The opt-in is a bias, and we are explicit about it: the cohort over-represents active learners, and the effects we report are, if anything, larger than they would be in an unselected sample. We accept the bias because the alternative—random sampling—would have produced a sample with too few revisits to measure.

A third design choice was the form. We sent three questions, not one: *which moment from the session do you remember most*, *which moment, if any, has changed how you think about the topic*, and *is there anything from the session that surprised you*. The three questions are not the same question. The first asks for salience. The second asks for transfer. The third asks for surprise. We wanted all three because we did not yet know which would produce the cleanest signal, and we did not want to commit to one before we had data.

## What got remembered

Three patterns held across the cohort:

1. **Seams got revisited.** A seam — the moment where the learner's explanation became vague — was the most-revisited kind of moment.
2. **Definitional answers rarely did.** A definition that read cleanly got skipped on revisit.
3. **Comparisons did.** "Compare X and Y" prompts were revisited more often than definition-style prompts of similar length.

The first pattern is the one that changed our behaviour. We had assumed, going into the study, that the moments learners would revisit would be the moments they had explicitly asked to remember—moments where the tutor had prompted them to save something to their mistake book. The data says otherwise. The moments learners revisited were the moments where the learner had produced a half-formed explanation and then watched the tutor repair it. The mistake book, in other words, was capturing the wrong things. The moments worth capturing were not the moments the tutor had marked; they were the moments the tutor had repaired.

This is a different theory of what a "mistake book" is for. The traditional theory is that a mistake book is a record of errors, a list of things to avoid. The data says the mistake book is, more usefully, a record of *seams*, a list of places where the learner's model was thin and the tutor's repair was diagnostic. A seam is not an error. It is a place where an error could have formed and didn't, because the tutor caught the gap. Those are the moments the learner revisits.

A concrete example, from a session in March 2026: a learner was working through a problem about recursion in Python. They wrote a recursive function that returned the wrong value for the base case. The tutor did not point out the error; instead, the tutor said, "what does your function return when n is 0?" The learner paused, said "uh, it returns n, which is 0," and then said, "oh, but 0 is not the right base value here, is it." The tutor said, "what would the right base value be?" The learner said "1, because we're counting down from n to 1." The tutor said "yes." The whole exchange took 90 seconds. A week later, the learner revisited that exact 90 seconds and asked the tutor to bring back the moment.

What the learner was not revisiting was the polished explanation that came after—the tutor's clean walk-through of the corrected recursive function, which took about four minutes and which the learner would, in any other context, have read as the "useful" part of the session. The 90-second seam was more useful to the learner than the four-minute repair, and the learner knew it. We did not know it until we asked.

The second pattern—definitional answers rarely revisited—is the one we found most counter-intuitive. A definition that read cleanly should, on the standard theory of memory, be the most memorable kind of content: it is compact, it is well-structured, and it does not require the learner to do any work to interpret it. The data says otherwise. Definitions that read cleanly were the moments the learner skipped on revisit. The most plausible interpretation is that a clean definition has been fully absorbed at the moment of reading, and there is nothing left for the learner to do when they revisit it. A seam, by contrast, is unresolved, and revisiting it is an opportunity to do the resolution.

The third pattern—comparisons revisited more than definitions—is the one that connects most directly to the shape-change finding in the memory-recall note. A comparison prompt ("compare X and Y") is a small structural intervention that requires the learner to elaborate. The elaboration is what makes the moment worth revisiting.

## What we changed

The default behavior of the tutor now treats seams — not definitions — as the moments worth saving. The mistake book collects them by default.

The change was a single line in the tutor's session-end routine. Before the change, the tutor summarised the session and asked the learner if they wanted to save any moments. After the change, the tutor identifies the seams from the session transcript and offers to save them by default, with the learner able to deselect any that do not feel worth saving. The summarise-first behaviour is still available as an option, but it is no longer the default.

We also changed the framing of the saved-moment list. The list used to be called "mistakes." It is now called "seams." The rename is small but consequential. A "mistake" implies an error, and an error implies a learner who has done something wrong. A "seam" implies a place where the model was thin, and a thin model is not a moral failure. The rename is a way of saying, to the learner, that the moments worth revisiting are not the moments they should be embarrassed by. They are the moments they should be curious about.

## What the data says

The 47 participants named 186 remembered moments. Almost none of them were the polished answers:

| Kind of moment | Cited a week later |
| --- | --- |
| Detour moments | 71% |
| Explicit uncertainty → resolution | 64% |
| Polished summary answers | 18% |

Learners who paused at an unmotivated step and asked "why this step?" could reconstruct the whole surrounding idea a week later; learners with a frictionless, complete explanation remembered the topic but could not re-enter it.

A note on "detour moments." This is the cohort's term, not ours. We had been calling these "seam moments" in our internal language. The learners, in the open-ended responses, used the word "detour" to describe the moment where the conversation went off the polished path and into a question they had not expected to ask. We adopted their word because it is more accurate: the moments they remembered were not, in their experience, the moments where they had been wrong. They were the moments where the conversation had *diverted* from the smooth answer, and the diversion had produced an insight. The detour is what was worth keeping.

A note on "explicit uncertainty → resolution." This is the case where the learner said "I am not sure" (or one of the equivalents we detect with the trigger regex), the tutor waited, and the next message from the tutor was a smaller question. The 64% number is the share of such cases in which the learner, a week later, cited the resolution moment as one they still carried. This is the cleanest evidence we have that the honest-pause behaviour is producing durable memories, not just in-the-moment engagement.

A note on the cohort. The 47 learners were active users with at least five prior sessions and a self-reported engagement score above the median. They were recruited by email and offered a small credit for participation. The 186 remembered moments are the unique moments cited across all three open-ended questions; many moments were cited in more than one question, and we counted each citation as a separate moment for the purposes of this table.

A note on the 18% for polished summary answers. This is the share of remembered moments that were the tutor's clean, complete explanation. The 18% is not zero—some learners do remember and revisit polished answers—but it is much smaller than the 71% for detours and the 64% for explicit-uncertainty resolutions. The ratio is roughly 4:1 in favour of detours. This ratio is the one that drove the product change.

## How we measured it

One-week, three-question follow-up forms paired with transcripts; two coders matched each answer to a transcript moment, counting only agreed matches. Internally reviewed, not externally peer-reviewed, and the cohort over-represents active learners.

The matching was the hardest part of the measurement. A learner who writes "the moment where I finally got why the function returns 1" is referring to a specific moment, but the wording does not contain enough information to identify the moment uniquely. The two coders worked independently to match each answer to a transcript moment, and we counted only the matches both coders agreed on. The agreement rate was 76%, which is on the lower end of what we accept; the lower agreement is in part an artefact of the open-ended response format, which allowed learners to describe moments in their own words rather than selecting from a list.

We did not measure retention directly. A learner who revisits a moment is not necessarily a learner who has retained the underlying idea. The revisit is a leading indicator; the retention is the lagging one. We have a small follow-up study planned for September 2026 that will pair revisits with a delayed free-recall prompt, on the model of the memory-recall study.

### Methodology timeline

1. **Recruit** — 47 active learners opted in and completed three questions.
2. **Follow up** — Short form sent one week after the session.
3. **Match** — Two coders independently matched each answer to a transcript moment.
4. **Reconcile** — Only double-coded matches counted; disagreements resolved by a third.

A note on what we did *not* measure. We did not measure whether the revisit was a re-read (the learner opened the moment and re-read it) or a re-engagement (the learner asked the tutor a follow-up question about the moment). The product records both, but the current study treats them as the same outcome. We expect, on the basis of internal usage data, that about 60% of revisits are re-reads and 40% are re-engagements, but we have not validated this in a controlled study.

## Coming next

> **When a tutor should say it is unsure.** Detours open the space, but the tutor's own uncertainty — the moment of marking a boundary — reshapes the learner's next step. The next note records how three response patterns differ across 62 sessions.

## Open questions

About 15% of participants explicitly wanted closure, and we have not designed an ending that serves both preferences. We also do not know whether open-ended endings fatigue learners over months, or whether the effect generalises beyond active learners.

The 15% who wanted closure is a real design problem. A learner who wants closure is a learner who experiences an open-ended ending as incomplete. We have tried three responses: a default open-ended ending with an opt-in for a clean summary; a default clean summary with an opt-in for an open-ended ending; and a context-sensitive default that picks open-ended for sessions with detected seams and clean summary for sessions without. None of the three has been formally A/B tested, and we are aware that any of them is a compromise.

The "fatigue over months" question is the one we are most uncertain about. The current behaviour—open-ended endings, seams saved by default—may produce durable learning in the short term and yet fatigue the learner in the long term. A learner who has had fifty sessions of being asked to revisit seams may eventually experience the revisits as a chore. We do not yet know. A twelve-month longitudinal study is on the calendar, but it has not yet started.

The "generalises beyond active learners" question is the one we are most cautious about. Our cohort over-represents active learners, and the effects may not transfer to learners who use the tutor less frequently or who have less prior context. A replication with a broader cohort is planned for the second half of 2026.

A fourth open question, which we have begun to think about: does the revisit behaviour depend on the *kind* of seam? A seam that surfaced a boundary condition may be more worth revisiting than a seam that surfaced a step-justification gap, on the theory that boundary conditions are more durable features of the topic. We do not yet have data on this, but we are designing the next study to look at it directly.

## Related reading

- [Practice · The value of an honest pause](https://topodrive.top/research/honest-pause/)
- [Tutoring · When a tutor should say it is unsure](https://topodrive.top/research/tutor-curiosity/)

## References

1. Murre, J. M. J., & Dros, J. (2015). Replication and analysis of Ebbinghaus' forgetting curve. *PLoS ONE*, 10(7), e0120644.
2. Rubin, D. C., & Wenzel, A. E. (1996). One hundred years of forgetting: A quantitative description of retention. *Psychological Review*, 103(4), 734–760.
3. Hunt, R. R. (2006). The concept of distinctiveness in memory research. In *Distinctiveness and Memory* (pp. 3–25). Oxford University Press.
4. Bjork, R. A., & Bjork, E. L. (2011). Making things hard on yourself, but in a good way. In *Psychology and the Real World* (pp. 56–64). Worth Publishers.

[Read on the site](https://topodrive.top/research/what-learners-keep/)
