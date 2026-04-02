import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import { getTypesenseVersion } from "./helpers.js";
import {
  createCurationSet,
  getCurationSet,
  listCurationSets,
  updateCurationSet,
  deleteCurationSet,
  curationSetConfigsEqual,
} from "../resources/curationset.js";
import type { CurationSetConfig } from "../types/index.js";

describe("curation sets (v30+)", () => {
  let version: number;

  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
    version = await getTypesenseVersion();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  test("createCurationSet creates a curation set", async () => {
    if (version < 30) return; // Skip on pre-v30

    const config: CurationSetConfig = {
      name: "product-curations",
      items: [
        {
          id: "pin-featured",
          rule: { query: "featured", match: "exact" },
          includes: [{ id: "product-123", position: 1 }],
        },
      ],
    };

    await createCurationSet(config);
    const result = await getCurationSet("product-curations");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("product-curations");
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0]!.id).toBe("pin-featured");
  });

  test("getCurationSet returns null for non-existent", async () => {
    if (version < 30) return;

    const result = await getCurationSet("nonexistent");
    expect(result).toBeNull();
  });

  test("createCurationSet with filter_by rule", async () => {
    if (version < 30) return;

    const config: CurationSetConfig = {
      name: "category-boost",
      items: [
        {
          id: "boost-shoes",
          rule: { query: "shoes", match: "contains" },
          filter_by: "category:=footwear",
          sort_by: "popularity:desc",
        },
      ],
    };

    await createCurationSet(config);
    const result = await getCurationSet("category-boost");
    expect(result).not.toBeNull();
    expect(result!.items[0]!.filter_by).toBe("category:=footwear");
  });

  test("listCurationSets returns all curation sets", async () => {
    if (version < 30) return;

    await createCurationSet({
      name: "set1",
      items: [
        {
          id: "rule1",
          rule: { query: "a", match: "exact" },
          filter_by: "x:=1",
        },
      ],
    });
    await createCurationSet({
      name: "set2",
      items: [
        {
          id: "rule2",
          rule: { query: "b", match: "exact" },
          filter_by: "y:=2",
        },
      ],
    });

    const sets = await listCurationSets();
    const names = sets.map((s) => s.name);
    expect(names).toContain("set1");
    expect(names).toContain("set2");
  });

  test("updateCurationSet modifies items", async () => {
    if (version < 30) return;

    const initial: CurationSetConfig = {
      name: "my-curations",
      items: [
        {
          id: "rule1",
          rule: { query: "a", match: "exact" },
          filter_by: "x:=1",
        },
      ],
    };
    await createCurationSet(initial);

    const updated: CurationSetConfig = {
      name: "my-curations",
      items: [
        {
          id: "rule1",
          rule: { query: "a", match: "exact" },
          filter_by: "x:=1",
        },
        {
          id: "rule2",
          rule: { query: "b", match: "contains" },
          filter_by: "y:=2",
        },
      ],
    };
    await updateCurationSet(updated, initial);

    const result = await getCurationSet("my-curations");
    expect(result!.items).toHaveLength(2);
  });

  test("deleteCurationSet removes set", async () => {
    if (version < 30) return;

    await createCurationSet({
      name: "to-delete",
      items: [
        {
          id: "rule1",
          rule: { query: "x", match: "exact" },
          filter_by: "a:=1",
        },
      ],
    });
    await deleteCurationSet("to-delete");
    const result = await getCurationSet("to-delete");
    expect(result).toBeNull();
  });

  test("curationSetConfigsEqual compares correctly", () => {
    const a: CurationSetConfig = {
      name: "test",
      items: [
        { id: "a", rule: { query: "x", match: "exact" } },
        { id: "b", rule: { query: "y", match: "contains" } },
      ],
    };
    const b: CurationSetConfig = {
      name: "test",
      items: [
        { id: "b", rule: { query: "y", match: "contains" } },
        { id: "a", rule: { query: "x", match: "exact" } },
      ],
    };
    expect(curationSetConfigsEqual(a, b)).toBe(true);
  });

  test("curationSetConfigsEqual detects differences", () => {
    const a: CurationSetConfig = {
      name: "test",
      items: [{ id: "a", rule: { query: "x", match: "exact" } }],
    };
    const b: CurationSetConfig = {
      name: "test",
      items: [{ id: "a", rule: { query: "y", match: "exact" } }],
    };
    expect(curationSetConfigsEqual(a, b)).toBe(false);
  });
});
