const GLOBAL_PLAYERS_KEY = "padelio_global_players";
let globalPlayersRef = null;
let globalPlayersData = {};
let localLastUpdate = 0; // paskutinio LOKALAUS pakeitimo laikas (kad debesis neperrašytų naujesnių lokalių duomenų, pvz. finalų)

function getStore(key) { 
    const prefix = isCloud ? `sp_room_${activeRoom}_` : `sp_master_local_`; 
    try { const val = localStorage.getItem(prefix + key); return val ? JSON.parse(val) : null; } catch(e) { console.error("getStore Error:", e); return null; } 
}

function setStore(key, val) { 
    const prefix = isCloud ? `sp_room_${activeRoom}_` : `sp_master_local_`; 
    try { 
        if (val === null) localStorage.removeItem(prefix + key); 
        else localStorage.setItem(prefix + key, JSON.stringify(val)); 
    } catch(e) { 
        console.error("setStore Error:", e); 
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            alert("⚠️ Dėmesio! Telefono atmintis pilna.\n\nNepavyko išsaugoti naujų duomenų (tikriausiai pridėjote per daug nuotraukų). Prašome ištrinti kelis senus turnyrus iš „Istorijos“ skirtuko.");
        }
    } 
}

function ensureFirebaseInit() { 
    try { 
        if(typeof firebase !== 'undefined' && !firebase.apps.length) {
            firebase.initializeApp({ apiKey: el('fb-apiKey')?.value||'', authDomain: el('fb-authDomain')?.value||'', databaseURL: el('fb-databaseURL')?.value||'', projectId: el('fb-projectId')?.value||'' }); 
        }
    } catch(e){ console.error("FirebaseInit Error:", e); } 
}

function logVisit() {
    try {
        ensureFirebaseInit();
        const statsRef = firebase.database().ref(DB_KEY + '_global_stats');
        statsRef.child('visits').transaction(curr => (curr || 0) + 1).catch(e => {});

        let did = localStorage.getItem('sp_device_id');
        if (!did) { did = uid() + uid(); localStorage.setItem('sp_device_id', did); }

        const ua = navigator.userAgent;
        let dType = 'Kitas';
        if (/Android/i.test(ua)) dType = 'Android';
        else if (/iPhone|iPad|iPod/i.test(ua)) dType = 'iOS';
        else if (/Mac/i.test(ua)) dType = 'Mac';
        else if (/Windows/i.test(ua)) dType = 'Windows';

        statsRef.child('devices/' + did).set({ type: dType, lastSeen: Date.now() }).catch(e => {});
    } catch (e) { console.error("logVisit Error:", e); }
}

function loadData() { 
    try {
        photoBank = getStore('photos') || {};
        let pData = getStore('p'); 
        players = safeArr(pData).filter(p => p && p.id); 
        matches = safeArr(getStore('m')); 
        settings = getStore('s') ? {...ds, ...getStore('s')} : {...ds}; 
        savedTournaments = safeArr(getStore('h')).filter(t => t && t.id); 
        preGeneratedTournament = safeArr(getStore('pregen')); 
        currentTid = getStore('tid'); 
        localLastUpdate = getStore('lastUpdate') || 0; 
        timeLeft = settings.matchDuration * 60; 
        
        let needsClean = false;
        const cleanP = (p) => { 
            if (p && p.photo) { 
                if (!photoBank[p.id]) photoBank[p.id] = p.photo; 
                delete p.photo; needsClean = true; 
            } 
        };
        
        players.forEach(cleanP);
        savedTournaments.forEach(t => {
            if(t.players) t.players.forEach(cleanP);
            if(t.matches) t.matches.forEach(m => {
                if(m.team1) m.team1.forEach(cleanP);
                if(m.team2) m.team2.forEach(cleanP);
            });
        });
        
        if(needsClean) { setStore('photos', photoBank); setStore('p', players); setStore('h', savedTournaments); }
    } catch(e) { console.error("loadData error:", e); }
}

function ensureTournamentId() { 
    try {
        if(!currentTid) { 
            currentTid = uid(); 
            let defaultName = new Date().toLocaleDateString('lt-LT') + ' Turnyras';
            const tField = el('tournament-name-field');
            if (tField && tField.value.trim() !== '') defaultName = tField.value.trim();
            
            savedTournaments.unshift({ id: currentTid, name: defaultName, date: new Date().toISOString(), players: [...safeArr(players)], matches: [...safeArr(matches)], settings: {...settings} }); 
            setStore('tid', currentTid); 
            
            if (tField && document.activeElement !== tField) tField.value = defaultName;
            preGeneratedTournament = []; setStore('pregen', preGeneratedTournament); 
            autoSave(true); 
        } 
    } catch(e) { console.error("ensureTournamentId Error:", e); }
}

