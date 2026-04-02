import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import { getTypesenseVersion } from "./helpers.js";
import {
  createCollection,
  getCollection,
  updateCollection,
  deleteCollection,
} from "../resources/collection.js";
import type { CollectionConfig } from "../types/index.js";

describe("collection advanced features", () => {
  let version: number;

  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
    version = await getTypesenseVersion();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  describe("field types", () => {
    test("creates collection with all basic field types", async () => {
      const config: CollectionConfig = {
        name: "all-types",
        fields: [
          { name: "str", type: "string" },
          { name: "str_arr", type: "string[]" },
          { name: "i32", type: "int32" },
          { name: "i32_arr", type: "int32[]" },
          { name: "i64", type: "int64" },
          { name: "i64_arr", type: "int64[]" },
          { name: "f", type: "float" },
          { name: "f_arr", type: "float[]" },
          { name: "b", type: "bool" },
          { name: "b_arr", type: "bool[]" },
          { name: "geo", type: "geopoint" },
          { name: "geo_arr", type: "geopoint[]" },
          { name: "auto_field", type: "auto" },
          { name: "str_star", type: "string*" },
        ],
      };

      await createCollection(config);
      const retrieved = await getCollection("all-types");
      expect(retrieved).not.toBeNull();

      const fieldNames = retrieved!.fields.map((f) => f.name);
      expect(fieldNames).toContain("str");
      expect(fieldNames).toContain("i64");
      expect(fieldNames).toContain("geo");
      expect(fieldNames).toContain("auto_field");
    });

    test("creates collection with optional fields", async () => {
      const config: CollectionConfig = {
        name: "optional-fields",
        fields: [
          { name: "required_field", type: "string" },
          { name: "optional_field", type: "string", optional: true },
        ],
      };

      await createCollection(config);
      const retrieved = await getCollection("optional-fields");
      const optionalField = retrieved!.fields.find((f) => f.name === "optional_field");
      expect(optionalField!.optional).toBe(true);
    });

    test("creates collection with faceted fields", async () => {
      const config: CollectionConfig = {
        name: "faceted",
        fields: [
          { name: "category", type: "string", facet: true },
          { name: "brand", type: "string", facet: true },
          { name: "price", type: "float" },
        ],
      };

      await createCollection(config);
      const retrieved = await getCollection("faceted");
      const categoryField = retrieved!.fields.find((f) => f.name === "category");
      expect(categoryField!.facet).toBe(true);
    });

    test("creates collection with infix search field", async () => {
      const config: CollectionConfig = {
        name: "infix",
        fields: [
          { name: "title", type: "string", infix: true },
        ],
      };

      await createCollection(config);
      const retrieved = await getCollection("infix");
      const field = retrieved!.fields.find((f) => f.name === "title");
      expect(field!.infix).toBe(true);
    });

    test("creates collection with nested objects", async () => {
      const config: CollectionConfig = {
        name: "nested",
        fields: [
          { name: "metadata", type: "object" },
          { name: "tags", type: "object[]" },
        ],
        enable_nested_fields: true,
      };

      await createCollection(config);
      const retrieved = await getCollection("nested");
      expect(retrieved!.enable_nested_fields).toBe(true);
    });

    test("creates collection with vector field", async () => {
      const config: CollectionConfig = {
        name: "vectors",
        fields: [
          { name: "title", type: "string" },
          { name: "embedding", type: "float[]", num_dim: 128 },
        ],
      };

      await createCollection(config);
      const retrieved = await getCollection("vectors");
      const vecField = retrieved!.fields.find((f) => f.name === "embedding");
      expect(vecField!.num_dim).toBe(128);
    });

    test("creates collection with reference field", async () => {
      // Create referenced collection first
      await createCollection({
        name: "users",
        fields: [{ name: "name", type: "string" }],
      });

      const config: CollectionConfig = {
        name: "posts",
        fields: [
          { name: "title", type: "string" },
          { name: "author_id", type: "string", reference: "users.id" },
        ],
      };

      await createCollection(config);
      const retrieved = await getCollection("posts");
      const refField = retrieved!.fields.find((f) => f.name === "author_id");
      expect(refField!.reference).toBe("users.id");
    });
  });

  describe("collection-level options", () => {
    test("creates collection with token_separators", async () => {
      const config: CollectionConfig = {
        name: "custom-tokens",
        fields: [{ name: "sku", type: "string" }],
        token_separators: ["-", "/", "."],
      };

      await createCollection(config);
      const retrieved = await getCollection("custom-tokens");
      expect(retrieved!.token_separators).toEqual(["-", "/", "."]);
    });

    test("creates collection with symbols_to_index", async () => {
      const config: CollectionConfig = {
        name: "symbols",
        fields: [{ name: "tag", type: "string" }],
        symbols_to_index: ["#", "@", "+"],
      };

      await createCollection(config);
      const retrieved = await getCollection("symbols");
      expect(retrieved!.symbols_to_index).toEqual(["#", "@", "+"]);
    });

    test("creates collection with default_sorting_field", async () => {
      const config: CollectionConfig = {
        name: "sorted",
        fields: [
          { name: "title", type: "string" },
          { name: "popularity", type: "int32" },
        ],
        default_sorting_field: "popularity",
      };

      await createCollection(config);
      const retrieved = await getCollection("sorted");
      expect(retrieved!.default_sorting_field).toBe("popularity");
    });
  });

  describe("collection updates", () => {
    test("adds multiple fields in single update", async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });

      const updated: CollectionConfig = {
        name: "products",
        fields: [
          { name: "title", type: "string" },
          { name: "description", type: "string", optional: true },
          { name: "price", type: "float" },
          { name: "category", type: "string", facet: true },
        ],
      };

      const result = await updateCollection(updated, {
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });

      expect(result.fieldsToAdd).toHaveLength(3);
      const retrieved = await getCollection("products");
      expect(retrieved!.fields.length).toBeGreaterThanOrEqual(4);
    });

    test("modifies field properties", async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "category", type: "string" }],
      });

      const result = await updateCollection(
        {
          name: "products",
          fields: [{ name: "category", type: "string", facet: true }],
        },
        {
          name: "products",
          fields: [{ name: "category", type: "string" }],
        }
      );

      expect(result.fieldsToModify).toHaveLength(1);
      expect(result.fieldsToModify[0]!.name).toBe("category");
    });

    test("drops and adds fields simultaneously", async () => {
      await createCollection({
        name: "products",
        fields: [
          { name: "title", type: "string" },
          { name: "old_field", type: "string" },
        ],
      });

      const result = await updateCollection(
        {
          name: "products",
          fields: [
            { name: "title", type: "string" },
            { name: "new_field", type: "int32" },
          ],
        },
        {
          name: "products",
          fields: [
            { name: "title", type: "string" },
            { name: "old_field", type: "string" },
          ],
        }
      );

      expect(result.fieldsToDrop).toContain("old_field");
      expect(result.fieldsToAdd.map((f) => f.name)).toContain("new_field");
    });
  });
});
