// „Firebase“ konfigūracija ir inicializacija
const firebaseConfig = { 
    apiKey: "AIzaSyC_Z6srTcBfOWjG0aUKIoLD74ucozLUBHc", 
    authDomain: "padelio-turnyrai.firebaseapp.com", 
    databaseURL: "https://padelio-turnyrai-default-rtdb.europe-west1.firebasedatabase.app", 
    projectId: "padelio-turnyrai" 
};
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }

const DB_KEY = "padelio_pro_master"; 
const GLOBAL_PLAYERS_KEY = "padelio_global_players";

let liveDbRef = null; 
let currentLiveMatches = []; 
let activeLiveCourt = 1;
let eRefAuthenticated = false; 
let currentFirebaseData = null;
let currentUser = JSON.parse(localStorage.getItem('sp_current_user')) || null;
let isAppMode = true; 

// ==========================================
// 1. AUTENTIFIKACIJA IR VARTOTOJO PROFILIS
// ==========================================

function openAuthModal() {
    document.getElementById('authInput').value = '';
    document.getElementById('authName').value = '';
    document.getElementById('registerFields').style.display = 'none';
    document.getElementById('authModal').classList.add('show');
}

function closeAuthModal() { 
    document.getElementById('authModal').classList.remove('show'); 
}

function processAuth() {
    let inputId = document.getElementById('authInput').value.trim().toLowerCase();
    if(!inputId) { showToast("Įveskite ID arba telefono numerį!"); return; }
    let safeId = inputId.replace(/[^a-z0-9]/g, '');

    firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + safeId).once('value').then(snap => {
        let user = snap.val();
        if(user) {
            currentUser = user;
            localStorage.setItem('sp_current_user', JSON.stringify(currentUser));
            showToast(`Sveiki sugrįžę, ${user.name}!`);
            updateAuthUI();
            closeAuthModal();
        } else {
            let regFields = document.getElementById('registerFields');
            if(regFields.style.display === 'none') {
                regFields.style.display = 'block';
                showToast("Profilis nerastas. Įveskite duomenis registracijai.");
            } else {
                let name = document.getElementById('authName').value.trim();
                let gender = document.getElementById('authGender').value;
                if(!name) { showToast("Būtina įvesti vardą!"); return; }
                let newUser = { id: safeId, name: name, gender: gender, rating: 300, tier: "D", total_matches: 0, last_played: Date.now() };
                firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + safeId).set(newUser).then(() => {
                    currentUser = newUser;
                    localStorage.setItem('sp_current_user', JSON.stringify(currentUser));
                    showToast("Registracija sėkminga! Profilis sukurtas.");
                    updateAuthUI();
                    closeAuthModal();
                });
            }
        }
    });
}

function updateAuthUI() {
    let btn = document.getElementById('authBtn');
    if(currentUser) {
        let shortName = currentUser.name.split(' ')[0];
        btn.innerHTML = `<i class="fa-solid fa-user-check"></i> ${shortName}`;
        btn.style.background = 'var(--status-green)';
        btn.style.color = 'white';
        btn.onclick = () => { 
            if(confirm("Ar tikrai norite atsijungti?")) { 
                currentUser = null; 
                localStorage.removeItem('sp_current_user'); 
                updateAuthUI(); 
                showToast("Atsijungta sėkmingai."); 
            } 
        };
    } else {
        btn.innerHTML = `Prisijungti`;
        btn.style.background = '#ebf8ff';
        btn.style.color = 'var(--primary-blue)';
        btn.onclick = openAuthModal;
    }
}

// ==========================================
// 2. TIESIOGIAI (LIVE) MAČŲ STEBĖJIMAS TV
// ==========================================

function connectLiveRoom() {
    const roomInput = document.getElementById('liveRoomInput').value.trim();
    if (!roomInput) { showToast("Įveskite kambario pavadinimą!"); return; }
    document.getElementById('fbStatusIcon').style.color = "var(--status-orange)"; 
    document.getElementById('fbStatusText').innerText = `Jungiamasi prie "${roomInput}"...`;
    
    if (liveDbRef) { liveDbRef.off(); }
    liveDbRef = firebase.database().ref(DB_KEY + '/' + roomInput.toUpperCase());
    
    liveDbRef.on('value', snap => {
        const data = snap.val();
        currentFirebaseData = data;

        if (!data || !data.matches) { 
            document.getElementById('fbStatusIcon').style.color = "var(--status-red)"; 
            document.getElementById('fbStatusText').innerText = "Kambaryje dar nėra pradėtų mačų."; 
            document.getElementById('liveScoreBoxContainer').innerHTML = ""; 
            document.getElementById('liveCourtsContainer').innerHTML = ""; 
            return; 
        }
        document.getElementById('fbStatusIcon').style.color = "var(--status-green)"; 
        document.getElementById('fbStatusText').innerText = `Tiesiogiai: ${data.settings?.format || 'Turnyras'}`;
        
        currentLiveMatches = data.matches.filter(m => !m.finished);
        if(currentLiveMatches.length === 0) {
            document.getElementById('liveCourtsContainer').innerHTML = ""; 
            let finishedMatches = data.matches.filter(m => m.finished);
            finishedMatches.sort((a, b) => { 
                function getWeight(m) { 
                    if (m.isFinal) { 
                        let t = (m.finalTitle || "").toUpperCase(); 
                        if (t.indexOf("DIDYSIS") > -1) return 10000; 
                        if (t.indexOf("MAŽASIS") > -1) return 9000; 
                        let matchNum = t.match(/\d+/); 
                        if (matchNum) return 8000 - parseInt(matchNum[0]); 
                        return 5000; 
                    } 
                    return (m.round || 0) * 10; 
                } 
                let wA = getWeight(a); 
                let wB = getWeight(b); 
                if (wA !== wB) return wB - wA; 
                return (a.court || 0) - (b.court || 0); 
            });
            
            if (finishedMatches.length > 0) {
                document.getElementById('fbStatusTitleContainer').innerHTML = `<i class="fa-solid fa-trophy" style="color: #d69e2e;"></i> <span id="fbStatusText">Turnyro rezultatai</span>`;
                let html = '';
                finishedMatches.forEach(m => {
                    let t1 = (m.team1 || []).map(p=>p.name).join(' / '); 
                    let t2 = (m.team2 || []).map(p=>p.name).join(' / ');
                    let title = m.isFinal ? (m.finalTitle || 'FINALAS') : `RAUNDAS ${m.round || 'X'} (Kortas ${m.court})`;
                    let bgTitle = 'background: #1a202c;';
                    if (m.isFinal) { 
                        let tUpper = title.toUpperCase(); 
                        if (tUpper.indexOf("DIDYSIS") > -1) bgTitle = 'background: linear-gradient(to right, #d69e2e, #b7791f);'; 
                        else if (tUpper.indexOf("MAŽASIS") > -1) bgTitle = 'background: linear-gradient(to right, #ed8936, #c05621);'; 
                        else bgTitle = 'background: #4a5568;'; 
                    }
                    let w1 = m.score1 > m.score2 ? 'font-weight: 900; color: var(--primary-blue);' : 'color: var(--text-dark);'; 
                    let w2 = m.score2 > m.score1 ? 'font-weight: 900; color: var(--primary-blue);' : 'color: var(--text-dark);';
                    html += `<div class="score-box" style="margin-bottom: 10px;"><div style="${bgTitle} color: white; padding: 6px 15px; font-size: 10px; font-weight: bold; letter-spacing: 1px;">${title}</div><div class="team-row" style="padding: 10px 15px;"><div class="team-names" style="font-size: 13px;">${t1}</div><div class="team-score" style="font-size: 20px; ${w1}">${m.score1 || 0}</div></div><div class="team-row" style="border-bottom: none; background: #f8f9fb; padding: 10px 15px;"><div class="team-names" style="font-size: 13px;">${t2}</div><div class="team-score" style="font-size: 20px; ${w2}">${m.score2 || 0}</div></div></div>`;
                });
                document.getElementById('liveScoreBoxContainer').innerHTML = html;
            } else { 
                document.getElementById('liveScoreBoxContainer').innerHTML = "<p style='margin-top:20px; color:#718096; font-size:13px; text-align:center;'>Šiuo metu mačų nėra.</p>"; 
            }
            return;
        }
        document.getElementById('fbStatusTitleContainer').innerHTML = `<i class="fa-solid fa-server" id="fbStatusIcon" style="color: var(--status-green);"></i> <span id="fbStatusText">Tiesiogiai: ${data.settings?.format || 'Turnyras'}</span>`;
        renderLiveCourtFilters(); 
        if(!currentLiveMatches.find(m => m.court == activeLiveCourt)) { activeLiveCourt = currentLiveMatches[0].court; } 
        renderLiveScoreboard();
    });
}

