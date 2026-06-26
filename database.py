import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional
import json
import os

# 数据库路径可通过环境变量覆盖。
# 在 Vercel 等只读文件系统上需指向 /tmp（见 app.py 的 DATA_DIR 逻辑）。
# 用函数动态读取，避免 import 时机早于环境变量设置。
def _db_path() -> Path:
    return Path(os.getenv("KNOWLEDGE_DB", "knowledge.db"))

# 兼容旧引用：保留模块级常量（指向默认值），实际连接一律走 _db_path()
DB_PATH = _db_path()

def init_db():
    """初始化数据库"""
    conn = sqlite3.connect(_db_path())
    c = conn.cursor()

    # 课程表
    c.execute("""
    CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        semester TEXT,
        teacher TEXT,
        color TEXT DEFAULT 'blue',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 兼容旧库：补充新增列
    for col, ddl in (
        ("color", "ALTER TABLE courses ADD COLUMN color TEXT DEFAULT 'blue'"),
        ("updated_at", "ALTER TABLE courses ADD COLUMN updated_at TIMESTAMP"),
    ):
        try:
            c.execute(ddl)
        except sqlite3.OperationalError:
            pass  # 列已存在

    # 教师提纲表
    c.execute("""
    CREATE TABLE IF NOT EXISTS outlines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        structure_json TEXT,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id)
    )
    """)

    # 提纲章节表（树形结构）
    c.execute("""
    CREATE TABLE IF NOT EXISTS outline_sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        outline_id INTEGER NOT NULL,
        parent_id INTEGER,
        level INTEGER DEFAULT 1,
        title TEXT NOT NULL,
        is_key_point BOOLEAN DEFAULT 0,
        exam_weight INTEGER DEFAULT 0,
        order_index INTEGER DEFAULT 0,
        FOREIGN KEY (outline_id) REFERENCES outlines(id),
        FOREIGN KEY (parent_id) REFERENCES outline_sections(id)
    )
    """)

    # 整理会话表
    c.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        course_id INTEGER NOT NULL,
        outline_id INTEGER,
        title TEXT NOT NULL,
        materials_count INTEGER DEFAULT 0,
        ai_analysis TEXT,
        notes_md TEXT,
        mindmap_md TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id),
        FOREIGN KEY (outline_id) REFERENCES outlines(id)
    )
    """)

    # 学习资料表
    c.execute("""
    CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        file_name TEXT,
        file_path TEXT,
        raw_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
    """)

    # 知识点表
    c.execute("""
    CREATE TABLE IF NOT EXISTS knowledge_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        section_id INTEGER,
        title TEXT NOT NULL,
        content TEXT,
        coverage_status TEXT DEFAULT 'partial',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id),
        FOREIGN KEY (section_id) REFERENCES outline_sections(id)
    )
    """)

    # 笔记表（Note系统）
    c.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        knowledge_point_id INTEGER,
        session_id TEXT,
        content TEXT NOT NULL,
        note_type TEXT DEFAULT 'comment',
        tags TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (knowledge_point_id) REFERENCES knowledge_points(id),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
    """)

    # 全文搜索虚拟表
    c.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_knowledge USING fts5(
        title, content, session_id, tokenize='porter unicode61'
    )
    """)

    conn.commit()
    conn.close()

# 提纲管理函数
def create_course(name: str, semester: str = "", teacher: str = "", color: str = "blue") -> int:
    """创建课程"""
    conn = sqlite3.connect(_db_path())
    c = conn.cursor()
    c.execute("INSERT INTO courses (name, semester, teacher, color) VALUES (?, ?, ?, ?)",
              (name, semester, teacher, color))
    course_id = c.lastrowid
    conn.commit()
    conn.close()
    return course_id

def create_outline(course_id: int, title: str, content: str, structure: dict) -> int:
    """创建提纲"""
    conn = sqlite3.connect(_db_path())
    c = conn.cursor()
    c.execute("""
        INSERT INTO outlines (course_id, title, content, structure_json)
        VALUES (?, ?, ?, ?)
    """, (course_id, title, content, json.dumps(structure, ensure_ascii=False)))
    outline_id = c.lastrowid
    conn.commit()
    conn.close()
    return outline_id