function updateTournamentName(val) {
    try {
        if(!currentTid) ensureTournamentId(); 
        const idx = safeArr(savedTournaments).findIndex(x => x && x.id === currentTid); 
        if(idx > -1) { 
            savedTournaments[idx].name = val || "Turnyras";
            setStore('h', savedTournaments);
            clearTimeout(nameUpdateTimer);
            nameUpdateTimer = setTimeout(() => { autoSave(true); }, 800);
        } 
    } catch(e) { console.error("updateTournamentName Error:", e); }
}

function trimPhotoBankIfNeeded() {
    try {
        let photoStr = JSON.stringify(photoBank);
        if (photoStr.length > 3 * 1024 * 1024) {
            let activeIds = new Set();
            players.forEach(p => activeIds.add(p.id));
            savedTournaments.forEach(t => { if(t && t.players) t.players.forEach(p => activeIds.add(p.id)); });
            let deleted = 0;
            for (let id in photoBank) { if (!activeIds.has(id)) { delete photoBank[id]; deleted++; } }
            setStore('photos', photoBank);
        }
    } catch(e) { console.error("trimPhotoBankIfNeeded Error:", e); }
}

function autoSave(fullSync = false) { 
    try { 
        const now = Date.now(); localLastUpdate = now; 
        if(currentTid) { 
            const idx = savedTournaments.findIndex(x => x.id === currentTid); 
            if(idx > -1) { 
                const tF = el('tournament-name-field');
                let setupView = el('view-setup');
                if (tF && setupView && setupView.classList.contains('active')) savedTournaments[idx].name = tF.value || "Turnyras";
                savedTournaments[idx].players = players; savedTournaments[idx].matches = matches; savedTournaments[idx].settings = settings; savedTournaments[idx].lastUpdate = now; 
            } 
        } 
        setStore('p', players); setStore('m', matches); setStore('s', settings); setStore('h', savedTournaments); setStore('tid', currentTid); setStore('lastUpdate', now); setStore('dataRoom', activeRoom || ''); 
        
        if(isCloud && dbRef && fullSync) { 
            const p = { players, matches, settings, savedTournaments, currentTid, lastUpdate: now }; 
            window.lastCloudUpdate = now; 
            dbRef.update(p); 
            
            syncPlayersToGlobalDB();
            // Atnaujinam kambario "gyvumo" laiką (kad liktų portalo aktyvių sąraše), max kas 60s
            if (activeRoom && (!window._lastRegPing || Date.now() - window._lastRegPing > 60000)) {
                window._lastRegPing = Date.now();
                firebase.database().ref(REG_KEY + '/' + activeRoom).set(Date.now());
            }
        } 
        render(); 
    } catch(e) { console.error("autoSave Error:", e); } 
}

function liveUpdateMatches() {
    try {
        const now = Date.now(); localLastUpdate = now;
        setStore('m', matches); setStore('lastUpdate', now); setStore('dataRoom', activeRoom || '');
        let upd = { matches: matches, lastUpdate: now };
        if (currentTid) { const idx = savedTournaments.findIndex(x => x.id === currentTid); if (idx > -1) { savedTournaments[idx].matches = matches; setStore('h', savedTournaments); } }
        if (isCloud && dbRef) { 
            window.lastCloudUpdate = now; 
            dbRef.update(upd); 
            
            updateGlobalRatingsFromMatches();
            // Atnaujinam kambario "gyvumo" laiką (kad liktų portalo aktyvių sąraše), max kas 60s
            if (activeRoom && (!window._lastRegPing || Date.now() - window._lastRegPing > 60000)) {
                window._lastRegPing = Date.now();
                firebase.database().ref(REG_KEY + '/' + activeRoom).set(Date.now());
            }
        }
        render();
    } catch (e) { console.error("liveUpdateMatches Error:", e); }
}

