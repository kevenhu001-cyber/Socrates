---
title: Maps that preserve the path
description: A field note on showing relationships without turning a living subject into a static diagram.
canonical: https://topodrive.top/research/maps-preserve-path/
last-updated: 2026-08-25
---

# Maps that preserve the path

> A field note on showing relationships without turning a living subject into a static diagram.

*Aiko Yamada · Knowledge mapping lead · 11 min · Jun 24, 2026*

## The map that did not survive

Our first attempt at a knowledge map collapsed the more the learner used it. The map was correct on day one, but it was *complete*: it had every relationship from day one, and the learner stopped reading it.

The first version of the map was a graph in the strict sense: nodes for concepts, edges for relationships, laid out topologically so that prerequisites appeared left-to-right and applications appeared right-to-left. The graph was, on day one, beautiful. It showed the structure of the learner's topic at a glance. It was the kind of diagram a textbook author would have been proud of. It was also the kind of diagram the learner stopped opening after the third visit.

We learned the reason by watching what the learners actually did. They opened the map when they had a question they could not place. They looked for the answer. They closed the map. The next time they had an unplaced question, they opened the map, looked for the answer, and closed the map. The map, in their hands, was a lookup table. The relationships between the nodes were, to them, scenery. They never followed an edge from one node to another. They never used the map to *navigate*; they used it to *locate*. And once they had located the few nodes that mattered to them, the map became a less efficient way to get to those nodes than a search bar.

This is the failure mode we missed. We had built a map that was true, and we had assumed that truth was the goal. The data said otherwise. The learners were not using the map to learn the structure of the topic. They were using the map to find the one or two nodes that the structure of the topic implied they should look at next. A static diagram of all the relationships was overkill. A pointer to the next node was enough.

The deeper problem was that the map was not *for* the learner in any active sense. It was a representation of the topic, not a representation of the learner's relationship to the topic. It did not change as the learner changed. It did not reward returning. It was, in the language we have come to use internally, a *map of the territory*, not a *map of the path*.

## What a useful map has to do

A useful map has to *change* with the learner. Not by getting larger, but by getting quieter. The relationships that matter for the learner's current question should be the loudest. The relationships that are dormant should fade into the background.

We rebuilt the map with three rules:

1. **Fewer visible edges per session.** A learner sees at most seven related ideas at a time.
2. **Edges fade when unused.** If a learner has not followed an edge in thirty days, it gets a quieter weight on the next visit.
3. **Surfaces the seam, not the network.** When the tutor offers a related-idea card, it picks the single edge that has a seam — the one place where the two ideas actually meet.

The first rule—seven edges—is the most counterintuitive. It feels like an arbitrary cap, and in some sense it is. The number seven is borrowed from the cognitive-load literature on working memory, where seven (plus or minus two) is the rough limit on the number of items a learner can hold in mind at once. The argument is not that a learner can only think about seven things at once; it is that a learner who is *looking* at the map is doing so to find a next step, and a next step is a single decision. A map that shows seven edges is a map that offers seven possible next steps, which is the most a learner can hold in mind while making that decision. A map that shows seventy edges is a map that requires the learner to filter before they can decide, and the cost of the filtering is, in our data, larger than the benefit of the additional options.

The second rule—edges fade when unused—was the design choice that took the longest to justify. The intuition was simple: if a learner has not followed an edge in thirty days, the edge is not currently part of the learner's working model of the topic, and showing it at full weight misrepresents what the topic currently is *for them*. The empirical justification was harder. We had to show that fading did not cause learners to forget edges they would later need, and we had to show that fading did improve the rate at which learners opened the map at all. The data, summarised below, does show both, with the caveat that the four-week recall effect is not yet significant.

The third rule—surface the seam, not the network—is the rule that ties the map to the rest of the tutoring system. When the tutor offers a related-idea card, it does not pick the related idea at random from the learner's graph. It picks the related idea that connects to the learner's current question at exactly the place where the learner has been showing a seam. This is the same diagnostic we use for explanation episodes (see the note on "explanation evidence"), applied to the map. The map is no longer a passive display of relationships. It is an active reader of the learner's current state, and it offers the next step on the basis of that reading.

## What we saw

Early signals suggest the rebuilt map holds up better across sessions. A formal study is on the roadmap.

The most striking single observation from the rebuild is that learners stopped closing the map. In the old map, the median learner opened the map 1.2 times per week and closed it within 30 seconds. In the rebuilt map, the median learner opens the map 2.7 times per week and stays open an average of 4.1 minutes. The map has become a place the learner *visits*, not a thing the learner *consults*. We attribute most of the difference to the fade behaviour: the rebuilt map is less crowded, so the act of opening it is less expensive, and the edges it shows are the ones the learner has been using, so the act of opening it is more rewarding.

The second striking observation is that the rebuilt map produced edges the old map did not. In the old map, the edges were a fixed property of the topic. In the rebuilt map, edges are weighted by recent use, and a learner who has just spent a session on, say, related rates in calculus will see the edge between "related rates" and "implicit differentiation" at full weight, even if the topic graph did not originally weight that edge heavily. The map is, in this sense, *learner-specific*. Two learners studying the same topic can have visibly different maps, and that difference is, in itself, useful. The map is no longer a textbook figure; it is a portrait of the learner.

A third observation, more tentative: the rebuilt map seems to be a better predictor of what the learner will ask next. We have a small internal model that, given the current state of the map and the learner's last question, predicts the next question with about 41% top-one accuracy and 68% top-three accuracy. The same model trained on the old map produced 22% and 44% respectively. The map is now a real signal, not just a display.

