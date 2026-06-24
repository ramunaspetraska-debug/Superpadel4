window.onerror = function(msg, url, line) { console.error("Global Error: ", msg, "at line", line); return true; };

function esc(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[m]);
}

document.addEventListener('click', e => {
    const elPlayer = e.target.closest('[data-player]');
    if (elPlayer) openPlayerCard(elPlayer.dataset.player);
});

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
            btnM.className = 'w-9 font-bold transition-colors bg-blue-600 text-white text-[10px] shadow-inner';
            btnF.className = 'w-9 font-bold transition-colors text-slate-400 text-[10px]';
        } else {
            btnM.className = 'w-9 font-bold transition-colors text-slate-400 text-[10px]';
            btnF.className = 'w-9 font-bold transition-colors bg-pink-500 text-white text-[10px] shadow-inner';
        }
    }
}

function setEditGender(g) {
    tempEditGender = g;
    let btnM = el('edit-gender-m'); let btnF = el('edit-gender-f');
    if(btnM && btnF) {
        if(g === 'M') {
            btnM.className = 'w-10 font-bold bg-blue-600 text-white text-[10px] shadow-inner';
            btnF.className = 'w-10 font-bold text-slate-400 text-[10px]';
        } else {
            btnM.className = 'w-10 font-bold text-slate-400 text-[10px]';
            btnF.className = 'w-10 font-bold bg-pink-500 text-white text-[10px] shadow-inner';
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
        if (curPh) { photoBank[newId] = curPh; setStore('photos', photoBank); trimPhotoBankIfNeeded(); if (typeof uploadPhotoToRoom === 'function') uploadPhotoToRoom(newId, curPh); }
        
        players.push({ id: newId, name: n, gender: tempGender, rating: 300, tier: "D" }); 
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
        const roomName = document.getElementById('fb-room')?.value?.trim();
        if (!roomName) {
            alert("Norėdami naudoti žaidėjų DB, pirmiausia prisijunkite prie Kambario skiltyje 'Debesis'.");
            return;
        }

        safeHTML('bank-list', '<p class="text-xs text-slate-400 text-center py-4">Kraunama kambario DB...</p>');
        let modalBank = el('modal-bank');
        if(modalBank) modalBank.style.display = 'flex';

        firebase.database().ref("padelio_rooms/" + roomName + "/casual_players").once('value').then(snap => {
            const data = snap.val();
            const currNames = safeArr(players).map(p => p.name.trim().toLowerCase());
            
            let html = '';
            if (!data) { 
                html = '<p class="text-xs text-slate-400 text-center py-4">Šiame kambaryje dar nėra sukaupta žaidėjų istorijos.</p>'; 
            } else {
                let available = Object.values(data).filter(p => p && p.name && !currNames.includes(p.name.trim().toLowerCase()));
                if(available.length === 0) {
                    html = '<p class="text-xs text-slate-400 text-center py-4">Visi šio kambario žaidėjai jau yra pridėti.</p>';
                } else {
                    available.sort((a,b) => a.name.localeCompare(b.name)).forEach(p => {
                        let htmlGenderBg = p.gender === 'F' ? 'bg-pink-500' : 'bg-blue-500';
                        html += `
                            <div class="flex justify-between items-center bg-white p-2 rounded-xl border border-slate-100 mb-1 shadow-sm">
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-full ${htmlGenderBg} flex items-center justify-center text-xs font-bold text-white">${p.gender==='F'?'M':'V'}</div>
                                    <div>
                                        <span class="font-bold text-sm text-slate-700 block leading-tight">${esc(p.name)}</span>
                                        <span class="text-[9px] font-black text-slate-400 uppercase">ELO: ${p.rating || 300} (${p.tier || 'D'})</span>
                                    </div>
                                </div>
                                <button onclick="addFromCloudBank('${esc(p.id)}', '${esc(p.name)}', '${esc(p.gender||'M')}', ${p.rating||300}, '${esc(p.tier||'D')}')" class="bg-green-100 text-green-600 hover:bg-green-200 px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase transition-colors"><i class="fa-solid fa-plus"></i></button>
                            </div>`;
                    });
                }
            }
            safeHTML('bank-list', html);
        }).catch(err => {
            console.error(err);
            safeHTML('bank-list', '<p class="text-xs text-red-500 text-center py-4">Nepavyko pasiekti debesies.</p>');
        });
    } catch (e) { console.error("openPlayerBank Error:", e); }
}

function addFromCloudBank(id, name, gender, rating, tier) {
    try {
        if (!players.find(x => x.id === id || x.name.trim().toLowerCase() === name.trim().toLowerCase())) {
            players.push({ id: id, name: name, gender: gender, rating: rating, tier: tier });
            preGeneratedTournament = []; setStore('pregen', []); autoSave(true); 
            closeModals(); openPlayerBank();
        }
    } catch (e) { console.error("addFromCloudBank Error:", e); }
}

function openEditModal(id) {
    try {
        const p = players.find(x => x.id === id); if(!p) return;
        editingPlayerId = id; tempEditGender = p.gender; tempEditPhoto = photoBank[id] || null; 
        safeVal('edit-player-name', p.name); setEditGender(p.gender);
        
        const pr = el('edit-photo-preview'), pl = el('edit-photo-placeholder');
        if(tempEditPhoto) { if(pr) pr.src = tempEditPhoto; pr?.classList.remove('hidden'); pl?.classList.add('hidden'); } 
        else { pr?.classList.add('hidden'); if(pr) pr.src = ''; pl?.classList.remove('hidden'); }
        let modalEdit = el('modal-edit');
        if(modalEdit) modalEdit.style.display = 'flex';
    } catch(e) { console.error("openEditModal Error:", e); }
}

function savePlayerEdit() {
    try {
        const p = players.find(x => x.id === editingPlayerId);
        if(p) { 
            let nameField = el('edit-player-name');
            p.name = nameField ? (nameField.value.trim() || p.name) : p.name; p.gender = tempEditGender; 
            if (tempEditPhoto) { photoBank[p.id] = tempEditPhoto; setStore('photos', photoBank); trimPhotoBankIfNeeded(); if (typeof uploadPhotoToRoom === 'function') uploadPhotoToRoom(p.id, tempEditPhoto); }
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
    try { if(confirm("Trinti žaidėją iš šio turnyro?")) { players = safeArr(players).filter(p => p && p.id !== id); preGeneratedTournament = []; setStore('pregen', []); autoSave(true); } } 
    catch(e) { console.error("removePlayer Error:", e); }
}

// Geriausias partneris (Variantas 2): suglodintas rezultatas (w + 0.5·lygiosios + 1) / (mačai + 2)
//   — vertina pergales IR lygiąsias, švelniai nuvertina 1 mačo atsitiktinumus, NIEKO neišmeta.
//   Skirtukai: taškų skirtumas (sd) → daugiau mačų. matchesArr riboja apimtį (visi turnyrai = karjera; tik dabartinis = šis turnyras).
//   Grąžina {partnerName, text} arba null.
function computeBestPartner(matchesArr, playersArr, name) {
    const list = calculatePairsResults(matchesArr, playersArr).filter(x => x.p1?.name === name || x.p2?.name === name);
    if (list.length === 0) return null;
    const smooth = p => ((p.w || 0) + 0.5 * (p.t || 0) + 1) / ((p.mp || 0) + 2);
    list.sort((a,b) => (smooth(b) - smooth(a)) || ((b.sd || 0) - (a.sd || 0)) || (b.mp - a.mp));
    const bp = list[0];
    const partnerName = esc((bp.p1.name === name) ? bp.p2.name : bp.p1.name);
    const sd = bp.sd || 0;
    const sdTxt = (sd > 0 ? '+' : '') + sd;
    const tiesTxt = (bp.t > 0) ? `, ${bp.t} lyg.` : '';
    return { partnerName, text: `(${bp.w} perg.${tiesTxt} iš ${bp.mp} · ${sdTxt})` };
}

function openPlayerCard(name) {
    try {
        let cM = []; safeArr(savedTournaments).forEach(t => { if(t && t.id !== currentTid && Array.isArray(t.matches)) cM.push(...safeArr(t.matches)); }); cM.push(...safeArr(matches));
        let cP = []; safeArr(savedTournaments).forEach(t => { if(t && t.id !== currentTid && Array.isArray(t.players)) cP.push(...safeArr(t.players)); }); cP.push(...safeArr(players));
        const uP = []; const seen = new Set(); cP.forEach(p => { if(p && p.name && !seen.has(p.name)){ seen.add(p.name); uP.push(p); } });
        
        const stats = calculateResults(cM, uP, false).find(x => x.name === name); if(!stats) return;
        // C variantas: karjeros (visų turnyrų) IR šio turnyro geriausias partneris.
        const careerBP = computeBestPartner(cM, uP, name);
        const tournBP = computeBestPartner(safeArr(matches), uP, name);
        let bestPartner = careerBP ? careerBP.partnerName : "Nėra";
        let maxText = careerBP ? careerBP.text : "";
        
        let globalRating = 300;
        let tierName = "D (Naujokas)";
        let barColor = "bg-green-500";
        let textColor = "text-green-600";

        let localP = players.find(x => x.name === name);
        if (localP && localP.rating) { globalRating = localP.rating; }

        if (globalRating >= 851) { tierName = "A (Ekspertas)"; barColor = "bg-gradient-to-r from-red-500 to-red-600"; textColor = "text-red-600"; }
        else if (globalRating >= 671) { tierName = "B (Patyręs)"; barColor = "bg-gradient-to-r from-purple-500 to-purple-600"; textColor = "text-purple-600"; }
        else if (globalRating >= 501) { tierName = "C (Pažengęs)"; barColor = "bg-gradient-to-r from-blue-500 to-blue-600"; textColor = "text-blue-600"; }
        else if (globalRating >= 351) { tierName = "D/C- (Pradedantysis)"; barColor = "bg-gradient-to-r from-teal-400 to-teal-500"; textColor = "text-teal-600"; }
        else { tierName = "D (Naujokas)"; barColor = "bg-gradient-to-r from-green-400 to-green-500"; textColor = "text-green-600"; }

        let pPhoto = photoBank[stats.id] || null;
        let av = pPhoto ? `<img src="${pPhoto}" class="w-24 h-24 rounded-full object-cover border-4 ${stats.gender==='F'?'border-pink-500':'border-blue-500'} mx-auto mb-4 shadow-lg">` : `<div class="w-24 h-24 rounded-full ${stats.gender==='F'?'bg-pink-500':'bg-blue-500'} mx-auto mb-4 flex items-center justify-center text-3xl font-black text-white shadow-lg">${stats.gender==='F'?'M':'V'}</div>`;
        let winPerc = stats.mp > 0 ? Math.round((stats.w / stats.mp) * 100) : 0;
        
        let html = `
            <div class="relative text-center pb-4">
                <button onclick="closeModals()" class="absolute -top-2 -right-2 text-slate-400 hover:text-slate-600 active:scale-90 transition-transform p-2"><i class="fa-solid fa-xmark text-xl"></i></button>
                ${av}
                <h2 class="text-2xl font-black text-slate-800 mb-1">${esc(stats.name)}</h2>
                <div class="mb-6 px-2">
                    <div class="flex justify-between items-end mb-1"><span class="text-[10px] font-black uppercase tracking-widest ${textColor}">${tierName}</span><span class="text-xs font-black text-slate-700">${globalRating} <span class="text-[9px] font-bold text-slate-400">/ 1000 pts</span></span></div>
                    <div class="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner relative"><div class="h-full ${barColor} transition-all duration-1000 ease-out rounded-full" style="width: ${(globalRating / 1000) * 100}%"></div></div>
                </div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-t border-slate-100 pt-4">Vietinė Karjeros Statistika</p>
                <div class="grid grid-cols-2 gap-4 mb-5"><div class="bg-slate-50 p-4 rounded-2xl border border-slate-100"><div class="text-3xl font-black text-slate-800">${stats.mp}</div><div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mačai</div></div><div class="bg-green-50 p-4 rounded-2xl border border-green-100"><div class="text-3xl font-black text-green-600">${winPerc}%</div><div class="text-[9px] font-black text-green-600 uppercase tracking-widest">Pergalės</div></div></div>
                <div class="flex justify-center gap-6 mb-6 font-bold text-sm"><div class="text-center"><span class="block text-green-600 text-xl">${stats.w}</span><span class="text-[9px] text-slate-400 uppercase">Laimėta</span></div><div class="text-center"><span class="block text-slate-400 text-xl">${stats.t}</span><span class="text-[9px] text-slate-400 uppercase">Lygios</span></div><div class="text-center"><span class="block text-red-500 text-xl">${stats.l}</span><span class="text-[9px] text-slate-400 uppercase">Pralaimėta</span></div></div>
                <div class="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                    <div class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">Geriausias Partneris</div>
                    <div class="space-y-2">
                        <div class="flex items-baseline justify-between gap-2">
                            <span class="text-[9px] font-bold text-indigo-300 uppercase tracking-wider">Karjeros</span>
                            <span class="font-bold text-indigo-900 text-right">${bestPartner} <span class="text-xs text-indigo-500 font-normal">${maxText}</span></span>
                        </div>
                        <div class="flex items-baseline justify-between gap-2 pt-2 border-t border-indigo-100">
                            <span class="text-[9px] font-bold text-indigo-300 uppercase tracking-wider">Šiame turnyre</span>
                            <span class="font-bold text-indigo-900 text-right">${tournBP ? tournBP.partnerName : "Nėra"} <span class="text-xs text-indigo-500 font-normal">${tournBP ? tournBP.text : ""}</span></span>
                        </div>
                    </div>
                </div>
            </div>`;
        safeHTML('card-content', html); let mCard = el('modal-card'); if(mCard) mCard.style.display = 'flex';
    } catch(e) { console.error("openPlayerCard Error:", e); }
}

let renderTimeout = null;
function render() {
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
        try {
            const curT = savedTournaments.find(x => x.id === currentTid);
            const tField = el('tournament-name-field');
            if(tField && document.activeElement !== tField) tField.value = curT ? curT.name : (new Date().toLocaleDateString('lt-LT') + ' Turnyras');
            renderLeaderboard(); renderPlayersList(); renderTimerAndSettings(); renderMatches();
            if(isMuted) { el('icon-sound-on')?.classList.add('hidden'); el('icon-sound-off')?.classList.remove('hidden'); } 
            else { el('icon-sound-on')?.classList.remove('hidden'); el('icon-sound-off')?.classList.add('hidden'); }
        } catch(e) { console.error("RenderErr:", e); }
    }, 16);
}

function renderLeaderboard() {
    const isF = (typeof settings !== 'undefined' && settings.format === 'fixed'); 
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
        const getName = (team) => safeArr(team).map(p => esc(p.name)).join(' / ');
        if (firstPlace) pHTML += `<div class="flex items-center bg-gradient-to-r from-yellow-100 to-yellow-50 border border-yellow-200 rounded-2xl p-3 shadow-sm"><div class="text-2xl mr-3 drop-shadow-sm text-yellow-500"><i class="fa-solid fa-trophy"></i></div><div class="font-black text-yellow-700 text-sm truncate">${getName(firstPlace)}</div></div>`;
        if (secondPlace) pHTML += `<div class="flex items-center bg-gradient-to-r from-slate-100 to-slate-50 border border-slate-200 rounded-2xl p-3 shadow-sm"><div class="text-2xl mr-3 drop-shadow-sm text-slate-400"><i class="fa-solid fa-medal"></i></div><div class="font-black text-slate-600 text-sm truncate">${getName(secondPlace)}</div></div>`;
        if (thirdPlace) pHTML += `<div class="flex items-center bg-gradient-to-r from-orange-100 to-orange-50 border border-orange-200 rounded-2xl p-3 shadow-sm"><div class="text-2xl mr-3 drop-shadow-sm text-orange-500"><i class="fa-solid fa-medal"></i></div><div class="font-black text-orange-700 text-sm truncate">${getName(thirdPlace)}</div></div>`;
        pHTML += `</div>`; safeHTML('podium-container', pHTML); safeDisplay('podium-container', 'flex');
    } else if (podiumContainer) safeDisplay('podium-container', 'none');

    let html = table.map((s, i) => {
        let av = ''; 
        if (!isF) { 
            let pPhoto = photoBank[s.id];
            let bg = s.gender === 'F' ? 'bg-pink-600' : 'bg-blue-600', bt = s.gender === 'F' ? 'M' : 'V'; 
            av = pPhoto ? `<div class="relative w-8 h-8 shrink-0"><img src="${pPhoto}" class="w-full h-full rounded-full object-cover shadow-sm ${s.gender === 'F' ? 'avatar-frame-f' : 'avatar-frame-m'}"><div class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center text-[7px] text-white font-black ${bg}">${bt}</div></div>` 
                        : `<div class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm ${s.gender === 'F' ? 'bg-pink-500' : 'bg-blue-500'}">${bt}</div>`;
        }
        return `<div class="flex items-center px-3 py-3 text-xs bg-white border-b border-slate-100 last:border-0"><div class="w-6 font-bold text-slate-400 text-[10px]">${i+1}</div><div ${isF ? '' : `data-player="${esc(s.name)}"`} class="flex-1 flex items-center gap-2 truncate font-bold text-slate-800 ${isF ? '' : 'clickable-name'}">${av}${esc(s.name)} <span class="text-[9px] font-black text-slate-400 ml-1">(${s.rating || 300} pts)</span></div><div class="stat-col text-green-600">${s.w}</div><div class="stat-col text-slate-300">${s.t}</div><div class="stat-col text-red-400">${s.l}</div><div class="stat-col ${s.dif>=0?'text-slate-600':'text-red-500'}">${s.dif>0?'+':''}${s.dif}</div><div class="stat-col-wide text-slate-900">${(typeof settings !== 'undefined' && settings.rankingMode==='wins')?s.lp:s.sw}</div></div>`;
    }).join('');
    safeHTML('leaderboard-body', html);
}

