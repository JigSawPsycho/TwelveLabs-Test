const fs = require("fs");
const path = require("path");
const { TwelveLabs } = require("twelvelabs-js");

const TERMINAL_STATUSES = new Set(["ready", "failed"]);

async function uploadVideo(filePath, indexId, apiKey, options = {}) {
  const { onProgress, pollIntervalMs = 5000 } = options;

  if (!filePath || !indexId || !apiKey) {
    throw new Error("filePath, indexId, and apiKey are required");
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const client = new TwelveLabs({ apiKey });
  const filename = path.basename(filePath);

  onProgress?.({ phase: "uploading", filename });
  const created = await client.tasks.create({
    indexId,
    videoFile: fs.createReadStream(filePath),
  });

  const taskId = created.id;
  if (!taskId) throw new Error(`No task id returned for ${filename}`);

  let task = created;
  let lastStatus = null;
  while (!TERMINAL_STATUSES.has(task.status)) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    task = await client.tasks.retrieve(taskId);
    if (task.status !== lastStatus) {
      onProgress?.({
        phase: task.status || "indexing",
        filename,
        taskId,
        videoId: task.videoId,
      });
      lastStatus = task.status;
    }
  }

  if (task.status === "failed") {
    throw new Error(`Indexing failed for ${filename}`);
  }

  return { taskId, videoId: task.videoId, status: task.status, filename };
}

async function getIndexVideoCount(indexId, apiKey) {
  const client = new TwelveLabs({ apiKey });
  let page = await client.indexes.videos.list(indexId, { pageLimit: 50 });
  let count = page.data?.length ?? 0;
  while (typeof page.hasNextPage === "function" && page.hasNextPage()) {
    page = await page.getNextPage();
    count += page.data?.length ?? 0;
  }
  return count;
}

async function createIndex(apiKey, options = {}) {
  const {
    indexName = `test-autogenerate-${Date.now()}`,
    models = [
      { modelName: "marengo3.0", modelOptions: ["visual", "audio"] },
      { modelName: "pegasus1.2", modelOptions: ["visual", "audio"] },
    ],
    addons,
  } = options;

  if (!apiKey) throw new Error("apiKey is required");

  const client = new TwelveLabs({ apiKey });
  const payload = { indexName, models };
  if (addons) payload.addons = addons;
  const created = await client.indexes.create(payload);
  if (!created?.id) {
    throw new Error("indexes.create returned no id");
  }
  return { indexId: created.id, indexName };
}

module.exports = { uploadVideo, getIndexVideoCount, createIndex };

if (require.main === module) {
  const [filePath, indexId, apiKey] = process.argv.slice(2);
  if (!filePath || !indexId || !apiKey) {
    console.error("Usage: node scripts/upload.js <filePath> <indexId> <apiKey>");
    process.exit(1);
  }
  uploadVideo(filePath, indexId, apiKey, {
    onProgress: ({ phase, filename, taskId, videoId }) => {
      const parts = [`[${filename}]`, phase];
      if (taskId) parts.push(`task=${taskId}`);
      if (videoId) parts.push(`video=${videoId}`);
      console.log(parts.join(" "));
    },
  })
    .then(({ taskId, videoId }) => {
      console.log(`OK task=${taskId} video=${videoId}`);
    })
    .catch((err) => {
      console.error(`ERROR: ${err.message}`);
      process.exit(2);
    });
}
