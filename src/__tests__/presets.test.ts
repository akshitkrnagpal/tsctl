import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import {
  upsertPreset,
  getPreset,
  listPresets,
  deletePreset,
  presetConfigsEqual,
} from "../resources/preset.js";

describe("presets", () => {
  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  test("upsertPreset creates a preset", async () => {
    await upsertPreset({
      name: "listing_view",
      value: {
        searches: [
          {
            collection: "products",
            q: "*",
            sort_by: "popularity:desc",
          },
        ],
      },
    });

    const result = await getPreset("listing_view");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("listing_view");
    expect(result!.value).toBeDefined();
  });

  test("getPreset returns null for non-existent", async () => {
    const result = await getPreset("nonexistent");
    expect(result).toBeNull();
  });

  test("listPresets returns all presets", async () => {
    await upsertPreset({
      name: "preset1",
      value: { q: "*" },
    });
    await upsertPreset({
      name: "preset2",
      value: { q: "test" },
    });

    const presets = await listPresets();
    const names = presets.map((p) => p.name);
    expect(names).toContain("preset1");
    expect(names).toContain("preset2");
  });

  test("upsertPreset updates existing preset", async () => {
    await upsertPreset({
      name: "my-preset",
      value: { q: "old" },
    });
    await upsertPreset({
      name: "my-preset",
      value: { q: "new" },
    });

    const result = await getPreset("my-preset");
    expect((result!.value as any).q).toBe("new");
  });

  test("deletePreset removes preset", async () => {
    await upsertPreset({
      name: "to-delete",
      value: { q: "*" },
    });
    await deletePreset("to-delete");
    const result = await getPreset("to-delete");
    expect(result).toBeNull();
  });

  test("presetConfigsEqual compares correctly", () => {
    const a = { name: "test", value: { q: "*", sort_by: "price:asc" } };
    const b = { name: "test", value: { q: "*", sort_by: "price:asc" } };
    expect(presetConfigsEqual(a, b)).toBe(true);
  });

  test("presetConfigsEqual detects differences", () => {
    const a = { name: "test", value: { q: "*" } };
    const b = { name: "test", value: { q: "different" } };
    expect(presetConfigsEqual(a, b)).toBe(false);
  });
});
