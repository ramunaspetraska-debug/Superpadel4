window.onerror = function(msg, url, line) { console.error("Global Error: ", msg, "at line", line); return true; };

function el(id) { return document.getElementById(id); }
function safeText(id, t) { try { const e = el(id); if(e) e.innerText = t; } catch(e){} }
function safeHTML(id, h) { try { const e = el(id); if(e) e.innerHTML = h; } catch(e){} }
function safeVal(id, v) { try { const e = el(id); if(e) e.value = v; } catch(e){} }
function safeClass(id, c) { try { const e = el(id); if(e) e.className = c; } catch(e){} }
function safeDisplay(id, d) { try { const e = el(id); if(e) e.style.display = d; } catch(e){} }

function setGender(g) {
    tempGender = g;
    let btnM = el('gender-m'); let btnF = el('gender-f');
    if(btnM && btnF) {
        if(g === 'M') {
            btnM.className = 'w-9 font-bold transition-colors bg-blue-600 text-white text-[10px]';
            btnF.className = 'w-9 font-bold transition-colors text-slate-400 text-[10px]';
        } else {
            btnM.className = 'w-9 font-bold transition-colors text-slate-400 text-[10px]';
            btnF.className = 'w-9 font-bold transition-colors bg-pink-500 text-white text-[10px]';
        }
    }
}

function setEditGender(g) {
    tempEditGender = g;
    let btnM = el('edit-gender-m'); let btnF = el('edit-gender-f');
    if(btnM && btnF) {
        if(g === 'M') {
            btnM.className = 'w-10 font-bold bg-blue-600 text-white text-[10px]';
            btnF.className = 'w-10 font-bold text-slate-400 text-[10px]';
        } else {
            btnM.className = 'w-10 font-bold text-slate-400 text-[10px]';
            btnF.className = 'w-10 font-bold bg-pink-500 text-white text-[10px]';
        }
    }
}

function handleNewPhotoUpload(e) {
    try {
        const file = e.target.files[0]; if(!file) return; const r = new FileReader(); 
        r.onload = (ev) => { 
            const img = new Image(); 
            img.onload = function() { 
                const c = document.createElement('canvas'); const MAX = 256; let w = img.width, h = img.height; 
                if(w > h) { if(w > MAX){ h *= MAX/w; w = MAX; } } else { if(h > MAX){ w *= MAX/h; h = MAX; } } 
                c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); 
                curPh = c.toDataURL('image/jpeg', 0.85); 
                const pr = el('photo-preview'); if(pr) { pr.src = curPh; pr.classList.remove('hidden'); } 
                const pl = el('photo-placeholder'); if(pl) pl.classList.add('hidden'); 
            }; 
            img.src = ev.target.result; 
        }; 
        r.readAsDataURL(file);
    } catch(err) { console.error("handleNewPhotoUpload Error:", err); }
}

function handleEditPhotoUpload(e) {
    try {
        const file = e.target.files[0]; if(!file) return; const r = new FileReader(); 
        r.onload = (ev) => { 
            const img = new Image(); 
            img.onload = function() { 
                const c = document.createElement('canvas'); const MAX = 256; let w = img.width, h = img.height; 
                if(w > h) { if(w > MAX){ h *= MAX/w; w = MAX; } } else { if(h > MAX){ w *= MAX/h; h = MAX; } } 
                c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); 
                tempEditPhoto = c.toDataURL('image/jpeg', 0.85); 
                const pr = el('edit-photo-preview'); if(pr) { pr.src = tempEditPhoto; pr.classList.remove('hidden'); } 
                const pl = el('edit-photo-placeholder'); if(pl) pl.classList.add('hidden'); 
            }; 
            img.src = ev.target.result; 
        }; 
        r.readAsDataURL(file);
    } catch(err) { console.error("handleEditPhotoUpload Error:", err); }
}

function addPlayer(e) { 
    try {
        if (e) e.preventDefault(); 
        ensureTournamentId(); 
        
        const f = el('player-input-field'); 
        const n = f ? f.value.trim() : ''; 
        if(!n) return false; 
        
        const newId = uid();
        if (curPh) { photoBank[newId] = curPh; setStore('photos', photoBank); trimPhotoBankIfNeeded(); }
        
        players.push({ id: newId, name: n, gender: tempGender }); 
        
        if(f) f.value = ''; curPh = null; 
        const pr = el('photo-preview'); if(pr) { pr.classList.add('hidden'); pr.src = ''; } 
        const pl = el('photo-placeholder'); if(pl) pl.classList.remove('hidden'); 
        const pi = el('photo-input'); if(pi) pi.value = ''; 
        
        preGeneratedTournament = []; setStore('pregen', []); setGender('M'); 
        autoSave(true); render(); 
    } catch(err) { console.error("addPlayer Error:", err); }
    return false;
}

function closeModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); }

function openPlayerBank() {
    try {
        let u = new Map();
        safeArr(savedTournaments).forEach(t => { safeArr(t.players).forEach(p => { if (p && p.name) { let key = p.name.trim().toLowerCase(); if (!u.has(key)) u.set(key, p); } }); });
        const currNames = safeArr(players).map(p => p.name.trim().toLowerCase());
        let available = Array.from(u.values()).filter(p => !currNames.includes(p.name.trim().toLowerCase()));
        
        let html = '';
        if (available.length === 0) { html = '<p class="text-xs text-slate-400">Istorijoje nėra senų žaidėjų.</p>'; } 
        else { 
            available.sort((a,b) => a.name.localeCompare(b.name)).forEach(p => {
                let pPhoto = photoBank[p.id];
                let av = pPhoto ? `<img src="${pPhoto}" class="w-8 h-8 rounded-full object-cover">` : `<div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">${p.gender==='M'?'V':'M'}</div>`;
                html += `<div class="flex justify-between items-center bg-slate-50 p-2 rounded-xl border border-slate-100 mb-1"><div class="flex items-center gap-3">${av}<span class="font-bold text-sm text-slate-700">${p.name}</span></div><button onclick="addFromBank('${p.id}')" class="bg-green-100 text-green-700 px-3 py-1 rounded font-bold text-[10px] uppercase">+ Pridėti</button></div>`;
            });
        }
        safeHTML('bank-list', html); el('modal-bank').style.display = 'flex';
    } catch (e) { console.error("openPlayerBank Error:", e); }
}

