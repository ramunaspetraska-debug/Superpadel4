// ==========================================
// 4. PASAULINIAI REITINGAI (TIER LEAGUES)
// ==========================================

function changeLeague(league) {
    document.querySelectorAll('.league-tab').forEach(el => el.classList.remove('active'));
    const activeTab = document.querySelector(`.league-tab[data-league="${league}"]`);
    if (activeTab) activeTab.classList.add('active');
    loadAutomatedRatings(league);
}

function loadAutomatedRatings(leagueLevel = 'all') {
    let rContent = document.getElementById('ratingsContent');
    let rLoader = document.getElementById('ratingsLoader');
    if(rContent) rContent.style.display = 'none';
    if(rLoader) rLoader.style.display = 'block';

    const spinner = document.getElementById('loaderSpinner');
    if (spinner) {
        if (leagueLevel === 'all') spinner.style.color = 'var(--primary-blue)';
        else if (leagueLevel === 'D') spinner.style.color = 'var(--lvl-d)';
        else if (leagueLevel === 'D-C') spinner.style.color = 'var(--lvl-d-c)';
        else if (leagueLevel === 'C/C+') spinner.style.color = 'var(--lvl-c)';
        else if (leagueLevel === 'B-/B') spinner.style.color = 'var(--lvl-b)';
        else if (leagueLevel === 'A') spinner.style.color = 'var(--lvl-a)';
    }

    firebase.database().ref(GLOBAL_PLAYERS_KEY).once('value').then(snap => {
        let allPlayers = Object.values(snap.val() || {});
        let dataPool = [];

        if (leagueLevel === 'all') { dataPool = allPlayers; } 
        else { dataPool = allPlayers.filter(p => p.tier === leagueLevel); }

        dataPool.sort((a,b) => (b.rating || 0) - (a.rating || 0));
        let mappedPool = dataPool.map(p => ({ name: p.name, points: p.rating || 0 }));

        let p1 = document.getElementById('pod1-name'), p1p = document.getElementById('pod1-pts');
        let p2 = document.getElementById('pod2-name'), p2p = document.getElementById('pod2-pts');
        let p3 = document.getElementById('pod3-name'), p3p = document.getElementById('pod3-pts');

        if(mappedPool.length >= 3) {
            if(p1) p1.innerText = mappedPool[0].name; if(p1p) p1p.innerText = mappedPool[0].points + " pts";
            if(p2) p2.innerText = mappedPool[1].name; if(p2p) p2p.innerText = mappedPool[1].points + " pts";
            if(p3) p3.innerText = mappedPool[2].name; if(p3p) p3p.innerText = mappedPool[2].points + " pts";
        } else {
            if(p1) p1.innerText = mappedPool[0]?.name || "-"; if(p1p) p1p.innerText = mappedPool[0] ? mappedPool[0].points + " pts" : "-";
            if(p2) p2.innerText = mappedPool[1]?.name || "-"; if(p2p) p2p.innerText = mappedPool[1] ? mappedPool[1].points + " pts" : "-";
            if(p3) p3.innerText = "-"; if(p3p) p3p.innerText = "-";
        }

        const tbody = document.getElementById('ratingsTableBody'); 
        if(tbody) {
            tbody.innerHTML = '';
            mappedPool.forEach((player, index) => {
                let rankNum = index + 1;
                let rankClass = index === 0 ? 'color: #d69e2e; font-size: 18px; font-weight: 900;' : index === 1 ? 'color: #a0aec0; font-weight: 800;' : index === 2 ? 'color: #dd6b20; font-weight: 800;' : 'color: var(--text-grey);';
                let ptsColor = 'var(--primary-blue)';
                tbody.innerHTML += `<tr><td style="text-align: center; ${rankClass}">${rankNum}</td><td>${esc(player.name)}</td><td style="color: ${ptsColor}; font-weight: bold; text-align: right;">${player.points}</td></tr>`;
            });
        }

        if(rLoader) rLoader.style.display = 'none'; 
        if(rContent) rContent.style.display = 'block';
    }).catch(err => { console.error(err); });
}

// ==========================================
// 5. IŠMANIOJI KAMERA IR DI HIGHLIGHTS
// ==========================================

