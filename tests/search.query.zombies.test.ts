/**
 * ZOMBIES test suite for `client.search.query` from the twelvelabs-js SDK.
 *
 *   Z - Zero          : empty / no-result paths
 *   O - One           : single-result path
 *   M - Many          : multi-result and pagination paths
 *   B - Boundaries    : limits documented by the API (pageLimit, 500 token query, 10 images)
 *   I - Interfaces    : the request/response contract (parameter forwarding, return shape)
 *   E - Exceptions    : documented errors (BadRequestError, TooManyRequestsError, missing required fields)
 *   S - Simple scen.  : the canonical happy-path examples shown in the docs
 */

import { TwelveLabs, TwelvelabsApi } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { TooManyRequestsError } from "twelvelabs-js/api/errors/TooManyRequestsError";
import { TwelvelabsApiError } from "twelvelabs-js/errors/TwelvelabsApiError";
import { Page } from "twelvelabs-js/core/pagination/Page";

import { buildMockClient, buildMockPage } from "./helpers/mockClient";
import {
  emptyPageData,
  singleClipResult,
  manyClipResults,
  groupedByVideoResult,
} from "./fixtures/searchResponses";

const INDEX_ID = "67cec9caf45d9b64a58340fc";

describe("search.query (ZOMBIES)", () => {
  // ---------------------------------------------------------------------------
  // Z - Zero
  // ---------------------------------------------------------------------------
  describe("Z - Zero", () => {
    it("resolves with an empty data array when the index has no matches", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [emptyPageData] }));

      const response = await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryText: "no-such-thing",
      });

      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
      expect(response.data).toHaveLength(0);
      expect(response.hasNextPage()).toBe(false);
    });

    it("yields zero items when iterated with for-await over an empty page", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [emptyPageData] }));

      const collected: TwelvelabsApi.SearchItem[] = [];
      const response = await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryText: "no-such-thing",
      });
      for await (const item of response) {
        collected.push(item);
      }

      expect(collected).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // O - One
  // ---------------------------------------------------------------------------
  describe("O - One", () => {
    it("returns a single SearchItem with the expected shape", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [singleClipResult] }));

      const response = await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryText: "red sports car",
      });

      expect(response.data).toHaveLength(1);
      const [item] = response.data;
      expect(item).toMatchObject({
        videoId: expect.any(String),
        start: expect.any(Number),
        end: expect.any(Number),
        rank: expect.any(Number),
        thumbnailUrl: expect.stringMatching(/^https?:\/\//),
      });
      expect(item.end!).toBeGreaterThan(item.start!);
    });

    it("forwards exactly one searchOptions modality unchanged", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [singleClipResult] }));

      await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryText: "lone surfer",
      });

      expect(queryMock).toHaveBeenCalledTimes(1);
      expect(queryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          searchOptions: ["visual"],
          queryText: "lone surfer",
          indexId: INDEX_ID,
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // M - Many
  // ---------------------------------------------------------------------------
  describe("M - Many", () => {
    it("returns multiple SearchItems on a single page", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [manyClipResults] }));

      const response = await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual", "audio"],
        queryText: "city skyline",
      });

      expect(response.data.length).toBeGreaterThan(1);
      const ids = response.data.map((d) => d.videoId);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("paginates across pages with hasNextPage / getNextPage", async () => {
      const { client, queryMock } = buildMockClient();
      const pageOne = manyClipResults.slice(0, 10);
      const pageTwo = manyClipResults.slice(10, 20);
      const pageThree = manyClipResults.slice(20);
      queryMock.mockResolvedValue(
        buildMockPage({ pages: [pageOne, pageTwo, pageThree] }),
      );

      const response = await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryText: "city skyline",
      });

      expect(response.data).toHaveLength(10);
      expect(response.hasNextPage()).toBe(true);

      await response.getNextPage();
      expect(response.data).toHaveLength(10);
      expect(response.hasNextPage()).toBe(true);

      await response.getNextPage();
      expect(response.data).toHaveLength(5);
      expect(response.hasNextPage()).toBe(false);
    });

    it("auto-iterates every item across every page using for-await", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(
        buildMockPage({
          pages: [
            manyClipResults.slice(0, 10),
            manyClipResults.slice(10, 20),
            manyClipResults.slice(20),
          ],
        }),
      );

      const response = await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryText: "city skyline",
      });

      const collected: TwelvelabsApi.SearchItem[] = [];
      for await (const item of response) {
        collected.push(item);
      }
      expect(collected).toHaveLength(manyClipResults.length);
    });

    it("returns clip groups when groupBy=video", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(
        buildMockPage({ pages: [groupedByVideoResult] }),
      );

      const response = await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryText: "anything",
        groupBy: "video",
      });

      expect(response.data[0].clips).toBeDefined();
      expect(response.data[0].clips!.length).toBeGreaterThan(1);
      expect(queryMock).toHaveBeenCalledWith(
        expect.objectContaining({ groupBy: "video" }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // B - Boundaries
  // ---------------------------------------------------------------------------
  describe("B - Boundaries", () => {
    it("accepts the documented maximum pageLimit of 50", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [singleClipResult] }));

      await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryText: "boundary",
        pageLimit: 50,
      });

      expect(queryMock).toHaveBeenCalledWith(
        expect.objectContaining({ pageLimit: 50 }),
      );
    });

    it("accepts pageLimit=1 (lower practical bound)", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [singleClipResult] }));

      await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryText: "boundary",
        pageLimit: 1,
      });

      expect(queryMock).toHaveBeenCalledWith(
        expect.objectContaining({ pageLimit: 1 }),
      );
    });

    it("forwards a 500-token-sized query string without truncation", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [emptyPageData] }));

      const longQuery = Array.from({ length: 500 }, () => "word").join(" ");
      await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryText: longQuery,
      });

      const passed = queryMock.mock.calls[0][0] as { queryText: string };
      expect(passed.queryText).toBe(longQuery);
      expect(passed.queryText.split(" ")).toHaveLength(500);
    });

    it("accepts the maximum of 10 image URLs in a single query", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [singleClipResult] }));

      const urls = Array.from(
        { length: 10 },
        (_, i) => `https://example.com/img_${i}.jpg`,
      );
      await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryMediaType: "image",
        queryMediaUrls: urls,
      });

      expect(queryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          queryMediaType: "image",
          queryMediaUrls: urls,
        }),
      );
      expect(
        (queryMock.mock.calls[0][0] as { queryMediaUrls: string[] })
          .queryMediaUrls,
      ).toHaveLength(10);
    });
  });

  // ---------------------------------------------------------------------------
  // I - Interfaces
  // ---------------------------------------------------------------------------
  describe("I - Interfaces", () => {
    it("returns a Page instance that implements AsyncIterable", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [singleClipResult] }));

      const response = await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryText: "interface check",
      });

      expect(response).toBeInstanceOf(Page);
      expect(typeof response[Symbol.asyncIterator]).toBe("function");
      expect(typeof response.hasNextPage).toBe("function");
      expect(typeof response.getNextPage).toBe("function");
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("exposes search as part of the TwelveLabs client constructed with apiKey", () => {
      const client = new TwelveLabs({ apiKey: "tlk_test_dummy_key" });
      expect(client.search).toBeDefined();
      expect(typeof client.search.query).toBe("function");
    });

    it("forwards every documented optional parameter to the underlying call", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [emptyPageData] }));

      await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual", "audio", "transcription"],
        queryText: "multi-option",
        transcriptionOptions: ["lexical", "semantic"],
        groupBy: "clip",
        operator: "and",
        pageLimit: 25,
        filter: '{"category": "nature"}',
        includeUserMetadata: true,
      });

      expect(queryMock).toHaveBeenCalledWith({
        indexId: INDEX_ID,
        searchOptions: ["visual", "audio", "transcription"],
        queryText: "multi-option",
        transcriptionOptions: ["lexical", "semantic"],
        groupBy: "clip",
        operator: "and",
        pageLimit: 25,
        filter: '{"category": "nature"}',
        includeUserMetadata: true,
      });
    });

    it("accepts a composed image+text query (queryMediaUrl + queryText)", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [singleClipResult] }));

      await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryMediaType: "image",
        queryMediaUrl: "https://example.com/car.jpg",
        queryText: "red color",
      });

      expect(queryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          queryMediaType: "image",
          queryMediaUrl: "https://example.com/car.jpg",
          queryText: "red color",
        }),
      );
    });

    it("forwards request-level options (e.g. abort signal, timeout) to the SDK", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [emptyPageData] }));

      const controller = new AbortController();
      await client.search.query(
        {
          indexId: INDEX_ID,
          searchOptions: ["visual"],
          queryText: "with-options",
        },
        { abortSignal: controller.signal, timeoutInSeconds: 30 },
      );

      expect(queryMock.mock.calls[0][1]).toMatchObject({
        abortSignal: controller.signal,
        timeoutInSeconds: 30,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // E - Exceptions
  // ---------------------------------------------------------------------------
  describe("E - Exceptions", () => {
    it("propagates BadRequestError from the API (e.g. malformed filter)", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockRejectedValue(
        new BadRequestError({
          code: "search_filter_invalid",
          message: "Invalid filter object",
        }),
      );

      await expect(
        client.search.query({
          indexId: INDEX_ID,
          searchOptions: ["visual"],
          queryText: "bad filter",
          filter: "{not-json",
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("propagates TooManyRequestsError when rate-limited", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockRejectedValue(
        new TooManyRequestsError({
          message: "Too many requests",
        }),
      );

      const promise = client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryText: "rate limited",
      });

      await expect(promise).rejects.toBeInstanceOf(TooManyRequestsError);
      await expect(promise).rejects.toBeInstanceOf(TwelvelabsApiError);
    });

    it("propagates an unsupported-search-option error from the server", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockRejectedValue(
        new BadRequestError({
          code: "search_option_not_supported",
          message: "search option not supported",
        }),
      );

      await expect(
        client.search.query({
          indexId: INDEX_ID,
          // Cast intentionally: simulating runtime payload that bypassed types
          searchOptions: ["telepathy" as unknown as "visual"],
          queryText: "anything",
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("propagates a server-side error for an unsupported index engine", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockRejectedValue(
        new BadRequestError({
          code: "index_not_supported_for_search",
          message: "Index does not have a Marengo engine enabled",
        }),
      );

      await expect(
        client.search.query({
          indexId: INDEX_ID,
          searchOptions: ["visual"],
          queryText: "doesn't matter",
        }),
      ).rejects.toMatchObject({
        body: expect.objectContaining({
          code: "index_not_supported_for_search",
        }),
      });
    });

    it("rejects at the type level when indexId is omitted (compile-time guard)", () => {
      // This test exists to document the contract. The cast below intentionally
      // strips the required field so the runtime call is exercised. The body
      // mock simulates how the API rejects such a request.
      const { client, queryMock } = buildMockClient();
      queryMock.mockRejectedValue(
        new BadRequestError({
          message: "indexId is required",
        }),
      );

      // @ts-expect-error indexId is required by the QueryRequest interface
      const promise = client.search.query({
        searchOptions: ["visual"],
        queryText: "missing index",
      });

      return expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("rejects at the type level when searchOptions is omitted", () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockRejectedValue(
        new BadRequestError({ message: "searchOptions is required" }),
      );

      // @ts-expect-error searchOptions is required by the QueryRequest interface
      const promise = client.search.query({
        indexId: INDEX_ID,
        queryText: "missing options",
      });

      return expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  // ---------------------------------------------------------------------------
  // S - Simple scenarios (the docs' canonical examples)
  // ---------------------------------------------------------------------------
  describe("S - Simple scenarios (docs examples)", () => {
    it("runs the docs' basic text-search example", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [manyClipResults.slice(0, 5)] }));

      const response = await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual", "audio"],
        queryText: "a person walking on the beach",
        groupBy: "video",
        operator: "or",
        filter: '{"category": "nature"}',
        pageLimit: 5,
      });

      expect(response.data.length).toBeLessThanOrEqual(5);
      expect(queryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          searchOptions: ["visual", "audio"],
          groupBy: "video",
          operator: "or",
          pageLimit: 5,
        }),
      );
    });

    it("runs the docs' image-search example with two URLs", async () => {
      const { client, queryMock } = buildMockClient();
      queryMock.mockResolvedValue(buildMockPage({ pages: [singleClipResult] }));

      const response = await client.search.query({
        indexId: INDEX_ID,
        searchOptions: ["visual"],
        queryMediaType: "image",
        queryMediaUrls: [
          "https://example.com/image1.jpg",
          "https://example.com/image2.jpg",
        ],
      });

      expect(response).toBeInstanceOf(Page);
      expect(queryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          queryMediaType: "image",
          queryMediaUrls: [
            "https://example.com/image1.jpg",
            "https://example.com/image2.jpg",
          ],
        }),
      );
    });
  });
});
