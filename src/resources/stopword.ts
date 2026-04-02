import { getClient } from "../client/index.js";
import type { StopwordSetConfig } from "../types/index.js";

/**
 * Get a stopword set from Typesense
 */
export async function getStopwordSet(
  id: string
): Promise<StopwordSetConfig | null> {
  const client = getClient();

  try {
    const raw = await client.stopwords(id).retrieve();
    // The retrieve response may wrap the data in a "stopwords" key
    const data = (raw as any).stopwords || raw;
    const config: StopwordSetConfig = {
      id: data.id || id,
      stopwords: Array.isArray(data.stopwords) ? data.stopwords : [],
    };
    if (data.locale) config.locale = data.locale;
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
 * List all stopword sets from Typesense
 */
export async function listStopwordSets(): Promise<StopwordSetConfig[]> {
  const client = getClient();

  try {
    const response = await client.stopwords().retrieve();
    return response.stopwords.map((s) => {
      const config: StopwordSetConfig = {
        id: s.id,
        stopwords: Array.isArray(s.stopwords) ? s.stopwords : [],
      };
      if (s.locale) config.locale = s.locale;
      return config;
    });
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
 * Create or update a stopword set in Typesense
 */
export async function upsertStopwordSet(
  config: StopwordSetConfig
): Promise<void> {
  const client = getClient();

  const params: { stopwords: string[]; locale?: string } = {
    stopwords: config.stopwords,
  };
  if (config.locale) params.locale = config.locale;

  await client.stopwords().upsert(config.id, params);
}

/**
 * Delete a stopword set from Typesense
 */
export async function deleteStopwordSet(id: string): Promise<void> {
  const client = getClient();
  await client.stopwords(id).delete();
}

/**
 * Compare two stopword set configs for equality
 */
export function stopwordSetConfigsEqual(
  a: StopwordSetConfig,
  b: StopwordSetConfig
): boolean {
  if (a.id !== b.id) return false;
  if (a.locale !== b.locale) return false;
  const aSorted = [...a.stopwords].sort();
  const bSorted = [...b.stopwords].sort();
  return JSON.stringify(aSorted) === JSON.stringify(bSorted);
}