function renderPlayersList() {
    let html = safeArr(players).map((p, idx) => {
        let pPhoto = photoBank[p.id];
        let bg = p.gender === 'F' ? 'bg-pink-600' : 'bg-blue-600', bt = p.gender === 'F' ? 'M' : 'V'; 
        let av = pPhoto ? `<div class="relative w-10 h-10 shrink-0"><img src="${pPhoto}" class="w-full h-full rounded-full object-cover shadow-sm ${p.gender === 'F' ? 'avatar-frame-f' : 'avatar-frame-m'}"><div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white font-black border border-white ${bg}">${bt}</div></div>`
                        : `<div class="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm ${p.gender === 'F' ? 'bg-pink-500' : 'bg-blue-500'}">${bt}</div>`;
        return `<div class="flex justify-between items-center bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm"><div class="flex items-center gap-3 flex-1 cursor-pointer hover:bg-slate-50 p-1 rounded-xl transition-colors" onclick="openEditModal('${p.id}')"><span class="text-[10px] font-black text-slate-300 w-4 text-center">${idx + 1}</span>${av}<div class="font-bold text-slate-800 text-sm">${esc(p.name)} <span class="text-xs text-slate-400 font-normal">(${p.rating || 300} pts)</span></div></div><button type="button" onclick="removePlayer('${p.id}')" class="text-slate-300 hover:text-red-500 text-lg px-3 py-2 active:scale-90 transition-colors" aria-label="Pašalinti žaidėją"><i class="fa-solid fa-trash-can"></i></button></div>`;
    }).join('');
    safeHTML('players-list', html);
}

