from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
NAVY, ORANGE, INK, MUTED = "17324D", "E87524", "263442", "5D6B78"
PALE, PALE_ORANGE, WHITE = "EEF3F7", "FFF3E8", "FFFFFF"
DATE_TEXT = "31 October 2026"
STEP_COUNT = 0


def set_font(run, name="Arial", size=10.5, color=INK, bold=False, italic=False):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    run.bold, run.italic = bold, italic


def shade(cell, fill):
    props = cell._tc.get_or_add_tcPr()
    node = props.find(qn("w:shd"))
    if node is None:
        node = OxmlElement("w:shd")
        props.append(node)
    node.set(qn("w:fill"), fill)


def margins(cell, amount=110):
    props = cell._tc.get_or_add_tcPr()
    node = props.first_child_found_in("w:tcMar")
    if node is None:
        node = OxmlElement("w:tcMar")
        props.append(node)
    for edge in ("top", "start", "bottom", "end"):
        child = node.find(qn(f"w:{edge}"))
        if child is None:
            child = OxmlElement(f"w:{edge}")
            node.append(child)
        child.set(qn("w:w"), str(amount))
        child.set(qn("w:type"), "dxa")


def setup(doc, footer_text):
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Inches(8.27), Inches(11.69)
    sec.top_margin, sec.bottom_margin = Inches(.72), Inches(.72)
    sec.left_margin, sec.right_margin = Inches(.8), Inches(.8)
    normal = doc.styles["Normal"]
    normal.font.name, normal.font.size = "Arial", Pt(10.5)
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    normal.font.color.rgb = RGBColor.from_string(INK)
    normal.paragraph_format.space_after, normal.paragraph_format.line_spacing = Pt(6), 1.12
    for name, size, color in [("Title", 27, NAVY), ("Subtitle", 13, MUTED), ("Heading 1", 17, NAVY), ("Heading 2", 12.5, ORANGE), ("Heading 3", 11, NAVY)]:
        style = doc.styles[name]
        style.font.name, style.font.size = "Arial", Pt(size)
        style._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
        style.font.bold = name != "Subtitle"
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.space_before = Pt(12 if name.startswith("Heading") else 0)
        style.paragraph_format.space_after = Pt(5)
        if name == "Title" and style._element.pPr is not None:
            for border in style._element.pPr.findall(qn("w:pBdr")):
                style._element.pPr.remove(border)
    if "Code" not in doc.styles:
        doc.styles.add_style("Code", WD_STYLE_TYPE.PARAGRAPH)
    code = doc.styles["Code"]
    code.font.name, code.font.size = "Consolas", Pt(8.2)
    code._element.rPr.rFonts.set(qn("w:ascii"), "Consolas")
    code._element.rPr.rFonts.set(qn("w:hAnsi"), "Consolas")
    code.paragraph_format.space_after, code.paragraph_format.line_spacing = Pt(0), 1.0
    footer = sec.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(footer.add_run(footer_text + "  |  Page "), size=8, color=MUTED)
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)


def cover(doc, title, subtitle, kind):
    p = doc.add_paragraph(style="Title")
    p.alignment, p.paragraph_format.space_before = WD_ALIGN_PARAGRAPH.CENTER, Pt(90)
    p.add_run(title)
    p = doc.add_paragraph(style="Subtitle")
    p.alignment, p.paragraph_format.space_after = WD_ALIGN_PARAGRAPH.CENTER, Pt(35)
    p.add_run(subtitle)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(p.add_run(kind), size=11, color=ORANGE, bold=True)
    t = doc.add_table(rows=0, cols=2)
    t.alignment, t.autofit = WD_TABLE_ALIGNMENT.CENTER, False
    for left, right in [("Project", "EduPlay Smart Educational Media Player"), ("Release baseline", "0.1.15 | Source commit add199b"), ("Team", "[INSERT TEAM NAME]"), ("Institution and course", "[INSERT INSTITUTION AND COURSE]"), ("Supervisor", "[INSERT NAME, IF REQUIRED]"), ("Prepared", DATE_TEXT)]:
        cells = t.add_row().cells
        cells[0].width, cells[1].width = Inches(1.7), Inches(4.8)
        for cell in cells:
            margins(cell, 130)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        shade(cells[0], PALE)
        set_font(cells[0].paragraphs[0].add_run(left), size=9, color=NAVY, bold=True)
        set_font(cells[1].paragraphs[0].add_run(right), size=9)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(p.add_run("Replace all bracketed fields before submission."), size=9, color=MUTED, italic=True)
    doc.add_page_break()


