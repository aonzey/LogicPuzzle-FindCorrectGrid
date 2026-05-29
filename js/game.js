// 游戏状态变量
let SIZE = 5, lives = 3, solution = [], colorMap = [], foundCount = 0, locked = false;
let timerInterval = null, timeLeft = 0;
let lastClickTime = 0, lastClickIdx = -1;
let isPaused = false; // 新增：暂停状态标识

// 游戏初始化预备函数
function preInit() {
    clearInterval(timerInterval);
    document.getElementById('rem-ui').innerText = "生成中...";
    setTimeout(initGame, 50);
}

// 游戏初始化主函数
function initGame() {
    isPaused = false;
    document.body.classList.remove('paused');
    document.getElementById('pause-btn').innerText = "⏸️";
    SIZE = parseInt(document.getElementById('size-in').value) || 5;
    const forceUnique = document.getElementById('unique-chk').checked;
    
    let attempts = 0, success = false;
    while (attempts < 800) {
        attempts++;
        if (generateLayout()) {
            if (!forceUnique || isUnique()) { success = true; break; }
        }
    }

    if (!success) { initGame(); return; }

    lives = 3; foundCount = 0; locked = false;
    document.body.style.backgroundColor = "";
    
    // 倒计时设置：每格给15秒，最低60秒
    timeLeft = Math.max(60, SIZE * 15);
    startTimer();
    
    updateUI();
    renderGrid();
}

// 启动计时器
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        // 如果游戏结束或处于暂停状态，不执行计时
        if (locked || isPaused) return; 
        timeLeft--;
        updateTimerDisplay();
        if (timeLeft <= 0) {
            finishGame("❌ 时间到！", "#e74c3c");
        }
    }, 1000);
    updateTimerDisplay();
}

// 更新计时器显示
function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    document.getElementById('timer-ui').innerText = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// 生成游戏布局
function generateLayout() {
    const pos = [];
    const solvePonies = (r) => {
        if (r === SIZE) return true;
        let cols = [...Array(SIZE).keys()].sort(() => Math.random() - 0.5);
        for (let c of cols) {
            if (pos.every(p => {
                let pr = Math.floor(p/SIZE), pc = p%SIZE;
                return pc!==c && (Math.abs(pr-r)>1 || Math.abs(pc-c)>1);
            })) {
                pos.push(r*SIZE + c);
                if (solvePonies(r+1)) return true;
                pos.pop();
            }
        }
        return false;
    };
    if (!solvePonies(0)) return false;
    solution = pos;

    colorMap = new Array(SIZE*SIZE).fill(-1);
    let frontier = pos.map((p, i) => { colorMap[p] = i; return {idx:p, clr:i}; });
    let rem = SIZE*SIZE - SIZE;
    while (rem > 0) {
        frontier.sort(() => Math.random() - 0.5);
        let expanded = false;
        for (let f of frontier) {
            let r = Math.floor(f.idx/SIZE), c = f.idx%SIZE;
            let ads = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([nr,nc])=>nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE)
                      .map(([nr,nc])=>nr*SIZE+nc).filter(n=>colorMap[n]===-1);
            if (ads.length > 0) {
                let next = ads[Math.floor(Math.random()*ads.length)];
                colorMap[next] = f.clr; frontier.push({idx:next, clr:f.clr});
                rem--; expanded = true; break;
            }
        }
        if(!expanded) break;
    }
    return true;
}

// 检查是否唯一解
function isUnique() {
    let count = 0;
    const usedCols = new Array(SIZE).fill(false), usedClrs = new Array(SIZE).fill(false), cur = [];
    const find = (r) => {
        if (r === SIZE) { count++; return count > 1; }
        for (let c = 0; c < SIZE; c++) {
            let clr = colorMap[r*SIZE + c];
            if (!usedCols[c] && !usedClrs[clr] && cur.every(p => Math.abs(Math.floor(p/SIZE)-r)>1 || Math.abs((p%SIZE)-c)>1)) {
                usedCols[c] = usedClrs[clr] = true; cur.push(r*SIZE + c);
                if (find(r+1)) return true;
                cur.pop(); usedCols[c] = usedClrs[clr] = false;
            }
        }
        return false;
    };
    find(0); return count === 1;
}