function renderTimerAndSettings() {
    const isSc = (typeof settings !== 'undefined' && settings.winCondition === 'score'); 
    safeClass('mode-time', !isSc ? "flex-1 py-1.5 text-[10px] font-black rounded-md bg-white shadow text-slate-900 uppercase" : "flex-1 py-1.5 text-[10px] font-bold text-slate-400 uppercase hover:text-slate-600"); 
    safeClass('mode-score', isSc ? "flex-1 py-1.5 text-[10px] font-black rounded-md bg-white shadow text-slate-900 uppercase" : "flex-1 py-1.5 text-[10px] font-bold text-slate-400 uppercase hover:text-slate-600"); 
    safeDisplay('control-duration', !isSc ? 'block' : 'none'); safeDisplay('control-points', !isSc ? 'none' : 'block'); safeDisplay('score-mode-text', isSc ? 'block' : 'none'); safeDisplay('timer-controls', isSc ? 'none' : 'flex');
    if(isSc && typeof settings !== 'undefined') safeText('score-mode-text', `IKI ${settings.maxPoints} TAŠKŲ`);
    
    const m = Math.floor(timeLeft/60).toString().padStart(2,'0'), sec = (timeLeft%60).toString().padStart(2,'0'); 
    safeText('timer-display', `${m}:${sec}`); safeText('val-duration', typeof settings !== 'undefined' ? settings.matchDuration : 12); safeText('val-points', typeof settings !== 'undefined' ? settings.maxPoints : 21); safeText('player-count', "Viso: " + players.length); 
    if(typeof settings !== 'undefined') { safeVal('select-format', settings.baseFormat || 'americano'); safeVal('select-category', settings.category || 'Atviras'); safeVal('select-ranking', settings.rankingMode); }

    const btnFinals = el('btn-generate-finals');
    if(btnFinals) btnFinals.className = (safeArr(matches).some(m => m.finished)) ? "px-4 py-3 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 text-white font-black shadow-lg shadow-amber-200 text-[10px] active:scale-95 transition-transform tracking-widest uppercase" : "hidden";
}

