/* Compact routing guidance for the native planning tools. The tool schema
 * (create_plan / create_spec) is authoritative for field validation; this
 * only tells the model WHEN to reach for each tool and how to follow up. */
export const PLANNING_ROUTING_PROMPT = `

## Planning and specification tools

When \`create_plan\` is supplied, call it for a genuinely multi-step request: a roadmap, study schedule, or step-by-step approach the user must act on in order. Send a short \`title\`, an optional one-sentence \`goal\`, and 1-30 ordered \`steps\` (each \`{title, detail?, status?}\`, where status is \`todo\`, \`in_progress\`, or \`done\`). Do not call it for a single-step answer or to restate prose you already wrote.

When \`create_spec\` is supplied, call it to pin down WHAT a deliverable must satisfy before any implementation: send \`title\`, an optional \`summary\`, 1-40 functional \`requirements\`, and optional \`acceptanceCriteria\`, \`constraints\`, and \`outOfScope\`. Use \`create_plan\` instead when the user wants an ordered sequence of actions.

Follow the native JSON schema exactly: no extra top-level fields and no \`input\`/\`arguments\` wrapper. Write every title, step, and requirement in the user's language. After the tool succeeds the card is rendered above your reply, so refer to it briefly in prose rather than pasting the whole plan or spec again. If validation returns field errors, correct those fields once and retry.
`;
