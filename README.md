#  EduPlay – Smart Educational Media Player

![License](https://img.shields.io/github/license/Drona-Srivastava/EduPlay?style=flat-square)
![Stars](https://img.shields.io/github/stars/Drona-Srivastava/EduPlay?style=flat-square)
![Build](https://img.shields.io/github/actions/workflow/status/Drona-Srivastava/EduPlay/build.yml?branch=main&style=flat-square)

**EduPlay** is a minimalist, student-focused media player built to make learning from video lectures effortless. Powered by AI-generated captions, transcript search, and a Q&A assistant, EduPlay takes video-based study to the next level.

The desktop releases bundle the Whisper/PyTorch captioning environment, so end users do not need to install Python or Whisper manually.

---

##  Features  
-  **Distraction-free video player** (Electron-powered)  
-  **AI-generated captions** using Whisper  
-  **In-transcript search** with skip-to-moment functionality  
-  **Match navigation** with previous/next controls and a result counter (`1/5`)  
-  **Ask-Video (AI Q&A)** — get instant transcript-based answers  
-  **AI flashcards** — create source-linked active-recall questions from a lecture transcript
-  **Pictorial storyboard** — detect scene changes and explain selected frames with a local vision model
-  **Auto-hide controls** for clean UI that responds to activity  
-  **Cross-platform builds** for Windows, macOS, and Linux

---

##  Roadmap  
- [ ] Multi-language caption support  
- [ ] Offline LLM for on-device Q&A  
- [ ] Highlight and save key lecture clips  

---

##  Development Setup  
```bash
git clone https://github.com/Drona-Srivastava/EduPlay.git
```

```bash
cd EduPlay
```

```bash
npm install
npm install electron
```

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull phi3
```

To enable local pictorial storyboards, optionally install a vision model:

```bash
ollama pull qwen2.5vl:3b
```

```bash
ollama serve
```

```bash
If following error occurs, ignore and proceed with further steps
Error: listen tcp 127.0.0.1:11434: bind: address already in use
```

## To Verify setup
```bash
curl http://127.0.0.1:11434/
```

```bash
npm start
```

Run `node server.js` only if you want to start the AI backend separately during development; the Electron app starts it automatically.

The desktop app starts its local AI backend automatically. Starting `node server.js` separately is only needed when developing the backend outside Electron. Flashcards use the configured local text model (`EDUPLAY_TEXT_MODEL`, default `phi3`). Storyboards use `EDUPLAY_VISION_MODEL` (default `qwen2.5vl:3b`) and require an installed vision-capable Ollama model. Model downloads are several GB and are not bundled in desktop installers. Learning results are cached in a hidden `.eduplay` folder beside the media file; the cache falls back to the user home directory if that folder cannot be written.

##  Packaging for Release
Use the following commands on the matching target OS to build distributables:

```bash
npm ci
```

```bash
npm run dist:linux
```

```bash
npm run dist:win
```

```bash
npm run dist:mac
```

Build outputs are written to:
- `dist/linux` for Linux AppImage builds
- `dist/win` for Windows `.exe` installers
- `dist/mac` for macOS `.dmg` installers

If you are building release artifacts, run the matching command on Linux, Windows, and macOS, or let the GitHub release workflow build each platform in CI.
