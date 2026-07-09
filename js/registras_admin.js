// ==========================================
// 6. ADMINISTRATORIAUS VALDYMO PLATFORMA (klubų paskyros)
// ==========================================
// Kiekvienas klubas turi SAVO paskyrą: admin prisijungia patvirtinta el. pašto nuoroda
// ir mato tik SAVO klubo turnyrus. DB: padelio_clubs/{clubId} (klubas + jo adminai),
// padelio_club_admins/{emailKey} → { clubId } (greita paieška pagal el. paštą).
// Pirmasis sukurtas klubas gauna legacyOwner=true ir perima senus turnyrus (be clubId).
// Senas PIN kodas veikia TIK kol sistemoje nesukurtas nė vienas klubas (migracijai).

let currentClub = null; // { id, name, legacyOwner, ownerEmail, myEmail }

function promptAdmin() {
    if (!isAppMode) { toggleMode(); return; }
    // Jau prisijungęs prie klubo šioje sesijoje — tiesiai į panelę
    if (currentClub) { toggleMode(); updateAdminHeader(); return; }
    // Aktyvi Firebase Auth sesija (prisijungta anksčiau) — bandome rasti klubą be naujo laiško
    const authUser = (typeof authAvailable === 'function' && authAvailable()) ? firebase.auth().currentUser : null;
    if (authUser && authUser.email) { adminEmailSignedIn(authUser.email); return; }
    openAdminAuthModal();
}

function openAdminAuthModal() {
    modalTitle.innerHTML = '<i class="fa-solid fa-building-lock" style="color: var(--primary-blue);"></i> Klubo administratorius';
    modalBody.innerHTML = `
        <div style="font-size: 12px; color: var(--text-grey); margin-bottom: 12px;">Prisijungimas patvirtinama el. pašto nuoroda. Jei klubo dar neturite — susikursite po patvirtinimo.</div>
        <input type="email" id="adminEmailInput" placeholder="klubo@pastas.lt" autocomplete="email" style="width: 100%; padding: 13px; border: 1px solid #cbd5e0; border-radius: 8px; outline: none; font-weight: bold; font-size: 15px; box-sizing: border-box;">`;
    modalActions.innerHTML = `
        <button type="button" class="modal-btn primary" onclick="adminSendLink()" style="width:100%; margin-bottom:8px;"><i class="fa-solid fa-paper-plane"></i> Gauti prisijungimo nuorodą</button>
        <button type="button" class="modal-btn secondary" onclick="closeModal()" style="width:100%;">Atšaukti</button>`;
    modal.classList.add('show');
    setTimeout(() => document.getElementById('adminEmailInput')?.focus(), 150);
}

function adminSendLink() {
    const email = (document.getElementById('adminEmailInput')?.value || '').trim();
    if (!validEmail(email)) { showToast("Įveskite teisingą el. pašto adresą."); return; }
    showToast("⏳ Siunčiama nuoroda...");
    sendLoginLink(email, 'admin').then(() => {
        closeModal();
        alert("📧 Prisijungimo nuoroda išsiųsta į\n" + email + "\n\nAtidarykite laišką ŠIAME įrenginyje ir paspauskite nuorodą. Jei nematote — patikrinkite šlamšto aplanką.");
    }).catch(explainAuthError);
}

// Grįžus su patvirtinta admin nuoroda (arba esant aktyviai sesijai)
function adminEmailSignedIn(email) {
    const ek = emailKey(email);
    firebase.database().ref('padelio_club_admins/' + ek).once('value').then(snap => {
        const rec = snap.val();
        if (rec && rec.clubId) {
            firebase.database().ref('padelio_clubs/' + rec.clubId).once('value').then(cs => {
                const club = cs.val();
                if (club) enterClubAdmin(rec.clubId, club, email);
                else openCreateClubModal(email);
            });
        } else {
            openCreateClubModal(email);
        }
    });
}

