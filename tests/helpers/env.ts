/**
 * Reads test credentials and configuration from the environment. The dotenv
 * loader is registered in jest.config.js (setupFiles), so process.env is
 * already populated by the time this module is imported.
 */
export const apiKey = process.env.TWELVELABS_API_KEY?.trim() || undefined;
export const indexId = process.env.TWELVELABS_INDEX_ID?.trim() || undefined;
export const broadQuery =
  process.env.TWELVELABS_QUERY_TEXT?.trim() || "number";

export const redVideoId = process.env.RED_VIDEO_ID?.trim() || undefined;
export const blueVideoId = process.env.BLUE_VIDEO_ID?.trim() || undefined;
export const greenVideoId = process.env.GREEN_VIDEO_ID?.trim() || undefined;
export const rgbVideoId = process.env.RGB_VIDEO_ID?.trim() || undefined;

/**
 * Splits a comma-separated env var into a string array. Returns undefined if
 * the env var is missing or only contains whitespace, which lets callers
 * gate `describeIf` on Boolean(parsed) cleanly.
 */
const parseIdList = (raw: string | undefined): string[] | undefined => {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
};

export const fiveSecVideoIds = parseIdList(process.env["5_SEC_VID_IDS"]);
export const tenSecVideoIds = parseIdList(process.env["10_SEC_VID_IDS"]);
export const px400VideoIds = parseIdList(process.env["400X400PX_VID_IDS"]);
export const px800VideoIds = parseIdList(process.env["800X800PX_VID_IDS"]);
export const testnameFilename =
  process.env.TESTNAME_FILENAME?.trim() || undefined;
export const testnameFilenameVideoId =
  process.env.TESTNAME_FILENAME_VID_ID?.trim() || undefined;

export const hasCredentials = Boolean(apiKey && indexId);
export const hasColorVideos =
  hasCredentials &&
  Boolean(redVideoId && blueVideoId && greenVideoId && rgbVideoId);
export const hasDurationVideos =
  hasCredentials && Boolean(fiveSecVideoIds && tenSecVideoIds);
export const hasDimensionVideos =
  hasCredentials && Boolean(px400VideoIds && px800VideoIds);
export const hasFilenameVideo =
  hasCredentials && Boolean(testnameFilename && testnameFilenameVideoId);

/**
 * `describeIf(true)` -> describe; `describeIf(false)` -> describe.skip.
 * Used so test groups skip cleanly when env vars are absent instead of
 * exploding inside the API client.
 */
export const describeIf = (condition: boolean): jest.Describe =>
  condition ? describe : describe.skip;
