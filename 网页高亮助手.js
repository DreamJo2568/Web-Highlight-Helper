// ==UserScript==
// @name         网页高亮助手 
// @name:en      Web Highlight Helper
// @namespace    https://greasyfork.org/zh-CN/users/1418167-dreamjo2568
// @version      V1.0
// @description  自动高亮网页中的关键词，提升阅读效率。
// @description:en  Automatically highlight keywords on webpages to improve reading efficiency.
// @author       DreamJo2568
// @match        *://*/*
// @license      MIT
// @grant        none
// @run-at       document-end
// ==/UserScript==


(function() {
    'use strict';

    // ================= 配置与常量 =================
    // 存储键名更新
    const KEY = 'web_highlight_helper_session';
    
    // 默认设置：无色，不加粗，背景模式
    const DEF = { color: 'none', bold: false, italic: false, underline: false, mode: 'bg' };
    const COLORS = ['#FF4D4F', '#40A9FF', '#73D13D', '#FFC53D', '#9254DE', '#F759AB', '#000000', '#FFFFFF', 'none'];
    
    // 使用 sessionStorage (关闭页面即清除数据，如需永久保存请改为 localStorage)
    const STORAGE = sessionStorage; 

    // 图标库 (SVG)
    const ICONS = {
        pen: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
        close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
        trash: '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
        reset: '<svg viewBox="0 0 24 24"><path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/></svg>',
        text: '<svg viewBox="0 0 24 24"><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-size="18" font-weight="900" fill="currentColor" style="font-family:sans-serif;">文</text></svg>',
        bg: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/></svg>'
    };

    // ================= 状态管理 =================
    let state = {
        data: {},
        selText: '',
        curr: { ...DEF },
        rect: null,
        busy: false
    };

    // ================= 工具函数 =================
    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);
    
    // 阻止事件冒泡，防止与其他插件冲突
    const kill = e => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.target.tagName !== 'INPUT') e.preventDefault();
    };

    const on = (el, fn) => {
        if (!el) return;
        ['pointerdown', 'mousedown'].forEach(ev => el.addEventListener(ev, e => {
            if (e.button !== 0 && e.button !== undefined) return;
            kill(e);
            fn(e);
        }));
    };

    // 数据读写
    const load = () => {
        try {
            const raw = STORAGE.getItem(KEY);
            if (raw) state.data = JSON.parse(raw);
        } catch(e) {}
    };
    const save = () => {
        STORAGE.setItem(KEY, JSON.stringify(state.data));
        renderLoop();
    };

    // ================= 样式注入 =================
    const style = document.createElement('style');
    style.innerHTML = `
        .gm-font { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .gm-hl { border-radius: 3px; padding: 0 1px; display: inline !important; transition: background 0.2s, color 0.2s; }
        @keyframes gm-in { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        
        #gm-trig {
            position: fixed; z-index: 2147483647; width: 28px; height: 28px; border-radius: 50%;
            background: #222; color: #fff; box-shadow: 0 3px 10px rgba(0,0,0,0.25);
            display: none; align-items: center; justify-content: center;
            animation: gm-in 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            transition: transform 0.1s, background 0.2s; border: 1.5px solid #fff;
        }
        #gm-trig:hover { transform: scale(1.15); background: #000; }
        #gm-trig svg { width: 14px; height: 14px; fill: white; }

        #gm-menu {
            position: fixed; z-index: 2147483647; background: #fff; border-radius: 8px;
            padding: 10px; width: 220px; display: none; flex-direction: column; gap: 8px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.1);
            user-select: none; animation: gm-in 0.15s ease-out;
        }
        .gm-hd { display: flex; justify-content: space-between; padding-bottom: 4px; border-bottom: 1px solid #f0f0f0; }
        .gm-tit { font-size: 12px; font-weight: 600; color: #333; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gm-cls { cursor: pointer; color: #aaa; padding: 2px; } .gm-cls:hover { color: #333; background: #f5f5f5; border-radius: 4px; }
        
        .gm-grid { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; padding: 2px 0; }
        .gm-c { width: 20px; height: 20px; border-radius: 50%; cursor: pointer; transition: transform 0.1s; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15); position: relative; }
        .gm-c:hover { transform: scale(1.2); z-index: 2; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.3); }
        .gm-c.sel { transform: scale(1.1); box-shadow: inset 0 0 0 1px rgba(0,0,0,0.5), 0 0 0 2px #fff, 0 0 0 3px #333; }
        .gm-c[data-c="none"] { background: repeating-linear-gradient(45deg, #ddd 0, #ddd 25%, #fff 0, #fff 50%) 0 0/8px 8px; }

        .gm-row { display: flex; gap: 6px; align-items: center; }
        .gm-grp { display: flex; background: #f2f2f2; border-radius: 4px; padding: 2px; }
        .gm-s { width: 24px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; cursor: pointer; color: #666; border-radius: 3px; }
        .gm-s.act { background: #fff; color: #000; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        .gm-inp { flex: 1; display: flex; align-items: center; background: #f9f9f9; border: 1px solid #eee; border-radius: 4px; height: 26px; padding: 0 4px; }
        #gm-pick { width: 16px; height: 16px; border: none; padding: 0; background: none; cursor: pointer; }
        #gm-hex { border: none; background: none; width: 100%; font-family: monospace; font-size: 10px; color: #555; text-align: center; outline: none; text-transform: uppercase; }

        .gm-ft { display: flex; justify-content: space-between; margin-top: 2px; padding-top: 6px; border-top: 1px dashed #eee; }
        .gm-btn { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px; cursor: pointer; color: #777; position: relative; }
        .gm-btn:hover { background: #f0f0f0; color: #000; }
        .gm-btn svg { width: 16px; height: 16px; fill: currentColor; }
        .gm-save { background: #222; color: #fff; padding: 0 10px; font-size: 11px; width: auto; font-weight: 500; } .gm-save:hover { background: #000; color: #fff; }
        .gm-tm { color: #1890ff; } .gm-bm { color: #52c41a; }
        
        .gm-tip::after {
            content: attr(data-tip); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.8); color: white; padding: 3px 6px; font-size: 10px; border-radius: 3px;
            white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s; margin-bottom: 6px;
        }
        .gm-tip:hover::after { opacity: 1; }
    `;
    document.head.appendChild(style);

    // ================= UI 构建 =================
    const trigger = document.createElement('div');
    trigger.id = 'gm-trig';
    trigger.innerHTML = ICONS.pen;
    document.body.appendChild(trigger);

    const menu = document.createElement('div');
    menu.id = 'gm-menu';
    menu.className = 'gm-font';
    menu.innerHTML = `
        <div class="gm-hd">
            <div class="gm-tit" id="gm-tit"></div>
            <div class="gm-cls">${ICONS.close}</div>
        </div>
        <div class="gm-grid">
            ${COLORS.map(c => `<div class="gm-c" style="background:${c}" data-c="${c}"></div>`).join('')}
        </div>
        <div class="gm-row">
            <div class="gm-grp">
                <div class="gm-s" data-s="bold">B</div>
                <div class="gm-s" data-s="italic" style="font-style:italic">I</div>
                <div class="gm-s" data-s="underline" style="text-decoration:underline">U</div>
            </div>
            <div class="gm-inp">
                <input type="color" id="gm-pick">
                <input type="text" id="gm-hex" placeholder="NONE">
            </div>
        </div>
        <div class="gm-ft">
            <div class="gm-btn gm-tip" id="gm-mode" data-tip="切换模式">
                <span id="gm-m-icon" class="gm-bm">${ICONS.bg}</span>
            </div>
            <div style="display:flex; gap:4px;">
                <div class="gm-btn gm-save" id="gm-save">保存</div>
                <div class="gm-btn gm-tip" id="gm-del" data-tip="删除">${ICONS.trash}</div>
                <div class="gm-btn gm-tip" id="gm-rst" data-tip="清空">${ICONS.reset}</div>
            </div>
        </div>
    `;
    document.body.appendChild(menu);

    // ================= 交互逻辑 =================
    const onSelect = () => {
        const sel = window.getSelection();
        const txt = sel.toString().trim();
        if (txt && txt.length < 300) {
            state.selText = txt;
            try {
                const rect = sel.getRangeAt(0).getBoundingClientRect();
                if (rect.width === 0) return;
                state.rect = rect;
                
                let top = rect.bottom + 8, left = rect.left + rect.width / 2 - 14;
                if (top + 40 > window.innerHeight) top = rect.top - 45;
                if (left < 0) left = 0;

                trigger.style.top = `${top}px`; trigger.style.left = `${left}px`;
                trigger.style.display = 'flex'; menu.style.display = 'none';
            } catch (e) { trigger.style.display = 'none'; }
        } else {
            trigger.style.display = 'none'; menu.style.display = 'none';
        }
    };

    document.addEventListener('mouseup', (e) => {
        if (menu.contains(e.target) || trigger.contains(e.target)) return;
        setTimeout(onSelect, 50);
    }, true);

    const refresh = () => {
        $$('.gm-s').forEach(b => b.classList.toggle('act', state.curr[b.dataset.s]));
        $$('.gm-c').forEach(b => b.classList.toggle('sel', b.dataset.c === state.curr.color));
        $('#gm-hex').value = state.curr.color === 'none' ? '' : state.curr.color;
        if (state.curr.color.startsWith('#')) $('#gm-pick').value = state.curr.color;
        
        const icon = $('#gm-m-icon');
        const btn = $('#gm-mode');
        const isBg = state.curr.mode === 'bg';
        icon.innerHTML = isBg ? ICONS.bg : ICONS.text;
        icon.className = isBg ? 'gm-bm' : 'gm-tm';
        btn.setAttribute('data-tip', isBg ? '当前背景模式 (点击切换)' : '当前文字模式 (点击切换)');
    };

    on(trigger, () => {
        if (state.busy) return; state.busy = true;
        trigger.style.display = 'none';
        
        state.curr = state.data[state.selText] ? { ...DEF, ...state.data[state.selText] } : { ...DEF };
        $('#gm-tit').textContent = state.selText;
        refresh();

        if (state.rect) {
            let top = state.rect.bottom + 8, left = state.rect.left;
            if (top + 180 > window.innerHeight) top = state.rect.top - 190;
            if (left + 220 > window.innerWidth) left = window.innerWidth - 230;
            if (left < 10) left = 10;
            menu.style.top = `${top}px`; menu.style.left = `${left}px`;
            menu.style.display = 'flex';
        }
        setTimeout(() => state.busy = false, 100);
    });

    $$('.gm-s').forEach(b => on(b, () => { state.curr[b.dataset.s] = !state.curr[b.dataset.s]; refresh(); }));
    $$('.gm-c').forEach(b => on(b, (e) => { state.curr.color = e.target.dataset.c; refresh(); }));
    on($('#gm-mode'), () => { state.curr.mode = state.curr.mode === 'bg' ? 'text' : 'bg'; refresh(); });
    
    const pick = $('#gm-pick'), hex = $('#gm-hex');
    pick.oninput = (e) => { state.curr.color = e.target.value; hex.value = e.target.value; refresh(); };
    hex.onchange = (e) => { 
        let v = e.target.value; 
        if(!v) v = 'none'; else if(v!=='none' && !v.startsWith('#')) v = '#'+v;
        state.curr.color = v; refresh(); 
    };
    [pick, hex].forEach(el => ['mousedown','click'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation())));

    on($('#gm-save'), () => { state.data[state.selText] = state.curr; save(); menu.style.display = 'none'; window.getSelection().removeAllRanges(); });
    on($('#gm-del'), () => { delete state.data[state.selText]; save(); menu.style.display = 'none'; });
    on($('#gm-rst'), () => { if(confirm('⚠️ 确定要清空数据吗？')) { state.data = {}; save(); location.reload(); } });
    on($('.gm-cls'), () => menu.style.display = 'none');

    ['mousedown', 'mouseup', 'click'].forEach(evt => menu.addEventListener(evt, kill));
    window.addEventListener('scroll', () => { menu.style.display = 'none'; trigger.style.display = 'none'; }, true);

    // ================= 渲染逻辑 =================
    const apply = (span, d) => {
        const c = (d.color && d.color !== 'none') ? d.color : 'transparent';
        if (d.mode === 'text') {
            span.style.color = (d.color && d.color !== 'none') ? d.color : ''; 
            span.style.backgroundColor = 'transparent';
        } else {
            span.style.backgroundColor = c;
            span.style.color = ''; 
        }
        span.style.fontWeight = d.bold ? 'bold' : '';
        span.style.fontStyle = d.italic ? 'italic' : '';
        span.style.textDecoration = d.underline ? 'underline' : '';
    };

    const renderLoop = () => {
        $$('.gm-hl').forEach(span => {
            let d = state.data[span.textContent];
            d ? apply(span, d) : span.replaceWith(document.createTextNode(span.textContent));
        });
        document.body.normalize();

        const names = Object.keys(state.data).filter(n => n.trim());
        if (!names.length) return;
        names.sort((a, b) => b.length - a.length);
        
        const pattern = new RegExp(`(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
        const skip = ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'BUTTON'];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const p = node.parentElement;
            if (!p || skip.includes(p.tagName) || p.closest('#gm-menu') || p.isContentEditable) continue;
            if (p.classList.contains('gm-hl')) continue;
            if (pattern.test(node.nodeValue)) nodes.push(node);
        }

        nodes.forEach(node => {
            if (!node.parentNode) return;
            const parts = node.nodeValue.split(pattern);
            if (parts.length <= 1) return;
            const frag = document.createDocumentFragment();
            parts.forEach(part => {
                if (state.data[part]) {
                    const span = document.createElement('span');
                    span.className = 'gm-hl';
                    span.textContent = part;
                    apply(span, state.data[part]);
                    frag.appendChild(span);
                } else {
                    frag.appendChild(document.createTextNode(part));
                }
            });
            node.parentNode.replaceChild(frag, node);
        });
    };

    load();
    renderLoop();
    setInterval(renderLoop, 2000);
    console.log('网页高亮助手 v1.0 已启动');

})();