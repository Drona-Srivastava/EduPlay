import sys
import whisper
import os

def generate_captions(video_path):
    print(f"STATUS: Loading Whisper model...", flush=True)
    model = whisper.load_model("base")

    print(f"STATUS: Transcribing {video_path}", flush=True)
    result = model.transcribe(video_path)

    captions_path = os.path.splitext(video_path)[0] + "_AI_captions.srt"

    print("STATUS: Writing captions to file...", flush=True)
    with open(captions_path, "w", encoding="utf-8") as f:
        for i, segment in enumerate(result["segments"], start=1):
            start = segment["start"]
            end = segment["end"]
            text = segment["text"].strip()

            f.write(f"{i}\n")
            f.write(f"{format_timestamp(start)} --> {format_timestamp(end)}\n")
            f.write(f"{text}\n\n")

    # tell Electron the final file
    print(f"RESULT:{captions_path}", flush=True)

def format_timestamp(seconds: float):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds * 1000) % 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python generate_caption.py <video_path>", flush=True)
        sys.exit(1)

    video_path = sys.argv[1]
    generate_captions(video_path)
