import os
import whisper

_model = None

def get_model():
    global _model
    if _model is None:
        size = os.getenv("WHISPER_MODEL", "base")
        _model = whisper.load_model(size)
    return _model

def transcribe(audio_path: str) -> str:
    """音频文件转文字，返回纯文本"""
    result = get_model().transcribe(audio_path, language="zh", verbose=False)
    return result["text"].strip()
