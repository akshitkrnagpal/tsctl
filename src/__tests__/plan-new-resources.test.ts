import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import { getTypesenseVersion } from "./helpers.js";
import { buildPlan } from "../plan/index.js";
import { applyPlan } from "../apply/index.js";
import { loadState } from "../state/index.js";
import { getStopwordSet } from "../resources/stopword.js";
import { getPreset } from "../resources/preset.js";
import { getCurationSet } from "../resources/curationset.js";
import { upsertStopwordSet } from "../resources/stopword.js";
import { upsertPreset } from "../resources/preset.js";
import type { TypesenseConfig } from "../types/index.js";

describe("plan/apply with new resource types", () => {
  let version: number;

  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
    version = await getTypesenseVersion();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  describe("stopwords", () => {
    test("plans creation for new stopword set", async () => {
      const config: TypesenseConfig = {
        stopwords: [
          { id: "english", stopwords: ["the", "a", "an"] },
        ],
      };
      const plan = await buildPlan(config);
      const change = plan.changes.find((c) => c.identifier.type === "stopword");
      expect(change).toBeDefined();
      expect(change!.action).toBe("create");
    });

    test("plans no-change for existing stopword set", async () => {
      await upsertStopwordSet({ id: "english", stopwords: ["the", "a", "an"] });
      const config: TypesenseConfig = {
        stopwords: [
          { id: "english", stopwords: ["the", "a", "an"] },
        ],
      };
      const plan = await buildPlan(config);
      const change = plan.changes.find((c) => c.identifier.type === "stopword");
      expect(change!.action).toBe("no-change");
    });

    test("plans update for modified stopword set", async () => {
      await upsertStopwordSet({ id: "english", stopwords: ["the", "a"] });
      const config: TypesenseConfig = {
        stopwords: [
          { id: "english", stopwords: ["the", "a", "an", "is"] },
        ],
      };
      const plan = await buildPlan(config);
      const change = plan.changes.find((c) => c.identifier.type === "stopword");
      expect(change!.action).toBe("update");
    });

    test("creates stopword set via apply", async () => {
      const config: TypesenseConfig = {
        stopwords: [
          { id: "english", stopwords: ["the", "a", "an"] },
        ],
      };
      const plan = await buildPlan(config);
      await applyPlan(plan, config);

      const result = await getStopwordSet("english");
      expect(result).not.toBeNull();
      expect(result!.stopwords).toContain("the");
    });

    test("deletes stopword set via apply", async () => {
      // Create and apply
      const config1: TypesenseConfig = {
        stopwords: [{ id: "english", stopwords: ["the"] }],
      };
      const plan1 = await buildPlan(config1);
      await applyPlan(plan1, config1);

      // Delete
      const config2: TypesenseConfig = {};
      const plan2 = await buildPlan(config2);
      await applyPlan(plan2, config2);

      const result = await getStopwordSet("english");
      expect(result).toBeNull();
    });
  });

  describe("presets", () => {
    test("plans creation for new preset", async () => {
      const config: TypesenseConfig = {
        presets: [
          { name: "listing", value: { q: "*", sort_by: "price:asc" } },
        ],
      };
      const plan = await buildPlan(config);
      const change = plan.changes.find((c) => c.identifier.type === "preset");
      expect(change).toBeDefined();
      expect(change!.action).toBe("create");
    });

    test("creates preset via apply", async () => {
      const config: TypesenseConfig = {
        presets: [
          { name: "listing", value: { q: "*" } },
        ],
      };
      const plan = await buildPlan(config);
      await applyPlan(plan, config);

      const result = await getPreset("listing");
      expect(result).not.toBeNull();
    });

    test("plans no-change for existing preset", async () => {
      await upsertPreset({ name: "listing", value: { q: "*" } });
      const config: TypesenseConfig = {
        presets: [
          { name: "listing", value: { q: "*" } },
        ],
      };
      const plan = await buildPlan(config);
      const change = plan.changes.find((c) => c.identifier.type === "preset");
      expect(change!.action).toBe("no-change");
    });

    test("deletes preset via apply", async () => {
      const config1: TypesenseConfig = {
        presets: [{ name: "listing", value: { q: "*" } }],
      };
      const plan1 = await buildPlan(config1);
      await applyPlan(plan1, config1);

      const config2: TypesenseConfig = {};
      const plan2 = await buildPlan(config2);
      await applyPlan(plan2, config2);

      const result = await getPreset("listing");
      expect(result).toBeNull();
    });
  });

  describe("curation sets (v30+)", () => {
    test("plans creation for new curation set", async () => {
      if (version < 30) return;
      const config: TypesenseConfig = {
        curationSets: [
          {
            name: "products",
            items: [
              {
                id: "featured",
                rule: { query: "featured", match: "exact" },
                includes: [{ id: "product-1", position: 1 }],
              },
            ],
          },
        ],
      };
      const plan = await buildPlan(config);
      const change = plan.changes.find((c) => c.identifier.type === "curationSet");
      expect(change).toBeDefined();
      expect(change!.action).toBe("create");
    });

    test("creates curation set via apply", async () => {
      if (version < 30) return;
      const config: TypesenseConfig = {
        curationSets: [
          {
            name: "products",
            items: [
              {
                id: "boost-shoes",
                rule: { query: "shoes", match: "contains" },
                filter_by: "category:=footwear",
              },
            ],
          },
        ],
      };
      const plan = await buildPlan(config);
      await applyPlan(plan, config);

      const result = await getCurationSet("products");
      expect(result).not.toBeNull();
      expect(result!.items).toHaveLength(1);
    });

    test("deletes curation set via apply", async () => {
      if (version < 30) return;
      const config1: TypesenseConfig = {
        curationSets: [
          {
            name: "products",
            items: [
              {
                id: "rule1",
                rule: { query: "x", match: "exact" },
                filter_by: "a:=1",
              },
            ],
          },
        ],
      };
      const plan1 = await buildPlan(config1);
      await applyPlan(plan1, config1);

      const config2: TypesenseConfig = {};
      const plan2 = await buildPlan(config2);
      await applyPlan(plan2, config2);

      const result = await getCurationSet("products");
      expect(result).toBeNull();
    });
  });

  describe("full config with all resource types", () => {
    test("applies config with stopwords, presets, and collections", async () => {
      const config: TypesenseConfig = {
        collections: [
          { name: "products", fields: [{ name: "title", type: "string" }] },
        ],
        aliases: [{ name: "products_live", collection: "products" }],
        stopwords: [
          { id: "english", stopwords: ["the", "a"] },
        ],
        presets: [
          { name: "default_search", value: { q: "*" } },
        ],
        apiKeys: [
          { description: "Search key", actions: ["documents:search"], collections: ["*"] },
        ],
      };

      const plan = await buildPlan(config);
      const result = await applyPlan(plan, config);

      expect(result.success).toBe(true);

      // Verify state
      const state = await loadState();
      const types = state.resources.map((r) => r.identifier.type);
      expect(types).toContain("collection");
      expect(types).toContain("alias");
      expect(types).toContain("stopword");
      expect(types).toContain("preset");
      expect(types).toContain("apiKey");
    });
  });
});
