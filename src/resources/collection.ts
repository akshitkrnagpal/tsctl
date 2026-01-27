import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";
import { getClient } from "../client/index.js";
import type { CollectionConfig, Field } from "../types/index.js";

/**
 * Convert our field config to Typesense field schema
 */
function toTypesenseField(field: Field): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: field.name,
    type: field.type,
  };

  if (field.optional !== undefined) result["optional"] = field.optional;
  if (field.facet !== undefined) result["facet"] = field.facet;
  if (field.index !== undefined) result["index"] = field.index;
  if (field.sort !== undefined) result["sort"] = field.sort;
  if (field.infix !== undefined) result["infix"] = field.infix;
  if (field.locale !== undefined) result["locale"] = field.locale;
  if (field.stem !== undefined) result["stem"] = field.stem;
  if (field.store !== undefined) result["store"] = field.store;
  if (field.num_dim !== undefined) result["num_dim"] = field.num_dim;
  if (field.vec_dist !== undefined) result["vec_dist"] = field.vec_dist;
  if (field.reference !== undefined) result["reference"] = field.reference;
  if (field.range_index !== undefined) result["range_index"] = field.range_index;
  if (field.embed !== undefined) result["embed"] = field.embed;

  return result;
}

/**
 * Field default values in Typesense
 * These are stripped when importing to keep configs minimal
 */
const FIELD_DEFAULTS = {
  optional: false,
  facet: false,
  index: true,
  sort: false,
  infix: false,
  stem: false,
  store: true,
  range_index: false,
} as const;

/**
 * Types that have sort enabled by default in Typesense
 * Typesense auto-enables sort for numeric and bool types
 */
const SORT_ENABLED_BY_DEFAULT_TYPES = new Set([
  "int32", "int32[]",
  "int64", "int64[]",
  "float", "float[]",
  "bool", "bool[]",
]);

/**
 * Convert Typesense field to our Field type
 * Strips default values to keep config minimal
 */
function fromTypesenseField(f: Record<string, unknown>): Field {
  const fieldType = f["type"] as string;
  const field: Field = {
    name: f["name"] as string,
    type: fieldType as Field["type"],
  };

  // Only include non-default values
  if (f["optional"] !== undefined && f["optional"] !== FIELD_DEFAULTS.optional)
    field.optional = f["optional"] as boolean;
  if (f["facet"] !== undefined && f["facet"] !== FIELD_DEFAULTS.facet)
    field.facet = f["facet"] as boolean;
  if (f["index"] !== undefined && f["index"] !== FIELD_DEFAULTS.index)
    field.index = f["index"] as boolean;

  // sort: Typesense auto-enables for numeric/bool types, so only include if different from type default
  const sortDefault = SORT_ENABLED_BY_DEFAULT_TYPES.has(fieldType);
  if (f["sort"] !== undefined && f["sort"] !== sortDefault)
    field.sort = f["sort"] as boolean;

  if (f["infix"] !== undefined && f["infix"] !== FIELD_DEFAULTS.infix)
    field.infix = f["infix"] as boolean;
  if (f["stem"] !== undefined && f["stem"] !== FIELD_DEFAULTS.stem)
    field.stem = f["stem"] as boolean;
  if (f["store"] !== undefined && f["store"] !== FIELD_DEFAULTS.store)
    field.store = f["store"] as boolean;
  if (f["range_index"] !== undefined && f["range_index"] !== FIELD_DEFAULTS.range_index)
    field.range_index = f["range_index"] as boolean;

  // locale: only include if non-empty string
  if (f["locale"] !== undefined && f["locale"] !== "")
    field.locale = f["locale"] as string;

  // These have no defaults, always include if present
  if (f["num_dim"] !== undefined) field.num_dim = f["num_dim"] as number;
  if (f["vec_dist"] !== undefined) field.vec_dist = f["vec_dist"] as "cosine" | "ip";
  if (f["reference"] !== undefined) field.reference = f["reference"] as string;
  if (f["embed"] !== undefined) field.embed = f["embed"] as Field["embed"];

  return field;
}

/**
 * Convert our collection config to Typesense schema
 */
