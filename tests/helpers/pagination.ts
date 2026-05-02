import { TwelvelabsApi } from "twelvelabs-js";
import { Page } from "twelvelabs-js/core/pagination/Page";

/**
 * A 24-hex-character ObjectId-shaped string that no real upload will ever
 * have. Use as a placeholder for "valid format, definitely missing" inputs
 * in negative tests.
 */
export const NONEXISTENT_VIDEO_ID = "000000000000000000000000";

/**
 * Walks up to `maxPages` of pagination and returns the union of every
 * videoId surfaced. Lets assertions check membership at the video level even
 * when the API returns clip-grouped results spread across pages.
 */
export const collectVideoIds = async (
  response: Page<TwelvelabsApi.SearchItem>,
  maxPages = 5,
): Promise<Set<string>> => {
  const ids = new Set<string>();
  const harvest = (items: readonly TwelvelabsApi.SearchItem[]) => {
    for (const item of items) {
      const id = item.videoId ?? item.id;
      if (id) ids.add(id);
    }
  };
  harvest(response.data);
  let walked = 0;
  while (response.hasNextPage() && walked < maxPages) {
    await response.getNextPage();
    harvest(response.data);
    walked += 1;
  }
  return ids;
};