function renderLiveCourtFilters() { 
    const container = document.getElementById('liveCourtsContainer'); 
    container.innerHTML = ''; 
    let courts = [...new Set(currentLiveMatches.map(m => m.court))].sort((a,b) => a-b); 
    courts.forEach(courtNum => { 
        let activeCls = (courtNum == activeLiveCourt) ? 'active' : ''; 
        container.innerHTML += `<button type="button" class="live-filter-btn ${activeCls}" onclick="changeLiveCourt(${courtNum})">Kortas ${courtNum}</button>`; 
    }); 
}

function changeLiveCourt(courtNum) { 
    activeLiveCourt = courtNum; 
    renderLiveCourtFilters(); 
    renderLiveScoreboard(); 
}

function changeLiveScore(matchId, teamNum, change) {
    if (!currentFirebaseData || !currentFirebaseData.settings?.eReferee) return;
    if (!eRefAuthenticated) { 
        const pin = prompt("Įveskite E-Teisėjavimo PIN kodą:"); 
        if (pin === currentFirebaseData.settings.eRefereePin) { 
            eRefAuthenticated = true; 
            showToast("Sėkmingai prisijungėte!"); 
        } else { 
            showToast("Neteisingas PIN kodas!"); 
            return; 
        } 
    }
    const matchIndex = currentFirebaseData.matches.findIndex(m => m.id === matchId); 
    if (matchIndex === -1) return;
    
    let match = currentFirebaseData.matches[matchIndex]; 
    let currentScore = teamNum === 1 ? (match.score1 || 0) : (match.score2 || 0); 
    let newScore = Math.max(0, currentScore + change);
    
    let updates = {}; 
    updates[`matches/${matchIndex}/score${teamNum}`] = newScore; 
    updates[`lastUpdate`] = Date.now();
    
    liveDbRef.update(updates).catch(err => { 
        console.error("Score update error:", err); 
        showToast("Klaida išsaugant tašką!"); 
    });
}

function renderLiveScoreboard() { 
    const container = document.getElementById('liveScoreBoxContainer'); 
    const match = currentLiveMatches.find(m => m.court == activeLiveCourt); 
    if(!match) { container.innerHTML = "<p>Klaida kraunant mačą.</p>"; return; } 
    
    const team1Names = (match.team1 || []).map(p => p.name).join('<br>') || 'Žaidėjas 1'; 
    const team2Names = (match.team2 || []).map(p => p.name).join('<br>') || 'Žaidėjas 2'; 
    let headerTitle = match.isFinal ? (match.finalTitle || 'FINALAS') : `RAUNDAS ${match.round || '1'} (Kortas ${match.court})`; 
    
    const isERef = currentFirebaseData?.settings?.eReferee;
    
    let score1Html = `<div class="team-score" style="color: var(--text-dark);">${match.score1 || 0}</div>`;
    let score2Html = `<div class="team-score" style="color: var(--text-dark);">${match.score2 || 0}</div>`;
    
    if (isERef) {
        score1Html = `<div style="display: flex; align-items: center; gap: 10px;"><button type="button" onclick="changeLiveScore('${match.id}', 1, -1)" style="width: 35px; height: 35px; border-radius: 50%; border: 1px solid #cbd5e0; background: #f8f9fb; font-size: 18px; font-weight: bold; color: #718096; cursor: pointer;">-</button><div style="font-size: 26px; font-weight: 900; width: 40px; text-align: center; color: var(--text-dark);">${match.score1 || 0}</div><button type="button" onclick="changeLiveScore('${match.id}', 1, 1)" style="width: 35px; height: 35px; border-radius: 50%; border: none; background: var(--status-green); font-size: 18px; font-weight: bold; color: white; cursor: pointer;">+</button></div>`;
        score2Html = `<div style="display: flex; align-items: center; gap: 10px;"><button type="button" onclick="changeLiveScore('${match.id}', 2, -1)" style="width: 35px; height: 35px; border-radius: 50%; border: 1px solid #cbd5e0; background: #f8f9fb; font-size: 18px; font-weight: bold; color: #718096; cursor: pointer;">-</button><div style="font-size: 26px; font-weight: 900; width: 40px; text-align: center; color: var(--text-dark);">${match.score2 || 0}</div><button type="button" onclick="changeLiveScore('${match.id}', 2, 1)" style="width: 35px; height: 35px; border-radius: 50%; border: none; background: var(--status-green); font-size: 18px; font-weight: bold; color: white; cursor: pointer;">+</button></div>`;
    }
    container.innerHTML = `<div class="score-box"><div style="background: #1a202c; color: white; padding: 6px 15px; font-size: 10px; font-weight: bold; letter-spacing: 1px;">${headerTitle}</div><div class="team-row"><div class="team-names">${team1Names}</div>${score1Html}</div><div class="team-row" style="border-bottom: none; background: #f8f9fb;"><div class="team-names">${team2Names}</div>${score2Html}</div></div>`; 
}

