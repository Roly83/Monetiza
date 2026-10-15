"""Pre-genera con Kokoro el audio de todo el texto fijo de la app.

Uso:
  node tools/textos-voz.mjs > textos.json
  python tools/bake_voices.py textos.json kokoro-v1.0.int8.onnx voices-v1.0.bin models/clips

Requiere: pip install kokoro-onnx  y  ffmpeg.
Los archivos del modelo están en https://github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0).
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from kokoro_onnx import Kokoro

VOICES = {"en": [("bm_george", "en-gb"), ("bf_emma", "en-gb")], "es": [("em_alex", "es"), ("ef_dora", "es")]}


def main(textos_path, model, voices, out_dir):
    items = json.loads(Path(textos_path).read_text(encoding="utf-8"))
    out = Path(out_dir)
    index_path = out / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    k = Kokoro(model, voices)
    total = sum(len(i["rates"]) * len(VOICES[i["lang"]]) for i in items)
    n = 0
    for item in items:
        text = item["text"].strip()
        for voice, espeak_lang in VOICES[item["lang"]]:
            for rate in item["rates"]:
                n += 1
                key = f"{rate:g}"
                name = hashlib.sha1(f"{key}|{text}".encode()).hexdigest()[:12] + ".mp3"
                target = out / voice / name
                index.setdefault(voice, {}).setdefault(key, {})[text] = name
                if target.exists():
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                audio, sr = k.create(text, voice=voice, speed=rate, lang=espeak_lang)
                pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
                subprocess.run(
                    ["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(sr), "-ac", "1", "-i", "-",
                     "-b:a", "40k", str(target)],
                    input=pcm, check=True,
                )
                if n % 25 == 0:
                    print(f"{n}/{total}", flush=True)
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Listo: {n} clips")


if __name__ == "__main__":
    main(*sys.argv[1:5])