function toTypesenseSchema(config: CollectionConfig): CollectionCreateSchema {
  const schema: Record<string, unknown> = {
    name: config.name,
    fields: config.fields.map(toTypesenseField),
  };

  if (config.default_sorting_field) {
    schema["default_sorting_field"] = config.default_sorting_field;
  }
  if (config.token_separators) {
    schema["token_separators"] = config.token_separators;
  }
  if (config.symbols_to_index) {
    schema["symbols_to_index"] = config.symbols_to_index;
  }
  if (config.enable_nested_fields !== undefined) {
    schema["enable_nested_fields"] = config.enable_nested_fields;
  }
  // Typesense 30.0+: synonym sets linking
  if (config.synonym_sets && config.synonym_sets.length > 0) {
    schema["synonym_sets"] = config.synonym_sets;
  }

  return schema as unknown as CollectionCreateSchema;
}

/**
 * Get a collection from Typesense
 */
export async function getCollection(
  name: string
): Promise<CollectionConfig | null> {
  const client = getClient();

  try {
    const collection = await client.collections(name).retrieve();
    const collectionData = collection as unknown as Record<string, unknown>;
    const fields = collectionData["fields"] as Array<Record<string, unknown>> | undefined;

    // Convert back to our config format
    const config: CollectionConfig = {
      name: collectionData["name"] as string,
      fields: (fields || []).map(fromTypesenseField),
    };

    if (collectionData["default_sorting_field"]) {
      config.default_sorting_field = collectionData["default_sorting_field"] as string;
    }
    // Only include if non-empty array
    const tokenSeparators = collectionData["token_separators"] as string[] | undefined;
    if (tokenSeparators && tokenSeparators.length > 0) {
      config.token_separators = tokenSeparators;
    }
    // Only include if non-empty array
    const symbolsToIndex = collectionData["symbols_to_index"] as string[] | undefined;
    if (symbolsToIndex && symbolsToIndex.length > 0) {
      config.symbols_to_index = symbolsToIndex;
    }
    // Only include enable_nested_fields if not the default (false)
    if (collectionData["enable_nested_fields"] === true) {
      config.enable_nested_fields = true;
    }
    // Typesense 30.0+: synonym sets linking
    const synonymSets = collectionData["synonym_sets"] as string[] | undefined;
    if (synonymSets && synonymSets.length > 0) {
      config.synonym_sets = synonymSets;
    }

    return config;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      error.httpStatus === 404
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * List all collections from Typesense
 */
export async function listCollections(): Promise<CollectionConfig[]> {
  const client = getClient();
  const collections = await client.collections().retrieve();

  return (collections as unknown as Array<Record<string, unknown>>)
    .filter((c) => !(c["name"] as string).startsWith("_tsctl_")) // Exclude our state collection
    .map((collection) => {
      const fields = collection["fields"] as Array<Record<string, unknown>> | undefined;

      const config: CollectionConfig = {
        name: collection["name"] as string,
        fields: (fields || []).map(fromTypesenseField),
      };

      if (collection["default_sorting_field"]) {
        config.default_sorting_field = collection["default_sorting_field"] as string;
      }
      // Only include if non-empty array
      const tokenSeparators = collection["token_separators"] as string[] | undefined;
      if (tokenSeparators && tokenSeparators.length > 0) {
        config.token_separators = tokenSeparators;
      }
      // Only include if non-empty array
      const symbolsToIndex = collection["symbols_to_index"] as string[] | undefined;
      if (symbolsToIndex && symbolsToIndex.length > 0) {
        config.symbols_to_index = symbolsToIndex;
      }
      // Only include enable_nested_fields if not the default (false)
      if (collection["enable_nested_fields"] === true) {
        config.enable_nested_fields = true;
      }
      // Typesense 30.0+: synonym sets linking
      const synonymSets = collection["synonym_sets"] as string[] | undefined;
      if (synonymSets && synonymSets.length > 0) {
        config.synonym_sets = synonymSets;
      }

      return config;
    });
}

/**
 * Create a new collection in Typesense
 */
export async function createCollection(config: CollectionConfig): Promise<void> {
  const client = getClient();
  const schema = toTypesenseSchema(config);
  await client.collections().create(schema);
}

/**
 * Check if two fields are equal (ignoring order of properties)
 */
function fieldsEqual(a: Field, b: Field): boolean {
  return JSON.stringify(normalizeField(a)) === JSON.stringify(normalizeField(b));
}

/**
 * Normalize a field for comparison
 */
function normalizeField(f: Field): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: f.name,
    type: f.type,
  };
  if (f.optional !== undefined) result.optional = f.optional;
  if (f.facet !== undefined) result.facet = f.facet;
  if (f.index !== undefined) result.index = f.index;
  if (f.sort !== undefined) result.sort = f.sort;
  if (f.infix !== undefined) result.infix = f.infix;
  if (f.locale !== undefined) result.locale = f.locale;
  if (f.stem !== undefined) result.stem = f.stem;
  if (f.store !== undefined) result.store = f.store;
  if (f.num_dim !== undefined) result.num_dim = f.num_dim;
  if (f.vec_dist !== undefined) result.vec_dist = f.vec_dist;
  if (f.reference !== undefined) result.reference = f.reference;
  if (f.range_index !== undefined) result.range_index = f.range_index;
  if (f.embed !== undefined) result.embed = f.embed;
  return result;
}

