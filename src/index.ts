// Main entry point for library usage
// Users can import { defineConfig } from "tsctl"

export {
  defineConfig,
  // Types
  type TypesenseConfig,
  type CollectionConfig,
  type AliasConfig,
  type SynonymConfig,
  type SynonymSetConfig,
  type SynonymSetItem,
  type OverrideConfig,
  type Field,
  type FieldType,
  type ConnectionConfig,
  // Schemas (for validation)
  TypesenseConfigSchema,
  CollectionConfigSchema,
  AliasConfigSchema,
  SynonymConfigSchema,
  SynonymSetConfigSchema,
  SynonymSetItemSchema,
  OverrideConfigSchema,
  FieldSchema,
  FieldTypeSchema,
  ConnectionConfigSchema,
} from "./types/index.js";