function openCreateClubModal(email) {
    modalTitle.innerHTML = '<i class="fa-solid fa-building-circle-check" style="color: var(--status-green);"></i> Naujas klubas';
    modalBody.innerHTML = `
        <div style="font-size: 12px; color: var(--text-grey); margin-bottom: 12px;"><strong>${esc(email)}</strong> patvirtintas, bet dar nepriskirtas jokiam klubui.<br><br>Sukurkite savo klubo paskyrą — matysite ir valdysite tik savo klubo turnyrus.</div>
        <input type="text" id="newClubName" placeholder="Klubo pavadinimas (pvz. Kauno Padel)" style="width: 100%; padding: 13px; border: 1px solid #cbd5e0; border-radius: 8px; outline: none; font-weight: bold; box-sizing: border-box;">`;
    modalActions.innerHTML = `
        <button type="button" class="modal-btn primary" onclick="createClub('${esc(email)}')" style="width:100%; margin-bottom:8px;">Sukurti klubą</button>
        <button type="button" class="modal-btn secondary" onclick="closeModal()" style="width:100%;">Atšaukti</button>`;
    modal.classList.add('show');
    setTimeout(() => document.getElementById('newClubName')?.focus(), 150);
}

function createClub(email) {
    const name = (document.getElementById('newClubName')?.value || '').trim();
    if (name.length < 3) { showToast("Įveskite klubo pavadinimą (bent 3 simboliai)."); return; }
    const ek = emailKey(email);
    firebase.database().ref('padelio_clubs').once('value').then(s => {
        const isFirst = !s.exists(); // pirmasis klubas perima senus (be clubId) turnyrus
        const clubId = 'club_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const club = {
            name: name, createdAt: Date.now(), ownerEmail: String(email).toLowerCase(),
            legacyOwner: isFirst,
            admins: {}
        };
        club.admins[ek] = { email: String(email).toLowerCase(), addedAt: Date.now(), role: 'owner' };
        firebase.database().ref('padelio_clubs/' + clubId).set(club).then(() => {
            firebase.database().ref('padelio_club_admins/' + ek).set({ clubId: clubId, email: String(email).toLowerCase() });
            closeModal();
            enterClubAdmin(clubId, club, email);
            if (isFirst) showToast("✅ Klubas sukurtas! Jam priskirti ir visi ankstesni turnyrai.");
        });
    });
}

function enterClubAdmin(clubId, club, email) {
    currentClub = { id: clubId, name: club.name, legacyOwner: !!club.legacyOwner, ownerEmail: club.ownerEmail || '', myEmail: String(email).toLowerCase() };
    closeModal();
    if (isAppMode) toggleMode();
    updateAdminHeader();
    renderAdminTournaments();
    showToast('✅ ' + club.name + ' — administratorius');
}

function adminLogout() {
    currentClub = null;
    if (typeof authAvailable === 'function' && authAvailable()) { try { firebase.auth().signOut(); } catch (e) {} }
    if (!isAppMode) toggleMode();
    showToast("Atsijungta nuo klubo paskyros.");
}

// Klubo juosta admin panelės viršuje: pavadinimas + adminų kvietimas + atsijungimas
function updateAdminHeader() {
    const sidebar = document.querySelector('.admin-sidebar .logo');
    if (!sidebar) return;
    document.getElementById('admin-club-bar')?.remove();
    if (!currentClub) return;
    const bar = document.createElement('div');
    bar.id = 'admin-club-bar';
    bar.style.cssText = 'padding: 10px 20px; background: #1a202c; border-top: 1px solid #2d3748; border-bottom: 1px solid #2d3748;';
    bar.innerHTML = `
        <div style="font-size: 10px; color: #a0aec0; text-transform: uppercase; letter-spacing: 1px;">Klubas</div>
        <div style="font-size: 15px; font-weight: 900; color: #48bb78; margin: 2px 0 8px;">${esc(currentClub.name)}${currentClub.legacyOwner ? ' <i class="fa-solid fa-crown" style="font-size:10px;color:#d69e2e;" title="Pagrindinis klubas"></i>' : ''}</div>
        <button type="button" onclick="openInviteAdminModal()" style="width:100%; background:#2d3748; color:#e2e8f0; border:none; padding:7px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; margin-bottom:5px;"><i class="fa-solid fa-user-plus"></i> Pakviesti administratorių</button>
        <button type="button" onclick="adminLogout()" style="width:100%; background:none; color:#fc8181; border:1px solid #742a2a; padding:7px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;"><i class="fa-solid fa-right-from-bracket"></i> Atsijungti</button>`;
    sidebar.insertAdjacentElement('afterend', bar);
}

