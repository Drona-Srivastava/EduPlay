# EduPlay Learning Features: Development Context

## Architecture

- Electron renderer owns the player UI and `SubtitlesManager` loads active subtitle tracks.
- `main.js` starts the loopback Express AI service in `server.js` and reports the active media path from the renderer.
- `lectureContext.js` normalizes timestamped transcript cues; `analysisStore.js` caches per-media results; `aiSchemas.js` validates model output; `sceneDetection.js` detects FFmpeg scene candidates and extracts resized frames.
- Existing Q&A remains text-only and uses the current `phi3` default. Flashcards use the configured local text model. Storyboard requires a separate installed Ollama vision model.

## Decisions

- Generate flashcards and storyboard only on demand.
- Keep vision optional and local; default vision model is `qwen2.5vl:3b`.
- Detect scene changes, deduplicate and spread a capped candidate set across the video, then analyze frames sequentially.
- Cache in a hidden per-video sidecar with a home-directory fallback; include media/transcript/model/schema fingerprints.
- Keep generated outputs user-visible only in the Learning panel, with timestamp jump links and transcript sources.
- Persist selectable text/vision model names in `electron-store`; use Ollama's installed-model list as a UI hint.

## Phase status

- Current phase: initial implementation and verification.
- Completed: shared context and validators; cache store; scene candidate extraction; local API endpoints; Learning panel; docs and tests.
- Completed: npm dependency installation, 10 unit tests, JavaScript syntax checks, Windows unpacked packaging, local Ollama installation, and synthetic FFmpeg scene/frame extraction.
- Completed: `qwen2.5vl:3b` model download and end-to-end storyboard inference against a generated test video.
- Completed: installed both `phi3` (2.2 GB) and `qwen2.5vl:3b` (3.2 GB) in Ollama.
- Improved: AI chat now shows backend/model errors; inference output is bounded with repeat controls; flashcard timestamps stay inside their cited cue; storyboard output handles missing visual detail and retries incomplete JSON.
- Verified: `/ask` returned a transcript-grounded answer; flashcard and storyboard endpoints both returned HTTP 200 against local models. Full interactive Electron playback regression remains to be exercised manually.

## Files changed

- Added: `lectureContext.js`, `aiSchemas.js`, `analysisStore.js`, `sceneDetection.js`, `test/*`, `docs/DEVELOPMENT_CONTEXT.md`.
- Modified: `main.js`, `server.js`, `subtitles.js`, `renderer.js`, `index.html`, `styles.css`, `package.json`, `.github/workflows/release.yml`, `README.md`, `TECHNICAL_DOCUMENTATION.md`, `.gitignore`.

## Tests and checks

- `npm test`: 10 passed, 0 failed.
- `node --check` passed for the main, renderer, service, and feature modules.
- `npm run dist:win -- --dir` completed and produced `dist/win/win-unpacked/EduPlay.exe`. The environment lacks the repo's optional `.eduplay-python` folder, producing a packaging warning; the learning feature does not depend on that folder.
- Verified local Ollama models: `phi3:latest` and `qwen2.5vl:3b`.
- Verified `/ask`, `/learning/flashcards`, and `/learning/storyboard` through the local service with transcript-grounded test data.
- Interactive Electron playback regression remains manual: transcript loading, cache/restart behavior, cancellation, and playback/search/Q&A regression.

## Known risks

- Vision model memory needs vary by Ollama build, quantization, and device. Keep the model optional and process one frame at a time.
- FFmpeg scene thresholds may miss gradual slide changes or over-select animations; evaluate against annotated lecture clips.
- The existing caption pipeline writes SRT. External/embedded subtitle formats that are not SRT may not yield usable context without conversion.
- The app currently uses Node integration in the renderer; new local API routes bind only to loopback and accept the app's `null` file origin.

## Next steps

1. Manually exercise the features in the packaged Electron app, including cache/restart and cancellation.
2. Manually test longer lecture transcripts and scenes with varied visual content.
3. Update this log after architectural decisions, completed checks, and known issue changes.
