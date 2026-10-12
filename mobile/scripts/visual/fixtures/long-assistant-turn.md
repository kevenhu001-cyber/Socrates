# Weekly activation review

I reviewed the path from signup to **first project created** across the last seven days. The overall activation rate softened by 2.4 percentage points, but the decline is concentrated in the first-session setup step rather than in account creation.

## Funnel snapshot

| Step | This week | Last week | Change |
| --- | ---: | ---: | ---: |
| Sign-up completed | 12,480 | 12,111 | +3.0% |
| First workspace opened | 8,336 | 8,519 | -2.1% |
| First project created | 5,904 | 6,242 | -5.4% |
| Teammate invited | 2,184 | 2,096 | +4.2% |

The activation definition is consistent with the product metric:

$$
A = \frac{\text{users with a first project}}{\text{completed sign-ups}} \times 100
$$

For this cohort, the calculation is `$5,904 / 12,480 × 100`, or 47.3%. The change is meaningful, but it is not uniform across acquisition sources.

## What looks off

- **Workspace setup** accounts for most of the weekly loss; sign-up volume is still growing.

- **Invites recover later in the funnel**, which suggests the product value is clear once a first project exists.

- **Thursday is the main outlier**. The deployment annotation overlaps with a longer first-run checklist, so compare completion time before attributing causality.

- **Paid search is stable** within the expected confidence band; avoid changing bids based on this one week.

## Recommended checks

1. Compare first-project completion time by app version and device class.
2. Break the setup step into template selection, editor open, and first save.
3. Verify whether the Thursday release changed the default project template.
4. Keep the acquisition mix fixed in the follow-up experiment.

A lightweight baseline model for the next review:

```ts
const activationRate = (firstProjects / completedSignups) * 100;
const weekOverWeekDelta = activationRate - previousActivationRate;
```

The point estimate should be read alongside sample size and the cohort's confidence interval. The interval below is illustrative; it is not a causal estimate:

$$
\hat p \pm 1.96\sqrt{\frac{\hat p(1-\hat p)}{n}}
$$

## Daily trend — chart still streaming

```echarts
{
  "title": { "text": "First project created" },
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "data": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
  "yAxis": { "type": "value", "min": 0, "max": 100 },
  "series": [{ "type": "line", "smooth": true, "data": [49.1, 48.6, 48.9, 43.2, 46.8, 47.6, 47.3] }]
