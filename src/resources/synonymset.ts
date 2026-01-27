import { getClient } from "../client/index.js";
import type { SynonymSetConfig, SynonymSetItem } from "../types/index.js";

/**
 * Get a synonym set from Typesense
 */
export async function getSynonymSet(
  name: string
): Promise<SynonymSetConfig | null> {
  const client = getClient();

  try {
    const data = await client.synonymSets(name).retrieve();
    const items = data.items || [];

    return {
      name,
      items: items.map((s) => {
        const item: SynonymSetItem = {
          id: s.id,
        };
        if (s.synonyms) item.synonyms = s.synonyms;
        if (s.root) item.root = s.root;
        if (s.symbols_to_index) item.symbols_to_index = s.symbols_to_index;
        if (s.locale) item.locale = s.locale;
        return item;
      }),
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
 * List all synonym sets from Typesense
 */
export async function listSynonymSets(): Promise<SynonymSetConfig[]> {
  const client = getClient();

  try {
    const sets = await client.synonymSets().retrieve();
    const result: SynonymSetConfig[] = [];

    for (const set of sets) {
      result.push({
        name: set.name,
        items: (set.items || []).map((s) => {
          const item: SynonymSetItem = {
            id: s.id,
          };
          if (s.synonyms) item.synonyms = s.synonyms;
          if (s.root) item.root = s.root;
          if (s.symbols_to_index) item.symbols_to_index = s.symbols_to_index;
          if (s.locale) item.locale = s.locale;
          return item;
        }),
      });
    }

    return result;
  } catch (error: unknown) {
    // If synonym sets feature isn't available, return empty array
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
 * Create a synonym set in Typesense
 */
export async function createSynonymSet(config: SynonymSetConfig): Promise<void> {
  const client = getClient();

  // Upsert creates the set with all items
  await client.synonymSets(config.name).upsert({
    items: config.items.map((item) => ({
      id: item.id,
      synonyms: item.synonyms || [],
      root: item.root,
      locale: item.locale,
      symbols_to_index: item.symbols_to_index,
    })),
  });
}

/**
 * Delete a synonym set from Typesense
 */
export async function deleteSynonymSet(name: string): Promise<void> {
  const client = getClient();
  await client.synonymSets(name).delete();
}

/**
 * Update a synonym set (upsert with new items)
 */
export async function updateSynonymSet(
  config: SynonymSetConfig,
  _existing: SynonymSetConfig
): Promise<void> {
  const client = getClient();

  // Upsert replaces all items
  await client.synonymSets(config.name).upsert({
    items: config.items.map((item) => ({
      id: item.id,
      synonyms: item.synonyms || [],
      root: item.root,
      locale: item.locale,
      symbols_to_index: item.symbols_to_index,
    })),
  });
}

/**
 * Compare two synonym set configs for equality
 */
export function synonymSetConfigsEqual(
  a: SynonymSetConfig,
  b: SynonymSetConfig
): boolean {
  if (a.name !== b.name) return false;
  if (a.items.length !== b.items.length) return false;

  const aItems = [...a.items].sort((x, y) => x.id.localeCompare(y.id));
  const bItems = [...b.items].sort((x, y) => x.id.localeCompare(y.id));

  return JSON.stringify(aItems) === JSON.stringify(bItems);
}
