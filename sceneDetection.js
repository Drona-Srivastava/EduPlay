const fs = require("fs").promises;
const path = require("path");
const { spawn } = require("child_process");

function getFfmpegPath() {
  const resourceDirectory = process.resourcesPath || __dirname;
  const candidates = [
    process.env.EDUPLAY_FFMPEG,
    path.join(resourceDirectory, "ffmpeg-binaries", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"),
    path.join(__dirname, "ffmpeg-binaries", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { require("fs").accessSync(candidate); return candidate; } catch (_) { /* try next */ }
  }
  try { return require("ffmpeg-static"); } catch (_) { return "ffmpeg"; }
}

function run(command, args, onStderr, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderrBuffer = "";
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() || "";
      for (const line of lines) onStderr?.(line);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) return reject(new Error("Storyboard generation cancelled."));
      if (code !== 0) return reject(new Error(`FFmpeg scene detection failed (exit ${code}).`));
      resolve();
    });
  });
}

async function detectSceneTimestamps(videoPath, { threshold = 0.28, signal, onProgress } = {}) {
  const candidates = [];
  let scannedFrames = 0;
  const filter = `scale=320:-2,select='gt(scene,${threshold})',showinfo`;
  await run(getFfmpegPath(), ["-hide_banner", "-nostats", "-i", videoPath, "-vf", filter, "-an", "-f", "null", "-"], (line) => {
    if (line.includes("showinfo")) {
      scannedFrames++;
      const match = line.match(/pts_time:([\d.]+)/);
      if (match) candidates.push(Number(match[1]));
      if (scannedFrames % 25 === 0) onProgress?.({ stage: "detecting-scenes", candidateCount: candidates.length });
    }
  }, signal);
  return [...new Set(candidates.filter(Number.isFinite).sort((a, b) => a - b))];
}

function selectRepresentativeTimestamps(candidates, duration, maxFrames = 24, minGap = 8) {
  const spaced = [];
  for (const time of candidates) {
    if (!spaced.length || time - spaced[spaced.length - 1] >= minGap) spaced.push(time);
  }
  if (spaced.length <= maxFrames) return spaced;
  const selected = [];
  const bins = Math.max(1, maxFrames);
  for (let index = 0; index < bins; index++) {
    const center = duration * (index + 0.5) / bins;
    const candidate = spaced.reduce((best, value) => Math.abs(value - center) < Math.abs(best - center) ? value : best, spaced[0]);
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  return selected.sort((a, b) => a - b);
}

async function extractFrame(videoPath, timestamp, outputPath, { signal } = {}) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await run(getFfmpegPath(), ["-hide_banner", "-loglevel", "error", "-ss", String(timestamp), "-i", videoPath, "-frames:v", "1", "-vf", "scale=960:-2:force_original_aspect_ratio=decrease", "-q:v", "5", "-y", outputPath], null, signal);
  const stat = await fs.stat(outputPath);
  if (!stat.size) throw new Error(`FFmpeg produced an empty frame at ${timestamp}s.`);
}

async function extractRepresentativeFrames(videoPath, duration, outputDirectory, options = {}) {
  const candidates = await detectSceneTimestamps(videoPath, options);
  const selected = selectRepresentativeTimestamps(candidates, duration, options.maxFrames || 24, options.minGap || 8);
  if (!selected.length) return [];
  await fs.mkdir(outputDirectory, { recursive: true });
  const frames = [];
  for (let index = 0; index < selected.length; index++) {
    if (options.signal?.aborted) throw new Error("Storyboard generation cancelled.");
    const timestamp = selected[index];
    const filename = `frame-${String(index + 1).padStart(3, "0")}.jpg`;
    const imagePath = path.join(outputDirectory, filename);
    await extractFrame(videoPath, timestamp, imagePath, options);
    frames.push({ id: `frame-${index + 1}`, timestamp, imagePath, relativeImagePath: path.join("frames", filename) });
    options.onProgress?.({ stage: "extracting-frames", completed: index + 1, total: selected.length });
  }
  return frames;
}

module.exports = { detectSceneTimestamps, selectRepresentativeTimestamps, extractFrame, extractRepresentativeFrames };