function openLiveModal(e) { 
    e.stopPropagation(); 
    document.getElementById('liveModal').classList.add('show'); 
    document.body.style.overflow = 'hidden'; 
}

function closeLiveModal() { 
    try { 
        eRefAuthenticated = false; 
        currentFirebaseData = null; 
        const modal = document.getElementById('liveModal'); 
        if (modal) { modal.classList.remove('show'); document.body.style.overflow = 'auto'; } 
        setTimeout(() => { 
            try { 
                if(liveDbRef) { liveDbRef.off(); liveDbRef = null; } 
                document.getElementById('fbStatusTitleContainer').innerHTML = `<i class="fa-solid fa-server" id="fbStatusIcon" style="color: var(--status-red);"></i> <span id="fbStatusText">Neprisijungta prie Firebase</span>`; 
                document.getElementById('liveRoomInput').value = ''; 
                document.getElementById('liveCourtsContainer').innerHTML = '<div class="live-filter-btn">Laukiama prisijungimo...</div>'; 
                document.getElementById('liveScoreBoxContainer').innerHTML = `<div style="text-align: center; color: var(--text-grey); font-size: 13px; margin-top: 20px;">Įveskite V188 kambario pavadinimą...</div>`; 
            } catch(err) {} 
        }, 300); 
    } catch(e) {}
}

// ==========================================
// 3. KALENDORIUS IR TURNYRAI
// ==========================================

const now = new Date(); const daysArr = ['S', 'P', 'A', 'T', 'K', 'P', 'Š']; 
let dynamicDates = []; 
for(let i = -3; i <= 13; i++) { 
    let d = new Date(now); d.setDate(now.getDate() + i); 
    let m = (d.getMonth() + 1).toString().padStart(2, '0'); 
    let day = d.getDate().toString().padStart(2, '0'); 
    let dateKey = `${m}-${day}`;
    dynamicDates.push({ fullDate: d, dateKey: dateKey, dayNumStr: d.getDate().toString(), dayNameStr: daysArr[d.getDay()], isToday: i === 0 }); 
}
let activeDate = dynamicDates.find(d => d.isToday).dateKey; 

function initDates() { 
    const carousel = document.getElementById('dateCarousel');
    const adminSelect = document.getElementById('newDate'); 
    carousel.innerHTML = ''; 
    if(adminSelect) adminSelect.innerHTML = '';
    
    dynamicDates.forEach(d => { 
        let activeCls = d.isToday ? 'active' : ''; 
        let idAttr = d.isToday ? 'id="today-date-box"' : ''; 
        carousel.innerHTML += `<div ${idAttr} class="date-box ${activeCls}" onclick="selectDate('${d.dateKey}', this)"><div class="day-num">${d.dayNumStr}</div><div class="day-name">${d.dayNameStr}</div></div>`; 
        let selected = d.isToday ? 'selected' : ''; 
        if(adminSelect) adminSelect.innerHTML += `<option value="${d.dateKey}" ${selected}>${d.dayNumStr} d. (${d.dayNameStr})</option>`; 
    }); 
    setTimeout(() => { const todayBox = document.getElementById('today-date-box'); if(todayBox) { todayBox.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } }, 100);
}

function getTimeState(tDateKey, timeString) { 
    let targetDate = dynamicDates.find(d => d.dateKey === tDateKey); if (!targetDate) return 'future';
    let tDate = targetDate.fullDate; 
    let targetStartOfDay = new Date(tDate.getFullYear(), tDate.getMonth(), tDate.getDate()).getTime(); 
    let todayStartOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    if (targetStartOfDay < todayStartOfDay) return 'past'; 
    if (targetStartOfDay > todayStartOfDay) return 'future';
    
    const currentTotalMins = now.getHours() * 60 + now.getMinutes(); 
    const parts = timeString.split('-'); if(parts.length !== 2) return 'future'; 
    const startParts = parts[0].trim().split(':'); 
    const endParts = parts[1].trim().split(':'); 
    const startTotal = parseInt(startParts[0]) * 60 + parseInt(startParts[1]); 
    const endTotal = parseInt(endParts[0]) * 60 + parseInt(endParts[1]); 
    
    if (currentTotalMins < startTotal) return 'future'; 
    if (currentTotalMins >= startTotal && currentTotalMins <= endTotal) return 'live'; 
    return 'past'; 
}

const dYest = dynamicDates.find(d => d.fullDate.getDate() === new Date(now.getTime() - 86400000).getDate())?.dateKey || dynamicDates[0].dateKey;
const dToday = dynamicDates.find(d => d.isToday).dateKey;
const dTom = dynamicDates.find(d => d.fullDate.getDate() === new Date(now.getTime() + 86400000).getDate())?.dateKey || dynamicDates[4].dateKey;

