// ===== 共享文档预览：尽量"所见即所得"，不退化为纯文字 =====
// 优先级：图片/音频/PDF/文本 直接展示；PPT/Word 先用后端 LibreOffice 转 PDF（视觉还原），
// 若后端无法转换，则对 .docx 用 docx-preview 在浏览器内渲染版式；其余给出下载入口。

function previewIcon(name, size) {
    return (typeof icon === 'function') ? icon(name, size) : '';
}

// container: DOM 元素；m: {name, kind, url, session_id}
function renderDocPreview(container, m) {
    const kind = m.kind;
    const rawUrl = m.url;
    const previewUrl = `/api/preview/${m.session_id}/${encodeURIComponent(m.name)}`;

    if (kind === 'image') {
        container.innerHTML = `<img src="${rawUrl}" alt="${escapeHtml(m.name)}">`;
        return;
    }
    if (kind === 'audio') {
        container.innerHTML = `<audio controls src="${rawUrl}"></audio>`;
        return;
    }
    if (kind === 'pdf' || kind === 'text') {
        container.innerHTML = `<iframe src="${rawUrl}"></iframe>`;
        return;
    }
    if (kind === 'ppt' || kind === 'word') {
        container.innerHTML = `<div class="preview-loading">${previewIcon('file',20)} 正在加载文档预览…</div>`;
        fetch(previewUrl).then(async (r) => {
            const ct = r.headers.get('content-type') || '';
            if (ct.includes('application/pdf')) {
                // LibreOffice 已转 PDF：版式还原，直接内嵌
                container.innerHTML = `<iframe src="${previewUrl}"></iframe>`;
                return;
            }
            // 后端无法转 PDF（未装 LibreOffice）→ 浏览器内尽量还原版式
            if (kind === 'word') {
                await renderDocxInBrowser(container, rawUrl, m);
            } else {
                renderUnavailable(container, m, '该 PPT 需要服务器安装 LibreOffice 才能还原版式预览');
            }
        }).catch(() => renderUnavailable(container, m, '预览加载失败'));
        return;
    }
    renderUnavailable(container, m, '该格式暂不支持在线预览');
}

// 用 docx-preview 在浏览器内渲染 Word 版式
async function renderDocxInBrowser(container, rawUrl, m) {
    try {
        if (!window.docx || !window.docx.renderAsync) {
            renderUnavailable(container, m, '正在加载渲染组件，请稍后重试');
            return;
        }
        const buf = await (await fetch(rawUrl)).arrayBuffer();
        container.innerHTML = '<div class="docx-host"></div>';
        await window.docx.renderAsync(buf, container.querySelector('.docx-host'), null, {
            className: 'docx', inWrapper: true, ignoreWidth: false, breakPages: true,
        });
    } catch (e) {
        renderUnavailable(container, m, '文档渲染失败：' + e.message);
    }
}

function renderUnavailable(container, m, msg) {
    container.innerHTML = `<div class="preview-loading">
        <div style="margin-bottom:0.8rem;">${previewIcon(kindIcon(m.kind), 40)}</div>
        <div>${escapeHtml(m.name)}</div>
        <div style="margin:0.6rem 0; color:#A0A096;">${escapeHtml(msg)}</div>
        <a class="back-btn" style="display:inline-block;" href="${m.url}" target="_blank">下载原文件</a>
    </div>`;
}
