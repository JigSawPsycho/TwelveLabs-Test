/**
 * Tests for `client.search.retrieve` (pagination token endpoint). Happy
 * path is exercised implicitly by the multi-page iteration tests in
 * `pageLimit.test.ts` (getNextPage walks `retrieve` under the hood); this
 * file only pins the invalid-token failure modes.
 */

import { TwelveLabs } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { TwelvelabsApiError } from "twelvelabs-js/errors/TwelvelabsApiError";

import { hasCredentials, describeIf } from "../helpers/env";
import { getClient } from "../helpers/client";

let client: TwelveLabs;

beforeAll(() => {
  if (hasCredentials) client = getClient();
});

describe("search.query retrieve", () => {
  describeIf(hasCredentials)("validation rejection", () => {
    it("given expired or invalid page token when retrieve called throws BadRequestError (search_page_token_expired)", async () => {
      const expiredToken = "expired-or-invalid-page-token-000000";
      await expect(
        client.search.retrieve(expiredToken),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    // Empty / null tokens collapse the URL path so the server returns a
    // non-400 status (no token at all is a different shape than a malformed
    // one), surfacing as the base TwelvelabsApiError rather than
    // BadRequestError specifically.
    it("given empty page token '' when retrieve called throws TwelvelabsApiError", async () => {
      await expect(client.search.retrieve("")).rejects.toBeInstanceOf(
        TwelvelabsApiError,
      );
    });

    it("given null page token when retrieve called throws TwelvelabsApiError", async () => {
      await expect(
        client.search.retrieve(null as unknown as string),
      ).rejects.toBeInstanceOf(TwelvelabsApiError);
    });
  });
});
