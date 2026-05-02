require("dotenv/config");
const { getIndexVideoIds } = require("../../scripts/upload");

/**
 * Runs once before the Jest suite. Refuses to start the tests if the index
 * contains any video ID outside ALLOWED_IDS — extra videos would pollute
 * filter/count assertions and produce false failures.
 */
module.exports = async function globalSetup() {
  const apiKey = process.env.TWELVELABS_API_KEY?.trim();
  const indexId = process.env.TWELVELABS_INDEX_ID?.trim();
  const rawAllowed = process.env.ALLOWED_IDS;

  if (!apiKey || !indexId) return;
  if (!rawAllowed) return;

  const allowed = rawAllowed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return;

  const allowedSet = new Set(allowed);
  const currentIds = await getIndexVideoIds(indexId, apiKey);
  const unapproved = currentIds.filter((id) => !allowedSet.has(id));
  if (unapproved.length > 0) {
    throw new Error(
      `the test index contains unapproved ids, please remove the following ids:\n  ${unapproved.join("\n  ")}`,
    );
  }
};
