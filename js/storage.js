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
        
        if(isCloud && dbRef && fullSync && !window.roomReadOnly) {
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
        if (isCloud && dbRef && !window.roomReadOnly) {
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

    // NUOSAVYBĖ IR PRIEIGA: naujas kambarys pažymimas kūrėju (su galimybe apsaugoti PIN kodu),
    // esamam — nustatoma rašymo teisė (klubo kambariai → tik klubo adminai; PIN kambariai → tik
    // žinantys PIN; laisvi draugų kambariai → visi). Be teisės — tik peržiūros režimas.
    window.roomReadOnly = false;
    claimOrResolveRoomAccess(room);

    globalPlayersRef = firebase.database().ref(GLOBAL_PLAYERS_KEY);
    globalPlayersRef.on('value', snap => {
        globalPlayersData = snap.val() || {};
        // Kambario žaidėjų nuotraukos iš bendros saugyklos (pvz. ką tik įkeltos portale)
        setTimeout(fetchMissingGlobalPhotos, 800);
    });

    safeText('cloud-status', "Prijungta"); safeClass('cloud-connect-ui', "hidden"); safeClass('cloud-active-ui', "space-y-4 text-center flex flex-col items-center"); safeText('cloud-room-name-display', room);
    
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
            // Official/Casual režimą diktuoja kambario owner žyma (portalo admin), ne debesies settings
            if (typeof window.roomOfficialFlag === 'boolean') settings.isOfficial = window.roomOfficialFlag;
            localLastUpdate = cloudUpdate; 
            setStore('lastUpdate', localLastUpdate); setStore('dataRoom', activeRoom || ''); setStore('m', matches); setStore('p', players); setStore('h', savedTournaments); setStore('s', settings); setStore('tid', currentTid); 
            render(); 
        } else {
            // Lokalūs to paties kambario duomenys NAUJESNI (pvz. ką tik sugeneruoti finalai, kurių debesis dar negavo) → NEperrašom; pastumiam į debesį
            window.lastCloudUpdate = localLastUpdate;
            setStore('dataRoom', activeRoom || '');
            if (isCloud && dbRef && !window.roomReadOnly) dbRef.update({ players, matches, settings, savedTournaments, currentTid, lastUpdate: localLastUpdate });
        }
    }); 
}

// ==========================================
// KAMBARIŲ NUOSAVYBĖ IR PRIEIGOS KONTROLĖ
// ==========================================
// Kambarių tipai pagal owner įrašą (DB_KEY/{room}/owner):
//  • { type:'club', clubId, clubName } — oficialus, sukurtas klubo admin panelėje portale.
//    Rašyti gali TIK to klubo administratoriai (atpažįstami per bendrą Firebase Auth sesiją).
//  • { type:'personal', email } / { type:'device', id } / senas string ('user_...'/'dev_...') —
//    draugų kambarys. Rašyti gali visi prisijungę (bendras rezultatų vedimas), nebent kūrėjas
//    nustatė PIN (DB_KEY/{room}/security/pin) — tada rašymui reikia PIN. Trinti — tik kūrėjas.