const defaultTournaments = [
    { id: 1, date: dYest, timeState: 'past', format: 'Americano', level: 'D', time: '10:00 - 12:00', registered: 16, max: 16, status: 'full', isDemoWaitlist: false, waitlistCount: 0, players: ['Darius', 'Lina', 'Petras', 'Rasa'] }, 
    { id: 2, date: dToday, timeState: 'past', format: 'Mix Blitz', level: 'D-C', time: '08:15 - 10:00', registered: 12, max: 16, status: 'open', isDemoWaitlist: false, waitlistCount: 0, players: ['Andrius', 'Laura', 'Karolis'] }, 
    { id: 3, date: dToday, timeState: 'live', format: 'Blitz', level: 'C', time: '14:00 - 17:00', registered: 16, max: 16, status: 'full', isDemoWaitlist: true, waitlistCount: 2, players: ['Marius', 'Lukas', 'Tomas', 'Aistė'] }, 
    { id: 4, date: dToday, timeState: 'future', format: 'Americano', level: 'C', time: '18:00 - 20:00', registered: 16, max: 16, status: 'full', isDemoWaitlist: true, waitlistCount: 2, players: ['Marius', 'Dovydas', 'Ignas'] }, 
    { id: 5, date: dToday, timeState: 'future', format: 'Mixed Kings', level: 'A', time: '20:30 - 22:30', registered: 2, max: 12, status: 'open', isDemoWaitlist: false, waitlistCount: 0, players: ['Vilius', 'Mantas'] }, 
    { id: 6, date: dTom, timeState: 'future', format: 'Moterų Blitz', level: 'B', time: '18:00 - 20:00', registered: 8, max: 16, status: 'open', isDemoWaitlist: false, waitlistCount: 0, players: ['Aistė', 'Rūta', 'Eglė'] } 
];

let tournaments = JSON.parse(localStorage.getItem('superPadelTournaments_v14')) || defaultTournaments;
function saveData() { localStorage.setItem('superPadelTournaments_v14', JSON.stringify(tournaments)); }
function resetLocalStorage() { localStorage.removeItem('superPadelTournaments_v14'); tournaments = JSON.parse(JSON.stringify(defaultTournaments)); saveData(); renderTournaments(); renderAdminTournaments(); showToast("Atstatyti pradiniai turnyrai!"); }

function renderTournaments() {
    const list = document.getElementById('scheduleList'); 
    const formatFilter = document.getElementById('filterFormat').value; 
    const levelFilter = document.getElementById('filterLevel').value; 
    const playerFilter = (document.getElementById('filterPlayer').value || "").toLowerCase().trim(); 
    list.innerHTML = '';
    
    let filtered = tournaments.filter(t => { 
        let matchDate = (t.date === activeDate); 
        let matchFormat = (formatFilter === 'all' || t.format === formatFilter); 
        let matchLevel = (levelFilter === 'all' || t.level === levelFilter); 
        let matchPlayer = true; 
        if (playerFilter !== '') { 
            if (t.players && Array.isArray(t.players)) { 
                matchPlayer = t.players.some(p => p.toLowerCase().includes(playerFilter)); 
            } else { matchPlayer = false; } 
        } 
        return matchDate && matchFormat && matchLevel && matchPlayer; 
    });
    
    if(filtered.length === 0) { 
        list.innerHTML = `<div style="text-align:center; padding: 30px; color: var(--text-grey);">Pagal šiuos filtrus turnyrų nerasta.</div>`; 
        return; 
    }
    
    filtered.forEach(t => {
        let dayObj = dynamicDates.find(d => d.dateKey === t.date); 
        let dayName = dayObj ? dayObj.dayNameStr : 'D'; 
        let dayNum = dayObj ? dayObj.dayNumStr : t.date; 
        
        let displayLevel = t.level === 'D-C' ? 'D/C-' : t.level; 
        if (t.level === 'Privatus') displayLevel = 'Draugų';
        
        t.timeState = getTimeState(t.date, t.time);
        let statusHTML = ''; let timeStateBadge = ''; let cardClassModifier = '';
        
        if (t.timeState === 'past') { 
            timeStateBadge = `<div class="status-badge-time badge-past">ĮVYKO</div>`; 
            cardClassModifier = 'card-past'; 
            statusHTML = `<div class="status-indicator" style="color: var(--text-grey);"><i class="fa-solid fa-flag-checkered"></i> Turnyras baigėsi</div><div class="edit-badge"><i class="fa-solid fa-list-ol"></i> Rezultatai</div>`; 
        } else if (t.timeState === 'live') { 
            timeStateBadge = `<div class="status-badge-time badge-live"><i class="fa-solid fa-circle" style="font-size: 8px;"></i> VYKSTA DABAR</div>`; 
            statusHTML = `<div class="status-indicator" style="color: var(--status-red);"><i class="fa-solid fa-tower-broadcast"></i> Tiesiogiai</div><button type="button" class="watch-badge" onclick="openLiveModal(event)"><i class="fa-solid fa-play"></i> Stebėti</button>`; 
        } else { 
            if (t.status === 'open') { 
                statusHTML = `<div class="status-indicator status-open"><i class="fa-regular fa-circle-check"></i> Laisva (Registruotis)</div>`; 
            } else if (t.status === 'registered') { 
                statusHTML = `<div class="status-indicator status-in"><i class="fa-solid fa-check"></i> Dalyvaujate</div><div class="edit-badge"><i class="fa-solid fa-pen"></i> Keisti</div>`; 
            } else if (t.status === 'waitlist') { 
                statusHTML = `<div class="status-indicator status-wait"><i class="fa-solid fa-hourglass-half"></i> Rezervas (Jūs ${t.waitlistCount}-as)</div><div class="edit-badge"><i class="fa-solid fa-pen"></i> Keisti</div>`; 
            } else if (t.status === 'full' && !t.isDemoWaitlist) { 
                statusHTML = `<div class="status-indicator status-full">Vietų nėra</div>`; 
            } else if (t.status === 'full' && t.isDemoWaitlist) { 
                statusHTML = `<div class="status-indicator status-wait"><i class="fa-solid fa-plus"></i> Stoti į eilę (${t.waitlistCount})</div>`; 
            } 
        }
        
        let demoBtn = (t.isDemoWaitlist && t.status === 'waitlist' && t.timeState === 'future') ? `<button type="button" class="test-trigger" onclick="simulateSpotOpening(event, ${t.id})">[Demo] Algoritmas perleidžia atšauktą vietą Jums (Push)</button>` : ''; 
        let avatar1 = (t.players && t.players[0]) ? t.players[0].substring(0,2) : 'AŽ'; 
        let avatar2 = (t.players && t.players[1]) ? t.players[1].substring(0,2) : 'MK';
        
        let cardHTML = `<div class="schedule-card level-${t.level.toLowerCase()} ${cardClassModifier}" onclick="handleCardClick(${t.id})"><div class="card-date-square"><div class="num">${dayNum}</div><div class="name">${dayName}</div></div><div class="card-info"><div class="card-header"><div class="card-title-group"><div class="card-title">${t.format}</div><div style="display: flex; gap: 5px; flex-wrap: wrap;"><div class="level-badge">${displayLevel} Lygis</div>${timeStateBadge}</div></div><button type="button" class="share-btn" onclick="shareBtn(event)"><i class="fa-solid fa-share-nodes"></i></button></div><div class="card-time">${t.time}</div><div class="avatars-row"><div class="avatar">${avatar1}</div><div class="avatar">${avatar2}</div><div class="avatar avatar-more">+${t.registered > 2 ? t.registered - 2 : 0}</div><div class="registration-count">${t.registered} / ${t.max}</div></div><div class="card-bottom">${statusHTML}${(t.status !== 'registered' && t.timeState !== 'past' && t.timeState !== 'live') ? `<button type="button" class="h2h-btn" onclick="openH2H(event)"><i class="fa-solid fa-chart-simple"></i> H2H</button>` : ''}</div></div>${demoBtn}</div>`;
        list.innerHTML += cardHTML;
    });
}

