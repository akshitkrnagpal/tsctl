import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import { getTypesenseVersion } from "./helpers.js";
import {
  upsertStemmingDictionary,
  getStemmingDictionary,
  listStemmingDictionaries,
  stemmingDictionaryConfigsEqual,
} from "../resources/stemmingdictionary.js";

describe("stemming dictionaries", () => {
  let version: number;

  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
    version = await getTypesenseVersion();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  test("upsertStemmingDictionary creates a dictionary", async () => {
    if (version < 28) return; // Stemming API requires v28+
    await upsertStemmingDictionary({
      id: "english-plurals",
      words: [
        { word: "dogs", root: "dog" },
        { word: "cats", root: "cat" },
        { word: "mice", root: "mouse" },
      ],
    });

    const result = await getStemmingDictionary("english-plurals");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("english-plurals");
    expect(result!.words).toHaveLength(3);
  });

  test("getStemmingDictionary returns null for non-existent", async () => {
    if (version < 28) return;
    const result = await getStemmingDictionary("nonexistent");
    expect(result).toBeNull();
  });

  test("listStemmingDictionaries returns all dictionaries", async () => {
    if (version < 28) return;
    await upsertStemmingDictionary({
      id: "dict1",
      words: [{ word: "running", root: "run" }],
    });
    await upsertStemmingDictionary({
      id: "dict2",
      words: [{ word: "jumping", root: "jump" }],
    });

    const dicts = await listStemmingDictionaries();
    const ids = dicts.map((d) => d.id);
    expect(ids).toContain("dict1");
    expect(ids).toContain("dict2");
  });

  test("upsertStemmingDictionary updates existing dictionary", async () => {
    if (version < 28) return;
    await upsertStemmingDictionary({
      id: "my-dict",
      words: [{ word: "dogs", root: "dog" }],
    });
    await upsertStemmingDictionary({
      id: "my-dict",
      words: [
        { word: "dogs", root: "dog" },
        { word: "cats", root: "cat" },
      ],
    });

    const result = await getStemmingDictionary("my-dict");
    expect(result!.words).toHaveLength(2);
  });

  test("stemmingDictionaryConfigsEqual compares correctly", () => {
    const a = {
      id: "test",
      words: [
        { word: "dogs", root: "dog" },
        { word: "cats", root: "cat" },
      ],
    };
    const b = {
      id: "test",
      words: [
        { word: "cats", root: "cat" },
        { word: "dogs", root: "dog" },
      ],
    };
    expect(stemmingDictionaryConfigsEqual(a, b)).toBe(true);
  });

  test("stemmingDictionaryConfigsEqual detects differences", () => {
    const a = {
      id: "test",
      words: [{ word: "dogs", root: "dog" }],
    };
    const b = {
      id: "test",
      words: [{ word: "cats", root: "cat" }],
    };
    expect(stemmingDictionaryConfigsEqual(a, b)).toBe(false);
  });
});
