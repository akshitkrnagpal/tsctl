# tsctl - Terraform-like CLI for Typesense

A declarative infrastructure-as-code CLI for managing Typesense collections, aliases, synonyms, curations, analytics, API keys, stopwords, presets, and more.

Supports **Typesense v27+** and **v30+** with full backward compatibility.

## Features

- **Declarative configuration**: Define your Typesense schema in TypeScript, JSON, or YAML config files
- **Plan/Apply workflow**: See what will change before applying
- **State management**: State stored in Typesense itself—no external dependencies
- **Type-safe**: Full TypeScript support with autocomplete and validation
- **Import existing**: Import existing Typesense resources into managed state
- **Drift detection**: Detect changes made outside of tsctl
- **Blue/green migrations**: Zero-downtime collection schema updates
- **Multi-environment**: Manage development, staging, and production environments
- **v29/v30 compatible**: Supports both legacy per-collection synonyms/overrides and v30 global synonym sets/curation sets

## Installation

```bash
npm install -g tsctl
# or
npx tsctl
```

## Quick Start

### 1. Initialize a project

```bash
tsctl init
```

This creates:
- `tsctl.config.ts` - Your infrastructure definition
- `.env` - Connection settings

### 2. Configure connection

Edit `.env`:

```env
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_API_KEY=your-api-key-here
```

### 3. Define your schema

Edit `tsctl.config.ts`:

```typescript
import { defineConfig } from "tsctl";

export default defineConfig({
  collections: [
    {
      name: "products",
      fields: [
        { name: "name", type: "string" },
        { name: "description", type: "string", optional: true },
        { name: "price", type: "float" },
        { name: "category", type: "string", facet: true },
        { name: "tags", type: "string[]", facet: true, optional: true },
      ],
      default_sorting_field: "price",
    },
  ],
  aliases: [
    {
      name: "products_live",
      collection: "products",
    },
  ],
});
```

### 4. Plan changes

```bash
tsctl plan
```

Output:
```
Typesense Plan:

  + collection.products (create)
      + name: "products"
      + fields: [...]

  + alias.products_live (create)
      + name: "products_live"
      + collection: "products"

Summary:
  2 to create, 0 to update, 0 to delete, 0 unchanged
```

### 5. Apply changes

```bash
tsctl apply
```

## Commands

| Command | Description |
|---------|-------------|
| `tsctl init` | Initialize a new project |
| `tsctl validate` | Validate config file |
| `tsctl plan` | Show planned changes |
| `tsctl apply` | Apply changes to Typesense |
| `tsctl destroy` | Destroy all managed resources |
| `tsctl import` | Import existing resources |
| `tsctl state list` | List managed resources |
| `tsctl state show` | Show full state JSON |
| `tsctl state clear` | Clear state (keeps resources) |
| `tsctl env list` | List available environments |
| `tsctl env show` | Show current environment config |
| `tsctl drift` | Detect changes made outside of tsctl |
| `tsctl migrate` | Blue/green migration for collections |

**Global Options:**
- `--env <name>` - Use environment-specific `.env.<name>` file

## Configuration Files

tsctl supports multiple configuration file formats and locations. Files are searched in the following order:

| File | Format |
|------|--------|
| `package.json` | `"tsctl"` property |
| `.tsctlrc` | JSON or YAML |
| `.tsctlrc.json` | JSON |
| `.tsctlrc.yaml` / `.tsctlrc.yml` | YAML |
| `.tsctlrc.js` / `.tsctlrc.cjs` / `.tsctlrc.mjs` | JavaScript |
| `.tsctlrc.ts` / `.tsctlrc.cts` / `.tsctlrc.mts` | TypeScript |
| `tsctl.config.js` / `tsctl.config.cjs` / `tsctl.config.mjs` | JavaScript |
| `tsctl.config.ts` / `tsctl.config.cts` / `tsctl.config.mts` | TypeScript |
| `tsctl.config.json` | JSON |
| `tsctl.config.yaml` / `tsctl.config.yml` | YAML |
| `typesense.config.*` | Legacy (all formats) |

### Examples

**TypeScript (recommended):**
```typescript
// tsctl.config.ts
import { defineConfig } from "tsctl";

export default defineConfig({
  collections: [{ name: "products", fields: [...] }],
});
```