function renderMatches() {
    const active = safeArr(matches).filter(m => !m.finished);
    let aHtml = active.map(m => {
        let t1 = m.team1.map(p => `<span class="font-bold text-sm text-slate-700">${esc(p.name)}</span>`).join('');
        let t2 = m.team2.map(p => `<span class="font-bold text-sm text-slate-700">${esc(p.name)}</span>`).join(''); 
        let headT = m.isFinal ? esc(m.finalTitle) : `RAUNDAS ${m.round}`;
        let headC = m.isFinal ? (m.finalBg || 'bg-slate-800') : 'bg-slate-800';
        return `<div class="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden mb-5"><div class="${headC} text-white px-4 py-2 text-[10px] font-black tracking-widest flex justify-between items-center uppercase shadow-sm"><span>AIKŠTELĖ ${m.court}</span><span class="flex items-center gap-2">${headT}<button type="button" onclick="deleteRound(${m.round})" class="text-white/40 hover:text-red-300 transition-colors" title="Ištrinti raundą"><i class="fa-solid fa-trash"></i></button></span></div><div class="p-4"><div class="flex justify-between items-center mb-4"><div class="flex flex-col gap-1">${t1}</div><div class="flex items-center gap-3"><button type="button" onclick="updSc('${m.id}',1,-1)" class="w-10 h-10 bg-slate-100 text-slate-500 rounded-full font-bold active:bg-slate-200 transition-colors shadow-inner" aria-label="Minus taškas"><i class="fa-solid fa-minus"></i></button><span class="text-3xl font-black w-10 text-center text-slate-800">${m.score1||0}</span><button type="button" onclick="updSc('${m.id}',1,1)" class="w-10 h-10 bg-green-500 text-white rounded-full font-bold active:scale-95 transition-transform shadow-md" aria-label="Plius taškas"><i class="fa-solid fa-plus"></i></button></div></div><div class="flex justify-between items-center mb-5"><div class="flex flex-col gap-1">${t2}</div><div class="flex items-center gap-3"><button type="button" onclick="updSc('${m.id}',2,-1)" class="w-10 h-10 bg-slate-100 text-slate-500 rounded-full font-bold active:bg-slate-200 transition-colors shadow-inner" aria-label="Minus taškas"><i class="fa-solid fa-minus"></i></button><span class="text-3xl font-black w-10 text-center text-slate-800">${m.score2||0}</span><button type="button" onclick="updSc('${m.id}',2,1)" class="w-10 h-10 bg-green-500 text-white rounded-full font-bold active:scale-95 transition-transform shadow-md" aria-label="Plius taškas"><i class="fa-solid fa-plus"></i></button></div></div><button type="button" onclick="finM('${m.id}')" class="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest active:scale-95 transition-transform shadow-md"><i class="fa-solid fa-flag-checkered mr-2"></i> Užbaigti Mačą</button></div></div>`;
    }).join('');
    safeHTML('matches-container', aHtml);
    
    const fin = safeArr(matches).filter(m => m.finished).reverse(); 
    let fHtml = fin.length ? '<h3 class="text-[9px] font-black text-slate-400 uppercase mb-3 tracking-widest pl-1">Paskutiniai mačai</h3>' : ''; 
    fHtml += fin.map(m => {
        let n1 = m.team1.map(p=>esc(p.name)).join('/'), n2 = m.team2.map(p=>esc(p.name)).join('/'); 
        let badge = m.isFinal ? `<span class="match-number-badge !bg-yellow-100 !text-yellow-700 border border-yellow-200"><i class="fa-solid fa-trophy"></i></span>` : `<span class="match-number-badge">R${m.round}</span>`;
        return `<div class="bg-white p-3 rounded-xl border border-slate-100 mb-2 flex justify-between items-center text-[11px] shadow-sm"><div class="flex items-center truncate pr-2">${badge}<div class="truncate font-bold text-slate-600">${n1} vs ${n2}</div></div><div class="flex items-center gap-3 shrink-0"><div class="font-black bg-slate-100 border border-slate-200 px-2 py-1 rounded text-slate-800 text-xs">${m.score1||0}:${m.score2||0}</div><button type="button" onclick="undoM('${m.id}')" class="text-slate-400 hover:text-blue-500 px-2 py-1 transition-colors" title="Taisyti rezultatą"><i class="fa-solid fa-rotate-left"></i></button></div></div>`;
    }).join('');
    safeHTML('finished-matches-container', fHtml);
}

// Ištrina visą raundą (visus to raundo mačus — aktyvius ir baigtus).
function deleteRound(roundNum) {
    try {
        const roundMatches = safeArr(matches).filter(m => m.round === roundNum);
        if (roundMatches.length === 0) return;
        const isFinalRound = roundMatches.some(m => m.isFinal);
        const label = isFinalRound ? 'FINALĄ' : `RAUNDĄ ${roundNum}`;
        if (!confirm(`Ištrinti ${label}?\n\nBus pašalinti ${roundMatches.length} mačai (ir jų rezultatai). Šio veiksmo atšaukti negalėsite.`)) return;
        matches = safeArr(matches).filter(m => m.round !== roundNum);
        autoSave(true);
        render();
    } catch(e) { console.error("deleteRound Error:", e); }
}