function addFromBank(id) {
    try {
        let pToAdd = null; safeArr(savedTournaments).forEach(t => { safeArr(t.players).forEach(p => { if(p.id === id) pToAdd = p; }); });
        if (pToAdd && !players.find(x => x.name.trim().toLowerCase() === pToAdd.name.trim().toLowerCase())) {
            players.push({ id: pToAdd.id, name: pToAdd.name, gender: pToAdd.gender });
            preGeneratedTournament = []; setStore('pregen', []); autoSave(true); closeModals(); openPlayerBank();
        }
    } catch (e) { console.error("addFromBank Error:", e); }
}

function openEditModal(id) {
    try {
        const p = players.find(x => x.id === id); if(!p) return;
        editingPlayerId = id; tempEditGender = p.gender; tempEditPhoto = photoBank[id] || null; 
        safeVal('edit-player-name', p.name); setEditGender(p.gender);
        
        const pr = el('edit-photo-preview'), pl = el('edit-photo-placeholder');
        if(tempEditPhoto) { pr.src = tempEditPhoto; pr.classList.remove('hidden'); pl.classList.add('hidden'); } 
        else { pr.classList.add('hidden'); pr.src = ''; pl.classList.remove('hidden'); }
        el('modal-edit').style.display = 'flex';
    } catch(e) { console.error("openEditModal Error:", e); }
}

function savePlayerEdit() {
    try {
        const p = players.find(x => x.id === editingPlayerId);
        if(p) { 
            p.name = el('edit-player-name').value.trim() || p.name; p.gender = tempEditGender; 
            if (tempEditPhoto) { photoBank[p.id] = tempEditPhoto; setStore('photos', photoBank); trimPhotoBankIfNeeded(); }
            
            matches.forEach(m => {
                if(m.team1) m.team1.forEach(tp => { if(tp.id === p.id) { tp.name = p.name; tp.gender = p.gender; }});
                if(m.team2) m.team2.forEach(tp => { if(tp.id === p.id) { tp.name = p.name; tp.gender = p.gender; }});
            });
            autoSave(true); 
        }
        const epi = el('edit-photo-input'); if(epi) epi.value = ''; closeModals();
    } catch(e) { console.error("savePlayerEdit Error:", e); }
}

function removePlayer(id) { 
    try { if(confirm("Trinti žaidėją?")) { players = safeArr(players).filter(p => p && p.id !== id); preGeneratedTournament = []; setStore('pregen', []); autoSave(true); } } 
    catch(e) { console.error("removePlayer Error:", e); }
}

