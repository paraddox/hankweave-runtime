# Concept-Generate-Refine

**A template for creative content development with iterative cross-model critique and refinement.**

This template implements a creative pipeline that establishes a strong conceptual foundation, generates initial content, then iteratively improves it through cross-model critique and refinement. Features creative direction tracking and automatic detection of diminishing returns.

## Pattern

```
[concept] → [generate] → LOOP([critique] → [refine]) → [format]
```

```
┌──────────┐    ┌──────────┐    ┌───────────────────────┐    ┌──────────┐
│ Concept  │───▶│ Generate │───▶│  Critique ↔ Refine   │───▶│  Format  │
│  (Opus)  │    │ (Sonnet) │    │  (Gemini + Sonnet)    │    │ (Sonnet) │
└──────────┘    └──────────┘    │  up to 4 iterations   │    └──────────┘
     ▲                          └───────────────────────┘
     │                                    ▲
 Creative Direction               Diminishing Returns
    Tracker                          Detector
  (sentinel)                       (sentinel)
```

## When to Use This Template

- Blog posts, articles, and essays
- Marketing copy and brand content
- Creative writing (short stories, scripts)
- Presentations and pitch decks
- Social media campaigns and content series
- Any content where creative quality matters

## Domains

Customize this template for:
- **Marketing** — adjust concept phase for brand voice and messaging strategy
- **Creative writing** — emphasize originality and emotional impact in critiques
- **Technical content** — balance clarity with engagement, add accuracy checking
- **Educational content** — focus on pedagogical effectiveness in critiques

## Input Requirements

Place the following in your data directory:
- Creative brief describing what to create, for whom, and why
- Optional: brand guidelines or style guides
- Optional: examples of desired output quality
- Optional: reference material or research to incorporate

## How It Works

### Phase 1: Concept (Claude Opus)
Develops the creative foundation using Opus's strong ideation capabilities. Can use WebFetch to research trends and references. The **creative direction tracker** sentinel captures theme, constraints, key elements, and tone guidelines as a structured reference.

### Phase 2: Generate (Claude Sonnet)
Produces the first complete version following the creative direction. Focuses on completeness over perfection.

### Phase 3: Critique-Refine Loop (Gemini + Sonnet, up to 4 iterations)
- **Critique** (Gemini): Provides independent creative assessment from a different model's perspective. Monitored by the **diminishing returns detector** to prevent over-iteration
- **Refine** (Sonnet): Incorporates feedback in `continue-previous` mode, preserving creative context

### Phase 4: Format (Claude Sonnet)
Applies final formatting and presentation for the intended output channel.

## Sentinels

| Sentinel | Type | Purpose |
|----------|------|---------|
| Creative Direction Tracker | Immediate, structured output | Captures theme, constraints, key elements, tone as structured JSON |
| Diminishing Returns Detector | Conversational, debounce 8s | Detects when iterations stop adding value |

## Outputs

- `output/final.md` — Final formatted content
- `output/output-summary.md` — Output metadata and summary
- `concept/` — Creative direction documents
- `content/` — All draft versions showing creative evolution
- `critiques/` — Critique history

## Customization

- **Models**: Swap Opus for creative ideation; Gemini for critique diversity; Sonnet for generation
- **Loop iterations**: Adjust `terminateOn.limit` — 4 iterations is generous for most content
- **Diminishing returns threshold**: Modify the debounce interval (8000ms default) and detection criteria
- **Tools**: Add `WebSearch` to the generate phase for real-time reference checking

## Running

```bash
# Place your creative brief in a data directory
echo "Write a compelling blog post about..." > /path/to/data/brief.md

# Run with Hankweave
hankweave --config=learning/templates/concept-generate-refine/hank.json --data=/path/to/data
```

## Structure

```
concept-generate-refine/
├── hank.json              # Hank configuration
├── README.md              # This file
├── prompts/
│   ├── 1-concept.md       # Creative concept development prompt
│   ├── 2-generate.md      # Content generation prompt
│   ├── 3-critique.md      # Cross-model critique prompt
│   ├── 4-refine.md        # Refinement prompt
│   └── 5-format.md        # Final formatting prompt
└── sentinels/
    ├── creative-direction-tracker.json     # Structured creative direction capture
    └── diminishing-returns-detector.json   # Iteration quality monitoring
```