def heading(doc, text, level=1):
    global STEP_COUNT
    STEP_COUNT = 0
    doc.add_heading(text, level=level)


def bullet(doc, text):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(3)
    p.add_run(text)


def step(doc, title, text):
    global STEP_COUNT
    STEP_COUNT += 1
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    set_font(p.add_run(f"{STEP_COUNT}. "), color=NAVY, bold=True)
    if title.lower() not in {"step", "upload step"}:
        set_font(p.add_run(title + " "), bold=True)
    p.add_run(text)


def make_table(doc, headers, rows, widths=None, size=9):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment, t.autofit = WD_TABLE_ALIGNMENT.CENTER, False
    if widths:
        for col, width in zip(t.columns, widths):
            col.width = Inches(width)
    for i, text in enumerate(headers):
        cell = t.rows[0].cells[i]
        if widths:
            cell.width = Inches(widths[i])
        shade(cell, NAVY)
        margins(cell)
        set_font(cell.paragraphs[0].add_run(text), size=size, color=WHITE, bold=True)
    header_props = t.rows[0]._tr.get_or_add_trPr()
    repeat = OxmlElement("w:tblHeader")
    repeat.set(qn("w:val"), "true")
    header_props.append(repeat)
    split = OxmlElement("w:cantSplit")
    header_props.append(split)
    for ri, row in enumerate(rows):
        table_row = t.add_row()
        row_props = table_row._tr.get_or_add_trPr()
        row_props.append(OxmlElement("w:cantSplit"))
        cells = table_row.cells
        for i, text in enumerate(row):
            if widths:
                cells[i].width = Inches(widths[i])
            margins(cells[i], 90)
            if ri % 2 == 0:
                shade(cells[i], "F6F8FA")
            set_font(cells[i].paragraphs[0].add_run(str(text)), size=size)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return t


def code(doc, label, snippet, source):
    p = doc.add_paragraph()
    p.paragraph_format.space_before, p.paragraph_format.space_after = Pt(3), Pt(3)
    p.paragraph_format.keep_with_next = True
    set_font(p.add_run(label), size=9, color=NAVY, bold=True)
    t = doc.add_table(rows=1, cols=1)
    t.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
    cell = t.cell(0, 0)
    shade(cell, "F1F4F7")
    margins(cell, 120)
    cell.text = ""
    for i, line in enumerate(snippet.splitlines()):
        p = cell.paragraphs[0] if i == 0 else cell.add_paragraph()
        p.style = doc.styles["Code"]
        set_font(p.add_run(line or " "), name="Consolas", size=8.2, color="1F2933")
    cell.paragraphs[-1].paragraph_format.keep_with_next = True
    p = doc.add_paragraph()
    p.paragraph_format.space_after, p.paragraph_format.keep_together = Pt(5), True
    set_font(p.add_run("Source: " + source), size=8, color=MUTED, italic=True)


def placeholder(doc, label, instruction, height=1.45):
    p = doc.add_paragraph()
    p.paragraph_format.space_before, p.paragraph_format.space_after = Pt(4), Pt(3)
    p.paragraph_format.keep_with_next = True
    set_font(p.add_run(label), size=10, color=NAVY, bold=True)
    t = doc.add_table(rows=1, cols=1)
    row = t.rows[0]
    row._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
    row.height, row.height_rule = Inches(height), 1
    cell = row.cells[0]
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    shade(cell, PALE_ORANGE)
    margins(cell, 160)
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(p.add_run("[INSERT ACTUAL SCREENSHOT OR EVIDENCE HERE]\n" + instruction), size=9, color=MUTED, italic=True)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


def link_field(doc, label, value):
    p = doc.add_paragraph()
    set_font(p.add_run(label + " "), color=NAVY, bold=True)
    set_font(p.add_run(value), color=ORANGE, bold=True)


