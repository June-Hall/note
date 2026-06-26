# 课程笔记智能整理与复习系统

## 系统架构

### 核心功能模块

1. **教师提纲管理中心**
   - 多格式导入（文本/Markdown/图片OCR/Word/PDF）
   - 结构化解析（章节 → 知识点 → 重点/考点标记）
   - 版本管理与历史追踪

2. **智能关联分析引擎**
   - 自动匹配课堂内容到提纲章节
   - 计算知识点覆盖率
   - 检测学习盲区
   - 追踪考点完成度

3. **年度报告式展示**
   - 横向翻页/纵向分页
   - 封面 → 概览 → 提纲覆盖 → 分类分析 → 盲区 → 总结 → 建议

4. **历史对话记录系统**
   - 每次整理记录（时间/资料/提纲/结果/补充）
   - 版本对比
   - 历史恢复

5. **Markdown增强编辑器**
   - 多色高亮（红/黄/蓝）
   - 重点标记语法
   - 实时预览

6. **Note双向关联系统**
   - 便签/评论/批注模式
   - 知识点 ↔ Note 双向链接
   - 标签管理

7. **知识库详情页**
   - 多维度分类浏览
   - 知识点详情卡片
   - 全文搜索

---

## 技术栈

### 后端
- FastAPI
- SQLite（关系数据 + FTS5全文搜索）
- Whisper（语音转文字）
- PaddleOCR（图片识别）
- ModelScope API（AI结构化）

### 前端
- Vue.js 3（单页应用）
- Pinia（状态管理）
- Markdown编辑器（CodeMirror 6）
- 图表库（D3.js / ECharts）
- Markmap（思维导图）

---

## 数据库设计

### 表结构

```sql
-- 课程表
courses (
  id, name, semester, teacher, created_at
)

-- 教师提纲表
outlines (
  id, course_id, title, content, structure_json, version, created_at
)

-- 提纲章节表
outline_sections (
  id, outline_id, parent_id, level, title, is_key_point, exam_weight, order
)

-- 学习资料表
materials (
  id, course_id, session_id, type, file_path, raw_text, created_at
)

-- 知识点表
knowledge_points (
  id, course_id, section_id, title, content, coverage_level, created_at
)

-- 笔记表
notes (
  id, knowledge_point_id, content, type, tags, created_at, updated_at
)

-- 整理历史表
sessions (
  id, course_id, outline_id, materials_count, ai_analysis, created_at
)

-- 全文搜索
fts_knowledge (
  knowledge_point_id, title, content
)
```

---

## 实现步骤

### Phase 1: 数据层（优先）
1. 创建数据库模型
2. 实现提纲解析器
3. 实现智能匹配算法

### Phase 2: API层
1. 提纲管理API
2. 资料上传与处理API
3. 知识点关联API
4. 搜索API

### Phase 3: 前端核心
1. 三栏布局框架
2. 提纲编辑器
3. Markdown增强编辑器
4. Note系统

### Phase 4: 高级功能
1. 年度报告生成
2. 覆盖率分析可视化
3. 历史版本对比
4. 导出功能

---

## 当前实现进度

✅ 基础文件处理（音频/图片/文档）
✅ AI结构化整理
✅ 简单Web界面

🚧 需要重构：
- 添加数据库层
- 重构前端为Vue.js
- 实现提纲管理
- 实现知识点关联
- 实现Note系统
- 实现年度报告

---

## 下一步

建议先实现**数据库设计与提纲管理功能**，这是整个系统的基础。
