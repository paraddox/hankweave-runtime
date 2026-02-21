# Research-to-Publication

**A template for transforming research topics into polished, publication-ready documents.**

This template implements a multi-phase research and writing pipeline with cross-model review loops and automated quality monitoring.

## Pattern

```
[research] -> [synthesize] -> [draft] -> LOOP([review] -> [revise]) -> [polish]
```

```
┌──────────┐    ┌─────────────┐    ┌─────────┐    ┌─────────────────────┐    ┌──────────┐
│ Research  │───>│  Synthesize │───>│  Draft  │───>│  Review <-> Revise  │───>│  Polish  │
│ (Gemini)  │    │   (Opus)    │    │(Sonnet) │    │  (Gemini + Sonnet) │    │ (Sonnet) │
└──────────┘    └─────────────┘    └─────────┘    │  up to 3 iterations│    └──────────┘
                                        ^          └─────────────────────┘
                                        |
                                   Bias Detector
                                    (sentinel)
```

## When to Use This Template

- Long-form articles, reports, or white papers
- Literature reviews and research summaries
- Technical documentation from research
- Content that requires factual accuracy and balanced perspective

## Domains

Customize this template for:
- **Academic writing** -- adjust review criteria for scholarly standards
- **Journalism** -- emphasize source verification and balance
- **Technical reports** -- focus on accuracy and completeness
- **Marketing content** -- shift review toward engagement and messaging

## Input Requirements

Place the following in your data directory:
- A research brief describing the topic, scope, target audience, and any specific requirements
- Optional: existing research, references, or source material to incorporate

## How It Works

### Phase 1: Research (Gemini 2.5 Pro)
Uses Gemini's large context window to gather and process comprehensive source material via web search and retrieval.

### Phase 2: Synthesize (Claude Opus)
Distills research into a structured outline with evidence mapping, using Opus's strong reasoning to identify the best narrative structure.

### Phase 3: Draft (Claude Sonnet)
Writes the complete first draft following the outline. Monitored by the **bias detector** sentinel for loaded language and unsupported claims.

### Phase 4: Review-Revise Loop (Gemini + Sonnet, up to 3 iterations)
- **Review**: Gemini provides independent critique from a fresh perspective, monitored by the **quality gate** sentinel
- **Revise**: Sonnet incorporates feedback and improves the draft

### Phase 5: Polish (Claude Sonnet)
Final editing pass for consistency, formatting, and publication readiness.

## Sentinels

| Sentinel | Type | Purpose |
|----------|------|---------|
| Bias Detector | Conversational, debounce 5s | Flags loaded language, unsupported claims, perspective imbalance |
| Quality Gate | Immediate, structured output | Pass/fail evaluation of coherence, completeness, citation quality |

## Outputs

- `output/final.md` -- Publication-ready document
- `output/publication-summary.md` -- Metadata and summary
- `research/` -- Research notes and source material
- `drafts/` -- Draft versions showing revision history

## Customization

- **Models**: Swap `headless:google/gemini-2.5-pro` for any high-context model; swap `headless:anthropic/claude-sonnet-4-6` for your preferred workhorse
- **Loop iterations**: Adjust `terminateOn.limit` in the review-revise loop
- **Sentinel thresholds**: Modify sentinel prompts to match your quality standards
- **Tools**: Add `WebFetch` to the draft phase if you want the writer to pull in additional references

## Running

```bash
# Place your research brief in a data directory
echo "Write a comprehensive report on..." > /path/to/data/brief.md

# Run with Hankweave
hankweave --config=learning/templates/research-to-publication/hank.json --data=/path/to/data
```

## Structure

```
research-to-publication/
├── hank.json              # Hank configuration
├── README.md              # This file
├── prompts/
│   ├── 1-research.md      # Research phase prompt
│   ├── 2-synthesize.md    # Synthesis phase prompt
│   ├── 3-draft.md         # Drafting phase prompt
│   ├── 4-review.md        # Review loop prompt
│   ├── 5-revise.md        # Revision loop prompt
│   └── 6-polish.md        # Final polish prompt
└── sentinels/
    ├── bias-detector.json      # Monitors for bias and loaded language
    └── quality-gate.json       # Pass/fail quality assessment
```
