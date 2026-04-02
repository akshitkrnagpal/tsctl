import { getClient } from "../client/index.js";
import type { CurationSetConfig, CurationItem } from "../types/index.js";

/**
 * Convert Typesense curation item to our CurationItem format
 * Strips default values to keep config minimal
 */
function fromTypesenseCurationItem(
  item: Record<string, unknown>
): CurationItem {
  const config: CurationItem = {
    id: item.id as string,
  };

  if (item.rule) config.rule = item.rule as CurationItem["rule"];
  if (item.includes)
    config.includes = item.includes as CurationItem["includes"];
  if (item.excludes)
    config.excludes = item.excludes as CurationItem["excludes"];
  if (item.filter_by) config.filter_by = item.filter_by as string;
  if (item.sort_by) config.sort_by = item.sort_by as string;
  if (item.replace_query)
    config.replace_query = item.replace_query as string;
  if (item.metadata && Object.keys(item.metadata as object).length > 0)
    config.metadata = item.metadata as Record<string, unknown>;

  // Only include non-default values
  if (
    item.remove_matched_tokens !== undefined &&
    item.remove_matched_tokens !== true
  )
    config.remove_matched_tokens = item.remove_matched_tokens as boolean;
  if (
    item.filter_curated_hits !== undefined &&
    item.filter_curated_hits !== false
  )
    config.filter_curated_hits = item.filter_curated_hits as boolean;
  if (
    item.stop_processing !== undefined &&
    item.stop_processing !== true
  )
    config.stop_processing = item.stop_processing as boolean;

  if (item.effective_from_ts !== undefined)
    config.effective_from_ts = item.effective_from_ts as number;
  if (item.effective_to_ts !== undefined)
    config.effective_to_ts = item.effective_to_ts as number;

  return config;
}

/**
 * Get a curation set from Typesense
 */
export async function getCurationSet(
  name: string
): Promise<CurationSetConfig | null> {
  const client = getClient();

  try {
    const data = await client.curationSets(name).retrieve();
    const items = (data.items || []) as unknown as Array<Record<string, unknown>>;

    return {
      name,
      items: items.map(fromTypesenseCurationItem),
    };
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
 * List all curation sets from Typesense
 */
export async function listCurationSets(): Promise<CurationSetConfig[]> {
  const client = getClient();

  try {
    const sets = await client.curationSets().retrieve();
    return sets.map((set) => ({
      name: set.name,
      items: (set.items || []).map((item) =>
        fromTypesenseCurationItem(item as unknown as Record<string, unknown>)
      ),
    }));
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      (error.httpStatus === 404 || error.httpStatus === 400)
    ) {
      return [];
    }
    throw error;
  }
}

/**
 * Create a curation set in Typesense
 */
export async function createCurationSet(
  config: CurationSetConfig
): Promise<void> {
  const client = getClient();
  await client.curationSets(config.name).upsert({
    items: config.items as any,
  });
}

/**
 * Update a curation set in Typesense
 */
export async function updateCurationSet(
  config: CurationSetConfig,
  _existing: CurationSetConfig
): Promise<void> {
  const client = getClient();
  await client.curationSets(config.name).upsert({
    items: config.items as any,
  });
}

/**
 * Delete a curation set from Typesense
 */
export async function deleteCurationSet(name: string): Promise<void> {
  const client = getClient();
  await client.curationSets(name).delete();
}

/**
 * Compare two curation set configs for equality
 */
export function curationSetConfigsEqual(
  a: CurationSetConfig,
  b: CurationSetConfig
): boolean {
  if (a.name !== b.name) return false;
  if (a.items.length !== b.items.length) return false;

  const aItems = [...a.items].sort((x, y) => x.id.localeCompare(y.id));
  const bItems = [...b.items].sort((x, y) => x.id.localeCompare(y.id));

  return JSON.stringify(aItems) === JSON.stringify(bItems);
}
