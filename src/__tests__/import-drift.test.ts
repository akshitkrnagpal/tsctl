import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import { getTypesenseVersion } from "./helpers.js";
import { importResources, detectDrift, buildPlan } from "../plan/index.js";
import { applyPlan } from "../apply/index.js";
import { loadState, saveState } from "../state/index.js";
import { createCollection, deleteCollection } from "../resources/collection.js";
import { upsertAlias, deleteAlias } from "../resources/alias.js";
import { upsertStopwordSet, deleteStopwordSet } from "../resources/stopword.js";
import { upsertPreset } from "../resources/preset.js";
import { createApiKey } from "../resources/apikey.js";
import type { TypesenseConfig, State } from "../types/index.js";

describe("import", () => {
  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  test("imports collections and aliases", async () => {
    await createCollection({
      name: "products",
      fields: [{ name: "title", type: "string" }],
    });
    await createCollection({
      name: "users",
      fields: [{ name: "name", type: "string" }],
    });
    await upsertAlias({ name: "products_live", collection: "products" });

    const result = await importResources();

    expect(result.collections.length).toBeGreaterThanOrEqual(2);
    const collectionNames = result.collections.map((c) => c.name);
    expect(collectionNames).toContain("products");
    expect(collectionNames).toContain("users");

    expect(result.aliases).toHaveLength(1);
    expect(result.aliases[0]!.name).toBe("products_live");
  });

  test("imports stopwords", async () => {
    await upsertStopwordSet({ id: "english", stopwords: ["the", "a", "an"] });

    const result = await importResources();

    expect(result.stopwords.length).toBeGreaterThanOrEqual(1);
    const ids = result.stopwords.map((s) => s.id);
    expect(ids).toContain("english");
  });

  test("imports presets", async () => {
    await upsertPreset({ name: "listing", value: { q: "*" } });

    const result = await importResources();

    expect(result.presets.length).toBeGreaterThanOrEqual(1);
    const names = result.presets.map((p) => p.name);
    expect(names).toContain("listing");
  });

  test("imports API keys", async () => {
    await createApiKey({
      description: "Test search key",
      actions: ["documents:search"],
      collections: ["*"],
    });

    const result = await importResources();

    const descriptions = result.apiKeys.map((k) => k.description);
    expect(descriptions).toContain("Test search key");
  });

  test("imports empty state when no resources exist", async () => {
    const result = await importResources();
    expect(result.collections).toHaveLength(0);
    expect(result.aliases).toHaveLength(0);
    expect(result.stopwords).toHaveLength(0);
    expect(result.presets).toHaveLength(0);
  });
});

describe("drift detection", () => {
  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  test("reports no drift when state matches", async () => {
    const config: TypesenseConfig = {
      collections: [
        { name: "products", fields: [{ name: "title", type: "string" }] },
      ],
    };
    const plan = await buildPlan(config);
    await applyPlan(plan, config);

    const report = await detectDrift();
    // May have no drift or just unmanaged resources
    const managedDrift = report.items.filter(
      (i) => i.type === "modified" || i.type === "deleted"
    );
    expect(managedDrift).toHaveLength(0);
  });

  test("detects deleted collection", async () => {
    // Apply config
    const config: TypesenseConfig = {
      collections: [
        { name: "products", fields: [{ name: "title", type: "string" }] },
      ],
    };
    const plan = await buildPlan(config);
    await applyPlan(plan, config);

    // Delete outside tsctl
    await deleteCollection("products");

    const report = await detectDrift();
    const deleted = report.items.filter((i) => i.type === "deleted");
    expect(deleted.length).toBeGreaterThanOrEqual(1);
    const deletedNames = deleted.map((i) => i.identifier.name);
    expect(deletedNames).toContain("products");
  });

  test("detects unmanaged collection", async () => {
    // Create collection outside tsctl (empty state)
    await createCollection({
      name: "unmanaged",
      fields: [{ name: "title", type: "string" }],
    });

    const report = await detectDrift();
    const unmanaged = report.items.filter((i) => i.type === "unmanaged");
    const unmanagedNames = unmanaged.map((i) => i.identifier.name);
    expect(unmanagedNames).toContain("unmanaged");
  });

  test("detects unmanaged alias", async () => {
    await createCollection({
      name: "products",
      fields: [{ name: "title", type: "string" }],
    });
    await upsertAlias({ name: "unmanaged_alias", collection: "products" });

    const report = await detectDrift();
    const unmanaged = report.items.filter(
      (i) => i.type === "unmanaged" && i.identifier.type === "alias"
    );
    expect(unmanaged.length).toBeGreaterThanOrEqual(1);
  });

  test("detects unmanaged stopword set", async () => {
    await upsertStopwordSet({ id: "unmanaged-sw", stopwords: ["the"] });

    const report = await detectDrift();
    const unmanaged = report.items.filter(
      (i) => i.type === "unmanaged" && i.identifier.type === "stopword"
    );
    const names = unmanaged.map((i) => i.identifier.name);
    expect(names).toContain("unmanaged-sw");
  });

  test("detects unmanaged preset", async () => {
    await upsertPreset({ name: "unmanaged-preset", value: { q: "*" } });

    const report = await detectDrift();
    const unmanaged = report.items.filter(
      (i) => i.type === "unmanaged" && i.identifier.type === "preset"
    );
    const names = unmanaged.map((i) => i.identifier.name);
    expect(names).toContain("unmanaged-preset");
  });

  test("detects deleted stopword set", async () => {
    // Apply config with stopword
    const config: TypesenseConfig = {
      stopwords: [{ id: "english", stopwords: ["the", "a"] }],
    };
    const plan = await buildPlan(config);
    await applyPlan(plan, config);

    // Delete outside tsctl
    await deleteStopwordSet("english");

    const report = await detectDrift();
    const deleted = report.items.filter(
      (i) => i.type === "deleted" && i.identifier.type === "stopword"
    );
    expect(deleted.length).toBeGreaterThanOrEqual(1);
  });

  test("hasDrift is false when no drift exists", async () => {
    // Empty state, no resources
    const report = await detectDrift();
    expect(report.hasDrift).toBe(false);
  });

  test("hasDrift is true when drift exists", async () => {
    await createCollection({
      name: "unmanaged",
      fields: [{ name: "x", type: "string" }],
    });

    const report = await detectDrift();
    expect(report.hasDrift).toBe(true);
  });

  test("summary counts are correct", async () => {
    // Create unmanaged resources
    await createCollection({
      name: "unmanaged1",
      fields: [{ name: "x", type: "string" }],
    });
    await upsertStopwordSet({ id: "unmanaged-sw", stopwords: ["the"] });

    const report = await detectDrift();
    expect(report.summary.unmanaged).toBeGreaterThanOrEqual(2);
    expect(report.summary.deleted).toBe(0);
    expect(report.summary.modified).toBe(0);
  });
});
