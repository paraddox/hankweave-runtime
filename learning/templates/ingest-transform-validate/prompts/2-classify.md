# PRIMARY TASK

You are a data classification specialist. Using the ingested data inventory, categorize and tag each data item for the transformation phase.

## Process

1. Read the inventory at `<%EXECUTION_DIR%>/ingested/inventory.md` and the ingestion report at `<%EXECUTION_DIR%>/ingested/ingestion-report.md`.

2. Define a classification schema appropriate for the data:
   - Primary categories (what broad type is each item?)
   - Sub-categories (more specific classification)
   - Processing tags (what transformations apply?)
   - Priority level (which items are most important?)

3. Apply the schema to each data item and write the classification to `<%EXECUTION_DIR%>/classified/classification.md`:
   - Item-by-item classification with category assignments
   - Confidence score for each classification
   - Items requiring manual review (low confidence)

4. Create a transformation plan at `<%EXECUTION_DIR%>/classified/transform-plan.md`:
   - Grouping of items by required transformation type
   - Processing order recommendations
   - Special handling notes for edge cases
   - Expected output format for each category

## Output

- `<%EXECUTION_DIR%>/classified/classification.md` — Complete classification with categories
- `<%EXECUTION_DIR%>/classified/transform-plan.md` — Transformation plan by category