function shareResultsAsImage() {
    try {
        let overlay = el('loading-overlay'); if(overlay) overlay.style.display = 'flex'; 
        safeText('loading-text', "Kuriama HD nuotrauka...");
        const target = el('leaderboard-capture-target'); const title = el('tournament-name-field')?.value || "Turnyro Rezultatai";
        if(!target) { if(overlay) overlay.style.display = 'none'; return; }
        const wrapper = document.createElement('div');
        wrapper.style.position = 'absolute'; wrapper.style.left = '-9999px'; wrapper.style.top = '0'; wrapper.style.width = '450px'; wrapper.style.padding = '20px'; wrapper.style.background = '#f8fafc'; 
        const header = document.createElement('div'); header.style.textAlign = 'center'; header.style.marginBottom = '20px'; 
        header.innerHTML = `<h1 style="font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 4px; line-height: 1; letter-spacing: -1px;">SUPERPADEL<span style="color: #16a34a;">.LT</span></h1><h2 style="font-size: 14px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">${esc(title)}</h2>`;
        const content = target.cloneNode(true); content.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'; content.style.border = '1px solid #e2e8f0'; content.style.borderRadius = '16px'; content.style.backgroundColor = '#ffffff'; content.style.overflow = 'hidden';
        const footer = document.createElement('div'); footer.style.textAlign = 'center'; footer.style.fontSize = '10px'; footer.style.color = '#cbd5e1'; footer.style.fontWeight = '900'; footer.style.marginTop = '20px'; footer.style.textTransform = 'uppercase'; footer.style.letterSpacing = '1px'; footer.innerText = "Sukurta su www.superpadel.lt platforma";
        wrapper.appendChild(header); wrapper.appendChild(content); wrapper.appendChild(footer); document.body.appendChild(wrapper);

        setTimeout(() => {
            if(typeof html2canvas !== 'undefined') {
                html2canvas(wrapper, { scale: 3, backgroundColor: "#f8fafc", useCORS: true, logging: false }).then(canvas => {
                    document.body.removeChild(wrapper); if(overlay) overlay.style.display = 'none'; safeText('loading-text', "Kraunama..."); 
                    const imgData = canvas.toDataURL('image/png', 1.0);
                    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
                        canvas.toBlob(blob => { const file = new File([blob], `${title.replace(/\s+/g, '_')}_rezultatai.png`, { type: "image/png" }); navigator.share({ files: [file], title: title }).catch(e => console.error("Share error:", e)); });
                    } else {
                        const link = document.createElement('a'); link.download = `${title.replace(/\s+/g, '_')}_rezultatai.png`; link.href = imgData; link.click();
                    }
                }).catch(err => { if(document.body.contains(wrapper)) document.body.removeChild(wrapper); if(overlay) overlay.style.display = 'none'; alert("Klaida generuojant vaizdą: " + err); });
            } else { if(document.body.contains(wrapper)) document.body.removeChild(wrapper); if(overlay) overlay.style.display = 'none'; alert("html2canvas nerastas!"); }
        }, 250);
    } catch(e) { console.error("shareResultsAsImage Error:", e); let overlay = el('loading-overlay'); if(overlay) overlay.style.display = 'none'; }
}

function renderGlobalStats() {
    try {
        const tSel = el('stat-tournament'); let tVal = tSel ? tSel.value : 'CURRENT';
        if (tSel) {
            let opts = `<option value="CURRENT">Dabartinis turnyras</option><option value="ALL">Visi turnyrai (Bendra)</option><option value="CAREER">⭐ Karjeros (visų kambarių)</option>` + safeArr(savedTournaments).map(t => `<option value="${t.id}">${esc(t.name)} (${new Date(t.date).toLocaleDateString('lt-LT')})</option>`).join('');
            tSel.innerHTML = opts; if(tSel.querySelector(`option[value="${tVal}"]`)) tSel.value = tVal;
        }
        
        const tF = el('stat-tournament')?.value || 'CURRENT'; const gF = el('stat-gender')?.value || 'ALL';

        // ⭐ KARJEROS režimas — globali mėgėjų statistika iš VISŲ kambarių (kaip portale). Async.
        if (tF === 'CAREER') {
            renderCareerStats(gF);
            return;
        }

        let cM = [], cP = [];
        if(tF === 'ALL') { 
            safeArr(savedTournaments).forEach(t => { if (currentTid && t.id === currentTid) return; cM.push(...safeArr(t.matches)); cP.push(...safeArr(t.players)); }); 
            if(matches.length > 0) cM.push(...matches); if(players.length > 0) cP.push(...players); 
        } else if(tF === 'CURRENT') { cM = [...matches]; cP = [...players]; } else { const t = savedTournaments.find(x => x.id === tF); if(t){ cM = [...t.matches]; cP = [...t.players]; } }
        
        const uP = Array.from(new Map(cP.filter(p => p && p.name).map(p => [p.name, p])).values());
        const pSel = el('stat-player'); let pVal = pSel ? pSel.value : 'ALL';
        if(pSel) {
            pSel.innerHTML = '<option value="ALL">Visi žaidėjai</option>' + uP.sort((a,b)=>a.name.localeCompare(b.name)).map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
            if(pSel.querySelector(`option[value="${pVal}"]`)) pSel.value = pVal;
        }
        
        const pF = el('stat-player')?.value || 'ALL';
        safeClass('stat-type-indiv', statType === 'indiv' ? "flex-1 py-1.5 text-[10px] font-black rounded-md bg-white shadow text-slate-900 uppercase" : "flex-1 py-1.5 text-[10px] font-bold text-slate-400 uppercase hover:text-slate-600"); 
        safeClass('stat-type-pairs', statType === 'pairs' ? "flex-1 py-1.5 text-[10px] font-black rounded-md bg-white shadow text-slate-900 uppercase" : "flex-1 py-1.5 text-[10px] font-bold text-slate-400 uppercase hover:text-slate-600");
        
        let html = '';
        if (statType === 'indiv') {
            let list = calculateResults(cM, uP, false).filter(x => (gF==='ALL' || x.gender===gF) && (pF==='ALL' || x.name===pF));
            html = list.map((s, i) => `<div class="flex items-center px-3 py-3 text-[11px] bg-white border-b border-slate-100 last:border-0"><div class="w-6 text-slate-400 font-bold">${i+1}</div><div data-player="${esc(s.name)}" class="flex-1 truncate font-bold text-slate-800 clickable-name flex items-center gap-1">${esc(s.name)} <span class="text-[9px] font-black text-slate-400 ml-1">(${s.rating || 300} pts)</span></div><div class="stat-col text-slate-500">${s.mp}</div><div class="stat-col text-green-600">${s.w}</div><div class="stat-col text-slate-300">${s.t}</div><div class="stat-col text-red-400">${s.l}</div><div class="stat-col-wide font-black">${s.mp>0?Math.round((s.w/s.mp)*100):0}%</div></div>`).join('');
        } else {
            const list = calculatePairsResults(cM, uP).filter(x => (pF === 'ALL' || x.p1?.name === pF || x.p2?.name === pF));
            html = list.map((s, i) => `<div class="flex items-center px-3 py-3 text-[11px] bg-white border-b border-slate-100 last:border-0"><div class="w-6 text-slate-400 font-bold">${i+1}</div><div class="flex-1 font-bold text-slate-800">${esc(s.name)}</div><div class="stat-col text-slate-500">${s.mp}</div><div class="stat-col text-green-600">${s.w}</div><div class="stat-col text-slate-300">${s.t}</div><div class="stat-col text-red-400">${s.l}</div><div class="stat-col-wide font-black">${s.mp>0?Math.round((s.w/s.mp)*100):0}%</div></div>`).join('');
        }
        safeHTML('global-stats-body', html);
    } catch(e) { console.error("renderGlobalStats Error:", e); }
}

