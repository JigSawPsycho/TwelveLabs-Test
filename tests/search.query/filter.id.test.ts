/**
 * Tests for the `filter` parameter on the `id` field (used to scope the
 * candidate pool). Validates the array-of-strings shape and the bulk-id
 * handling at the server.
 */

import { TwelveLabs } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { TwelvelabsApiError } from "twelvelabs-js/errors/TwelvelabsApiError";

import {
  indexId,
  broadQuery,
  hasCredentials,
  describeIf,
} from "../helpers/env";
import { getClient } from "../helpers/client";
import { NONEXISTENT_VIDEO_ID } from "../helpers/pagination";

let client: TwelveLabs;

beforeAll(() => {
  if (hasCredentials) client = getClient();
});

describe("search.query filter (id)", () => {
  describeIf(hasCredentials)("validation rejection", () => {
    it("filter with id as a single string (not an array) throws BadRequestError", async () => {
      // SDK doc: `id` accepts only "Array of strings". A bare string violates
      // that, even if it happens to be a valid id.
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ id: NONEXISTENT_VIDEO_ID }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    // Empty id array is well-formed JSON, but the server rejects it as an
    // invalid filter rather than treating it as a "match none" passthrough.
    // The rejection arrives with a non-400 status, so it surfaces as the
    // base TwelvelabsApiError rather than BadRequestError specifically.
    it("filter with empty id array {id: []} throws TwelvelabsApiError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ id: [] }),
      });
      await expect(promise).rejects.toBeInstanceOf(TwelvelabsApiError);
    });

    it("filter with non-string id entries {id: [123]} throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ id: [123] }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    // 5-char "short" is not a valid TwelveLabs video ID; server rejects
    // before evaluating the filter.
    it("filter with malformed-format id {id: ['short']} throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ id: ["short"] }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  describeIf(hasCredentials)("boundary", () => {
    // Bulk-id handling: the server validates each id against the index and
    // rejects the request as soon as one isn't present, with the
    // search_video_not_in_same_index error code. 1,000 nonexistent ids
    // therefore surface as a BadRequestError rather than an empty Page.
    it("filter id with a 1,000-entry array of nonexistent IDs throws BadRequestError", async () => {
      const manyIds = Array.from({ length: 1000 }, () => NONEXISTENT_VIDEO_ID);
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ id: manyIds }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });
  });
});
