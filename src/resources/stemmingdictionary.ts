import { getClient } from "../client/index.js";
import type { StemmingDictionaryConfig, StemmingWord } from "../types/index.js";

/**
 * Get a stemming dictionary from Typesense
 */
export async function getStemmingDictionary(
  id: string
): Promise<StemmingDictionaryConfig | null> {
  const client = getClient();

  try {
    const data = await client.stemming.dictionaries(id).retrieve();
    return {
      id: data.id,
      words: data.words.map((w) => ({
        word: w.word,
        root: w.root,
      })),
    };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      (error.httpStatus === 404 || error.httpStatus === 400)
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * List all stemming dictionaries from Typesense
 */
export async function listStemmingDictionaries(): Promise<
  StemmingDictionaryConfig[]
> {
  const client = getClient();

  try {
    const response = await client.stemming.dictionaries().retrieve();
    const dictionaries: StemmingDictionaryConfig[] = [];

    for (const dictId of response.dictionaries) {
      try {
        const dict = await client.stemming.dictionaries(dictId).retrieve();
        dictionaries.push({
          id: dict.id,
          words: dict.words.map((w) => ({
            word: w.word,
            root: w.root,
          })),
        });
      } catch {
        // Skip dictionaries we can't retrieve
      }
    }

    return dictionaries;
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
 * Create or update a stemming dictionary in Typesense
 * Stemming dictionaries are uploaded as arrays of word/root pairs
 */
export async function upsertStemmingDictionary(
  config: StemmingDictionaryConfig
): Promise<void> {
  const client = getClient();
  await client.stemming.dictionaries().upsert(
    config.id,
    config.words.map((w) => ({ word: w.word, root: w.root }))
  );
}

/**
 * Compare two stemming dictionary configs for equality
 */
export function stemmingDictionaryConfigsEqual(
  a: StemmingDictionaryConfig,
  b: StemmingDictionaryConfig
): boolean {
  if (a.id !== b.id) return false;
  if (a.words.length !== b.words.length) return false;

  const aWords = [...a.words].sort((x, y) => x.word.localeCompare(y.word));
  const bWords = [...b.words].sort((x, y) => x.word.localeCompare(y.word));

  return JSON.stringify(aWords) === JSON.stringify(bWords);
}
