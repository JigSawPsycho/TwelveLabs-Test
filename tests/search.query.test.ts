/**
 * Integration tests for `client.search.query` from the twelvelabs-js SDK.
 * Tests run against the real TwelveLabs API and skip if credentials aren't
 * provided. See .env / .env.example for the required environment variables.
 *
 * Coverage is organized following the ZOMBIES heuristic. Per the original
 * brief, accuracy of image-based search is not validated; image tests only
 * assert that the SDK call succeeds and returns a Page.
 */

import { TwelveLabs, TwelvelabsApi } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { TwelvelabsApiError } from "twelvelabs-js/errors/TwelvelabsApiError";
import { Page } from "twelvelabs-js/core/pagination/Page";
import type { SearchWrapper } from "twelvelabs-js/wrapper/resources/SearchWrapper";

import {
  apiKey,
  indexId,
  broadQuery,
  imageUrl,
  hasCredentials,
  hasImageUrl,
  describeIf,
} from "./helpers/env";

const NONEXISTENT_VIDEO_ID = "000000000000000000000000";

let client: TwelveLabs;

beforeAll(() => {
  if (!hasCredentials) {
    // eslint-disable-next-line no-console
    console.warn(
      "\n[search.query tests] Skipping integration tests.\n" +
        "Set TWELVELABS_API_KEY and TWELVELABS_INDEX_ID in .env to enable them.\n",
    );
    return;
  }
  client = new TwelveLabs({ apiKey: apiKey! });
});

