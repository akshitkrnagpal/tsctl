import { getClient } from "../client/index.js";
import type { SynonymConfig } from "../types/index.js";

/**
 * Convert our SynonymConfig to Typesense API format
 */
function toTypesenseSynonym(config: SynonymConfig): {
  synonyms?: string[];
  root?: string;
  symbols_to_index?: string[];
  locale?: string;
} {
  const result: {
    synonyms?: string[];
    root?: string;
    symbols_to_index?: string[];
    locale?: string;
  } = {};

  if (config.synonyms) result.synonyms = config.synonyms;
  if (config.root) result.root = config.root;
  if (config.symbols_to_index) result.symbols_to_index = config.symbols_to_index;
  if (config.locale) result.locale = config.locale;

  return result;
}

/**
 * Convert Typesense API synonym to our SynonymConfig format
 */
function fromTypesenseSynonym(
  synonym: {
    id: string;
    synonyms?: string[];
    root?: string;
    symbols_to_index?: string[];
    locale?: string;
  },
  collection: string
): SynonymConfig {
  const config: SynonymConfig = {
    id: synonym.id,
    collection,
  };

  if (synonym.synonyms) config.synonyms = synonym.synonyms;
  if (synonym.root) config.root = synonym.root;
  if (synonym.symbols_to_index) config.symbols_to_index = synonym.symbols_to_index;
  if (synonym.locale) config.locale = synonym.locale;

  return config;
}

/**
 * Get a synonym from Typesense
 */
export async function getSynonym(
  id: string,
  collection: string
): Promise<SynonymConfig | null> {
  const client = getClient();

  try {
    const synonym = await client.collections(collection).synonyms(id).retrieve();
    return fromTypesenseSynonym(synonym, collection);
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
 * List all synonyms for a collection from Typesense
 */
export async function listSynonyms(collection: string): Promise<SynonymConfig[]> {
  const client = getClient();

  try {
    const response = await client.collections(collection).synonyms().retrieve();
    return response.synonyms.map((synonym: {
      id: string;
      synonyms?: string[];
      root?: string;
      symbols_to_index?: string[];
      locale?: string;
    }) => fromTypesenseSynonym(synonym, collection));
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
 * List all synonyms across all collections
 */
export async function listAllSynonyms(
  collections: string[]
): Promise<SynonymConfig[]> {
  const allSynonyms: SynonymConfig[] = [];

  for (const collection of collections) {
    const synonyms = await listSynonyms(collection);
    allSynonyms.push(...synonyms);
  }

  return allSynonyms;
}

/**
 * Create or update a synonym in Typesense
 * Synonyms are upserted in Typesense
 */
export async function upsertSynonym(config: SynonymConfig): Promise<void> {
  const client = getClient();
  const synonymData = toTypesenseSynonym(config);

  // Typesense requires either synonyms or root to be present
  if (!synonymData.synonyms && !synonymData.root) {
    throw new Error(
      `Synonym ${config.id} must have either 'synonyms' or 'root' defined`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client
    .collections(config.collection)
    .synonyms()
    .upsert(config.id, synonymData as any);
}

/**
 * Delete a synonym from Typesense
 */
export async function deleteSynonym(id: string, collection: string): Promise<void> {
  const client = getClient();
  await client.collections(collection).synonyms(id).delete();
}