/**
 * Update a collection in Typesense
 * Handles field modifications by dropping and re-adding fields
 * Also handles synonym_sets updates
 */
export async function updateCollection(
  config: CollectionConfig,
  _existing: CollectionConfig
): Promise<{ requiresRecreate: boolean; fieldsToAdd: Field[]; fieldsToDrop: string[]; fieldsToModify: Field[] }> {
  const client = getClient();

  const existingFieldNames = new Set(_existing.fields.map((f) => f.name));
  const newFieldNames = new Set(config.fields.map((f) => f.name));
  const existingFieldMap = new Map(_existing.fields.map((f) => [f.name, f]));

  // Fields to add (new fields not in existing)
  const fieldsToAdd = config.fields.filter((f) => !existingFieldNames.has(f.name));

  // Fields to drop (in existing but not in new config)
  const fieldsToDrop = _existing.fields
    .filter((f) => !newFieldNames.has(f.name))
    .map((f) => f.name);

  // Fields to modify (exist in both but have different config)
  // These will be dropped and re-added
  const fieldsToModify: Field[] = [];
  for (const field of config.fields) {
    const existingField = existingFieldMap.get(field.name);
    if (existingField && !fieldsEqual(existingField, field)) {
      fieldsToModify.push(field);
    }
  }

  // Build update schema
  const updateSchema: Record<string, unknown> = {};

  // Build field updates
  const updateFields: Array<Record<string, unknown>> = [];

  // First, drop fields that need to be removed or modified
  for (const name of fieldsToDrop) {
    updateFields.push({ name, drop: true });
  }
  for (const field of fieldsToModify) {
    updateFields.push({ name: field.name, drop: true });
  }

  // Then, add new fields and re-add modified fields
  for (const field of fieldsToAdd) {
    updateFields.push(toTypesenseField(field));
  }
  for (const field of fieldsToModify) {
    updateFields.push(toTypesenseField(field));
  }

  if (updateFields.length > 0) {
    updateSchema.fields = updateFields;
  }

  // Check if synonym_sets changed
  const existingSynonymSets = _existing.synonym_sets || [];
  const newSynonymSets = config.synonym_sets || [];
  const synonymSetsChanged =
    JSON.stringify(existingSynonymSets.sort()) !== JSON.stringify(newSynonymSets.sort());

  if (synonymSetsChanged) {
    updateSchema.synonym_sets = newSynonymSets;
  }

  // Apply changes if any
  if (Object.keys(updateSchema).length > 0) {
    await client.collections(config.name).update(updateSchema as never);
  }

  return { requiresRecreate: false, fieldsToAdd, fieldsToDrop, fieldsToModify };
}

/**
 * Delete a collection from Typesense
 */
export async function deleteCollection(name: string): Promise<void> {
  const client = getClient();
  await client.collections(name).delete();
}

/**
 * Recreate a collection (delete and create)
 * WARNING: This will delete all documents!
 */
export async function recreateCollection(config: CollectionConfig): Promise<void> {
  await deleteCollection(config.name);
  await createCollection(config);
}