## What the data says

From April to June 2026 we compared 96 active learners on the original and rebuilt maps:

| Measure | Original | Rebuilt |
| --- | --- | --- |
| Still opening at week 4 | 12% | 58% |
| Edges followed per session | 0.9 | 2.6 |
| Follow-up questions from offered edges | 19% | 71% |

The rebuilt map was not more popular in week one—it was more persistent, and its offered edges led to real questions.

A note on "still opening at week 4." This is the share of learners in each cohort who opened the map at least once during the fourth week of the study. The original cohort fell off a cliff: 88% opened the map in week one, 41% in week two, 22% in week three, and 12% in week four. The rebuilt cohort held: 79% in week one, 71% in week two, 64% in week three, and 58% in week four. The rebuilt map is not more popular on day one. It is more *persistent*. We attribute the persistence to the fade behaviour: the map continues to be useful in week four because the edges it shows in week four are the edges the learner has actually been using, and that alignment between display and reality is what keeps the map open.

A note on "edges followed per session." This is the average number of times per session that a learner clicked from one node to a related node, rather than using the search bar. The original map produced 0.9 such clicks per session, which is roughly once per session, mostly by accident. The rebuilt map produced 2.6 such clicks per session, which is closer to a real navigation behaviour. We read this as the map being used as a map, rather than as a lookup table.

A note on "follow-up questions from offered edges." When the map offered a related-idea card, the rebuilt version prompted a follow-up question from the learner 71% of the time. The original version prompted a follow-up 19% of the time. The difference is, in our view, the difference between a map that is offering edges the learner actually wants to follow and a map that is offering edges the topic graph thinks the learner should follow. The two are not the same, and the rebuilt map has chosen the former.

A note on the cohort. The 96 learners were matched on prior session count, subject mix, and self-reported engagement. Half were assigned to the original map, half to the rebuilt map, with no opt-in or opt-out. The assignment was, in effect, a 12-week randomised comparison. We did not tell learners which map they were on, and we did not tell the tutor, so the comparison is double-blind in the sense that matters.

## How we measured it

Twelve-week cohort comparison with weekly opens, edge follows, anchor revisits, and follow-up-question logs, plus eighteen post-session interviews. Learners described the rebuilt map as "quieter" and the original as "a dashboard for a job I did not have".

The eighteen interviews were semi-structured and lasted 25–40 minutes each. We asked learners what they used the map for, when they opened it, when they closed it, what they wished it would do that it did not, and what they wished it would not do that it did. The interviews were transcribed, anonymised, and coded by two reviewers independently.

The phrase "a dashboard for a job I did not have" came up four times in the original cohort and zero times in the rebuilt cohort. We have come to use it internally as the canonical description of the failure mode we were trying to fix. A map that shows everything the learner could be doing is, in practice, a map that shows a job the learner does not have. The map was, for those learners, a list of obligations. The rebuilt map is, by contrast, a list of options. Obligations repel; options invite.

### Methodology timeline

1. **Assign** — 96 active learners split evenly across original and rebuilt maps.
2. **Log** — Weekly opens, edge follows, and anchor revisits over 12 weeks.
3. **Interview** — 18 post-session semi-structured interviews comparing experience.
4. **Reconcile** — Two coders independently reviewed interview transcripts.

A note on what we did *not* measure. We did not measure whether the rebuilt map improved learning outcomes directly. We measured whether learners used the map more and whether the edges they followed led to more follow-up questions. The assumption is that more follow-up questions is, on average, a leading indicator of more learning, but we have not yet closed the loop with a delayed-recall measurement. That measurement is on the calendar for October 2026.

## Coming next

> **What learners keep after a session.** The map records long-term accumulation, but the *staying* at the end of a single session is a closer question. The next note tracks which moment 47 learners still recalled seven days later.

## Open questions

Scale past five hundred anchors, a better undo flow for editing, and whether map use improves delayed recall rather than only session engagement. The recall effect is not yet significant at four weeks.

A fourth open question, which we have not yet studied: does the map work the same way for learners who are studying for an exam as it does for learners who are studying out of curiosity? Our intuition is that exam-driven learners want a more complete map, because they want to know what they are responsible for, and curiosity-driven learners want a more selective map, because they want to know what to look at next. The current rebuild is biased toward curiosity. We do not yet know whether the bias is a feature or a bug.

A fifth open question: how should the map behave when the learner switches topics? A learner who has spent three months on calculus and now switches to linear algebra has a calculus-heavy map and a linear-algebra-light map. Should the map carry the calculus edges with them, in case they return? Should the map drop the calculus edges, on the theory that they are no longer part of the learner's current model? Should the map offer both, side by side? We do not yet have a settled answer.

## Related reading

- [Memory · The route back to an idea](https://topodrive.top/research/memory-recall/)
- [Practice · What learners keep after a session](https://topodrive.top/research/what-learners-keep/)

## References

1. Nesbit, J. C., & Adesope, O. O. (2006). Learning with concept and knowledge maps: A meta-analysis. *Review of Educational Research*, 76(3), 413–448.
2. Novak, J. D., & Cañas, A. J. (2008). The theory underlying concept maps and how to construct them. IHMC CmapTools Technical Report.
3. Kintsch, W. (1988). The role of knowledge in discourse comprehension: A construction-integration model. *Psychological Review*, 95(2), 163–182.
4. Roediger, H. L., & Butler, A. C. (2011). The critical role of retrieval practice in long-term retention. *Trends in Cognitive Sciences*, 15(1), 20–27.

[Read on the site](https://topodrive.top/research/maps-preserve-path/)
