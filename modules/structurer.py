import os
from openai import OpenAI

_client = None

SYSTEM_PROMPT = """你是一位专业的课程笔记整理助手。
用户会给你一段从课堂录音、PPT、板书等来源合并的原始文本，以及课程名称和教师提纲。

请完成以下两项任务，严格按照格式输出：

===NOTES===
（输出结构化课堂笔记，要求：）
- 使用 Markdown 格式
- 第一行为 # 课程名称
- 自动生成目录（使用 ## 目录 + 列表）
- 如果用户提供了教师提纲，务必按照提纲的结构组织内容，提纲中标注的重点用 **加粗** 特别强调
- 正文用 ## 一级章节、### 二级知识点 组织层级
- **加粗**标记核心考点和重点定义
- 区分「定义」「例题」「结论」「拓展」并用 > 引用块标注
- 删除课堂闲聊、重复废话，保留核心内容
- 每节末附「本节重点」小结

===MINDMAP===
（输出 markmap 格式的思维导图 Markdown，要求：）
- 第一行为 # 课程名称
- 用缩进的 ## ### #### 表示层级
- 如果有教师提纲，思维导图必须体现提纲结构
- 只保留关键词，不要长句子
- 涵盖所有一级章节和主要知识点
"""

def get_client():
    global _client
    if _client is None:
        import httpx
        # 如果需要代理，取消下面两行注释并改成你的代理地址
        # proxy = "http://127.0.0.1:7890"
        # http_client = httpx.Client(proxies=proxy, verify=False)  # verify=False 跳过 SSL 验证

        _client = OpenAI(
            api_key=os.getenv("MODELSCOPE_API_KEY"),
            base_url="https://api-inference.modelscope.cn/v1",
            # http_client=http_client,  # 如果设置了代理，取消这行注释
        )
    return _client

def structure(raw_text: str, subject: str, outline: str = "") -> tuple[str, str]:
    """
    返回 (structured_notes_markdown, mindmap_markdown)
    """
    model = os.getenv("MODELSCOPE_MODEL", "Qwen/Qwen2.5-72B-Instruct")

    user_msg = f"课程名称：{subject}\n\n"
    if outline:
        user_msg += f"教师提纲与重点：\n{outline}\n\n"
    user_msg += f"原始课堂内容：\n{raw_text[:12000]}"  # 限制长度避免超token

    resp = get_client().chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3,
    )
    output = resp.choices[0].message.content

    # 调试：打印 AI 原始输出的前 500 字符
    print("\n" + "=" * 60)
    print(f"[AI 原始输出] 总长度: {len(output) if output else 0}")
    print(f"前 500 字符:\n{(output or '')[:500]}")
    print("=" * 60 + "\n")

    # 分割两段输出
    if "===MINDMAP===" in output:
        parts = output.split("===MINDMAP===")
        notes_part = parts[0].replace("===NOTES===", "").strip()
        mindmap_part = parts[1].strip()
    else:
        # 兜底：如果没有分隔符，把整个输出当作笔记
        print("[警告] AI 输出中没有找到 ===MINDMAP=== 分隔符，将全部内容视为笔记")
        notes_part = output.replace("===NOTES===", "").strip()
        mindmap_part = f"# {subject}\n## 内容待生成"

    # 最终检查：如果笔记为空，至少生成一个标题
    if not notes_part or len(notes_part) < 10:
        print(f"[警告] notes_part 为空或过短({len(notes_part)} 字符)，使用兜底内容")
        notes_part = f"# {subject}\n\n> AI 未能正确生成笔记内容，原始输出长度: {len(output or '')}"

    print(f"[分割结果] notes_part 长度: {len(notes_part)}, mindmap_part 长度: {len(mindmap_part)}\n")

    return notes_part, mindmap_part


REFINE_PROMPT = """你是一位专业的课程笔记编辑助手。
用户会给你一份已有的 Markdown 课堂笔记，以及一条修改指令。
请根据指令修改笔记，并只返回修改后的完整 Markdown 笔记，不要添加任何解释、前言或代码块标记。
保持原有的 Markdown 结构（# 标题、## 章节、### 知识点、**加粗**、> 引用块等）。
"""


def refine(notes_md: str, instruction: str) -> str:
    """根据用户指令修改已有笔记，返回修改后的完整 Markdown。"""
    model = os.getenv("MODELSCOPE_MODEL", "Qwen/Qwen2.5-72B-Instruct")

    user_msg = (
        f"现有笔记：\n{notes_md[:12000]}\n\n"
        f"修改指令：{instruction}\n\n"
        f"请返回修改后的完整 Markdown 笔记。"
    )

    resp = get_client().chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": REFINE_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3,
    )
    result = resp.choices[0].message.content.strip()

    # 去掉可能的 ```markdown 包裹
    if result.startswith("```"):
        lines = result.split("\n")
        result = "\n".join(lines[1:-1]) if len(lines) > 2 else result
    return result.strip()