function openPlayerCard(name) {
    try {
        let cM = []; safeArr(savedTournaments).forEach(t => { if(t && t.id !== currentTid && Array.isArray(t.matches)) cM.push(...safeArr(t.matches)); }); cM.push(...safeArr(matches));
        let cP = []; safeArr(savedTournaments).forEach(t => { if(t && t.id !== currentTid && Array.isArray(t.players)) cP.push(...safeArr(t.players)); }); cP.push(...safeArr(players));
        const uP = []; const seen = new Set(); cP.forEach(p => { if(p && p.name && !seen.has(p.name)){ seen.add(p.name); uP.push(p); } });
        
        const stats = calculateResults(cM, uP, false).find(x => x.name === name); if(!stats) return;
        
        const pairsList = calculatePairsResults(cM, uP).filter(x => x.p1?.name === name || x.p2?.name === name);
        let bestPartner = "Nėra", maxText = "";
        if (pairsList.length > 0) {
            pairsList.sort((a,b) => b.w - a.w || b.mp - a.mp);
            let bestPair = pairsList[0];
            bestPartner = (bestPair.p1.name === name) ? bestPair.p2.name : bestPair.p1.name;
            maxText = `(${bestPair.w} pergalės iš ${bestPair.mp})`;
        }
        
        let playerMatches = cM.filter(m => m.finished && (safeArr(m.team1).some(p => p.name === name) || safeArr(m.team2).some(p => p.name === name)));
        let recentMatches = playerMatches.slice(-20);
        let rMp = recentMatches.length;
        let rW = 0, rDif = 0;
        
        recentMatches.forEach(m => {
            let isTeam1 = safeArr(m.team1).some(p => p.name === name);
            let myS = isTeam1 ? (m.score1||0) : (m.score2||0);
            let enS = isTeam1 ? (m.score2||0) : (m.score1||0);
            if (myS > enS) rW++;
            rDif += (myS - enS);
        });

        let rating = 0;
        if (rMp > 0) {
            let winRatePts = (rW / rMp) * 60;
            let avgDif = rDif / rMp;
            let difPts = Math.max(0, Math.min(30, ((avgDif + 5) / 10) * 30));
            let actPts = Math.min(stats.mp, 20) / 20 * 10;
            rating = Math.round(winRatePts + difPts + actPts);
        }

        let tierName = "Naujokas"; let barColor = "bg-slate-400"; let textColor = "text-slate-500";
        if (rating >= 85) { tierName = "Profesionalas"; barColor = "bg-gradient-to-r from-purple-500 to-fuchsia-500"; textColor = "text-purple-600"; }
        else if (rating >= 70) { tierName = "Ekspertas"; barColor = "bg-gradient-to-r from-yellow-400 to-amber-500"; textColor = "text-amber-600"; }
        else if (rating >= 55) { tierName = "Pažengęs"; barColor = "bg-gradient-to-r from-blue-400 to-indigo-500"; textColor = "text-indigo-600"; }
        else if (rating >= 40) { tierName = "Vidutiniokas"; barColor = "bg-gradient-to-r from-emerald-400 to-green-500"; textColor = "text-emerald-600"; }
        else if (rating >= 20) { tierName = "Mėgėjas"; barColor = "bg-gradient-to-r from-orange-400 to-orange-500"; textColor = "text-orange-600"; }
        
        let pPhoto = photoBank[stats.id] || null;
        let av = pPhoto ? `<img src="${pPhoto}" class="w-24 h-24 rounded-full object-cover border-4 ${stats.gender==='M'?'border-blue-500':'border-pink-500'} mx-auto mb-4 shadow-lg">` : `<div class="w-24 h-24 rounded-full ${stats.gender==='M'?'bg-blue-500':'bg-pink-500'} mx-auto mb-4 flex items-center justify-center text-3xl font-black text-white shadow-lg">${stats.gender==='M'?'V':'M'}</div>`;
        let winPerc = stats.mp > 0 ? Math.round((stats.w / stats.mp) * 100) : 0;
        
        let html = `
            <div class="relative text-center pb-4">
                <button onclick="closeModals()" class="absolute -top-2 -right-2 text-slate-400 text-2xl font-bold hover:text-slate-600 active:scale-90 transition-transform" aria-label="Uždaryti kortelę">&times;</button>
                ${av}
                <h2 class="text-2xl font-black text-slate-800 mb-1">${stats.name}</h2>
                <div class="mb-6 px-2">
                    <div class="flex justify-between items-end mb-1"><span class="text-[10px] font-black uppercase tracking-widest ${textColor}">${tierName}</span><span class="text-xs font-black text-slate-700">${rating} <span class="text-[9px] font-bold text-slate-400">/ 100</span></span></div>
                    <div class="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200/50 relative"><div class="h-full ${barColor} transition-all duration-1000 ease-out rounded-full shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)]" style="width: ${rating}%"></div></div>
                    <div class="text-[8px] text-slate-400 text-right mt-1 uppercase font-bold tracking-widest">Sportinė forma: paskutiniai ${rMp} mačai</div>
                </div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-t border-slate-100 pt-4">Bendra Karjeros Statistika</p>
                <div class="grid grid-cols-2 gap-4 mb-5"><div class="bg-slate-50 p-4 rounded-2xl border border-slate-100"><div class="text-3xl font-black text-slate-800">${stats.mp}</div><div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mačai</div></div><div class="bg-green-50 p-4 rounded-2xl border border-green-100"><div class="text-3xl font-black text-green-600">${winPerc}%</div><div class="text-[9px] font-black text-green-600 uppercase tracking-widest">Pergalės</div></div></div>
                <div class="flex justify-center gap-6 mb-6 font-bold text-sm"><div class="text-center"><span class="block text-green-600 text-xl">${stats.w}</span><span class="text-[9px] text-slate-400 uppercase">Laimėta</span></div><div class="text-center"><span class="block text-slate-400 text-xl">${stats.t}</span><span class="text-[9px] text-slate-400 uppercase">Lygios</span></div><div class="text-center"><span class="block text-red-500 text-xl">${stats.l}</span><span class="text-[9px] text-slate-400 uppercase">Pralaimėta</span></div></div>
                <div class="bg-indigo-50 p-3 rounded-xl border border-indigo-100"><div class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Geriausias Partneris</div><div class="font-bold text-indigo-900">${bestPartner} <span class="text-xs text-indigo-500 font-normal">${maxText}</span></div></div>
            </div>
        `;
        safeHTML('card-content', html); el('modal-card').style.display = 'flex';
    } catch(e) { console.error("openPlayerCard Error:", e); }
}

function render() {
    try {
        const curT = savedTournaments.find(x => x.id === currentTid);
        const tField = el('tournament-name-field');
        if(tField && document.activeElement !== tField) tField.value = curT ? curT.name : (new Date().toLocaleDateString('lt-LT') + ' Turnyras');

        renderLeaderboard(); renderPlayersList(); renderTimerAndSettings(); renderMatches();
        
        if(isMuted) { el('icon-sound-on')?.classList.add('hidden'); el('icon-sound-off')?.classList.remove('hidden'); } 
        else { el('icon-sound-on')?.classList.remove('hidden'); el('icon-sound-off')?.classList.add('hidden'); }
    } catch(e) { console.error("RenderErr:", e); }
}

