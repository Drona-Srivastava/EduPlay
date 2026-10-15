const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs").promises;
const path = require("path");
const fetch = (...args) => import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args));
const { normalizeSegments, fingerprint, getContextWindow, selectRepresentativeChunks } = require("./lectureContext");
const { parseJsonResponse, validateFlashcards, validateStoryboard } = require("./aiSchemas");
const { resolveArtifactDirectory, readManifest, writeManifest, makeAnalysisKey } = require("./analysisStore");
const { extractRepresentativeFrames } = require("./sceneDetection");

const OLLAMA_URL = process.env.EDUPLAY_OLLAMA_URL || "http://127.0.0.1:11434";
const TEXT_MODEL = process.env.EDUPLAY_TEXT_MODEL || "phi3";
const VISION_MODEL = process.env.EDUPLAY_VISION_MODEL || "qwen2.5vl:3b";
const FLASHCARD_FORMAT = {
  type: "object",
  properties: {
    flashcards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          source: {
            type: "object",
            properties: {
              timestamp: { type: "number" },
              segmentIds: { type: "array", items: { type: "string" } },
            },
            required: ["timestamp", "segmentIds"],
          },
        },
        required: ["question", "answer", "source"],
      },
    },
  },
  required: ["flashcards"],
};
const STORYBOARD_FORMAT = {
  type: "object",
  properties: {
    topic: { type: "string" },
    visualDescription: { type: "string" },
    contextSummary: { type: "string" },
  },
  required: ["topic", "visualDescription", "contextSummary"],
};
const contexts = new Map();
const activeJobs = new Map();

