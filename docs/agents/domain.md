# Domain Docs

This repository uses a single-context domain documentation layout.

## Before exploring

Read these files when they exist and are relevant:

- `CONTEXT.md` at the repository root
- ADRs under `docs/adr/`

If these files do not exist, proceed silently. Domain-modeling skills create them when terminology or architectural decisions need to be recorded.

## Layout

```text
/
├── CONTEXT.md
├── docs/adr/
└── addon/
```

## Vocabulary

Use terminology defined in `CONTEXT.md` consistently in issues, implementation plans, tests, documentation, and code. Avoid synonyms that the glossary explicitly rejects.

If a required concept is absent, reconsider whether it belongs to the project or record it as a possible domain-modeling gap.

## ADR conflicts

If proposed work contradicts an existing ADR, identify the conflict explicitly instead of silently overriding the decision.