def parse_outline_to_sections(outline_id: int, outline_text: str):
    """解析提纲文本为章节树"""
    conn = sqlite3.connect(_db_path())
    c = conn.cursor()

    lines = outline_text.strip().split('\n')
    parent_stack = [None]  # 父节点栈
    order = 0

    for line in lines:
        if not line.strip():
            continue

        # 判断层级（根据缩进或标号）
        indent = len(line) - len(line.lstrip())
        level = indent // 2 + 1

        # 提取标题和是否重点
        title = line.strip()
        is_key = '重点' in title or '考点' in title or '必考' in title

        # 计算考试权重
        exam_weight = 3 if '必考' in title else 2 if '重点' in title else 1

        # 清理标题中的标记
        title = title.replace('（重点）', '').replace('(重点)', '').strip()

        # 插入章节
        parent_id = parent_stack[-1] if len(parent_stack) > level else parent_stack[level - 1]
        c.execute("""
            INSERT INTO outline_sections
            (outline_id, parent_id, level, title, is_key_point, exam_weight, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (outline_id, parent_id, level, title, is_key, exam_weight, order))

        section_id = c.lastrowid

        # 更新父节点栈
        if len(parent_stack) <= level:
            parent_stack.append(section_id)
        else:
            parent_stack[level] = section_id

        order += 1

    conn.commit()
    conn.close()

def get_course_by_name(name: str) -> Optional[dict]:
    """根据课程名获取课程"""
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM courses WHERE name = ? ORDER BY created_at DESC LIMIT 1", (name,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def get_latest_outline(course_id: int) -> Optional[dict]:
    """获取课程最新提纲"""
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT * FROM outlines
        WHERE course_id = ?
        ORDER BY version DESC, created_at DESC
        LIMIT 1
    """, (course_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def get_outline_by_id(outline_id: int) -> Optional[dict]:
    """根据 ID 获取提纲"""
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM outlines WHERE id = ?", (outline_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def save_session(session_id: str, course_id: int, title: str, outline_id: Optional[int],
                 materials_count: int, ai_analysis: str, notes_md: str, mindmap_md: str):
    """保存整理会话"""
    conn = sqlite3.connect(_db_path())
    c = conn.cursor()
    c.execute("""
        INSERT OR REPLACE INTO sessions
        (id, course_id, outline_id, title, materials_count, ai_analysis, notes_md, mindmap_md)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (session_id, course_id, outline_id, title, materials_count, ai_analysis, notes_md, mindmap_md))
    conn.commit()
    conn.close()

def get_session(session_id: str) -> Optional[dict]:
    """获取会话详情"""
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def update_session_notes(session_id: str, notes_md: str):
    """更新会话的笔记内容（用于编辑页自动保存）"""
    conn = sqlite3.connect(_db_path())
    c = conn.cursor()
    c.execute("UPDATE sessions SET notes_md = ? WHERE id = ?", (notes_md, session_id))
    conn.commit()
    conn.close()


def rename_session(session_id: str, new_title: str, new_notes_md: str | None = None):
    """重命名整理记录的标题，可选同步更新笔记正文。"""
    conn = sqlite3.connect(_db_path())
    c = conn.cursor()
    if new_notes_md is not None:
        c.execute("UPDATE sessions SET title = ?, notes_md = ? WHERE id = ?",
                  (new_title, new_notes_md, session_id))
    else:
        c.execute("UPDATE sessions SET title = ? WHERE id = ?", (new_title, session_id))
    conn.commit()
    conn.close()

def get_course_sessions(course_id: int, limit: int = 20) -> list[dict]:
    """获取课程的历史会话"""
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT * FROM sessions
        WHERE course_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    """, (course_id, limit))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]


# ============ 课程库管理函数 ============

def get_course_by_id(course_id: int) -> Optional[dict]:
    """根据 ID 获取课程"""
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM courses WHERE id = ?", (course_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def list_courses_with_stats() -> list[dict]:
    """列出所有课程，附带统计数据（笔记数、重点数、最近更新时间）。"""
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT
            co.id, co.name, co.color, co.created_at,
            COUNT(DISTINCT s.id) AS notes_count,
            MAX(s.created_at) AS last_session_at
        FROM courses co
        LEFT JOIN sessions s ON s.course_id = co.id
        GROUP BY co.id
        ORDER BY (last_session_at IS NULL), last_session_at DESC, co.created_at DESC
    """)
    courses = [dict(row) for row in c.fetchall()]

    for course in courses:
        # 重点数：扫描该课程所有会话笔记中的教师重点标记
        c.execute("SELECT notes_md FROM sessions WHERE course_id = ?", (course["id"],))
        key_count = 0
        for (notes_md,) in c.fetchall():
            if notes_md:
                key_count += notes_md.count("【教师重点】") + notes_md.count("🔴")
        course["key_points_count"] = key_count
        course["updated_at"] = course.get("last_session_at") or course.get("created_at")

    conn.close()
    return courses


def rename_course(course_id: int, new_name: str):
    """重命名课程"""
    conn = sqlite3.connect(_db_path())
    c = conn.cursor()
    c.execute("UPDATE courses SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              (new_name, course_id))
    conn.commit()
    conn.close()


def update_course_color(course_id: int, color: str):
    """更换课程颜色"""
    conn = sqlite3.connect(_db_path())
    c = conn.cursor()
    c.execute("UPDATE courses SET color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              (color, course_id))
    conn.commit()
    conn.close()


def delete_course(course_id: int):
    """删除课程及其所有关联数据"""
    conn = sqlite3.connect(_db_path())
    c = conn.cursor()
    c.execute("SELECT id FROM sessions WHERE course_id = ?", (course_id,))
    session_ids = [r[0] for r in c.fetchall()]
    for sid in session_ids:
        c.execute("DELETE FROM notes WHERE session_id = ?", (sid,))
        c.execute("DELETE FROM knowledge_points WHERE session_id = ?", (sid,))
        c.execute("DELETE FROM materials WHERE session_id = ?", (sid,))
    c.execute("DELETE FROM sessions WHERE course_id = ?", (course_id,))
    c.execute("DELETE FROM outlines WHERE course_id = ?", (course_id,))
    c.execute("DELETE FROM courses WHERE id = ?", (course_id,))
    conn.commit()
    conn.close()


def delete_session(session_id: str):
    """删除单个整理会话及其关联数据"""
    conn = sqlite3.connect(_db_path())
    c = conn.cursor()
    c.execute("DELETE FROM notes WHERE session_id = ?", (session_id,))
    c.execute("DELETE FROM knowledge_points WHERE session_id = ?", (session_id,))
    c.execute("DELETE FROM materials WHERE session_id = ?", (session_id,))
    c.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()


def get_course_materials(course_id: int) -> list[dict]:
    """获取课程下所有上传资料"""
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT m.* FROM materials m
        JOIN sessions s ON m.session_id = s.id
        WHERE s.course_id = ?
        ORDER BY m.created_at DESC
    """, (course_id,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]


# 初始化数据库
if __name__ == "__main__":
    init_db()
    print("Database initialized successfully")
