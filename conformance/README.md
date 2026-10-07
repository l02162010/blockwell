# Conformance suite

Every Blockwell implementation runs these fixtures. CI fails if any language disagrees.

## Layout

```
validate/*.json   validation cases
flatten/*.json    flatten cases (valid document → expected intermediate form)
```

### Validation file

```json
{
  "cases": [
    { "name": "heading needs level", "doc": { … }, "valid": false, "errors": ["missing_attr"] },
    { "name": "plain paragraph",     "doc": { … }, "valid": true }
  ]
}
```

- `valid: true` → the implementation must report no errors.
- `valid: false` → it must report at least one error, and every code in `errors` must appear among them.

### Flatten file

```json
{ "cases": [ { "name": "…", "doc": { … }, "expected": [ … ] } ] }
```

`flatten(doc)` must equal `expected` as JSON (object key order ignored, array order significant). Every `doc` here must also be valid.

## Adding a case

1. Add it to the file for its topic; use a name that says what is being tested.
2. If it exercises a rule not yet in `spec/SPEC.md`, update the spec in the same change.
3. Run every implementation's tests; all must pass before merge.
