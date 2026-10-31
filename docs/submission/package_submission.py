"""Create a clean source archive with final submission documents."""
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "EduPlay_Submission_Package.zip"
DOCS = ROOT / "docs" / "submission"

readme = """EduPlay submission package

Contents
- Tracked EduPlay source, tests, design assets, package metadata, and bundled FFmpeg runtime files
- Project Documentation Report (DOCX and PDF)
- Workflow and Procedure Guide (DOCX and PDF)
- Document and package builder scripts

Not included
- Dataset, research paper, or recorded team demo: none was present in the project folder
- Ollama model weights, Python virtual environments, node_modules, and generated media/caches

Before submission
1. Replace bracketed fields in both documents.
2. Add the approved dataset link, exact paper citation, and final demo video link to the guide.
3. Add actual screenshots and observed test results to the report and guide.
4. Upload this archive and documents to the course-approved Drive location and verify viewer access.

Source repository: https://github.com/Drona-Srivastava/EduPlay
Source baseline: EduPlay 0.1.15, commit add199b
"""

tracked = subprocess.check_output(
    ["git", "ls-files", "-z"], cwd=ROOT
).decode("utf-8").split("\0")
extras = [
    "docs/submission/EduPlay_Project_Documentation_Report.docx",
    "docs/submission/EduPlay_Project_Documentation_Report.pdf",
    "docs/submission/EduPlay_Workflow_and_Procedure_Guide.docx",
    "docs/submission/EduPlay_Workflow_and_Procedure_Guide.pdf",
    "docs/submission/build_documents.py",
    "docs/submission/package_submission.py",
]
files = sorted({p for p in tracked if p} | set(extras))
with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    zf.writestr("SUBMISSION_PACKAGE_README.txt", readme)
    for rel in files:
        path = ROOT / rel
        if not path.is_file():
            raise FileNotFoundError(path)
        # Native FFmpeg binaries are already compressed and are runtime assets.
        method = zipfile.ZIP_STORED if rel.startswith("ffmpeg-binaries/") else zipfile.ZIP_DEFLATED
        zf.write(path, rel, compress_type=method)

print(f"Created {OUT} ({OUT.stat().st_size:,} bytes, {len(files) + 1} entries)")