function renderLeaderboard() {
    const isF = settings.format === 'fixed'; 
    const table = calculateResults(matches, players, isF); 
    const podiumContainer = el('podium-container');
    const finishedFinals = safeArr(matches).filter(m => m.isFinal && m.finished);
    
    if (finishedFinals.length > 0 && podiumContainer) {
        let firstPlace = null, secondPlace = null, thirdPlace = null;
        const grandFinal = finishedFinals.find(m => m.finalTitle === "🏆 DIDYSIS FINALAS");
        if (grandFinal) {
            const s1 = grandFinal.score1 || 0, s2 = grandFinal.score2 || 0;
            if (s1 >= s2) { firstPlace = grandFinal.team1; secondPlace = grandFinal.team2; }
            else { firstPlace = grandFinal.team2; secondPlace = grandFinal.team1; }
        }
        
        const smallFinal = finishedFinals.find(m => m.finalTitle === "🥉 MAŽASIS FINALAS");
        if (smallFinal) {
            const s1 = smallFinal.score1 || 0, s2 = smallFinal.score2 || 0;
            if (s1 >= s2) { thirdPlace = smallFinal.team1; } else { thirdPlace = smallFinal.team2; }
        }

        if (!firstPlace && finishedFinals.length > 0) {
             const f = finishedFinals[0], s1 = f.score1 || 0, s2 = f.score2 || 0;
             firstPlace = s1 >= s2 ? f.team1 : f.team2; secondPlace = s1 >= s2 ? f.team2 : f.team1;
        }
        
        let pHTML = `<div class="w-full px-4 space-y-2 mb-2"><h3 class="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest mb-3">Turnyro Čempionai</h3>`;
        const getName = (team) => safeArr(team).map(p => p.name).join(' / ');
        
        if (firstPlace) pHTML += `<div class="flex items-center bg-gradient-to-r from-yellow-100 to-yellow-50 border border-yellow-200 rounded-xl p-3 shadow-sm"><div class="text-3xl mr-3 drop-shadow-sm">🥇</div><div class="font-black text-yellow-700 text-sm truncate">${getName(firstPlace)}</div></div>`;
        if (secondPlace) pHTML += `<div class="flex items-center bg-gradient-to-r from-slate-100 to-slate-50 border border-slate-200 rounded-xl p-3 shadow-sm"><div class="text-3xl mr-3 drop-shadow-sm">🥈</div><div class="font-black text-slate-600 text-sm truncate">${getName(secondPlace)}</div></div>`;
        if (thirdPlace) pHTML += `<div class="flex items-center bg-gradient-to-r from-orange-100 to-orange-50 border border-orange-200 rounded-xl p-3 shadow-sm"><div class="text-3xl mr-3 drop-shadow-sm">🥉</div><div class="font-black text-orange-700 text-sm truncate">${getName(thirdPlace)}</div></div>`;
        
        pHTML += `</div>`; safeHTML('podium-container', pHTML); safeDisplay('podium-container', 'flex');
    } else if (podiumContainer) safeDisplay('podium-container', 'none');

    let html = table.map((s, i) => {
        let av = ''; 
        if (!isF) { 
            let pPhoto = photoBank[s.id];
            let bg = s.gender === 'M' ? 'bg-blue-600' : 'bg-pink-600', bt = s.gender === 'M' ? 'V' : 'M'; 
            av = pPhoto ? `<div class="relative w-7 h-7 shrink-0"><img src="${pPhoto}" class="w-full h-full rounded-full object-cover ${s.gender === 'M' ? 'avatar-frame-m' : 'avatar-frame-f'}"><div class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center text-[7px] text-white font-black ${bg}">${bt}</div></div>` 
                        : `<div class="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${s.gender === 'M' ? 'bg-blue-500' : 'bg-pink-500'}">${bt}</div>`;
        }
        return `<div class="flex items-center px-3 py-3 text-xs bg-white border-b border-slate-50"><div class="w-6 font-bold text-slate-400 text-[10px]">${i+1}</div><div onclick="${isF ? '' : `openPlayerCard('${s.name}')`}" class="flex-1 flex items-center gap-2 truncate font-bold text-slate-800 ${isF ? '' : 'clickable-name'}">${av}${s.name}</div><div class="stat-col text-green-600">${s.w}</div><div class="stat-col text-slate-300">${s.t}</div><div class="stat-col text-red-400">${s.l}</div><div class="stat-col ${s.dif>=0?'text-slate-600':'text-red-500'}">${s.dif>0?'+':''}${s.dif}</div><div class="stat-col-wide text-slate-900">${settings.rankingMode==='wins'?s.lp:s.sw}</div></div>`;
    }).join('');
    safeHTML('leaderboard-body', html);
}

function renderPlayersList() {
    let html = safeArr(players).map((p, idx) => {
        let pPhoto = photoBank[p.id];
        let bg = p.gender === 'M' ? 'bg-blue-600' : 'bg-pink-600', bt = p.gender === 'M' ? 'V' : 'M'; 
        let av = pPhoto ? `<div class="relative w-9 h-9 shrink-0"><img src="${pPhoto}" class="w-full h-full rounded-full object-cover ${p.gender === 'M' ? 'avatar-frame-m' : 'avatar-frame-f'}"><div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white font-black ${bg}">${bt}</div></div>`
                        : `<div class="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${p.gender === 'M' ? 'bg-blue-500' : 'bg-pink-500'}">${bt}</div>`;
        return `<div class="flex justify-between items-center bg-white p-2 rounded-xl border border-slate-100 shadow-sm"><div class="flex items-center gap-3 flex-1 cursor-pointer active:opacity-50 transition-opacity" onclick="openEditModal('${p.id}')"><span class="text-[10px] font-black text-slate-300 w-3 text-center">${idx + 1}</span>${av}<div class="font-bold text-slate-800 text-sm">${p.name}</div></div><button type="button" onclick="removePlayer('${p.id}')" class="text-red-300 text-xl font-bold px-2 active:scale-90" aria-label="Pašalinti žaidėją">&times;</button></div>`;
    }).join('');
    safeHTML('players-list', html);
}

