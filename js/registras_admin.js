// ==========================================
// 6. ADMINISTRATORIAUS VALDYMO PLATFORMA
// ==========================================

function promptAdmin() {
    if (!isAppMode) { toggleMode(); return; }
    openInputModal(
        '<i class="fa-solid fa-lock" style="color: var(--primary-blue);"></i> Administratoriaus prieiga',
        'Įveskite kodą',
        'Prisijungti',
        (code) => {
            if (code === "7030") { toggleMode(); }
            else if (code) { showToast("Neteisingas kodas!"); }
        },
        'password'
    );
}

function toggleMode() {
    const app = document.getElementById('appMode'); 
    const admin = document.getElementById('adminMode');
    if(!app || !admin) return;
    if (isAppMode) { 
        app.style.display = 'none'; 
        admin.style.display = 'block'; 
        adminNav(document.querySelector('.admin-sidebar li:nth-child(2)'), 'admin-view-turnyrai');
    } else { 
        app.style.display = 'block'; 
        admin.style.display = 'none'; 
        renderTournaments(); 
    }
    isAppMode = !isAppMode;
}

function adminNav(element, viewId) { 
    document.querySelectorAll('.admin-sidebar li').forEach(el => el.classList.remove('active')); 
    if (element) element.classList.add('active'); 
    
    document.querySelectorAll('.admin-tab').forEach(el => el.style.display = 'none');
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.style.display = 'block';

    if (viewId === 'admin-view-zaidejai') {
        loadAdminPlayersDB();
    } else if (viewId === 'admin-view-turnyrai') {
        renderAdminTournaments();
    }
}

function parseTimeStr(timeStr) {
    if(!timeStr) return null;
    const parts = timeStr.split('-'); if (parts.length !== 2) return null;
    const startParts = parts[0].trim().split(':'); const endParts = parts[1].trim().split(':');
    if (startParts.length !== 2 || endParts.length !== 2) return null;
    return { start: parseInt(startParts[0]) * 60 + parseInt(startParts[1]), end: parseInt(endParts[0]) * 60 + parseInt(endParts[1]) };
}

function createTournament(e) { 
    e.preventDefault(); 
    const baseDateStr = document.getElementById('newDate').value; 
    const laikas = document.getElementById('newTime').value; 
    const repeatCount = parseInt(document.getElementById('newRepeat').value || 1); 
    
    const naujasLaikasObj = parseTimeStr(laikas);
    const persidengiantysTurnyrai = tournaments.filter(t => {
        if (t.date !== baseDateStr) return false;
        const esamasLaikasObj = parseTimeStr(t.time);
        if (!naujasLaikasObj || !esamasLaikasObj) return false;
        return naujasLaikasObj.start < esamasLaikasObj.end && naujasLaikasObj.end > esamasLaikasObj.start;
    });

    if (persidengiantysTurnyrai.length > 0) {
        const rastiTurnyrai = persidengiantysTurnyrai.map(t => `${t.format} (${t.time}, ${t.level} lygis)`).join('\n👉 ');
        if (!confirm(`⚠️ ĮSPĖJIMAS: Šią dieną kerta kitus turnyrus:\n👉 ${rastiTurnyrai}\n\nTęsti turnyro kūrimą?`)) return;
    }

    const [month, day] = baseDateStr.split('-').map(Number);
    const baseDate = new Date(new Date().getFullYear(), month - 1, day);

    for (let i = 0; i < repeatCount; i++) {
        let newDateObj = new Date(baseDate);
        newDateObj.setDate(baseDate.getDate() + (i * 7)); 
        let m = (newDateObj.getMonth() + 1).toString().padStart(2, '0');
        let d = newDateObj.getDate().toString().padStart(2, '0');
        let finalDateStr = `${m}-${d}`;

        const newT = { 
            id: Date.now() + i, date: finalDateStr, 
            format: document.getElementById('newFormat').value, 
            category: document.getElementById('newCategory').value,
            level: document.getElementById('newLevel').value, 
            time: laikas, registered: 0, 
            max: parseInt(document.getElementById('newMax').value), 
            status: 'open', isDemoWaitlist: false, waitlistCount: 0, timeState: 'future', players: [] 
        }; 
        tournaments.push(newT); 
    }
    saveData(); 
    showToast(`Turnyrai sukurti debesyje! (Viso: ${repeatCount})`); 
    document.getElementById('adminForm').reset(); 
}

