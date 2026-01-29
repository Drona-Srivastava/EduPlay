#  EduPlay – Smart Educational Media Player

![License](https://img.shields.io/github/license/Drona-Srivastava/EduPlay?style=flat-square)
![Stars](https://img.shields.io/github/stars/Drona-Srivastava/EduPlay?style=flat-square)
![Build](https://img.shields.io/github/actions/workflow/status/Drona-Srivastava/EduPlay/build.yml?branch=main&style=flat-square)

**EduPlay** is a minimalist, student-focused media player built to make learning from video lectures effortless. Powered by AI-generated captions, transcript search, and a Q&A assistant, EduPlay takes video-based study to the next level.

---

##  Features  
-  **Distraction-free video player** (Electron-powered)  
-  **AI-generated captions** using Whisper  
-  **In-transcript search** with skip-to-moment functionality  
-  **Match navigation** with previous/next controls and a result counter (`1/5`)  
-  **Ask-Video (AI Q&A)** — get instant transcript-based answers  
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
node server.js
```

```bash
npm start
```