function createApp() {
  const app = express();
  app.use(cors({ origin: "null" }));
  app.use(bodyParser.json({ limit: "10mb" }));

  app.get("/ping", (_req, res) => res.json({ status: "EduPlay AI backend is alive" }));

  app.get("/learning/config", async (_req, res) => {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
      if (!response.ok) throw new Error("Ollama is not responding.");
      const tags = await response.json();
      res.json({ available: true, textModel: TEXT_MODEL, visionModel: VISION_MODEL, installedModels: (tags.models || []).map((model) => model.name) });
    } catch (_) {
      res.json({ available: false, textModel: TEXT_MODEL, visionModel: VISION_MODEL, installedModels: [] });
    }
  });

  app.post("/ask/init", (req, res) => {
    const { subtitles, videoPath } = req.body || {};
    if (!subtitles || !String(subtitles).trim()) return res.status(400).json({ error: "Missing 'subtitles' field." });
    const key = videoPath ? path.resolve(videoPath) : "legacy";
    const segments = normalizeSegments(subtitles);
    contexts.set(key, { raw: (Array.isArray(segments) ? segments.map((segment) => `[${segment.start.toFixed(2)}-${segment.end.toFixed(2)}] ${segment.text}`).join("\n") : String(subtitles)).slice(0, 12000), segments });
    res.json({ message: "Subtitles context stored successfully.", segmentCount: segments.length });
  });

  app.post("/ask", async (req, res) => {
    const { question, videoPath } = req.body || {};
    if (!String(question || "").trim()) return res.status(400).json({ error: "Question is required." });
    const context = contexts.get(videoPath ? path.resolve(videoPath) : "legacy");
    const transcript = context?.raw || "";
    if (!transcript) return res.status(400).json({ error: "Load a transcript before asking a question." });
    try {
      const relevantTranscript = selectQuestionContext(context?.segments || [], question, transcript);
      const data = await ollamaGenerate(req.body.model || TEXT_MODEL, `You are EduPlay AI, a concise teaching assistant. Answer the question directly in 2–4 sentences and under 100 words. Use only the transcript excerpts below; if they do not contain the answer, say No context available. Do not repeat the question.\n\nTranscript excerpts:\n${relevantTranscript}\n\nQuestion: ${question}`, false);
      let answer = String(data.response || "No context available").split(/---|###|Instruction|Task|Final Answer:/i)[0].replace(/\*\*|#+|>/g, "").replace(/\s+/g, " ").trim();
      if (answer.split(/\s+/).length > 100) answer = `${answer.split(/\s+/).slice(0, 100).join(" ")}…`;
      res.json({ answer: answer || "No context available" });
    } catch (error) { res.status(503).json({ error: error.message }); }
  });

  app.post("/learning/flashcards", async (req, res) => {
    const { videoPath, segments: rawSegments, transcriptFingerprint } = req.body || {};
    const textModel = String(req.body?.model || TEXT_MODEL).trim();
    if (!videoPath || !Array.isArray(rawSegments) || !rawSegments.length) return res.status(400).json({ error: "A video path and timestamped transcript are required." });
    try {
      const absolutePath = path.resolve(videoPath);
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) throw new Error("Selected media file is unavailable.");
      const segments = normalizeSegments(rawSegments);
      if (!segments.length) throw new Error("The transcript contains no usable timestamped text.");
      const transcriptKey = transcriptFingerprint || fingerprint(segments);
      const key = makeAnalysisKey(stat, transcriptKey, { textModel, artifact: "flashcards-v1" });
      const { directory, manifest } = await readManifest(absolutePath);
      if (manifest?.flashcardsKey === key && Array.isArray(manifest.flashcards) && manifest.flashcards.length) return res.json({ cached: true, flashcards: manifest.flashcards });
      const chunks = selectRepresentativeChunks(chunkSegments(segments, 8500), 6);
      const cards = [];
      for (const chunk of chunks) {
        const prompt = flashcardPrompt(chunk);
        let chunkCards;
        let lastError;
        for (let attempt = 0; attempt < 2 && !chunkCards; attempt++) {
          try {
            const retryInstruction = attempt
              ? `\n\nRetry. Return only the required JSON object, at most 2 concise flashcards. Every source.segmentIds value must be one of: ${chunk.map((segment) => segment.id).join(", ")}. Each timestamp must be within its cited cue's start and end time.`
              : "";
            const response = await ollamaGenerate(textModel, `${prompt}${retryInstruction}`, true);
            chunkCards = validateFlashcards(parseJsonResponse(response.response), chunk);
          } catch (error) {
            lastError = error;
          }
        }
        if (!chunkCards) throw new Error(`Could not generate valid flashcards: ${lastError?.message || "invalid model output"}`);
        cards.push(...chunkCards);
        if (cards.length >= 24) break;
      }
      const unique = [...new Map(cards.map((card) => [card.question.toLowerCase(), card])).values()].slice(0, 24).map((card, index) => ({ ...card, id: `card-${index + 1}` }));
      if (!unique.length) throw new Error("The model did not return any valid flashcards.");
      await writeManifest(directory, { ...(manifest || {}), flashcardsKey: key, flashcards: unique, mediaPath: absolutePath, transcriptFingerprint: transcriptKey });
      res.json({ cached: false, flashcards: unique });
    } catch (error) { res.status(503).json({ error: error.message }); }
  });

  app.post("/learning/storyboard", async (req, res) => {
    const { videoPath, segments: rawSegments, duration, transcriptFingerprint } = req.body || {};
    const visionModel = String(req.body?.model || VISION_MODEL).trim();
    if (!videoPath || !Array.isArray(rawSegments) || !rawSegments.length || !Number.isFinite(Number(duration))) return res.status(400).json({ error: "A video path, duration, and timestamped transcript are required." });
    const jobId = `${path.resolve(videoPath)}:${Date.now()}`;
    const controller = new AbortController();
    activeJobs.set(jobId, controller);
    try {
      const absolutePath = path.resolve(videoPath);
      if (/\.(mp3|wav|ogg|aac|m4a|flac|wma|opus)$/i.test(absolutePath)) throw new Error("Pictorial storyboards require a video file.");
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) throw new Error("Selected video file is unavailable.");
      const segments = normalizeSegments(rawSegments);
      if (!segments.length) throw new Error("The transcript contains no usable timestamped text.");
      const transcriptKey = transcriptFingerprint || fingerprint(segments);
      const key = makeAnalysisKey(stat, transcriptKey, { visionModel, artifact: "storyboard-v1" });
      const { directory, manifest } = await readManifest(absolutePath);
      if (manifest?.storyboardKey === key && manifest.status === "complete" && Array.isArray(manifest.storyboard) && manifest.storyboard.length) return res.json({ cached: true, storyboard: manifest.storyboard, artifactDirectory: directory });
      const visionAvailable = await modelAvailable(visionModel);
      if (!visionAvailable) throw new Error(`Vision model “${visionModel}” is not available in Ollama. Install it and retry.`);
      const framesDirectory = path.join(directory, "frames");
      const frames = await extractRepresentativeFrames(absolutePath, Number(duration), framesDirectory, {
        signal: controller.signal,
        onProgress: (progress) => res.write(JSON.stringify({ type: "progress", ...progress }) + "\n"),
      });
      if (!frames.length) throw new Error("No meaningful scene changes were detected in this video.");
      const results = [];
      for (let index = 0; index < frames.length; index++) {
        if (controller.signal.aborted) throw new Error("Storyboard generation cancelled.");
        const frame = frames[index];
        let window = getContextWindow(segments, frame.timestamp);
        if (!window.segments.length && segments.length) {
          const nearest = segments.reduce((best, segment) => {
            const distance = frame.timestamp < segment.start ? segment.start - frame.timestamp : frame.timestamp > segment.end ? frame.timestamp - segment.end : 0;
            const bestDistance = frame.timestamp < best.start ? best.start - frame.timestamp : frame.timestamp > best.end ? frame.timestamp - best.end : 0;
            return distance < bestDistance ? segment : best;
          }, segments[0]);
          window = { ...window, segments: [nearest], excerpt: nearest.text };
        }
        const image = (await fs.readFile(frame.imagePath)).toString("base64");
        const prompt = storyboardPrompt(frame, window);
        let validated;
        let lastError;
        for (let attempt = 0; attempt < 2 && !validated; attempt++) {
          try {
            const retryInstruction = attempt
              ? "\n\nRetry. Return only the required JSON object. Use a concise, non-empty visualDescription; if no detail is visible, say so plainly."
              : "";
            const vision = await ollamaVision(visionModel, image, `${prompt}${retryInstruction}`, controller.signal);
            const parsed = normalizeStoryboardFields(parseJsonResponse(vision.response), window, frame.timestamp);
          validated = validateStoryboard({ frames: [{ ...parsed, timestamp: frame.timestamp, imagePath: frame.relativeImagePath, segmentIds: window.segments.map((segment) => segment.id) }] }, segments, new Set([frame.relativeImagePath]));
          } catch (error) {
            lastError = error;
          }
        }
        if (!validated) throw new Error(`Could not generate a valid storyboard frame: ${lastError?.message || "invalid model output"}`);
        results.push(validated[0]);
        await writeManifest(directory, { ...(manifest || {}), storyboardKey: key, storyboard: results, mediaPath: absolutePath, transcriptFingerprint: transcriptKey, status: "processing" });
        res.write(JSON.stringify({ type: "progress", stage: "analyzing-frames", completed: index + 1, total: frames.length }) + "\n");
      }
      await writeManifest(directory, { ...(manifest || {}), storyboardKey: key, storyboard: results, mediaPath: absolutePath, transcriptFingerprint: transcriptKey, status: "complete" });
      res.end(JSON.stringify({ cached: false, storyboard: results, artifactDirectory: directory }));
    } catch (error) {
      if (!res.headersSent) res.status(503).json({ error: error.message });
      else res.end(JSON.stringify({ error: error.message }));
    } finally { activeJobs.delete(jobId); }
  });

  app.post("/learning/cancel", (req, res) => {
    const { videoPath } = req.body || {};
    const prefix = videoPath ? path.resolve(videoPath) : "";
    let cancelled = false;
    for (const [id, controller] of activeJobs) {
      if (!prefix || id.startsWith(`${prefix}:`)) { controller.abort(); cancelled = true; }
    }
    res.json({ cancelled });
  });

  app.post("/learning/review", async (req, res) => {
    const { videoPath, cardId, rating } = req.body || {};
    if (!videoPath || !cardId || !["knew", "missed"].includes(rating)) return res.status(400).json({ error: "A card ID and valid review rating are required." });
    try {
      const { directory, manifest } = await readManifest(path.resolve(videoPath));
      const card = manifest?.flashcards?.find((entry) => entry.id === cardId);
      if (!card) return res.status(404).json({ error: "Flashcard not found." });
      card.review = { rating, updatedAt: new Date().toISOString() };
      await writeManifest(directory, manifest);
      res.json({ saved: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  return app;
}

async function ollamaGenerate(model, prompt, structured) {
  const options = {
    temperature: structured ? 0.2 : 0.3,
    num_predict: structured ? 768 : 384,
    repeat_last_n: 64,
    repeat_penalty: 1.15,
  };
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, timeout: 600000,
    body: JSON.stringify({ model, prompt, stream: false, ...(structured ? { format: FLASHCARD_FORMAT } : {}), options }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Ollama request failed (${response.status}).`);
  if (!data.response) throw new Error("Ollama returned an empty response.");
  if (data.done_reason === "length") {
    if (structured) throw new Error("Ollama reached the output limit before finishing its structured response.");
    data.response = `${String(data.response).trim()}…`;
  }
  return data;
}

async function ollamaVision(model, image, prompt, signal) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, timeout: 600000, signal,
    body: JSON.stringify({ model, stream: false, format: STORYBOARD_FORMAT, options: { temperature: 0.1, num_predict: 256, repeat_last_n: 64, repeat_penalty: 1.15 }, messages: [{ role: "user", content: prompt, images: [image] }] }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Ollama vision request failed (${response.status}).`);
  if (!data.message?.content) throw new Error("Vision model returned an empty response.");
  return { response: data.message.content };
}

async function modelAvailable(model) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    if (!response.ok) return false;
    const data = await response.json();
    return (data.models || []).some((entry) => entry.name === model || entry.name.startsWith(`${model}:`));
  } catch (_) { return false; }
}

function chunkSegments(segments, maxChars) {
  const chunks = [];
  let chunk = [];
  let size = 0;
  for (const segment of segments) {
    const addition = segment.text.length + 40;
    if (chunk.length && size + addition > maxChars) { chunks.push(chunk); chunk = []; size = 0; }
    chunk.push(segment);
    size += addition;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

function transcriptText(segments) {
  return segments.map((segment) => `[${segment.id} | ${segment.start.toFixed(2)}-${segment.end.toFixed(2)}] ${segment.text}`).join("\n");
}

function selectQuestionContext(segments, question, fallback = "", maxChars = 6000) {
  if (!segments.length) return String(fallback).slice(0, maxChars);
  const stopWords = new Set(["about", "after", "also", "between", "could", "does", "from", "have", "into", "that", "them", "then", "there", "these", "they", "this", "what", "when", "where", "which", "with", "would"]);
  const terms = [...new Set((String(question).toLowerCase().match(/[a-z0-9]+/g) || []).filter((term) => term.length > 2 && !stopWords.has(term)))];
  const normalized = segments.map((segment) => ({ ...segment, normalizedText: segment.text.toLowerCase() }));
  const ranked = normalized.map((segment, index) => ({
    index,
    score: terms.reduce((score, term) => score + (segment.normalizedText.includes(term) ? 1 : 0), 0),
  })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  if (!ranked.length) return String(fallback || transcriptText(segments)).slice(0, maxChars);

  const selectedIndexes = new Set();
  for (const entry of ranked.slice(0, 12)) {
    selectedIndexes.add(entry.index);
    if (entry.index > 0) selectedIndexes.add(entry.index - 1);
    if (entry.index + 1 < normalized.length) selectedIndexes.add(entry.index + 1);
  }
  const selected = [...selectedIndexes].sort((a, b) => a - b).map((index) => normalized[index]);
  const excerpts = [];
  let charCount = 0;
  for (const segment of selected) {
    const line = `[${segment.id} | ${segment.start.toFixed(2)}-${segment.end.toFixed(2)}] ${segment.text}`;
    if (charCount + line.length > maxChars && excerpts.length) continue;
    excerpts.push(line.slice(0, maxChars - charCount));
    charCount += line.length;
    if (charCount >= maxChars) break;
  }
  return excerpts.join("\n");
}

function flashcardPrompt(segments) {
  return `Create up to 2 concise active-recall flashcards from this lecture excerpt. Questions and answers must be directly supported by the excerpt. Return only the required JSON object. timestamp must fall inside the cited segments. Cite the smallest relevant segment span. Do not invent details.\n\n${transcriptText(segments)}`;
}

function storyboardPrompt(frame, context) {
  return `Inspect the attached lecture frame. First describe only what is visibly present (slide, diagram, chart, code, equations, whiteboard, or demonstration). Then relate it to the transcript context. Do not claim visual details that are unreadable. Return JSON only with string fields topic, visualDescription, contextSummary.\nTimestamp: ${frame.timestamp.toFixed(2)}\nTranscript context: ${context.excerpt || "No transcript text near this frame."}`;
}

function normalizeStoryboardFields(value, context, timestamp) {
  const frame = value?.frame && typeof value.frame === "object" ? value.frame : value;
  const excerpt = String(context.excerpt || "").trim();
  const topicFromTranscript = excerpt.split(/[.!?]/, 1)[0].trim().slice(0, 100);
  return {
    ...frame,
    topic: String(frame.topic || frame.title || topicFromTranscript || `Lecture frame at ${timestamp.toFixed(1)}s`).trim(),
    visualDescription: String(frame.visualDescription || frame.description || frame.caption || frame.visual_summary || "The model did not identify clear visual details in this frame.").trim(),
    contextSummary: String(frame.contextSummary || frame.context_summary || frame.summary || excerpt || "No transcript excerpt is available for this frame.").trim(),
  };
}

let serverInstance;
function cancelActiveJobs() {
  for (const controller of activeJobs.values()) controller.abort();
}

function startServer(port = Number(process.env.EDUPLAY_AI_PORT || 3000)) {
  if (serverInstance) return serverInstance;
  const app = createApp();
  serverInstance = app.listen(port, "127.0.0.1", () => console.log(`EduPlay AI backend running at http://127.0.0.1:${port}`));
  serverInstance.on("error", (error) => console.error("EduPlay AI backend error:", error.message));
  return serverInstance;
}

if (require.main === module) startServer();
module.exports = { createApp, startServer, cancelActiveJobs, chunkSegments, flashcardPrompt };
