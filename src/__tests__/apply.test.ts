import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import { buildPlan } from "../plan/index.js";
import { applyPlan } from "../apply/index.js";
import { loadState } from "../state/index.js";
import { getCollection, createCollection } from "../resources/collection.js";
import { getAlias } from "../resources/alias.js";
import { getSynonym } from "../resources/synonym.js";
import { getOverride } from "../resources/override.js";
import { getApiKey } from "../resources/apikey.js";
import type { TypesenseConfig } from "../types/index.js";

describe("apply", () => {
  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  test("creates collection via apply", async () => {
    const config: TypesenseConfig = {
      collections: [
        {
          name: "products",
          fields: [
            { name: "title", type: "string" },
            { name: "price", type: "float" },
          ],
        },
      ],
    };

    const plan = await buildPlan(config);
    const result = await applyPlan(plan, config);

    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.failed).toHaveLength(0);

    const collection = await getCollection("products");
    expect(collection).not.toBeNull();
    expect(collection!.fields).toHaveLength(2);
  });

  test("creates alias via apply", async () => {
    const config: TypesenseConfig = {
      collections: [
        { name: "products", fields: [{ name: "title", type: "string" }] },
      ],
      aliases: [{ name: "products_live", collection: "products" }],
    };

    const plan = await buildPlan(config);
    await applyPlan(plan, config);

    const alias = await getAlias("products_live");
    expect(alias).not.toBeNull();
    expect(alias!.collection).toBe("products");
  });

  test("creates synonym via apply", async () => {
    // Create collection first
    await createCollection({
      name: "products",
      fields: [{ name: "title", type: "string" }],
    });

    const config: TypesenseConfig = {
      collections: [
        { name: "products", fields: [{ name: "title", type: "string" }] },
      ],
      synonyms: [
        { id: "phone-syn", collection: "products", synonyms: ["phone", "mobile"] },
      ],
    };

    const plan = await buildPlan(config);
    await applyPlan(plan, config);

    const synonym = await getSynonym("phone-syn", "products");
    expect(synonym).not.toBeNull();
  });

  test("creates override via apply", async () => {
    await createCollection({
      name: "products",
      fields: [{ name: "title", type: "string" }],
    });

    const config: TypesenseConfig = {
      collections: [
        { name: "products", fields: [{ name: "title", type: "string" }] },
      ],
      overrides: [
        {
          id: "pin-featured",
          collection: "products",
          rule: { query: "featured", match: "exact" },
          includes: [{ id: "product-1", position: 1 }],
        },
      ],
    };

    const plan = await buildPlan(config);
    await applyPlan(plan, config);

    const override = await getOverride("pin-featured", "products");
    expect(override).not.toBeNull();
  });

  test("creates API key via apply", async () => {
    const config: TypesenseConfig = {
      apiKeys: [
        {
          description: "Search key",
          actions: ["documents:search"],
          collections: ["products"],
        },
      ],
    };

    const plan = await buildPlan(config);
    await applyPlan(plan, config);

    const key = await getApiKey("Search key");
    expect(key).not.toBeNull();
    expect(key!.actions).toEqual(["documents:search"]);
  });

  test("saves state after apply", async () => {
    const config: TypesenseConfig = {
      collections: [
        { name: "products", fields: [{ name: "title", type: "string" }] },
      ],
    };

    const plan = await buildPlan(config);
    await applyPlan(plan, config);

    const state = await loadState();
    expect(state.resources).toHaveLength(1);
    expect(state.resources[0]!.identifier.type).toBe("collection");
    expect(state.resources[0]!.identifier.name).toBe("products");
  });

  test("no-op apply returns success with no applied changes", async () => {
    await createCollection({
      name: "products",
      fields: [{ name: "title", type: "string" }],
    });

    const config: TypesenseConfig = {
      collections: [
        { name: "products", fields: [{ name: "title", type: "string" }] },
      ],
    };

    const plan = await buildPlan(config);
    const result = await applyPlan(plan, config);

    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(0);
  });

  test("apply creates multiple resource types in correct order", async () => {
    const config: TypesenseConfig = {
      collections: [
        { name: "products", fields: [{ name: "title", type: "string" }] },
      ],
      aliases: [{ name: "products_live", collection: "products" }],
      apiKeys: [
        { description: "Search key", actions: ["documents:search"], collections: ["*"] },
      ],
    };

    const plan = await buildPlan(config);
    const result = await applyPlan(plan, config);

    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(3);

    // Verify all resources exist
    expect(await getCollection("products")).not.toBeNull();
    expect(await getAlias("products_live")).not.toBeNull();
    expect(await getApiKey("Search key")).not.toBeNull();
  });

  test("apply handles update to collection", async () => {
    // Initial apply
    const config1: TypesenseConfig = {
      collections: [
        { name: "products", fields: [{ name: "title", type: "string" }] },
      ],
    };
    const plan1 = await buildPlan(config1);
    await applyPlan(plan1, config1);

    // Update: change a field property
    const config2: TypesenseConfig = {
      collections: [
        {
          name: "products",
          fields: [
            { name: "title", type: "string", facet: true },
          ],
        },
      ],
    };
    const plan2 = await buildPlan(config2);
    const result = await applyPlan(plan2, config2);

    expect(result.success).toBe(true);
    expect(result.applied.length).toBeGreaterThan(0);
    const collection = await getCollection("products");
    const titleField = collection!.fields.find((f) => f.name === "title");
    expect(titleField!.facet).toBe(true);
  });

  test("apply handles deletion of resource", async () => {
    // Create and save state
    const config1: TypesenseConfig = {
      collections: [
        { name: "products", fields: [{ name: "title", type: "string" }] },
      ],
    };
    const plan1 = await buildPlan(config1);
    await applyPlan(plan1, config1);

    // Now apply empty config (should delete)
    const config2: TypesenseConfig = {};
    const plan2 = await buildPlan(config2);
    const result = await applyPlan(plan2, config2);

    expect(result.success).toBe(true);
    expect(await getCollection("products")).toBeNull();
  });
});