function initFirebaseConnection() { 
    let room = el('fb-room')?.value.trim() || activeRoom; if(!room) return; 
    room = room.toUpperCase(); 
    
    if(dbRef) { dbRef.off(); } 
    if(globalPlayersRef) { globalPlayersRef.off(); }
    
    ensureFirebaseInit(); activeRoom = room; isCloud = true; localStorage.setItem('sp_active_room_master', room); 
    saveToMyRooms(room);
    
    firebase.database().ref(REG_KEY + '/' + room).set(Date.now()); 
    dbRef = firebase.database().ref(DB_KEY + '/' + room); 
    dbPhotosRef = firebase.database().ref(DB_KEY + '/' + room + '_photos');

    // Savininko nustatymas: jei kambarys NAUJAS (neturi savininko), dabartinis vartotojas tampa savininku.
    // Hibridas: jei prisijungęs prie profilio → profilio ID, kitaip → įrenginio ID.
    firebase.database().ref(`${DB_KEY}/${room}/owner`).once('value').then(ownerSnap => {
        if (!ownerSnap.exists()) {
            firebase.database().ref(`${DB_KEY}/${room}/owner`).set(getCurrentOwnerId());
        }
    });
    
    globalPlayersRef = firebase.database().ref(GLOBAL_PLAYERS_KEY);
    globalPlayersRef.on('value', snap => {
        globalPlayersData = snap.val() || {};
    });

    safeText('cloud-status', "Prijungta"); safeClass('cloud-connect-ui', "hidden"); safeClass('cloud-active-ui', "space-y-4 text-center flex flex-col items-center"); safeText('cloud-room-name-display', room); 

    // Minkšta apsauga: trynimo mygtukas rodomas TIK savininkui
    isRoomOwner(room).then(isOwner => {
        const delBtn = el('deleteRoomBtn');
        if (delBtn) delBtn.style.display = isOwner ? 'block' : 'none';
    });
    
    const qrC = el('qrcode'); if(qrC && typeof QRCode !== 'undefined') { qrC.innerHTML = ''; new QRCode(qrC, { text: window.location.origin + window.location.pathname + `?room=${encodeURIComponent(room)}`, width: 160, height: 160 }); }
    
    if(dbPhotosRef) {
        // GYVAS klausymas — kai bet kuris žaidėjas prideda nuotrauką, ją iškart mato visi
        dbPhotosRef.on('value', snap => {
            const cloudPhotos = snap.val();
            if(cloudPhotos) {
                photoBank = { ...photoBank, ...cloudPhotos };
                setStore('photos', photoBank);
                render();
            }
        });
    }

    dbRef.on('value', snap => { 
        const d = snap.val(); 
        if(!d) return; 
        const cloudUpdate = d.lastUpdate || 0; 
        if (cloudUpdate === window.lastCloudUpdate) return;                                  // mūsų pačių echo
        // Ar lokalūs duomenys priklauso ŠIAM kambariui? (jei ką tik prisijungėm prie kito — debesis viršesnis)
        const sameRoom = (getStore('dataRoom') === activeRoom); 
        if (sameRoom && cloudUpdate === (localLastUpdate || 0)) { window.lastCloudUpdate = cloudUpdate; return; } // jau sinchronizuota
        if (!sameRoom || cloudUpdate > (localLastUpdate || 0)) { 
            // Debesis viršesnis (naujesnis ARBA kito kambario) → priimam ir įrašom lokaliai
            window.lastCloudUpdate = cloudUpdate; 
            if(d.photoBank) { photoBank = d.photoBank; setStore('photos', photoBank); }
            players = safeArr(d.players); matches = safeArr(d.matches); settings = d.settings || {...ds}; savedTournaments = safeArr(d.savedTournaments); currentTid = d.currentTid; 
            localLastUpdate = cloudUpdate; 
            setStore('lastUpdate', localLastUpdate); setStore('dataRoom', activeRoom || ''); setStore('m', matches); setStore('p', players); setStore('h', savedTournaments); setStore('s', settings); setStore('tid', currentTid); 
            render(); 
        } else { 
            // Lokalūs to paties kambario duomenys NAUJESNI (pvz. ką tik sugeneruoti finalai, kurių debesis dar negavo) → NEperrašom; pastumiam į debesį
            window.lastCloudUpdate = localLastUpdate; 
            setStore('dataRoom', activeRoom || ''); 
            if (isCloud && dbRef) dbRef.update({ players, matches, settings, savedTournaments, currentTid, lastUpdate: localLastUpdate }); 
        } 
    }); 
}

// Grąžina dabartinio vartotojo "savininko" ID.
// Hibridas: jei prisijungęs prie profilio (telefono ID) → naudojam jį; kitaip → įrenginio ID.
function getCurrentOwnerId() {
    // Profilis (jei prisijungęs portale ir ID matomas generatoriuje)
    try {
        const u = JSON.parse(localStorage.getItem('sp_current_user') || 'null');
        if (u && u.id) return 'user_' + u.id;
    } catch(e) {}
    // Įrenginio ID (sukuriamas vieną kartą, lieka naršyklėje)
    let devId = localStorage.getItem('sp_device_id');
    if (!devId) {
        devId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('sp_device_id', devId);
    }
    return devId;
}

