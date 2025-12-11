// --- GLOBAL VARIABLES ---
const defs = [
    {name:"ร้อย", idx:[0], cls:"bg-hundred"},{name:"สิบบน", idx:[1], cls:"bg-tens-up"},
    {name:"หน่วยบน", idx:[2], cls:"bg-units-up"},{name:"บน (รวม)", idx:[1,2], cls:"bg-up-all"},
    {name:"สิบล่าง", idx:[3], cls:"bg-tens-down"},{name:"หน่วยล่าง", idx:[4], cls:"bg-units-down"},
    {name:"ล่าง (รวม)", idx:[3,4], cls:"bg-down-all"},{name:"บน+ล่าง (ไม่รวมร้อย)", idx:[1,2,3,4], cls:"bg-all"}
];
let currentTarget='hundred', currentTargetLabel='หลักร้อย', currentLen=5, displayMode='auto';
let inputOrder = 'normal', isHuntingMode = false, sortMode = 'score';
let currentStepMode = 'normal', currentStepLabel='เรียง (+1)';
let isHeatmapMode = false, myWorker = null, isEditing = false, pinnedList = [];
let currentLottoType = 'thai', sessionSeed = Math.floor(Math.random() * 100000);
let globalFlowData = {};
let currentPage = 1;
let pageSize = 10;
let lastCalculatedResults = []; 
let currentData = [];

// --- WORKER SCRIPT ---
const workerScript = `
self.onmessage = function(e) {
    const { intData, targetType, len, displayMode, startIdx, endIdx, manualLimit, killDigits, isHuntingMode, huntMax, seed, stepMode, page, pageSize } = e.data;
    let results = findFormulasLite(intData, targetType, len, displayMode, startIdx, endIdx, manualLimit, killDigits, isHuntingMode, huntMax, seed, stepMode, page, pageSize);
    self.postMessage({status:'success', data:results});
};

function sfc32(a, b, c, d) {
    return function() {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
        var t = (a + b) | 0; a = b ^ b >>> 9; b = c + (c << 3) | 0; c = (c << 21 | c >>> 11); d = d + 1 | 0; t = t + d | 0; c = c + t | 0;
        return (t >>> 0) / 4294967296;
    }
}

// Dynamic Additives based on Step Mode
function getAdditives(len, mode) {
    let arr = []; let step = 1; let start = 0;
    if(mode === 'odd') { start=1; step=2; } else if(mode === 'even') { start=0; step=2; } else if(mode === 'step3') { start=0; step=3; }
    for(let i=0; i<len; i++) arr.push((start + (i*step)) % 10);
    return arr;
}

function getTargetValue(roundArr, type) {
    if(type==='hundred') return [roundArr[0]]; if(type==='tens_up') return [roundArr[1]]; if(type==='units_up') return [roundArr[2]];
    if(type==='tens_down') return [roundArr[3]]; if(type==='units_down') return [roundArr[4]];
    if(type==='tf_up') return [roundArr[1], roundArr[2]]; if(type==='tf_down') return [roundArr[3], roundArr[4]]; 
    if(type==='pair_up') return [roundArr[1], roundArr[2]]; if(type==='pair_down') return [roundArr[3], roundArr[4]]; 
    if(type==='any_no_hundred') return [roundArr[1], roundArr[2], roundArr[3], roundArr[4]]; 
    return []; 
}

function checkWin(targets, nums, type) {
    let match = 0; for (let t of targets) if (nums.includes(t)) match++;
    if (type.includes('pair')) return match === targets.length; 
    if (type.includes('tf') || type.includes('any')) return match > 0;
    return match > 0; 
}

function findFormulasLite(intData, targetType, len, displayMode, startIdx, endIdx, manualLimit, killDigits, isHuntingMode, huntMax, seed, stepMode, page, pageSize) {
    let totalChecks = intData.length - 1;
    const targetVals = [];
    for(let i=0; i < totalChecks; i++) targetVals.push(getTargetValue(intData[i+1], targetType));
    
    let randFunc = Math.random;
    if (displayMode === 'all' || isHuntingMode) {
         let seedVal = 12345 + (targetType.length * 100) + len;
         randFunc = sfc32(seedVal, seedVal+1, seedVal+2, seedVal+3);
    }

    const positions = [0, 1, 2, 3, 4]; const operators = ['+', '-', '*']; const constants = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; 
    let allResults = [];
    const MAX_SEARCH = 2000; 
    
    let additives = getAdditives(len, stepMode);

    for (let r = 0; r < MAX_SEARCH; r++) {
        let p1 = positions[Math.floor(randFunc() * 5)]; let p2 = positions[Math.floor(randFunc() * 5)];
        let op = operators[Math.floor(randFunc() * 3)]; let con = constants[Math.floor(randFunc() * 10)]; let m1 = Math.floor(randFunc() * 5) + 1;
        
        const baseSums = new Int8Array(intData.length);
        for(let i=1; i<intData.length; i++) { 
            let v1 = intData[i][p1]; let v2 = intData[i][p2]; let res = 0;
            if (op === '+') res = (v1 * m1) + v2; else if (op === '-') res = (v1 * m1) - v2; else if (op === '*') res = (v1 * m1) * v2;
            if (isNaN(res)) res = 0;
            baseSums[i] = Math.floor(Math.abs(res) + con) % 10;
        }
        
        let name = \`(\${m1>1?m1+'x':''}\${['ร','ส','น','ลส','ลน'][p1]} \${op} \${['ร','ส','น','ลส','ลน'][p2]}) + \${con}\`;

        for(let start=0; start<=9; start++) {
            let score=0;
            // Fast Score Check
            for(let i=startIdx; i<=endIdx; i++) { 
                if(i >= totalChecks) continue;
                let numsToCheck = [];
                for(let k=0; k<len; k++) numsToCheck.push((baseSums[i]+start+additives[k])%10);
                if(checkWin(targetVals[i], numsToCheck, targetType)) score++;
            }
            
            allResults.push({ name: name+" (R"+start+")", score: score, p1, p2, op, con, m1, start, baseSums });
        }
    }
    
    if (displayMode === 'auto') {
        allResults.sort((a,b)=>b.score-a.score);
        allResults = allResults.slice(0, 5);
    } else {
        // Manual Pagination Logic
        let startIndex = (page - 1) * pageSize;
        let endIndex = startIndex + pageSize;
        allResults = allResults.slice(startIndex, endIndex);
    }

    // Full History Generation only for selected results
    return allResults.map(res => {
        let history = [];
        let currentNums = null; let huntCount = 0;
        
        for(let i=1; i<intData.length; i++) {
             let isLast = i === intData.length - 1;
             let numsToCheck = [];
             let isWin = false;
             
             // Logic
             if (isHuntingMode) {
                if (currentNums === null) { 
                    for(let k=0; k<len; k++) numsToCheck.push((res.baseSums[i]+res.start+additives[k])%10); 
                    currentNums=numsToCheck; huntCount=1; 
                } else { numsToCheck = currentNums; }
             } else { 
                for(let k=0; k<len; k++) numsToCheck.push((res.baseSums[i]+res.start+additives[k])%10); 
             }
             
             if (!isLast) {
                 isWin = checkWin(targetVals[i], numsToCheck, targetType);
                 let record = { nums: numsToCheck, win: isWin, rowIdx: i };
                 if (isHuntingMode) { record.huntRound = huntCount; record.huntMax = huntMax; }
                 
                 // *** FIX: ONLY ADD HISTORY IF WITHIN RANGE ***
                 if (i >= startIdx && i <= endIdx) {
                    history.push(record);
                 }
                 
                 if (isHuntingMode) {
                    if (isWin) currentNums = null; 
                    else { if (huntCount < huntMax) huntCount++; else currentNums = null; }
                 }
             } else {
                 // Prediction row (Always add)
                 history.push({ nums: numsToCheck, win: null, rowIdx: i });
             }
        }
        return { name: res.name, score: res.score, history: history, isDimmed: false };
    });
}
`;