function handleCardClick(id) { let t = tournaments.find(x => x.id === id); if (t.timeState === 'past') { showToast("Šis turnyras jau baigėsi. Peržiūrėkite rezultatus reitingų lentelėje."); return; } if (t.timeState === 'live') { openLiveModal({stopPropagation: () => {}}); return; } if (t.status === 'open') { openRegisterModal(id); } else if (t.status === 'registered') { openCancelModal(id); } else if (t.status === 'waitlist') { openWaitlistCancelModal(id); } else if (t.status === 'full' && t.isDemoWaitlist) { openJoinWaitlistModal(id); } else if (t.status === 'full' && !t.isDemoWaitlist) { showToast("Šiame turnyre vietų nebėra."); } }
function shareBtn(e) { e.stopPropagation(); showToast("Nuoroda nukopijuota į iškarpinę!"); }
function openH2H(e) { e.stopPropagation(); showToast("Kraunama Head-to-Head statistika..."); }
function selectDate(dateKey, element) { document.querySelectorAll('.date-box').forEach(el => el.classList.remove('active')); element.classList.add('active'); activeDate = dateKey; document.getElementById('filterPlayer').value = ''; renderTournaments(); }

const modal = document.getElementById('actionModal'); const modalTitle = document.getElementById('modalTitle'); const modalBody = document.getElementById('modalBody'); const modalActions = document.getElementById('modalActions'); function closeModal() { modal.classList.remove('show'); }

