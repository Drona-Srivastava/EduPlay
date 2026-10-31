from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

OUT = Path(__file__).resolve().parent
DEST = OUT / "EduPlay_Solo_Demo_Video_Script.docx"
BLACK = "171717"
INK = "263442"
ORANGE = "E87524"
PALE = "FFF3E8"
GRAY = "5D6B78"


def set_run(run, size=10.5, color=INK, bold=False, italic=False, font="Arial"):
    run.font.name = font
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), font)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), font)
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    run.bold = bold
    run.italic = italic


def script_block(doc, label, text, fill=PALE):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(.12)
    p.paragraph_format.right_indent = Inches(.10)
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.keep_together = True
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    pPr.append(shd)
    border = OxmlElement("w:pBdr")
    left = OxmlElement("w:left")
    left.set(qn("w:val"), "single")
    left.set(qn("w:sz"), "18")
    left.set(qn("w:space"), "7")
    left.set(qn("w:color"), ORANGE)
    border.append(left)
    pPr.append(border)
    set_run(p.add_run(label.upper() + "  "), size=8.5, color=ORANGE, bold=True)
    set_run(p.add_run(text), size=10.3, color=BLACK)
    return p


def show_block(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    set_run(p.add_run("ON SCREEN  "), size=8.5, color=ORANGE, bold=True)
    set_run(p.add_run(text), size=9.5, color=GRAY, italic=True)


def section(doc, time, title, show, speech):
    h = doc.add_heading(f"{time}  {title}", level=1)
    h.paragraph_format.keep_with_next = True
    show_block(doc, show)
    script_block(doc, "Say", speech)


doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.27), Inches(11.69)
sec.top_margin, sec.bottom_margin = Inches(.65), Inches(.65)
sec.left_margin, sec.right_margin = Inches(.78), Inches(.78)

normal = doc.styles["Normal"]
normal.font.name, normal.font.size = "Arial", Pt(10.5)
normal._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
normal.font.color.rgb = RGBColor.from_string(INK)
normal.paragraph_format.space_after = Pt(5)
normal.paragraph_format.line_spacing = 1.08
for style_name, size in [("Heading 1", 13), ("Heading 2", 11)]:
    style = doc.styles[style_name]
    style.font.name, style.font.size = "Arial", Pt(size)
    style._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    style._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    style.font.color.rgb = RGBColor.from_string(BLACK)
    style.font.bold = True
    style.paragraph_format.space_before = Pt(9)
    style.paragraph_format.space_after = Pt(3)
    style.paragraph_format.keep_with_next = True
title_style = doc.styles["Title"]
title_style.font.name, title_style.font.size = "Arial", Pt(25)
title_style.font.color.rgb = RGBColor.from_string(BLACK)
title_style.font.bold = True
title_style.paragraph_format.space_after = Pt(3)
title_style.paragraph_format.keep_with_next = True
if title_style._element.pPr is not None:
    for border in title_style._element.pPr.findall(qn("w:pBdr")):
        title_style._element.pPr.remove(border)

p = doc.add_paragraph(style="Title")
p.add_run("EduPlay Solo Demo Video Script")
p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(7)
set_run(p.add_run("A ready-to-read walkthrough for one presenter"), size=12, color=GRAY, italic=True)

t = doc.add_table(rows=1, cols=3)
t.alignment = WD_TABLE_ALIGNMENT.CENTER
t.autofit = False
for cell, width, text in zip(t.rows[0].cells, [2.1, 2.1, 2.4], ["ABOUT 5 MINUTES", "ONE PRESENTER", "APPLICATION WALKTHROUGH"]):
    cell.width = Inches(width)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run(p.add_run(text), size=8, color=BLACK, bold=True)
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), "F1F4F7")
    cell._tc.get_or_add_tcPr().append(shd)
    mar = OxmlElement("w:tcMar")
    for edge in ("top", "bottom", "start", "end"):
        e = OxmlElement(f"w:{edge}")
        e.set(qn("w:w"), "100")
        e.set(qn("w:type"), "dxa")
        mar.append(e)
    cell._tc.get_or_add_tcPr().append(mar)

