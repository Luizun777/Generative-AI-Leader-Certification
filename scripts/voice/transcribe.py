"""Transcribe la narración para comprobarla sin oírla.

Recibe por la entrada estándar una petición JSON por línea ({"path", "hint"}) y responde
una línea JSON por cada una. `hint` lleva los nombres propios del reel, nunca la frase.
Necesita faster-whisper y su modelo ya descargado: no usa la red.
"""

import json
import os
import sys

os.environ.setdefault("HF_HUB_OFFLINE", "1")

from faster_whisper import WhisperModel  # noqa: E402

model = WhisperModel(os.environ.get("WHISPER_MODEL", "base"), device="cpu", compute_type="int8")
print(json.dumps({"ready": True}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    request = json.loads(line) if line.startswith("{") else {"path": line}
    path = request["path"]
    try:
        segments, _ = model.transcribe(path, language="es", beam_size=5, condition_on_previous_text=False, initial_prompt=request.get("hint") or None)
        text = " ".join(segment.text.strip() for segment in segments)
        print(json.dumps({"path": path, "text": text}, ensure_ascii=False), flush=True)
    except Exception as error:  # la comprobación nunca debe tumbar la generación
        print(json.dumps({"path": path, "error": str(error)}), flush=True)
