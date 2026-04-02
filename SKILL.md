# tsctl — Typesense Infrastructure Management

Use this skill when the user wants to manage Typesense search infrastructure: collections, aliases, synonyms, curations, API keys, stopwords, presets, or stemming dictionaries.

## When to use

- User asks to create, update, or delete Typesense collections or their schema
- User wants to see what changes would be made to Typesense
- User wants to apply infrastructure changes to Typesense
- User asks about the current state of their Typesense resources
- User wants to import existing Typesense resources into config
- User wants to check for configuration drift
- User mentions tsctl, Typesense infrastructure, or Typesense schema management

## How to use

tsctl is a CLI tool installed in the project. Run commands via the Bash tool.

### Check current state

```bash
# See what resources are managed
bunx tsctl state list

# See planned changes (what would happen)
bunx tsctl plan --json

# Check for drift (changes made outside tsctl)
bunx tsctl drift --json
```

### Make changes

1. First, edit the config file (usually `tsctl.config.ts`) with the desired changes
2. Run `bunx tsctl plan` to show the user what will change
3. After user confirms, run `bunx tsctl apply -y` to apply

```bash
# Show plan
bunx tsctl plan

# Apply changes (auto-approve)
bunx tsctl apply -y

# Apply only specific resources
bunx tsctl apply -y --target collection.products alias.products_live
```

### Import existing resources

```bash
# Import all resources from Typesense into a config file
bunx tsctl import
```

### Config file format

The config file is `tsctl.config.ts`:

```typescript
import { defineConfig } from "tsctl";

export default defineConfig({
  collections: [
    {
      name: "products",
      fields: [
        { name: "title", type: "string" },
        { name: "price", type: "float" },
        { name: "category", type: "string", facet: true },
      ],
      default_sorting_field: "price",
    },
  ],
  aliases: [
    { name: "products_live", collection: "products" },
  ],
  stopwords: [
    { id: "english", stopwords: ["the", "a", "an"] },
  ],
});
```

### Environment

tsctl reads connection info from `.env`:

```
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_API_KEY=your-key
```

Use `--env` flag for different environments: `bunx tsctl plan --env production`

### Available resource types in config

- `collections` — Collection schemas with fields, sorting, nested objects
- `aliases` — Collection aliases for zero-downtime switches
- `synonyms` — Per-collection synonyms (Typesense < 30)
- `synonymSets` — Global synonym sets (Typesense 30+)
- `overrides` — Per-collection curations (Typesense < 30)
- `curationSets` — Global curation sets (Typesense 30+)
- `analyticsRules` — Search analytics aggregation rules
- `apiKeys` — Scoped API keys
- `stopwords` — Stopword sets for search query filtering
- `presets` — Reusable search parameter configurations
- `stemmingDictionaries` — Custom word-to-root stemming mappings

### Field types

`string`, `string[]`, `int32`, `int32[]`, `int64`, `int64[]`, `float`, `float[]`, `bool`, `bool[]`, `geopoint`, `geopoint[]`, `geopolygon`, `object`, `object[]`, `auto`, `string*`, `image`

### Blue/green migrations

For zero-downtime schema changes:

```bash
bunx tsctl migrate -a products_live -c tsctl.config.ts -y
```