// El. paštas → saugus DB raktas (kopija iš portalo — generatorius auth failo neįkelia)
function emailKeyGen(email) {
    return String(email || '').trim().toLowerCase().replace(/[.#$\[\]\/]/g, ',');
}

// Prisijungusio (per portalą — sesija bendra tame pačiame domene) vartotojo el. paštas
function getAuthEmail() {
    try {
        if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
            const u = firebase.auth().currentUser;
            if (u && u.email) return String(u.email).toLowerCase();
        }
    } catch (e) {}
    return null;
}

// Grąžina dabartinio vartotojo "savininko" ID (silpnesnės tapatybės — kai nėra el. pašto).
function getCurrentOwnerId() {
    try {
        const u = JSON.parse(localStorage.getItem('sp_current_user') || 'null');
        if (u && u.id) return 'user_' + u.id;
    } catch(e) {}
    let devId = localStorage.getItem('sp_device_id');
    if (!devId) {
        devId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('sp_device_id', devId);
    }
    return devId;
}

// Ar dabartinės tapatybės atitinka draugų kambario savininką (bet kurio formato)?
function matchesOwnerIdentity(owner) {
    if (!owner) return true; // senas kambarys be savininko — atgalinis suderinamumas
    const email = getAuthEmail();
    if (typeof owner === 'string') return owner === getCurrentOwnerId();
    if (owner.type === 'personal') return !!(email && owner.email === email);
    if (owner.type === 'device') return owner.id === getCurrentOwnerId();
    return false;
}

// Laukia, kol Firebase Auth atstatys sesiją. Puslapio starte (pvz. atėjus su
// ?room=X iš portalo) currentUser kelias sekundes būna null, nors vartotojas
// prisijungęs — be šio laukimo klubo adminas gaudavo „tik peržiūrą".
let _authReadyPromise = null;
function authEmailReady() {
    const now = getAuthEmail();
    if (now) return Promise.resolve(now);
    if (_authReadyPromise) return _authReadyPromise;
    _authReadyPromise = new Promise(resolve => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(getAuthEmail()); } };
        try {
            if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
                const off = firebase.auth().onAuthStateChanged(() => { try { off(); } catch (e) {} finish(); });
            }
        } catch (e) {}
        setTimeout(finish, 6000); // atsarginis kelias — jei auth neužsikrauna
    });
    return _authReadyPromise;
}

// Ar prisijungęs vartotojas yra nurodyto klubo administratorius? Promise<boolean>
function isClubAdminOf(clubId) {
    if (!clubId) return Promise.resolve(false);
    return authEmailReady().then(email => {
        if (!email) return false;
        return firebase.database().ref('padelio_club_admins/' + emailKeyGen(email)).once('value')
            .then(s => { const rec = s.val(); return !!(rec && rec.clubId === clubId); })
            .catch(() => false);
    });
}

// Ar dabartinis vartotojas yra šio kambario savininkas (gali TRINTI kambarį)? Promise<boolean>
function isRoomOwner(room) {
    return firebase.database().ref(`${DB_KEY}/${room}/owner`).once('value').then(snap => {
        const owner = snap.val();
        if (!owner) return true; // senas kambarys be savininko
        if (typeof owner === 'object' && owner.type === 'club') return isClubAdminOf(owner.clubId);
        return matchesOwnerIdentity(owner);
    }).catch(() => false);
}