// APP VARS
let currentTarget='hundred', currentTargetLabel='หลักร้อย', currentLen=5, displayMode='auto';
let inputOrder = 'normal', isHuntingMode = false, sortMode = 'score';
let currentStepMode = 'normal', currentStepLabel='เรียง (+1)';
let isHeatmapMode = false, myWorker = null, isEditing = false, pinnedList = [];
let currentLottoType = 'thai', sessionSeed = Math.floor(Math.random() * 100000);
let globalFlowData = {};
let currentPage = 1;
let pageSize = 10;
let lastCalculatedResults = []; // Store for copy function

function changeLottoType() { saveCurrentData(); currentLottoType = document.getElementById('lottoSelector').value; loadCurrentData(); updateRenameButton(); }
function updateRenameButton() { let customName = localStorage.getItem('lottoName_' + currentLottoType); let select = document.getElementById('lottoSelector'); let option = select.querySelector(`option[value="${currentLottoType}"]`); if (customName && option) { let originalText = option.text; let flag = originalText.split(' ')[0]; option.text = flag + ' ' + customName; } }
function renameLotto() { let newName = prompt("ตั้งชื่อหวยใหม่:", ""); if (newName) { localStorage.setItem('lottoName_' + currentLottoType, newName); updateRenameButton(); } }
function saveCurrentData() { localStorage.setItem('lottoData_' + currentLottoType, document.getElementById('inputData').value); }
function loadCurrentData() { const saved = localStorage.getItem('lottoData_' + currentLottoType) || ""; document.getElementById('inputData').value = saved; updateDbCount(); updateRenameButton(); if(saved.trim()) { setTimeout(() => { const totalRounds = document.getElementById('rangeEnd').max; if(totalRounds) document.getElementById('rangeEnd').value = totalRounds; updateRangeFromCount(); }, 100); } }
function toggleTheme() { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); }
function toggleEditData() { const box = document.getElementById('inputData'); const btn = document.getElementById('btnEdit'); isEditing = !isEditing; box.readOnly = !isEditing; if(isEditing) { box.style.borderColor = '#f97316'; btn.innerText = '💾 บันทึก'; btn.style.background = '#16a34a'; } else { box.style.borderColor = '#cbd5e1'; btn.innerText = '✏️ แก้ไข'; btn.style.background = '#f59e0b'; saveCurrentData(); if(box.value.trim()) { updateDbCount(); runProgram(); } } }
function toggleOrder() { inputOrder = inputOrder==='normal'?'reverse':'normal'; document.getElementById('btnOrder').innerText = inputOrder==='normal'?'⬇ ปกติ':'⬆ สลับ'; }
function toggleSection(contentId, iconId) { const content = document.getElementById(contentId); const icon = document.getElementById(iconId); if(content.style.display === 'none') { content.style.display = 'block'; icon.innerText = '▼'; } else { content.style.display = 'none'; icon.innerText = '▲'; } }
function toggleDashboard() { toggleSection('dashboardContent', 'dashIcon'); }

