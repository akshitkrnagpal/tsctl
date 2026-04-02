import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import {
  generateVersionedName,
  extractBaseName,
  findCollectionVersions,
  planMigration,
  executeMigration,
  formatMigrationPlan,
} from "../migrate/index.js";
import { createCollection, getCollection } from "../resources/collection.js";
import { upsertAlias, getAlias } from "../resources/alias.js";
import type { CollectionConfig } from "../types/index.js";

describe("migrate advanced", () => {
  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  describe("versioned naming", () => {
    test("extractBaseName handles multiple underscores", () => {
      expect(extractBaseName("my_cool_products_1706486400000")).toBe("my_cool_products");
    });

    test("extractBaseName ignores non-timestamp suffixes", () => {
      expect(extractBaseName("products_v2")).toBe("products_v2");
    });

    test("extractBaseName handles plain name", () => {
      expect(extractBaseName("products")).toBe("products");
    });

    test("generateVersionedName format is correct", () => {
      const name = generateVersionedName("my_collection");
      expect(name).toMatch(/^my_collection_\d{13}$/);
    });
  });

  describe("findCollectionVersions", () => {
    test("returns empty for non-existent collection", async () => {
      const versions = await findCollectionVersions("nonexistent");
      expect(versions).toHaveLength(0);
    });

    test("finds base collection and versioned copies", async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });
      await createCollection({
        name: "products_1706486400000",
        fields: [{ name: "title", type: "string" }],
      });

      const versions = await findCollectionVersions("products");
      expect(versions).toHaveLength(2);
    });

    test("does not include unrelated collections", async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });
      await createCollection({
        name: "orders",
        fields: [{ name: "id", type: "string" }],
      });

      const versions = await findCollectionVersions("products");
      expect(versions).toHaveLength(1);
      expect(versions[0]!.name).toBe("products");
    });
  });

  describe("planMigration", () => {
    test("creates correct plan without existing alias", async () => {
      const config: CollectionConfig = {
        name: "products",
        fields: [
          { name: "title", type: "string" },
          { name: "price", type: "float" },
        ],
      };

      const plan = await planMigration("products_live", config);
      expect(plan.alias).toBe("products_live");
      expect(plan.currentCollection).toBeNull();
      expect(plan.newCollection).toMatch(/^products_\d{13}$/);
      expect(plan.newCollectionConfig.name).toBe(plan.newCollection);
      expect(plan.newCollectionConfig.fields).toHaveLength(2);
    });

    test("plan includes delete step when alias exists", async () => {
      await createCollection({
        name: "products_old",
        fields: [{ name: "title", type: "string" }],
      });
      await upsertAlias({ name: "products_live", collection: "products_old" });

      const plan = await planMigration("products_live", {
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });

      expect(plan.currentCollection).toBe("products_old");
      const stepActions = plan.steps.map((s) => s.action);
      expect(stepActions).toContain("create_collection");
      expect(stepActions).toContain("switch_alias");
      expect(stepActions).toContain("delete_old_collection");
    });
  });

  describe("executeMigration", () => {
    test("full migration with schema change", async () => {
      // Create v1
      await createCollection({
        name: "products_v1",
        fields: [{ name: "title", type: "string" }],
      });
      await upsertAlias({ name: "products_live", collection: "products_v1" });

      // Migrate to v2 with new fields
      const plan = await planMigration("products_live", {
        name: "products",
        fields: [
          { name: "title", type: "string" },
          { name: "description", type: "string", optional: true },
          { name: "price", type: "float" },
        ],
      });

      const result = await executeMigration(plan);
      expect(result.success).toBe(true);

      // Verify new collection has updated schema
      const newCollection = await getCollection(plan.newCollection);
      expect(newCollection).not.toBeNull();
      expect(newCollection!.fields.length).toBeGreaterThanOrEqual(3);

      // Verify alias points to new collection
      const alias = await getAlias("products_live");
      expect(alias!.collection).toBe(plan.newCollection);

      // Verify old collection was deleted
      const oldCollection = await getCollection("products_v1");
      expect(oldCollection).toBeNull();
    });

    test("migration with skipDelete preserves old collection", async () => {
      await createCollection({
        name: "old_coll",
        fields: [{ name: "title", type: "string" }],
      });
      await upsertAlias({ name: "my_alias", collection: "old_coll" });

      const plan = await planMigration("my_alias", {
        name: "my_collection",
        fields: [{ name: "title", type: "string" }],
      });

      const result = await executeMigration(plan, { skipDelete: true });
      expect(result.success).toBe(true);

      // Old collection should still exist
      const oldColl = await getCollection("old_coll");
      expect(oldColl).not.toBeNull();

      // But alias should point to new
      const alias = await getAlias("my_alias");
      expect(alias!.collection).toBe(plan.newCollection);
    });

    test("formatMigrationPlan produces readable output", async () => {
      await createCollection({
        name: "products_old",
        fields: [{ name: "title", type: "string" }],
      });
      await upsertAlias({ name: "products_live", collection: "products_old" });

      const plan = await planMigration("products_live", {
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });

      const output = formatMigrationPlan(plan);
      expect(output).toContain("Migration Plan");
      expect(output).toContain("products_live");
      expect(output).toContain("products_old");
      expect(output).toContain(plan.newCollection);
    });
  });
});