// Kito administratoriaus pakvietimas į SAVO klubą (pagal el. paštą)
function openInviteAdminModal() {
    if (!currentClub) return;
    openInputModal(
        '<i class="fa-solid fa-user-plus" style="color: var(--primary-blue);"></i> Pakviesti administratorių',
        'kolegos@pastas.lt',
        'Pridėti prie klubo',
        (email) => {
            email = String(email || '').trim().toLowerCase();
            if (!validEmail(email)) { showToast("Neteisingas el. pašto adresas."); return; }
            const ek = emailKey(email);
            firebase.database().ref('padelio_club_admins/' + ek).once('value').then(snap => {
                const rec = snap.val();
                if (rec && rec.clubId && rec.clubId !== currentClub.id) { showToast("Šis el. paštas jau priklauso kitam klubui."); return; }
                firebase.database().ref('padelio_club_admins/' + ek).set({ clubId: currentClub.id, email: email });
                firebase.database().ref('padelio_clubs/' + currentClub.id + '/admins/' + ek).set({ email: email, addedAt: Date.now(), role: 'admin' });
                showToast("✅ " + email + " pridėtas. Jis prisijungs per „Admin\" su savo el. paštu.");
            });
        },
        'email'
    );
}

// PASTABA: senasis prisijungimas kodu (PIN „7030") PAŠALINTAS — į admin panelę patenkama
// tik patvirtinta el. pašto nuoroda ir tik prie savo klubo paskyros.

// Ar šis admin gali valdyti turnyrą: savo klubo + (legacyOwner atveju) senus be klubo
function canManageTournament(t) {
    if (!currentClub) return false;
    if (t && t.clubId) return t.clubId === currentClub.id;
    return !!currentClub.legacyOwner;
}

