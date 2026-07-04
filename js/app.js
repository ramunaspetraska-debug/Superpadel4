// Service Worker ir išsaugotų duomenų valymas (Cache Clearing)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) { registration.unregister(); }
    });
}

const currentKey = APP_VERSION + '_cache_cleared';
if(!localStorage.getItem(currentKey)) {
    const keysToDelete = [];
    for(let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if(key && key.includes('_cache_cleared') && key !== currentKey) {
            keysToDelete.push(key);
        }
    }
    keysToDelete.forEach(k => localStorage.removeItem(k));
    localStorage.setItem(currentKey, 'true');
    window.location.reload(true);
}

// Apsauga nuo atsitiktinio lango uždarymo
window.addEventListener('beforeunload', (e) => { 
    if (typeof matches !== 'undefined' && Array.isArray(matches) && matches.some(m => !m.finished)) { 
        e.preventDefault(); 
        e.returnValue = ''; 
    } 
});

// Programos inicijavimas po to, kai užkraunamas DOM
window.addEventListener('DOMContentLoaded', () => { 
    loadData(); 
    
    // Tikriname URL parametrus dėl kambario (pvz. dalinantis nuoroda)
    const p = new URLSearchParams(window.location.search); 
    const r = p.get('room');
    
    if (r) { 
        activeRoom = r.toUpperCase(); 
        isCloud = true;
        localStorage.setItem('sp_active_room_master', r); 
        window.history.replaceState({}, document.title, window.location.pathname); 
    }
    
    if (activeRoom) { 
        safeVal('fb-room', activeRoom); 
        initFirebaseConnection(); 
        
        if (typeof listenToCasualPlayers === 'function') {
            setTimeout(listenToCasualPlayers, 600);
        }
    } 
    
    logVisit();
    render(); 
    
    // Nustatome kurį ekraną rodyti užsikrovus
    if (typeof matches !== 'undefined' && matches.length > 0) {
        switchView('matches'); 
    } else {
        switchView('setup'); 
    }
});

// ==========================================================================
// 🌟 IŠKELTA INLINE LOGIKA IŠ INDEX.HTML (PWA NUSTATYMAI IR PAIEŠKA)
// ==========================================================================

let cachedCloudPlayers = [];
let indexCasualPlayersRef = null;

function toggleERef() {
    const isChecked = document.getElementById('setting-ereferee')?.checked;
    const pinInput = document.getElementById('setting-ereferee-pin');
    if (!pinInput || typeof settings === 'undefined') return;

    if (isChecked) { 
        pinInput.classList.remove('hidden'); 
        settings.eReferee = true; 
        settings.eRefereePin = pinInput.value || "1234"; 
    } else { 
        pinInput.classList.add('hidden'); 
        settings.eReferee = false; 
    }
    if(typeof autoSave === 'function') autoSave(true);
}

function updateERefPin() { 
    if (typeof settings !== 'undefined') {
        settings.eRefereePin = document.getElementById('setting-ereferee-pin')?.value || "1234"; 
        if(typeof autoSave === 'function') autoSave(true); 
    }
}

function toggleAdminOfficial(val) { 
    if(typeof settings !== 'undefined') { 
        settings.isOfficial = (val === "true"); 
        if(typeof autoSave === 'function') autoSave(true); 
        if(typeof renderTimerAndSettings === 'function') renderTimerAndSettings(); 
    } 
}

