const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { resolveArtifactDirectory, writeManifest, readManifest, makeAnalysisKey } = require("../analysisStore");

test("writes and reads versioned analysis manifests and keys transcript changes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eduplay-cache-test-"));
  try {
    const videoPath = path.join(root, "lecture.mp4");
    await fs.writeFile(videoPath, "test video bytes");
    const directory = await resolveArtifactDirectory(videoPath);
    await writeManifest(directory, { flashcards: [{ id: "card-1" }] });
    const stored = await readManifest(videoPath);
    assert.equal(stored.manifest.schemaVersion, 1);
    assert.equal(stored.manifest.flashcards[0].id, "card-1");
    const stat = await fs.stat(videoPath);
    assert.notEqual(makeAnalysisKey(stat, "transcript-a"), makeAnalysisKey(stat, "transcript-b"));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