// Prisijungimo metu: naujas kambarys pažymimas kūrėju (+ pasirinktinai PIN), esamam nustatoma
// rašymo teisė, ORGANIZATORIAUS statusas (importų įrankiai Setup ekrane) ir Official/Casual
// režimas iš kambario owner žymos (ją įrašo portalo admin panelė kurdama turnyrą).
function claimOrResolveRoomAccess(room) {
    const ownerRef = firebase.database().ref(`${DB_KEY}/${room}/owner`);
    // Pirma palaukiam auth sesijos atstatymo — tik tada sprendžiam prieigą
    // (kitaip naujas kambarys būtų pažymėtas „device" vietoj el. pašto, o
    // klubo/asmeninis savininkas negautų savo teisių)
    authEmailReady().then(() => Promise.all([
        ownerRef.once('value'),
        firebase.database().ref(`${DB_KEY}/${room}/security`).once('value')
    ])).then(results => {
        const owner = results[0].val();
        const security = results[1].val() || {};
        const pinField = el('fb-room-pin');
        const enteredPin = pinField ? String(pinField.value || '').trim() : '';

        // Official (lygos ELO) режimas — TIK iš klubo kambario žymos; draugų kambariai visada Casual
        applyOfficialFlag(!!(owner && typeof owner === 'object' && owner.type === 'club' && owner.official === true));

        if (!owner) {
            // NAUJAS kambarys — dabartinis vartotojas tampa kūrėju (ir organizatoriumi)
            const email = getAuthEmail();
            const newOwner = email
                ? { type: 'personal', email: email, createdAt: Date.now() }
                : { type: 'device', id: getCurrentOwnerId(), createdAt: Date.now() };
            ownerRef.set(newOwner);
            // PIN apsauga (nebūtina): 4 skaitmenys iš prisijungimo lauko
            if (/^[0-9]{4}$/.test(enteredPin)) {
                firebase.database().ref(`${DB_KEY}/${room}/security/pin`).set(enteredPin);
                localStorage.setItem('sp_room_pin_' + room, enteredPin);
                setTimeout(() => alert('🔒 Kambarys apsaugotas PIN kodu ' + enteredPin + '.\n\nRezultatus vesti galės tik jį žinantys — pasidalinkite kodu su žaidėjais.'), 200);
            } else if (enteredPin) {
                setTimeout(() => alert('PIN kodas turi būti 4 skaitmenys — kambarys sukurtas BE apsaugos.'), 200);
            }
            setRoomAccess(true, '', true, '');
            return;
        }

        // ESAMAS kambarys
        if (typeof owner === 'object' && owner.type === 'club') {
            isClubAdminOf(owner.clubId).then(ok => {
                if (ok) { setRoomAccess(true, '', true, owner.clubName || ''); return; }
                setRoomAccess(false, 'Kambarį valdo klubas „' + (owner.clubName || 'klubas') + '" — jūs matote tik peržiūrą. Redaguoti gali tik klubo administratoriai, prisijungę portale.', false, '');
            });
            return;
        }
        const isCreator = matchesOwnerIdentity(owner);
        const pin = security.pin;
        if (pin) {
            if (isCreator) { localStorage.setItem('sp_room_pin_' + room, pin); setRoomAccess(true, '', true, ''); return; }
            const saved = localStorage.getItem('sp_room_pin_' + room);
            let candidate = enteredPin || saved || '';
            if (candidate !== pin) candidate = prompt('🔒 Šis kambarys apsaugotas PIN kodu.\n\nĮveskite 4 skaitmenų kodą (be jo — tik peržiūra):') || '';
            if (candidate === pin) { localStorage.setItem('sp_room_pin_' + room, pin); setRoomAccess(true, '', false, ''); }
            else setRoomAccess(false, 'Kambarys apsaugotas PIN kodu — be jo galite tik stebėti rezultatus. Norėdami vesti taškus, atsijunkite ir prisijunkite įvedę teisingą PIN.', false, '');
            return;
        }
        setRoomAccess(true, '', isCreator, '');
    }).catch(e => { console.error('roomAccess klaida:', e); setRoomAccess(true, '', false, ''); });
}

// Official/Casual режимas taikomas settings (ir po debesies sinchronizacijos — žr. dbRef.on).
function applyOfficialFlag(isOfficial) {
    window.roomOfficialFlag = !!isOfficial;
    if (typeof settings !== 'undefined' && settings) settings.isOfficial = window.roomOfficialFlag;
    if (typeof renderTimerAndSettings === 'function') { try { renderTimerAndSettings(); } catch (e) {} }
}

// Įjungia/išjungia peržiūros режимą ir organizatoriaus įrankius.
function setRoomAccess(canWrite, message, isOrganizer, clubName) {
    window.roomReadOnly = !canWrite;
    window.isRoomOrganizer = !!isOrganizer;
    let bar = document.getElementById('room-readonly-banner');
    if (canWrite) { if (bar) bar.remove(); }
    else {
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'room-readonly-banner';
            bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:#b45309;color:#fff;padding:8px 14px;font-size:11px;font-weight:bold;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);';
            document.body.appendChild(bar);
        }
        bar.innerHTML = '🔒 TIK PERŽIŪRA — ' + String(message || '').replace(/[<>]/g, '');
    }
    // Organizatoriaus įrankiai (importai) Setup ekrane — tik kambario šeimininkui
    const tools = el('organizer-tools');
    if (tools) tools.classList.toggle('hidden', !isOrganizer);
    const clubLabel = el('organizer-club-label');
    if (clubLabel) clubLabel.textContent = clubName ? ('— ' + clubName) : '';
    // Trynimo mygtukas — tik šeimininkui su rašymo teise
    const delBtn = el('deleteRoomBtn');
    if (delBtn) delBtn.style.display = (isOrganizer && canWrite) ? 'block' : 'none';
}

