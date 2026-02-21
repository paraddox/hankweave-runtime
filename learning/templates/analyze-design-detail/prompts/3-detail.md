# PRIMARY TASK

You are a specification engineer. Take the high-level design and flesh out implementation details, edge cases, and concrete specifications.

## Process

1. Read the design specification at `<%EXECUTION_DIR%>/design/design-spec.md` and decisions log at `<%EXECUTION_DIR%>/design/decisions.md`.

2. Read the original constraints at `<%EXECUTION_DIR%>/analysis/constraints.md`.

3. For each component in the design, create detailed specifications:
   - Interface definitions and contracts
   - Data structures and schemas
   - Error handling and edge cases
   - Configuration and defaults
   - Dependencies and prerequisites

4. Write detailed specs to `<%EXECUTION_DIR%>/details/component-specs.md`.

5. Create a detail feedback file at `<%EXECUTION_DIR%>/details/detail-feedback.md`:
   - Issues discovered while detailing (design gaps, ambiguities)
   - Suggestions for the next design iteration
   - Constraint violations or near-violations found
   - Areas needing further design work

## Output

- `<%EXECUTION_DIR%>/details/component-specs.md` — Detailed component specifications
- `<%EXECUTION_DIR%>/details/detail-feedback.md` — Feedback for the next design iteration