function renderAdminTournaments() {
    const list = document.getElementById('admin-tournaments-list-db');
    if(!list) return;
    if(tournaments.length === 0) {
        list.innerHTML = '<div style="color: #718096; font-size: 13px; text-align:center; padding: 20px;">Turnyrų nėra.</div>';
        return;
    }
    
    let sorted = [...tournaments].sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; min-width: 500px;">';
    html += '<tr style="background: #edf2f7; color: #718096; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;"><th style="padding: 12px; border-radius: 6px 0 0 0;">Diena</th><th>Laikas</th><th>Formatas</th><th>Lygis</th><th>Dalyviai</th><th style="padding: 12px; text-align: center; width: 160px; border-radius: 0 6px 0 0;">Veiksmai</th></tr>';

    sorted.forEach(t => {
        let levelColor = "color: #3182ce;";
        if(t.level === 'A') levelColor = "color: #e53e3e;";
        else if(t.level === 'B-/B') levelColor = "color: #9f7aea;";
        else if(t.level === 'C/C+') levelColor = "color: #3182ce;";
        else if(t.level === 'D-C') levelColor = "color: #06b6d4;";
        else if(t.level === 'D') levelColor = "color: #48bb78;";

        html += `<tr style="border-bottom: 1px solid #e2e8f0; transition: 0.2s;" onmouseover="this.style.backgroundColor='#f8f9fb'" onmouseout="this.style.backgroundColor='transparent'">
            <td style="padding: 12px; font-weight: bold; color: var(--text-dark);">${t.date}</td>
            <td style="padding: 12px; color: var(--text-grey); font-weight: 600;">${t.time}</td>
            <td style="padding: 12px; font-weight: 800; color: var(--primary-blue);">${t.format}</td>
            <td style="padding: 12px;"><span style="background: #edf2f7; padding: 3px 6px; border-radius: 4px; font-weight:bold; font-size: 11px; ${levelColor}">${t.level}</span></td>
            <td style="padding: 12px; font-weight: bold; color: ${t.registered >= t.max ? 'var(--status-red)' : 'var(--status-green)'};">${t.registered}/${t.max}</td>
            <td style="padding: 12px; text-align: center;">
                <button type="button" onclick="openAdminTournamentModal('${t.id}')" style="background: #eff6ff; color: #1d4ed8; border: none; padding: 5px 8px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; margin-right: 4px;">✏️ Keisti</button>
                <button type="button" onclick="deleteAdminTournamentLive('${t.id}')" style="background: white; border: 1px solid #cbd5e0; color: var(--status-red); padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 11px;"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    });
    html += '</table>';
    list.innerHTML = html;
}

function openAdminTournamentModal(id) {
    let t = tournaments.find(x => String(x.id) === String(id));
    if(!t) return;
    document.getElementById('editAdminTournamentId').value = t.id;
    document.getElementById('editAdminTournamentFormat').value = t.format;
    document.getElementById('editAdminTournamentLevel').value = t.level;
    document.getElementById('editAdminTournamentMax').value = t.max || 16;
    document.getElementById('editAdminTournamentTime').value = t.time;
    document.getElementById('editAdminTournamentDate').value = t.date;
    document.getElementById('adminEditTournamentModal').classList.add('show');
}

function closeAdminTournamentModal() { 
    document.getElementById('adminEditTournamentModal').classList.remove('show'); 
}

function saveAdminTournamentChanges() {
    const id = document.getElementById('editAdminTournamentId').value;
    const format = document.getElementById('editAdminTournamentFormat').value;
    const level = document.getElementById('editAdminTournamentLevel').value;
    const max = parseInt(document.getElementById('editAdminTournamentMax').value) || 16;
    const time = document.getElementById('editAdminTournamentTime').value.trim();
    const date = document.getElementById('editAdminTournamentDate').value.trim();

    if(!time || !date) { alert("Data ir laikas privalomi!"); return; }

    const idx = tournaments.findIndex(t => String(t.id) === String(id));
    if(idx !== -1) {
        tournaments[idx].format = format;
        tournaments[idx].level = level;
        tournaments[idx].max = max;
        tournaments[idx].time = time;
        tournaments[idx].date = date;
        saveData(); 
        closeAdminTournamentModal();
        showToast("Turnyras sėkmingai atnaujintas!");
        renderAdminTournaments();
    }
}

function deleteAdminTournamentLive(id) {
    if(!confirm("Ar tikrai norite ištrinti šį turnyrą iš debesies? Visi užsiregistravę žaidėjai bus pašalinti.")) return;
    tournaments = tournaments.filter(t => String(t.id) !== String(id));
    saveData();
    showToast("Turnyras ištrintas iš debesies!");
    renderAdminTournaments();
}

function loadAdminPlayersDB() {
    const dbList = document.getElementById('admin-players-list-db');
    if (dbList) dbList.innerHTML = '<div style="text-align:center; padding:20px; color:#718096;"><i class="fa-solid fa-spinner fa-spin"></i> Kraunama...</div>';
    
    firebase.database().ref(GLOBAL_PLAYERS_KEY).once('value').then(snap => {
        let data = snap.val() || {};
        globalAdminPlayers = Object.values(data).sort((a,b) => (b.rating || 0) - (a.rating || 0));
        let countEl = document.getElementById('admin-players-count');
        if(countEl) countEl.innerText = `Viso: ${globalAdminPlayers.length}`;
        filterAdminPlayers();
    }).catch(err => {
        if(dbList) dbList.innerHTML = '<div style="color:red; text-align:center; padding: 20px;">Klaida kraunant duomenis.</div>';
    });
}

function renderAdminPlayersDB(playersArray) {
    const container = document.getElementById('admin-players-list-db');
    if(!container) return;

    if(playersArray.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#718096;">Žaidėjų nerasta.</div>';
        return;
    }

    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; min-width: 400px;">';
    html += '<tr style="background: #edf2f7; color: #718096; text-transform: uppercase; font-size: 10px; letter-spacing: 1px;"><th style="padding: 12px; border-top-left-radius: 6px;">Vardas</th><th style="text-align:center;">Lytis</th><th>Lygis</th><th>ELO Taškai</th><th style="padding: 12px; border-top-right-radius: 6px; text-align: center; width:140px;">Veiksmai</th></tr>';
    
    playersArray.forEach(p => {
        let ptsColor = 'var(--primary-blue)';
        if (p.tier === 'A') ptsColor = 'var(--lvl-a)';
        else if (p.tier === 'B-/B') ptsColor = 'var(--lvl-b)';
        else if (p.tier === 'C/C+') ptsColor = 'var(--lvl-c)';
        else if (p.tier === 'C-/C') ptsColor = 'var(--lvl-c2)';
        else if (p.tier === 'D/C-') ptsColor = 'var(--lvl-d-c)';
        else if (p.tier === 'D-C') ptsColor = 'var(--lvl-d-c)';
        else ptsColor = 'var(--lvl-d)';

        let genderBadge = p.gender === 'M' ? 
            '<span style="background: #eff6ff; color: #1d4ed8; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 900;">V</span>' : 
            '<span style="background: #fff5f5; color: #c53030; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 900;">M</span>';

        let av = p.photo ? `<img src="${p.photo}" style="width:26px; height:26px; border-radius:50%; object-fit:cover; vertical-align:middle; margin-right:8px; border:1px solid #cbd5e0;">` : `<div style="width:26px; height:26px; border-radius:50%; background:#e2e8f0; display:inline-block; vertical-align:middle; margin-right:8px; text-align:center; line-height:26px; font-size:10px; color:#718096; font-weight:bold;">${p.gender==='M'?'V':'M'}</div>`;

        html += `<tr style="border-bottom: 1px solid #e2e8f0; transition: 0.2s;" onmouseover="this.style.backgroundColor='#f8f9fb'" onmouseout="this.style.backgroundColor='transparent'">
            <td style="padding: 12px; font-weight: 800; color: var(--text-dark);">${av}${esc(p.name)} <br><span style="font-size:9px; color:#a0aec0; font-weight:normal;">ID: ${p.id}</span></td>
            <td style="padding: 12px; text-align:center;">${genderBadge}</td>
            <td style="padding: 12px;"><span style="background: #edf2f7; color: var(--text-dark); padding: 3px 6px; border-radius: 4px; font-weight:bold; font-size: 11px;">${p.tier || 'D'}</span></td>
            <td style="padding: 12px; color: ${ptsColor}; font-weight: 900; font-size: 15px;">${p.rating || 300}</td>
            <td style="padding: 12px; text-align: center;">
                <button type="button" onclick="openAdminEditModal('${p.id}')" style="background: white; border: 1px solid #cbd5e0; color: var(--status-orange); padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; margin-right: 5px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><i class="fa-solid fa-pen"></i></button>
                <button type="button" onclick="deleteAdminPlayer('${p.id}')" style="background: white; border: 1px solid #cbd5e0; color: var(--status-red); padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    });
    html += '</table>';
    container.innerHTML = html;
}

function filterAdminPlayers() {
    let query = document.getElementById('adminPlayerSearch')?.value.toLowerCase().trim() || '';
    let gender = document.getElementById('adminFilterGender')?.value || 'all';
    let tier = document.getElementById('adminFilterTier')?.value || 'all';

    let filtered = globalAdminPlayers.filter(p => {
        let nameMatch = (p.name || "").toLowerCase().includes(query) || String(p.id || "").toLowerCase().includes(query);
        let genderMatch = (gender === "all") || (p.gender === gender);
        let tierMatch = (tier === "all") || (p.tier === tier);
        return nameMatch && genderMatch && tierMatch;
    });
    renderAdminPlayersDB(filtered);
}

function handleAdminPlayerPhotoUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => {
        const img = new Image();
        img.onload = function() {
            const c = document.createElement('canvas'); const MAX = 256; let w = img.width, h = img.height;
            if(w > h) { if(w > MAX){ h *= MAX/w; w = MAX; } } else { if(h > MAX){ w *= MAX/h; h = MAX; } }
            c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
            tempAdminPlayerPhotoBase64 = c.toDataURL('image/jpeg', 0.82);
            const pr = document.getElementById('editAdminPlayerPhotoPreview');
            if(pr) { pr.src = tempAdminPlayerPhotoBase64; pr.style.display = 'block'; }
            let placeholder = document.getElementById('editAdminPlayerPhotoPlaceholder');
            if(placeholder) placeholder.style.display = 'none';
        };
        img.src = ev.target.result;
    };
    r.readAsDataURL(file);
}

function openAdminEditModal(id) {
    let p = globalAdminPlayers.find(x => String(x.id) === String(id));
    if(!p) return;
    document.getElementById('editAdminPlayerId').value = p.id;
    document.getElementById('editAdminPlayerName').value = p.name;
    document.getElementById('editAdminPlayerGender').value = p.gender;
    document.getElementById('editAdminPlayerRating').value = p.rating || 300;
    document.getElementById('editAdminPlayerPhone').value = p.phone || p.id;
    
    tempAdminPlayerPhotoBase64 = p.photo || null;
    const pr = document.getElementById('editAdminPlayerPhotoPreview');
    const ph = document.getElementById('editAdminPlayerPhotoPlaceholder');
    if(tempAdminPlayerPhotoBase64 && tempAdminPlayerPhotoBase64 !== "null" && tempAdminPlayerPhotoBase64 !== "") {
        if(pr) { pr.src = tempAdminPlayerPhotoBase64; pr.style.display = 'block'; }
        if(ph) ph.style.display = 'none';
    } else {
        if(pr) { pr.src = ''; pr.style.display = 'none'; }
        if(ph) ph.style.display = 'block';
    }
    document.getElementById('editAdminPlayerPhotoInput').value = '';
    document.getElementById('adminEditPlayerModal').classList.add('show');
}

function closeAdminEditModal() { 
    document.getElementById('adminEditPlayerModal').classList.remove('show'); 
}

function saveAdminPlayerChanges() {
    const originalId = document.getElementById('editAdminPlayerId').value;
    const newId = document.getElementById('editAdminPlayerPhone').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const name = document.getElementById('editAdminPlayerName').value.trim();
    const gender = document.getElementById('editAdminPlayerGender').value;
    const rating = parseInt(document.getElementById('editAdminPlayerRating').value) || 300;

    if (!name) { alert("Vardas ir Pavardė privalo būti užpildyti!"); return; }
    if (!newId) { alert("Telefono numeris negali būti tuščias!"); return; }

    let tier = "D";
    if (rating >= 851) tier = "A";
    else if (rating >= 701) tier = "B-/B";
    else if (rating >= 551) tier = "C/C+";
    else if (rating >= 451) tier = "C-/C";
    else if (rating >= 351) tier = "D/C-";

    let updateData = { id: newId, phone: newId, name: name, gender: gender, rating: rating, tier: tier, photo: tempAdminPlayerPhotoBase64 };

    if (String(originalId) !== String(newId)) {
        firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + newId).set(updateData).then(() => {
            firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + originalId).remove().then(() => {
                closeAdminEditModal();
                showToast("ID pakeistas ir duomenys išsaugoti!");
                loadAdminPlayersDB();
            });
        }).catch(err => { alert("Klaida keičiant unikalų ID."); });
    } else {
        firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + originalId).update(updateData).then(() => {
            closeAdminEditModal();
            showToast("Profilio keitimai sėkmingai išsaugoti!");
            loadAdminPlayersDB();
        }).catch(err => { alert("Klaida išsaugant."); });
    }
}

