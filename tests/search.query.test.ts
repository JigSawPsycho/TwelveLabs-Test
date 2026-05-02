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
    it("given pageLimit=10 when query runs returns Page whose data length obeys limit", async () => {
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

    it("given groupBy=video when query runs returns clip groups", async () => {
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

    it("given pageLimit > 50 when query runs either clamps to 50 or throws TwelvelabsApiError", async () => {
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

    it("given every documented option parameter together when query runs returns result Page", async () => {
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

    it("given incompatible search option combination when query runs throws BadRequestError (search_option_combination_not_supported)", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryMediaType: "image",
        queryMediaUrl: hasImageUrl ? imageUrl! : "https://example.com/x.jpg",
        transcriptionOptions: ["lexical", "semantic"],
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
        searchOptions: ["visual", "audio"],
        queryText: broadQuery,
        groupBy: "video",
        operator: "or",
        pageLimit: 5,
      });
      expect(response).toBeInstanceOf(Page);
    });
  });

  describeIf(hasCredentials)("operator and searchOptions combinations", () => {
    it("given operator=or with two modalities when query runs returns Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "audio"],
        queryText: broadQuery,
        operator: "or",
        pageLimit: 10,
      });
      expect(response).toBeInstanceOf(Page);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("given operator=and with two modalities when query runs returns Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "audio"],
        queryText: broadQuery,
        operator: "and",
        pageLimit: 10,
      });
      expect(response).toBeInstanceOf(Page);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("given operator=or with all three modalities when query runs returns Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "audio", "transcription"],
        queryText: broadQuery,
        operator: "or",
        pageLimit: 10,
      });
      expect(response).toBeInstanceOf(Page);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("given operator=and with all three modalities when query runs returns Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "audio", "transcription"],
        queryText: broadQuery,
        operator: "and",
        pageLimit: 10,
      });
      expect(response).toBeInstanceOf(Page);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("given operator=or returns superset of operator=and for same modalities", async () => {
      const common = {
        indexId: indexId!,
        searchOptions: ["visual", "audio"] as TwelvelabsApi.SearchCreateRequestSearchOptionsItem[],
        queryText: broadQuery,
        pageLimit: 50,
      };
      const [orResp, andResp] = await Promise.all([
        client.search.query({ ...common, operator: "or" }),
        client.search.query({ ...common, operator: "and" }),
      ]);
      expect(orResp).toBeInstanceOf(Page);
      expect(andResp).toBeInstanceOf(Page);
      // AND tightens the result set; on a single page it must not exceed OR.
      expect(andResp.data.length).toBeLessThanOrEqual(orResp.data.length);
    });

    it("given omitted operator when query runs matches operator=or behavior (default is or)", async () => {
      const common = {
        indexId: indexId!,
        searchOptions: ["visual", "audio"] as TwelvelabsApi.SearchCreateRequestSearchOptionsItem[],
        queryText: broadQuery,
        pageLimit: 10,
      };
      const [defaultResp, orResp] = await Promise.all([
        client.search.query(common),
        client.search.query({ ...common, operator: "or" }),
      ]);
      expect(defaultResp).toBeInstanceOf(Page);
      expect(orResp).toBeInstanceOf(Page);
      expect(defaultResp.data.length).toEqual(orResp.data.length);
    });

    it("given operator=and with single searchOption when query runs returns Page (operator is no-op)", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        operator: "and",
        pageLimit: 5,
      });
      expect(response).toBeInstanceOf(Page);
    });

    it("given operator=or with single searchOption when query runs returns Page (operator is no-op)", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        operator: "or",
        pageLimit: 5,
      });
      expect(response).toBeInstanceOf(Page);
    });

    it("given duplicate searchOptions entries when query runs returns Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "visual"],
        queryText: broadQuery,
        operator: "and",
        pageLimit: 5,
      });
      expect(response).toBeInstanceOf(Page);
    });

    it("given invalid operator value when query runs throws JsonError or BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "audio"],
        queryText: broadQuery,
        operator: "xor" as unknown as TwelvelabsApi.SearchCreateRequestOperator,
        pageLimit: 5,
      });
      await expect(promise).rejects.toBeInstanceOf(Error);
      await promise.catch((err) => {
        expect(
          err instanceof JsonError || err instanceof BadRequestError,
        ).toBe(true);
      });
    });

    it("given operator=and with transcription+visual when query runs returns Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "transcription"],
        queryText: broadQuery,
        operator: "and",
        transcriptionOptions: ["lexical", "semantic"],
        pageLimit: 5,
      });
      expect(response).toBeInstanceOf(Page);
    });

    it("given operator=or with transcription+audio when query runs returns Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["audio", "transcription"],
        queryText: broadQuery,
        operator: "or",
        transcriptionOptions: ["lexical", "semantic"],
        pageLimit: 5,
      });
      expect(response).toBeInstanceOf(Page);
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