document.addEventListener('DOMContentLoaded', () => { if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode'); currentLottoType = 'thai'; document.getElementById('lottoSelector').value = 'thai'; let select = document.getElementById('lottoSelector'); for (let i = 0; i < select.options.length; i++) { let val = select.options[i].value; let custom = localStorage.getItem('lottoName_' + val); if (custom) { let flag = select.options[i].text.split(' ')[0]; select.options[i].text = flag + ' ' + custom; } } const oldData = localStorage.getItem('lottoData'); if(oldData && !localStorage.getItem('lottoData_thai')) { localStorage.setItem('lottoData_thai', oldData); localStorage.removeItem('lottoData'); } loadCurrentData(); });

// HANDLERS
function setMode(m) { displayMode=m; updateUI(); runProgram(); }
function setHunt(h) { isHuntingMode=h; updateUI(); if(isHuntingMode) setMode('all'); else runProgram(); }
function setTarget(t) { document.querySelectorAll('.btn.active').forEach(b=>{ if(b.onclick && b.onclick.toString().includes('setTarget')) b.classList.remove('active')}); event.target.classList.add('active'); currentTarget=t; runProgram(); }
function setStep(mode, btn) { currentStepMode = mode; document.querySelectorAll('.btn-step').forEach(b => b.classList.remove('active')); btn.classList.add('active'); runProgram(); }
function setLen(n, btn) { currentLen = n; document.querySelectorAll('.btn-len').forEach(b => b.classList.remove('active')); btn.classList.add('active'); runProgram(); }

function updateUI() {
    document.getElementById('btnModeAuto').className = displayMode==='auto'?'btn-mode active':'btn-mode';
    document.getElementById('btnModeAll').className = displayMode==='all'?'btn-mode active':'btn-mode';
    document.getElementById('manualLimitInput').style.display = displayMode==='all'?'inline-block':'none';
    document.getElementById('manualControl').style.display = displayMode==='all'?'inline-flex':'none';
    document.getElementById('tableFooterControls').style.display = displayMode==='all'?'flex':'none'; 
    
    document.getElementById('btnHuntOff').className = !isHuntingMode?'btn-hunt active':'btn-hunt';
    document.getElementById('btnHuntOn').className = isHuntingMode?'btn-hunt active':'btn-hunt';
    document.getElementById('huntInputWrap').style.display = isHuntingMode?'flex':'none';
    
    if(displayMode==='auto') {
         setSort('score'); document.getElementById('sortFixed').classList.add('disabled'); document.getElementById('sortScore').classList.remove('disabled');
    } else {
         setSort('fixed'); document.getElementById('sortFixed').classList.remove('disabled'); document.getElementById('sortScore').classList.add('disabled');
    }
}

function setSort(mode) { sortMode = mode; document.getElementById('sortScore').className = mode==='score'?'btn-sort active':'btn-sort'; document.getElementById('sortFixed').className = mode==='fixed'?'btn-sort active':'btn-sort'; }

function changePage(delta) {
    let maxLimit = parseInt(document.getElementById('manualLimitInput').value) || 100;
    let maxPage = Math.ceil(maxLimit / pageSize);
    currentPage += delta;
    if(currentPage < 1) currentPage = 1;
    if(currentPage > maxPage) currentPage = maxPage;
    updatePageInfo();
    runProgram();
}

function updatePageInfo() {
    let start = (currentPage - 1) * pageSize + 1;
    let end = currentPage * pageSize;
    let maxLimit = parseInt(document.getElementById('manualLimitInput').value) || 100;
    if (end > maxLimit) end = maxLimit;
    document.getElementById('pageInfo').innerText = `${start}-${end}`;
}

// Improved Update Functions for Input Sync
function updateDbCount() { 
    const val = document.getElementById('inputData').value.trim(); 
    const parsed = parseInputText(val);
    const count = parsed.rounds.length; 
    document.getElementById('dbCount').innerText = `มีข้อมูล ${count} งวด`; 
    document.getElementById('rangeCount').max = count; 
    document.getElementById('rangeStart').max = count;
    document.getElementById('rangeEnd').max = count;
    return count;
}

function updateRangeFromCount() { 
    let total = updateDbCount();
    let countInput = document.getElementById('rangeCount');
    let val = parseInt(countInput.value);
    if (isNaN(val) || val < 1) { if (val === 0) countInput.value = 1; return; }
    if (val > total) { countInput.value = total; val = total; }
    let end = total;
    document.getElementById('rangeEnd').value = end;
    let start = Math.max(1, end - val + 1);
    document.getElementById('rangeStart').value = start;
    runProgram(); 
}

function updateCountFromRange() { 
    let total = updateDbCount();
    let startInput = document.getElementById('rangeStart');
    let endInput = document.getElementById('rangeEnd');
    let countInput = document.getElementById('rangeCount');
    let start = parseInt(startInput.value);
    let end = parseInt(endInput.value);
    
    if (!isNaN(end) && end > total) { end = total; endInput.value = total; }
    if (!isNaN(start) && start > total) { start = total; startInput.value = total; }
    if (!isNaN(start) && !isNaN(end) && start > end) { start = end; startInput.value = end; }
    
    if (!isNaN(start) && !isNaN(end)) {
        let count = end - start + 1;
        if (count < 1) count = 1;
        countInput.value = count;
        runProgram();
    }
}

function runProgram() {
    const rawInput = document.getElementById('inputData').value; if(!rawInput.trim()) return;
    updateDbCount(); document.getElementById('loading').style.display='block'; document.getElementById('tableWrapper').style.display='none';
    const parseRes = parseInputText(rawInput);
    if(parseRes.rounds.length < 2) { alert("ข้อมูลน้อยเกินไป"); document.getElementById('loading').style.display='none'; return; }
    currentData = parseRes.rounds;
    const intData = currentData.map(r => [parseInt(r.up[0]), parseInt(r.up[1]), parseInt(r.up[2]), parseInt(r.down[0]), parseInt(r.down[1])]);

    renderFlowDashboard(intData); calculateStructure(intData); 
    document.getElementById('vinFlowSection').style.display = 'block'; calcVinFlow();
    if(!document.getElementById('rangeEnd').value) updateRangeFromCount();

    const params = {
        intData: intData, targetType: currentTarget, len: parseInt(currentLen),
        displayMode: displayMode, startIdx: Math.max(0, (parseInt(document.getElementById('rangeStart').value)||1) - 1),
        endIdx: Math.min(intData.length - 1, (parseInt(document.getElementById('rangeEnd').value)||intData.length) - 1),
        manualLimit: parseInt(document.getElementById('manualLimitInput').value) || 100,
        killDigits: document.getElementById('killDigits').value,
        isHuntingMode: isHuntingMode, huntMax: parseInt(document.getElementById('huntMax').value) || 3, 
        seed: sessionSeed, stepMode: currentStepMode,
        page: currentPage, pageSize: pageSize
    };
    
    if(myWorker) myWorker.terminate(); 
    const blob = new Blob([workerScript], {type: 'application/javascript'});
    myWorker = new Worker(URL.createObjectURL(blob));
    
    const safetyTimeout = setTimeout(() => { document.getElementById('loading').style.display='none'; if(myWorker) myWorker.terminate(); alert("⚠️ ใช้เวลานานเกินไป"); }, 300000);
    
    myWorker.onmessage = function(e) {
        clearTimeout(safetyTimeout);
        if(e.data.status === 'error') { document.getElementById('loading').style.display='none'; return; }
        lastResults = e.data.data;
        lastCalculatedResults = e.data.data; 
        renderTable(currentData, lastResults);
        calculateBottomConsensus(lastResults);
        document.getElementById('loading').style.display='none';
        document.getElementById('tableWrapper').style.display='block';
        document.getElementById('consensusSection').style.display='block';
        if(displayMode==='all') document.getElementById('tableFooterControls').style.display = 'flex';
    };
    myWorker.postMessage(params);
}

// --- HELPER TO GET TARGET NUMBERS ---
function getTargetsStr(r, type) {
    let uH=parseInt(r.up[0]), uT=parseInt(r.up[1]), uU=parseInt(r.up[2]);
    let dT=parseInt(r.down[0]), dU=parseInt(r.down[1]);
    if(type==='hundred') return [uH]; if(type==='tens_up') return [uT]; if(type==='units_up') return [uU];
    if(type==='tens_down') return [dT]; if(type==='units_down') return [dU];
    if(type==='tf_up') return [uT,uU]; if(type==='tf_down') return [dT,dU];
    if(type==='pair_up') return [uT,uU]; if(type==='pair_down') return [dT,dU];
    if(type==='any_no_hundred') return [uT,uU,dT,dU];
    return [];
}

function renderTable(data, formulas) {
    let pinned = [], unpinned = [];
    formulas.forEach(f => { if(pinnedList.includes(f.name)) pinned.push(f); else unpinned.push(f); });
    let displayFormulas = [...pinned, ...unpinned];

    // --- แก้ไขจุดนี้: เปลี่ยนปุ่ม Copy ให้เหมือน Auto Flow Vin (ใช้ class btn-tiny และลบไอคอนออก) ---
    let html = `<table><thead><tr><th style="min-width:160px; z-index:100; left:0;">งวด / ผล <button class="btn-tiny" onclick="copyHistoryColumn()" title="Copy Results">Copy</button></th>`;
    
    displayFormulas.forEach((f,i) => {
        let isPinned = pinnedList.includes(f.name);
        let wins=0, losses=0;
        f.history.forEach(h => { if(h.win) wins++; else if(h.win===false) losses++; });
        html += `<th style="min-width:140px;">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                        <div style="display:flex; align-items:center; justify-content:center; gap:5px;">
                            <button class="btn-star ${isPinned?'pinned':''}" onclick="togglePin('${f.name}')">★</button>
                            <span style="font-size:13px; font-weight:bold;">${f.name}</span>
                            <button class="btn-copy-col" onclick="copyColumn('${f.name}')">📋</button>
                        </div>
                        <div style="font-size:12px; color:var(--txt-l); background:rgba(0,0,0,0.05); padding:2px 10px; border-radius:10px; font-weight:600;">
                            <span style="color:#16a34a;">ถูก ${wins}</span> <span style="color:#cbd5e1;">|</span> <span style="color:#dc2626;">ผิด ${losses}</span>
                        </div>
                    </div>
                 </th>`;
    });
    html += `</tr></thead><tbody>`;
    let hLen = displayFormulas[0].history.length;
    for(let i=0; i<hLen; i++) {
        let item = displayFormulas[0].history[i];
        let isPred = (i === hLen-1);
        if(isPred) html += `<tr><td style="background:#fef08a;">🔮 ทำนาย</td>`;
        else { let tr = data[item.rowIdx+1]; html += `<tr><td>${tr.i}. ${tr.up}-${tr.down}</td>`; }
        displayFormulas.forEach(f => {
            let h = f.history[i];
            let d = h.nums.join('');
            if(isPred) html += `<td><span style="font-weight:bold; color:var(--p);">${d}</span></td>`;
            else {
                let mark = h.win ? `<span class="stat-t">✓</span>` : `<span class="stat-f">✗</span>`;
                let targets = getTargetsStr(data[item.rowIdx+1], currentTarget);
                let numHtml = '';
                h.nums.forEach(n => { 
                    if(targets.includes(n)) numHtml += `<span class="num-match">${n}</span>`; 
                    else numHtml += `<span class="num-normal">${n}</span>`; 
                });
                
                let huntTag = "";
                if (isHuntingMode && h.huntRound) {
                    if (h.win) huntTag = `<span class="hunt-tag win">Win!</span>`; else huntTag = `<span class="hunt-tag wait">ตาม ${h.huntRound}/${h.huntMax}</span>`;
                }
                html += `<td class="num-box" style="text-align:center;">${numHtml} ${mark} ${huntTag}</td>`;
            }
        });
        html += `</tr>`;
    }
    html += `</tbody></table>`;
    document.getElementById('resultContainer').innerHTML = html;
}

// --- COPY COLUMN FIXED (DATA-BASED) ---
// --- แก้ไขการคัดลอกสูตร (ลบลำดับที่ออก) ---
function copyColumn(title) {
    let formula = lastCalculatedResults.find(f => f.name === title);
    if(!formula) return alert("ไม่พบข้อมูลสูตร");
    
    // 1. ดึงค่าจำนวนงวดล่าสุดจากช่องตั้งค่า
    let limit = parseInt(document.getElementById('rangeCount').value) || 0;

    let lottoName = document.getElementById('lottoSelector').options[document.getElementById('lottoSelector').selectedIndex].text.split(' ')[1] || 'หวย';
    let txt = `📋 สูตร: ${title}\n🍙 ${lottoName} (เป้า: ${currentTargetLabel})\n------------------\n`;
    
    // 2. กรองเอางวดที่มีผลแล้ว (ตัดงวดทำนายออกก่อน)
    let validHistory = formula.history.filter(h => h.win !== null);

    // 3. ตัดข้อมูลให้เหลือเฉพาะช่วงล่าสุดตาม limit
    let startIndex = 0;
    if (limit > 0 && limit < validHistory.length) {
        startIndex = validHistory.length - limit;
    }
    let subset = validHistory.slice(startIndex);
    
    // 4. สร้างข้อความ (รูปแบบ: สูตร = ผล เครื่องหมาย) *ไม่มีเลขลำดับ*
    subset.forEach(h => {
         let rowData = currentData[h.rowIdx];
         let resStr = `${rowData.up}-${rowData.down}`;
         let nums = h.nums.join('');
         let mark = h.win ? "✓" : "✗";
         
         // ตัด ${h.rowIdx+1}. ออก
         txt += `${nums} = ${resStr} ${mark}\n`;
    });
    
    // ส่วนทำนายงวดหน้า
    let last = formula.history[formula.history.length-1];
    if (last.win === null) {
        txt += `------------------\n🔮 ทำนาย: ${last.nums.join('')}\n`;
    }
    
    txt += `\nBy โปรแกรมคำนวณตัวเลข`;
    copyText(txt);
}

// --- COPY HISTORY COLUMN ---
// --- แก้ไข: คัดลอกงวด/ผล ตามจำนวน "ล่าสุด" ---
function copyHistoryColumn() {
    if (!currentData || currentData.length === 0) return alert("ไม่มีข้อมูล");
    
    // 1. ดึงค่าจำนวนงวดล่าสุด
    let limit = parseInt(document.getElementById('rangeCount').value) || 0;
    
    // 2. ตัดข้อมูลให้เหลือเฉพาะช่วงล่าสุด
    let start = 0;
    if (limit > 0 && limit < currentData.length) {
        start = currentData.length - limit;
    }
    let subset = currentData.slice(start);
    
    // 3. สร้างข้อความ
    let txt = "ผลรางวัล\n------------------\n";
    subset.forEach(r => {
        txt += `${r.up}-${r.down}\n`; 
    });
    
    copyText(txt);
}

// --- OTHER HELPERS ---
function togglePin(name) { if(pinnedList.includes(name)) pinnedList = pinnedList.filter(n => n !== name); else { if(pinnedList.length >= 5) { alert("เต็ม 5 สูตร"); return; } pinnedList.push(name); } if(lastResults.length > 0) renderTable(currentData, lastResults); }
function toggleHeatmap() { isHeatmapMode = !isHeatmapMode; if (lastResults.length > 0) renderTable(currentData, lastResults); }
function copyTable() { navigator.clipboard.writeText("Copied Table"); alert("Copied!"); }
function copySingleSmartFlow(btn) { copyText(btn.getAttribute('data-text')); }
function copySmartFlow() { let cards = document.querySelectorAll('.btn-copy-sf'); let allText = ""; cards.forEach(btn => { allText += btn.getAttribute('data-text') + "\n\n====================\n\n"; }); if(allText) copyText(allText); }
function copyText(t) { navigator.clipboard.writeText(t).then(()=>{ const el=document.getElementById('toast'); el.style.display='block'; setTimeout(()=>el.style.display='none', 1000); }); }
function appendAndRun() {
    const rawNew = document.getElementById('newData').value.trim();
    if(rawNew) {
        const parsed = parseInputText(rawNew);
        if(parsed.textFormat) {
            const main = document.getElementById('inputData');
            let textToAdd = parsed.textFormat;
            
            // จัดการลำดับกรณีเลือกแบบย้อนกลับ
            if (inputOrder === 'reverse') {
                let lines = parsed.rounds.map(r => `${r.up} ${r.down}`);
                textToAdd = lines.reverse().join('\n');
            }
            
            // เพิ่มข้อมูลลงในกล่องหลัก
            main.value = (main.value.trim() ? main.value + "\n" : "") + textToAdd;
            document.getElementById('newData').value = ""; // ล้างช่องเติม
            main.scrollTop = main.scrollHeight; // เลื่อนลงล่างสุด
            
            // อัปเดตจำนวนงวดทั้งหมด
            updateDbCount(); 
            
            // --- ปรับเลข "ถึงงวดที่" ให้เป็นงวดล่าสุดอัตโนมัติ ---
            const totalRounds = document.getElementById('rangeEnd').max; // ค่า max ที่เพิ่งอัปเดตจาก updateDbCount
            document.getElementById('rangeEnd').value = totalRounds;
            
            // คำนวณหาจำนวนงวด (Range Count) ใหม่ เพื่อให้ช่อง "ล่าสุด" สัมพันธ์กัน
            updateRangeFromCount(); 
            // ----------------------------------------------------------

            // runProgram(); // updateRangeFromCount calls runProgram already
        } else alert("ข้อมูลไม่ถูกต้อง");
    } else alert("กรุณาใส่ข้อมูล");
}
function clearAll() { if(confirm("ล้าง?")) { document.getElementById('inputData').value=""; saveCurrentData(); document.getElementById('resultContainer').innerHTML=""; ['flowPanel','consensusSection','copyArea','tableWrapper','structurePanel','vinFlowSection'].forEach(id => document.getElementById(id).style.display='none'); updateDbCount(); } }
function hideAll() { ['flowPanel','consensusSection','copyArea','tableWrapper','structurePanel'].forEach(id => document.getElementById(id).style.display='none'); }
function parseInputText(text) { let nums = text.match(/\d+/g); if(!nums) return {rounds:[], textFormat:""}; let rounds=[], tempUp=null, idx=1; nums.forEach(n => { if(n.length===5) rounds.push({i:idx++, up:n.substring(0,3), down:n.substring(3,5)}); else if(n.length===3) tempUp=n; else if(n.length===2 && tempUp) { rounds.push({i:idx++, up:tempUp, down:n}); tempUp=null; } }); if(rounds.length) return {rounds:rounds, textFormat:rounds.map(r=>`${r.up} ${r.down}`).join('\n')}; return {rounds:[], textFormat:""}; }

// --- MISSING FUNCTIONS ADDED HERE ---
function checkDoubleAlert(intData) {
    let alertBar = document.getElementById('alertBox');
    alertBar.style.display = 'none';
    alertBar.innerHTML = ''; 

    let gapUpper = 0, gapLower = 0;
    for(let i = intData.length - 1; i >= 0; i--) {
        if(!isNaN(intData[i][1]) && !isNaN(intData[i][2])) {
            if(intData[i][1] === intData[i][2]) break; 
            gapUpper++;
        }
    }
    for(let i = intData.length - 1; i >= 0; i--) {
        if(!isNaN(intData[i][3]) && !isNaN(intData[i][4])) {
            if(intData[i][3] === intData[i][4]) break; 
            gapLower++;
        }
    }

    let msg = [];
    if(gapUpper >= 10) msg.push(`⚠️ ระวังเบิ้ลบน! (ไม่มา ${gapUpper} งวด)`);
    if(gapLower >= 10) msg.push(`⚠️ ระวังเบิ้ลล่าง! (ไม่มา ${gapLower} งวด)`);

    if(msg.length > 0) {
        alertBar.innerHTML = msg.join('<br>');
        alertBar.style.display = 'block';
    }
}

function calcVinFlow() {
    let limit = parseInt(document.getElementById('vinFlowLimit').value) || 5;
    let killVal = document.getElementById('vinFlowSumKill').value.trim();
    let killSum = killVal ? killVal.replace(/[^0-9]/g, '').split('').map(Number) : [];

    // ดึงเลขไหลจาก globalFlowData (ต้องแน่ใจว่ามีข้อมูล)
    // ใช้ 10 หลักบน (bg-tens-up) และ หน่วยบน (bg-units-up)
    let tUp = globalFlowData['bg-tens-up'] ? globalFlowData['bg-tens-up'].slice(0, limit) : [];
    let uUp = globalFlowData['bg-units-up'] ? globalFlowData['bg-units-up'].slice(0, limit) : [];
    
    let tDown = globalFlowData['bg-tens-down'] ? globalFlowData['bg-tens-down'].slice(0, limit) : [];
    let uDown = globalFlowData['bg-units-down'] ? globalFlowData['bg-units-down'].slice(0, limit) : [];

    // ฟังก์ชันจับคู่ AxA (สิบ x หน่วย)
    const genPairs = (tensArr, unitsArr) => {
        let arr = [];
        if (!tensArr.length || !unitsArr.length) return [];
        
        // วนลูป หลักสิบ x หลักหน่วย
        tensArr.forEach(t => {
            unitsArr.forEach(u => {
                let pair = t + "" + u;
                let sum = (parseInt(t) + parseInt(u)) % 10;
                // ตัดแต้มดับ
                if (killSum.length === 0 || !killSum.includes(sum)) {
                    arr.push(pair); // สร้างเลขคู่ เช่น "12"
                }
            });
        });
        // เรียงลำดับจากน้อยไปมากเพื่อความสวยงาม
        return arr.sort(); 
    };

    window.currentVinUpArr = genPairs(tUp, uUp);
    window.currentVinDownArr = genPairs(tDown, uDown);
    window.currentVinLimit = limit;

    const renderBox = (arr, tens, units) => {
        let header = `<div style="margin-bottom:8px; color:var(--txt-l); font-size:14px; font-weight:bold;">
                        สิบ (${tens ? tens.length : 0}): <span style="color:var(--p)">${tens ? tens.join('') : '-'}</span> | 
                        หน่วย (${units ? units.length : 0}): <span style="color:var(--p)">${units ? units.join('') : '-'}</span>
                      </div>`;
        if(!arr || !arr.length) return header + "<div style='color:red;'>ไม่มีชุดเลข (ถูกตัดหมด หรือข้อมูลยังไม่มา)</div>";
        
        // จัดการแสดงผล (ตัดบรรทัดให้สวยงาม)
        let lines = [];
        let chunk = 10; // แสดง 10 ตัวต่อบรรทัด
        for (let i = 0; i < arr.length; i += chunk) {
            lines.push(arr.slice(i, i + chunk).join(' - '));
        }
        let footer = `<div style="margin-top:8px; font-size:12px; color:var(--txt-l); opacity:0.8;">รวม ${arr.length} ชุด</div>`;
        
        return header + `<div style="border-top:1px dashed var(--border); padding-top:10px; line-height:1.8; font-family:monospace; font-size:15px; color:#1e293b;">${lines.join('<br>')}</div>` + footer;
    };

    document.getElementById('vinFlowUpContent').innerHTML = renderBox(window.currentVinUpArr, tUp, uUp);
    document.getElementById('vinFlowDownContent').innerHTML = renderBox(window.currentVinDownArr, tDown, uDown);
}

function copyFlowVin(type) { 
    let arr = (type === 'up') ? window.currentVinUpArr : window.currentVinDownArr; 
    let label = (type === 'up') ? 'วินบน' : 'วินล่าง'; 
    if (!arr || arr.length === 0) return; 
    let limit = window.currentVinLimit || 5; 
    let total = arr.length; 
    let formattedContent = ""; 
    for (let i = 0; i < arr.length; i += limit) {
        formattedContent += arr.slice(i, i + limit).join(' - ') + "\n"; 
    }
    let txt = `${label}ตรง จำนวน ${total} ตัว\n------------------\n${formattedContent}\nขอให้โชคดี ถูกหวย`; 
    copyText(txt); 
}

// --- แก้ไข: Smart Flow (ตัดลำดับเลขข้อออก) ---
function genSmartFlow() { 
    if (!currentData || currentData.length === 0) return alert("กรุณานำเข้าข้อมูลก่อน");
    
    const targetType = parseInt(document.getElementById('sfTarget').value);
    const len = parseInt(document.getElementById('sfLen').value) || 4;
    const lookback = parseInt(document.getElementById('sfLookback').value) || 15;

    // กำหนดเป้าหมาย (Target Definitions)
    const targetDefs = [
        { id: 0, idx: [0], name: "หลักร้อย" }, 
        { id: 1, idx: [1], name: "หลักสิบบน" }, 
        { id: 2, idx: [2], name: "หลักหน่วยบน" }, 
        // *** แก้ไขจุดนี้: พิกัดบน ให้ใช้ index [1, 2] คือ สิบบน, หน่วยบน เท่านั้น (ตัด 0 หลักร้อยออก) ***
        { id: 3, idx: [1, 2], name: "พิกัดบน (ไม่รวมร้อย)" }, 
        { id: 4, idx: [3], name: "หลักสิบล่าง" }, 
        { id: 5, idx: [4], name: "หลักหน่วยล่าง" }, 
        { id: 6, idx: [3, 4], name: "พิกัดล่าง" }, 
        { id: 7, idx: [1, 2, 3, 4], name: "บน+ล่าง (รวม)" }, 
        { id: 8, idx: [1, 2], type: 'sum', name: "แต้มบน" }, 
        { id: 9, idx: [3, 4], type: 'sum', name: "แต้มล่าง" }, 
        { id: 10, idx: [1, 2], type: 'vin', name: "วินบน (ครบ 2 ตัว)" }, 
        { id: 11, idx: [3, 4], type: 'vin', name: "วินล่าง (ครบ 2 ตัว)" }
    ];

    const selectedTarget = targetDefs[targetType];
    const intData = currentData.map(r => [parseInt(r.up[0]), parseInt(r.up[1]), parseInt(r.up[2]), parseInt(r.down[0]), parseInt(r.down[1])]);
    
    const getDigitsFromRow = (row) => { 
        let digits = []; 
        if (selectedTarget.type === 'sum') { 
            let v1 = row[selectedTarget.idx[0]]; 
            let v2 = row[selectedTarget.idx[1]]; 
            if (!isNaN(v1) && !isNaN(v2)) digits.push((v1+v2)%10); 
        } else { 
            selectedTarget.idx.forEach(idx => { 
                let d = row[idx]; if (!isNaN(d)) digits.push(d); 
            }); 
        } 
        return digits; 
    };

    let candidates = []; 
    function getCombinations(k) { 
        let result = []; 
        let set = [0,1,2,3,4,5,6,7,8,9]; 
        function backtrack(start, current) { 
            if (current.length === k) { result.push([...current]); return; } 
            for (let i = start; i < set.length; i++) { 
                current.push(set[i]); backtrack(i + 1, current); current.pop(); 
            } 
        } 
        backtrack(0, []); 
        return result; 
    }

    let allCombos = getCombinations(len);
    let scored = [];
    let startTest = Math.max(0, currentData.length - lookback);

    allCombos.forEach(digits => {
        let wins = 0; let total = 0; let historyHtml = "";
        let historyText = ""; 
        
        for(let i=startTest; i<currentData.length; i++) {
            let row = intData[i]; 
            let rowDigits = getDigitsFromRow(row); 
            let hit = false;
            
            if (selectedTarget.type === 'vin') { 
                let matches = 0; rowDigits.forEach(d => { if(digits.includes(d)) matches++; }); 
                if(matches >= rowDigits.length && rowDigits.length > 0) hit = true; 
            } else { 
                hit = rowDigits.some(d => digits.includes(d)); 
            }
            
            if(hit) wins++; total++;

            let numsStr = ""; 
            digits.forEach(d => { 
                if (rowDigits.includes(d)) numsStr += `<span class="num-match">${d}</span>`; 
                else numsStr += d; 
            });
            
            let mark = hit ? `<span class="stat-t">✓</span>` : `<span class="stat-f">✗</span>`;
            historyHtml += `<div class="row-line"><span>${numsStr}</span> <span>${mark}</span></div>`; 
            
            let r3 = currentData[i].up; let r2 = currentData[i].down;
            
            // --- แก้ไขจุดนี้: ตัดเลขลำดับข้อออก ---
            historyText += `${digits.join('')} = ${r3}-${r2} ${hit ? "✓" : "✗"}\n`;
        }
        scored.push({ key: digits.join(''), wins, total, historyHtml, historyText });
    });

    scored.sort((a, b) => b.wins - a.wins);
    let lottoName = document.getElementById('lottoSelector').options[document.getElementById('lottoSelector').selectedIndex].text.split(' ')[1] || 'หวย';
    let gridHtml = "";
    
    scored.slice(0, 5).forEach((c, idx) => {
            let percent = Math.round((c.wins/c.total)*100);
            let icon = idx===0?"🥇":(idx===1?"🥈":(idx===2?"🥉":"🎖️"));
            let fullText = `🍙 ${lottoName} ไหล${selectedTarget.name} ${c.key}\n--------------\n${c.historyText}\n${c.key}\n--------------\nถูก ${c.wins}/${c.total} (${percent}%)`;
            gridHtml += `<div class="sf-card"><div class="sf-card-header"><span>${icon} สูตรที่ ${idx+1}</span><button class="btn-copy-sf" onclick="copySingleSmartFlow(this)" data-text="${fullText}">Copy</button></div><div class="sf-card-body">${c.historyHtml}</div><div class="sf-card-footer"><span style="font-weight:bold; color:var(--p); font-size:16px;">${c.key}</span><span style="font-size:12px; color:${percent>=80?'#16a34a':'var(--txt-l)'}">ถูก ${c.wins}/${c.total} (${percent}%)</span></div></div>`;
    });
    document.getElementById('sfOutput').innerHTML = gridHtml;
}

function toggleSection(contentId, iconId) {
    const content = document.getElementById(contentId);
    const icon = document.getElementById(iconId);
    if(content.style.display === 'none') {
        content.style.display = 'block';
        icon.innerText = '▼';
    } else {
        content.style.display = 'none';
        icon.innerText = '▲';
    }
}

// Auto Load
if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode'); 
loadCurrentData();