function deleteAdminPlayer(id) {
    let p = globalAdminPlayers.find(x => String(x.id) === String(id));
    if(!p) return;
    if(confirm(`Ar tikrai norite visam laikui IŠTRINTI žaidėją "${p.name}" iš sistemos?`)) {
        firebase.database().ref(GLOBAL_PLAYERS_KEY).child(p.id).remove().then(() => {
            showToast("Žaidėjas sėkmingai pašalintas!");
            loadAdminPlayersDB();
        }).catch(err => { alert("Klaida trintant žaidėją."); });
    }
}

// ==========================================
// PROGRAMOS PALEIDIMAS
// ==========================================

window.onload = () => { 
    initDates(); 
    initTournamentsDB(); 
    updateAuthUI(); 
    if (typeof refreshCurrentUserFromFirebase === 'function') refreshCurrentUserFromFirebase();

    // QR srautas: registras?room=KAMBARYS — iškart atidarome prisijungimą prie kambario
    const qrRoom = new URLSearchParams(window.location.search).get('room');
    if (qrRoom) {
        window.history.replaceState({}, document.title, window.location.pathname);
        const profileBtn = document.querySelector('.nav-item[onclick*="page-profile"]');
        switchTab('page-profile', profileBtn);
        setTimeout(() => {
            if (currentUser) {
                openRoomJoinModal(qrRoom.toUpperCase());
            } else {
                showToast("Prisijunkite, kad galėtumėte jungtis prie kambario " + qrRoom.toUpperCase());
                openAuthModal();
            }
        }, 600);
    }
};