function renderTimerAndSettings() {
    const isSc = settings.winCondition === 'score'; 
    safeClass('mode-time', !isSc ? "flex-1 py-1.5 text-[10px] font-black rounded-md bg-white shadow text-slate-900 uppercase" : "flex-1 py-1.5 text-[10px] font-bold text-slate-400 uppercase"); 
    safeClass('mode-score', isSc ? "flex-1 py-1.5 text-[10px] font-black rounded-md bg-white shadow text-slate-900 uppercase" : "flex-1 py-1.5 text-[10px] font-bold text-slate-400 uppercase"); 
    safeDisplay('control-duration', !isSc ? 'block' : 'none'); safeDisplay('control-points', !isSc ? 'none' : 'block'); safeDisplay('score-mode-text', isSc ? 'block' : 'none'); safeDisplay('timer-controls', isSc ? 'none' : 'flex');
    if(isSc) safeText('score-mode-text', `IKI ${settings.maxPoints} TAŠKŲ`);
    
    const m = Math.floor(timeLeft/60).toString().padStart(2,'0'), sec = (timeLeft%60).toString().padStart(2,'0'); 
    safeText('timer-display', `${m}:${sec}`); safeText('val-duration', settings.matchDuration); safeText('val-points', settings.maxPoints); safeText('player-count', "Viso: " + players.length); 
    safeVal('select-format', settings.format); safeVal('select-ranking', settings.rankingMode);

    const btnFinals = el('btn-generate-finals');
    if(btnFinals) btnFinals.className = (safeArr(matches).some(m => m.finished)) ? "px-4 py-3 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 text-white font-black shadow-lg shadow-amber-200 text-[10px] active:scale-95 transition-transform tracking-widest uppercase" : "hidden";
}

function renderMatches() {
    const active = safeArr(matches).filter(m => !m.finished);
    let aHtml = active.map(m => {
        let t1 = m.team1.map(p => `<span class="font-bold text-sm text-slate-700">${p.name}</span>`).join('');
        let t2 = m.team2.map(p => `<span class="font-bold text-sm text-slate-700">${p.name}</span>`).join(''); 
        let headT = m.isFinal ? m.finalTitle : `RAUNDAS ${m.round}`;
        let headC = m.isFinal ? (m.finalBg || 'bg-slate-800') : 'bg-slate-800';
        return `<div class="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden mb-4"><div class="${headC} text-white px-4 py-1.5 text-[9px] font-black tracking-widest flex justify-between items-center uppercase"><span>AIKŠTELĖ ${m.court}</span><span>${headT}</span></div><div class="p-4"><div class="flex justify-between items-center mb-3"><div class="flex flex-col gap-1">${t1}</div><div class="flex items-center gap-2"><button type="button" onclick="updSc('${m.id}',1,-1)" class="w-8 h-8 bg-slate-50 border rounded font-bold" aria-label="Minus taškas">-</button><span class="text-2xl font-black w-8 text-center">${m.score1||0}</span><button type="button" onclick="updSc('${m.id}',1,1)" class="w-8 h-8 bg-green-500 text-white rounded font-bold" aria-label="Plius taškas">+</button></div></div><div class="flex justify-between items-center mb-5"><div class="flex flex-col gap-1">${t2}</div><div class="flex items-center gap-2"><button type="button" onclick="updSc('${m.id}',2,-1)" class="w-8 h-8 bg-slate-50 border rounded font-bold" aria-label="Minus taškas">-</button><span class="text-2xl font-black w-8 text-center">${m.score2||0}</span><button type="button" onclick="updSc('${m.id}',2,1)" class="w-8 h-8 bg-green-500 text-white rounded font-bold" aria-label="Plius taškas">+</button></div></div><button type="button" onclick="finM('${m.id}')" class="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest">Užbaigti Mačą</button></div></div>`;
    }).join('');
    safeHTML('matches-container', aHtml);
    
    const fin = safeArr(matches).filter(m => m.finished).reverse(); 
    let fHtml = fin.length ? '<h3 class="text-[9px] font-black text-slate-400 uppercase mb-3 tracking-widest">Paskutiniai mačai</h3>' : ''; 
    fHtml += fin.map(m => {
        let n1 = m.team1.map(p=>p.name).join('/'), n2 = m.team2.map(p=>p.name).join('/'); 
        let badge = m.isFinal ? `<span class="match-number-badge !bg-yellow-100 !text-yellow-700 border border-yellow-200">🏆</span>` : `<span class="match-number-badge">R${m.round}</span>`;
        return `<div class="bg-white p-3 rounded-xl border mb-2 flex justify-between items-center text-[11px]"><div class="flex items-center truncate">${badge}<div class="truncate font-bold text-slate-600">${n1} vs ${n2}</div></div><div class="flex items-center gap-3 shrink-0 pl-2"><div class="font-black bg-slate-100 px-2 py-1 rounded text-slate-800">${m.score1||0}:${m.score2||0}</div><button type="button" onclick="undoM('${m.id}')" class="text-red-400 font-bold uppercase text-[9px]">Taisyti</button></div></div>`;
    }).join('');
    safeHTML('finished-matches-container', fHtml);
}

function shareResultsAsImage() {
    try {
        el('loading-overlay').style.display = 'flex'; safeText('loading-text', "Kuriama HD nuotrauka...");
        const target = el('leaderboard-capture-target'); const title = el('tournament-name-field').value || "Turnyro Rezultatai";
        const wrapper = document.createElement('div');
        wrapper.style.position = 'absolute'; wrapper.style.left = '-9999px'; wrapper.style.top = '0'; wrapper.style.width = '450px'; wrapper.style.padding = '20px'; wrapper.style.background = '#f8fafc'; 
        
        const header = document.createElement('div'); header.style.textAlign = 'center'; header.style.marginBottom = '20px'; 
        header.innerHTML = `<h1 style="font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 4px; line-height: 1; letter-spacing: -1px;">superpadel<span style="color: #16a34a;">.lt</span></h1><h2 style="font-size: 14px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">${title}</h2>`;
        
        const content = target.cloneNode(true); content.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'; content.style.border = '1px solid #e2e8f0'; content.style.borderRadius = '16px'; content.style.backgroundColor = '#ffffff'; content.style.overflow = 'hidden';

        const footer = document.createElement('div'); footer.style.textAlign = 'center'; footer.style.fontSize = '10px'; footer.style.color = '#cbd5e1'; footer.style.fontWeight = '900'; footer.style.marginTop = '20px'; footer.style.textTransform = 'uppercase'; footer.style.letterSpacing = '1px'; footer.innerText = "Sugeneruota su www.superpadel.lt";
        
        wrapper.appendChild(header); wrapper.appendChild(content); wrapper.appendChild(footer); document.body.appendChild(wrapper);

        setTimeout(() => {
            html2canvas(wrapper, { scale: 3, backgroundColor: "#f8fafc", useCORS: true, logging: false }).then(canvas => {
                document.body.removeChild(wrapper); el('loading-overlay').style.display = 'none'; safeText('loading-text', "Kraunama..."); 
                const imgData = canvas.toDataURL('image/png', 1.0);
                if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
                    canvas.toBlob(blob => { const file = new File([blob], `${title.replace(/\s+/g, '_')}_rezultatai.png`, { type: "image/png" }); navigator.share({ files: [file], title: title }).catch(e => console.error("Share error:", e)); });
                } else {
                    const link = document.createElement('a'); link.download = `${title.replace(/\s+/g, '_')}_rezultatai.png`; link.href = imgData; link.click();
                }
            }).catch(err => { if(document.body.contains(wrapper)) document.body.removeChild(wrapper); el('loading-overlay').style.display = 'none'; alert("Klaida generuojant vaizdą: " + err); });
        }, 250);
    } catch(e) { console.error("shareResultsAsImage Error:", e); el('loading-overlay').style.display = 'none'; }
}

