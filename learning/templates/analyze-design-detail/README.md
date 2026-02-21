# Analyze-Design-Detail

**A template for iterative analysis and specification of complex design problems.**

This template implements a structured analysis-to-specification pipeline with constraint tracking, consistency checking, and cost validation. Ideal for systems design, architecture planning, and engineering specifications.

## Pattern

```
[analyze] → LOOP([design] → [detail]) → [cost-validate] → [finalize]
```

```
┌──────────┐    ┌──────────────────────┐    ┌──────────────┐    ┌──────────┐
│ Analyze  │───▶│  Design ↔ Detail    │───▶│Cost-Validate │───▶│ Finalize │
│  (Opus)  │    │  (Opus + Sonnet)     │    │  (Sonnet)    │    │ (Sonnet) │
└──────────┘    │  up to 3 iterations  │    └──────────────┘    └──────────┘
     ▲          └──────────────────────┘
     │                    ▲
 Constraint          Consistency
  Tracker              Checker
 (sentinel)           (sentinel)
```

## When to Use This Template

- System architecture and design documents
- Engineering specifications and technical proposals
- Product requirement documents (PRDs)
- Infrastructure planning and capacity design
- Any problem requiring iterative design refinement

## Domains

Customize this template for:
- **Software architecture** — adjust analysis to focus on code patterns and technical debt
- **Product design** — emphasize user requirements and market constraints
- **Infrastructure** — focus on capacity, cost, and operational constraints
- **Process design** — track workflow constraints and handoff points

## Input Requirements

Place the following in your data directory:
- Problem statement or design brief
- Existing system documentation (if redesigning)
- Constraint documents (budgets, timelines, standards)
- Stakeholder requirements or interview notes

## How It Works

### Phase 1: Analyze (Claude Opus)
Exhaustive analysis of the problem space using `exhaustWithPrompt` to ensure thorough constraint extraction. The **constraint tracker** sentinel (required) captures all constraints in a structured format for downstream verification.

### Phase 2: Design-Detail Loop (Opus + Sonnet, up to 3 iterations)
- **Design** (Opus): Proposes or refines the high-level architecture. Monitored by the **consistency checker** sentinel
- **Detail** (Sonnet): Fleshes out implementation specifics, continues from the design context. Previous iterations are archived

### Phase 3: Cost-Validate (Sonnet)
Validates the design against practical constraints. Includes a rig validation step to ensure the design specification exists before proceeding.

### Phase 4: Finalize (Sonnet)
Assembles all outputs into a unified specification document with implementation roadmap.

## Sentinels

| Sentinel | Type | Required | Purpose |
|----------|------|----------|---------|
| Constraint Tracker | Immediate, structured output | Yes | Captures all constraints in structured JSON |
| Consistency Checker | Conversational, debounce 5s | No | Cross-references design decisions against constraints |

## Outputs

- `output/specification.md` — Unified specification document
- `output/roadmap.md` — Implementation roadmap
- `analysis/` — Requirements and constraints inventory
- `design/` — Design specifications and decision log
- `details/` — Detailed component specifications
- `cost-report/` — Feasibility and cost validation

## Customization

- **Models**: Swap Opus for any reasoning-strong model; Sonnet for any workhorse model
- **Loop iterations**: Adjust `terminateOn.limit` for more or fewer design passes
- **Constraint tracking**: The constraint tracker sentinel is required (`failCodonIfNotLoaded: true`) — ensure your sentinel infrastructure is configured
- **Validation**: Add more rig `validate` steps to check for specific artifacts

## Running

```bash
# Place your design brief in a data directory
echo "Design a distributed cache system..." > /path/to/data/brief.md

# Run with Hankweave
hankweave --config=learning/templates/analyze-design-detail/hank.json --data=/path/to/data
```

## Structure

```
analyze-design-detail/
├── hank.json              # Hank configuration
├── README.md              # This file
├── prompts/
│   ├── 1-analyze.md       # Analysis phase prompt
│   ├── 2-design.md        # Design loop prompt
│   ├── 3-detail.md        # Detail loop prompt
│   ├── 4-cost-validate.md # Cost validation prompt
│   └── 5-finalize.md      # Finalization prompt
└── sentinels/
    ├── constraint-tracker.json     # Structured constraint extraction
    └── consistency-checker.json    # Design-constraint cross-reference
```
