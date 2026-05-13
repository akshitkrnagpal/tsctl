# @tsctl/cli

## 0.3.4

### Patch Changes

- `plan` and `apply` now detect new fields added to existing collections. Previously, the remote-onto-local projection in the comparator returned local items verbatim when no remote match existed for them, making the projected-remote array byte-identical to local and the equality check report no change — so field additions silently never reached Typesense. Fixes #7.
