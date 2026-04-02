import { z } from "zod";

// ============================================================================
// Field Types
// ============================================================================

export const FieldTypeSchema = z.enum([
  "string",
  "string[]",
  "int32",
  "int32[]",
  "int64",
  "int64[]",
  "float",
  "float[]",
  "bool",
  "bool[]",
  "geopoint",
  "geopoint[]",
  "geopolygon",
  "object",
  "object[]",
  "auto",
  "string*",
  "image",
]);

export type FieldType = z.infer<typeof FieldTypeSchema>;

// ============================================================================
// Collection Field Schema
// ============================================================================

export const FieldSchema = z.object({
  name: z.string(),
  type: FieldTypeSchema,
  optional: z.boolean().optional(),
  facet: z.boolean().optional(),
  index: z.boolean().optional(),
  sort: z.boolean().optional(),
  infix: z.boolean().optional(),
  locale: z.string().optional(),
  stem: z.boolean().optional(),
  store: z.boolean().optional(),
  num_dim: z.number().optional(),
  vec_dist: z.enum(["cosine", "ip"]).optional(),
  reference: z.string().optional(),
  range_index: z.boolean().optional(),
  stem_dictionary: z.string().optional(),
  truncate_len: z.number().optional(),
  token_separators: z.array(z.string()).optional(),
  symbols_to_index: z.array(z.string()).optional(),
  embed: z
    .object({
      from: z.array(z.string()),
      model_config: z.object({
        model_name: z.string(),
        api_key: z.string().optional(),
        indexing_prefix: z.string().optional(),
        query_prefix: z.string().optional(),
        // GCP Vertex AI configuration
        project_id: z.string().optional(),
        service_account: z
          .object({
            client_email: z.string(),
            private_key: z.string(),
          })
          .optional(),
        // GCP OAuth configuration (alternative to service_account)
        access_token: z.string().optional(),
        refresh_token: z.string().optional(),
        client_id: z.string().optional(),
        client_secret: z.string().optional(),
      }),
    })
    .optional(),
});

export type Field = z.infer<typeof FieldSchema>;

// ============================================================================
// Collection Schema
// ============================================================================

export const CollectionConfigSchema = z.object({
  name: z.string(),
  fields: z.array(FieldSchema),
  default_sorting_field: z.string().optional(),
  token_separators: z.array(z.string()).optional(),
  symbols_to_index: z.array(z.string()).optional(),
  enable_nested_fields: z.boolean().optional(),
  // Typesense 30.0+: Link to global synonym sets
  synonym_sets: z.array(z.string()).optional(),
  // Typesense 30.0+: Link to global curation sets
  curation_sets: z.array(z.string()).optional(),
  // Custom metadata object
  metadata: z.record(z.unknown()).optional(),
});

export type CollectionConfig = z.infer<typeof CollectionConfigSchema>;

// ============================================================================
// Alias Schema
// ============================================================================

export const AliasConfigSchema = z.object({
  name: z.string(),
  collection: z.string(),
});

export type AliasConfig = z.infer<typeof AliasConfigSchema>;

// ============================================================================
// Synonym Schema (Legacy - per-collection, for Typesense < 30.0)
// ============================================================================

export const SynonymConfigSchema = z.object({
  id: z.string(),
  collection: z.string(),
  synonyms: z.array(z.string()).optional(),
  root: z.string().optional(),
  symbols_to_index: z.array(z.string()).optional(),
  locale: z.string().optional(),
});

export type SynonymConfig = z.infer<typeof SynonymConfigSchema>;

// ============================================================================
// Synonym Set Schema (Typesense 30.0+ - global, reusable synonym sets)
// ============================================================================

export const SynonymSetItemSchema = z.object({
  id: z.string(),
  synonyms: z.array(z.string()).optional(),
  root: z.string().optional(),
  symbols_to_index: z.array(z.string()).optional(),
  locale: z.string().optional(),
});

export type SynonymSetItem = z.infer<typeof SynonymSetItemSchema>;

export const SynonymSetConfigSchema = z.object({
  name: z.string(),
  items: z.array(SynonymSetItemSchema),
});