def build_report():
    d = Document()
    setup(d, "EduPlay Project Report")
    cover(d, "EduPlay Project Documentation Report", "Technical overview, implementation evidence, and submission placeholders", "PROJECT REPORT")
    heading(d, "Executive Summary")
    d.add_paragraph("EduPlay is an Electron desktop learning-media player combining lecture playback, speech-to-text captions, transcript search, and local AI assistance. The source also provides transcript-grounded flashcards and scene-based visual storyboards. This report maps these features to the implementation and leaves spaces for the team’s actual screenshots, paper details, dataset link, and demo evidence.")
    d.add_paragraph("The AI features use a loopback Express service and locally installed Ollama models. Whisper generates captions through Python, while FFmpeg decodes media and extracts representative frames. The repository contains no dataset, research paper, or demo recording; those materials must be supplied before submission.")
    heading(d, "Project at a Glance")
    make_table(d, ["Item", "Project information"], [
        ("Project type", "Cross-platform Electron application for learning from lecture media"),
        ("Primary users", "Students and instructors studying video or audio lectures"),
        ("Source baseline", "EduPlay 0.1.15, commit add199b"),
        ("Core stack", "Electron, JavaScript, Express, Python, Whisper, PyTorch, FFmpeg, Ollama"),
        ("Local text model", "phi3, configurable"), ("Local vision model", "qwen2.5vl:3b, configurable"),
        ("Dataset in repo", "None; add approved dataset link in the procedure guide"),
        ("Paper in repo", "None; add exact team paper citation before submission"),
    ], [1.65, 5.0])
    heading(d, "Problem and Objectives")
    d.add_paragraph("Lecture recordings can be difficult to review efficiently. Students may replay long sections to locate an explanation, search spoken content, or recall key concepts. EduPlay brings these tasks into one desktop workflow.")
    for x in ["Play common local media with standard controls, speed adjustment, and subtitle tracks.", "Generate timestamped speech captions with Whisper and save an SRT file beside the media.", "Search caption text and jump to matching moments.", "Ask transcript-based questions through a local Ollama text model.", "Generate flashcards with transcript references and timestamps.", "Detect scene changes and explain selected video frames with a local vision model."]:
        bullet(d, x)
    d.add_page_break()
    heading(d, "System Architecture")
    d.add_paragraph("The desktop application separates playback, orchestration, transcription, and local model inference. In the documented local workflow, media and transcript content stay on the user’s computer.")
    make_table(d, ["Layer", "Component", "Responsibility"], [
        ("Interface", "Electron renderer: index.html, renderer.js, styles.css", "Loads media, handles playback/subtitles, sends actions, and renders results."),
        ("Application host", "Electron main process: main.js", "Creates the window, handles file selection and IPC, starts the backend, launches captions."),
        ("AI service", "Express: server.js at 127.0.0.1:3000", "Stores transcript context, answers questions, validates outputs, reports progress."),
        ("Speech/media", "Python Whisper, PyTorch, FFmpeg", "Transcribes speech, decodes media, and extracts storyboard frames."),
        ("Local inference", "Ollama at 127.0.0.1:11434", "Runs phi3 text generation and qwen2.5vl:3b vision generation."),
        ("Learning storage", "Per-video .eduplay folder or home fallback", "Stores analysis manifests and generated storyboard frames."),
    ], [1.05, 2.2, 3.4], 8.3)
    heading(d, "Workflow")
    for x in ["Open a lecture file in the Electron player.", "Generate Whisper captions or load an existing subtitle file.", "Parse subtitle cues with timestamps and send them to the local service for the active media.", "Use Ask AI, flashcards, or storyboard generation with the selected local model.", "Validate the model output, cache finished learning artifacts, and display results in the interface."]:
        step(d, "Step", x)

    heading(d, "Feature Workflows")
    heading(d, "Caption generation and transcript search", 2)
    d.add_paragraph("The caption generator loads Whisper’s base model, selects CUDA when available and CPU otherwise, and transcribes the selected media. The renderer receives status updates and the resulting SRT path. Search reads active subtitle cues and seeks to their timestamps.")
    code(d, "Caption transcription call", '''model = whisper.load_model(model_size, device=device)
result = model.transcribe(
    video_path,
    verbose=False,
    #task="translate",    Force English translation
    language=None      # Auto-detect input language
)''', "generate_caption.py, lines 36–44")
    d.add_paragraph("The translation task is commented out and language=None enables automatic detection. Despite the output suffix _AI_captions_en.srt, the current call does not force English translation.")
    heading(d, "Ask AI about this video", 2)
    d.add_paragraph("The subtitle manager parses SRT cues and sends them to /ask/init. For a question, the backend ranks transcript cues against the question and sends relevant excerpts to the text model. Model errors are shown in the interface rather than being hidden as empty answers.")
    code(d, "Question-focused transcript selection", "const relevantTranscript = selectQuestionContext(context?.segments || [], question, transcript);", "server.js, line 86")
    heading(d, "Flashcards", 2)
    d.add_paragraph("The Learning panel sends timestamped cues and a text model to /learning/flashcards. The backend samples chunks across long lectures, requests schema-constrained JSON, validates cue references, retries invalid output once, and saves cards in the per-video manifest. Cards support answer reveal, source review, timestamp jumps, and recall feedback.")
    code(d, "Flashcard cache identity", 'const key = makeAnalysisKey(stat, transcriptKey, { textModel, artifact: "flashcards-v1" });', "server.js, line 105")
    heading(d, "Pictorial storyboard", 2)
    d.add_paragraph("The storyboard endpoint detects scene changes, spaces candidates across the duration, extracts resized frames, and sends each frame with nearby transcript context to qwen2.5vl:3b. It validates the response, streams progress, and caches the result. The sampler defaults to at most 24 frames and an 8-second minimum gap.")
    code(d, "Representative scene selection", '''function selectRepresentativeTimestamps(candidates, duration, maxFrames = 24, minGap = 8) {
  const spaced = [];
  for (const time of candidates) {
    if (!spaced.length || time - spaced[spaced.length - 1] >= minGap) spaced.push(time);
  }
  if (spaced.length <= maxFrames) return spaced;
  const selected = [];
  const bins = Math.max(1, maxFrames);''', "sceneDetection.js, lines 55–63")

    heading(d, "Data Handling and Privacy")
    for x in ["The local AI backend binds to 127.0.0.1:3000; Ollama uses 127.0.0.1:11434 by default.", "The documented workflow needs no cloud AI endpoint; selected media and transcripts are processed locally.", "Learning results are cached in a hidden per-video .eduplay directory, with a per-media home-folder fallback if needed.", "Cache identity includes media metadata, transcript fingerprint, selected model, and artifact version.", "The repo has no team dataset or lecture videos. Document data source and sharing permission before distribution."]:
        bullet(d, x)
    heading(d, "Setup and Verification")
    d.add_paragraph("For source development, install Node dependencies with npm ci, create and activate a Python 3.11 environment, install requirements.txt, install Ollama, pull phi3 and qwen2.5vl:3b, then run npm start. The app starts its local Express backend automatically.")
    d.add_paragraph("The recorded local verification for this source baseline reported 10 passing unit tests and successful /ask, /learning/flashcards, and /learning/storyboard smoke requests using sample data. Rerun checks on the final build and capture the actual output before submission.")
    heading(d, "Evidence Placeholders")
    d.add_paragraph("Replace each box with a legible screenshot from the actual running application. Use approved media and remove unrelated or personal desktop content.")
    placeholder(d, "Figure 1. Player and lecture", "Show video, playback controls, and visible subtitles.")
    placeholder(d, "Figure 2. Captions and transcript search", "Show captions and a search result with its timestamp.")
    d.add_page_break()
    placeholder(d, "Figure 3. Ask AI", "Show a transcript-grounded question and response.")
    placeholder(d, "Figure 4. Flashcards", "Show a card, revealed answer, source excerpt, and timestamp control.")
    placeholder(d, "Figure 5. Storyboard", "Show a frame, visual explanation, transcript context, and jump time.")
    placeholder(d, "Figure 6. Test evidence", "Insert the actual npm test output and test-machine details.")

    d.add_page_break()
    heading(d, "Research Paper and Evaluation")
    d.add_paragraph("No research paper was present in the supplied repository. Insert the exact paper citation and only claims supported by that source. Do not imply the paper evaluated EduPlay unless the team performed that evaluation.")
    make_table(d, ["Paper detail", "Team entry"], [
        ("Title and authors", "[INSERT EXACT TITLE AND AUTHOR LIST]"),
        ("Venue and year", "[INSERT VENUE AND YEAR]"),
        ("DOI or stable URL", "[INSERT PAPER LINK]"),
        ("Problem and method", "[SUMMARIZE FROM THE PAPER]"),
        ("Findings", "[SUMMARIZE WITH PAGE OR SECTION REFERENCES]"),
        ("Connection to EduPlay", "[EXPLAIN WHAT THE PROJECT ADAPTS OR IMPLEMENTS]"),
    ], [2.0, 4.65], 8.5)
    d.add_paragraph("Evaluation results: [INSERT ACTUAL TEST MEDIA, METHODS, METRICS, RESULTS, AND LIMITATIONS. Do not invent results.]")
    heading(d, "Limitations and Next Steps")
    for x in ["Caption quality depends on audio, language, model size, and available hardware.", "Local models can return incomplete or incorrect content; verify answers against transcript sources.", "Scene detection may miss gradual transitions or select non-instructional animation cuts.", "The repository does not include the paper, dataset, demo recording, or final screenshots.", "Run a complete demo on the target lecture and hardware before final submission."]:
        bullet(d, x)
    d.add_paragraph("Source repository: https://github.com/Drona-Srivastava/EduPlay")
    path = OUT / "EduPlay_Project_Documentation_Report.docx"
    d.save(path)
    return path