function openRegisterModal(id) { 
    if(!currentUser) { showToast("Norėdami registruotis, pirmiausia prisijunkite!"); openAuthModal(); return; }
    let t = tournaments.find(x => x.id === id); 
    let displayLevel = t.level === 'D-C' ? 'D/C-' : t.level; 
    if (t.level === 'Privatus') displayLevel = 'Draugų';
    modalTitle.innerHTML = `<i class="fa-solid fa-check-to-slot"></i> Turnyro Registracija`; modalBody.innerHTML = `Patvirtinkite dalyvavimą: <strong>${t.format} (${displayLevel} lygis)</strong>.<br>Laikas: ${t.time}.<br><br>Kaip norite registruotis?`; modalActions.innerHTML = `<button type="button" class="modal-btn primary" onclick="confirmRegistration(${id}, false)">Registruotis Individualiai</button><button type="button" class="modal-btn primary" onclick="confirmRegistration(${id}, true)"><i class="fa-solid fa-user-plus"></i> Pridėti Partnerį</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Atšaukti</button>`; modal.classList.add('show'); 
}
function confirmRegistration(id, withPartner) { let t = tournaments.find(x => x.id === id); t.status = 'registered'; t.registered += (withPartner ? 2 : 1); if(!t.players) t.players = []; t.players.push(currentUser ? currentUser.name : "Jūs"); saveData(); closeModal(); renderTournaments(); renderAdminTournaments(); showToast("Jūs sėkmingai užregistruoti!"); }
function openJoinWaitlistModal(id) { let t = tournaments.find(x => x.id === id); modalTitle.innerHTML = `<i class="fa-solid fa-hourglass-half" style="color: var(--status-orange);"></i> Registracija į Rezervą`; modalBody.innerHTML = `Šiuo metu vietų nėra.<br>Ar norite atsistoti į laukiančiųjų sąrašą? Jei kas nors atšauks dalyvavimą, sistema automatiškai perleis vietą jums.`; modalActions.innerHTML = `<button type="button" class="modal-btn primary" onclick="confirmWaitlist(${id})">Taip, stoti į eilę</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Ne, atšaukti</button>`; modal.classList.add('show'); }
function confirmWaitlist(id) { let t = tournaments.find(x => x.id === id); t.status = 'waitlist'; t.waitlistCount += 1; saveData(); closeModal(); renderTournaments(); showToast("Pridėta į laukiančiųjų sąrašą."); }
function openCancelModal(id) { modalTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: var(--status-red);"></i> Atšaukti Dalyvavimą`; modalBody.innerHTML = `<strong>Dėmesio:</strong> Geriau atšaukti savo vietą net ir likus vos 1 valandai, nei visai neatvykti. Jūsų vieta bus skubiai pasiūlyta žaidėjams iš rezervinio sąrašo.<br><br>Ar tikrai norite atšaukti?`; modalActions.innerHTML = `<button type="button" class="modal-btn danger" onclick="confirmCancel(${id})">Taip, atšaukti mano vietą</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Ne, aš dalyvausiu</button>`; modal.classList.add('show'); }
function confirmCancel(id) { let t = tournaments.find(x => x.id === id); t.status = 'open'; t.registered -= 1; let pName = currentUser ? currentUser.name : "Jūs"; if(t.players) t.players = t.players.filter(p => p !== pName); saveData(); closeModal(); document.getElementById('notifBadge').style.display = 'none'; renderTournaments(); renderAdminTournaments(); showToast("Jūsų registracija atšaukta. Ieškome pamainos."); }
function openWaitlistCancelModal(id) { let t = tournaments.find(x => x.id === id); modalTitle.innerHTML = `Palikti rezervą?`; modalBody.innerHTML = `Jūs esate ${t.waitlistCount}-as eilėje. Jei išeisite, prarasite savo poziciją.`; modalActions.innerHTML = `<button type="button" class="modal-btn danger" onclick="confirmWaitlistCancel(${id})">Išeiti iš eilės</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Pasilikti</button>`; modal.classList.add('show'); }
function confirmWaitlistCancel(id) { let t = tournaments.find(x => x.id === id); t.status = 'full'; t.waitlistCount -= 1; saveData(); closeModal(); renderTournaments(); showToast("Jūs išbrauktas iš laukiančiųjų sąrašo."); }

let currentPushId = null; 
function simulateSpotOpening(e, id) { e.stopPropagation(); currentPushId = id; let t = tournaments.find(x => x.id === id); t.status = 'registered'; t.registered += 1; t.waitlistCount -= 1; saveData(); document.getElementById('pushFormatName').innerText = `${t.format}`; document.getElementById('notifBadge').style.display = 'flex'; document.getElementById('pushNotification').style.top = '20px'; renderTournaments(); renderAdminTournaments(); setTimeout(() => { document.getElementById('pushNotification').style.top = '-100px'; }, 8000); }
function closePush() { document.getElementById('pushNotification').style.top = '-100px'; } 
function manageReservation() { closePush(); openCancelModal(currentPushId); } 
function showToast(text) { const toast = document.getElementById('toastMsg'); toast.innerText = text; toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 3000); }

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
    document.getElementById('ratingsContent').style.display = 'none';
    document.getElementById('ratingsLoader').style.display = 'block';

    const spinner = document.getElementById('loaderSpinner');
    if (leagueLevel === 'all') spinner.style.color = 'var(--primary-blue)';
    if (leagueLevel === 'D') spinner.style.color = 'var(--lvl-d)';
    if (leagueLevel === 'D-C') spinner.style.color = 'var(--lvl-d-c)';
    if (leagueLevel === 'C') spinner.style.color = 'var(--lvl-c)';
    if (leagueLevel === 'B') spinner.style.color = 'var(--lvl-b)';
    if (leagueLevel === 'A') spinner.style.color = 'var(--lvl-a)';

    firebase.database().ref(GLOBAL_PLAYERS_KEY).once('value').then(snap => {
        let allPlayers = Object.values(snap.val() || {});
        let dataPool = [];

        if (leagueLevel === 'all') { dataPool = allPlayers; } 
        else { dataPool = allPlayers.filter(p => p.tier === leagueLevel); }

        dataPool.sort((a,b) => (b.rating || 0) - (a.rating || 0));
        let mappedPool = dataPool.map(p => ({ name: p.name, points: p.rating || 0 }));

        if(mappedPool.length >= 3) {
            document.getElementById('pod1-name').innerText = mappedPool[0].name; document.getElementById('pod1-pts').innerText = mappedPool[0].points + " pts";
            document.getElementById('pod2-name').innerText = mappedPool[1].name; document.getElementById('pod2-pts').innerText = mappedPool[1].points + " pts";
            document.getElementById('pod3-name').innerText = mappedPool[2].name; document.getElementById('pod3-pts').innerText = mappedPool[2].points + " pts";
        } else {
            document.getElementById('pod1-name').innerText = mappedPool[0]?.name || "-"; document.getElementById('pod1-pts').innerText = mappedPool[0] ? mappedPool[0].points + " pts" : "-";
            document.getElementById('pod2-name').innerText = mappedPool[1]?.name || "-"; document.getElementById('pod2-pts').innerText = mappedPool[1] ? mappedPool[1].points + " pts" : "-";
            document.getElementById('pod3-name').innerText = "-"; document.getElementById('pod3-pts').innerText = "-";
        }

        const tbody = document.getElementById('ratingsTableBody'); tbody.innerHTML = '';
        mappedPool.forEach((player, index) => {
            let rankNum = index + 1;
            let rankClass = index === 0 ? 'color: #d69e2e; font-size: 18px; font-weight: 900;' : index === 1 ? 'color: #a0aec0; font-weight: 800;' : index === 2 ? 'color: #dd6b20; font-weight: 800;' : 'color: var(--text-grey);';
            let ptsColor = 'var(--primary-blue)';
            if (leagueLevel === 'D') ptsColor = 'var(--lvl-d)'; if (leagueLevel === 'D-C') ptsColor = 'var(--lvl-d-c)'; if (leagueLevel === 'C') ptsColor = 'var(--lvl-c)'; if (leagueLevel === 'B') ptsColor = 'var(--lvl-b)'; if (leagueLevel === 'A') ptsColor = 'var(--lvl-a)';
            tbody.innerHTML += `<tr><td style="text-align: center; ${rankClass}">${rankNum}</td><td>${player.name}</td><td style="color: ${ptsColor}; font-weight: bold; text-align: right;">${player.points}</td></tr>`;
        });

        document.getElementById('ratingsLoader').style.display = 'none'; document.getElementById('ratingsContent').style.display = 'block';
    }).catch(err => {
        console.error("Reitingų užkrovimo klaida:", err);
        document.getElementById('ratingsLoader').innerHTML = "<div style='color:var(--status-red); font-weight:bold;'>Klaida kraunant reitingus. Patikrinkite ryšį.</div>";
    });
}

function switchTab(pageId, element) { 
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active')); if(element) element.classList.add('active'); 
    document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active')); const page = document.getElementById(pageId); if(page) page.classList.add('active'); 
    
    if(pageId === 'page-cam') { document.getElementById('mainHeader').style.display = 'none'; startCamera(); } else { document.getElementById('mainHeader').style.display = 'flex'; stopCamera(); }
    if(pageId === 'page-trophy') { document.querySelectorAll('.league-tab').forEach(el => el.classList.remove('active')); document.querySelector('.league-tab[data-league="all"]').classList.add('active'); loadAutomatedRatings('all'); }
}
function goToHome() { const calendarBtn = document.querySelector('[data-index="1"]'); switchTab('page-calendar', calendarBtn); }

