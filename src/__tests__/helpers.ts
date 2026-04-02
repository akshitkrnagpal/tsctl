import { getClient } from "../client/index.js";

/**
 * Get the Typesense server version as a number (e.g., 27 or 30)
 */
export async function getTypesenseVersion(): Promise<number> {
  const client = getClient();
  try {
    const debug = await client.debug.retrieve();
    const version = (debug as any).version as string;
    // Version string is like "30.0" or "27.1"
    return parseInt(version.split(".")[0]!, 10);
  } catch {
    // Fallback: try health endpoint or default to 27
    return 27;
  }
}