def build_procedure():
    d = Document()
    setup(d, "EduPlay Procedure Guide")
    cover(d, "EduPlay Workflow and Procedure Guide", "Step-by-step setup, demonstration, and submission instructions", "WORKFLOW AND SUBMISSION GUIDE")
    heading(d, "How to Use This Guide")
    d.add_paragraph("Use this guide to prepare the application, run a repeatable demonstration, organize project materials, and submit links and supporting documents. Replace every bracketed field. The repository contains no dataset, research paper, or demo video, so supply those items before final submission.")
    heading(d, "Submission Links and Project Details")
    link_field(d, "Project source repository:", "https://github.com/Drona-Srivastava/EduPlay")
    link_field(d, "Shared project archive:", "[PASTE DRIVE VIEW LINK AFTER UPLOAD]")
    link_field(d, "Dataset or approved lecture collection:", "[PASTE DATASET DRIVE LINK]")
    link_field(d, "Demo video with all team members:", "[PASTE DEMO VIDEO DRIVE LINK]")
    link_field(d, "Research paper:", "[PASTE PAPER DOI OR STABLE LINK]")
    link_field(d, "Team, institution, and course:", "[INSERT VERIFIED DETAILS]")
    d.add_paragraph("No dataset is included in the repository. Identify the dataset source, owner, license or permission, format, and approximate size. Share only materials the team is allowed to distribute.")

    heading(d, "Roles and Responsibilities")
    make_table(d, ["Member", "Preparation", "Demo responsibility"], [
        ("[Member 1]", "Confirm objective and speaking order.", "Introduce the team, problem, and project goal."),
        ("[Member 2]", "Verify the cited paper and prepare its summary.", "Explain the paper’s problem, method, and findings."),
        ("[Member 3]", "Prepare architecture and source explanation.", "Explain the system workflow and implementation."),
        ("[Member 4]", "Prepare sample video and caption workflow.", "Show captions, transcript search, and Ask AI."),
        ("[Member 5]", "Prepare learning tools and test results.", "Show flashcards, storyboard, evidence, and limits."),
    ], [1.15, 2.65, 2.85], 8.2)
    d.add_paragraph("Combine roles if the team is smaller than five people. Add rows for a larger team. Every member must appear and speak in the final recording.")

    heading(d, "Prerequisites")
    for x in ["A Windows, macOS, or Linux computer; commands below use Windows PowerShell.", "Node.js and npm; project CI currently targets Node 24.", "Python 3.11 and pip for source development, plus requirements.txt packages.", "Ollama with phi3 and qwen2.5vl:3b installed; model files require several gigabytes of storage and suitable memory.", "An approved lecture file and an existing or generated transcript.", "A microphone, screen recorder, and folder for project deliverables."]:
        bullet(d, x)

    heading(d, "Install and Launch on Windows")
    step(d, "Get the source.", "Clone the repo or extract the submission ZIP, then open PowerShell in the project directory.")
    code(d, "Source commands", "git clone https://github.com/Drona-Srivastava/EduPlay.git\ncd EduPlay\nnpm ci", "Project README and package-lock.json")
    step(d, "Prepare Python.", "Activate the environment in the same shell used to launch Electron so the caption process can import Whisper and PyTorch.")
    code(d, "Python 3.11 commands", "py -3.11 -m venv .venv\n.\\.venv\\Scripts\\Activate.ps1\npython -m pip install --upgrade pip\npython -m pip install -r requirements.txt", "requirements.txt")
    step(d, "Install local models.", "Install Ollama for your operating system, pull the text and vision models, and verify them with ollama list. If Ollama is already active, do not start another server.")
    code(d, "Ollama commands", "ollama pull phi3\nollama pull qwen2.5vl:3b\nollama list", "README.md and server.js defaults")
    step(d, "Launch EduPlay.", "Keep the Python environment active and start the desktop app. It starts the local Express backend automatically.")
    code(d, "Start the desktop app", "npm start", "package.json start script")
    step(d, "Confirm setup.", "Verify both models appear in ollama list. If the AI backend is unavailable, check the Ollama service and local status before recording.")

    heading(d, "Run the Main Workflows")
    heading(d, "Generate or load captions", 2)
    for x in ["Open an approved media file in EduPlay.", "Start caption generation and wait for completion. Whisper writes an SRT file beside the media with suffix _AI_captions_en.srt.", "Check that the SRT contains numbered cues and start/end timestamps. The current script auto-detects spoken language; it does not force English translation.", "Alternatively, load an allowed subtitle file and confirm cues display during playback."]:
        step(d, "Step", x)
    placeholder(d, "Evidence A. Captioned playback", "Insert a screenshot of the actual video and synchronized subtitles.", 1.25)
    heading(d, "Search the transcript", 2)
    for x in ["Search for a word or phrase present in the captions.", "Select a result and confirm playback seeks to the matching moment.", "Record the query and timestamp for the demo notes."]:
        step(d, "Step", x)
    heading(d, "Ask AI about the video", 2)
    for x in ["Wait until the transcript is loaded and ready.", "Open Ask AI and ask a question answered in the transcript.", "Show the response and explain its source. Record any error honestly rather than presenting it as a success."]:
        step(d, "Step", x)
    placeholder(d, "Evidence B. Ask AI", "Insert an actual app screenshot with the question and response.", 1.25)
    heading(d, "Generate flashcards", 2)
    for x in ["Open Learning tools and choose Flashcards.", "Confirm the Text model is an installed model, normally phi3.", "Generate cards, reveal an answer, inspect its transcript excerpt, and jump to the source timestamp.", "Record the actual number of cards and any errors."]:
        step(d, "Step", x)
    heading(d, "Generate a storyboard", 2)
    for x in ["Open a video and wait for its duration and dimensions to load.", "Choose Storyboard and confirm the Vision model is installed, normally qwen2.5vl:3b.", "Generate the storyboard and wait for scene detection and frame analysis.", "Open a frame, explain the image and transcript context, and jump to its timestamp."]:
        step(d, "Step", x)
    placeholder(d, "Evidence C. Storyboard", "Insert an actual frame, explanation, transcript context, and timestamp.", 1.25)

    d.add_page_break()
    heading(d, "Testing and Results Record")
    code(d, "Run unit checks", "npm test", "package.json test script")
    make_table(d, ["Check", "Expected evidence", "Team result"], [
        ("Unit checks", "Pass/fail summary", "[INSERT ACTUAL OUTPUT]"),
        ("Captions", "SRT created and subtitles visible", "[PASS / FAIL / NOTES]"),
        ("Search", "Match seeks to correct time", "[PASS / FAIL / NOTES]"),
        ("Ask AI", "Transcript-based answer displayed", "[PASS / FAIL / NOTES]"),
        ("Flashcards", "Cards cite transcript cues", "[PASS / FAIL / NOTES]"),
        ("Storyboard", "Frames show context and seek links", "[PASS / FAIL / NOTES]"),
    ], [1.2, 3.1, 2.35], 8.2)
    d.add_paragraph("Test environment: [OS, CPU, GPU, RAM, Node, Python, Ollama]. Test media: [file, duration, source permission]. Do not claim accuracy or performance results without explaining how they were measured.")

    heading(d, "Demo Video Plan")
    d.add_paragraph("Record a 7–9 minute walkthrough. Every member must appear on camera or in an identified speaking segment and explain an assigned project or paper section.")
    make_table(d, ["Time", "Speaker", "What to show and explain"], [
        ("0:00–0:45", "[Member 1]", "Introduce the team, learning problem, and project objective."),
        ("0:45–2:00", "[Member 2]", "Explain the paper’s motivation, question, method, findings, and citation."),
        ("2:00–3:00", "[Member 3]", "Explain Electron, Whisper/FFmpeg, the local API, and Ollama models."),
        ("3:00–5:00", "[Member 4]", "Open a lecture, generate/load captions, search, and ask a grounded question."),
        ("5:00–6:30", "[Member 5]", "Generate flashcards/storyboard and show a source or timestamp jump."),
        ("6:30–8:00", "All members", "Present observed tests, limitations, conclusion, and next step. Ensure each person speaks."),
    ], [.9, 1.35, 4.4], 8.1)
    heading(d, "Paper explanation prompts", 2)
    for x in ["What problem does the paper study, and why does it matter?", "What method or experiment did the authors use?", "What evidence and results did the paper report?", "Which part informed EduPlay, and what did the team implement?", "What limitations should viewers keep in mind?"]:
        bullet(d, x)
    link_field(d, "Approved paper citation:", "[AUTHORS, TITLE, VENUE, YEAR, DOI OR URL]")
    heading(d, "Recording checklist", 2)
    for x in ["Every member is introduced and speaks.", "The paper citation and explanation match the source.", "Use media the team may share and hide personal information.", "Keep voice, app text, and cursor readable; do not conceal error states.", "Show real outputs and do not present placeholders as results.", "Export MP4 and play the exported copy before uploading."]:
        bullet(d, x)
    link_field(d, "Demo video link after upload:", "[PASTE SHARED DRIVE VIEW LINK]")

    heading(d, "Organize and Upload the Submission")
    d.add_paragraph("The project ZIP includes tracked source, tests, documentation, package metadata, and design assets. It excludes node_modules, build outputs, downloaded models, local Python environments, user videos, generated subtitles, and the dataset because these are machine-specific, regenerable, or absent from the repository.")
    for x in ["Create a Drive folder called EduPlay Submission with Project Archive, Documents, Demo Video, Dataset, and Research Paper subfolders.", "Upload EduPlay_Submission_Package.zip to Project Archive.", "Upload the project report and this procedure guide to Documents. Include editable DOCX and PDF copies if accepted by your course.", "Upload approved data or authorized access instructions to Dataset. Include source, license, format, and permission details.", "Upload the final MP4 with all team members to Demo Video; play the uploaded copy to verify it.", "Upload or link the cited paper subject to copyright and course rules.", "Set permissions as required. Use institution-only sharing where required; use anyone-with-link only when allowed.", "Copy viewer links into this guide and any required report fields.", "Open the links as a reviewer or in a private browser window and verify access."]:
        step(d, "Upload step", x)
    make_table(d, ["Drive item", "Link to paste into this guide"], [
        ("Project archive", "[PASTE DRIVE VIEW LINK]"), ("Dataset", "[PASTE DRIVE VIEW LINK]"),
        ("Demo video", "[PASTE DRIVE VIEW LINK]"), ("Research paper", "[PASTE DRIVE VIEW LINK OR DOI]"),
    ], [2.0, 4.65])

    heading(d, "Final Submission Checklist")
    for x in ["The ZIP opens and contains source code, design assets, tests, README, and requested documents.", "The report contains actual code excerpts and screenshots from the working app.", "This guide has working archive, dataset, demo, and paper links or approved access instructions.", "The video includes all team members and a correct explanation of the paper.", "Dataset provenance, license, format, and permission are stated.", "The results table reflects the submitted build and observed tests.", "All bracketed fields are replaced, or marked not applicable with a reason."]:
        bullet(d, x)
    path = OUT / "EduPlay_Workflow_and_Procedure_Guide.docx"
    d.save(path)
    return path


if __name__ == "__main__":
    print(build_report())
    print(build_procedure())