**JSON:**
```json
// tsctl.config.json
{
  "collections": [{ "name": "products", "fields": [...] }]
}
```

**YAML:**
```yaml
# tsctl.config.yaml
collections:
  - name: products
    fields:
      - name: title
        type: string
```

**package.json:**
```json
{
  "name": "my-app",
  "tsctl": {
    "collections": [{ "name": "products", "fields": [...] }]
  }
}
```

## Configuration Reference

### Collections

```typescript
{
  name: "products",
  fields: [
    {
      name: "title",
      type: "string",        // Required
      optional: true,        // Allow null/missing
      facet: true,           // Enable faceting
      index: true,           // Index for search (default: true)
      sort: true,            // Enable sorting
      infix: true,           // Enable infix search
      locale: "en",          // Language for stemming
      stem: true,            // Enable stemming
      stem_dictionary: "en-plurals", // Custom stemming dictionary
      store: true,           // Store original value
      num_dim: 384,          // Vector dimensions
      vec_dist: "cosine",    // Vector distance metric
      reference: "users.id", // JOINs
      range_index: true,     // For numeric range queries
      truncate_len: 200,     // Max chars per token (default: 100)
      token_separators: ["-"], // Field-level token separators
      symbols_to_index: ["#"], // Field-level symbols to index
    },
  ],
  default_sorting_field: "created_at",
  token_separators: ["-", "/"],
  symbols_to_index: ["#", "@"],
  enable_nested_fields: true,
  metadata: { team: "search" }, // Custom metadata
  synonym_sets: ["clothing-synonyms"], // Link synonym sets (v30+)
  curation_sets: ["product-curations"], // Link curation sets (v30+)
}
```

### Field Types

- `string`, `string[]` - Text
- `int32`, `int32[]`, `int64`, `int64[]` - Integers
- `float`, `float[]` - Decimals
- `bool`, `bool[]` - Booleans
- `geopoint`, `geopoint[]` - Coordinates
- `geopolygon` - Geographic polygon
- `object`, `object[]` - Nested objects
- `auto` - Auto-detect type
- `string*` - Auto-embedding
- `image` - Image embedding

### Aliases

```typescript
{
  name: "products_live",
  collection: "products",
}
```

### Synonyms (Legacy - Typesense < 30.0)

Per-collection synonyms for Typesense versions before 30.0.

```typescript
{
  id: "smartphone-synonyms",
  collection: "products",
  synonyms: ["phone", "mobile", "smartphone", "cell phone"],
}
```

For one-way synonyms (root word):

```typescript
{
  id: "tv-synonym",
  collection: "products",
  root: "television",
  synonyms: ["tv", "telly", "television set"],
}
```

### Synonym Sets (Typesense 30.0+ - Global)

Global synonym sets that can be shared across collections.

```typescript
{
  name: "clothing-synonyms",
  items: [
    { id: "pants", synonyms: ["pants", "trousers", "slacks"] },
    { id: "shirt", synonyms: ["shirt", "top", "blouse"] },
    { id: "tv", root: "television", synonyms: ["tv", "telly"] },
  ],
}
```

Link to collections:
```typescript
{
  name: "products",
  fields: [...],
  synonym_sets: ["clothing-synonyms"],
}
```

### Overrides/Curations (Legacy - Typesense < 30.0)

Per-collection overrides for Typesense versions before 30.0.

```typescript
{
  id: "pin-featured",
  collection: "products",
  rule: {
    query: "featured",
    match: "exact",
  },
  includes: [
    { id: "product-123", position: 1 },
    { id: "product-456", position: 2 },
  ],
}
```

### Curation Sets (Typesense 30.0+ - Global)

Global curation rules that can be shared across collections.

```typescript
{
  name: "product-curations",
  items: [
    {
      id: "pin-featured",
      rule: { query: "featured", match: "exact" },
      includes: [{ id: "product-123", position: 1 }],
    },
    {
      id: "boost-shoes",
      rule: { query: "shoes", match: "contains" },
      filter_by: "category:=footwear",
      sort_by: "popularity:desc",
      remove_matched_tokens: true,
      effective_from_ts: 1672531200,
      effective_to_ts: 1704067200,
    },
  ],
}
```