// Pažymi rezultatų kambarį kaip priklausantį MŪSŲ klubui (jei jis dar be savininko).
// Nuo šio įrašo generatorius leidžia kambarį redaguoti tik klubo administratoriams.
// official=true — kambaryje bus skaičiuojamas LYGOS ELO (generatorius žymę perskaito prisijungdamas).
function claimRoomForClub(roomId, official) {
    if (!currentClub || !roomId) return Promise.resolve(false);
    const ref = firebase.database().ref(DB_KEY + '/' + String(roomId).toUpperCase() + '/owner');
    return ref.once('value').then(snap => {
        const owner = snap.val();
        if (!owner) {
            return ref.set({ type: 'club', clubId: currentClub.id, clubName: currentClub.name, official: official === true, createdAt: Date.now() }).then(() => true);
        }
        if (typeof owner === 'object' && owner.type === 'club' && owner.clubId === currentClub.id) {
            // Savo klubo kambarys — atnaujiname Official žymę (jei ji keitėsi redaguojant turnyrą)
            if (typeof official === 'boolean' && owner.official !== official) {
                return ref.child('official').set(official).then(() => true);
            }
            return true;
        }
        return false; // kambarys jau priklauso kitam klubui
    }).catch(() => false);
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

// Atomiškai rezervuoja unikalius kambarių ID iš monotoninio skaitiklio.
// Skaitiklis TIK auga — net ištrynus kambarį, jo numeris niekada neatlaisvinamas → jokių dublių.
async function reserveRoomIds(count) {
    const ids = [];
    try {
        const seqRef = firebase.database().ref('padelio_room_seq');
        let guard = 0;
        while (ids.length < count && guard < 100) {
            guard++;
            const res = await seqRef.transaction(cur => (cur || 0) + 1);
            if (!res.committed) continue;
            const n = res.snapshot.val();
            // Saugumo tinklas: jei toks numeris jau egzistuoja (pvz. rankinis kambarys) — praleidžiam, skaitiklis jau pažengė.
            const snap = await firebase.database().ref(DB_KEY + '/' + n).once('value');
            if (snap.exists()) continue;
            ids.push(n);
        }
    } catch (err) {
        console.error('reserveRoomIds klaida (naudojami atsarginiai ID):', err);
    }
    // Atsarginis kelias: jei skaitiklis neprieinamas — unikalūs ID iš laiko žymos.
    // Turnyro kūrimas NIEKADA neužstringa dėl kambario numerio.
    if (ids.length < count) {
        const base = Number(String(Date.now()).slice(-8));
        while (ids.length < count) ids.push(base + ids.length);
    }
    return ids;
}

// Atidaro generatorių su jau prijungtu kambariu (generatorius pats palaiko ?room=).
function openGeneratorRoom(room) {
    if (!room) { showToast("Šis turnyras neturi kambario ID."); return; }
    window.open('index.html?room=' + encodeURIComponent(room), '_blank');
}

async function createTournament(e) {
    e.preventDefault();
    const submitBtn = e.target ? e.target.querySelector('button[type="submit"]') : null;
    const btnHTML = submitBtn ? submitBtn.innerHTML : '';
    try {
        const baseDateStr = document.getElementById('newDate').value;
        const laikas = document.getElementById('newTime').value;
        const repeatCount = parseInt(document.getElementById('newRepeat').value || 1);

        if (!currentClub) { showToast("Prisijunkite prie klubo paskyros — turnyrai kuriami klubo vardu."); return; }
        if (!baseDateStr) { showToast("Pasirinkite datą."); return; }
        if (!parseTimeStr(laikas)) { showToast("Neteisingas laiko formatas. Pvz.: 18:00 - 20:00"); return; }

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

        if (typeof firebase === 'undefined') { showToast("Firebase neprieinamas — bandykite vėliau."); return; }

        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kuriama...'; }

        // Automatiškai priskiriam unikalius kambarių ID (po vieną kiekvienai kartojamai kopijai)
        const roomIds = await reserveRoomIds(repeatCount);

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
                // max = 0 reiškia NERIBOTĄ dalyvių skaičių (apkarpoma tik uždarant registraciją)
                max: document.getElementById('newUnlimited')?.checked ? 0 : parseInt(document.getElementById('newMax').value),
                // Registracijos uždarymas prieš startą (min.) — vykdo serveris (Cloud Functions)
                regCloseMins: parseInt(document.getElementById('newRegClose')?.value || 60),
                isDemoWaitlist: false, waitlistCount: 0, timeState: 'future', players: [], room: String(roomIds[i])
            };
            // Turnyras priklauso jį sukūrusiam klubui — kiti klubai jo nevaldys
            if (currentClub) { newT.clubId = currentClub.id; newT.clubName = currentClub.name; }
            // E-Teisėjavimas: dalyviai patys veda taškus portalo LIVE lange
            newT.eReferee = !!document.getElementById('newEReferee')?.checked;
            // Oficialus turnyras: kambaryje skaičiuojamas lygos ELO (žymę perskaito generatorius)
            newT.isOfficial = !!document.getElementById('newIsOfficial')?.checked;
            // Kambarys iškart pažymimas klubo nuosavybe — generatoriuje jį redaguos tik klubo adminai
            claimRoomForClub(roomIds[i], newT.isOfficial);
            tournaments.push(newT);
        }
        const ok = await Promise.resolve(saveData());
        if (ok === false) return; // saveData jau parodė klaidos pranešimą
        showToast(`✅ Turnyrai sukurti! Kambariai: ${roomIds.join(', ')}`);
        document.getElementById('adminForm').reset();
    } catch (err) {
        console.error('createTournament klaida:', err);
        showToast('❌ Nepavyko sukurti turnyro: ' + (err && err.message ? err.message : err));
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = btnHTML; }
    }
}

