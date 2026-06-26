// ===== 资料编辑页逻辑 =====

const sessionId = location.pathname.split('/').pop();
let sessionData = null;
let materials = [];
let currentMindmapMd = '';
let mmInstance = null;
const tdService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
let saveTimer = null;

async function init() {
    const res = await fetch(`/api/session/${sessionId}/detail`);
    if (!res.ok) { document.getElementById('editor').innerHTML = '<p>会话不存在</p>'; return; }
    sessionData = await res.json();

    document.getElementById('backToCourse').href = `/course/${sessionData.course_id}`;

    const md = sessionData.notes_md || '';
    const editor = document.getElementById('editor');
    editor.innerHTML = md ? marked.parse(md)
        : '<p style="color:#A0A096;">暂无 AI 总结内容，可在此添加…</p>';
    highlightExamKeys(editor);

    // 思维导图
    if (sessionData.mindmap_md) {
        currentMindmapMd = sessionData.mindmap_md;
        document.getElementById('mindmapBlock').style.display = 'block';
        renderMindmap(currentMindmapMd);
    }

    await loadMaterials();
    await loadModels();
    renderChat();
    initFontSize();
    initHistorySnapshot();

    editor.addEventListener('input', () => { pushHistory(); scheduleSave(); });
}

// 高亮「考试重点」引用块
function highlightExamKeys(root) {
    if (!root) return;
    root.querySelectorAll('blockquote').forEach(bq => {
        if (/【考试重点】/.test(bq.textContent)) bq.classList.add('exam-key');
    });
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
            `<div class="preview-empty"><div class="ico" data-icon="folder" data-icon-size="40"></div><div>该次整理没有原始文件</div></div>`;
        renderDataIcons(document.getElementById('previewArea'));
        return;
    }
    tabs.innerHTML = materials.map((m, i) =>
        `<div class="file-tab with-ic ${i === 0 ? 'active' : ''}" data-i="${i}" onclick="selectFile(${i})">${icon(kindIcon(m.kind), 14)} ${escapeHtml(m.name)}</div>`
    ).join('');
    selectFile(0);
}

function selectFile(i) {
    document.querySelectorAll('.file-tab').forEach(t => t.classList.toggle('active', +t.dataset.i === i));
    const m = materials[i];
    renderDocPreview(document.getElementById('previewArea'), m);
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
    div.textContent = '批注：' + text;
    const sel = window.getSelection();
    if (sel.rangeCount) { const range = sel.getRangeAt(0); range.collapse(false); range.insertNode(div); }
    else { document.getElementById('editor').appendChild(div); }
    scheduleSave();
}

// ---- 自动保存 ----
function currentMarkdown() { return tdService.turndown(document.getElementById('editor').innerHTML); }
function scheduleSave() {
    const status = document.getElementById('saveStatus');
    status.textContent = '编辑中…'; status.className = 'save-status saving';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNotes, 1200);
}
async function saveNotes() {
    const status = document.getElementById('saveStatus');
    status.textContent = '保存中…'; status.className = 'save-status saving';
    try {
        await fetch(`/api/session/${sessionId}/notes`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes_md: currentMarkdown() }),
        });
        status.textContent = '✓ 已保存'; status.className = 'save-status saved';
    } catch (e) { status.textContent = '保存失败'; status.className = 'save-status'; }
}

