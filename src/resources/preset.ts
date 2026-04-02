import { getClient } from "../client/index.js";
import type { PresetConfig } from "../types/index.js";

/**
 * Get a preset from Typesense
 */
export async function getPreset(
  name: string
): Promise<PresetConfig | null> {
  const client = getClient();

  try {
    const data = await client.presets(name).retrieve();
    return {
      name: data.name,
      value: data.value as Record<string, unknown>,
    };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      error.httpStatus === 404
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * List all presets from Typesense
 */
export async function listPresets(): Promise<PresetConfig[]> {
  const client = getClient();

  try {
    const response = await client.presets().retrieve();
    return response.presets.map((p) => ({
      name: p.name,
      value: p.value as Record<string, unknown>,
    }));
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      (error.httpStatus === 404 || error.httpStatus === 400)
    ) {
      return [];
    }
    throw error;
  }
}

/**
 * Create or update a preset in Typesense
 */
export async function upsertPreset(config: PresetConfig): Promise<void> {
  const client = getClient();
  await client.presets().upsert(config.name, {
    value: config.value as any,
  });
}

/**
 * Delete a preset from Typesense
 */
export async function deletePreset(name: string): Promise<void> {
  const client = getClient();
  await client.presets(name).delete();
}

/**
 * Compare two preset configs for equality
 */
export function presetConfigsEqual(
  a: PresetConfig,
  b: PresetConfig
): boolean {
  if (a.name !== b.name) return false;
  return JSON.stringify(a.value) === JSON.stringify(b.value);
}