// ==========================================
// 5. IŠMANIOJI KAMERA IR DI HIGHLIGHTS
// ==========================================

let cameraStream = null;
async function startCamera() { try { const videoElement = document.getElementById('cameraFeed'); if (cameraStream) return; if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert("Kameros klaida."); return; } const constraints = { video: { facingMode: 'environment', width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 30, max: 30 } } }; const stream = await navigator.mediaDevices.getUserMedia(constraints); videoElement.srcObject = stream; cameraStream = stream; } catch (err) { } }
function stopCamera() { if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; document.getElementById('cameraFeed').srcObject = null; } }
function toggleRecording() { const btn = document.getElementById('recordBtn'); const indicator = document.getElementById('recIndicator'); const infoText = document.getElementById('camInfoText'); const aiPanel = document.getElementById('aiPanel'); if (!isRecording) { isRecording = true; btn.classList.add('recording'); indicator.style.display = 'flex'; aiPanel.style.display = 'none'; infoText.innerHTML = "Filmuojama... Vaizdas įrašomas."; secondsRecord = 0; timerIntervalCam = setInterval(() => { secondsRecord++; let m = Math.floor(secondsRecord / 60).toString().padStart(2, '0'); let s = (secondsRecord % 60).toString().padStart(2, '0'); document.getElementById('recTimer').innerText = `00:${m}:${s}`; }, 1000); } else { isRecording = false; btn.classList.remove('recording'); indicator.style.display = 'none'; clearInterval(timerIntervalCam); btn.style.display = 'none'; infoText.style.display = 'none'; aiPanel.style.display = 'block'; setTimeout(() => { document.getElementById('recTimer').innerText = `00:00:00`; }, 1000); } }
function startAiProcessing() { document.getElementById('startAiBtn').style.display = 'none'; document.getElementById('aiProgress').style.display = 'block'; document.getElementById('aiStatusText').style.display = 'block'; let fill = document.getElementById('aiFill'); let status = document.getElementById('aiStatusText'); let width = 0; let interval = setInterval(() => { width += Math.random() * 15; if(width >= 100) width = 100; fill.style.width = width + '%'; if(width < 40) status.innerText = `Analizuojama... Ieškoma smūgių (${Math.floor(width)}%)`; else if(width < 80) status.innerText = `Karpomas vaizdas... (${Math.floor(width)}%)`; else status.innerText = `Baigiama... (${Math.floor(width)}%)`; if(width >= 100) { clearInterval(interval); document.getElementById('aiProgress').style.display = 'none'; document.getElementById('aiStatusText').style.display = 'none'; document.getElementById('generatedVideo').style.display = 'block'; showToast("DI Highlights sėkmingai sugeneruoti!"); } }, 500); }
function uploadToYT() { showToast("Įkeliama fone... Netrukus atsiras SuperPadel TV skiltyje!"); setTimeout(() => { document.getElementById('generatedVideo').innerHTML = `<div style="padding: 20px; text-align: center; color: var(--status-green);"><i class="fa-solid fa-check-circle" style="font-size: 30px; margin-bottom: 10px;"></i><br>Sėkmingai įkelta!<br><button type="button" class="modal-btn secondary" style="margin-top: 15px; width: 100%;" onclick="shareBtn(event)"><i class="fa-solid fa-share-nodes"></i> Kopijuoti nuorodą</button></div>`; }, 2000); }

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