doc.add_paragraph("Use this script to record a clear, solo demonstration of EduPlay. Replace bracketed examples with details from the video you choose. Have the app and transcript ready before recording so the walkthrough stays focused.")

doc.add_heading("Recording Script", level=1)
section(doc, "0:00–0:25", "Introduction", "Show the EduPlay window with a lecture video loaded.", "Hi, I’m [your name]. This is EduPlay, a desktop learning media player. I built it to make lecture videos easier to review by combining playback, speech transcription, transcript search, and AI study tools in one application.")
section(doc, "0:25–1:10", "Player and Captions", "Play the video briefly and show its captions. If appropriate, start caption generation.", "I chose Electron because I wanted a desktop application and was already familiar with HTML, CSS, and JavaScript. EduPlay can generate timestamped captions from lecture speech using Whisper. These captions also make the spoken content searchable.")
section(doc, "1:10–1:45", "Transcript Search", "Search for a word or phrase that is clearly spoken in the video, then select a result.", "The transcript is organized into timed caption segments. I can search for a term and jump to the point where it appears, instead of scrubbing through the full recording.")
section(doc, "1:45–2:35", "Ask AI About This Video", "Open Ask AI and ask a question whose answer is stated in the chosen lecture. Wait for the live response.", "After the transcript is loaded, EduPlay sends question-relevant transcript excerpts to a local Ollama text model. I’ll ask: According to this lecture, what is the difference between [topic A] and [topic B]? The answer should be based on the video’s transcript.")
section(doc, "2:35–3:35", "Flashcards", "Open Learning tools, choose Flashcards, generate cards, reveal one answer, and show its source cue or timestamp if available.", "EduPlay can turn transcript content into flashcards. I can reveal an answer, review the transcript excerpt it came from, and return to that moment in the video. The selected text model may take a little time to create the cards.")
section(doc, "3:35–4:35", "Storyboard", "Open Learning tools, choose Storyboard, and show a generated frame with its explanation and timestamp.", "The storyboard feature selects representative frames from the video and pairs them with nearby transcript context. A local vision model uses that image and context to describe the scene. I can review a frame and jump to its point in the lecture.")
section(doc, "4:35–5:00", "Conclusion", "Return to the main player or show the finished learning tools.", "EduPlay brings lecture playback, Whisper captions, transcript search, local AI question answering, flashcards, and visual storyboards together in one desktop workflow. The goal is to help learners find and review useful parts of a lecture more efficiently. Thank you.")

doc.add_heading("Before You Record", level=1)
for item in [
    "Choose a short lecture clip you are allowed to show, with clear audio and topics you can question accurately.",
    "Start Ollama and confirm the selected models are installed. The project commonly uses phi3 for text and qwen2.5vl:3b for vision.",
    "Launch EduPlay and load the video. Confirm the transcript is available before opening Ask AI or Learning tools.",
    "Replace [your name], [topic A], and [topic B]. Make sure both topics and their comparison are actually covered in your clip.",
    "Close personal windows and notifications. Keep the app text readable and speak clearly while recording the screen.",
    "Play the exported recording once to check the audio, picture, and ending before sharing it.",
]:
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(3)
    p.add_run(item)

doc.add_heading("If a Model Is Slow or Returns an Error", level=1)
doc.add_paragraph("Wait briefly for local generation. If a feature still fails, describe the result accurately and move on or omit that segment. You may prepare outputs on the same clip before recording to avoid long waits, but say when an output was prepared earlier rather than presenting it as live generation.")

footer = sec.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_run(footer.add_run("EduPlay Solo Demo Script  |  Page "), size=8, color=GRAY)
field = OxmlElement("w:fldSimple")
field.set(qn("w:instr"), "PAGE")
footer._p.append(field)

doc.save(DEST)
print(DEST)
