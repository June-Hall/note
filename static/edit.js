// ===== 资料编辑页逻辑 =====

const sessionId = location.pathname.split('/').pop();
let sessionData = null;
let materials = [];
let tdService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
let saveTimer = null;

async function init() {
    // 加载会话详情
    const res = await fetch(`/api/session/${sessionId}/detail`);
    if (!res.ok) { document.getElementById('editor').innerHTML = '<p>会话不存在</p>'; return; }
    sessionData = await res.json();

    // 返回课程链接
    document.getElementById('backToCourse').href = `/course/${sessionData.course_id}`;

    // 渲染编辑器内容
    const md = sessionData.notes_md || '';
    document.getElementById('editor').innerHTML = md ? marked.parse(md)
        : '<p style="color:#A0A096;">暂无 AI 总结内容，可在此添加…</p>';

    // 教师提纲
    await loadOutline();

    // 资料文件
    await loadMaterials();

    // 聊天记录
    renderChat();

    // 绑定自动保存
    const editor = document.getElementById('editor');
    editor.addEventListener('input', scheduleSave);
}

// ---- 教师提纲 ----
async function loadOutline() {
    // 提纲存在 outlines 表，这里通过 ai_analysis 兜底；若有专门接口可替换
    const box = document.getElementById('outlineBox');
    if (sessionData.outline_text) {
        box.textContent = sessionData.outline_text;
    } else {
        box.textContent = '暂无提纲';
    }
}

// ---- 资料预览 ----
async function loadMaterials() {
    const res = await fetch(`/api/session/${sessionId}/materials`);
    const data = await res.json();
    materials = data.materials || [];

    const tabs = document.getElementById('fileTabs');
    if (materials.length === 0) {
        tabs.innerHTML = '';
        document.getElementById('previewArea').innerHTML =
            '<div class="preview-empty"><div class="ico">📂</div><div>该次整理没有原始文件</div></div>';
        return;
    }
    tabs.innerHTML = materials.map((m, i) =>
        `<div class="file-tab ${i === 0 ? 'active' : ''}" data-i="${i}" onclick="selectFile(${i})">${matIcon(m.kind)} ${escapeHtml(m.name)}</div>`
    ).join('');
    selectFile(0);
}

function selectFile(i) {
    document.querySelectorAll('.file-tab').forEach(t => t.classList.toggle('active', +t.dataset.i === i));
    const m = materials[i];
    const area = document.getElementById('previewArea');
    const kind = m.kind;

    if (kind === 'image') {
        area.innerHTML = `<img src="${m.url}" alt="${escapeHtml(m.name)}">`;
    } else if (kind === 'audio') {
        area.innerHTML = `<div class="preview-empty"><div class="ico">🎤</div><div>${escapeHtml(m.name)}</div></div>
            <audio controls src="${m.url}"></audio>`;
    } else if (kind === 'pdf') {
        area.innerHTML = `<iframe src="${m.url}"></iframe>`;
    } else if (kind === 'text') {
        area.innerHTML = `<iframe src="${m.url}"></iframe>`;
    } else {
        // PPT / Word：浏览器无法直接渲染，提供下载/新窗口打开
        area.innerHTML = `<div class="preview-empty">
            <div class="ico">${matIcon(kind)}</div>
            <div>${escapeHtml(m.name)}</div>
            <div class="preview-note">该格式无法在线预览</div>
            <a class="back-btn" style="margin-top:1rem; display:inline-block;" href="${m.url}" target="_blank">下载 / 打开原文件</a>
        </div>`;
    }
}

// ---- 编辑器格式化 ----
function exec(cmd) { document.execCommand(cmd, false, null); scheduleSave(); }
function hl(color) {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const span = document.createElement('span');
    span.className = 'hl-' + color;
    try { span.appendChild(sel.getRangeAt(0).extractContents()); sel.getRangeAt(0).insertNode(span); scheduleSave(); }
    catch (e) { console.error(e); }
}
function addNote() {
    const text = prompt('输入批注内容：');
    if (!text) return;
    const div = document.createElement('div');
    div.className = 'inline-note';
    div.textContent = '📝 ' + text;
    const sel = window.getSelection();
    if (sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.collapse(false);
        range.insertNode(div);
    } else {
        document.getElementById('editor').appendChild(div);
    }
    scheduleSave();
}

// ---- 自动保存 ----
function scheduleSave() {
    const status = document.getElementById('saveStatus');
    status.textContent = '编辑中…';
    status.className = 'save-status saving';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNotes, 1200);
}

async function saveNotes() {
    const status = document.getElementById('saveStatus');
    status.textContent = '保存中…';
    status.className = 'save-status saving';
    const md = tdService.turndown(document.getElementById('editor').innerHTML);
    try {
        await fetch(`/api/session/${sessionId}/notes`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes_md: md }),
        });
        status.textContent = '✓ 已保存';
        status.className = 'save-status saved';
    } catch (e) {
        status.textContent = '保存失败';
        status.className = 'save-status';
    }
}

// ---- AI 聊天 ----
function chatKey() { return `chat_${sessionData.title}`; }
function getChat() { try { return JSON.parse(localStorage.getItem(chatKey()) || '[]'); } catch { return []; } }
function saveChat(log) { localStorage.setItem(chatKey(), JSON.stringify(log)); }

function renderChat() {
    const log = getChat();
    const box = document.getElementById('chatLog');
    box.innerHTML = log.map(m => `<div class="chat-msg ${m.type}">${escapeHtml(m.content)}</div>`).join('');
    box.scrollTop = box.scrollHeight;
}

function addChat(type, content) {
    const log = getChat();
    log.push({ type, content });
    saveChat(log);
    renderChat();
}

function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    addChat('user', msg);
    input.value = '';
    setTimeout(() => addChat('ai', aiReply(msg)), 400);
}

function quick(action) {
    addChat('user', action);
    setTimeout(() => addChat('ai', aiReply(action)), 400);
}

function aiReply(msg) {
    const m = msg.toLowerCase();
    if (m.includes('重点')) return '本节重点：\n1. 核心概念与定义\n2. 教师强调的考点\n3. 典型案例\n建议优先复习标红内容。';
    if (m.includes('考试') || m.includes('题')) return '【示例题目】\n一、名词解释\n二、简答题：请简述本节核心观点\n三、论述题';
    if (m.includes('精简')) return '可以选中要精简的段落，我会帮你压缩为要点式表达。';
    return '我已理解你的问题，建议结合左侧原始资料与中间总结一起复习。';
}

document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

// ---- 工具 ----
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
function matIcon(kind) {
    const s = (kind || '').toLowerCase();
    if (/audio/.test(s)) return '🎤';
    if (/pdf/.test(s)) return '📕';
    if (/ppt/.test(s)) return '📊';
    if (/word/.test(s)) return '📄';
    if (/image/.test(s)) return '🖼️';
    if (/text/.test(s)) return '📝';
    return '📄';
}

init();
