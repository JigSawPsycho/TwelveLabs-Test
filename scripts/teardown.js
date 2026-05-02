const { deleteIndex } = require("./upload");

function usage() {
  console.error("Usage: node scripts/teardown.js <indexId> <apiKey>");
  console.error("  deletes the index and every video inside it. cannot be undone.");
}

async function main() {
  const [indexId, apiKey] = process.argv.slice(2);
  if (!indexId || !apiKey) {
    usage();
    process.exit(1);
  }

  console.log(`deleting index ${indexId}...`);
  try {
    await deleteIndex(indexId, apiKey);
    console.log("deleted.");
  } catch (err) {
    console.error(`delete failed: ${err.message || err}`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(`fatal: ${err.message || err}`);
  process.exit(99);
});
