#!/usr/bin/env node
/**
 * 生成审核网页（视频版本）
 *
 * 用法: node generate_review.js <subtitles_words.json> [auto_selected.json] [video_file]
 * 输出: review.html, video.mp4（符号链接到当前目录）
 */

const fs = require('fs');
const path = require('path');

const subtitlesFile = process.argv[2] || 'subtitles_words.json';
const autoSelectedFile = process.argv[3] || 'auto_selected.json';
const videoFile = process.argv[4] || 'video.mp4';

// 创建视频文件的符号链接到当前目录（避免复制大文件）
const videoBaseName = 'video.mp4';
if (videoFile !== videoBaseName && fs.existsSync(videoFile)) {
  const absVideoPath = path.resolve(videoFile);
  if (fs.existsSync(videoBaseName)) fs.unlinkSync(videoBaseName);
  fs.symlinkSync(absVideoPath, videoBaseName);
  console.log('📁 已链接视频到当前目录:', videoBaseName, '→', absVideoPath);
}

if (!fs.existsSync(subtitlesFile)) {
  console.error('❌ 找不到字幕文件:', subtitlesFile);
  process.exit(1);
}

const words = JSON.parse(fs.readFileSync(subtitlesFile, 'utf8'));
let autoSelected = [];

if (fs.existsSync(autoSelectedFile)) {
  autoSelected = JSON.parse(fs.readFileSync(autoSelectedFile, 'utf8'));
  console.log('AI 预选:', autoSelected.length, '个元素');
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>审核稿</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0;
      padding: 0;
      background: #1a1a1a;
      color: #e0e0e0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    h1 { text-align: center; margin: 10px 0; font-size: 20px; }

    .toolbar {
      background: #1a1a1a;
      padding: 10px 20px;
      border-bottom: 1px solid #333;
      flex-shrink: 0;
    }

    .buttons {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    button {
      padding: 8px 16px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover { background: #45a049; }
    button.danger { background: #f44336; }
    button.danger:hover { background: #da190b; }

    select {
      padding: 8px 12px;
      background: #333;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
    }
    select:hover { background: #444; }

    #time {
      font-family: monospace;
      font-size: 16px;
      color: #888;
    }

    .main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .left-panel {
      width: 420px;
      flex-shrink: 0;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-right: 1px solid #333;
    }

    #player {
      width: 100%;
      border-radius: 4px;
      background: #000;
    }

    .help {
      font-size: 12px;
      color: #999;
      background: #252525;
      padding: 10px;
      border-radius: 6px;
      line-height: 1.6;
    }
    .help b { color: #fff; }
    .help div { margin: 2px 0; }

    .right-panel {
      flex: 1;
      overflow-y: auto;
      padding: 15px 20px;
    }

    .content {
      line-height: 2.5;
      user-select: none;
      -webkit-user-select: none;
    }

    .word {
      display: inline-block;
      padding: 4px 2px;
      margin: 2px;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.15s;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }

    .word:hover { background: #333; }
    .word.current { background: #2196F3; color: white; }
    .word.selected { background: #f44336; color: white; text-decoration: line-through; }
    .word.ai-selected { background: #ff9800; color: white; }
    .word.ai-selected.selected { background: #f44336; }

    .gap {
      display: inline-block;
      background: #333;
      color: #888;
      padding: 4px 8px;
      margin: 2px;
      border-radius: 3px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }
    .gap:hover { background: #444; }
    .gap.selected { background: #f44336; color: white; }
    .gap.ai-selected { background: #ff9800; color: white; }
    .gap.ai-selected.selected { background: #f44336; }
    .content.dragging .word,
    .content.dragging .gap {
      transition: none;
    }

    .stats {
      padding: 10px;
      background: #252525;
      border-radius: 4px;
      font-size: 14px;
    }

    /* Loading 遮罩 */
    .loading-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.85);
      z-index: 9999;
      justify-content: center;
      align-items: center;
      flex-direction: column;
    }
    .loading-overlay.show { display: flex; }
    .loading-spinner {
      width: 60px;
      height: 60px;
      border: 4px solid #333;
      border-top-color: #9C27B0;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text {
      margin-top: 20px;
      font-size: 18px;
      color: #fff;
    }
    .loading-progress-container {
      margin-top: 20px;
      width: 300px;
      height: 8px;
      background: #333;
      border-radius: 4px;
      overflow: hidden;
    }
    .loading-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #9C27B0, #E91E63);
      width: 0%;
      transition: width 0.3s ease;
    }
    .loading-time {
      margin-top: 15px;
      font-size: 14px;
      color: #888;
    }
    .loading-estimate {
      margin-top: 8px;
      font-size: 13px;
      color: #666;
    }
  </style>
</head>
<body>
  <!-- Loading 遮罩 -->
  <div class="loading-overlay" id="loadingOverlay">
    <div class="loading-spinner"></div>
    <div class="loading-text">🎬 正在剪辑中...</div>
    <div class="loading-progress-container">
      <div class="loading-progress-bar" id="loadingProgress"></div>
    </div>
    <div class="loading-time" id="loadingTime">已等待 0 秒</div>
    <div class="loading-estimate" id="loadingEstimate">预估剩余: 计算中...</div>
  </div>

  <div class="toolbar">
    <div class="buttons">
      <button onclick="togglePlay()">▶️ 播放/暂停</button>
      <select id="speed" onchange="player.playbackRate=parseFloat(this.value)">
        <option value="0.5">0.5x</option>
        <option value="0.75">0.75x</option>
        <option value="1" selected>1x</option>
        <option value="1.25">1.25x</option>
        <option value="1.5">1.5x</option>
        <option value="2">2x</option>
      </select>
      <button onclick="copyDeleteList()">📋 复制删除列表</button>
      <button onclick="executeCut()" style="background:#9C27B0">🎬 执行剪辑</button>
      <button class="danger" onclick="clearAll()">🗑️ 清空选择</button>
      <span id="time">00:00 / 00:00</span>
    </div>
  </div>

  <div class="main">
    <div class="left-panel">
      <video id="player" src="${videoBaseName}" preload="auto"></video>
      <div class="stats" id="stats"></div>
      <div class="help">
        <div><b>🖱️ 鼠标：</b>单击跳转 | 双击选中 | Shift+拖动批量</div>
        <div><b>⌨️ 键盘：</b>空格播放 | ←→跳1s | Shift+←→跳5s</div>
        <div><b>🎨 颜色：</b><span style="color:#ff9800">橙色</span>AI预选 | <span style="color:#f44336">红色</span>确认删除</div>
      </div>
    </div>
    <div class="right-panel">
      <div class="content" id="content"></div>
    </div>
  </div>

  <script>
    const words = ${JSON.stringify(words)};
    const autoSelected = new Set(${JSON.stringify(autoSelected)});
    const selected = new Set(autoSelected);

    const player = document.getElementById('player');
    const timeDisplay = document.getElementById('time');

    function togglePlay() {
      if (player.paused) player.play();
      else player.pause();
    }
    const content = document.getElementById('content');
    const statsDiv = document.getElementById('stats');
    let elements = [];
    let isSelecting = false;
    let selectStart = -1;
    let selectMode = 'add'; // 'add' or 'remove'
    let isShiftPressed = false;
    let suppressNextClick = false;

    // 格式化时间 (用于播放器显示)
    function formatTime(sec) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return \`\${m.toString().padStart(2, '0')}:\${s.toString().padStart(2, '0')}\`;
    }

    // 格式化时长 (用于剪辑结果显示，带秒数)
    function formatDuration(sec) {
      const totalSec = parseFloat(sec);
      const m = Math.floor(totalSec / 60);
      const s = (totalSec % 60).toFixed(1);
      if (m > 0) {
        return \`\${m}分\${s}秒 (\${totalSec}s)\`;
      }
      return \`\${s}秒\`;
    }

    // 渲染内容
    function render() {
      content.innerHTML = '';
      elements = [];

      words.forEach((word, i) => {
        const div = document.createElement('div');
        div.className = word.isGap ? 'gap' : 'word';

        if (selected.has(i)) div.classList.add('selected');
        else if (autoSelected.has(i)) div.classList.add('ai-selected');

        if (word.isGap) {
          const duration = (word.end - word.start).toFixed(1);
          div.textContent = \`⏸ \${duration}s\`;
        } else {
          div.textContent = word.text;
        }

        div.dataset.index = i;

        // 单击跳转播放
        div.onclick = (e) => {
          if (suppressNextClick || e.shiftKey || isShiftPressed) {
            suppressNextClick = false;
            e.preventDefault();
            return;
          }
          if (!isSelecting) player.currentTime = word.start;
        };

        // 双击选中/取消
        div.ondblclick = () => toggle(i);

        // Shift+拖动选择/取消。用 Pointer Events 兼容 mac 触控板/鼠标。
        div.onpointerdown = (e) => {
          if (!e.shiftKey && !isShiftPressed) return;
          isSelecting = true;
          suppressNextClick = true;
          selectStart = i;
          selectMode = selected.has(i) ? 'remove' : 'add';
          content.classList.add('dragging');
          applyRangeSelection(i);
          div.setPointerCapture?.(e.pointerId);
          e.preventDefault();
        };

        content.appendChild(div);
        elements.push(div);
      });

      updateStats();
    }

    function setElementSelected(i, shouldSelect) {
      if (shouldSelect) {
        selected.add(i);
        elements[i].classList.add('selected');
        elements[i].classList.remove('ai-selected');
      } else {
        selected.delete(i);
        elements[i].classList.remove('selected');
        if (autoSelected.has(i)) elements[i].classList.add('ai-selected');
      }
    }

    function applyRangeSelection(toIndex) {
      if (selectStart < 0 || toIndex < 0) return;
      const min = Math.min(selectStart, toIndex);
      const max = Math.max(selectStart, toIndex);

      for (let j = min; j <= max; j++) {
        setElementSelected(j, selectMode === 'add');
      }
      updateStats();
    }

    function getIndexFromPoint(e) {
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-index]');
      if (!target || !content.contains(target)) return -1;
      return parseInt(target.dataset.index);
    }

    // Shift+拖动多选/取消
    document.addEventListener('pointermove', e => {
      if (!isSelecting) return;
      const i = getIndexFromPoint(e);
      if (i < 0) return;
      applyRangeSelection(i);
      e.preventDefault();
    });

    document.addEventListener('pointerup', () => {
      if (isSelecting) {
        rebuildSkipIntervals();
        content.classList.remove('dragging');
      }
      isSelecting = false;
      selectStart = -1;
    });

    document.addEventListener('pointercancel', () => {
      if (isSelecting) {
        rebuildSkipIntervals();
        content.classList.remove('dragging');
      }
      isSelecting = false;
      selectStart = -1;
    });

    function toggle(i) {
      if (selected.has(i)) {
        selected.delete(i);
        elements[i].classList.remove('selected');
        if (autoSelected.has(i)) elements[i].classList.add('ai-selected');
      } else {
        selected.add(i);
        elements[i].classList.add('selected');
        elements[i].classList.remove('ai-selected');
      }
      rebuildSkipIntervals();
      updateStats();
    }

    function updateStats() {
      const count = selected.size;
      let totalDuration = 0;
      selected.forEach(i => {
        totalDuration += words[i].end - words[i].start;
      });
      statsDiv.textContent = \`已选择 \${count} 个元素，总时长 \${totalDuration.toFixed(2)}s\`;
    }

    // Web Audio API：采样级精度静音（~3ms vs player.muted 的 ~50ms）
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(player);
    const gainNode = audioCtx.createGain();
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    player.addEventListener('play', () => { if (audioCtx.state === 'suspended') audioCtx.resume(); });

    // 预计算跳过区间（selected 变化时重建）
    let skipIntervals = [];
    function rebuildSkipIntervals() {
      const sorted = Array.from(selected).sort((a, b) => a - b);
      skipIntervals = [];
      let i = 0;
      while (i < sorted.length) {
        let start = words[sorted[i]].start;
        let end = words[sorted[i]].end;
        let j = i + 1;
        while (j < sorted.length && words[sorted[j]].start - end < 0.1) {
          end = words[sorted[j]].end;
          j++;
        }
        skipIntervals.push({ start: start - 0.05, end });
        i = j;
      }
    }
    rebuildSkipIntervals();

    // rAF 高频轮询 + Web Audio API 采样级静音
    let lastHighlight = -1;
    let skipLock = false;
    function tick() {
      requestAnimationFrame(tick);
      const t = player.currentTime;

      if (!player.paused) {
        for (const iv of skipIntervals) {
          if (t >= iv.start && t < iv.end) {
            if (!skipLock) {
              skipLock = true;
              gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
              player.currentTime = iv.end;
            }
            return;
          }
        }
        if (skipLock) {
          skipLock = false;
          gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
        }
      }

      timeDisplay.textContent = \`\${formatTime(t)} / \${formatTime(player.duration || 0)}\`;

      // 高亮当前词（用二分查找提速）
      let curr = -1;
      for (let i = 0; i < words.length; i++) {
        if (t >= words[i].start && t < words[i].end) { curr = i; break; }
      }
      if (curr !== lastHighlight) {
        if (lastHighlight >= 0 && lastHighlight < elements.length) elements[lastHighlight].classList.remove('current');
        if (curr >= 0) {
          elements[curr].classList.add('current');
          elements[curr].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        lastHighlight = curr;
      }
    }
    requestAnimationFrame(tick);

    function copyDeleteList() {
      const segments = [];
      const sortedSelected = Array.from(selected).sort((a, b) => a - b);

      sortedSelected.forEach(i => {
        const word = words[i];
        segments.push({ start: word.start, end: word.end });
      });

      // 合并相邻片段
      const merged = [];
      for (const seg of segments) {
        if (merged.length === 0) {
          merged.push({ ...seg });
        } else {
          const last = merged[merged.length - 1];
          if (Math.abs(seg.start - last.end) < 0.05) {
            last.end = seg.end;
          } else {
            merged.push({ ...seg });
          }
        }
      }

      const json = JSON.stringify(merged, null, 2);
      navigator.clipboard.writeText(json).then(() => {
        alert('已复制 ' + merged.length + ' 个删除片段到剪贴板');
      });
    }

    function clearAll() {
      selected.clear();
      elements.forEach((el, i) => {
        el.classList.remove('selected');
        if (autoSelected.has(i)) el.classList.add('ai-selected');
      });
      rebuildSkipIntervals();
      updateStats();
    }

    async function executeCut() {
      // 基于视频时长预估剪辑时间
      const videoDuration = player.duration;
      const videoMinutes = (videoDuration / 60).toFixed(1);
      const estimatedTime = Math.max(5, Math.ceil(videoDuration / 4)); // 经验值：约4倍速处理
      const estMin = Math.floor(estimatedTime / 60);
      const estSec = estimatedTime % 60;
      const estText = estMin > 0 ? \`\${estMin}分\${estSec}秒\` : \`\${estSec}秒\`;

      if (!confirm(\`确认执行剪辑？\\n\\n📹 视频时长: \${videoMinutes} 分钟\\n⏱️ 预计耗时: \${estText}\\n\\n点击确定开始\`)) return;

      // 直接发送原始时间戳，不做合并（和预览一致）
      const segments = [];
      const sortedSelected = Array.from(selected).sort((a, b) => a - b);
      sortedSelected.forEach(i => {
        const word = words[i];
        segments.push({ start: word.start, end: word.end });
      });

      // 显示 loading 并开始计时
      const overlay = document.getElementById('loadingOverlay');
      const loadingTimeEl = document.getElementById('loadingTime');
      const loadingProgress = document.getElementById('loadingProgress');
      const loadingEstimate = document.getElementById('loadingEstimate');
      overlay.classList.add('show');
      loadingEstimate.textContent = \`预估剩余: \${estText}\`;

      const startTime = Date.now();
      const timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        loadingTimeEl.textContent = \`已等待 \${elapsed} 秒\`;

        // 更新进度条（预估进度，最多到95%等待完成）
        const progress = Math.min(95, (elapsed / estimatedTime) * 100);
        loadingProgress.style.width = progress + '%';

        // 更新预估剩余时间
        const remaining = Math.max(0, estimatedTime - elapsed);
        if (remaining > 0) {
          loadingEstimate.textContent = \`预估剩余: \${remaining} 秒\`;
        } else {
          loadingEstimate.textContent = \`即将完成...\`;
        }
      }, 500);

      try {
        const res = await fetch('/api/cut', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(segments)  // 直接发原始数据
        });
        const data = await res.json();

        // 停止计时并隐藏 loading
        clearInterval(timer);
        loadingProgress.style.width = '100%';
        await new Promise(r => setTimeout(r, 300)); // 让进度条动画完成
        overlay.classList.remove('show');
        loadingProgress.style.width = '0%'; // 重置
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

        if (data.success) {
          const msg = \`✅ 剪辑完成！(耗时 \${totalTime}s)

📁 输出文件: \${data.output}

⏱️ 时间统计:
   原时长: \${formatDuration(data.originalDuration)}
   新时长: \${formatDuration(data.newDuration)}
   删减: \${formatDuration(data.deletedDuration)} (\${data.savedPercent}%)\`;
          alert(msg);
        } else {
          alert('❌ 剪辑失败: ' + data.error);
        }
      } catch (err) {
        clearInterval(timer);
        overlay.classList.remove('show');
        loadingProgress.style.width = '0%'; // 重置
        alert('❌ 请求失败: ' + err.message + '\\n\\n请确保使用 review_server.js 启动服务');
      }
    }

    // 键盘快捷键
    document.addEventListener('keydown', e => {
      if (e.key === 'Shift') isShiftPressed = true;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        player.currentTime = Math.max(0, player.currentTime - (e.shiftKey ? 5 : 1));
      } else if (e.code === 'ArrowRight') {
        player.currentTime = player.currentTime + (e.shiftKey ? 5 : 1);
      }
    });

    document.addEventListener('keyup', e => {
      if (e.key === 'Shift') isShiftPressed = false;
    });

    render();
  </script>
</body>
</html>`;

fs.writeFileSync('review.html', html);
console.log('✅ 已生成 review.html');
console.log(`📌 启动服务器: node "${path.join(__dirname, 'review_server.js')}" 8899 "${videoFile}"`);
console.log('📌 打开: http://localhost:8899/review.html');
