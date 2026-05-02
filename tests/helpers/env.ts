/**
 * Reads test credentials and configuration from the environment. The dotenv
 * loader is registered in jest.config.js (setupFiles), so process.env is
 * already populated by the time this module is imported.
 */
export const apiKey = process.env.TWELVELABS_API_KEY?.trim() || undefined;
export const indexId = process.env.TWELVELABS_INDEX_ID?.trim() || undefined;
export const broadQuery =
  process.env.TWELVELABS_QUERY_TEXT?.trim() || "person";
export const imageUrl = process.env.TWELVELABS_IMAGE_URL?.trim() || undefined;

export const hasCredentials = Boolean(apiKey && indexId);
export const hasImageUrl = hasCredentials && Boolean(imageUrl);

/**
 * `describeIf(true)` -> describe; `describeIf(false)` -> describe.skip.
 * Used so test groups skip cleanly when env vars are absent instead of
 * exploding inside the API client.
 */
export const describeIf = (condition: boolean): jest.Describe =>
  condition ? describe : describe.skip;
