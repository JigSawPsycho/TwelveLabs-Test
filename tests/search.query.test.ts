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
import { JsonError } from "twelvelabs-js/core/schemas/builders/schema-utils/JsonError";
import { Page } from "twelvelabs-js/core/pagination/Page";
import type { SearchWrapper } from "twelvelabs-js/wrapper/resources/SearchWrapper";

import {
  apiKey,
  indexId,
  broadQuery,
  imageUrl,
  redVideoId,
  blueVideoId,
  greenVideoId,
  rgbVideoId,
  fiveSecVideoIds,
  tenSecVideoIds,
  px400VideoIds,
  px800VideoIds,
  testnameFilename,
  testnameFilenameVideoId,
  hasCredentials,
  hasImageUrl,
  hasColorVideos,
  hasDurationVideos,
  hasDimensionVideos,
  hasFilenameVideo,
  describeIf,
} from "./helpers/env";

const NONEXISTENT_VIDEO_ID = "000000000000000000000000";

/**
 * Walks up to `maxPages` of pagination and returns the union of every videoId
 * surfaced. Lets assertions check membership at the video level even when the
 * API returns clip-grouped results spread across pages.
 */
const collectVideoIds = async (
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
    it("given filter that excludes every video when query runs returns empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: `{"duration": {"gte": 999999999}}`,
      });

      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
      expect(response.hasNextPage()).toBe(false);
    });

    it("given empty Page when iterated with for-await yields zero items", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: `{"duration": {"gte": 999999999}}`,
      });

      const collected: TwelvelabsApi.SearchItem[] = [];
      for await (const item of response) {
        collected.push(item);
      }
      expect(collected).toHaveLength(0);
    });
  });

  describeIf(hasCredentials)("with pageLimit=1", () => {
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
  });

  describeIf(hasCredentials)("with multiple matches", () => {
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

    it("given groupBy=video when query runs each grouped item exposes an identifier string", async () => {
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
      }
    });

    it("given groupBy=video when query runs each grouped item with a clips field carries an array", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        groupBy: "video",
        pageLimit: 5,
      });

      for (const item of response.data) {
        if (item.clips !== undefined) {
          expect(Array.isArray(item.clips)).toBe(true);
        }
      }
    });
  });

  describeIf(hasCredentials)("at documented limits", () => {
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

    it("given 500-token query string when query runs returns a Page", async () => {
      const longQuery = Array.from({ length: 500 }, () => "word").join(" ");
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: longQuery,
        pageLimit: 1,
      });
      expect(response).toBeInstanceOf(Page);
    });

    // Server enforces a hard 500-token cap on query_text and rejects past it
    // with parameter_invalid. The existing 500-token test above sits exactly
    // on that cap and is accepted; this one pushes past it.
    it("given >500-token query string when query runs throws BadRequestError", async () => {
      const hugeQuery = "word ".repeat(2500).trim();
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: hugeQuery,
        pageLimit: 1,
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

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

  describeIf(hasCredentials)("response contract", () => {
    it("given a successful query when response inspected exposes Page with AsyncIterable contract", async () => {
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

    it("given a TwelveLabs client when inspected exposes search.query function", () => {
      expect(client.search).toBeDefined();
      expect(typeof client.search.query).toBe("function");
    });

    it("given every documented option parameter together with transcriptionOptions=[lexical] when query runs returns result Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "transcription"],
        queryText: broadQuery,
        transcriptionOptions: ["lexical"],
        groupBy: "clip",
        operator: "or",
        pageLimit: 5,
        filter: "{}",
        includeUserMetadata: true,
      });
      expect(response).toBeInstanceOf(Page);
    });

    it("given every documented option parameter together with transcriptionOptions=[semantic] when query runs returns result Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "transcription"],
        queryText: broadQuery,
        transcriptionOptions: ["semantic"],
        groupBy: "clip",
        operator: "or",
        pageLimit: 5,
        filter: "{}",
        includeUserMetadata: true,
      });
      expect(response).toBeInstanceOf(Page);
    });

    it("given a request-level timeout when query runs returns Page within timeout", async () => {
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

    // Negative timeout has no valid meaning; SDK + server reject the request.
    it("given timeoutInSeconds=-1 when query runs throws TwelvelabsApiError", async () => {
      const promise = client.search.query(
        {
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          pageLimit: 1,
        },
        { timeoutInSeconds: -1 },
      );
      await expect(promise).rejects.toBeInstanceOf(TwelvelabsApiError);
    });
  });

  describeIf(hasCredentials)("invalid input", () => {
    it("given malformed filter when query runs throws BadRequestError", async () => {
      await expect(
        client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: "{not-json",
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given unsupported search option when query runs throws JsonError (SDK enum validation)", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["telepathy" as unknown as "visual"],
        queryText: broadQuery,
      });
      await expect(promise).rejects.toBeInstanceOf(JsonError);
    });

    it("given nonexistent index ID when query runs throws TwelvelabsApiError", async () => {
      const promise = client.search.query({
        indexId: NONEXISTENT_VIDEO_ID,
        searchOptions: ["visual"],
        queryText: broadQuery,
      });
      await expect(promise).rejects.toBeInstanceOf(TwelvelabsApiError);
    });
  });

  describeIf(hasCredentials)("documented error codes", () => {
    it("given unknown search option when query runs throws JsonError before request (search_option_not_supported)", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["telepathy" as unknown as "visual"],
        queryText: broadQuery,
      });
      await expect(promise).rejects.toBeInstanceOf(JsonError);
    });

    it("given incompatible search option combination with transcriptionOptions=[lexical] when query runs throws BadRequestError (search_option_combination_not_supported)", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryMediaType: "image",
        queryMediaUrl: hasImageUrl ? imageUrl! : "https://example.com/x.jpg",
        transcriptionOptions: ["lexical"],
      } as unknown as SearchWrapper.QueryRequest);
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given incompatible search option combination with transcriptionOptions=[semantic] when query runs throws BadRequestError (search_option_combination_not_supported)", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryMediaType: "image",
        queryMediaUrl: hasImageUrl ? imageUrl! : "https://example.com/x.jpg",
        transcriptionOptions: ["semantic"],
      } as unknown as SearchWrapper.QueryRequest);
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given filter with invalid operator when query runs throws BadRequestError (search_filter_invalid)", async () => {
      await expect(
        client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: `{"duration": {"bogus_op": 1}}`,
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given expired or invalid page token when retrieve called throws BadRequestError (search_page_token_expired)", async () => {
      const expiredToken = "expired-or-invalid-page-token-000000";
      await expect(
        client.search.retrieve(expiredToken),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given nonexistent or non-Marengo index when query runs throws TwelvelabsApiError (index_not_supported_for_search)", async () => {
      const promise = client.search.query({
        indexId: NONEXISTENT_VIDEO_ID,
        searchOptions: ["visual"],
        queryText: broadQuery,
      });
      await expect(promise).rejects.toBeInstanceOf(TwelvelabsApiError);
    });
  });

  describeIf(hasCredentials)("required parameters", () => {
    it("given missing indexId when query runs throws BadRequestError", async () => {
      const promise = client.search.query({
        searchOptions: ["visual"],
        queryText: broadQuery,
      } as unknown as SearchWrapper.QueryRequest);
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given missing searchOptions when query runs throws TypeError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        queryText: broadQuery,
      } as unknown as SearchWrapper.QueryRequest);
      await expect(promise).rejects.toBeInstanceOf(TypeError);
    });
  });

  describeIf(hasCredentials)("documented text-search example", () => {
    it("given documented text-search example params when query runs returns Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "transcription"],
        queryText: broadQuery,
        groupBy: "video",
        operator: "or",
        pageLimit: 5,
      });
      expect(response).toBeInstanceOf(Page);
    });
  });

  /**
   * Color-matching tests against four uploaded test videos:
   *   - RED   solo: solid red clip, voice says "red"
   *   - BLUE  solo: solid blue clip, voice says "blue"
   *   - GREEN solo: solid green clip, voice says "green"
   *   - RGB:        red+blue+green visual content, no audio track
   *
   * For each color, a visual query should rank the matching solo video as the
   * strongest (top) result. The AND/OR divergence and default-operator tests
   * further down still rely on the silent RGB video to prove operator
   * semantics, which is why hasColorVideos gates this whole block.
   */
  describeIf(hasColorVideos)("operator and searchOptions combinations", () => {
    type Color = "red" | "blue" | "green";
    const soloVideoId: Record<Color, string> = {
      red: redVideoId!,
      blue: blueVideoId!,
      green: greenVideoId!,
    };

    describe.each<Color>(["red", "blue", "green"])("query=%s", (color) => {
      // Top result indicates strongest match; for an unambiguous color query
      // the matching solo video should out-rank the RGB video (which only
      // partially matches the queried color visually).
      it("given searchOptions=[visual] returns the matching solo color video as the top (highest-scoring) result", async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: color,
          pageLimit: 50,
        });
        expect(response.data[0]?.videoId).toBe(soloVideoId[color]);
      });
    });

    // RGB has visual=red but no transcript, so OR (union) returns it while
    // AND (intersection) drops it. Splitting into per-operator tests means a
    // failure points at exactly which operator's behavior broke; the subset
    // invariant is its own claim and gets its own test.
    describe("operator=or vs operator=and on query=red, visual+transcription, lexical", () => {
      let orIds: Set<string>;
      let andIds: Set<string>;

      beforeAll(async () => {
        const common = {
          indexId: indexId!,
          searchOptions: [
            "visual",
            "transcription",
          ] as TwelvelabsApi.SearchCreateRequestSearchOptionsItem[],
          transcriptionOptions: [
            "lexical"
          ] as TwelvelabsApi.SearchCreateRequestTranscriptionOptionsItem[],
          queryText: "red",
          pageLimit: 50,
        };
        const [orResp, andResp] = await Promise.all([
          client.search.query({ ...common, operator: "or" }),
          client.search.query({ ...common, operator: "and" }),
        ]);
        [orIds, andIds] = await Promise.all([
          collectVideoIds(orResp),
          collectVideoIds(andResp),
        ]);
      });

      it("operator=or returns the silent RGB video (visual matches under union)", () => {
        expect(orIds).toContain(rgbVideoId!);
      });

      it("operator=and excludes the silent RGB video (no transcript breaks intersection)", () => {
        expect(andIds).not.toContain(rgbVideoId!);
      });

      it("operator=and result set is a subset of operator=or result set", () => {
        for (const id of andIds) expect(orIds).toContain(id);
      });
    });

    it("given visual+transcription on query=red with transcriptionOptions=[lexical], omitted operator matches operator=or (default is or)", async () => {
      const common = {
        indexId: indexId!,
        searchOptions: [
          "visual",
          "transcription",
        ] as TwelvelabsApi.SearchCreateRequestSearchOptionsItem[],
        transcriptionOptions: [
          "lexical",
        ] as TwelvelabsApi.SearchCreateRequestTranscriptionOptionsItem[],
        queryText: "red",
        pageLimit: 50,
      };
      const [defaultResp, orResp] = await Promise.all([
        client.search.query(common),
        client.search.query({ ...common, operator: "or" }),
      ]);
      const [defaultIds, orIds] = await Promise.all([
        collectVideoIds(defaultResp),
        collectVideoIds(orResp),
      ]);
      expect(Array.from(defaultIds).sort()).toEqual(Array.from(orIds).sort());
    });

    it("given visual+transcription on query=red with transcriptionOptions=[semantic], omitted operator matches operator=or (default is or)", async () => {
      const common = {
        indexId: indexId!,
        searchOptions: [
          "visual",
          "transcription",
        ] as TwelvelabsApi.SearchCreateRequestSearchOptionsItem[],
        transcriptionOptions: [
          "semantic",
        ] as TwelvelabsApi.SearchCreateRequestTranscriptionOptionsItem[],
        queryText: "red",
        pageLimit: 50,
      };
      const [defaultResp, orResp] = await Promise.all([
        client.search.query(common),
        client.search.query({ ...common, operator: "or" }),
      ]);
      const [defaultIds, orIds] = await Promise.all([
        collectVideoIds(defaultResp),
        collectVideoIds(orResp),
      ]);
      expect(Array.from(defaultIds).sort()).toEqual(Array.from(orIds).sort());
    });

    it("given invalid operator value when query runs throws JsonError (SDK enum validation)", async () => {
      // The SDK declares `operator` as enum_(["or", "and"]); serialization
      // rejects "xor" client-side before any HTTP request is sent.
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "transcription"],
        queryText: "red",
        operator: "xor" as unknown as TwelvelabsApi.SearchCreateRequestOperator,
        pageLimit: 5,
      });
      await expect(promise).rejects.toBeInstanceOf(JsonError);
    });
  });

  /**
   * Filter parameter coverage. Each describe block targets one system metadata
   * filter (duration / width / height / filename). Tests scope the candidate
   * pool with the `id` filter so the property filter under test is the only
   * variable: the assertion is then "the property filter narrows the pool to
   * exactly the videos with that property value", regardless of how the
   * semantic search ranks them.
   *
   * The `size` (bytes) filter is intentionally not covered yet.
   */
  describeIf(hasCredentials)("filter parameter: null", () => {
    // SDK signature is `filter?: string`; passing null is a TS error in strict
    // mode, so we cast through. Empirically the runtime treats null as "no
    // filter" rather than rejecting it: the call resolves to a normal Page
    // instead of throwing. Pinned here so a future SDK change that starts
    // rejecting null becomes a visible test failure.
    it("filter=null when query runs returns a Page (treated as no filter)", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: null as unknown as string,
        pageLimit: 1,
      });
      expect(response).toBeInstanceOf(Page);
    });
  });

  describeIf(hasDurationVideos)("filter parameter: duration", () => {
    const allDurationIds = (): string[] => [
      ...(fiveSecVideoIds ?? []),
      ...(tenSecVideoIds ?? []),
    ];

    describe("filter duration<=7", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({
            id: allDurationIds(),
            duration: { lte: 7 },
          }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("includes the 5-second videos", () => {
        for (const id of fiveSecVideoIds!) expect(ids).toContain(id);
      });

      it("excludes the 10-second videos", () => {
        for (const id of tenSecVideoIds!) expect(ids).not.toContain(id);
      });
    });

    describe("filter duration>=8", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({
            id: allDurationIds(),
            duration: { gte: 8 },
          }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("includes the 10-second videos", () => {
        for (const id of tenSecVideoIds!) expect(ids).toContain(id);
      });

      it("excludes the 5-second videos", () => {
        for (const id of fiveSecVideoIds!) expect(ids).not.toContain(id);
      });
    });

    // Zero — bound is unsatisfiable for the candidate pool, so the filter
    // must produce no results. Combined with the id scope, this proves the
    // filter actually narrows rather than silently passing everything through.
    describe("filter duration>=999999 (zero matches)", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({
            id: allDurationIds(),
            duration: { gte: 999999 },
          }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("returns no videos", () => {
        expect(ids.size).toBe(0);
      });
    });
  });

  describeIf(hasDimensionVideos)("filter parameter: width", () => {
    const allDimensionIds = (): string[] => [
      ...(px400VideoIds ?? []),
      ...(px800VideoIds ?? []),
    ];

    // Real uploads aren't always exactly the nominal pixel size, so the
    // bucket filters use a ±50px tolerance window around 400 and 800. This
    // keeps the assertion ("the 400-ish bucket lands in the 400-ish window
    // and not the 800-ish window") robust to small encoder/scaling drift.
    describe("filter width 350-450 (400 bucket, ±50 tolerance)", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({
            id: allDimensionIds(),
            width: { gte: 350, lte: 450 },
          }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("includes the 400x400 videos", () => {
        for (const id of px400VideoIds!) expect(ids).toContain(id);
      });

      it("excludes the 800x800 videos", () => {
        for (const id of px800VideoIds!) expect(ids).not.toContain(id);
      });
    });

    describe("filter width 750-850 (800 bucket, ±50 tolerance)", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({
            id: allDimensionIds(),
            width: { gte: 750, lte: 850 },
          }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("includes the 800x800 videos", () => {
        for (const id of px800VideoIds!) expect(ids).toContain(id);
      });

      it("excludes the 400x400 videos", () => {
        for (const id of px400VideoIds!) expect(ids).not.toContain(id);
      });
    });

    // Zero — width neither bucket has, with the id scope still in place.
    describe("filter width=99999 (zero matches)", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({ id: allDimensionIds(), width: 99999 }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("returns no videos", () => {
        expect(ids.size).toBe(0);
      });
    });

    // Many / Interface — range form covers both buckets at once. Range
    // widened to 350-850 so the ±50 tolerance around the 400 and 800 buckets
    // both fall safely inside.
    describe("filter width range {gte:350, lte:850} (covers both buckets, ±50 tolerance)", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({
            id: allDimensionIds(),
            width: { gte: 350, lte: 850 },
          }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("includes the 400x400 videos", () => {
        for (const id of px400VideoIds!) expect(ids).toContain(id);
      });

      it("includes the 800x800 videos", () => {
        for (const id of px800VideoIds!) expect(ids).toContain(id);
      });
    });
  });

  describeIf(hasDimensionVideos)("filter parameter: height", () => {
    const allDimensionIds = (): string[] => [
      ...(px400VideoIds ?? []),
      ...(px800VideoIds ?? []),
    ];

    describe("filter height 350-450 (400 bucket, ±50 tolerance)", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({
            id: allDimensionIds(),
            height: { gte: 350, lte: 450 },
          }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("includes the 400x400 videos", () => {
        for (const id of px400VideoIds!) expect(ids).toContain(id);
      });

      it("excludes the 800x800 videos", () => {
        for (const id of px800VideoIds!) expect(ids).not.toContain(id);
      });
    });

    describe("filter height 750-850 (800 bucket, ±50 tolerance)", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({
            id: allDimensionIds(),
            height: { gte: 750, lte: 850 },
          }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("includes the 800x800 videos", () => {
        for (const id of px800VideoIds!) expect(ids).toContain(id);
      });

      it("excludes the 400x400 videos", () => {
        for (const id of px400VideoIds!) expect(ids).not.toContain(id);
      });
    });

    describe("filter height=99999 (zero matches)", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({ id: allDimensionIds(), height: 99999 }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("returns no videos", () => {
        expect(ids.size).toBe(0);
      });
    });

    describe("filter height range {gte:350, lte:850} (covers both buckets, ±50 tolerance)", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({
            id: allDimensionIds(),
            height: { gte: 350, lte: 850 },
          }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("includes the 400x400 videos", () => {
        for (const id of px400VideoIds!) expect(ids).toContain(id);
      });

      it("includes the 800x800 videos", () => {
        for (const id of px800VideoIds!) expect(ids).toContain(id);
      });
    });
  });

  describeIf(hasFilenameVideo)("filter parameter: filename", () => {
    it("filter filename=<configured> returns the video with that exact filename", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ filename: testnameFilename }),
        pageLimit: 50,
      });
      const ids = await collectVideoIds(response);
      expect(ids).toContain(testnameFilenameVideoId!);
    });

    // Zero — a filename that no uploaded video has must produce an empty
    // result set, proving the filter actually matches and isn't being ignored.
    it("filter filename=<nonexistent> returns no videos (zero matches)", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          filename: "__nonexistent_filename_for_test__.mp4",
        }),
        pageLimit: 50,
      });
      const ids = await collectVideoIds(response);
      expect(ids.size).toBe(0);
    });
  });

  /**
   * Invalid filter inputs. The SDK declares `filter?: string` (a stringified
   * JSON object) so TypeScript only enforces the outer string type — the
   * server is what validates the inner shape. These tests pin down the error
   * surface for each kind of misuse:
   *
   *   - filter is null            → SDK type rejects at compile (string|undef);
   *                                 cast through and the server rejects too.
   *   - filter is a non-JSON blob → already covered by "malformed filter"
   *                                 in the global "invalid input" block.
   *   - filter is JSON but not an object (array / scalar) → server rejects.
   *   - per-field type mismatches → server rejects.
   *   - per-field bogus operator  → server rejects (one global proof exists
   *                                 for `duration`; we add `width`/`height`
   *                                 to confirm it's per-field, not duration-
   *                                 specific).
   *
   * All server-side rejections surface as BadRequestError. We don't pin a
   * specific error code because the API may bucket several of these under
   * the same `search_filter_invalid` code or one of its siblings.
   */
  describeIf(hasCredentials)("filter parameter: invalid inputs", () => {
    it("filter as a JSON array (not an object) throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify([{ duration: 5 }]),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("filter as a JSON scalar (not an object) throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify(42),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("filter with duration as a string value throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ duration: "five" }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("filter with width as a string value throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ width: "wide" }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("filter with height as a string value throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ height: "tall" }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("filter with filename as a number throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ filename: 123 }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

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

    it("filter with bogus operator on width throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ width: { bogus_op: 400 } }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("filter with bogus operator on height throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ height: { bogus_op: 400 } }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  /**
   * Extreme / potentially dangerous values. These probe the failure modes of
   * the SDK + server when callers pass values that exercise integer limits,
   * very long strings, or oversized arrays. Each test pins one specific
   * outcome so a regression points at exactly what changed.
   *
   * Outcomes were chosen by:
   *   - documented behavior where it exists,
   *   - empirically observed behavior where the docs are silent
   *     (e.g. MAX_SAFE_INTEGER bounds degrade to a no-op rather than
   *     narrowing the result set to zero),
   *   - the most defensible interpretation otherwise. If a future SDK or
   *     server change flips one of these, the failure isolates the change
   *     to the specific input being tested.
   */
  describeIf(hasCredentials)("filter parameter: extreme/boundary values", () => {
    // gte=MAX_SAFE_INTEGER is satisfied by no real video duration, so the
    // filter narrows the result set to nothing.
    it("filter duration gte=Number.MAX_SAFE_INTEGER returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          duration: { gte: Number.MAX_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    // lte=MAX_SAFE_INTEGER is satisfied by every real duration, so the
    // filter degenerates to a passthrough and the search returns its normal
    // populated Page.
    it("filter duration lte=Number.MAX_SAFE_INTEGER returns a Page with one or more results", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          duration: { lte: Number.MAX_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeGreaterThan(0);
    });

    // gte=MIN_SAFE_INTEGER is satisfied by every real duration, so the
    // filter is also a passthrough.
    it("filter duration gte=Number.MIN_SAFE_INTEGER returns a Page with one or more results", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          duration: { gte: Number.MIN_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeGreaterThan(0);
    });

    // lte=MIN_SAFE_INTEGER is satisfied by no real duration, so the filter
    // narrows to nothing.
    it("filter duration lte=Number.MIN_SAFE_INTEGER returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          duration: { lte: Number.MIN_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    // Negative duration as an exact-equality value is accepted by the server
    // and treated as a literal match against -1 (which no real video has),
    // so the result is an empty Page rather than a rejection.
    it("filter duration=-1 (exact) returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ duration: -1 }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    // gte=-1 is satisfied by every non-negative duration, so the filter
    // matches every video; result is a populated Page.
    it("filter duration gte=-1 (negative operator value) returns a Page with one or more results", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ duration: { gte: -1 } }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeGreaterThan(0);
    });

    // lte=-1 is satisfied by no non-negative duration, so the filter matches
    // nothing; result is a Page with empty data.
    it("filter duration lte=-1 (negative operator value) returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ duration: { lte: -1 } }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    it("filter width gte=Number.MAX_SAFE_INTEGER returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          width: { gte: Number.MAX_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    it("filter width lte=Number.MAX_SAFE_INTEGER returns a Page with one or more results", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          width: { lte: Number.MAX_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeGreaterThan(0);
    });

    it("filter width gte=Number.MIN_SAFE_INTEGER returns a Page with one or more results", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          width: { gte: Number.MIN_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeGreaterThan(0);
    });

    it("filter width lte=Number.MIN_SAFE_INTEGER returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          width: { lte: Number.MIN_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    it("filter height gte=Number.MAX_SAFE_INTEGER returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          height: { gte: Number.MAX_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    it("filter height lte=Number.MAX_SAFE_INTEGER returns a Page with one or more results", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          height: { lte: Number.MAX_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeGreaterThan(0);
    });

    it("filter height gte=Number.MIN_SAFE_INTEGER returns a Page with one or more results", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          height: { gte: Number.MIN_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeGreaterThan(0);
    });

    it("filter height lte=Number.MIN_SAFE_INTEGER returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          height: { lte: Number.MIN_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    it("filter width=-1 (exact) returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ width: -1 }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    it("filter width gte=-1 (negative operator value) returns a Page with one or more results", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ width: { gte: -1 } }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeGreaterThan(0);
    });

    it("filter width lte=-1 (negative operator value) returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ width: { lte: -1 } }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    it("filter height=-1 (exact) returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ height: -1 }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    it("filter height gte=-1 (negative operator value) returns a Page with one or more results", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ height: { gte: -1 } }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeGreaterThan(0);
    });

    it("filter height lte=-1 (negative operator value) returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ height: { lte: -1 } }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    // No real filename will be this long, so the server returns an empty
    // result rather than rejecting the filter outright.
    it("filter filename with a >10,000-char string returns an empty Page", async () => {
      const hugeFilename = "x".repeat(10_001);
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ filename: hugeFilename }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

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

  describeIf(hasImageUrl)(
    "documented image-search example (requires TWELVELABS_IMAGE_URL)",
    () => {
      it("given documented image-URL params when query runs returns Page", async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryMediaType: "image",
          queryMediaUrl: imageUrl!,
          pageLimit: 5,
        });
        expect(response).toBeInstanceOf(Page);
      });

      it("given composed image+text params when query runs returns Page", async () => {
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
