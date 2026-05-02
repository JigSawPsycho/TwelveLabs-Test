const fs = require("fs");
const path = require("path");
const { uploadVideo, getIndexVideoCount } = require("./upload");

const ASSETS_DIR = path.resolve(__dirname, "..", "assets");

function usage() {
  console.error("Usage: node scripts/setup.js <indexId> <apiKey> [--force]");
  console.error("  uploads every .mp4 in assets/ to the given index.");
  console.error("  refuses if index is non-empty unless --force is passed.");
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const positional = args.filter((a) => !a.startsWith("--"));
  const [indexId, apiKey] = positional;

  if (!indexId || !apiKey) {
    usage();
    process.exit(1);
  }

  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`assets dir missing: ${ASSETS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(ASSETS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".mp4"))
    .sort();

  if (files.length === 0) {
    console.error(`no .mp4 files in ${ASSETS_DIR}`);
    process.exit(1);
  }

  console.log(`checking index ${indexId}...`);
  let existing;
  try {
    existing = await getIndexVideoCount(indexId, apiKey);
  } catch (err) {
    console.error(`index check failed: ${err.message || err}`);
    process.exit(2);
  }

  if (existing > 0 && !force) {
    console.error(`index not empty — found ${existing} existing video(s). pass --force to upload anyway.`);
    process.exit(3);
  }

  console.log(`uploading ${files.length} file(s)...`);
  let ok = 0;
  let failed = 0;
  const results = [];

  for (const file of files) {
    const full = path.join(ASSETS_DIR, file);
    process.stdout.write(`→ ${file} ... `);
    try {
      const result = await uploadVideo(full, indexId, apiKey, {
        onProgress: ({ phase }) => {
          process.stdout.write(`${phase} `);
        },
      });
      console.log(`ok (video=${result.videoId})`);
      results.push({ file, ok: true, videoId: result.videoId });
      ok += 1;
    } catch (err) {
      console.log(`FAIL: ${err.message || err}`);
      results.push({ file, ok: false, error: err.message || String(err) });
      failed += 1;
    }
  }

  console.log("---");
  console.log(`done. ${ok}/${files.length} uploaded. ${failed} failed.`);
  if (failed > 0) process.exit(4);
}

main().catch((err) => {
  console.error(`fatal: ${err.message || err}`);
  process.exit(99);
});
