# Unified Declarative Component Architecture

## Motivation

Previously, components rendered via `render_intelligent_ui` suffered from paradigm divergence:
- Learning cards were unified into declarative JSON nodes (`type: 'learning'`).
- Demonstrations used an algorithmic JSON AST (`type: 'demonstration'`).
- Visualizations required writing an OpenUI Python-like script (`type: 'openui', source: 'root = Col([Visualization(...)])'`).
- Legacy XML markup (`<quiz>`, `<definition>`) remained in older prompt instructions.

Because models were instructed to use OpenUI for charts, they naturally hallucinated that OpenUI also supported learning components (`Quiz()`, `QuizCard()`, `KnowledgeCard()`), leading to parsing failures and confusing repair loops.

## The Unified Architecture

All reader-facing interactive and visual components are now unified as **first-class declarative JSON nodes** within a single version-1 envelope:

```json
{
  "version": 1,
  "nodes": [
    {
      "id": "chart-1",
      "type": "visualization",
      "template": "bar",
      "title": "Quarterly Performance",
      "accessibilitySummary": "Q1: 10, Q2: 20",
      "payload": {
        "categories": ["Q1", "Q2"],
        "series": [{ "name": "Performance", "data": [10, 20] }]
      }
    }
  ]
}
```

### Component Families

1. **`learning`**: Quizzes, practice, definitions, flashcards, theorems, examples, proofs, derivations, key-points, steps.
2. **`visualization`**: Data charts, diagrams, timelines, heatmaps, function plots (`template`, `payload`, `title`, `accessibilitySummary`).
3. **`demonstration`**: Algorithmic ODE simulations, dynamic scene objects, and parameter controls (`program`).
4. **`layout` / Controls**: Native declarative UI trees (`panel`, `stack`, `grid`, `text`, `metric`, `progress`, `table`, `slider`, `button`, `tabs`).

### Safeguards & Compatibility

- **Direct Native Visualization**: `type: 'visualization'` nodes mount directly to `NativeVisualization`, avoiding OpenUI parsing overhead.
- **Normalization & Self-Healing**: Aliases like `kind`, `chartType`, and `data` are normalized deterministically.
- **Backwards Compatibility**: Existing historical OpenUI programs and legacy XML continue to be readable.
- **Prompt & Tool Sync**: Prompt policies and tool definitions strictly teach the unified JSON node format; OpenUI script wrapping for static charts and legacy XML tags are deprecated.