function renderAdminTournaments() {
    const list = document.getElementById('admin-tournaments-list-db');
    if(!list) return;
    // KLUBŲ IZOLIACIJA: rodomi tik savo klubo turnyrai (legacyOwner — ir seni be klubo žymos).
    if (!currentClub) {
        list.innerHTML = '<div style="color: #718096; font-size: 13px; text-align:center; padding: 20px;">Prisijunkite prie klubo paskyros el. paštu.</div>';
        return;
    }
    let visible = tournaments.filter(t => canManageTournament(t));
    if(visible.length === 0) {
        list.innerHTML = '<div style="color: #718096; font-size: 13px; text-align:center; padding: 20px;">Jūsų klubas dar neturi turnyrų — sukurkite pirmąjį!</div>';
        return;
    }

    let sorted = [...visible].sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; min-width: 500px;">';
    html += '<tr style="background: #edf2f7; color: #718096; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;"><th style="padding: 12px; border-radius: 6px 0 0 0;">Diena</th><th>Laikas</th><th>Formatas</th><th>Lygis</th><th>Dalyviai</th><th style="padding: 12px; text-align: center; width: 160px; border-radius: 0 6px 0 0;">Veiksmai</th></tr>';

    sorted.forEach(t => {
        let levelColor = "color: #3182ce;";
        if(t.level === 'A') levelColor = "color: #e53e3e;";
        else if(t.level === 'B-/B') levelColor = "color: #9f7aea;";
        else if(t.level === 'C/C+') levelColor = "color: #3182ce;";
        else if(t.level === 'C-/C') levelColor = "color: #0ea5e9;";
        else if(t.level === 'D/C-' || t.level === 'D-C') levelColor = "color: #06b6d4;";
        else if(t.level === 'D') levelColor = "color: #48bb78;";

        const safeRoom = String(t.room || '').replace(/['"\\<>&]/g, '');
        html += `<tr style="border-bottom: 1px solid #e2e8f0; transition: 0.2s;" onmouseover="this.style.backgroundColor='#f8f9fb'" onmouseout="this.style.backgroundColor='transparent'">
            <td style="padding: 12px; font-weight: bold; color: var(--text-dark);">${esc(t.date)}</td>
            <td style="padding: 12px; color: var(--text-grey); font-weight: 600;">${esc(t.time)}</td>
            <td style="padding: 12px; font-weight: 800; color: var(--primary-blue);">${esc(t.format)}</td>
            <td style="padding: 12px;"><span style="background: #edf2f7; padding: 3px 6px; border-radius: 4px; font-weight:bold; font-size: 11px; ${levelColor}">${esc(t.level)}</span></td>
            <td style="padding: 12px; font-weight: bold; color: ${t.registered >= t.max ? 'var(--status-red)' : 'var(--status-green)'};">${t.registered}/${t.max}</td>
            <td style="padding: 12px; text-align: center; white-space:nowrap;">
                ${t.room ? `<button type="button" onclick="openGeneratorRoom('${safeRoom}')" title="Atidaryti generatorių (kambarys ${safeRoom})" style="background:#ecfdf5; color:#047857; border:none; padding: 5px 8px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; margin-right: 4px;">▶ ${esc(t.room)}</button>` : ''}
                <button type="button" onclick="openAdminTournamentModal('${esc(String(t.id))}')" style="background: #eff6ff; color: #1d4ed8; border: none; padding: 5px 8px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; margin-right: 4px;">✏️ Keisti</button>
                <button type="button" onclick="deleteAdminTournamentLive('${esc(String(t.id))}')" style="background: white; border: 1px solid #cbd5e0; color: var(--status-red); padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 11px;"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    });
    html += '</table>';
    list.innerHTML = html;
}

function openAdminTournamentModal(id) {
    let t = tournaments.find(x => String(x.id) === String(id));
    if(!t) return;
    if (currentClub && !canManageTournament(t)) { showToast("🔒 Šis turnyras priklauso kitam klubui."); return; }
    document.getElementById('editAdminTournamentId').value = t.id;
    const erefBox = document.getElementById('editAdminTournamentERef');
    if (erefBox) erefBox.checked = !!t.eReferee;
    const offBox = document.getElementById('editAdminTournamentOfficial');
    if (offBox) offBox.checked = !!t.isOfficial;
    const unlBox = document.getElementById('editAdminTournamentUnlimited');
    const maxInp = document.getElementById('editAdminTournamentMax');
    if (unlBox) { unlBox.checked = !(t.max > 0); if (maxInp) maxInp.disabled = unlBox.checked; }
    const rcSel = document.getElementById('editAdminTournamentRegClose');
    if (rcSel) rcSel.value = String(t.regCloseMins || 60);
    document.getElementById('editAdminTournamentFormat').value = t.format;
    document.getElementById('editAdminTournamentLevel').value = t.level;
    document.getElementById('editAdminTournamentMax').value = t.max || 16;
    document.getElementById('editAdminTournamentTime').value = t.time;
    document.getElementById('editAdminTournamentDate').value = t.date;
    document.getElementById('editAdminTournamentRoom').value = t.room || '';
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
        tournaments[idx].max = document.getElementById('editAdminTournamentUnlimited')?.checked ? 0 : max;
        tournaments[idx].regCloseMins = parseInt(document.getElementById('editAdminTournamentRegClose')?.value || 60);
        tournaments[idx].time = time;
        tournaments[idx].date = date;
        tournaments[idx].room = (document.getElementById('editAdminTournamentRoom').value || '').trim().toUpperCase() || null;
        tournaments[idx].eReferee = !!document.getElementById('editAdminTournamentERef')?.checked;
        tournaments[idx].isOfficial = !!document.getElementById('editAdminTournamentOfficial')?.checked;
        if (tournaments[idx].room) claimRoomForClub(tournaments[idx].room, tournaments[idx].isOfficial); // kambarys pažymimas klubo nuosavybe + Official žyme
        saveData();
        closeAdminTournamentModal();
        showToast("Turnyras sėkmingai atnaujintas!");
        renderAdminTournaments();
    }
}

function deleteAdminTournamentLive(id) {
    const target = tournaments.find(t => String(t.id) === String(id));
    if (target && currentClub && !canManageTournament(target)) { showToast("🔒 Šis turnyras priklauso kitam klubui."); return; }
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

        let av = p.photo ? `<img src="${esc(p.photo)}" style="width:26px; height:26px; border-radius:50%; object-fit:cover; vertical-align:middle; margin-right:8px; border:1px solid #cbd5e0;">` : `<div style="width:26px; height:26px; border-radius:50%; background:#e2e8f0; display:inline-block; vertical-align:middle; margin-right:8px; text-align:center; line-height:26px; font-size:10px; color:#718096; font-weight:bold;">${p.gender==='M'?'V':'M'}</div>`;

        const safeId = esc(String(p.id));
        html += `<tr style="border-bottom: 1px solid #e2e8f0; transition: 0.2s;" onmouseover="this.style.backgroundColor='#f8f9fb'" onmouseout="this.style.backgroundColor='transparent'">
            <td style="padding: 12px; font-weight: 800; color: var(--text-dark);">${av}${esc(p.name)} <br><span style="font-size:9px; color:#a0aec0; font-weight:normal;">ID: ${safeId}</span></td>
            <td style="padding: 12px; text-align:center;">${genderBadge}</td>
            <td style="padding: 12px;"><span style="background: #edf2f7; color: var(--text-dark); padding: 3px 6px; border-radius: 4px; font-weight:bold; font-size: 11px;">${esc(p.tier || 'D')}</span></td>
            <td style="padding: 12px; color: ${ptsColor}; font-weight: 900; font-size: 15px;">${p.rating || 300}</td>
            <td style="padding: 12px; text-align: center;">
                <button type="button" onclick="openAdminEditModal('${safeId}')" style="background: white; border: 1px solid #cbd5e0; color: var(--status-orange); padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; margin-right: 5px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><i class="fa-solid fa-pen"></i></button>
                <button type="button" onclick="deleteAdminPlayer('${safeId}')" style="background: white; border: 1px solid #cbd5e0; color: var(--status-red); padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><i class="fa-solid fa-trash"></i></button>
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
        // SVARBU: perkeliam VISĄ seną įrašą (statistiką ir kt.), tik ant viršaus uždedam pakeitimus
        firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + originalId).once('value').then(oldSnap => {
            const merged = Object.assign({}, oldSnap.val() || {}, updateData);
            return firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + newId).set(merged);
        }).then(() => {
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
    if (typeof notifInit === 'function') notifInit(); 
    if (typeof pushInit === 'function') pushInit(); 
    if (typeof notifCheckReminders === 'function') setTimeout(notifCheckReminders, 1500); 
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