describe("search.query", () => {
  describeIf(hasCredentials)("when no videos match", () => {
    it("returns an empty Page when filter excludes every video", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: `{"id": ["${NONEXISTENT_VIDEO_ID}"]}`,
      });

      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
      expect(response.hasNextPage()).toBe(false);
    });

    it("yields zero items when iterating an empty Page with for-await", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: `{"id": ["${NONEXISTENT_VIDEO_ID}"]}`,
      });

      const collected: TwelvelabsApi.SearchItem[] = [];
      for await (const item of response) {
        collected.push(item);
      }
      expect(collected).toHaveLength(0);
    });
  });

  describeIf(hasCredentials)("with pageLimit=1", () => {
    it("returns at most one SearchItem with a valid shape", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 1,
      });

      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeLessThanOrEqual(1);

      if (response.data.length === 1) {
        const [item] = response.data;
        expect(item.videoId).toEqual(expect.any(String));
        if (item.start !== undefined && item.end !== undefined) {
          expect(item.end).toBeGreaterThan(item.start);
        }
        if (item.thumbnailUrl !== undefined) {
          expect(item.thumbnailUrl).toMatch(/^https?:\/\//);
        }
      }
    });

    it("accepts a single searchOptions modality", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 1,
      });
      expect(response).toBeInstanceOf(Page);
    });
  });

  describeIf(hasCredentials)("with multiple matches", () => {
    it("returns a Page whose data array obeys pageLimit", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "audio"],
        queryText: broadQuery,
        pageLimit: 10,
      });

      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeLessThanOrEqual(10);
      for (const item of response.data) {
        expect(item.videoId).toEqual(expect.any(String));
      }
    });

    it("paginates with hasNextPage / getNextPage when more pages exist", async () => {
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

      const firstPageIds = response.data.map((d) => d.videoId).join(",");
      await response.getNextPage();
      expect(Array.isArray(response.data)).toBe(true);
      const secondPageIds = response.data.map((d) => d.videoId).join(",");
      if (response.data.length > 0) {
        expect(secondPageIds).not.toEqual(firstPageIds);
      }
    });

    it("auto-iterates items across pages with for-await (capped)", async () => {
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

    it("returns clip groups when groupBy=video", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        groupBy: "video",
        pageLimit: 5,
      });

      expect(response).toBeInstanceOf(Page);
      for (const item of response.data) {
        expect(item.id ?? item.videoId).toEqual(expect.any(String));
        if (item.clips !== undefined) {
          expect(Array.isArray(item.clips)).toBe(true);
        }
      }
    });
  });

  describeIf(hasCredentials)("at documented limits", () => {
    it("accepts the maximum pageLimit of 50", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 50,
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeLessThanOrEqual(50);
    });

    it("accepts pageLimit=1", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 1,
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeLessThanOrEqual(1);
    });

    it("accepts a 500-token query string (Marengo's documented max)", async () => {
      const longQuery = Array.from({ length: 500 }, () => "word").join(" ");
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: longQuery,
        pageLimit: 1,
      });
      expect(response).toBeInstanceOf(Page);
    });

    it("either rejects or clamps pageLimit > 50", async () => {
      try {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          pageLimit: 51,
        });
        expect(response.data.length).toBeLessThanOrEqual(50);
      } catch (err) {
        expect(err).toBeInstanceOf(TwelvelabsApiError);
      }
    });
  });

  describeIf(hasCredentials)("response contract", () => {
    it("returns a Page instance that implements AsyncIterable", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 1,
      });

      expect(response).toBeInstanceOf(Page);
      expect(typeof response[Symbol.asyncIterator]).toBe("function");
      expect(typeof response.hasNextPage).toBe("function");
      expect(typeof response.getNextPage).toBe("function");
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("exposes search on the TwelveLabs client", () => {
      expect(client.search).toBeDefined();
      expect(typeof client.search.query).toBe("function");
    });

    it("accepts every documented optional parameter together", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "audio", "transcription"],
        queryText: broadQuery,
        transcriptionOptions: ["lexical", "semantic"],
        groupBy: "clip",
        operator: "or",
        pageLimit: 5,
        filter: "{}",
        includeUserMetadata: true,
      });
      expect(response).toBeInstanceOf(Page);
    });

    it("honors a request-level timeout option", async () => {
      const response = await client.search.query(
        {
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          pageLimit: 1,
        },
        { timeoutInSeconds: 30 },
      );
      expect(response).toBeInstanceOf(Page);
    });
  });

  describeIf(hasCredentials)("invalid input", () => {
    it("throws BadRequestError on a malformed filter", async () => {
      await expect(
        client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: "{not-json",
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("throws on an unsupported search option", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["telepathy" as unknown as "visual"],
        queryText: broadQuery,
      });
      await expect(promise).rejects.toBeInstanceOf(TwelvelabsApiError);
    });

    it("throws on a nonexistent index ID", async () => {
      const promise = client.search.query({
        indexId: NONEXISTENT_VIDEO_ID,
        searchOptions: ["visual"],
        queryText: broadQuery,
      });
      await expect(promise).rejects.toBeInstanceOf(TwelvelabsApiError);
    });
  });

  describe("required parameters (compile-time)", () => {
    it("indexId is required", () => {
      // @ts-expect-error indexId is required by SearchWrapper.QueryRequest
      const request: SearchWrapper.QueryRequest = {
        searchOptions: ["visual"],
        queryText: "x",
      };
      expect(request).toBeDefined();
    });

    it("searchOptions is required", () => {
      // @ts-expect-error searchOptions is required by SearchWrapper.QueryRequest
      const request: SearchWrapper.QueryRequest = {
        indexId: "x",
        queryText: "x",
      };
      expect(request).toBeDefined();
    });
  });

  describeIf(hasCredentials)("documented text-search example", () => {
    it("runs the basic text-search example from the docs", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "audio"],
        queryText: broadQuery,
        groupBy: "video",
        operator: "or",
        pageLimit: 5,
      });
      expect(response).toBeInstanceOf(Page);
    });
  });

  describeIf(hasImageUrl)(
    "documented image-search example (requires TWELVELABS_IMAGE_URL)",
    () => {
      it("runs the single-image-URL search example", async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryMediaType: "image",
          queryMediaUrl: imageUrl!,
          pageLimit: 5,
        });
        expect(response).toBeInstanceOf(Page);
      });

      it("runs a composed image+text search", async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryMediaType: "image",
          queryMediaUrl: imageUrl!,
          queryText: broadQuery,
          pageLimit: 5,
        });
        expect(response).toBeInstanceOf(Page);
      });
    },
  );
});
