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

async function importFromPortal() {
    if (typeof firebase === 'undefined') return;
    const tDate = prompt("Turnyro data (MM-DD):", "05-23"); if (!tDate) return;
    document.getElementById('loading-overlay').style.display = 'flex';
    
    firebase.database().ref("padelio_global_tournaments").once('value').then(snap => {
        const data = snap.val(); 
        document.getElementById('loading-overlay').style.display = 'none';
        if (!data) return;
        
        const target = Object.values(data).find(t => t && t.date === tDate);
        if (!target || !target.players) return;
        
        let c = 0;
        target.players.forEach(row => {
            row.split('/').forEach(rawName => {
                const name = rawName.trim(); if (!name) return;
                
                if (!players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
                    let globalMatch = typeof globalPlayersData !== 'undefined' ? Object.values(globalPlayersData || {}).find(gp => gp && gp.name && gp.name.toLowerCase() === name.toLowerCase()) : null;
                    let pGender = globalMatch ? (globalMatch.gender || "M") : "M";
                    let pRating = globalMatch ? (globalMatch.rating || 300) : 300;
                    let pTier = globalMatch ? (globalMatch.tier || "D") : "D";

                    players.push({ 
                        id: globalMatch ? globalMatch.id : (Date.now() + Math.random()).toString(36), 
                        name: name, 
                        gender: pGender, 
                        photo: null, 
                        rating: pRating, 
                        tier: pTier, 
                        wins: 0, 
                        losses: 0, 
                        draws: 0, 
                        points: 0, 
                        diff: 0, 
                        history: [] 
                    });
                    c++;
                }
            });
        });
        
        if (typeof savePlayers === 'function') savePlayers(); 
        if (typeof renderPlayers === 'function') renderPlayers(); 
        if (typeof autoSave === 'function') autoSave(true);
        alert(`Sėkmingai importuoti ${c} žaidėjai! Jų lytis bei reitingai automatiškai sinchronizuoti iš debesies.`);
    });
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