Link to collections:
```typescript
{
  name: "products",
  fields: [...],
  curation_sets: ["product-curations"],
}
```

### Stopwords

Define stopword sets to remove common words from search queries.

```typescript
{
  id: "english-stopwords",
  stopwords: ["the", "a", "an", "is", "are", "was", "were"],
  locale: "en", // optional
}
```

### Search Presets

Store reusable search parameter configurations.

```typescript
{
  name: "listing_view",
  value: {
    searches: [
      {
        collection: "products",
        q: "*",
        sort_by: "popularity:desc",
      },
    ],
  },
}
```

### Analytics Rules

```typescript
{
  name: "popular-queries",
  type: "popular_queries", // popular_queries | nohits_queries | counter | log
  collection: "products",
  event_type: "search", // search | click | conversion | visit | custom
  params: {
    destination_collection: "popular_queries",
    limit: 1000,
    expand_query: true,
  },
}
```

### API Keys

```typescript
{
  description: "Search-only key for frontend",
  actions: ["documents:search"],
  collections: ["products", "categories"],
}
```

With expiration:

```typescript
{
  description: "Temporary admin key",
  actions: ["*"],
  collections: ["*"],
  expires_at: 1735689600, // Unix timestamp
  autodelete: true,
}
```

### Stemming Dictionaries

Custom word-to-root mappings for stemming.

```typescript
{
  id: "english-plurals",
  words: [
    { word: "dogs", root: "dog" },
    { word: "cats", root: "cat" },
    { word: "mice", root: "mouse" },
  ],
}
```

Reference from fields:
```typescript
{
  name: "title",
  type: "string",
  stem_dictionary: "english-plurals",
}
```

## Full Configuration Example

```typescript
import { defineConfig } from "tsctl";

export default defineConfig({
  collections: [
    {
      name: "products",
      fields: [
        { name: "name", type: "string" },
        { name: "description", type: "string", optional: true },
        { name: "price", type: "float" },
        { name: "category", type: "string", facet: true },
      ],
      default_sorting_field: "price",
      synonym_sets: ["product-synonyms"],
      curation_sets: ["product-curations"],
    },
  ],

  aliases: [
    { name: "products_live", collection: "products" },
  ],

  // v30+ global synonym sets
  synonymSets: [
    {
      name: "product-synonyms",
      items: [
        { id: "phones", synonyms: ["phone", "mobile", "smartphone"] },
      ],
    },
  ],

  // v30+ global curation sets
  curationSets: [
    {
      name: "product-curations",
      items: [
        {
          id: "featured",
          rule: { query: "featured", match: "exact" },
          includes: [{ id: "product-1", position: 1 }],
        },
      ],
    },
  ],

  stopwords: [
    { id: "english", stopwords: ["the", "a", "an"] },
  ],

  presets: [
    { name: "default_search", value: { q: "*", sort_by: "price:asc" } },
  ],

  apiKeys: [
    {
      description: "Search-only key",
      actions: ["documents:search"],
      collections: ["products"],
    },
  ],

  stemmingDictionaries: [
    {
      id: "en-plurals",
      words: [{ word: "shoes", root: "shoe" }],
    },
  ],
});
```

## State Management

State is stored in a special Typesense collection (`_tsctl_state`). This means:

- No external state storage needed
- State travels with your Typesense instance
- Easy backup/restore with Typesense snapshots

### Import Existing Resources

If you have existing collections/aliases:

```bash
tsctl import
```

This will:
1. Scan your Typesense instance for all resource types
2. Generate a `tsctl.imported.config.ts` file
3. Save the current state

Review the generated config, then rename it to `tsctl.config.ts`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TYPESENSE_HOST` | `localhost` | Typesense host |
| `TYPESENSE_PORT` | `8108` | Typesense port |
| `TYPESENSE_PROTOCOL` | `http` | `http` or `https` |
| `TYPESENSE_API_KEY` | - | API key (required) |

## Multi-Environment Support

Manage multiple Typesense environments (development, staging, production) using environment-specific `.env` files.

### Setup

Initialize with environment files:

```bash
tsctl init --with-environments
```

This creates:
- `.env` - Default/development settings
- `.env.development` - Development environment
- `.env.staging` - Staging environment
- `.env.production` - Production environment

### Usage

Use the `--env` flag to target a specific environment:

```bash
# Plan changes against staging
tsctl plan --env staging

