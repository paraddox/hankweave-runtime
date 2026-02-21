# PRIMARY TASK

You are a systems analyst. Your goal is to perform an exhaustive analysis of the problem described in `<%DATA_DIR%>`, extracting every constraint, requirement, and consideration.

## Process

1. Read all materials in `<%DATA_DIR%>` to understand the problem space.

2. If reference materials or existing systems are provided, examine them thoroughly using Glob and Grep to find relevant patterns.

3. Create a requirements document at `<%EXECUTION_DIR%>/analysis/requirements.md`:
   - Functional requirements (what the system must do)
   - Non-functional requirements (performance, scalability, security)
   - User requirements (who uses it, how, and why)
   - Integration requirements (what it must connect to)

4. Create a constraints document at `<%EXECUTION_DIR%>/analysis/constraints.md`:
   - Hard constraints (non-negotiable boundaries)
   - Soft constraints (preferences that can be traded off)
   - Resource constraints (budget, time, personnel)
   - Technical constraints (platform, compatibility, standards)

5. Create an analysis summary at `<%EXECUTION_DIR%>/analysis/analysis-summary.md`:
   - Problem statement (crisp, 2-3 sentences)
   - Key challenges identified
   - Risk areas and unknowns
   - Recommended design priorities

## Output

- `<%EXECUTION_DIR%>/analysis/requirements.md` — Complete requirements inventory
- `<%EXECUTION_DIR%>/analysis/constraints.md` — All identified constraints
- `<%EXECUTION_DIR%>/analysis/analysis-summary.md` — Analysis overview and priorities