function searchLiveCloudPlayers(query) {
    const container = document.getElementById('live-search-results');
    if (!container) return;
    if (!query.trim() || cachedCloudPlayers.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    const txt = query.toLowerCase().trim();
    const currNames = safeArr(players).map(p => p.name.trim().toLowerCase());
    const filtered = cachedCloudPlayers.filter(p => p && p.name && p.name.toLowerCase().includes(txt) && !currNames.includes(p.name.trim().toLowerCase()));
    
    if (filtered.length === 0) {
        container.classList.add('hidden');
        return;
    }

    let html = '';
    filtered.forEach(p => {
        html += `<div onclick="selectCloudPlayer('${esc(p.id)}', '${esc(p.name)}', '${esc(p.gender)}')" class="px-4 py-2 hover:bg-slate-100 font-bold text-sm text-slate-700 cursor-pointer flex justify-between items-center"><span>${esc(p.name)}</span><span class="text-[9px] bg-slate-100 text-slate-400 border px-1.5 py-0.5 rounded uppercase">${p.gender==='M'?'Vyras':'Moteris'} (ELO: ${p.rating||300})</span></div>`;
    });
    container.innerHTML = html;
    container.classList.remove('hidden');
}

function selectCloudPlayer(id, name, gender) {
    const input = document.getElementById('player-input-field');
    if (input) input.value = name;
    if (typeof setGender === 'function') setGender(gender);
    document.getElementById('live-search-results')?.classList.add('hidden');
}

function listenToCasualPlayers() {
    const roomName = document.getElementById('fb-room')?.value?.trim();
    if (!roomName || typeof firebase === 'undefined') return;

    if (indexCasualPlayersRef) {
        indexCasualPlayersRef.off();
    }

    indexCasualPlayersRef = firebase.database().ref("padelio_rooms/" + roomName + "/casual_players");
    
    indexCasualPlayersRef.on('value', snap => {
        const data = snap.val();
        if (data) {
            // Tik atnaujiname paieškos kešą — žaidėjų sąrašo NEKEIČIAME.
            // Tai apsaugo nuo situacijos kai kuriant naują turnyrą
            // automatiškai grįžta visi seni žaidėjai iš istorijos.
            cachedCloudPlayers = Object.values(data);
        }
    });
}

// ==========================================
// TURNYRŲ IMPORTAS IŠ PORTALO (automatinis pasirinkimas)
// ==========================================
// Užkrauna aktyvius turnyrus iš Firebase, leidžia pasirinkti vieną,
// ir automatiškai užpildo generatorių to turnyro užregistruotais žaidėjais.

function importFromPortal() {
    if (typeof firebase === 'undefined') { alert("Pirmiausia prisijunkite prie debesies."); return; }
    if (typeof ensureFirebaseInit === 'function') ensureFirebaseInit();

    const old = document.getElementById('portal-import-modal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'portal-import-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    wrap.innerHTML = `
        <div style="background:white;border-radius:16px;padding:20px;width:100%;max-width:400px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,0.3);">
            <div style="font-weight:900;font-size:15px;color:#1e293b;margin-bottom:4px;"><i class="fa-solid fa-calendar-check" style="color:#2563eb;"></i> Importuoti iš turnyro</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:12px;">Pasirinkite turnyrą — žaidėjai bus įkelti automatiškai.</div>
            <div id="pi-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;min-height:120px;">
                <div style="text-align:center;color:#94a3b8;font-size:12px;padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Kraunami turnyrai...</div>
            </div>
            <button onclick="document.getElementById('portal-import-modal').remove()" style="margin-top:12px;padding:12px;border:1px solid #cbd5e1;background:white;color:#64748b;border-radius:10px;font-weight:bold;font-size:13px;cursor:pointer;">Uždaryti</button>
        </div>`;
    document.body.appendChild(wrap);

    firebase.database().ref("padelio_global_tournaments").once('value').then(snap => {
        const data = snap.val() || {};
        const list = (Array.isArray(data) ? data : Object.values(data))
            .filter(t => t && t.players && t.players.length > 0);
        renderPortalImportList(list);
    }).catch(() => {
        const box = document.getElementById('pi-list');
        if (box) box.innerHTML = '<div style="color:#ef4444;font-size:12px;text-align:center;padding:20px;">Nepavyko įkelti turnyrų.</div>';
    });
}

function renderPortalImportList(list) {
    const box = document.getElementById('pi-list');
    if (!box) return;
    if (list.length === 0) {
        box.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:20px;">Turnyrų su žaidėjais nerasta.</div>';
        return;
    }
    window._piTournaments = {};
    box.innerHTML = list.map(t => {
        window._piTournaments[t.id] = t;
        const cat = t.category ? ` • ${t.category}` : '';
        return `<div onclick="selectPortalTournament('${t.id}')" style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;cursor:pointer;" onmouseover="this.style.background='#f8f9fb'" onmouseout="this.style.background='white'">
            <div style="font-weight:800;font-size:13px;color:#1e293b;">${t.format || 'Turnyras'}<span style="font-weight:normal;color:#64748b;font-size:11px;">${cat}</span></div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;"><i class="fa-regular fa-calendar"></i> ${t.date} • ${t.time || ''} • ${t.level || ''} • ${t.players.length} dalyviai</div>
        </div>`;
    }).join('');
}

function selectPortalTournament(tid) {
    const t = window._piTournaments[tid];
    if (!t) return;
    document.getElementById('portal-import-modal')?.remove();

    // Formatas lemia kaip skaidyti poras:
    // Fiksuotos poros → "A / B" lieka kartu (pora). Kiti → kiekvienas atskirai.
    const isFixedPairs = (t.format === 'Fiksuotos poros');

    // Sinchronizuojame generatoriaus formatą + kategoriją su turnyru
    if (typeof settings !== 'undefined') {
        const fmtMap = { 'Americano': 'americano', 'Fiksuotos poros': 'fixed', 'Mexicano': 'mexicano', 'King of the court': 'king', 'Taurė': 'cup' };
        settings.baseFormat = fmtMap[t.format] || 'americano';
        settings.category = t.category || 'Atviras';
        // Tikrasis variklis: Americano + Mix → mix_americano
        if (settings.baseFormat === 'americano' && settings.category === 'Mix') settings.format = 'mix_americano';
        else if (['fixed', 'mexicano', 'king', 'cup'].includes(settings.baseFormat)) settings.format = settings.baseFormat;
        else settings.format = 'americano';
        if (typeof safeVal === 'function') {
            safeVal('select-format', settings.baseFormat);
            safeVal('select-category', settings.category);
        }
    }
    const isFixedPairsCheck = (t.format === 'Fiksuotos poros');

    let added = 0;
    const addPlayer = (rawEntry) => {
        // Įrašas gali būti "Vardas|lytis" arba tik "Vardas"
        const parts = rawEntry.split('|');
        const name = parts[0].trim();
        const savedGender = parts[1] ? parts[1].trim() : null;
        if (!name) return;
        if (players.some(p => p.name.toLowerCase().trim() === name.toLowerCase().trim())) return;

        let globalMatch = (typeof globalPlayersData !== 'undefined')
            ? Object.values(globalPlayersData || {}).find(gp => gp && gp.name && gp.name.toLowerCase().trim() === name.toLowerCase().trim())
            : null;

        const newPlayerId = globalMatch ? globalMatch.id : (Date.now() + Math.random()).toString(36);
        players.push({
            id: newPlayerId,
            name: name,
            gender: savedGender || (globalMatch ? (globalMatch.gender || "M") : "M"),
            photo: null,
            rating: globalMatch ? (globalMatch.rating || 300) : 300,
            tier: globalMatch ? (globalMatch.tier || "D") : "D",
            wins: 0, losses: 0, draws: 0, points: 0, diff: 0, history: []
        });
        // Jei žaidėjas (ar partneris) turi profilio nuotrauką — atsiunčiame ją ir parodome
        if (globalMatch && globalMatch.hasPhoto && typeof firebase !== 'undefined') {
            firebase.database().ref(`${GLOBAL_PLAYERS_KEY}_photos/${newPlayerId}`).once('value').then(pSnap => {
                const photo = pSnap.val();
                if (photo) {
                    photoBank[newPlayerId] = photo;
                    if (typeof setStore === 'function') setStore('photos', photoBank);
                    if (typeof uploadPhotoToRoom === 'function') uploadPhotoToRoom(newPlayerId, photo);
                    if (typeof render === 'function') render();
                }
            }).catch(() => {});
        }
        added++;
    };

    t.players.forEach(row => {
        if (isFixedPairs && row.includes('/')) {
            // Fiksuota pora: abu žaidėjai, bet poros ryšys svarbus tik fixed variklyje
            row.split('/').forEach(addPlayer);
        } else {
            // Individualus formatas: kiekvienas atskirai (net jei buvo poroje registruoti)
            row.split('/').forEach(addPlayer);
        }
    });

    if (typeof savePlayers === 'function') savePlayers();
    if (typeof renderPlayers === 'function') renderPlayers();
    if (typeof updatePlayerCount === 'function') updatePlayerCount();
    if (typeof autoSave === 'function') autoSave(true);
    alert(`Importuota ${added} žaidėjų iš turnyro "${t.format}". Statistika skaičiuosis automatiškai!`);
}

// Globalių paspaudimų sekimas paieškos uždarymui
document.addEventListener('click', function(e) {
    if (!e.target.closest('#player-input-field') && !e.target.closest('#live-search-results')) {
        document.getElementById('live-search-results')?.classList.add('hidden');
    }
});

// Dinaminis Badges atvaizdavimo hook'as
setTimeout(function() {
    if (typeof window.renderTimerAndSettings === 'function') {
        const originalRender = window.renderTimerAndSettings;
        window.renderTimerAndSettings = function() {
            originalRender();
            const offBadge = document.getElementById('official-badge');
            const casBadge = document.getElementById('casual-badge');
            const adminOffSel = document.getElementById('admin-is-official');
            if(typeof settings !== 'undefined') {
                if (settings.isOfficial) { 
                    offBadge?.classList.remove('hidden'); 
                    casBadge?.classList.add('hidden'); 
                } else { 
                    offBadge?.classList.add('hidden'); 
                    casBadge?.classList.remove('hidden'); 
                }
                if(adminOffSel) adminOffSel.value = settings.isOfficial ? "true" : "false";
            }
        };
    }
}, 500);

// ==========================================
// REGISTRUOTŲ ŽAIDĖJŲ IMPORTAS IŠ GLOBALIOS DB
// ==========================================
// Importuoja žaidėjus su TIKRAIS telefono ID — jų statistika
// automatiškai keliaus į portalo profilius be papildomo prisijungimo.

function openGlobalImportModal() {
    if (typeof firebase === 'undefined') { alert("Pirmiausia prisijunkite prie debesies kambario."); return; }
    if (typeof ensureFirebaseInit === 'function') ensureFirebaseInit();

    const old = document.getElementById('global-import-modal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'global-import-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    wrap.innerHTML = `
        <div style="background:white;border-radius:16px;padding:20px;width:100%;max-width:380px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,0.3);">
            <div style="font-weight:900;font-size:15px;color:#1e293b;margin-bottom:4px;"><i class="fa-solid fa-users" style="color:#2563eb;"></i> Registruoti žaidėjai</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:10px;">Pažymėkite dalyvaujančius — jų statistika skaičiuosis automatiškai.</div>
            <input id="gi-search" type="text" placeholder="Paieška..." oninput="filterGlobalImportList()" style="width:100%;padding:10px;border:2px solid #cbd5e1;border-radius:10px;font-weight:bold;font-size:13px;outline:none;box-sizing:border-box;margin-bottom:10px;" autocomplete="off"/>
            <div id="gi-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;min-height:120px;">
                <div style="text-align:center;color:#94a3b8;font-size:12px;padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Kraunama...</div>
            </div>
            <div style="display:flex;gap:8px;margin-top:12px;">
                <button onclick="document.getElementById('global-import-modal').remove()" style="flex:1;padding:12px;border:1px solid #cbd5e1;background:white;color:#64748b;border-radius:10px;font-weight:bold;font-size:13px;cursor:pointer;">Atšaukti</button>
                <button id="gi-confirm" onclick="confirmGlobalImport()" style="flex:1;padding:12px;border:none;background:#2563eb;color:white;border-radius:10px;font-weight:bold;font-size:13px;cursor:pointer;">Pridėti (0)</button>
            </div>
        </div>`;
    document.body.appendChild(wrap);

    firebase.database().ref(GLOBAL_PLAYERS_KEY).once('value').then(snap => {
        const data = snap.val() || {};
        window._giPlayers = Object.values(data)
            .filter(p => p && p.name && /^[0-9]{7,}$/.test(String(p.id)))
            .sort((a, b) => a.name.localeCompare(b.name, 'lt'));
        window._giSelected = new Set();
        renderGlobalImportList(window._giPlayers);
    }).catch(() => {
        document.getElementById('gi-list').innerHTML = '<div style="color:#ef4444;font-size:12px;text-align:center;padding:20px;">Nepavyko įkelti žaidėjų.</div>';
    });
}

function renderGlobalImportList(list) {
    const box = document.getElementById('gi-list');
    if (!box) return;
    const currNames = (typeof players !== 'undefined' ? players : []).map(p => p.name.toLowerCase().trim());
    if (list.length === 0) { box.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:20px;">Žaidėjų nerasta.</div>'; return; }
    box.innerHTML = list.map(p => {
        const already = currNames.includes(p.name.toLowerCase().trim());
        const checked = window._giSelected.has(p.id) ? 'checked' : '';
        const dis = already ? 'disabled' : '';
        const style = already ? 'opacity:0.45;' : 'cursor:pointer;';
        return `<label style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid #e2e8f0;border-radius:10px;${style}">
            <input type="checkbox" ${checked} ${dis} onchange="toggleGiSelect('${p.id}')" style="width:17px;height:17px;accent-color:#2563eb;">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:800;font-size:13px;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}${already ? ' <span style=\'font-size:9px;color:#94a3b8;\'>(jau sąraše)</span>' : ''}</div>
                <div style="font-size:10px;color:#64748b;">${p.gender === 'F' ? 'Moteris' : 'Vyras'} • ${p.tier || 'D'} • ELO ${p.rating || 300}</div>
            </div>
        </label>`;
    }).join('');
}

function filterGlobalImportList() {
    const q = (document.getElementById('gi-search')?.value || '').toLowerCase().trim();
    renderGlobalImportList((window._giPlayers || []).filter(p => p.name.toLowerCase().includes(q)));
}

function toggleGiSelect(id) {
    if (window._giSelected.has(id)) window._giSelected.delete(id);
    else window._giSelected.add(id);
    const btn = document.getElementById('gi-confirm');
    if (btn) btn.innerText = `Pridėti (${window._giSelected.size})`;
}

function confirmGlobalImport() {
    const sel = window._giSelected;
    if (!sel || sel.size === 0) { document.getElementById('global-import-modal').remove(); return; }
    let added = 0;
    const photoFetches = [];
    (window._giPlayers || []).forEach(gp => {
        if (!sel.has(gp.id)) return;
        if (players.some(p => p.name.toLowerCase().trim() === gp.name.toLowerCase().trim())) return;
        players.push({
            id: gp.id, name: gp.name, gender: gp.gender || 'M', photo: null,
            rating: gp.rating || 300, tier: gp.tier || 'D',
            wins: 0, losses: 0, draws: 0, points: 0, diff: 0, history: []
        });
        added++;
        // Jei žaidėjas turi profilio nuotrauką — atsiunčiame ją ir parodome generatoriuje + kambaryje
        if (gp.hasPhoto && typeof firebase !== 'undefined') {
            photoFetches.push(
                firebase.database().ref(`${GLOBAL_PLAYERS_KEY}_photos/${gp.id}`).once('value').then(pSnap => {
                    const photo = pSnap.val();
                    if (photo) {
                        photoBank[gp.id] = photo;
                        if (typeof uploadPhotoToRoom === 'function') uploadPhotoToRoom(gp.id, photo);
                    }
                }).catch(() => {})
            );
        }
    });
    document.getElementById('global-import-modal').remove();
    if (typeof savePlayers === 'function') savePlayers();

    // Kai nuotraukos atsisiųstos — išsaugome ir perpiešiame
    Promise.all(photoFetches).then(() => {
        if (typeof setStore === 'function') setStore('photos', photoBank);
        if (typeof renderPlayers === 'function') renderPlayers();
        if (typeof render === 'function') render();
    });

    if (typeof renderPlayers === 'function') renderPlayers();
    if (typeof updatePlayerCount === 'function') updatePlayerCount();
    if (typeof autoSave === 'function') autoSave(true);
    alert(`Pridėti ${added} žaidėjai. Jų statistika skaičiuosis automatiškai!`);
}

// ==========================================
// FORMATO + KATEGORIJOS LOGIKA (Mix Americano aktyvacija)
// ==========================================
// Mix Americano variklis aktyvuojamas per derinį: Americano + kategorija Mix.
// Vidinis settings.format tampa 'mix_americano', bet naudotojas mato Americano+Mix.

function changeCategory(cat) {
    if (typeof settings === 'undefined') return;
    settings.category = cat;
    applyFormatCategoryEngine();
    preGeneratedTournament = [];
    if (typeof setStore === 'function') setStore('pregen', []);
    if (typeof autoSave === 'function') autoSave(true);
}

// Perrašome changeFormat, kad jis taip pat įvertintų kategoriją
function changeFormat(v) {
    if (typeof settings === 'undefined') return;
    settings.baseFormat = v; // išsaugome pasirinktą formatą atskirai
    applyFormatCategoryEngine();
    preGeneratedTournament = [];
    if (typeof setStore === 'function') setStore('pregen', []);
    if (typeof autoSave === 'function') autoSave(true);
}

function applyFormatCategoryEngine() {
    const baseFmt = settings.baseFormat || document.getElementById('select-format')?.value || 'americano';
    const cat = settings.category || document.getElementById('select-category')?.value || 'Atviras';

    // Americano + Mix → tavo specialus Mix Americano variklis (8/16 matrica)
    if (baseFmt === 'americano' && cat === 'Mix') {
        settings.format = 'mix_americano';
    } else if (['fixed', 'mexicano', 'king', 'cup'].includes(baseFmt)) {
        // Kiekvienas formatas turi savo variklį (Mix kategoriją jie apdoroja viduje)
        settings.format = baseFmt;
    } else {
        settings.format = 'americano';
    }
}
