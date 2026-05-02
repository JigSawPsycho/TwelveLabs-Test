/**
 * Tests for the second `requestOptions` argument to `client.search.query`:
 * timeouts and abortSignal.
 */

import { TwelveLabs } from "twelvelabs-js";
import { TwelvelabsApiError } from "twelvelabs-js/errors/TwelvelabsApiError";
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

describe("search.query requestOptions", () => {
  describeIf(hasCredentials)("happy path", () => {
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

  describeIf(hasCredentials)("validation rejection", () => {
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

  /**
   * Pre-aborted user signals surface as the base TwelvelabsApiError ("The
   * user aborted a request"). Sub-millisecond timeouts on Node's fetch
   * implementation also surface as the base TwelvelabsApiError rather than
   * TwelvelabsApiTimeoutError, because the thrown error doesn't carry the
   * AbortError name the fetcher checks for.
   */
  describeIf(hasCredentials)("transport failure", () => {
    it("given a pre-aborted AbortSignal when query runs throws TwelvelabsApiError", async () => {
      const controller = new AbortController();
      controller.abort();
      const promise = client.search.query(
        {
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          pageLimit: 1,
        },
        { abortSignal: controller.signal },
      );
      await expect(promise).rejects.toBeInstanceOf(TwelvelabsApiError);
    });

    it("given timeoutInSeconds=0.001 (sub-millisecond) when query runs throws TwelvelabsApiError", async () => {
      const promise = client.search.query(
        {
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          pageLimit: 1,
        },
        { timeoutInSeconds: 0.001, maxRetries: 0 },
      );
      await expect(promise).rejects.toBeInstanceOf(TwelvelabsApiError);
    });
  });
});
