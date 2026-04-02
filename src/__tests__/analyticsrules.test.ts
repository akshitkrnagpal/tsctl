import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import { getTypesenseVersion } from "./helpers.js";
import {
  createAnalyticsRule,
  getAnalyticsRule,
  listAnalyticsRules,
  updateAnalyticsRule,
  deleteAnalyticsRule,
  analyticsRuleConfigsEqual,
} from "../resources/analyticsrule.js";
import { createCollection } from "../resources/collection.js";
import type { AnalyticsRuleConfig } from "../types/index.js";

describe("analytics rules (integration)", () => {
  let version: number;

  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
    version = await getTypesenseVersion();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  test("creates popular_queries analytics rule", async () => {
    if (version >= 30) return; // Analytics rule API changed in v30 (requires source param)
    // Create source and destination collections
    await createCollection({
      name: "products",
      fields: [{ name: "title", type: "string" }],
    });
    await createCollection({
      name: "popular_queries",
      fields: [
        { name: "q", type: "string" },
        { name: "count", type: "int32" },
      ],
    });

    const rule: AnalyticsRuleConfig = {
      name: "product-popular-queries",
      type: "popular_queries",
      collection: "products",
      event_type: "search",
      params: {
        destination_collection: "popular_queries",
        limit: 1000,
      },
    };

    await createAnalyticsRule(rule);
    const result = await getAnalyticsRule("product-popular-queries");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("product-popular-queries");
    expect(result!.type).toBe("popular_queries");
    expect(result!.collection).toBe("products");
  });

  test("creates nohits_queries analytics rule", async () => {
    if (version >= 30) return;
    await createCollection({
      name: "products",
      fields: [{ name: "title", type: "string" }],
    });
    await createCollection({
      name: "nohits",
      fields: [
        { name: "q", type: "string" },
        { name: "count", type: "int32" },
      ],
    });

    const rule: AnalyticsRuleConfig = {
      name: "product-nohits",
      type: "nohits_queries",
      collection: "products",
      event_type: "search",
      params: {
        destination_collection: "nohits",
        limit: 500,
      },
    };

    await createAnalyticsRule(rule);
    const result = await getAnalyticsRule("product-nohits");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("nohits_queries");
  });

  test("creates counter analytics rule", async () => {
    if (version >= 30) return;
    await createCollection({
      name: "products",
      fields: [
        { name: "title", type: "string" },
        { name: "click_count", type: "int32" },
      ],
    });

    const rule: AnalyticsRuleConfig = {
      name: "product-clicks",
      type: "counter",
      collection: "products",
      event_type: "click",
      params: {
        counter_field: "click_count",
        weight: 1,
      },
    };

    await createAnalyticsRule(rule);
    const result = await getAnalyticsRule("product-clicks");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("counter");
    expect(result!.params?.counter_field).toBe("click_count");
  });

  test("getAnalyticsRule returns null for non-existent", async () => {
    const result = await getAnalyticsRule("nonexistent");
    expect(result).toBeNull();
  });

  test("listAnalyticsRules returns all rules", async () => {
    if (version >= 30) return;
    await createCollection({
      name: "products",
      fields: [{ name: "title", type: "string" }],
    });
    await createCollection({
      name: "popular_queries",
      fields: [
        { name: "q", type: "string" },
        { name: "count", type: "int32" },
      ],
    });
    await createCollection({
      name: "nohits",
      fields: [
        { name: "q", type: "string" },
        { name: "count", type: "int32" },
      ],
    });

    await createAnalyticsRule({
      name: "rule1",
      type: "popular_queries",
      collection: "products",
      event_type: "search",
      params: { destination_collection: "popular_queries" },
    });
    await createAnalyticsRule({
      name: "rule2",
      type: "nohits_queries",
      collection: "products",
      event_type: "search",
      params: { destination_collection: "nohits" },
    });

    const rules = await listAnalyticsRules();
    const names = rules.map((r) => r.name);
    expect(names).toContain("rule1");
    expect(names).toContain("rule2");
  });

  test("deleteAnalyticsRule removes rule", async () => {
    if (version >= 30) return;
    await createCollection({
      name: "products",
      fields: [{ name: "title", type: "string" }],
    });
    await createCollection({
      name: "popular",
      fields: [
        { name: "q", type: "string" },
        { name: "count", type: "int32" },
      ],
    });

    await createAnalyticsRule({
      name: "to-delete",
      type: "popular_queries",
      collection: "products",
      event_type: "search",
      params: { destination_collection: "popular" },
    });

    await deleteAnalyticsRule("to-delete");
    const result = await getAnalyticsRule("to-delete");
    expect(result).toBeNull();
  });

  test("updateAnalyticsRule modifies rule", async () => {
    if (version >= 30) return;
    await createCollection({
      name: "products",
      fields: [{ name: "title", type: "string" }],
    });
    await createCollection({
      name: "popular",
      fields: [
        { name: "q", type: "string" },
        { name: "count", type: "int32" },
      ],
    });

    await createAnalyticsRule({
      name: "my-rule",
      type: "popular_queries",
      collection: "products",
      event_type: "search",
      params: { destination_collection: "popular", limit: 100 },
    });

    await updateAnalyticsRule({
      name: "my-rule",
      type: "popular_queries",
      collection: "products",
      event_type: "search",
      params: { destination_collection: "popular", limit: 500 },
    });

    const result = await getAnalyticsRule("my-rule");
    expect(result!.params?.limit).toBe(500);
  });

  test("analyticsRuleConfigsEqual with matching params", () => {
    const a: AnalyticsRuleConfig = {
      name: "rule",
      type: "popular_queries",
      collection: "products",
      event_type: "search",
      params: { limit: 100 },
    };
    const b = { ...a };
    expect(analyticsRuleConfigsEqual(a, b)).toBe(true);
  });

  test("analyticsRuleConfigsEqual with different params", () => {
    const a: AnalyticsRuleConfig = {
      name: "rule",
      type: "popular_queries",
      collection: "products",
      event_type: "search",
      params: { limit: 100 },
    };
    const b: AnalyticsRuleConfig = {
      ...a,
      params: { limit: 200 },
    };
    expect(analyticsRuleConfigsEqual(a, b)).toBe(false);
  });
});