// ---- 导出 Word ----
async function exportWord() {
    try {
        const res = await fetch('/api/export/docx', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes_md: currentMarkdown(), subject: sessionData.title || '课程笔记' }),
        });
        if (!res.ok) throw new Error('导出失败');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${sessionData.title || '课程笔记'}.docx`;
        a.click();
        URL.revokeObjectURL(a.href);
    } catch (e) { alert('导出 Word 失败：' + e.message); }
}

// ---- 工具 ----
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

// ===== 撤回 / 恢复撤回（编辑器内容快照栈）=====
let histStack = [];     // 内容快照（innerHTML）
let histIndex = -1;     // 当前指针
let histTimer = null;
let restoring = false;

function initHistorySnapshot() {
    const editor = document.getElementById('editor');
    histStack = [editor.innerHTML];
    histIndex = 0;
}
function pushHistory() {
    if (restoring) return;
    clearTimeout(histTimer);
    histTimer = setTimeout(() => {
        const html = document.getElementById('editor').innerHTML;
        if (histStack[histIndex] === html) return;
        // 丢弃 redo 分支
        histStack = histStack.slice(0, histIndex + 1);
        histStack.push(html);
        if (histStack.length > 100) histStack.shift();
        histIndex = histStack.length - 1;
    }, 400);
}
function doUndo() {
    clearTimeout(histTimer);
    if (histIndex <= 0) return;
    histIndex--;
    applyHistory();
}
function doRedo() {
    clearTimeout(histTimer);
    if (histIndex >= histStack.length - 1) return;
    histIndex++;
    applyHistory();
}
function applyHistory() {
    restoring = true;
    const editor = document.getElementById('editor');
    editor.innerHTML = histStack[histIndex];
    highlightExamKeys(editor);
    restoring = false;
    scheduleSave();
}
// 快捷键 Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); }
});

// ===== 字体大小调节 =====
const FONT_KEY = 'editor_font_size';
function initFontSize() {
    const saved = parseInt(localStorage.getItem(FONT_KEY) || '15', 10);
    setFont(saved);
}
function changeFont(delta) {
    const cur = parseInt(localStorage.getItem(FONT_KEY) || '15', 10);
    setFont(Math.max(12, Math.min(28, cur + delta)));
}
function setFont(px) {
    document.getElementById('editor').style.fontSize = px + 'px';
    const el = document.getElementById('fsVal');
    if (el) el.textContent = px + 'px';
    localStorage.setItem(FONT_KEY, String(px));
}

init();

// ===== AI 对话（真实接入 ModelScope） =====
let chatHistory = [];   // [{role:'user'|'assistant', content}]
let availableModels = [];

async function loadModels() {
    try {
        const res = await fetch('/api/models');
        const data = await res.json();
        availableModels = data.models || [];
        const sel = document.getElementById('modelSelect');
        sel.innerHTML = availableModels.map(m =>
            `<option value="${m.id}" ${m.id === data.default ? 'selected' : ''}>${m.label}</option>`
        ).join('');
    } catch (e) {
        document.getElementById('modelSelect').innerHTML = '<option>默认模型</option>';
    }
}

function chatKey() { return `chat_session_${sessionId}`; }
function renderChat() {
    const box = document.getElementById('chatLog');
    if (chatHistory.length === 0) {
        try { chatHistory = JSON.parse(localStorage.getItem(chatKey()) || '[]'); } catch { chatHistory = []; }
    }
    if (chatHistory.length === 0) {
        box.innerHTML = `<div class="chat-msg ai">你好，我是 AI 学习助手。可以问我关于这门课程的任何问题 😊</div>`;
        return;
    }
    box.innerHTML = chatHistory.map(m =>
        `<div class="chat-msg ${m.role === 'user' ? 'user' : 'ai'}">${m.role === 'assistant' ? marked.parse(m.content) : escapeHtml(m.content)}</div>`
    ).join('');
    box.scrollTop = box.scrollHeight;
}

async function sendChat() {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSend');
    const msg = input.value.trim();
    if (!msg) return;

    chatHistory.push({ role: 'user', content: msg });
    input.value = '';
    renderChat();

    // 思考中占位
    const box = document.getElementById('chatLog');
    const thinking = document.createElement('div');
    thinking.className = 'chat-msg ai thinking';
    thinking.textContent = 'AI 正在思考…';
    box.appendChild(thinking);
    box.scrollTop = box.scrollHeight;
    sendBtn.disabled = true;

    try {
        const model = document.getElementById('modelSelect').value;
        const res = await fetch('/api/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: chatHistory,
                model,
                notes_context: currentMarkdown(),
            }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        chatHistory.push({ role: 'assistant', content: data.reply });
    } catch (e) {
        chatHistory.push({ role: 'assistant', content: '出错了：' + e.message });
    } finally {
        sendBtn.disabled = false;
        localStorage.setItem(chatKey(), JSON.stringify(chatHistory));
        renderChat();
    }
}

document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

// ===== 思维导图 =====
function renderMindmap(md) {
    if (!window.markmap || !md) return;
    try {
        const { Markmap, Transformer } = window.markmap;
        const transformer = new Transformer();
        const { root } = transformer.transform(md);
        const svg = document.getElementById('mindmap-svg');
        svg.innerHTML = '';
        mmInstance = Markmap.create('#mindmap-svg', null, root);
        setTimeout(() => { if (mmInstance) mmInstance.fit(); }, 100);
    } catch (e) { console.error('思维导图渲染失败:', e); }
}

function exportMindmap(format) {
    const svg = document.getElementById('mindmap-svg');
    if (!svg || !currentMindmapMd) { alert('暂无思维导图可导出'); return; }
    const clone = svg.cloneNode(true);
    const bbox = svg.getBoundingClientRect();
    const w = Math.max(bbox.width, 800), h = Math.max(bbox.height, 600);
    clone.setAttribute('width', w); clone.setAttribute('height', h);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', w); rect.setAttribute('height', h);
    rect.setAttribute('fill', format === 'png' ? 'transparent' : '#FFFFFF');
    clone.insertBefore(rect, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = w * scale; canvas.height = h * scale;
        const ctx = canvas.getContext('2d');
        if (format !== 'png') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        const name = (sessionData && sessionData.title) || '思维导图';
        if (format === 'pdf') {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: w > h ? 'l' : 'p', unit: 'px', format: [w, h] });
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, w, h);
            pdf.save(`${name}-思维导图.pdf`);
        } else {
            const a = document.createElement('a');
            a.download = `${name}-思维导图.${format}`;
            a.href = canvas.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', 0.95);
            a.click();
        }
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert('导出失败，请重试'); };
    img.src = url;
}

// ===== 三栏宽度拖拽调节 =====
function setupGutter(gutterId, leftSel, rightSel) {
    const gutter = document.getElementById(gutterId);
    const layout = document.getElementById('layout');
    let dragging = false;
    gutter.addEventListener('mousedown', () => {
        dragging = true; gutter.classList.add('dragging');
        document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const left = document.querySelector(leftSel);
        const rect = layout.getBoundingClientRect();
        if (gutterId === 'gutter1') {
            // 调节左栏宽度
            let w = e.clientX - left.getBoundingClientRect().left;
            w = Math.max(220, Math.min(w, rect.width - 500));
            left.style.flex = `0 0 ${w}px`;
        } else {
            // 调节右栏宽度
            let w = rect.right - e.clientX;
            w = Math.max(260, Math.min(w, rect.width - 500));
            document.querySelector(rightSel).style.flex = `0 0 ${w}px`;
        }
    });
    document.addEventListener('mouseup', () => {
        if (dragging) { dragging = false; gutter.classList.remove('dragging'); document.body.style.cursor = ''; document.body.style.userSelect = ''; }
    });
}
setupGutter('gutter1', '#colLeft', '#colRight');
setupGutter('gutter2', '#colLeft', '#colRight');
