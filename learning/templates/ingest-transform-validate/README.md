# Ingest-Transform-Validate

**A template for reliable data processing pipelines with integrity monitoring and validation gates.**

This template implements a linear data processing pipeline with strong guarantees: integrity monitoring at ingestion, fidelity tracking during transformation, and a required validation gate before output.

## Pattern

```
[ingest] → [classify] → [transform] → [validate] → [package]
```

```
┌──────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌─────────┐
│  Ingest  │───▶│ Classify │───▶│ Transform │───▶│ Validate │───▶│ Package │
│ (Gemini) │    │ (Sonnet) │    │  (Opus)   │    │  (Opus)  │    │(Sonnet) │
└──────────┘    └──────────┘    └───────────┘    └──────────┘    └─────────┘
     ▲                               ▲                ▲
     │                               │                │
 Data Integrity              Transformation       Validation
   Monitor                     Fidelity              Gate
  (sentinel)                  (sentinel)          (sentinel)
```

## When to Use This Template

- Data migration and format conversion
- Content transformation and normalization
- Data cleaning and quality improvement
- ETL-style processing where correctness is critical
- Any pipeline where data integrity must be guaranteed

## Domains

Customize this template for:
- **Data migration** — adjust classification for schema mapping
- **Content processing** — focus on semantic preservation in transforms
- **Log processing** — emphasize format parsing and normalization
- **Document conversion** — track formatting fidelity through transforms

## Input Requirements

Place the following in your data directory:
- Source data files in any format
- Optional: target format specification
- Optional: transformation rules or mapping documents
- Optional: quality threshold configuration

## How It Works

### Phase 1: Ingest (Gemini 2.5 Pro)
Uses Gemini's large context window to catalog and inventory all source data. The **data integrity monitor** sentinel (required) establishes baseline item counts and quality metrics. Retries automatically on failure.

### Phase 2: Classify (Claude Sonnet)
Continues from the ingestion context to categorize data items and create a transformation plan. Runs in `continue-previous` mode for full context awareness.

### Phase 3: Transform (Claude Opus)
Applies transformations with precision. Monitored by the **transformation fidelity** sentinel for semantic preservation. Retries on failure.

### Phase 4: Validate (Claude Opus)
Comprehensive validation against source data and expected output. The **validation gate** sentinel (required) provides a definitive pass/fail. Aborts on failure — no bad data passes through.

### Phase 5: Package (Claude Sonnet)
Assembles validated data into final output format with metadata and lineage documentation.

## Sentinels

| Sentinel | Type | Required | Purpose |
|----------|------|----------|---------|
| Data Integrity Monitor | Immediate, structured output | Yes | Tracks item counts and quality at ingestion |
| Transformation Fidelity | Conversational, debounce 5s | No | Monitors semantic preservation during transforms |
| Validation Gate | Immediate, structured output | Yes | Pass/fail gate before output |

## Error Handling

| Phase | On Failure | Details |
|-------|-----------|---------|
| Ingest | Retry | Up to 2 attempts with 2s delay |
| Transform | Retry | Up to 2 attempts with 1s delay |
| Validate | Abort | Pipeline stops — no bad data released |

## Outputs

- `output/*` — Final packaged data
- `output/manifest.md` — Package manifest with data lineage
- `output/processing-summary.md` — End-to-end processing statistics
- `validated/validation-report.md` — Detailed validation results

## Customization

- **Models**: Swap Gemini for any high-context model at ingestion; swap Opus for precision work
- **Retry config**: Adjust `maxAttempts` and `delayMs` for your data reliability needs
- **Validation strictness**: Modify the validation gate sentinel's pass criteria
- **Classification schema**: Customize the classify prompt for your data domain

## Running

```bash
# Place source data in a data directory
cp /path/to/source/data/* /path/to/data/

# Run with Hankweave
hankweave --config=learning/templates/ingest-transform-validate/hank.json --data=/path/to/data
```

## Structure

```
ingest-transform-validate/
├── hank.json              # Hank configuration
├── README.md              # This file
├── prompts/
│   ├── 1-ingest.md        # Data ingestion prompt
│   ├── 2-classify.md      # Classification prompt
│   ├── 3-transform.md     # Transformation prompt
│   ├── 4-validate.md      # Validation prompt
│   └── 5-package.md       # Packaging prompt
└── sentinels/
    ├── data-integrity-monitor.json     # Entry integrity tracking
    ├── transformation-fidelity.json    # Semantic preservation monitor
    └── validation-gate.json            # Required exit gate
```
