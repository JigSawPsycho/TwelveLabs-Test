/**
 * Tests for the `transcriptionOptions` request parameter
 * (enum_(["lexical", "semantic"])). Happy-path coverage lives alongside
 * other "every option together" tests in `contract.test.ts` and the
 * operator default tests; this file only pins the enum validation.
 */

import { TwelveLabs, TwelvelabsApi } from "twelvelabs-js";
import { JsonError } from "twelvelabs-js/core/schemas/builders/schema-utils/JsonError";

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

describe("search.query transcriptionOptions", () => {
  describeIf(hasCredentials)("validation rejection", () => {
    it("given transcriptionOptions=['bogus'] (invalid enum) when query runs throws JsonError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "transcription"],
        queryText: broadQuery,
        transcriptionOptions: [
          "bogus" as unknown as TwelvelabsApi.SearchCreateRequestTranscriptionOptionsItem,
        ],
      });
      await expect(promise).rejects.toBeInstanceOf(JsonError);
    });
  });
});
