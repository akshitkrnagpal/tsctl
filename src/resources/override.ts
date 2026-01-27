import { getClient } from "../client/index.js";
import type { OverrideConfig } from "../types/index.js";

/**
 * Convert our OverrideConfig to Typesense API format
 */
function toTypesenseOverride(config: OverrideConfig): Record<string, unknown> {
  const result: Record<string, unknown> = {
    rule: config.rule,
  };

  if (config.includes) result.includes = config.includes;
  if (config.excludes) result.excludes = config.excludes;
  if (config.filter_by) result.filter_by = config.filter_by;
  if (config.sort_by) result.sort_by = config.sort_by;
  if (config.replace_query) result.replace_query = config.replace_query;
  if (config.remove_matched_tokens !== undefined)
    result.remove_matched_tokens = config.remove_matched_tokens;
  if (config.filter_curated_hits !== undefined)
    result.filter_curated_hits = config.filter_curated_hits;
  if (config.effective_from_ts !== undefined)
    result.effective_from_ts = config.effective_from_ts;
  if (config.effective_to_ts !== undefined)
    result.effective_to_ts = config.effective_to_ts;
  if (config.stop_processing !== undefined)
    result.stop_processing = config.stop_processing;

  return result;
}

/**
 * Override default values in Typesense
 * These are stripped when importing to keep configs minimal
 */
const OVERRIDE_DEFAULTS = {
  remove_matched_tokens: false,
  filter_curated_hits: false,
  stop_processing: true,
} as const;

/**
 * Convert Typesense API override to our OverrideConfig format
 * Strips default values to keep config minimal
 */
function fromTypesenseOverride(
  override: Record<string, unknown>,
  collection: string
): OverrideConfig {
  const config: OverrideConfig = {
    id: override.id as string,
    collection,
    rule: override.rule as OverrideConfig["rule"],
  };

  // These have no defaults, always include if present
  if (override.includes)
    config.includes = override.includes as OverrideConfig["includes"];
  if (override.excludes)
    config.excludes = override.excludes as OverrideConfig["excludes"];
  if (override.filter_by) config.filter_by = override.filter_by as string;
  if (override.sort_by) config.sort_by = override.sort_by as string;
  if (override.replace_query)
    config.replace_query = override.replace_query as string;
  if (override.effective_from_ts !== undefined)
    config.effective_from_ts = override.effective_from_ts as number;
  if (override.effective_to_ts !== undefined)
    config.effective_to_ts = override.effective_to_ts as number;

  // Only include non-default values
  if (
    override.remove_matched_tokens !== undefined &&
    override.remove_matched_tokens !== OVERRIDE_DEFAULTS.remove_matched_tokens
  )
    config.remove_matched_tokens = override.remove_matched_tokens as boolean;
  if (
    override.filter_curated_hits !== undefined &&
    override.filter_curated_hits !== OVERRIDE_DEFAULTS.filter_curated_hits
  )
    config.filter_curated_hits = override.filter_curated_hits as boolean;
  if (
    override.stop_processing !== undefined &&
    override.stop_processing !== OVERRIDE_DEFAULTS.stop_processing
  )
    config.stop_processing = override.stop_processing as boolean;

  return config;
}

/**
 * Get an override from Typesense
 */
export async function getOverride(
  id: string,
  collection: string
): Promise<OverrideConfig | null> {
  const client = getClient();

  try {
    const override = await client.collections(collection).overrides(id).retrieve();
    return fromTypesenseOverride(override as unknown as Record<string, unknown>, collection);
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
 * List all overrides for a collection from Typesense
 */
export async function listOverrides(collection: string): Promise<OverrideConfig[]> {
  const client = getClient();

  try {
    const response = await client.collections(collection).overrides().retrieve();
    return response.overrides.map((override) =>
      fromTypesenseOverride(override as unknown as Record<string, unknown>, collection)
    );
  } catch (error: unknown) {
    // Collection might not exist
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      error.httpStatus === 404
    ) {
      return [];
    }
    throw error;
  }
}

/**
 * List all overrides across all collections
 */
export async function listAllOverrides(
  collections: string[]
): Promise<OverrideConfig[]> {
  const allOverrides: OverrideConfig[] = [];

  for (const collection of collections) {
    const overrides = await listOverrides(collection);
    allOverrides.push(...overrides);
  }

  return allOverrides;
}

/**
 * Create or update an override in Typesense
 * Overrides are upserted in Typesense
 */
export async function upsertOverride(config: OverrideConfig): Promise<void> {
  const client = getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client
    .collections(config.collection)
    .overrides()
    .upsert(config.id, toTypesenseOverride(config) as any);
}

/**
 * Delete an override from Typesense
 */
export async function deleteOverride(id: string, collection: string): Promise<void> {
  const client = getClient();
  await client.collections(collection).overrides(id).delete();
}
