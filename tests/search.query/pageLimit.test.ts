/**
 * Tests for the `pageLimit` request parameter and the multi-page iteration
 * behavior built on top of it (getNextPage, for-await across pages).
 */

import { TwelveLabs, TwelvelabsApi } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { Page } from "twelvelabs-js/core/pagination/Page";

import {
  indexId,
  broadQuery,
  hasCredentials,
  describeIf,
} from "../helpers/env";
import { getClient } from "../helpers/client";

let client: TwelveLabs;

beforeAll(() => {
  if (hasCredentials) client = getClient();
});

describe("search.query pageLimit", () => {
  describeIf(hasCredentials)("happy path", () => {
    it("given pageLimit=1 and valid searchOptions returns exactly one item per page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 1,
      });

      expect(response).toBeInstanceOf(Page);

      const assertExactlyOne = () => {
        expect(response.data).toHaveLength(1);
        expect(response.data[0].videoId).toEqual(expect.any(String));
      };
      assertExactlyOne();

      let pagesWalked = 0;
      const maxPages = 3;
      while (response.hasNextPage() && pagesWalked < maxPages) {
        await response.getNextPage();
        assertExactlyOne();
        pagesWalked += 1;
      }
    });

    it("given a single searchOptions modality when query runs returns a Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 1,
      });
      expect(response).toBeInstanceOf(Page);
    });

    it("given pageLimit=10 when query runs returns Page whose data length is at most 10", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "transcription"],
        queryText: broadQuery,
        pageLimit: 10,
      });

      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeLessThanOrEqual(10);
    });

    it("given pageLimit=10 when query runs every returned item exposes a string videoId", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "transcription"],
        queryText: broadQuery,
        pageLimit: 10,
      });

      for (const item of response.data) {
        expect(item.videoId).toEqual(expect.any(String));
      }
    });

    it("given a page with more results when getNextPage is called returns different page data", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 1,
      });
      expect(response).toBeInstanceOf(Page);

      if (!response.hasNextPage()) {
        return;
      }

      const clipKey = (d: TwelvelabsApi.SearchItem) =>
        `${d.videoId}:${d.start ?? ""}-${d.end ?? ""}`;
      const firstPageKeys = response.data.map(clipKey).join(",");
      await response.getNextPage();
      expect(Array.isArray(response.data)).toBe(true);
      const secondPageKeys = response.data.map(clipKey).join(",");
      if (response.data.length > 0) {
        expect(secondPageKeys).not.toEqual(firstPageKeys);
      }
    });

    it("given multi-page results when iterated with for-await yields items across pages", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 2,
      });

      const cap = 5;
      let count = 0;
      for await (const item of response) {
        expect(item.videoId).toEqual(expect.any(String));
        count += 1;
        if (count >= cap) break;
      }
    });
  });

  describeIf(hasCredentials)("boundary", () => {
    it("given pageLimit=50 when query runs returns Page with at most 50 items", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 50,
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeLessThanOrEqual(50);
    });

    it("given pageLimit=1 when query runs returns Page with at most 1 item", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 1,
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeLessThanOrEqual(1);
    });
  });

  describeIf(hasCredentials)("validation rejection", () => {
    // Doc says pageLimit max is 50. Server rejects pageLimit > 50 with
    // parameter_invalid ("value too large") rather than clamping.
    it("given pageLimit=51 when query runs throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 51,
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    // Negative pageLimit is nonsensical; server rejects with BadRequestError.
    it("given pageLimit=-1 when query runs throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: -1,
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });
  });
});