// Patikrina ar dabartinis vartotojas yra šio kambario savininkas.
// Grąžina Promise<boolean>.
function isRoomOwner(room) {
    // LAIKINAI IŠJUNGTA (vartotojo prašymu prieš testą): trynimo mygtukas matomas visiems.
    // Norint grąžinti savininko apsaugą — atkomentuoti žemiau esantį bloką ir ištrinti šią eilutę.
    return Promise.resolve(true);
    /* return firebase.database().ref(`${DB_KEY}/${room}/owner`).once('value').then(snap => {
        const owner = snap.val();
        if (!owner) return true; // senas kambarys be savininko — leidžiam (atgalinis suderinamumas)
        return owner === getCurrentOwnerId();
    }).catch(() => false); */
}

function disconnectFirebase() { 
    if(dbRef) { dbRef.off(); dbRef = null; } 
    if(globalPlayersRef) { globalPlayersRef.off(); globalPlayersRef = null; }
    dbPhotosRef = null;
    localStorage.removeItem('sp_active_room_master'); 
    location.reload(); 
}

// Ištrina visą kambarį iš Firebase (kambario duomenis, nuotraukas, registracijos žymą).
// SVARBU: žaidėjų globali statistika (padelio_global_players) NETRINAMA —
// ji saugoma atskirai ir lieka žaidėjų profiliuose net ištrynus kambarį.
function deleteCurrentRoom() {
    if (!isCloud || !activeRoom) { alert("Nesate prisijungę prie kambario."); return; }

    // Patikriname ar esate savininkas (arba senas kambarys be savininko)
    isRoomOwner(activeRoom).then(isOwner => {
        if (!isOwner) {
            alert("⛔ Tik kambarį sukūręs žaidėjas gali jį ištrinti.\n\nJūs galite atsijungti, bet kambario neištrinsite.");
            return;
        }
        proceedDeleteRoom();
    });
}

function proceedDeleteRoom() {
    if (!confirm(`⚠️ DĖMESIO!\n\nIštrinsite kambarį "${activeRoom}" VISIEMS dalyviams.\n\nKas bus ištrinta:\n• Kambario žaidėjų sąrašas ir mačai\n• Kambario nuotraukos\n\nKas IŠLIKS:\n• Žaidėjų ELO reitingai ir statistika profiliuose\n\nTęsti?`)) return;
    if (!confirm(`Ar tikrai? Šio veiksmo atšaukti negalėsite.`)) return;

    const room = activeRoom;
    const updates = {};
    updates[`${DB_KEY}/${room}`] = null;
    updates[`${DB_KEY}/${room}_photos`] = null;
    updates[`${REG_KEY}/${room}`] = null;
    updates[`padelio_rooms/${room}`] = null;

    firebase.database().ref().update(updates).then(() => {
        if(dbRef) { dbRef.off(); dbRef = null; }
        if(globalPlayersRef) { globalPlayersRef.off(); globalPlayersRef = null; }
        dbPhotosRef = null;
        localStorage.removeItem('sp_active_room_master');
        alert("Kambarys ištrintas. Žaidėjų statistika profiliuose išliko.");
        location.reload();
    }).catch(err => {
        console.error("Room delete error:", err);
        alert("Klaida trinant kambarį. Bandykite dar kartą.");
    });
}

// ==========================================
// "MANO KAMBARIAI" — išsaugotų kambarių sąrašas greitam prisijungimui
// ==========================================
// Kai prisijungiama prie kambario, jo pavadinimas išsaugomas localStorage.
// Vėliau (pvz. kitą savaitę) galima prisijungti vienu paspaudimu,
// net jei kambarys dingo iš "Aktyvūs kambariai" sąrašo.

function getMyRooms() {
    try { return JSON.parse(localStorage.getItem('sp_my_rooms') || '[]'); }
    catch (e) { return []; }
}

function saveToMyRooms(room) {
    if (!room) return;
    let rooms = getMyRooms();
    // Pašaliname jei jau yra (kad atnaujintume datą), įdedame į priekį
    rooms = rooms.filter(r => r.name !== room);
    rooms.unshift({ name: room, lastUsed: Date.now() });
    rooms = rooms.slice(0, 10); // laikome iki 10 paskutinių
    localStorage.setItem('sp_my_rooms', JSON.stringify(rooms));
}

