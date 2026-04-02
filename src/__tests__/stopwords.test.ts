import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import {
  upsertStopwordSet,
  getStopwordSet,
  listStopwordSets,
  deleteStopwordSet,
  stopwordSetConfigsEqual,
} from "../resources/stopword.js";

describe("stopwords", () => {
  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  test("upsertStopwordSet creates a stopword set", async () => {
    await upsertStopwordSet({
      id: "english-stopwords",
      stopwords: ["the", "a", "an", "is", "are"],
    });

    const result = await getStopwordSet("english-stopwords");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("english-stopwords");
    expect(result!.stopwords).toContain("the");
    expect(result!.stopwords).toContain("a");
  });

  test("upsertStopwordSet creates with locale", async () => {
    await upsertStopwordSet({
      id: "german-stopwords",
      stopwords: ["der", "die", "das"],
      locale: "de",
    });

    const result = await getStopwordSet("german-stopwords");
    expect(result).not.toBeNull();
    expect(result!.locale).toBe("de");
  });

  test("getStopwordSet returns null for non-existent", async () => {
    const result = await getStopwordSet("nonexistent");
    expect(result).toBeNull();
  });

  test("listStopwordSets returns all stopword sets", async () => {
    await upsertStopwordSet({
      id: "english",
      stopwords: ["the", "a"],
    });
    await upsertStopwordSet({
      id: "german",
      stopwords: ["der", "die"],
    });

    const sets = await listStopwordSets();
    expect(sets.length).toBeGreaterThanOrEqual(2);
    const ids = sets.map((s) => s.id);
    expect(ids).toContain("english");
    expect(ids).toContain("german");
  });

  test("upsertStopwordSet updates existing set", async () => {
    await upsertStopwordSet({
      id: "english",
      stopwords: ["the", "a"],
    });
    await upsertStopwordSet({
      id: "english",
      stopwords: ["the", "a", "an"],
    });

    const result = await getStopwordSet("english");
    expect(result!.stopwords).toHaveLength(3);
  });

  test("deleteStopwordSet removes set", async () => {
    await upsertStopwordSet({
      id: "to-delete",
      stopwords: ["the"],
    });
    await deleteStopwordSet("to-delete");
    const result = await getStopwordSet("to-delete");
    expect(result).toBeNull();
  });

  test("stopwordSetConfigsEqual compares correctly", () => {
    const a = { id: "test", stopwords: ["a", "b", "c"] };
    const b = { id: "test", stopwords: ["c", "b", "a"] };
    expect(stopwordSetConfigsEqual(a, b)).toBe(true);
  });

  test("stopwordSetConfigsEqual detects differences", () => {
    const a = { id: "test", stopwords: ["a", "b"] };
    const b = { id: "test", stopwords: ["a", "c"] };
    expect(stopwordSetConfigsEqual(a, b)).toBe(false);
  });

  test("stopwordSetConfigsEqual considers locale", () => {
    const a = { id: "test", stopwords: ["a"], locale: "en" };
    const b = { id: "test", stopwords: ["a"], locale: "de" };
    expect(stopwordSetConfigsEqual(a, b)).toBe(false);
  });
});
