import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import { getTypesenseVersion } from "./helpers.js";
import {
  createSynonymSet,
  getSynonymSet,
  listSynonymSets,
  updateSynonymSet,
  deleteSynonymSet,
  synonymSetConfigsEqual,
} from "../resources/synonymset.js";
import type { SynonymSetConfig } from "../types/index.js";

describe("synonym sets (global)", () => {
  let version: number;

  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
    version = await getTypesenseVersion();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  test("createSynonymSet creates a set", async () => {
    if (version < 28) return; // Synonym sets require v28+
    const config: SynonymSetConfig = {
      name: "clothing-synonyms",
      items: [
        { id: "pants", synonyms: ["pants", "trousers", "slacks"] },
        { id: "shirt", synonyms: ["shirt", "top", "blouse"] },
      ],
    };

    await createSynonymSet(config);
    const result = await getSynonymSet("clothing-synonyms");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("clothing-synonyms");
    expect(result!.items).toHaveLength(2);
  });

  test("getSynonymSet returns null for non-existent", async () => {
    if (version < 28) return;
    const result = await getSynonymSet("nonexistent");
    expect(result).toBeNull();
  });

  test("createSynonymSet with one-way synonyms", async () => {
    if (version < 28) return;
    const config: SynonymSetConfig = {
      name: "tv-synonyms",
      items: [
        { id: "tv", root: "television", synonyms: ["tv", "telly"] },
      ],
    };

    await createSynonymSet(config);
    const result = await getSynonymSet("tv-synonyms");
    expect(result).not.toBeNull();
    expect(result!.items[0]!.root).toBe("television");
  });

  test("listSynonymSets returns all sets", async () => {
    if (version < 28) return;
    await createSynonymSet({
      name: "set1",
      items: [{ id: "a", synonyms: ["x", "y"] }],
    });
    await createSynonymSet({
      name: "set2",
      items: [{ id: "b", synonyms: ["m", "n"] }],
    });

    const sets = await listSynonymSets();
    const names = sets.map((s) => s.name);
    expect(names).toContain("set1");
    expect(names).toContain("set2");
  });

  test("updateSynonymSet modifies items", async () => {
    if (version < 28) return;
    const initial: SynonymSetConfig = {
      name: "my-synonyms",
      items: [{ id: "a", synonyms: ["x", "y"] }],
    };
    await createSynonymSet(initial);

    const updated: SynonymSetConfig = {
      name: "my-synonyms",
      items: [
        { id: "a", synonyms: ["x", "y"] },
        { id: "b", synonyms: ["m", "n"] },
      ],
    };
    await updateSynonymSet(updated, initial);

    const result = await getSynonymSet("my-synonyms");
    expect(result!.items).toHaveLength(2);
  });

  test("deleteSynonymSet removes set", async () => {
    if (version < 28) return;
    await createSynonymSet({
      name: "to-delete",
      items: [{ id: "a", synonyms: ["x", "y"] }],
    });
    await deleteSynonymSet("to-delete");
    const result = await getSynonymSet("to-delete");
    expect(result).toBeNull();
  });

  test("synonymSetConfigsEqual compares correctly", () => {
    const a: SynonymSetConfig = {
      name: "test",
      items: [
        { id: "a", synonyms: ["x", "y"] },
        { id: "b", synonyms: ["m", "n"] },
      ],
    };
    const b: SynonymSetConfig = {
      name: "test",
      items: [
        { id: "b", synonyms: ["m", "n"] },
        { id: "a", synonyms: ["x", "y"] },
      ],
    };
    expect(synonymSetConfigsEqual(a, b)).toBe(true);
  });

  test("synonymSetConfigsEqual detects differences", () => {
    const a: SynonymSetConfig = {
      name: "test",
      items: [{ id: "a", synonyms: ["x", "y"] }],
    };
    const b: SynonymSetConfig = {
      name: "test",
      items: [{ id: "a", synonyms: ["x", "z"] }],
    };
    expect(synonymSetConfigsEqual(a, b)).toBe(false);
  });

  test("synonymSetConfigsEqual detects name difference", () => {
    const a: SynonymSetConfig = {
      name: "test1",
      items: [{ id: "a", synonyms: ["x"] }],
    };
    const b: SynonymSetConfig = {
      name: "test2",
      items: [{ id: "a", synonyms: ["x"] }],
    };
    expect(synonymSetConfigsEqual(a, b)).toBe(false);
  });

  test("synonymSetConfigsEqual detects length difference", () => {
    const a: SynonymSetConfig = {
      name: "test",
      items: [{ id: "a", synonyms: ["x"] }],
    };
    const b: SynonymSetConfig = {
      name: "test",
      items: [
        { id: "a", synonyms: ["x"] },
        { id: "b", synonyms: ["y"] },
      ],
    };
    expect(synonymSetConfigsEqual(a, b)).toBe(false);
  });
});