function removeFromMyRooms(room) {
    let rooms = getMyRooms().filter(r => r.name !== room);
    localStorage.setItem('sp_my_rooms', JSON.stringify(rooms));
    renderMyRooms();
}

function quickConnectRoom(room) {
    const field = el('fb-room');
    if (field) field.value = room;
    initFirebaseConnection();
}

function renderMyRooms() {
    const box = el('my-rooms-list');
    if (!box) return;
    const rooms = getMyRooms();
    if (rooms.length === 0) {
        box.innerHTML = '';
        return;
    }
    box.innerHTML = `
        <div class="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest mt-4"><i class="fa-solid fa-clock-rotate-left"></i> Mano kambariai</div>
        <div class="space-y-2">
            ${rooms.map(r => `
                <div class="flex items-center gap-2 bg-slate-50 rounded-xl p-2 border border-slate-100">
                    <button type="button" onclick="quickConnectRoom('${r.name.replace(/'/g, "\\'")}')" class="flex-1 text-left px-2 py-1">
                        <div class="font-bold text-slate-700 text-sm">${r.name}</div>
                        <div class="text-[10px] text-slate-400">${new Date(r.lastUsed).toLocaleDateString('lt-LT')}</div>
                    </button>
                    <button type="button" onclick="quickConnectRoom('${r.name.replace(/'/g, "\\'")}')" class="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap"><i class="fa-solid fa-wifi"></i> Jungtis</button>
                    <button type="button" onclick="removeFromMyRooms('${r.name.replace(/'/g, "\\'")}')" class="text-slate-300 hover:text-red-500 px-2 py-2"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `).join('')}
        </div>
    `;
}

// Įkelia žaidėjo nuotrauką į kambario debesį, kad ją matytų visi prisijungę žaidėjai.
// Kviečiama kai pridedama/pakeičiama nuotrauka generatoriuje.
function uploadPhotoToRoom(playerId, photo) {
    if (!isCloud || !dbPhotosRef || !playerId || !photo) return;
    try {
        dbPhotosRef.child(playerId).set(photo);
    } catch(e) { console.error("uploadPhotoToRoom error:", e); }
}

function syncPlayersToGlobalDB() {
    if (!isCloud || !globalPlayersRef) return;
    
    // Tikriname ar ID yra tikras telefono numeris (vien skaitmenys, 7+ ženklų),
    // o ne atsitiktinis UUID (su brūkšneliais). Tik tokiems kuriame globalų profilį,
    // kad neprikurtume "šešėlinių" profilių neregistruotiems žaidėjams.
    const isRealPhoneId = (id) => /^[0-9]{7,}$/.test(String(id));

    players.forEach(p => {
        if (!isRealPhoneId(p.id)) return; // praleidžiame UUID žaidėjus

        const globalP = globalPlayersData[p.id];
        if (!globalP) {
            globalPlayersRef.child(p.id).set({
                id: p.id,
                name: p.name,
                gender: p.gender,
                rating: 300, 
                tier: "D",
                total_matches: 0,
                last_played: Date.now()
            });
        } else {
            if (globalP.name !== p.name || globalP.gender !== p.gender) {
                globalPlayersRef.child(p.id).update({ name: p.name, gender: p.gender });
            }
        }
        
        if (photoBank[p.id] && (!globalP || !globalP.hasPhoto)) {
            firebase.database().ref(GLOBAL_PLAYERS_KEY + '_photos/' + p.id).set(photoBank[p.id]);
            globalPlayersRef.child(p.id).update({ hasPhoto: true });
        }
    });
}

function updateGlobalRatingsFromMatches() {
    if (!isCloud || !globalPlayersRef) return;
    
    let syncedAny = false;
    matches.filter(m => m.finished && !m.globalSyncDone).forEach(m => {
        if (settings && settings.level !== 'Privatus') {
            if (typeof processGlobalEloForMatch === 'function') {
                processGlobalEloForMatch(m, globalPlayersData, globalPlayersRef);
            }
        }
        m.globalSyncDone = true;
        syncedAny = true;
    });
    
    setStore('m', matches);

    // SVARBU: iškart išsaugome globalSyncDone žymę į debesį,
    // kad dbRef.on('value') neperrašytų matches sena versija ir neskaičiuotų antrą kartą
    if (syncedAny && isCloud && dbRef) {
        window.lastCloudUpdate = Date.now();
        dbRef.update({ matches: matches, lastUpdate: window.lastCloudUpdate });
    }
}