// ⭐ KARJEROS statistika — globalūs mėgėjų (casual) duomenys iš VISŲ kambarių.
// Rodo tuos pačius skaičius kaip portalo "Mėgėjų lyga" (casual_rating, casual_matches).
function renderCareerStats(gF) {
    const bodyId = 'global-stats-body';
    safeHTML(bodyId, '<div style="padding:24px; text-align:center; color:#94a3b8; font-size:12px;"><i class="fa-solid fa-spinner fa-spin"></i> Kraunama karjeros statistika...</div>');

    if (typeof firebase === 'undefined' || !firebase.database) {
        safeHTML(bodyId, '<div style="padding:24px; text-align:center; color:#ef4444; font-size:12px;">Nėra ryšio su duomenų baze.</div>');
        return;
    }

    firebase.database().ref(GLOBAL_PLAYERS_KEY).once('value').then(snap => {
        const data = snap.val() || {};
        // Tik žaidėjai, sužaidę bent vieną mėgėjų (casual) mačą
        let arr = Object.values(data).filter(p => p && p.name && (p.casual_matches || 0) > 0);

        // Lyties filtras
        arr = arr.filter(p => gF === 'ALL' || (p.gender || 'M') === gF);

        // Žaidėjų filtro sąrašą užpildom iš globalių žaidėjų
        const pSel = el('stat-player'); let pVal = pSel ? pSel.value : 'ALL';
        if (pSel) {
            const names = arr.map(p => p.name).sort((a, b) => a.localeCompare(b));
            pSel.innerHTML = '<option value="ALL">Visi žaidėjai</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
            if (pSel.querySelector(`option[value="${pVal}"]`)) pSel.value = pVal;
        }
        const pF = el('stat-player')?.value || 'ALL';
        arr = arr.filter(p => pF === 'ALL' || p.name === pF);

        // Rikiuojam pagal mėgėjų ELO (kaip portale)
        arr.sort((a, b) => (b.casual_rating || 300) - (a.casual_rating || 300));

        let html = arr.map((p, i) => {
            const mp = p.casual_matches || 0;
            const w = p.casual_wins || 0;
            const l = Math.max(0, mp - w);
            const winPct = mp > 0 ? Math.round((w / mp) * 100) : 0;
            return `<div class="flex items-center px-3 py-3 text-[11px] bg-white border-b border-slate-100 last:border-0"><div class="w-6 text-slate-400 font-bold">${i + 1}</div><div class="flex-1 truncate font-bold text-slate-800 flex items-center gap-1">${esc(p.name)} <span class="text-[9px] font-black text-blue-500 ml-1">(${p.casual_rating || 300} ELO)</span></div><div class="stat-col text-slate-500">${mp}</div><div class="stat-col text-green-600">${w}</div><div class="stat-col text-slate-300">0</div><div class="stat-col text-red-400">${l}</div><div class="stat-col-wide font-black">${winPct}%</div></div>`;
        }).join('');

        if (!html) html = '<div style="padding:24px; text-align:center; color:#94a3b8; font-size:12px;">Nėra karjeros duomenų (dar nesužaista mėgėjų mačų).</div>';
        safeHTML(bodyId, html);
    }).catch(e => {
        console.error('renderCareerStats klaida:', e);
        safeHTML(bodyId, '<div style="padding:24px; text-align:center; color:#ef4444; font-size:12px;">Klaida kraunant karjeros statistiką.<br><span style="font-size:10px;">' + (e && e.message ? e.message : '') + '</span></div>');
    });
}

function setMode(m) { if(typeof settings !== 'undefined') settings.winCondition = m; resetTimer(); autoSave(true); }
function changeSetting(k, v) { if(typeof settings !== 'undefined') { settings[k] = Math.max(1, (settings[k]||0)+v); if(k==='matchDuration') resetTimer(); autoSave(true); } }
// Bazinis formatas (americano/fixed/mexicano/king/cup) + kategorija → tikrasis variklis.
// "americano" + kategorija "Mix" → aktyvuoja Mix Americano variklį (mix_americano).
function resolveEngine() {
    if (typeof settings === 'undefined') return 'americano';
    const base = settings.baseFormat || 'americano';
    const cat = settings.category || 'Atviras';
    if (base === 'americano' && cat === 'Mix') return 'mix_americano';
    if (base === 'fixed') return 'fixed';
    // Mexicano/King/Taurė kol kas naudoja Americano variklį
    return 'americano';
}

function changeFormat(v) {
    if (typeof settings === 'undefined') return;
    settings.baseFormat = v;
    settings.format = resolveEngine();
    preGeneratedTournament = [];
    setStore('pregen', []);
    autoSave(true);
}

function changeCategory(v) {
    if (typeof settings === 'undefined') return;
    settings.category = v;
    settings.format = resolveEngine();
    preGeneratedTournament = [];
    setStore('pregen', []);
    autoSave(true);
}
function changeRanking(v) { if(typeof settings !== 'undefined') { settings.rankingMode = v; autoSave(true); } }

function updSc(id, t, v) { const m = matches.find(x=>x.id===id); if(m){ if(t===1) m.score1=Math.max(0, (m.score1||0)+v); else m.score2=Math.max(0, (m.score2||0)+v); liveUpdateMatches(); } }

function finM(id) { 
    const m = matches.find(x=>x.id===id); 
    if(m){ 
        m.finished = true; 
        liveUpdateMatches(); 
    } 
}

function undoM(id) { const m = matches.find(x=>x.id===id); if(m){ m.finished=false; liveUpdateMatches(); } }
function resetScores() { if(confirm("Pradėti NAUJĄ turnyrą ir išsaugoti šį į istoriją?")) { currentTid = null; matches = []; players = []; preGeneratedTournament = []; setStore('pregen', []); const tF=el('tournament-name-field'); if(tF) tF.value=''; ensureTournamentId(); autoSave(true); switchView('setup'); } }
function deleteHistory(id) { if(confirm("Ar tikrai norite ištrinti šį turnyrą iš istorijos?")) { savedTournaments = savedTournaments.filter(x => x.id !== id); if(currentTid===id){ currentTid=null; matches=[]; players=[]; preGeneratedTournament=[]; setStore('pregen',[]); setStore('tid', null); const tF=el('tournament-name-field'); if(tF) tF.value=''; } autoSave(true); renderHistoryList(); } }
function toggleMute() { isMuted = !isMuted; localStorage.setItem('sp_is_muted', isMuted.toString()); render(); }

let globalAudioCtx = null;

// --- Ekrano "Wake Lock": kol programa atidaryta ir matoma, telefonas NEUŽMIEGA (ne tik laikmačiui veikiant) ---
// Naršyklė atjungia užraktą paslėpus langą, todėl vėl paimam jį grįžus (visibilitychange) ir per prisilietimą.
let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
    } catch (e) { /* nepavyko – ne kritiška */ }
}
function releaseWakeLock() {
    try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {}
}
function getAudioCtx() {
    if (!globalAudioCtx) { globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    return globalAudioCtx;
}

function play5MinWarning() {
    if(isMuted) return;
    try {
        const ctx = getAudioCtx();
        const playBeep = (freq, time, dur) => {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'square'; osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.05, ctx.currentTime + time);
            osc.start(ctx.currentTime + time); osc.stop(ctx.currentTime + time + dur);
        };
        playBeep(600, 0, 0.15); playBeep(800, 0.25, 0.2);
    } catch(e) { console.error("Audio Error:", e); }
}