// NAUJA KŪRIMO FUNKCIJA (IŠSAUGO, IŠVALO IR ATNAUJINA LENTELĘ)
function createTournament(e) { 
    e.preventDefault(); 
    const newT = { 
        id: Date.now(), 
        date: document.getElementById('newDate').value, 
        format: document.getElementById('newFormat').value, 
        level: document.getElementById('newLevel').value, 
        time: document.getElementById('newTime').value, 
        registered: 0, 
        max: parseInt(document.getElementById('newMax').value), 
        status: 'open', 
        isDemoWaitlist: false, 
        waitlistCount: 0, 
        timeState: 'future', 
        players: [] 
    }; 
    tournaments.push(newT); 
    saveData(); 
    showToast("Turnyras sėkmingai sugeneruotas!"); 
    document.getElementById('adminForm').reset(); 
    renderAdminTournaments();
    renderTournaments(); 
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
    html += '<tr style="background: #edf2f7; color: #718096; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;"><th style="padding: 12px; border-radius: 6px 0 0 0;">Diena</th><th style="padding: 12px;">Laikas</th><th style="padding: 12px;">Formatas</th><th style="padding: 12px;">Lygis</th><th style="padding: 12px;">Dalyviai</th><th style="padding: 12px; border-radius: 0 6px 0 0; text-align: right;">Veiksmai</th></tr>';

    sorted.forEach(t => {
        html += `<tr style="border-bottom: 1px solid #e2e8f0; transition: 0.2s;" onmouseover="this.style.backgroundColor='#f8f9fb'" onmouseout="this.style.backgroundColor='transparent'">
            <td style="padding: 12px; font-weight: bold; color: var(--text-dark);">${t.date}</td>
            <td style="padding: 12px; color: var(--text-grey); font-weight: 600;">${t.time}</td>
            <td style="padding: 12px; font-weight: 800; color: var(--primary-blue);">${t.format}</td>
            <td style="padding: 12px;"><span style="background: #edf2f7; padding: 3px 6px; border-radius: 4px; font-weight:bold; font-size: 11px;">${t.level}</span></td>
            <td style="padding: 12px; font-weight: bold; color: ${t.registered >= t.max ? 'var(--status-red)' : 'var(--status-green)'};">${t.registered}/${t.max}</td>
            <td style="padding: 12px; text-align: right;">
                <button onclick="deleteTournament(${t.id})" style="background: white; border: 1px solid #cbd5e0; color: var(--status-red); padding: 6px 10px; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    });
    html += '</table>';
    list.innerHTML = html;
}

function deleteTournament(id) {
    if(confirm("Ar tikrai norite ištrinti šį turnyrą iš sistemos? Visi užsiregistravę žaidėjai bus pašalinti.")) {
        tournaments = tournaments.filter(t => t.id !== id);
        saveData();
        renderAdminTournaments();
        renderTournaments();
        showToast("Turnyras ištrintas!");
    }
}

let globalAdminPlayers = [];

function loadAdminPlayersDB() {
    document.getElementById('admin-players-list-db').innerHTML = '<div style="text-align:center; padding:20px; color:#718096;"><i class="fa-solid fa-spinner fa-spin"></i> Jungiamasi prie debesies...</div>';
    
    firebase.database().ref(GLOBAL_PLAYERS_KEY).once('value').then(snap => {
        let data = snap.val() || {};
        globalAdminPlayers = Object.values(data).sort((a,b) => (b.rating || 0) - (a.rating || 0));
        document.getElementById('admin-players-count').innerText = `Viso: ${globalAdminPlayers.length}`;
        renderAdminPlayersDB(globalAdminPlayers);
    }).catch(err => {
        document.getElementById('admin-players-list-db').innerHTML = '<div style="color:red; text-align:center; padding: 20px;">Klaida kraunant duomenis. Patikrinkite ryšį.</div>';
    });
}

function renderAdminPlayersDB(playersArray) {
    if(playersArray.length === 0) {
        document.getElementById('admin-players-list-db').innerHTML = '<div style="text-align:center; padding:20px; color:#718096;">Žaidėjų nerasta.</div>';
        return;
    }

    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; min-width: 400px;">';
    html += '<tr style="background: #edf2f7; color: #718096; text-transform: uppercase; font-size: 10px; letter-spacing: 1px;"><th style="padding: 12px; border-top-left-radius: 6px;">Vardas</th><th style="padding: 12px;">Lytis</th><th style="padding: 12px;">Lygis</th><th style="padding: 12px;">ELO Taškai</th><th style="padding: 12px; border-top-right-radius: 6px; text-align: right;">Veiksmai</th></tr>';
    
    playersArray.forEach(p => {
        let ptsColor = 'var(--primary-blue)';
        if (p.tier === 'A') ptsColor = 'var(--lvl-a)';
        else if (p.tier === 'B') ptsColor = 'var(--lvl-b)';
        else if (p.tier === 'C') ptsColor = 'var(--lvl-c)';
        else if (p.tier === 'D-C') ptsColor = 'var(--lvl-d-c)';
        else ptsColor = 'var(--lvl-d)';

        html += `<tr style="border-bottom: 1px solid #e2e8f0; transition: 0.2s;" onmouseover="this.style.backgroundColor='#f8f9fb'" onmouseout="this.style.backgroundColor='transparent'">
            <td style="padding: 12px; font-weight: 800; color: var(--text-dark);">${p.name} <br><span style="font-size:9px; color:#a0aec0; font-weight:normal;">ID: ${p.id}</span></td>
            <td style="padding: 12px; font-weight: bold; color: var(--text-grey);">${p.gender === 'M' ? 'V' : 'M'}</td>
            <td style="padding: 12px;"><span style="background: #edf2f7; color: var(--text-dark); padding: 3px 6px; border-radius: 4px; font-weight:bold; font-size: 11px;">${p.tier || 'D'}</span></td>
            <td style="padding: 12px; color: ${ptsColor}; font-weight: 900; font-size: 15px;">${p.rating || 300}</td>
            <td style="padding: 12px; text-align: right;">
                <button onclick="editAdminPlayer('${p.id}')" style="background: white; border: 1px solid #cbd5e0; color: var(--status-orange); padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; margin-right: 5px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" title="Redaguoti reitingą"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteAdminPlayer('${p.id}')" style="background: white; border: 1px solid #cbd5e0; color: var(--status-red); padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" title="Ištrinti paskyrą"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    });
    html += '</table>';
    document.getElementById('admin-players-list-db').innerHTML = html;
}

// IŠTAISYTA PAIEŠKOS KLAIDA (Teksto tipo užtikrinimas)
function filterAdminPlayers() {
    let query = document.getElementById('adminPlayerSearch').value.toLowerCase();
    let filtered = globalAdminPlayers.filter(p => {
        let nameMatch = (p.name || "").toLowerCase().includes(query);
        let idMatch = String(p.id || "").toLowerCase().includes(query);
        return nameMatch || idMatch;
    });
    renderAdminPlayersDB(filtered);
}

// IŠTAISYTA TRYNIMO KLAIDA (Teksto tipo užtikrinimas)
function deleteAdminPlayer(id) {
    let p = globalAdminPlayers.find(x => String(x.id) === String(id));
    if(!p) {
        showToast("Klaida: Žaidėjas nerastas!");
        return;
    }
    if(confirm(`Ar tikrai norite IŠTRINTI žaidėją "${p.name}" iš globalios duomenų bazės?\n\nŠis žaidėjas praras savo unikalų Padel ID bei ELO istoriją!`)) {
        firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + p.id).remove().then(() => {
            showToast("Žaidėjas ištrintas!");
            loadAdminPlayersDB();
        }).catch(err => {
            showToast("Klaida trinant žaidėją.");
        });
    }
}

// IŠTAISYTA REDAGAVIMO KLAIDA (Teksto tipo užtikrinimas)
function editAdminPlayer(id) {
    let p = globalAdminPlayers.find(x => String(x.id) === String(id));
    if(!p) {
        showToast("Klaida: Žaidėjas nerastas!");
        return;
    }
    let newPts = prompt(`Redaguojate žaidėją: ${p.name}\nDabartinis reitingas: ${p.rating || 300}\n\nĮveskite naują ELO taškų skaičių:`, p.rating || 300);
    
    if(newPts !== null && newPts.trim() !== "" && !isNaN(newPts)) {
        let pts = parseInt(newPts);
        let tier = "D";
        if (pts >= 851) tier = "A";
        else if (pts >= 671) tier = "B";
        else if (pts >= 501) tier = "C";
        else if (pts >= 351) tier = "D-C";

        firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + p.id).update({
            rating: pts,
            tier: tier
        }).then(() => {
            showToast(`Atnaujinta! ${pts} ELO (${tier} lygis)`);
            loadAdminPlayersDB();
        }).catch(err => {
            showToast("Klaida atnaujinant.");
        });
    }
}

// Inicializacija užkrovus puslapį
window.onload = () => { initDates(); renderTournaments(); updateAuthUI(); };