function renderGlobalStats() {
    try {
        const tSel = el('stat-tournament'); let tVal = tSel ? tSel.value : 'CURRENT';
        if (tSel) {
            let opts = `<option value="CURRENT">Dabartinis turnyras</option><option value="ALL">Visi turnyrai (Bendra)</option>` + safeArr(savedTournaments).map(t => `<option value="${t.id}">${t.name} (${new Date(t.date).toLocaleDateString('lt-LT')})</option>`).join('');
            tSel.innerHTML = opts; if(tSel.querySelector(`option[value="${tVal}"]`)) tSel.value = tVal;
        }
        
        const tF = el('stat-tournament')?.value || 'CURRENT'; const gF = el('stat-gender')?.value || 'ALL';
        let cM = [], cP = [];
        if(tF === 'ALL') { 
            safeArr(savedTournaments).forEach(t => { if (currentTid && t.id === currentTid) return; cM.push(...safeArr(t.matches)); cP.push(...safeArr(t.players)); }); 
            if(matches.length > 0) cM.push(...matches); if(players.length > 0) cP.push(...players); 
        } else if(tF === 'CURRENT') { cM = [...matches]; cP = [...players]; } else { const t = savedTournaments.find(x => x.id === tF); if(t){ cM = [...t.matches]; cP = [...t.players]; } }
        
        const uP = Array.from(new Map(cP.filter(p => p && p.name).map(p => [p.name, p])).values());
        const pSel = el('stat-player'); let pVal = pSel ? pSel.value : 'ALL';
        
        if(pSel) {
            pSel.innerHTML = '<option value="ALL">Visi žaidėjai</option>' + uP.sort((a,b)=>a.name.localeCompare(b.name)).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
            if(pSel.querySelector(`option[value="${pVal}"]`)) pSel.value = pVal;
        }
        
        const pF = el('stat-player')?.value || 'ALL';
        safeClass('stat-type-indiv', statType === 'indiv' ? "flex-1 py-1.5 text-[10px] font-black rounded-md bg-white shadow text-slate-900 uppercase" : "flex-1 py-1.5 text-[10px] font-bold text-slate-400 uppercase"); 
        safeClass('stat-type-pairs', statType === 'pairs' ? "flex-1 py-1.5 text-[10px] font-black rounded-md bg-white shadow text-slate-900 uppercase" : "flex-1 py-1.5 text-[10px] font-bold text-slate-400 uppercase");
        
        let html = '';
        if (statType === 'indiv') {
            const list = calculateResults(cM, uP, false).filter(x => (gF==='ALL' || x.gender===gF) && (pF==='ALL' || x.name===pF));
            html = list.map((s, i) => `<div class="flex items-center px-3 py-3 text-[11px] bg-white border-b border-slate-50"><div class="w-6 text-slate-400 font-bold">${i+1}</div><div onclick="openPlayerCard('${s.name}')" class="flex-1 truncate font-bold text-slate-800 clickable-name">${s.name}</div><div class="stat-col">${s.mp}</div><div class="stat-col text-green-600">${s.w}</div><div class="stat-col text-slate-300">${s.t}</div><div class="stat-col text-red-400">${s.l}</div><div class="stat-col-wide">${s.mp>0?Math.round((s.w/s.mp)*100):0}%</div></div>`).join('');
        } else {
            const list = calculatePairsResults(cM, uP).filter(x => (pF === 'ALL' || x.p1?.name === pF || x.p2?.name === pF));
            html = list.map((s, i) => `<div class="flex items-center px-3 py-3 text-[11px] bg-white border-b border-slate-50"><div class="w-6 text-slate-400 font-bold">${i+1}</div><div class="flex-1 font-bold text-slate-800">${s.name}</div><div class="stat-col">${s.mp}</div><div class="stat-col text-green-600">${s.w}</div><div class="stat-col text-slate-300">${s.t}</div><div class="stat-col text-red-400">${s.l}</div><div class="stat-col-wide">${s.mp>0?Math.round((s.w/s.mp)*100):0}%</div></div>`).join('');
        }
        safeHTML('global-stats-body', html);
    } catch(e) { console.error("renderGlobalStats Error:", e); }
}

function setMode(m) { settings.winCondition = m; resetTimer(); autoSave(true); }
function changeSetting(k, v) { settings[k] = Math.max(1, (settings[k]||0)+v); if(k==='matchDuration') resetTimer(); autoSave(true); }
function changeFormat(v) { settings.format = v; preGeneratedTournament = []; setStore('pregen', []); autoSave(true); }
function changeRanking(v) { settings.rankingMode = v; autoSave(true); }