let cameraStream = null; let isRecording = false; let timerIntervalCam = null; let secondsRecord = 0;        
async function startCamera() { try { const videoElement = document.getElementById('cameraFeed'); if (!videoElement || cameraStream) return; if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert("Kameros klaida."); return; } const constraints = { video: { facingMode: 'environment', width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 30, max: 30 } } }; const stream = await navigator.mediaDevices.getUserMedia(constraints); videoElement.srcObject = stream; cameraStream = stream; } catch (err) { } }
function stopCamera() { if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; let vFeed = document.getElementById('cameraFeed'); if(vFeed) vFeed.srcObject = null; } }
function toggleRecording() { const btn = document.getElementById('recordBtn'); const indicator = document.getElementById('recIndicator'); const infoText = document.getElementById('camInfoText'); const aiPanel = document.getElementById('aiPanel'); if (!isRecording) { isRecording = true; if(btn) btn.classList.add('recording'); if(indicator) indicator.style.display = 'flex'; if(aiPanel) aiPanel.style.display = 'none'; if(infoText) infoText.innerHTML = "Filmuojama... Vaizdas įrašomas."; secondsRecord = 0; timerIntervalCam = setInterval(() => { secondsRecord++; let m = Math.floor(secondsRecord / 60).toString().padStart(2, '0'); let s = (secondsRecord % 60).toString().padStart(2, '0'); let recTimer = document.getElementById('recTimer'); if(recTimer) recTimer.innerText = `00:${m}:${s}`; }, 1000); } else { isRecording = false; if(btn) btn.classList.remove('recording'); if(indicator) indicator.style.display = 'none'; clearInterval(timerIntervalCam); if(btn) btn.style.display = 'none'; if(infoText) infoText.style.display = 'none'; if(aiPanel) aiPanel.style.display = 'block'; setTimeout(() => { let recTimer = document.getElementById('recTimer'); if(recTimer) recTimer.innerText = `00:00:00`; }, 1000); } }

// 🌟 SVEIKAS IR SUTVARKYTAS SKLIAUSTŲ VARIKLIS (iProg -> aiProg klaida ištaisyta)
function startAiProcessing() { 
    let sBtn = document.getElementById('startAiBtn'); 
    if(sBtn) sBtn.style.display = 'none'; 
    let aiProg = document.getElementById('aiProgress'); 
    if(aiProg) aiProg.style.display = 'block'; 
    let aiStat = document.getElementById('aiStatusText'); 
    if(aiStat) aiStat.style.display = 'block'; 
    let fill = document.getElementById('aiFill'); 
    let width = 0; 
    let interval = setInterval(() => { 
        width += Math.random() * 15; 
        if(width >= 100) width = 100; 
        if(fill) fill.style.width = width + '%'; 
        if(aiStat) { 
            if(width < 40) aiStat.innerText = `Analizuojama... (${Math.floor(width)}%)`; 
            else if(width < 80) aiStat.innerText = `Karpomas vaizdas... (${Math.floor(width)}%)`; 
            else aiStat.innerText = `Baigiama... (${Math.floor(width)}%)`; 
        } 
        if(width >= 100) { 
            clearInterval(interval); 
            if(aiProg) aiProg.style.display = 'none'; 
            if(aiStat) aiStat.style.display = 'none'; 
            let gVid = document.getElementById('generatedVideo'); 
            if(gVid) gVid.style.display = 'block'; 
            showToast("Highlights sugeneruoti!"); 
        } 
    }, 500); 
}
function uploadToYT() { showToast("Įkeliama fone... Netrukus atsiras SuperPadel TV skiltyje!"); setTimeout(() => { let gVid = document.getElementById('generatedVideo'); if(gVid) gVid.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--status-green);"><i class="fa-solid fa-check-circle" style="font-size: 30px; margin-bottom: 10px;"></i><br>Sėkmingai įkelta!<br><button type="button" class="modal-btn secondary" style="margin-top: 15px; width: 100%;" onclick="shareBtn(event)"><i class="fa-solid fa-share-nodes"></i> Nuoroda</button></div>`; }, 2000); }

// ==========================================
// 6. ADMNISTRATORIAUS VALDYMO PLATFORMA
// ==========================================

function promptAdmin() {
    if (!isAppMode) { toggleMode(); return; }
    const code = prompt("Įveskite administratoriaus kodą:");
    if (code === "7030") { toggleMode(); } else if (code !== null) { showToast("Neteisingas kodas!"); }
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
                <button type="button" onclick="openAdminTournamentModal('${t.id}')" style="background: #ebf8ff; color: #2b6cb0; border: none; padding: 5px 8px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; margin-right: 4px;">✏️ Keisti</button>
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
        else if (p.tier === 'D-C') ptsColor = 'var(--lvl-d-c)';
        else ptsColor = 'var(--lvl-d)';

        let genderBadge = p.gender === 'M' ? 
            '<span style="background: #ebf8ff; color: #2b6cb0; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 900;">V</span>' : 
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

function initFriendliesDB() {
    firebase.database().ref(GLOBAL_FRIENDLIES_KEY).on('value', snap => {
        let data = snap.val();
        friendlyMatches = data ? Object.values(data) : [];
        const profilePage = document.getElementById('page-profile');
        if (profilePage && profilePage.classList.contains('active')) {
            renderUserProfile();
        }
    });
}

// 🌟 SINKRONINIS PALEIDIKLIS: Užkuria visus sistemos modulius vienu kartu
window.onload = () => { 
    initDates(); 
    initTournamentsDB(); 
    initFriendliesDB(); 
    updateAuthUI(); 
};