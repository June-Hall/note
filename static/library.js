// ===== 课程库逻辑 =====

const COLORS = {
    blue:   '#4A90D9',
    green:  '#4CAF82',
    yellow: '#E5B53A',
    orange: '#E08A3C',
    red:    '#D9534F',
    purple: '#9B6FD0',
    gray:   '#6B6B66',
};

let courses = [];
let modalMode = 'create';   // 'create' | 'rename' | 'color'
let editingCourseId = null;
let selectedColor = 'blue';

// ---- 加载课程 ----
async function loadCourses() {
    try {
        const res = await fetch('/api/courses');
        const data = await res.json();
        courses = data.courses || [];
        renderGrid(courses);
    } catch (err) {
        console.error('加载课程失败:', err);
        renderGrid([]);
    }
}

// ---- 渲染卡片网格 ----
function renderGrid(list) {
    const area = document.getElementById('gridArea');

    if (!list || list.length === 0) {
        // 区分：完全没课程 vs 搜索无结果
        if (courses.length === 0) {
            area.innerHTML = `
                <div class="empty">
                    <div class="big-icon">${icon('book', 56)}</div>
                    <h2>还没有课程</h2>
                    <p>点击「新建课程」，开始整理你的第一门课程。</p>
                    <button class="btn-new with-ic" onclick="openCreateModal()">${icon('plus',16)} 创建课程</button>
                </div>`;
        } else {
            area.innerHTML = `
                <div class="empty">
                    <div class="big-icon">${icon('search', 56)}</div>
                    <h2>没有匹配的课程</h2>
                    <p>换个关键词试试吧。</p>
                </div>`;
        }
        return;
    }

    area.innerHTML = `<div class="grid">${list.map(cardHtml).join('')}</div>`;
}

function cardHtml(c) {
    const color = COLORS[c.color] || COLORS.blue;
    const updated = formatDate(c.updated_at);
    return `
        <div class="card" onclick="openCourse(${c.id})">
            <div class="card-bar" style="background:${color}"></div>
            <div class="card-actions" onclick="event.stopPropagation()">
                <div class="act-btn" title="重命名" onclick="openRenameModal(${c.id})">${icon('edit',15)}</div>
                <div class="act-btn" title="更换颜色" onclick="openColorModal(${c.id})">${icon('palette',15)}</div>
                <div class="act-btn" title="删除课程" onclick="confirmDelete(${c.id})">${icon('trash',15)}</div>
            </div>
            <div class="card-body">
                <div class="card-title">
                    <span class="card-dot" style="background:${color}"></span>
                    ${escapeHtml(c.name)}
                </div>
                <div class="card-stats">
                    <span class="stat with-ic">${icon('star',14)} 重点：<span class="num">${c.key_points_count || 0}</span></span>
                    <span class="stat with-ic">${icon('fileText',14)} 笔记：<span class="num">${c.notes_count || 0}</span></span>
                </div>
                <div class="card-updated">更新于：${updated}</div>
            </div>
        </div>`;
}

function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts.replace(' ', 'T'));
    if (isNaN(d)) return ts;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

// ---- 进入课程主页 ----
function openCourse(id) {
    window.location.href = `/course/${id}`;
}

// ---- 搜索 ----
document.getElementById('searchInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = q ? courses.filter(c => c.name.toLowerCase().includes(q)) : courses;
    renderGrid(filtered);
});

// ---- 颜色选择器渲染 ----
function renderColorPicker() {
    const picker = document.getElementById('colorPicker');
    picker.innerHTML = Object.entries(COLORS).map(([key, val]) => `
        <div class="color-swatch ${key === selectedColor ? 'selected' : ''}"
             style="background:${val}" data-color="${key}"
             onclick="selectColor('${key}')"></div>
    `).join('');
}

function selectColor(key) {
    selectedColor = key;
    document.querySelectorAll('.color-swatch').forEach(sw => {
        sw.classList.toggle('selected', sw.dataset.color === key);
    });
}

// ---- 弹窗控制 ----
function openCreateModal() {
    modalMode = 'create';
    editingCourseId = null;
    selectedColor = 'blue';
    document.getElementById('modalTitle').textContent = '新建课程';
    document.getElementById('modalConfirm').textContent = '创建';
    document.getElementById('courseName').value = '';
    document.getElementById('courseName').style.display = 'block';
    document.querySelector('.modal label').style.display = 'block';
    renderColorPicker();
    document.getElementById('courseModal').classList.add('active');
    document.getElementById('courseName').focus();
}

function openRenameModal(id) {
    const c = courses.find(x => x.id === id);
    if (!c) return;
    modalMode = 'rename';
    editingCourseId = id;
    document.getElementById('modalTitle').textContent = '重命名课程';
    document.getElementById('modalConfirm').textContent = '保存';
    document.getElementById('courseName').value = c.name;
    selectedColor = c.color || 'blue';
    renderColorPicker();
    document.getElementById('courseModal').classList.add('active');
    document.getElementById('courseName').focus();
}

function openColorModal(id) {
    const c = courses.find(x => x.id === id);
    if (!c) return;
    modalMode = 'color';
    editingCourseId = id;
    selectedColor = c.color || 'blue';
    document.getElementById('modalTitle').textContent = '更换课程颜色';
    document.getElementById('modalConfirm').textContent = '保存';
    document.getElementById('courseName').value = c.name;
    renderColorPicker();
    document.getElementById('courseModal').classList.add('active');
}

function closeModal() {
    document.getElementById('courseModal').classList.remove('active');
}

// ---- 确认操作 ----
document.getElementById('modalConfirm').addEventListener('click', async () => {
    const name = document.getElementById('courseName').value.trim();

    if (modalMode === 'create') {
        if (!name) { alert('请输入课程名称'); return; }
        const res = await fetch('/api/courses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color: selectedColor }),
        });
        if (res.status === 409) {
            alert('该课程已存在');
            return;
        }
    } else if (modalMode === 'rename') {
        if (!name) { alert('请输入课程名称'); return; }
        await fetch(`/api/courses/id/${editingCourseId}/rename`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        // 颜色也一并更新（重命名弹窗里也提供了颜色选择）
        await fetch(`/api/courses/id/${editingCourseId}/color`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color: selectedColor }),
        });
    } else if (modalMode === 'color') {
        await fetch(`/api/courses/id/${editingCourseId}/color`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color: selectedColor }),
        });
    }

    closeModal();
    loadCourses();
});

// ---- 删除课程（二次确认）----
async function confirmDelete(id) {
    const c = courses.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`确定删除课程「${c.name}」吗？\n该课程下的所有笔记记录都会被删除，且无法恢复。`)) {
        return;
    }
    await fetch(`/api/courses/id/${id}`, { method: 'DELETE' });
    loadCourses();
}

// 点击遮罩关闭
document.getElementById('courseModal').addEventListener('click', (e) => {
    if (e.target.id === 'courseModal') closeModal();
});

// 初始化
loadCourses();
