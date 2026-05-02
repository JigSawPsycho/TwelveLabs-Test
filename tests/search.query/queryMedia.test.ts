/**
 * Tests for the `queryMediaType` / `queryMediaUrl` request parameters.
 * Covers the documented image-query examples (gated `hasImageUrl`),
 * incompatible combinations with transcription, missing/invalid URLs, and
 * the SDK enum validation on `queryMediaType`.
 */

import { TwelveLabs, TwelvelabsApi } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { JsonError } from "twelvelabs-js/core/schemas/builders/schema-utils/JsonError";
import { Page } from "twelvelabs-js/core/pagination/Page";
import type { SearchWrapper } from "twelvelabs-js/wrapper/resources/SearchWrapper";

import {
  indexId,
  broadQuery,
  imageUrl,
  hasCredentials,
  hasImageUrl,
  describeIf,
} from "../helpers/env";
import { getClient } from "../helpers/client";

let client: TwelveLabs;

beforeAll(() => {
  if (hasCredentials) client = getClient();
});

describe("search.query queryMedia", () => {
  describeIf(hasImageUrl)("happy path (requires TWELVELABS_IMAGE_URL)", () => {
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
  });

  describeIf(hasCredentials)("validation rejection", () => {
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

    it("given queryMediaType='image' without queryMediaUrl when query runs throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryMediaType: "image",
      } as unknown as SearchWrapper.QueryRequest);
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given queryMediaUrl that 404s when query runs throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryMediaType: "image",
        queryMediaUrl: "https://example.com/this-image-does-not-exist-404.jpg",
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given queryMediaUrl that is not a URL when query runs throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryMediaType: "image",
        queryMediaUrl: "not-a-url",
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given queryMediaUrl pointing to non-image content when query runs throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryMediaType: "image",
        queryMediaUrl: "https://example.com/index.html",
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    // queryMediaType is enum_(["image"]) — "audio" is not a member, so the
    // SDK rejects it client-side.
    it("given queryMediaType='audio' (not in enum) when query runs throws JsonError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryMediaType:
          "audio" as unknown as TwelvelabsApi.SearchCreateRequestQueryMediaType,
        queryMediaUrl: "https://example.com/x.jpg",
      });
      await expect(promise).rejects.toBeInstanceOf(JsonError);
    });
  });
});
