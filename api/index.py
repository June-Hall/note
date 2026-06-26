"""Vercel serverless 入口。

Vercel 的 @vercel/python 运行时会在 api/ 目录下查找处理函数，
这里把仓库根目录加入 import 路径，再导出 FastAPI 的 ASGI app 供其托管。
"""
import os
import sys
from pathlib import Path

# 把仓库根目录加入模块搜索路径，便于 import app / database / modules
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# 标记 serverless 环境（app.py 据此切换 /tmp 数据目录与同步处理）
os.environ.setdefault("VERCEL", "1")

from app import app  # noqa: E402

# Vercel @vercel/python 识别名为 app 的 ASGI 应用