// Platformos savininkas = pagrindinio (legacyOwner) klubo adminas — jam Debesies ekrane
// rodomas „Platformos statistika" mygtukas. Jokių kodų — atpažįstama per Auth sesiją.
function initPlatformOwnerCheck() {
    try {
        ensureFirebaseInit();
        if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') return;
        firebase.auth().onAuthStateChanged(u => {
            if (!u || !u.email) return;
            firebase.database().ref('padelio_club_admins/' + emailKeyGen(u.email)).once('value').then(s => {
                const rec = s.val();
                if (!rec || !rec.clubId) return;
                firebase.database().ref('padelio_clubs/' + rec.clubId + '/legacyOwner').once('value').then(ls => {
                    if (ls.val() === true) {
                        window.isPlatformOwner = true;
                        el('superadmin-btn')?.classList.remove('hidden');
                    }
                });
            });
        });
    } catch (e) { /* ne kritiška */ }
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

    firebase.database().ref().update(updates).then(() => {
        // padelio_rooms (casual ELO) šaka reikalauja prisijungimo — trinam atskirai,
        // kad anonimo kūrėjo kambario trynimas nesulūžtų dėl vieno kelio
        firebase.database().ref('padelio_rooms/' + room).remove().catch(() => {});
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

// Įkelia nuotrauką į BENDRĄ saugyklą (padelio_global_players_photos) — vienintelį tikrą
// šaltinį, iš kurio ją mato portalas, kortelės, reitingai ir kiti kambariai.
// Tik registruotiems (telefono ID) žaidėjams. Atnaujina ir esamą (ne tik pirmą kartą).
function uploadPhotoToGlobal(playerId, photo) {
    if (!playerId || !photo || !/^[0-9]{7,}$/.test(String(playerId))) return;
    try {
        firebase.database().ref(GLOBAL_PLAYERS_KEY + '_photos/' + playerId).set(photo);
        firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + playerId + '/hasPhoto').set(true).catch(() => {});
    } catch (e) { console.error("uploadPhotoToGlobal error:", e); }
}

// Parsisiunčia TRŪKSTAMAS kambario žaidėjų nuotraukas iš bendros saugyklos:
// žaidėjas įsikėlė nuotrauką portale → ji automatiškai atsiranda ir generatoriuje
// (o per uploadPhotoToRoom — ir kitų kambario dalyvių ekranuose).
let _photoFetchBusy = false;
function fetchMissingGlobalPhotos() {
    if (_photoFetchBusy || !isCloud) return;
    const candidates = safeArr(players).filter(p =>
        p && /^[0-9]{7,}$/.test(String(p.id)) && !photoBank[p.id] &&
        globalPlayersData[p.id] && globalPlayersData[p.id].hasPhoto === true
    );
    if (!candidates.length) return;
    _photoFetchBusy = true;
    let left = candidates.length;
    let gotAny = false;
    const done = () => {
        left--;
        if (left > 0) return;
        _photoFetchBusy = false;
        if (gotAny) { setStore('photos', photoBank); if (typeof render === 'function') render(); }
    };
    candidates.forEach(p => {
        firebase.database().ref(GLOBAL_PLAYERS_KEY + '_photos/' + p.id).once('value').then(s => {
            const photo = s.val();
            if (photo) {
                photoBank[p.id] = photo;
                uploadPhotoToRoom(p.id, photo);
                gotAny = true;
            }
            done();
        }).catch(done);
    });
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