function updSc(id, t, v) { const m = matches.find(x=>x.id===id); if(m){ if(t===1) m.score1=Math.max(0, (m.score1||0)+v); else m.score2=Math.max(0, (m.score2||0)+v); liveUpdateMatches(); } }
function finM(id) { const m = matches.find(x=>x.id===id); if(m){ m.finished=true; liveUpdateMatches(); } }
function undoM(id) { const m = matches.find(x=>x.id===id); if(m){ m.finished=false; liveUpdateMatches(); } }
function resetScores() { if(confirm("Pradėti NAUJĄ turnyrą?")) { currentTid = null; matches = []; players = []; preGeneratedTournament = []; setStore('pregen', []); const tF=el('tournament-name-field'); if(tF) tF.value=''; ensureTournamentId(); autoSave(true); switchView('setup'); } }
function deleteHistory(id) { if(confirm("Trinti?")) { savedTournaments = savedTournaments.filter(x => x.id !== id); if(currentTid===id){ currentTid=null; matches=[]; players=[]; preGeneratedTournament=[]; setStore('pregen',[]); const tF=el('tournament-name-field'); if(tF) tF.value=''; ensureTournamentId(); switchView('setup'); } autoSave(true); renderHistoryList(); } }

function toggleMute() { isMuted = !isMuted; localStorage.setItem('sp_is_muted', isMuted.toString()); render(); }

function speakAnnouncement(text) {
    if(isMuted) return;
    try {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US'; utterance.rate = 1.0; utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        }
    } catch(e) { console.error("Speech Error:", e); }
}

function triggerAlarm() { 
    if(alarmInterval) return; 
    playBuzzer(); alarmInterval = setInterval(playBuzzer, 2000); updateTimerUI(); 
    alarmTimeout = setTimeout(() => { if(alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; updateTimerUI(); } }, 5500); 
}

function playBuzzer() { 
    if(isMuted) return;
    try { 
        const ctx = new (window.AudioContext || window.webkitAudioContext)(); 
        const o = ctx.createOscillator(); 
        o.type = 'sawtooth'; o.frequency.setValueAtTime(130, ctx.currentTime); o.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 1.5); 
    } catch(e){ console.error("Buzzer Error:", e); } 
}

