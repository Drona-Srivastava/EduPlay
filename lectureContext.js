const crypto = require("crypto");

function timestampToSeconds(value) {
  const match = String(value).trim().match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4].padEnd(3, "0"));
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function parseSrt(text) {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n\s*\r?\n/)
    .map((block, index) => {
      const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) return null;
      const [startValue, endValue] = lines[timingIndex].split("-->").map((part) => part.trim().split(/\s+/)[0]);
      const start = timestampToSeconds(startValue);
      const end = timestampToSeconds(endValue);
      const cueText = lines.slice(timingIndex + 1).join(" ")
        .replace(/<[^>]*>/g, "")
        .replace(/\{\\[^}]*\}/g, "")
        .replace(/\s+/g, " ").trim();
      if (start === null || end === null || end < start || !cueText) return null;
      return { id: `cue-${index + 1}`, start, end, text: cueText };
    })
    .filter(Boolean);
}

function normalizeSegments(input) {
  const segments = Array.isArray(input) ? input : parseSrt(input);
  return segments.map((segment, index) => ({
    id: String(segment.id || `seg-${index + 1}`),
    start: Number(segment.start),
    end: Number(segment.end),
    text: String(segment.text || "").replace(/\s+/g, " ").trim(),
  })).filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.start >= 0 && segment.end >= segment.start && segment.text)
    .sort((a, b) => a.start - b.start);
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function getContextWindow(segments, timestamp, before = 20, after = 30) {
  const start = Math.max(0, Number(timestamp) - before);
  const end = Number(timestamp) + after;
  const matches = normalizeSegments(segments).filter((segment) => segment.end >= start && segment.start <= end);
  return {
    start,
    end,
    segments: matches,
    excerpt: matches.map((segment) => segment.text).join(" ").slice(0, 2500),
  };
}

function selectRepresentativeChunks(chunks, maxChunks = 6) {
  if (chunks.length <= maxChunks) return chunks;
  if (maxChunks <= 1) return [chunks[0]];
  const selected = [];
  for (let index = 0; index < maxChunks; index++) {
    const chunkIndex = Math.round(index * (chunks.length - 1) / (maxChunks - 1));
    selected.push(chunks[chunkIndex]);
  }
  return selected;
}

module.exports = { timestampToSeconds, parseSrt, normalizeSegments, fingerprint, getContextWindow, selectRepresentativeChunks };
