import { TwelveLabs, TwelvelabsApi } from "twelvelabs-js";
import { Page } from "twelvelabs-js/core/pagination/Page";
import { HttpResponsePromise } from "twelvelabs-js/core/fetcher/HttpResponsePromise";

type MockPageOptions = {
  pages?: TwelvelabsApi.SearchItem[][];
};

/**
 * Build a real Page<SearchItem> with controllable pagination so the tests do
 * not depend on the network. The Page class only needs four callbacks and a
 * raw response object to behave correctly.
 */
export function buildMockPage(
  options: MockPageOptions = {},
): Page<TwelvelabsApi.SearchItem> {
  const pages = options.pages ?? [[]];
  let cursor = 0;

  const rawResponse = {
    headers: {},
    status: 200,
    statusText: "OK",
    url: "https://api.twelvelabs.io/v1.3/search",
  } as unknown as ConstructorParameters<typeof Page>[0]["rawResponse"];

  return new Page<TwelvelabsApi.SearchItem>({
    response: { data: pages[cursor] },
    rawResponse,
    hasNextPage: () => cursor + 1 < pages.length,
    getItems: (response) =>
      (response as { data: TwelvelabsApi.SearchItem[] }).data,
    // The Page implementation calls `.withRawResponse()` on whatever loadPage
    // returns, so we have to hand back an HttpResponsePromise (not a bare
    // Promise). `fromResult` builds one with both .then() and .withRawResponse.
    loadPage: () => {
      cursor += 1;
      const next = pages[cursor] ?? [];
      return HttpResponsePromise.fromResult({
        data: { data: next } as unknown,
        rawResponse,
      });
    },
  });
}

/**
 * Create a TwelveLabs client whose `search.query` is a Jest mock. Casting
 * keeps the rest of the wrapper intact (constructor, other resources) but
 * lets us assert on calls and stub the response.
 */
export function buildMockClient(): {
  client: TwelveLabs;
  queryMock: jest.Mock;
} {
  const client = new TwelveLabs({ apiKey: "tlk_test_dummy_key" });
  const queryMock = jest.fn();
  (client.search as unknown as { query: jest.Mock }).query = queryMock;
  return { client, queryMock };
}
