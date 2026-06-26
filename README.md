# 课程笔记自动整理系统

将课堂录音、截图、PPT、字幕一键转为结构化笔记 + 思维导图 + 可打印PDF。

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

> Windows 安装 WeasyPrint 额外需要 GTK 运行时：https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer

### 2. 配置 API Key

```bash
cp .env.example .env
# 编辑 .env，填入你的 ModelScope API Key
```

获取 API Key：https://www.modelscope.cn/  → 个人中心 → API Token

### 3. 启动

```bash
uvicorn app:app --reload --port 8000
```

浏览器访问：http://localhost:8000

---

## 支持的文件格式

| 类型 | 格式 |
|---|---|
| 音频 | `.mp3` `.wav` `.m4a` `.ogg` `.flac` |
| 图片 | `.jpg` `.png` `.bmp` `.webp` |
| 文档 | `.pdf` `.pptx` `.txt` `.md` |
| 字幕 | `.srt` |

## 输出文件

每次处理生成三个文件：
- `课程名.md` — Markdown 结构化笔记
- `课程名.pdf` — A4 打印版 PDF
- `课程名.docx` — Word 文档
- 思维导图在网页中实时预览，可截图保存

## 配置说明

`.env` 可选配置：

```env
WHISPER_MODEL=base        # tiny/base/small/medium/large，越大越准但越慢
MODELSCOPE_MODEL=Qwen/Qwen2.5-72B-Instruct
```

## 常见问题

**Q: 首次运行很慢？**  
A: Whisper 模型首次自动下载（base 约 140MB），PaddleOCR 同理，之后缓存本地。

**Q: 中文识别效果差？**  
A: 将 `WHISPER_MODEL` 改为 `medium` 或 `large` 可显著提升中文准确率。

**Q: 多科目怎么归档？**  
A: 课程名称填写「科目-章节」格式（如 `高等数学-第三章`），输出文件自动以此命名。