# Apply to production
tsctl apply --env production

# Import from development
tsctl import --env development
```

## Drift Detection

Detect when resources have been modified outside of tsctl (e.g., via Typesense dashboard or API).

```bash
tsctl drift
```

Output shows:
- **Modified**: Resources changed outside of tsctl
- **Deleted**: Resources removed outside of tsctl
- **Unmanaged**: Resources that exist but aren't in your config

Drift detection covers all resource types: collections, aliases, stopwords, presets, curation sets, and more.

### CI/CD Integration

The `drift` command exits with code 1 if drift is detected, making it useful for CI pipelines:

```bash
# In your CI pipeline
tsctl drift --env production || echo "Drift detected!"
```

### JSON Output

For programmatic use:

```bash
tsctl drift --json
```

## Blue/Green Migrations

Perform zero-downtime collection schema updates using the blue/green deployment pattern.

### How It Works

1. **Create** a new versioned collection (e.g., `products_1706486400000`)
2. **Index** your data to the new collection
3. **Switch** the alias to point to the new collection
4. **Cleanup** the old collection when ready

### Quick Migration

Full migration in one command:

```bash
tsctl migrate -a products_live -c tsctl.config.ts
```

### Step-by-Step Migration

For more control, migrate in stages:

```bash
# Step 1: Create the new collection
tsctl migrate -a products_live -c tsctl.config.ts --create-only

# Step 2: Index your data to the new collection
# (use your own indexing process)

# Step 3: Switch the alias to the new collection
tsctl migrate -a products_live -c tsctl.config.ts --switch-only

# Step 4: Delete the old collection when ready
tsctl migrate -a products_live -c tsctl.config.ts --cleanup products_1706486400000
```

### Options

| Option | Description |
|--------|-------------|
| `-a, --alias <name>` | Alias to migrate (required) |
| `-c, --config <path>` | Path to config file (required) |
| `--collection <name>` | Collection from config (if multiple) |
| `--skip-delete` | Keep old collection for rollback |
| `--create-only` | Only create new collection |
| `--switch-only` | Only switch alias |
| `--cleanup <name>` | Delete old collection |

## Typesense Version Compatibility

| Feature | v27 | v28 | v29 | v30+ |
|---------|-----|-----|-----|------|
| Collections | Yes | Yes | Yes | Yes |
| Aliases | Yes | Yes | Yes | Yes |
| Per-collection Synonyms | Yes | Yes | Yes | Deprecated* |
| Per-collection Overrides | Yes | Yes | Yes | Deprecated* |
| Global Synonym Sets | - | Yes | Yes | Yes |
| Global Curation Sets | - | - | - | Yes |
| API Keys | Yes | Yes | Yes | Yes |
| Analytics Rules | Yes | Yes | Yes | Yes |
| Stopwords | Yes | Yes | Yes | Yes |
| Presets | Yes | Yes | Yes | Yes |
| Stemming Dictionaries | - | Yes | Yes | Yes |

\* Auto-migrated to global sets on upgrade to v30

## Development

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Docker](https://www.docker.com/) (for running Typesense locally)

### Setup

```bash
# Clone the repo
git clone https://github.com/akshitkrnagpal/tsctl.git
cd tsctl

# Install dependencies
bun install

# Start Typesense (v27)
docker compose up -d

# Or start Typesense v30
docker compose -f docker-compose.v30.yml up -d

# Run tests
bun test

# Type check
bun run typecheck
```

### Running Tests

Tests run against a live Typesense instance. Start one with Docker Compose before running tests:

```bash
# Test against Typesense v27 (default)
docker compose up -d
bun test

# Test against Typesense v30
docker compose -f docker-compose.v30.yml up -d
bun test

# Stop Typesense
docker compose down -v
```

Tests are version-aware and automatically skip tests for features not available in the running Typesense version.

### CI/CD

The project uses GitHub Actions to run tests against both Typesense v27 and v30 on every push and pull request. See `.github/workflows/ci.yml`.

## License

MIT