export type SynonymSetConfig = z.infer<typeof SynonymSetConfigSchema>;

// ============================================================================
// Override/Curation Schema (planned)
// ============================================================================

export const OverrideRuleSchema = z.object({
  query: z.string().optional(),
  match: z.enum(["exact", "contains"]).optional(),
  filter_by: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const OverrideConfigSchema = z.object({
  id: z.string(),
  collection: z.string(),
  rule: OverrideRuleSchema,
  includes: z
    .array(
      z.object({
        id: z.string(),
        position: z.number(),
      })
    )
    .optional(),
  excludes: z
    .array(
      z.object({
        id: z.string(),
      })
    )
    .optional(),
  filter_by: z.string().optional(),
  sort_by: z.string().optional(),
  replace_query: z.string().optional(),
  remove_matched_tokens: z.boolean().optional(),
  filter_curated_hits: z.boolean().optional(),
  effective_from_ts: z.number().optional(),
  effective_to_ts: z.number().optional(),
  stop_processing: z.boolean().optional(),
});

export type OverrideConfig = z.infer<typeof OverrideConfigSchema>;

// ============================================================================
// Analytics Rule Schema
// ============================================================================

export const AnalyticsRuleParamsSchema = z.object({
  destination_collection: z.string().optional(),
  // v30+: structured source/destination
  source: z
    .object({
      collections: z.array(z.string()).optional(),
      events: z
        .array(
          z.object({
            type: z.string(),
            name: z.string(),
            weight: z.number().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  destination: z
    .object({
      collection: z.string(),
    })
    .optional(),
  limit: z.number().optional(),
  capture_search_requests: z.boolean().optional(),
  meta_fields: z.array(z.string()).optional(),
  expand_query: z.boolean().optional(),
  counter_field: z.string().optional(),
  weight: z.number().optional(),
});

export const AnalyticsRuleConfigSchema = z.object({
  name: z.string(),
  type: z.enum(["popular_queries", "nohits_queries", "counter", "log"]),
  collection: z.string(),
  event_type: z.enum(["search", "click", "conversion", "visit", "custom"]),
  rule_tag: z.string().optional(),
  params: AnalyticsRuleParamsSchema.optional(),
});

export type AnalyticsRuleConfig = z.infer<typeof AnalyticsRuleConfigSchema>;

// ============================================================================
// API Key Schema
// ============================================================================

export const ApiKeyConfigSchema = z.object({
  description: z.string(),
  actions: z.array(z.string()),
  collections: z.array(z.string()),
  value: z.string().optional(), // Only used when creating, not stored in state
  expires_at: z.number().optional(),
  autodelete: z.boolean().optional(),
});

export type ApiKeyConfig = z.infer<typeof ApiKeyConfigSchema>;

// ============================================================================
// Stopword Set Schema
// ============================================================================

export const StopwordSetConfigSchema = z.object({
  id: z.string(),
  stopwords: z.array(z.string()),
  locale: z.string().optional(),
});

export type StopwordSetConfig = z.infer<typeof StopwordSetConfigSchema>;

// ============================================================================
// Preset Schema
// ============================================================================

export const PresetConfigSchema = z.object({
  name: z.string(),
  value: z.record(z.unknown()),
});

export type PresetConfig = z.infer<typeof PresetConfigSchema>;

// ============================================================================
// Curation Set Schema (Typesense 30.0+ - global curation rules)
// ============================================================================

export const CurationRuleSchema = z.object({
  query: z.string().optional(),
  match: z.enum(["exact", "contains"]).optional(),
  filter_by: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const CurationItemSchema = z.object({
  id: z.string(),
  rule: CurationRuleSchema.optional(),
  includes: z
    .array(
      z.object({
        id: z.string(),
        position: z.number(),
      })
    )
    .optional(),
  excludes: z
    .array(
      z.object({
        id: z.string(),
      })
    )
    .optional(),
  filter_by: z.string().optional(),
  sort_by: z.string().optional(),
  replace_query: z.string().optional(),
  remove_matched_tokens: z.boolean().optional(),
  filter_curated_hits: z.boolean().optional(),
  stop_processing: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  effective_from_ts: z.number().optional(),
  effective_to_ts: z.number().optional(),
  diversity: z
    .object({
      similarity_metric: z.array(
        z.object({
          field: z.string(),
          method: z.enum(["jaccard", "equality", "vector_distance"]),
          weight: z.number().optional(),
        })
      ),
    })
    .optional(),
});

export type CurationItem = z.infer<typeof CurationItemSchema>;

export const CurationSetConfigSchema = z.object({
  name: z.string(),
  items: z.array(CurationItemSchema),
});

export type CurationSetConfig = z.infer<typeof CurationSetConfigSchema>;

// ============================================================================
// Stemming Dictionary Schema
// ============================================================================

export const StemmingWordSchema = z.object({
  word: z.string(),
  root: z.string(),
});

export type StemmingWord = z.infer<typeof StemmingWordSchema>;

export const StemmingDictionaryConfigSchema = z.object({
  id: z.string(),
  words: z.array(StemmingWordSchema),
});

export type StemmingDictionaryConfig = z.infer<typeof StemmingDictionaryConfigSchema>;

// ============================================================================
// Full Config Schema
// ============================================================================

export const TypesenseConfigSchema = z.object({
  collections: z.array(CollectionConfigSchema).optional(),
  aliases: z.array(AliasConfigSchema).optional(),
  // Legacy per-collection synonyms (Typesense < 30.0)
  synonyms: z.array(SynonymConfigSchema).optional(),
  // Global synonym sets (Typesense 30.0+)
  synonymSets: z.array(SynonymSetConfigSchema).optional(),
  overrides: z.array(OverrideConfigSchema).optional(),
  // Global curation sets (Typesense 30.0+)
  curationSets: z.array(CurationSetConfigSchema).optional(),
  analyticsRules: z.array(AnalyticsRuleConfigSchema).optional(),
  apiKeys: z.array(ApiKeyConfigSchema).optional(),
  stopwords: z.array(StopwordSetConfigSchema).optional(),
  presets: z.array(PresetConfigSchema).optional(),
  stemmingDictionaries: z.array(StemmingDictionaryConfigSchema).optional(),
});

export type TypesenseConfig = z.infer<typeof TypesenseConfigSchema>;

// ============================================================================
// Resource Types for State Management
// ============================================================================

export type ResourceType = "collection" | "alias" | "synonym" | "synonymSet" | "override" | "curationSet" | "analyticsRule" | "apiKey" | "stopword" | "preset" | "stemmingDictionary";

export interface ResourceIdentifier {
  type: ResourceType;
  name: string;
  /** For resources scoped to a collection (synonyms, overrides) */
  collection?: string;
}

export interface ManagedResource {
  identifier: ResourceIdentifier;
  config: CollectionConfig | AliasConfig | SynonymConfig | SynonymSetConfig | OverrideConfig | CurationSetConfig | AnalyticsRuleConfig | ApiKeyConfig | StopwordSetConfig | PresetConfig | StemmingDictionaryConfig;
  checksum: string;
  lastUpdated: string;
}

export interface State {
  version: string;
  resources: ManagedResource[];
}

// ============================================================================
// Plan Types
// ============================================================================

export type ChangeAction = "create" | "update" | "delete" | "no-change";

export interface ResourceChange {
  action: ChangeAction;
  identifier: ResourceIdentifier;
  before?: unknown;
  after?: unknown;
  diff?: string;
}

export interface Plan {
  changes: ResourceChange[];
  hasChanges: boolean;
  summary: {
    create: number;
    update: number;
    delete: number;
    noChange: number;
  };
}

// ============================================================================
// Connection Config
// ============================================================================

export const ConnectionConfigSchema = z.object({
  nodes: z.array(
    z.object({
      host: z.string(),
      port: z.number(),
      protocol: z.enum(["http", "https"]),
    })
  ),
  apiKey: z.string(),
  connectionTimeoutSeconds: z.number().optional(),
  retryIntervalSeconds: z.number().optional(),
  numRetries: z.number().optional(),
});

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

// ============================================================================
// Define Config Helper
// ============================================================================

export function defineConfig(config: TypesenseConfig): TypesenseConfig {
  return TypesenseConfigSchema.parse(config);
}