function play1MinWarning() {
    if(isMuted) return;
    try {
        const ctx = getAudioCtx();
        const playTick = (time) => {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine'; osc.frequency.value = 1000;
            gain.gain.setValueAtTime(0.1, ctx.currentTime + time);
            osc.start(ctx.currentTime + time); osc.stop(ctx.currentTime + time + 0.05);
        };
        for(let i=0; i<5; i++) playTick(i * 0.15);
    } catch(e) { console.error("Audio Error:", e); }
}

function playBuzzer() {
    if(isMuted) return;
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 1.5); 
        gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
        osc.start(); osc.stop(ctx.currentTime + 1.5);
    } catch(e) { console.error("Audio Error:", e); }
}

// ŠVILPUKAS (teisėjo) — pakeičia seną sireną. Aukšto dažnio tonas su trileliu.
function playWhistle() {
    if(isMuted) return;
    try {
        const ctx = getAudioCtx();
        const dur = 1.2;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const lfo = ctx.createOscillator();   // vibrato (švilpuko "burbuliukas")
        const lfoGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 3200;
        lfo.type = 'sine';
        lfo.frequency.value = 22;             // greitas trilelis
        lfoGain.gain.value = 160;             // vibrato gylis
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
        osc.connect(gain); gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.03);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + dur - 0.06);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + dur);
        osc.start(); osc.stop(ctx.currentTime + dur);
        lfo.start(); lfo.stop(ctx.currentTime + dur);
    } catch(e) { console.error("Audio Error:", e); }
}

// 3 MIN įspėjimas — kelių sekundžių "skambutis" (kylantys dvigarsiai)
function play3MinWarning() {
    if(isMuted) return;
    try {
        const ctx = getAudioCtx();
        const beep = (freq, time, dur) => {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'triangle'; osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, ctx.currentTime + time);
            gain.gain.linearRampToValueAtTime(0.13, ctx.currentTime + time + 0.02);
            gain.gain.setValueAtTime(0.13, ctx.currentTime + time + dur - 0.03);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + time + dur);
            osc.start(ctx.currentTime + time); osc.stop(ctx.currentTime + time + dur);
        };
        beep(660, 0.0, 0.25); beep(880, 0.3, 0.35);
        beep(660, 0.8, 0.25); beep(880, 1.1, 0.35);
        beep(660, 1.6, 0.25); beep(880, 1.9, 0.55);
    } catch(e) { console.error("Audio Error:", e); }
}

function triggerAlarm() { 
    if(alarmInterval) return; 
    playWhistle(); alarmInterval = setInterval(playWhistle, 1600); updateTimerUI(); 
    alarmTimeout = setTimeout(() => { if(alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; updateTimerUI(); } }, 5000); 
}

function toggleTimer() { 
    if(typeof settings !== 'undefined' && settings.winCondition==='score') return; 
    if(alarmInterval) { clearInterval(alarmInterval); alarmInterval=null; if(alarmTimeout) { clearTimeout(alarmTimeout); alarmTimeout = null; } resetTimer(); return; } 
    if(isRunning) { clearInterval(timerInterval); isRunning=false; } 
    else {
        if(timeLeft <= 0) return; 
        isRunning = true; endTime = Date.now() + (timeLeft * 1000); 
        requestWakeLock(); 
        if (!isMuted) { const ctx = getAudioCtx(); if (ctx.state === 'suspended') ctx.resume(); }
        timerInterval = setInterval(() => { 
            const d = Math.ceil((endTime - Date.now())/1000); 
            if(d > 0) { 
                if (d === 300 && timeLeft !== 300) play5MinWarning();
                if (d === 180 && timeLeft !== 180) play3MinWarning();
                if (d === 60 && timeLeft !== 60) play1MinWarning();
                timeLeft = d; updateTimerUI(); 
            } else { timeLeft = 0; clearInterval(timerInterval); isRunning = false; triggerAlarm(); } 
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
        if(alarmInterval) { b.className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500 text-white shadow-lg"; i3.classList.remove('hidden'); } 
        else if(isRunning) { b.className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-100 text-orange-600 shadow-inner"; i2.classList.remove('hidden'); } 
        else { b.className="w-10 h-10 rounded-full flex items-center justify-center bg-green-500 text-white shadow-lg"; i1.classList.remove('hidden'); } 
    } 
}

function resetTimer() { 
    timeLeft = (typeof settings !== 'undefined' ? settings.matchDuration : 12) * 60; isRunning = false; 
    if(timerInterval) clearInterval(timerInterval); 
    if(alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; }
    if(alarmTimeout) { clearTimeout(alarmTimeout); alarmTimeout = null; }
    updateTimerUI(); 
}

function adjustTime(s) { if(!isRunning) { timeLeft = Math.max(0, timeLeft + s); updateTimerUI(); } }

// Grįžus į programą (atrakinus telefoną / perjungus atgal): atnaujinam garsą, vėl paimam Wake Lock
// ir, jei laikmatis jau pasibaigė kol buvom išėję — iškart paleidžiam sireną (o ne laukiam tiksėjimo).
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    requestWakeLock(); // visada vėl paimam – kad ekranas neužmigtų kol programa atidaryta
    if (!isMuted && globalAudioCtx && globalAudioCtx.state === 'suspended') { try { globalAudioCtx.resume(); } catch(e){} }
    if (isRunning) {
        const d = Math.ceil((endTime - Date.now()) / 1000);
        if (d > 0) { timeLeft = d; updateTimerUI(); }
        else { timeLeft = 0; if (timerInterval) clearInterval(timerInterval); isRunning = false; triggerAlarm(); }
    }
});

// Kad programa NIEKADA neužmigtų kol atidaryta: paimam Wake Lock iškart ir per kiekvieną prisilietimą
// (kai kurios naršyklės leidžia tik po vartotojo gesto; pakartotinis kvietimas saugus dėl !wakeLock sąlygos).
requestWakeLock();
window.addEventListener('pointerdown', () => requestWakeLock());

function switchView(n) { 
    document.querySelectorAll('.view-section').forEach(e => e.classList.remove('active')); 
    document.querySelectorAll('.nav-btn').forEach(e => e.classList.remove('active')); 
    el('view-' + n)?.classList.add('active'); el('nav-' + n)?.classList.add('active'); 
    if(n==='stats') renderGlobalStats(); else if(n==='history') renderHistoryList(); else if(n==='admin') renderAdmin(); else if(n==='superadmin') loadSuperAdmin(); else if(n==='cloud') { renderMyRooms(); render(); } else render(); 
}

function renderHistoryList() { 
    let h = savedTournaments.map(t => `<div class="bg-white p-4 rounded-xl border mb-2 shadow-sm ${t.id===currentTid?'border-green-400 ring-1 ring-green-400':'border-slate-100'}"><div class="flex justify-between items-start mb-2"><div class="font-bold text-slate-800 text-sm max-w-[70%]">${esc(t.name)}</div><div class="text-[9px] bg-slate-100 px-2 py-1 rounded-lg font-black uppercase text-slate-500 whitespace-nowrap">${t.settings?.format || '---'}</div></div><div class="text-[10px] font-bold text-slate-400 mb-3"><i class="fa-regular fa-calendar mr-1"></i> ${new Date(t.date).toLocaleString('lt-LT')}</div><div class="flex gap-2"><button type="button" onclick="loadHistory('${t.id}')" class="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg font-bold text-[10px] uppercase transition-colors"><i class="fa-solid fa-folder-open mr-1"></i> Užkrauti</button><button type="button" onclick="deleteHistory('${t.id}')" class="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-bold text-[10px] uppercase transition-colors"><i class="fa-solid fa-trash-can mr-1"></i> Trinti</button></div></div>`).join(''); 
    safeHTML('history-list', h); 
}

function loadHistory(id) { 
    const t = savedTournaments.find(x => x.id === id); 
    if(t && confirm("Ar norite užkrauti šį turnyrą? Jūsų dabartinis nebaigtas turnyras bus išsaugotas istorijoje.")) { 
        players = [...safeArr(t.players)]; matches = [...safeArr(t.matches)]; settings = {...ds, ...t.settings}; currentTid = id; preGeneratedTournament = []; setStore('tid', id); 
        const tF = el('tournament-name-field'); if (tF) tF.value = t.name || '';
        resetTimer(); autoSave(true); switchView('matches'); 
    } 
}

async function adminClick() { 
    adminClickCount++; clearTimeout(adminTimer); adminTimer = setTimeout(() => { adminClickCount = 0; }, 1000); 
    if (adminClickCount >= 5) { 
        const p = prompt("Administratoriaus kodas:"); if (!p) return;
        try {
            const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p));
            const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
            if (hashHex === "f5de9f3a9d0796ce2da39fa5556008d33f18c4769381388a4612e8a371d8f9b0") { switchView('admin'); } 
            else if (hashHex === "f5de9f3a9d0796ce2da39fa5556008d33f18c4769381388a4612e8a371d8f9b0") { switchView('superadmin'); loadSuperAdmin(); } 
            else { alert("Neteisingas kodas!"); }
        } catch(e) { console.error("Hash error:", e); alert("Klaida tikrinant slaptažodį."); }
        adminClickCount = 0; 
    } 
}

