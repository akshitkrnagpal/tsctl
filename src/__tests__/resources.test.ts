import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import {
  createCollection,
  getCollection,
  listCollections,
  updateCollection,
  deleteCollection,
} from "../resources/collection.js";
import {
  upsertAlias,
  getAlias,
  listAliases,
  deleteAlias,
} from "../resources/alias.js";
import {
  upsertSynonym,
  getSynonym,
  listSynonyms,
  listAllSynonyms,
  deleteSynonym,
} from "../resources/synonym.js";
import {
  upsertOverride,
  getOverride,
  listOverrides,
  listAllOverrides,
  deleteOverride,
} from "../resources/override.js";
import {
  createApiKey,
  getApiKey,
  listApiKeys,
  deleteApiKey,
  deleteApiKeyByDescription,
  apiKeyConfigsEqual,
} from "../resources/apikey.js";
import {
  createAnalyticsRule,
  getAnalyticsRule,
  listAnalyticsRules,
  deleteAnalyticsRule,
  analyticsRuleConfigsEqual,
} from "../resources/analyticsrule.js";
import type {
  CollectionConfig,
  AliasConfig,
  SynonymConfig,
  OverrideConfig,
  ApiKeyConfig,
} from "../types/index.js";

describe("resources", () => {
  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  describe("collections", () => {
    const productConfig: CollectionConfig = {
      name: "products",
      fields: [
        { name: "title", type: "string" },
        { name: "price", type: "float" },
        { name: "category", type: "string", facet: true },
      ],
      default_sorting_field: "price",
    };

    test("createCollection creates a new collection", async () => {
      await createCollection(productConfig);
      const retrieved = await getCollection("products");
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe("products");
      expect(retrieved!.fields).toHaveLength(3);
      expect(retrieved!.default_sorting_field).toBe("price");
    });

    test("getCollection returns null for non-existent", async () => {
      const result = await getCollection("nonexistent");
      expect(result).toBeNull();
    });

    test("listCollections returns all collections excluding state", async () => {
      await createCollection(productConfig);
      await createCollection({
        name: "users",
        fields: [{ name: "name", type: "string" }],
      });

      const collections = await listCollections();
      const names = collections.map((c) => c.name);
      expect(names).toContain("products");
      expect(names).toContain("users");
      expect(names).not.toContain("_tsctl_state");
    });

    test("updateCollection adds new fields", async () => {
      await createCollection(productConfig);

      const updatedConfig: CollectionConfig = {
        ...productConfig,
        fields: [
          ...productConfig.fields,
          { name: "description", type: "string", optional: true },
        ],
      };

      const result = await updateCollection(updatedConfig, productConfig);
      expect(result.fieldsToAdd).toHaveLength(1);
      expect(result.fieldsToAdd[0]!.name).toBe("description");

      const retrieved = await getCollection("products");
      const fieldNames = retrieved!.fields.map((f) => f.name);
      expect(fieldNames).toContain("description");
    });

    test("updateCollection drops removed fields", async () => {
      await createCollection(productConfig);

      const updatedConfig: CollectionConfig = {
        name: "products",
        fields: [
          { name: "title", type: "string" },
          { name: "price", type: "float" },
          // category field removed
        ],
        default_sorting_field: "price",
      };

      const result = await updateCollection(updatedConfig, productConfig);
      expect(result.fieldsToDrop).toContain("category");
    });

    test("deleteCollection removes collection", async () => {
      await createCollection(productConfig);
      await deleteCollection("products");
      const result = await getCollection("products");
      expect(result).toBeNull();
    });

    test("collection with token_separators and symbols_to_index", async () => {
      const config: CollectionConfig = {
        name: "custom",
        fields: [{ name: "title", type: "string" }],
        token_separators: ["-", "/"],
        symbols_to_index: ["#", "@"],
      };
      await createCollection(config);
      const retrieved = await getCollection("custom");
      expect(retrieved!.token_separators).toEqual(["-", "/"]);
      expect(retrieved!.symbols_to_index).toEqual(["#", "@"]);
    });

    test("collection with enable_nested_fields", async () => {
      const config: CollectionConfig = {
        name: "nested",
        fields: [{ name: "metadata", type: "object" }],
        enable_nested_fields: true,
      };
      await createCollection(config);
      const retrieved = await getCollection("nested");
      expect(retrieved!.enable_nested_fields).toBe(true);
    });
  });

  describe("aliases", () => {
    test("upsertAlias creates alias", async () => {
      // Create target collection first
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });

      await upsertAlias({ name: "products_live", collection: "products" });
      const alias = await getAlias("products_live");
      expect(alias).not.toBeNull();
      expect(alias!.name).toBe("products_live");
      expect(alias!.collection).toBe("products");
    });

    test("getAlias returns null for non-existent", async () => {
      const result = await getAlias("nonexistent");
      expect(result).toBeNull();
    });

    test("upsertAlias updates existing alias", async () => {
      await createCollection({
        name: "products_v1",
        fields: [{ name: "title", type: "string" }],
      });
      await createCollection({
        name: "products_v2",
        fields: [{ name: "title", type: "string" }],
      });

      await upsertAlias({ name: "products_live", collection: "products_v1" });
      await upsertAlias({ name: "products_live", collection: "products_v2" });

      const alias = await getAlias("products_live");
      expect(alias!.collection).toBe("products_v2");
    });

    test("listAliases returns all aliases", async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });
      await createCollection({
        name: "users",
        fields: [{ name: "name", type: "string" }],
      });

      await upsertAlias({ name: "products_live", collection: "products" });
      await upsertAlias({ name: "users_live", collection: "users" });

      const aliases = await listAliases();
      expect(aliases).toHaveLength(2);
      const names = aliases.map((a) => a.name);
      expect(names).toContain("products_live");
      expect(names).toContain("users_live");
    });

    test("deleteAlias removes alias", async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });
      await upsertAlias({ name: "products_live", collection: "products" });
      await deleteAlias("products_live");
      const result = await getAlias("products_live");
      expect(result).toBeNull();
    });
  });

  describe("synonyms", () => {
    beforeEach(async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });
    });

    test("upsertSynonym creates multi-way synonym", async () => {
      await upsertSynonym({
        id: "phone-synonyms",
        collection: "products",
        synonyms: ["phone", "mobile", "smartphone"],
      });

      const synonym = await getSynonym("phone-synonyms", "products");
      expect(synonym).not.toBeNull();
      expect(synonym!.synonyms).toEqual(["phone", "mobile", "smartphone"]);
    });

    test("upsertSynonym creates one-way synonym", async () => {
      await upsertSynonym({
        id: "tv-synonym",
        collection: "products",
        root: "television",
        synonyms: ["tv", "telly"],
      });

      const synonym = await getSynonym("tv-synonym", "products");
      expect(synonym).not.toBeNull();
      expect(synonym!.root).toBe("television");
    });

    test("getSynonym returns null for non-existent", async () => {
      const result = await getSynonym("nonexistent", "products");
      expect(result).toBeNull();
    });

    test("listSynonyms returns all synonyms for collection", async () => {
      await upsertSynonym({
        id: "syn1",
        collection: "products",
        synonyms: ["a", "b"],
      });
      await upsertSynonym({
        id: "syn2",
        collection: "products",
        synonyms: ["c", "d"],
      });

      const synonyms = await listSynonyms("products");
      expect(synonyms).toHaveLength(2);
    });

    test("listAllSynonyms aggregates across collections", async () => {
      await createCollection({
        name: "users",
        fields: [{ name: "name", type: "string" }],
      });

      await upsertSynonym({
        id: "syn1",
        collection: "products",
        synonyms: ["a", "b"],
      });
      await upsertSynonym({
        id: "syn2",
        collection: "users",
        synonyms: ["c", "d"],
      });

      const synonyms = await listAllSynonyms(["products", "users"]);
      expect(synonyms).toHaveLength(2);
    });

    test("deleteSynonym removes synonym", async () => {
      await upsertSynonym({
        id: "syn1",
        collection: "products",
        synonyms: ["a", "b"],
      });
      await deleteSynonym("syn1", "products");
      const result = await getSynonym("syn1", "products");
      expect(result).toBeNull();
    });

    test("upsertSynonym throws without synonyms or root", async () => {
      expect(
        upsertSynonym({ id: "bad", collection: "products" })
      ).rejects.toThrow("must have either 'synonyms' or 'root'");
    });
  });

  describe("overrides", () => {
    beforeEach(async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });
    });

    test("upsertOverride creates override with includes", async () => {
      await upsertOverride({
        id: "pin-featured",
        collection: "products",
        rule: { query: "featured", match: "exact" },
        includes: [{ id: "product-123", position: 1 }],
      });

      const override = await getOverride("pin-featured", "products");
      expect(override).not.toBeNull();
      expect(override!.includes).toHaveLength(1);
    });

    test("upsertOverride creates override with filter_by", async () => {
      await upsertOverride({
        id: "boost-shoes",
        collection: "products",
        rule: { query: "shoes", match: "contains" },
        filter_by: "category:=footwear",
      });

      const override = await getOverride("boost-shoes", "products");
      expect(override).not.toBeNull();
      expect(override!.filter_by).toBe("category:=footwear");
    });

    test("getOverride returns null for non-existent", async () => {
      const result = await getOverride("nonexistent", "products");
      expect(result).toBeNull();
    });

    test("listOverrides returns all overrides for collection", async () => {
      await upsertOverride({
        id: "ov1",
        collection: "products",
        rule: { query: "a", match: "exact" },
        filter_by: "category:=shoes",
      });
      await upsertOverride({
        id: "ov2",
        collection: "products",
        rule: { query: "b", match: "exact" },
        filter_by: "category:=hats",
      });

      const overrides = await listOverrides("products");
      expect(overrides).toHaveLength(2);
    });

    test("listAllOverrides aggregates across collections", async () => {
      await createCollection({
        name: "users",
        fields: [{ name: "name", type: "string" }],
      });

      await upsertOverride({
        id: "ov1",
        collection: "products",
        rule: { query: "a", match: "exact" },
        filter_by: "category:=shoes",
      });
      await upsertOverride({
        id: "ov2",
        collection: "users",
        rule: { query: "b", match: "exact" },
        filter_by: "role:=admin",
      });

      const overrides = await listAllOverrides(["products", "users"]);
      expect(overrides).toHaveLength(2);
    });

    test("deleteOverride removes override", async () => {
      await upsertOverride({
        id: "ov1",
        collection: "products",
        rule: { query: "a", match: "exact" },
        filter_by: "category:=shoes",
      });
      await deleteOverride("ov1", "products");
      const result = await getOverride("ov1", "products");
      expect(result).toBeNull();
    });
  });

  describe("apiKeys", () => {
    test("createApiKey creates key and returns value", async () => {
      const result = await createApiKey({
        description: "Search key",
        actions: ["documents:search"],
        collections: ["products"],
      });
      expect(result.id).toBeDefined();
      expect(result.value).toBeDefined();
      expect(typeof result.value).toBe("string");
    });

    test("getApiKey retrieves key by description", async () => {
      await createApiKey({
        description: "Search key",
        actions: ["documents:search"],
        collections: ["products"],
      });

      const key = await getApiKey("Search key");
      expect(key).not.toBeNull();
      expect(key!.description).toBe("Search key");
      expect(key!.actions).toEqual(["documents:search"]);
    });

    test("getApiKey returns null for non-existent", async () => {
      const result = await getApiKey("nonexistent");
      expect(result).toBeNull();
    });

    test("listApiKeys returns all keys", async () => {
      await createApiKey({
        description: "Key 1",
        actions: ["documents:search"],
        collections: ["*"],
      });
      await createApiKey({
        description: "Key 2",
        actions: ["*"],
        collections: ["*"],
      });

      const keys = await listApiKeys();
      const descriptions = keys.map((k) => k.description);
      expect(descriptions).toContain("Key 1");
      expect(descriptions).toContain("Key 2");
    });

    test("deleteApiKeyByDescription removes key", async () => {
      await createApiKey({
        description: "Temp key",
        actions: ["*"],
        collections: ["*"],
      });

      await deleteApiKeyByDescription("Temp key");
      const result = await getApiKey("Temp key");
      expect(result).toBeNull();
    });

    test("apiKeyConfigsEqual compares correctly", () => {
      const a: ApiKeyConfig = {
        description: "key",
        actions: ["documents:search", "documents:get"],
        collections: ["products", "users"],
      };
      const b: ApiKeyConfig = {
        description: "key",
        actions: ["documents:get", "documents:search"],
        collections: ["users", "products"],
      };
      expect(apiKeyConfigsEqual(a, b)).toBe(true);
    });

    test("apiKeyConfigsEqual detects differences", () => {
      const a: ApiKeyConfig = {
        description: "key",
        actions: ["documents:search"],
        collections: ["products"],
      };
      const b: ApiKeyConfig = {
        description: "key",
        actions: ["*"],
        collections: ["products"],
      };
      expect(apiKeyConfigsEqual(a, b)).toBe(false);
    });

    test("apiKeyConfigsEqual considers expires_at", () => {
      const a: ApiKeyConfig = {
        description: "key",
        actions: ["*"],
        collections: ["*"],
        expires_at: 1000,
      };
      const b: ApiKeyConfig = {
        description: "key",
        actions: ["*"],
        collections: ["*"],
        expires_at: 2000,
      };
      expect(apiKeyConfigsEqual(a, b)).toBe(false);
    });
  });

  describe("analyticsRules", () => {
    test("analyticsRuleConfigsEqual compares correctly", () => {
      const a = {
        name: "popular",
        type: "popular_queries" as const,
        collection: "products",
        event_type: "search" as const,
      };
      const b = { ...a };
      expect(analyticsRuleConfigsEqual(a, b)).toBe(true);
    });

    test("analyticsRuleConfigsEqual detects differences", () => {
      const a = {
        name: "popular",
        type: "popular_queries" as const,
        collection: "products",
        event_type: "search" as const,
      };
      const b = {
        ...a,
        event_type: "click" as const,
      };
      expect(analyticsRuleConfigsEqual(a, b)).toBe(false);
    });

    test("analyticsRuleConfigsEqual with params", () => {
      const a = {
        name: "popular",
        type: "popular_queries" as const,
        collection: "products",
        event_type: "search" as const,
        params: { limit: 100 },
      };
      const b = {
        ...a,
        params: { limit: 200 },
      };
      expect(analyticsRuleConfigsEqual(a, b)).toBe(false);
    });
  });
});