function toggleTimer() { 
    if(settings.winCondition==='score') return; 
    if(alarmInterval) { clearInterval(alarmInterval); alarmInterval=null; if(alarmTimeout) { clearTimeout(alarmTimeout); alarmTimeout = null; } resetTimer(); return; } 
    
    if(isRunning) { clearInterval(timerInterval); isRunning=false; } 
    else { 
        if(timeLeft <= 0) return; 
        isRunning = true; endTime = Date.now() + (timeLeft * 1000); 
        if (!isMuted && 'speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));

        timerInterval = setInterval(() => { 
            const d = Math.ceil((endTime - Date.now())/1000); 
            if(d > 0) { 
                if (d === 300 && timeLeft !== 300) speakAnnouncement("Five minutes left");
                if (d === 60 && timeLeft !== 60) speakAnnouncement("One minute left");
                timeLeft = d; updateTimerUI(); 
            } else { 
                timeLeft = 0; clearInterval(timerInterval); isRunning = false; triggerAlarm(); 
            } 
        }, 1000); 
    } 
    updateTimerUI(); 
}

function updateTimerUI() { 
    const m = Math.floor(timeLeft/60).toString().padStart(2,'0'), s = (timeLeft%60).toString().padStart(2,'0'); 
    safeText('timer-display', `${m}:${s}`); 
    const b = el('btn-play'), i1=el('icon-play'), i2=el('icon-pause'), i3=el('icon-stop'); 
    if(i1 && i2 && i3 && b) { 
        i1.classList.add('hidden'); i2.classList.add('hidden'); i3.classList.add('hidden'); 
        if(alarmInterval) { b.className="w-10 h-10 rounded-full flex items-center justify-center bg-red-600"; i3.classList.remove('hidden'); } 
        else if(isRunning) { b.className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-100 text-orange-600"; i2.classList.remove('hidden'); } 
        else { b.className="w-10 h-10 rounded-full flex items-center justify-center bg-green-600 text-white shadow-lg"; i1.classList.remove('hidden'); } 
    } 
}

function resetTimer() { 
    timeLeft = settings.matchDuration * 60; isRunning = false; 
    if(timerInterval) clearInterval(timerInterval); 
    if(alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; }
    if(alarmTimeout) { clearTimeout(alarmTimeout); alarmTimeout = null; }
    updateTimerUI(); 
}

function adjustTime(s) { if(!isRunning) { timeLeft = Math.max(0, timeLeft + s); updateTimerUI(); } }

function switchView(n) { 
    document.querySelectorAll('.view-section').forEach(e => e.classList.remove('active')); 
    document.querySelectorAll('.nav-btn').forEach(e => e.classList.remove('active')); 
    el('view-' + n)?.classList.add('active'); el('nav-' + n)?.classList.add('active'); 
    if(n==='stats') renderGlobalStats(); else if(n==='history') renderHistoryList(); else if(n==='admin') renderAdmin(); else if(n==='superadmin') loadSuperAdmin(); else render(); 
}

function renderHistoryList() { 
    let h = savedTournaments.map(t => `<div class="bg-white p-4 rounded-xl border mb-2 ${t.id===currentTid?'border-green-400 shadow-md':'border-slate-200'}"><div class="flex justify-between mb-1"><div class="font-bold text-slate-800 text-sm">${t.name}</div><div class="text-[9px] bg-slate-100 px-2 py-1 rounded font-black uppercase text-slate-500">${t.settings?.format || '---'}</div></div><div class="text-[10px] text-slate-400 mb-3">${new Date(t.date).toLocaleString('lt-LT')}</div><div class="flex gap-2"><button type="button" onclick="loadHistory('${t.id}')" class="flex-1 py-2 bg-blue-50 text-blue-600 rounded-lg font-bold text-xs uppercase">Užkrauti</button><button type="button" onclick="deleteHistory('${t.id}')" class="flex-1 py-2 bg-red-50 text-red-600 rounded-lg font-bold text-xs uppercase">Trinti</button></div></div>`).join(''); 
    safeHTML('history-list', h); 
}

function loadHistory(id) { 
    const t = savedTournaments.find(x => x.id === id); 
    if(t && confirm("Užkrauti?")) { 
        players = [...safeArr(t.players)]; matches = [...safeArr(t.matches)]; settings = {...ds, ...t.settings}; currentTid = id; preGeneratedTournament = []; setStore('tid', id); 
        const tF = el('tournament-name-field'); if (tF) tF.value = t.name || '';
        resetTimer(); autoSave(true); switchView('matches'); 
    } 
}

function adminClick() { adminClickCount++; clearTimeout(adminTimer); adminTimer = setTimeout(() => { adminClickCount = 0; }, 1000); if (adminClickCount >= 5) { const p = prompt("Slaptažodis:"); if (p === "123") switchView('admin'); else if (p === "superadmin123") { switchView('superadmin'); loadSuperAdmin(); } adminClickCount = 0; } }

function loadSuperAdmin() { 
    ensureFirebaseInit(); safeHTML('superadmin-rooms-list', '<div class="text-center py-4">Ieškoma...</div>'); 
    firebase.database().ref(REG_KEY).once('value').then(snap => { 
        const r = snap.val(); if(!r) { safeHTML('superadmin-rooms-list', 'Nerasta.'); return; } 
        let h = Object.keys(r).map(k => `<div class="flex justify-between items-center p-3 bg-slate-50 rounded-lg border mb-2"><span class="font-bold">${k}</span><div class="flex gap-2"><button type="button" onclick="superAdminJoin('${k}')" class="bg-green-100 text-green-600 px-2 py-1 rounded text-[10px]">ĮEITI</button><button type="button" onclick="superAdminDelete('${k}')" class="bg-red-100 text-red-600 px-2 py-1 rounded text-[10px]">TRINTI</button></div></div>`).join(''); safeHTML('superadmin-rooms-list', h); 
    }); 
    firebase.database().ref(DB_KEY + '_global_stats').once('value').then(snap => {
        const stats = snap.val(); if (!stats) { safeHTML('superadmin-stats', '<div class="text-xs text-slate-500">Nėra duomenų.</div>'); return; }
        const visits = stats.visits || 0; const devices = stats.devices || {}; const uniqueCount = Object.keys(devices).length;
        const types = { 'iOS': 0, 'Android': 0, 'Mac': 0, 'Windows': 0, 'Kitas': 0 }; Object.values(devices).forEach(d => { if (d.type && types[d.type] !== undefined) types[d.type]++; else types['Kitas']++; });
        let typesHtml = Object.keys(types).filter(k => types[k] > 0).map(k => `<span class="text-[10px] bg-slate-100 px-2 py-1 rounded mr-1 mb-1 border border-slate-200 text-slate-600 font-bold">${k}: ${types[k]}</span>`).join('');
        let html = `<div class="flex justify-between items-center border-b border-slate-100 pb-2 mb-2"><span class="text-xs font-bold text-slate-500">Puslapio atvertimai:</span> <span class="text-green-600 text-xl font-black">${visits}</span></div><div class="flex justify-between items-center border-b border-slate-100 pb-2 mb-2"><span class="text-xs font-bold text-slate-500">Unikalūs įrenginiai:</span> <span class="text-blue-600 text-xl font-black">${uniqueCount}</span></div><div class="text-[10px] text-slate-400 mt-2 uppercase font-black tracking-widest mb-1">Įrenginių sistemos:</div><div class="flex flex-wrap">${typesHtml}</div>`;
        safeHTML('superadmin-stats', html);
    }).catch(e => { safeHTML('superadmin-stats', '<div class="text-xs text-red-500">Klaida gaunant duomenis.</div>'); });
}

function superAdminJoin(rn) { safeVal('fb-room', rn); initFirebaseConnection(); switchView('setup'); }
function superAdminDelete(rn) { if(confirm(`Trinti ${rn}?`)) { ensureFirebaseInit(); firebase.database().ref(DB_KEY+'/'+rn).remove(); firebase.database().ref(REG_KEY+'/'+rn).remove(); loadSuperAdmin(); } }
function renderAdmin() { let tHtml = savedTournaments.map(t => `<div class="flex justify-between items-center p-2 bg-slate-50 mb-1 rounded"><span>${t.name}</span><button onclick="adminDeleteTournament('${t.id}')" class="text-red-500">Trinti</button></div>`).join(''); safeHTML('admin-tournaments-list', tHtml); const uP = Array.from(new Map(players.map(p => [p.id, p])).values()); let pHtml = uP.map(p => `<div class="flex justify-between p-2 text-xs border-b"><span>${p.name}</span><button onclick="adminDeletePlayer('${p.id}')" class="text-red-400">Šalinti</button></div>`).join(''); safeHTML('admin-players-list', pHtml); }
function adminDeleteTournament(id) { if(confirm("Trinti?")) { savedTournaments = savedTournaments.filter(x => x.id !== id); autoSave(true); renderAdmin(); } }
function adminDeletePlayer(id) { if(confirm("Šalinti?")) { players = players.filter(p => p.id !== id); autoSave(true); renderAdmin(); } }
function setStatType(t) { statType = t; renderGlobalStats(); }