function loadSuperAdmin() { 
    ensureFirebaseInit(); safeHTML('superadmin-rooms-list', '<div class="text-center py-4"><i class="fa-solid fa-spinner fa-spin text-slate-400 text-2xl"></i></div>'); 
    firebase.database().ref(REG_KEY).once('value').then(snap => { 
        const r = snap.val(); if(!r) { safeHTML('superadmin-rooms-list', '<p class="text-center text-xs text-slate-500 py-4">Kambarių nerasta.</p>'); return; } 
        let h = Object.keys(r).map(k => `<div class="flex justify-between items-center p-3 bg-white rounded-xl border border-slate-100 shadow-sm mb-2"><span class="font-bold text-slate-800"><i class="fa-solid fa-tower-broadcast text-green-500 mr-2"></i> ${esc(k)}</span><div class="flex gap-2"><button type="button" onclick="superAdminJoin('${esc(k)}')" class="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase hover:bg-blue-100 transition-colors">Įeiti</button><button type="button" onclick="superAdminDelete('${esc(k)}')" class="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase hover:bg-red-100 transition-colors">Trinti</button></div></div>`).join(''); safeHTML('superadmin-rooms-list', h); 
    }); 
    firebase.database().ref(DB_KEY + '_global_stats').once('value').then(snap => {
        const stats = snap.val(); if (!stats) { safeHTML('superadmin-stats', '<div class="text-xs text-slate-500">Nėra duomenų.</div>'); return; }
        const visits = stats.visits || 0; const devices = stats.devices || {}; const uniqueCount = Object.keys(devices).length;
        const types = { 'iOS': 0, 'Android': 0, 'Mac': 0, 'Windows': 0, 'Kitas': 0 }; Object.values(devices).forEach(d => { if (d.type && types[d.type] !== undefined) types[d.type]++; else types['Kitas']++; });
        let typesHtml = Object.keys(types).filter(k => types[k] > 0).map(k => `<span class="text-[10px] bg-slate-100 px-2 py-1 rounded mr-1 mb-1 border border-slate-200 text-slate-600 font-bold">${k}: ${types[k]}</span>`).join('');
        let html = `<div class="flex justify-between items-center border-b border-slate-100 pb-2 mb-2"><span class="text-xs font-bold text-slate-500"><i class="fa-solid fa-eye mr-1"></i> Atvertimai:</span> <span class="text-green-600 text-xl font-black">${visits}</span></div><div class="flex justify-between items-center border-b border-slate-100 pb-2 mb-2"><span class="text-xs font-bold text-slate-500"><i class="fa-solid fa-mobile-screen mr-1"></i> Įrenginiai:</span> <span class="text-blue-600 text-xl font-black">${uniqueCount}</span></div><div class="text-[10px] text-slate-400 mt-2 uppercase font-black tracking-widest mb-2">Operacinės sistemos:</div><div class="flex flex-wrap">${typesHtml}</div>`;
        safeHTML('superadmin-stats', html);
    }).catch(e => { safeHTML('superadmin-stats', '<div class="text-xs text-red-500">Klaida gaunant duomenis.</div>'); });
}

function superAdminJoin(rn) { safeVal('fb-room', rn); initFirebaseConnection(); switchView('setup'); }
function superAdminDelete(rn) { if(confirm(`Trinti kambarį "${rn}" iš debesies?`)) { ensureFirebaseInit(); firebase.database().ref(DB_KEY+'/'+rn).remove(); firebase.database().ref(REG_KEY+'/'+rn).remove(); loadSuperAdmin(); } }
function renderAdmin() { let tHtml = savedTournaments.map(t => `<div class="flex justify-between items-center p-3 bg-white border border-slate-100 shadow-sm mb-2 rounded-xl"><span class="font-bold text-sm text-slate-800">${esc(t.name)}</span><button onclick="adminDeleteTournament('${t.id}')" class="text-red-400 hover:text-red-600 p-2"><i class="fa-solid fa-trash-can"></i></button></div>`).join(''); safeHTML('admin-tournaments-list', tHtml); const uP = Array.from(new Map(players.map(p => [p.id, p])).values()); let pHtml = uP.map(p => `<div class="flex justify-between items-center p-3 text-xs bg-white border-b border-slate-50 last:border-0"><span class="font-bold text-slate-700">${esc(p.name)}</span><button onclick="adminDeletePlayer('${p.id}')" class="text-red-400 hover:text-red-600 font-bold uppercase text-[9px]">Šalinti</button></div>`).join(''); safeHTML('admin-players-list', pHtml); }
function adminDeleteTournament(id) { if(confirm("Trinti turnyrą?")) { savedTournaments = savedTournaments.filter(x => x.id !== id); autoSave(true); renderAdmin(); } }
function adminDeletePlayer(id) { if(confirm("Šalinti žaidėją iš sistemos?")) { players = players.filter(p => p.id !== id); autoSave(true); renderAdmin(); } }
function setStatType(t) { statType = t; renderGlobalStats(); }