// 渲染游戏网格
function renderGrid() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${SIZE}, 1fr)`;
    
    // 手机屏幕适配：计算格子大小
    const containerWidth = Math.min(window.innerWidth - 30, 500);
    const cellSize = Math.floor(containerWidth / SIZE);
    document.documentElement.style.setProperty('--cell-size', `${cellSize}px`);

    for (let i = 0; i < SIZE*SIZE; i++) {
        const cell = document.createElement('div');
        const r = Math.floor(i/SIZE), c = i%SIZE, clr = colorMap[i];
        cell.className = `cell clr-${clr % 10}`;
        
        // 绘制区域边界
        if (r === 0 || colorMap[i-SIZE] !== clr) cell.classList.add('bt');
        if (c === 0 || colorMap[i-1] !== clr) cell.classList.add('bl');
        if (c === SIZE-1 || colorMap[i+1] !== clr) cell.classList.add('br');
        if (r === SIZE-1 || colorMap[i+SIZE] !== clr) cell.classList.add('bb');
        
        // 移动端触控逻辑优化：单击标记，双击确认
        cell.addEventListener('touchstart', (e) => {
            e.preventDefault(); // 防止缩放触发
            handleCellClick(i, cell);
        });
        // 兼容桌面端
        cell.addEventListener('mousedown', (e) => {
            if(e.button === 0) handleCellClick(i, cell);
        });

        grid.appendChild(cell);
    }
}

// 处理格子点击
function handleCellClick(idx, el) {
    if (locked || isPaused) return; // 暂停时禁止点击
    if (locked) return;
    const now = Date.now();
    
    // 判定是否为双击
    if (now - lastClickTime < 300 && lastClickIdx === idx) {
        handleReveal(idx, el);
        lastClickTime = 0; // 重置
    } else {
        // 单击：标记/取消标记
        if (!el.classList.contains('found')) {
            el.classList.toggle('marked');
        }
    }
    lastClickTime = now;
    lastClickIdx = idx;
}

// 处理揭示格子
function handleReveal(idx, el) {
    if (el.classList.contains('found')) return;
    el.classList.remove('marked'); 

    if (solution.includes(idx)) {
        el.classList.add('found'); 
        el.innerText = '🌹';
        foundCount++;
        
        // --- 新增：判断是否开启自动标记 ---
        const isAutoMark = document.getElementById('auto-mark-chk').checked;
        if (isAutoMark) {
            autoMarkInvalidCells(idx);
        }
        // ------------------------------

        updateUI();
        if (foundCount === SIZE) finishGame("✨ 推理完成！", "#2ecc71");
    } else {
        lives--; 
        el.classList.add('err');
        setTimeout(() => el.classList.remove('err'), 300);
        updateUI();
        if (lives <= 0) finishGame("❌ 失败！", "#e74c3c");
    }
}

// 自动标记无效格子
function autoMarkInvalidCells(foundIdx) {
    const r = Math.floor(foundIdx / SIZE);
    const c = foundIdx % SIZE;
    const cells = document.getElementById('grid').children;

    for (let i = 0; i < SIZE * SIZE; i++) {
        if (i === foundIdx) continue; 

        const targetR = Math.floor(i / SIZE);
        const targetC = i % SIZE;
        const targetEl = cells[i];

        // 如果该格已经是玫瑰或者已经手动标记过了，则跳过
        if (targetEl.classList.contains('found') || targetEl.classList.contains('marked')) continue;

        // 逻辑判定：
        const isSameRow = (targetR === r);
        const isSameCol = (targetC === c);
        const isAdjacent = Math.abs(targetR - r) <= 1 && Math.abs(targetC - c) <= 1;

        // 只要满足同行、同列或九宫格相邻，就打上标记
        if (isSameRow || isSameCol || isAdjacent) {
            targetEl.classList.add('marked');
        }
    }
}

// 自动翻牌提示
function givePonyHint() {
    if (locked || foundCount === SIZE) return;
    const targets = solution.filter(idx => !document.getElementById('grid').children[idx].classList.contains('found'));
    if (targets.length > 0) {
        const idx = targets[Math.floor(Math.random() * targets.length)];
        handleReveal(idx, document.getElementById('grid').children[idx]);
    }
}

// 自动标记提示
function giveMarkHint() {
    if (locked) return;
    const cells = document.getElementById('grid').children;
    const wrongIndices = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
        if (!solution.includes(i) && !cells[i].classList.contains('found') && !cells[i].classList.contains('marked')) {
            wrongIndices.push(i);
        }
    }
    if (wrongIndices.length > 0) {
        wrongIndices.sort(() => Math.random() - 0.5);
        const toMark = wrongIndices.slice(0, 3);
        toMark.forEach(idx => cells[idx].classList.add('marked'));
    }
}

// 游戏结束处理
function finishGame(txt, color) {
    locked = true;
    clearInterval(timerInterval);
    document.getElementById('rem-ui').innerText = txt;
    document.body.style.backgroundColor = color + '15';
    if (lives <= 0 || timeLeft <= 0) {
        solution.forEach(idx => {
            const c = document.getElementById('grid').children[idx];
            if(!c.classList.contains('found')) c.innerText = '🌹';
        });
    }
    setTimeout(preInit, 4000);
}

// 更新UI显示
function updateUI() {
    document.getElementById('lives-ui').innerText = '❤️'.repeat(Math.max(0, lives));
    document.getElementById('rem-ui').innerText = `剩余: ${SIZE - foundCount}`;
    document.getElementById('pony-btn').disabled = (locked || foundCount === SIZE);
    document.getElementById('mark-btn').disabled = locked;
}

// 暂停/继续游戏
function togglePause() {
    if (locked) return; // 游戏结束时不能暂停

    isPaused = !isPaused;
    const btn = document.getElementById('pause-btn');
    
    if (isPaused) {
        btn.innerText = "▶️";
        document.body.classList.add('paused');
    } else {
        btn.innerText = "⏸️";
        document.body.classList.remove('paused');
    }
}

// 页面加载完成后初始化游戏
window.addEventListener('DOMContentLoaded', preInit);
