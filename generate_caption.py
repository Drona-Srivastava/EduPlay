import sys
import whisper
import os
import torch

def generate_captions(video_path):
    print("STATUS: Got video file ✅", flush=True)

    # Choose fastest available model
    model_size = "base"  # "tiny" is faster but less accurate
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"STATUS: Loading Whisper model ({model_size}) on {device}...", flush=True)

    model = whisper.load_model(model_size, device=device)

    print("STATUS: Starting transcription...", flush=True)
    result = model.transcribe(video_path, verbose=False)

    captions_path = os.path.splitext(video_path)[0] + "_AI_captions.srt"

    print("STATUS: Generating SRT file...", flush=True)
    with open(captions_path, "w", encoding="utf-8") as f:
        for i, segment in enumerate(result["segments"], start=1):
            f.write(f"{i}\n")
            f.write(f"{format_timestamp(segment['start'])} --> {format_timestamp(segment['end'])}\n")
            f.write(f"{segment['text'].strip()}\n\n")

    print(f"RESULT:{captions_path}", flush=True)


def format_timestamp(seconds: float):
    """Convert float seconds to SRT timestamp format (hh:mm:ss,ms)."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds * 1000) % 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python generate_captions.py <video_path>", flush=True)
        sys.exit(1)

    video_path = sys.argv[1]
    generate_captions(video_path)
