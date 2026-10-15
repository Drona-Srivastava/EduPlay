const fs = require("fs").promises;
const fsConstants = require("fs").constants;
const os = require("os");
const path = require("path");
const { fingerprint } = require("./lectureContext");

const SCHEMA_VERSION = 1;

function cachePaths(videoPath) {
  const parsed = path.parse(videoPath);
  const sidecar = path.join(parsed.dir, `.${parsed.name}.eduplay`);
  const fallback = path.join(os.homedir(), ".eduplay", "learning", fingerprint(path.resolve(videoPath)).slice(0, 32));
  return { sidecar, fallback };
}

async function canUseDirectory(directory) {
  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.access(directory, fsConstants.W_OK);
    return true;
  } catch (_) { return false; }
}

async function resolveArtifactDirectory(videoPath) {
  const { sidecar, fallback } = cachePaths(videoPath);
  if (await canUseDirectory(sidecar)) return sidecar;
  await fs.mkdir(fallback, { recursive: true });
  return fallback;
}

async function readManifest(videoPath) {
  const { sidecar, fallback } = cachePaths(videoPath);
  for (const directory of [sidecar, fallback]) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(directory, "analysis.json"), "utf8"));
      if (manifest.schemaVersion === SCHEMA_VERSION) return { directory, manifest };
    } catch (_) { /* Try fallback or start a new analysis. */ }
  }
  return { directory: await resolveArtifactDirectory(videoPath), manifest: null };
}

async function writeManifest(directory, manifest) {
  const target = path.join(directory, "analysis.json");
  const temporary = `${target}.${process.pid}.tmp`;
  const contents = JSON.stringify({ ...manifest, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() }, null, 2);
  await fs.writeFile(temporary, contents, "utf8");
  try {
    await fs.rename(temporary, target);
  } catch (renameError) {
    try { await fs.writeFile(target, contents, "utf8"); }
    catch (writeError) { writeError.cause = renameError; throw writeError; }
    finally { await fs.unlink(temporary).catch(() => {}); }
  }
}

function makeAnalysisKey(videoStat, transcriptFingerprint, models = {}) {
  return fingerprint({ size: videoStat.size, modifiedAt: videoStat.mtimeMs, transcriptFingerprint, models, schemaVersion: SCHEMA_VERSION });
}

module.exports = { SCHEMA_VERSION, cachePaths, resolveArtifactDirectory, readManifest, writeManifest, makeAnalysisKey };
