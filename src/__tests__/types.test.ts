import { describe, test, expect } from "bun:test";
import {
  defineConfig,
  TypesenseConfigSchema,
  CollectionConfigSchema,
  AliasConfigSchema,
  SynonymConfigSchema,
  OverrideConfigSchema,
  FieldSchema,
  FieldTypeSchema,
  AnalyticsRuleConfigSchema,
  ApiKeyConfigSchema,
  SynonymSetConfigSchema,
} from "../types/index.js";

describe("types / schemas", () => {
  describe("FieldTypeSchema", () => {
    test("accepts valid field types", () => {
      const validTypes = [
        "string", "string[]", "int32", "int32[]", "int64", "int64[]",
        "float", "float[]", "bool", "bool[]", "geopoint", "geopoint[]",
        "object", "object[]", "auto", "string*", "image",
      ];
      for (const type of validTypes) {
        expect(FieldTypeSchema.parse(type)).toBe(type);
      }
    });

    test("rejects invalid field types", () => {
      expect(() => FieldTypeSchema.parse("invalid")).toThrow();
      expect(() => FieldTypeSchema.parse("number")).toThrow();
    });
  });

  describe("FieldSchema", () => {
    test("parses minimal field", () => {
      const field = FieldSchema.parse({ name: "title", type: "string" });
      expect(field.name).toBe("title");
      expect(field.type).toBe("string");
    });

    test("parses field with all options", () => {
      const field = FieldSchema.parse({
        name: "title",
        type: "string",
        optional: true,
        facet: true,
        index: true,
        sort: true,
        infix: true,
        locale: "en",
        stem: true,
        store: true,
        range_index: true,
      });
      expect(field.optional).toBe(true);
      expect(field.facet).toBe(true);
      expect(field.locale).toBe("en");
    });

    test("parses field with vector options", () => {
      const field = FieldSchema.parse({
        name: "embedding",
        type: "float[]",
        num_dim: 384,
        vec_dist: "cosine",
      });
      expect(field.num_dim).toBe(384);
      expect(field.vec_dist).toBe("cosine");
    });

    test("parses field with embed config", () => {
      const field = FieldSchema.parse({
        name: "embedding",
        type: "float[]",
        embed: {
          from: ["title", "description"],
          model_config: {
            model_name: "ts/all-MiniLM-L12-v2",
          },
        },
      });
      expect(field.embed?.from).toEqual(["title", "description"]);
      expect(field.embed?.model_config.model_name).toBe("ts/all-MiniLM-L12-v2");
    });

    test("rejects field without name", () => {
      expect(() => FieldSchema.parse({ type: "string" })).toThrow();
    });

    test("rejects field without type", () => {
      expect(() => FieldSchema.parse({ name: "title" })).toThrow();
    });
  });

  describe("CollectionConfigSchema", () => {
    test("parses minimal collection", () => {
      const config = CollectionConfigSchema.parse({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });
      expect(config.name).toBe("products");
      expect(config.fields).toHaveLength(1);
    });

    test("parses collection with all options", () => {
      const config = CollectionConfigSchema.parse({
        name: "products",
        fields: [{ name: "title", type: "string" }],
        default_sorting_field: "created_at",
        token_separators: ["-", "/"],
        symbols_to_index: ["#"],
        enable_nested_fields: true,
        synonym_sets: ["my-synonyms"],
      });
      expect(config.default_sorting_field).toBe("created_at");
      expect(config.token_separators).toEqual(["-", "/"]);
      expect(config.synonym_sets).toEqual(["my-synonyms"]);
    });

    test("rejects collection without name", () => {
      expect(() =>
        CollectionConfigSchema.parse({ fields: [{ name: "x", type: "string" }] })
      ).toThrow();
    });

    test("rejects collection without fields", () => {
      expect(() => CollectionConfigSchema.parse({ name: "test" })).toThrow();
    });
  });

  describe("AliasConfigSchema", () => {
    test("parses valid alias", () => {
      const alias = AliasConfigSchema.parse({ name: "products_live", collection: "products" });
      expect(alias.name).toBe("products_live");
      expect(alias.collection).toBe("products");
    });

    test("rejects alias without collection", () => {
      expect(() => AliasConfigSchema.parse({ name: "test" })).toThrow();
    });
  });

  describe("SynonymConfigSchema", () => {
    test("parses multi-way synonym", () => {
      const synonym = SynonymConfigSchema.parse({
        id: "phone-synonyms",
        collection: "products",
        synonyms: ["phone", "mobile", "smartphone"],
      });
      expect(synonym.id).toBe("phone-synonyms");
      expect(synonym.synonyms).toHaveLength(3);
    });

    test("parses one-way synonym with root", () => {
      const synonym = SynonymConfigSchema.parse({
        id: "tv-synonym",
        collection: "products",
        root: "television",
        synonyms: ["tv", "telly"],
      });
      expect(synonym.root).toBe("television");
    });
  });

  describe("SynonymSetConfigSchema", () => {
    test("parses synonym set with items", () => {
      const set = SynonymSetConfigSchema.parse({
        name: "my-synonyms",
        items: [
          { id: "phones", synonyms: ["phone", "mobile"] },
          { id: "tv", root: "television", synonyms: ["tv", "telly"] },
        ],
      });
      expect(set.name).toBe("my-synonyms");
      expect(set.items).toHaveLength(2);
    });
  });

  describe("OverrideConfigSchema", () => {
    test("parses override with includes", () => {
      const override = OverrideConfigSchema.parse({
        id: "pin-featured",
        collection: "products",
        rule: { query: "featured", match: "exact" },
        includes: [{ id: "product-123", position: 1 }],
      });
      expect(override.id).toBe("pin-featured");
      expect(override.includes).toHaveLength(1);
    });

    test("parses override with all options", () => {
      const override = OverrideConfigSchema.parse({
        id: "boost",
        collection: "products",
        rule: { query: "shoes", match: "contains" },
        filter_by: "category:=footwear",
        sort_by: "popularity:desc",
        remove_matched_tokens: true,
        effective_from_ts: 1672531200,
        effective_to_ts: 1704067200,
        stop_processing: false,
      });
      expect(override.filter_by).toBe("category:=footwear");
      expect(override.stop_processing).toBe(false);
    });
  });

  describe("AnalyticsRuleConfigSchema", () => {
    test("parses analytics rule", () => {
      const rule = AnalyticsRuleConfigSchema.parse({
        name: "popular-queries",
        type: "popular_queries",
        collection: "products",
        event_type: "search",
      });
      expect(rule.name).toBe("popular-queries");
      expect(rule.type).toBe("popular_queries");
    });

    test("parses analytics rule with params", () => {
      const rule = AnalyticsRuleConfigSchema.parse({
        name: "popular-queries",
        type: "popular_queries",
        collection: "products",
        event_type: "search",
        params: { limit: 100, destination_collection: "popular" },
      });
      expect(rule.params?.limit).toBe(100);
    });
  });

  describe("ApiKeyConfigSchema", () => {
    test("parses minimal API key config", () => {
      const key = ApiKeyConfigSchema.parse({
        description: "Search key",
        actions: ["documents:search"],
        collections: ["products"],
      });
      expect(key.description).toBe("Search key");
    });

    test("parses API key with expiration", () => {
      const key = ApiKeyConfigSchema.parse({
        description: "Temp key",
        actions: ["*"],
        collections: ["*"],
        expires_at: 1735689600,
        autodelete: true,
      });
      expect(key.expires_at).toBe(1735689600);
      expect(key.autodelete).toBe(true);
    });
  });

  describe("TypesenseConfigSchema", () => {
    test("parses empty config", () => {
      const config = TypesenseConfigSchema.parse({});
      expect(config.collections).toBeUndefined();
    });

    test("parses full config", () => {
      const config = TypesenseConfigSchema.parse({
        collections: [{ name: "products", fields: [{ name: "title", type: "string" }] }],
        aliases: [{ name: "products_live", collection: "products" }],
        synonyms: [{ id: "syn1", collection: "products", synonyms: ["a", "b"] }],
        overrides: [{ id: "ov1", collection: "products", rule: { query: "x", match: "exact" } }],
        apiKeys: [{ description: "key1", actions: ["*"], collections: ["*"] }],
      });
      expect(config.collections).toHaveLength(1);
      expect(config.aliases).toHaveLength(1);
      expect(config.synonyms).toHaveLength(1);
      expect(config.overrides).toHaveLength(1);
      expect(config.apiKeys).toHaveLength(1);
    });
  });

  describe("defineConfig", () => {
    test("validates and returns config", () => {
      const config = defineConfig({
        collections: [{ name: "test", fields: [{ name: "title", type: "string" }] }],
      });
      expect(config.collections).toHaveLength(1);
    });

    test("throws on invalid config", () => {
      expect(() =>
        defineConfig({
          collections: [{ name: "test", fields: [{ name: "x", type: "invalid" as any }] }],
        })
      ).toThrow();
    });
  });
});
