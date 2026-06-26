from paddleocr import PaddleOCR

_ocr = None

def get_ocr():
    global _ocr
    if _ocr is None:
        _ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
    return _ocr

def extract_text(image_path: str) -> str:
    """从图片提取文字"""
    result = get_ocr().ocr(image_path, cls=True)
    if not result or not result[0]:
        return ""
    lines = [line[1][0] for line in result[0] if line[1][1] > 0.5]
    return "\n".join(lines)
