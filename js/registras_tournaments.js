// ==========================================
// 3. KALENDORIUS IR TURNYRAI
// ==========================================

const now = new Date(); 
const daysArr = ['S', 'P', 'A', 'T', 'K', 'P', 'Š']; 
let dynamicDates = []; 

for(let i = -3; i <= 30; i++) { 
    let d = new Date(now); d.setDate(now.getDate() + i); 
    let m = (d.getMonth() + 1).toString().padStart(2, '0'); 
    let day = d.getDate().toString().padStart(2, '0'); 
    let dateKey = `${m}-${day}`;
    dynamicDates.push({ fullDate: d, dateKey: dateKey, dayNumStr: d.getDate().toString(), dayNameStr: daysArr[d.getDay()], isToday: i === 0, isPast: i < 0 }); 
}
let activeDate = dynamicDates.find(d => d.isToday).dateKey; 

function initDates() { 
    const carousel = document.getElementById('dateCarousel');
    if(!carousel) return;
    const adminSelect = document.getElementById('newDate'); 
    carousel.innerHTML = ''; 
    if(adminSelect) adminSelect.innerHTML = '';
    
    dynamicDates.forEach(d => { 
        let activeCls = d.dateKey === activeDate ? 'active' : ''; 
        let idAttr = d.isToday ? 'id="today-date-box"' : ''; 
        let pastCls = d.isPast ? 'date-past' : '';
        carousel.innerHTML += `<div ${idAttr} class="date-box ${activeCls} ${pastCls}" onclick="selectDate('${d.dateKey}', this)"><div class="day-num">${d.dayNumStr}</div><div class="day-name">${d.dayNameStr}</div></div>`; 
        let selected = d.isToday ? 'selected' : ''; 
        if(adminSelect) adminSelect.innerHTML += `<option value="${d.dateKey}" ${selected}>${d.dayNumStr} d. (${d.dayNameStr})</option>`; 
    }); 
    
    carousel.style.userSelect = 'none';
    carousel.style.webkitUserSelect = 'none';
    carousel.style.mozUserSelect = 'none';
    carousel.style.msUserSelect = 'none';
    
    carousel.removeEventListener('wheel', handleCarouselWheel); 
    carousel.addEventListener('wheel', handleCarouselWheel, { passive: false });

    let isDown = false;
    let startX;
    let scrollLeft;

    carousel.addEventListener('mousedown', (e) => {
        isDown = true;
        carousel.style.cursor = 'grabbing';
        startX = e.pageX - carousel.offsetLeft;
        scrollLeft = carousel.scrollLeft;
    });
    carousel.addEventListener('mouseleave', () => { isDown = false; carousel.style.cursor = 'grab'; });
    carousel.addEventListener('mouseup', () => { isDown = false; carousel.style.cursor = 'grab'; });
    carousel.addEventListener('mousemove', (e) => {
        if(!isDown) return;
        e.preventDefault();
        const x = e.pageX - carousel.offsetLeft;
        const walk = (x - startX) * 2; 
        carousel.scrollLeft = scrollLeft - walk;
    });
    
    carousel.style.cursor = 'grab';

    setTimeout(() => { const todayBox = document.getElementById('today-date-box'); if(todayBox) { todayBox.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } }, 100);
}

function handleCarouselWheel(e) {
    const carousel = document.getElementById('dateCarousel');
    if (carousel && e.deltaY !== 0) {
        e.preventDefault();
        carousel.scrollLeft += e.deltaY * 1.5; 
    }
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

const defaultTournaments = [
    { id: 1, date: "05-21", timeState: 'past', format: 'Americano', level: 'D', time: '10:00 - 12:00', registered: 16, max: 16, status: 'full', isDemoWaitlist: false, waitlistCount: 0, players: ['Darius', 'Lina', 'Petras', 'Rasa'] }
];

let tournaments = []; 

let _autoArchiveDone = false;
function runBackgroundAutoArchiving(fetchedTournaments) {
    // Apsauga: archyvuojame TIK kartą per sesiją. Kitaip archyvavimo įrašas
    // sukeltų turnyrų listener'į iš naujo → renderUserProfile ciklas → mirgėjimas.
    if (_autoArchiveDone) return;
    _autoArchiveDone = true;

    let checkDate = new Date();
    let archiveThreshold = new Date();
    archiveThreshold.setDate(checkDate.getDate() - 30); 

    let toArchive = [];
    let toKeep = [];
    let isDataChanged = false;

    fetchedTournaments.forEach(t => {
        if (!t || !t.date) return;
        let [m, d] = t.date.split('-').map(Number);
        let tDate = new Date(new Date().getFullYear(), m - 1, d);

        if (tDate < archiveThreshold) {
            toArchive.push(t);
            isDataChanged = true;
        } else {
            toKeep.push(t);
        }
    });

    if (isDataChanged && toArchive.length > 0) {
        firebase.database().ref(GLOBAL_ARCHIVE_KEY).once('value').then(snap => {
            let existingArchive = snap.val() || [];
            if (!Array.isArray(existingArchive)) existingArchive = Object.values(existingArchive);
            let updatedArchive = existingArchive.concat(toArchive);
            
            firebase.database().ref(GLOBAL_ARCHIVE_KEY).set(updatedArchive).then(() => {
                firebase.database().ref(GLOBAL_TOURNAMENTS_KEY).set(toKeep);
                console.log(`[Auto-Archive] ${toArchive.length} perkelta į archyvą.`);
            });
        });
    }
}

function initTournamentsDB() {
    const list = document.getElementById('scheduleList');
    if (list) list.innerHTML = `<div style="text-align:center; padding: 30px; color: var(--text-grey);"><i class="fa-solid fa-spinner fa-spin"></i> Kraunami turnyrai...</div>`;

    firebase.database().ref(GLOBAL_TOURNAMENTS_KEY).on('value', snap => {
        let data = snap.val();
        if (data) {
            tournaments = Array.isArray(data) ? data : Object.values(data);
            tournaments = tournaments.filter(t => t !== null); 
            runBackgroundAutoArchiving(tournaments);
        } else {
            tournaments = JSON.parse(JSON.stringify(defaultTournaments));
            saveData();
        }
        
        renderTournaments();
        
        notifCheckReminders();
        const profilePage = document.getElementById('page-profile');
        if (profilePage && profilePage.classList.contains('active')) {
            // Debounce: jei listener suveikia dažnai, neperpaišom profilio kas kartą
            if (window._profileRenderTimer) clearTimeout(window._profileRenderTimer);
            window._profileRenderTimer = setTimeout(() => renderUserProfile(), 800);
        }
        
        let adminTab = document.getElementById('admin-view-turnyrai');
        if (adminTab && adminTab.style.display === 'block') {
            renderAdminTournaments();
        }
    });
}

function saveData() { 
    firebase.database().ref(GLOBAL_TOURNAMENTS_KEY).set(tournaments);
}

function resetLocalStorage() { 
    if(confirm("Ar tikrai norite atstatyti turnyrus debesyje?")) {
        tournaments = JSON.parse(JSON.stringify(defaultTournaments)); 
        saveData(); 
        showToast("Turnyrai atstatyti!"); 
    }
}

function renderTournaments() {
    const list = document.getElementById('scheduleList'); 
    if(!list) return;

    const formatFilter = document.getElementById('filterFormat')?.value || 'all'; 
    const levelFilter = document.getElementById('filterLevel')?.value || 'all'; 
    const playerFilter = (document.getElementById('filterPlayer')?.value || "").toLowerCase().trim(); 
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
        
        let displayLevel = t.level; 
        if (t.level === 'Privatus') displayLevel = 'Draugų';
        
        t.timeState = getTimeState(t.date, t.time);
        let statusHTML = ''; let timeStateBadge = ''; let cardClassModifier = '';
        
        if (t.timeState === 'past') { 
            timeStateBadge = `<div class="status-badge-time badge-past">ĮVYKO</div>`; 
            cardClassModifier = 'card-past'; 
            statusHTML = `<div class="status-indicator" style="color: var(--text-grey);"><i class="fa-solid fa-flag-checkered"></i> Turnyras baigėsi</div><button type="button" class="edit-badge" onclick="event.stopPropagation(); openOfficialResults(${t.id});" style="cursor:pointer;"><i class="fa-solid fa-list-ol"></i> Rezultatai</button>`; 
        } else if (t.timeState === 'live') { 
            timeStateBadge = `<div class="status-badge-time badge-live"><i class="fa-solid fa-circle" style="font-size: 8px;"></i> VYKSTA DABAR</div>`; 
            statusHTML = `<div class="status-indicator" style="color: var(--status-red);"><i class="fa-solid fa-tower-broadcast"></i> Tiesiogiai</div><button type="button" class="watch-badge" onclick="event.stopPropagation(); watchTournamentLive(${t.id});"><i class="fa-solid fa-play"></i> Stebėti</button>`; 
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
        
        let demoBtn = (t.isDemoWaitlist && t.status === 'waitlist' && t.timeState === 'future') ? `<button type="button" class="test-trigger" onclick="simulateSpotOpening(event, ${t.id})">[Demo] Algoritmus perleidžia vietą</button>` : ''; 
        let avatar1 = (t.players && t.players[0]) ? t.players[0].substring(0,2) : 'AŽ'; 
        let avatar2 = (t.players && t.players[1]) ? t.players[1].substring(0,2) : 'MK';
        
        let lvlClass = t.level.toLowerCase();
        if (lvlClass === 'b-/b') lvlClass = 'b';
        if (lvlClass === 'c/c+') lvlClass = 'c';
        if (lvlClass === 'd-c') lvlClass = 'd-c';

        let cardHTML = `<div class="schedule-card level-${lvlClass} ${cardClassModifier}" onclick="handleCardClick(${t.id})"><div class="card-date-square"><div class="num">${dayNum}</div><div class="name">${dayName}</div></div><div class="card-info"><div class="card-header"><div class="card-title-group"><div class="card-title">${t.format}</div><div style="display: flex; gap: 5px; flex-wrap: wrap;"><div class="level-badge">${displayLevel}</div>${t.category ? `<div class="level-badge" style="background:#64748b;">${t.category}</div>` : ''}${timeStateBadge}</div></div><button type="button" class="share-btn" onclick="shareBtn(event)"><i class="fa-solid fa-share-nodes"></i></button></div><div class="card-time">${t.time}</div><div class="avatars-row"><div class="avatar">${avatar1}</div><div class="avatar">${avatar2}</div><div class="avatar avatar-more">+${t.registered > 2 ? t.registered - 2 : 0}</div><div class="registration-count">${t.registered} / ${t.max}</div></div><div class="card-bottom">${statusHTML}${(t.status !== 'registered' && t.timeState !== 'past' && t.timeState !== 'live') ? `<button type="button" class="h2h-btn" onclick="openH2H(event)"><i class="fa-solid fa-chart-simple"></i> H2H</button>` : ''}</div></div>${demoBtn}</div>`;
        list.innerHTML += cardHTML;
    });
}

// ---------- OFICIALŪS TURNYRO REZULTATAI (pilnas ekranas + reitingas) ----------
function openOfficialResults(id) {
    const t = tournaments.find(x => String(x.id) === String(id));
    if (!t) return;
    _resultsModalShell(t);
    const body = document.getElementById('offres-body');
    if (!body) return;
    if (!t.room) { body.innerHTML = _resultsNoLinkHTML(t); return; }
    body.innerHTML = '<div style="text-align:center;color:#718096;padding:48px 16px;font-size:14px;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:26px;color:#cbd5e0;display:block;margin-bottom:14px;"></i>Kraunami rezultatai...</div>';
    if (typeof firebase === 'undefined') { body.innerHTML = '<div style="text-align:center;color:#e53e3e;padding:40px 16px;">Firebase neprieinamas.</div>'; return; }
    firebase.database().ref(DB_KEY + '/' + String(t.room).toUpperCase()).once('value')
        .then(snap => { const b = document.getElementById('offres-body'); if (b) b.innerHTML = _resultsBodyHTML(t, snap.val()); })
        .catch(() => { const b = document.getElementById('offres-body'); if (b) b.innerHTML = '<div style="text-align:center;color:#e53e3e;padding:40px 16px;">Nepavyko įkelti rezultatų.</div>'; });
}

function _resultsModalShell(t) {
    document.getElementById('offres-modal')?.remove();
    const m = document.createElement('div');
    m.id = 'offres-modal';
    m.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:6000;display:flex;flex-direction:column;';
    m.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #edf2f7;flex-shrink:0;">' +
            '<div style="display:flex;flex-direction:column;min-width:0;">' +
                '<div style="font-weight:900;font-size:17px;color:#1a202c;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(t.format) + '</div>' +
                '<div style="font-size:12px;color:#718096;font-weight:600;">' + esc(t.date) + (t.time ? ' · ' + esc(t.time) : '') + '</div>' +
            '</div>' +
            '<button type="button" onclick="document.getElementById(\'offres-modal\').remove()" style="background:#f1f5f9;border:none;width:38px;height:38px;border-radius:50%;font-size:18px;color:#1a202c;cursor:pointer;flex-shrink:0;"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div id="offres-body" style="flex:1;overflow-y:auto;padding:16px;-webkit-overflow-scrolling:touch;"></div>';
    document.body.appendChild(m);
}

function _resultsLeaderboard(matches) {
    const pts = {}, played = {};
    (matches || []).filter(m => m.finished).forEach(m => {
        const s1 = Number(m.score1) || 0, s2 = Number(m.score2) || 0;
        (m.team1 || []).forEach(p => { const n = p && p.name; if (!n) return; pts[n] = (pts[n] || 0) + s1; played[n] = (played[n] || 0) + 1; });
        (m.team2 || []).forEach(p => { const n = p && p.name; if (!n) return; pts[n] = (pts[n] || 0) + s2; played[n] = (played[n] || 0) + 1; });
    });
    return Object.keys(pts).map(n => ({ name: n, points: pts[n], played: played[n] || 0 }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

function _resultsMatchWeight(m) {
    if (m.isFinal) {
        const t = (m.finalTitle || '').toUpperCase();
        if (t.indexOf('DIDYSIS') > -1) return 10000;
        if (t.indexOf('MAŽASIS') > -1) return 9000;
        const num = t.match(/\d+/);
        if (num) return 8000 - parseInt(num[0]);
        return 5000;
    }
    return (m.round || 0) * 10;
}

function _resultsBodyHTML(t, data) {
    if (!data || !data.matches || !data.matches.some(m => m.finished)) {
        return '<div style="text-align:center;color:#718096;padding:48px 16px;font-size:14px;"><i class="fa-solid fa-hourglass-half" style="font-size:30px;color:#cbd5e0;display:block;margin-bottom:14px;"></i>Šio turnyro rezultatai dar nepaskelbti.</div>';
    }
    const lb = _resultsLeaderboard(data.matches);
    const medal = ['#d69e2e', '#a0aec0', '#cd7f32'];
    let html = '';
    if (lb.length) {
        html += '<div style="font-size:11px;font-weight:bold;color:#718096;text-transform:uppercase;letter-spacing:1px;margin:0 2px 10px;"><i class="fa-solid fa-ranking-star"></i> Galutinė lentelė</div>';
        lb.forEach((p, i) => {
            const rankBg = i < 3 ? medal[i] : '#e2e8f0';
            const rankCol = i < 3 ? '#fff' : '#718096';
            const rowBg = i === 0 ? '#fffbeb' : '#f8f9fb';
            const rowBorder = i === 0 ? '#fde68a' : '#edf2f7';
            html += '<div style="display:flex;align-items:center;gap:12px;padding:11px 12px;margin-bottom:6px;background:' + rowBg + ';border:1px solid ' + rowBorder + ';border-radius:10px;">' +
                '<div style="width:26px;height:26px;border-radius:50%;background:' + rankBg + ';color:' + rankCol + ';font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (i + 1) + '</div>' +
                '<div style="flex:1;font-weight:700;color:#1a202c;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.name) + '</div>' +
                '<div style="font-size:11px;color:#a0aec0;font-weight:600;">' + p.played + ' mač.</div>' +
                '<div style="font-weight:900;color:#2563eb;font-size:17px;min-width:34px;text-align:right;">' + p.points + '</div>' +
            '</div>';
        });
    }
    const finished = data.matches.filter(m => m.finished).slice().sort((a, b) => {
        const w = _resultsMatchWeight(b) - _resultsMatchWeight(a);
        return w !== 0 ? w : (a.court || 0) - (b.court || 0);
    });
    html += '<div style="font-size:11px;font-weight:bold;color:#718096;text-transform:uppercase;letter-spacing:1px;margin:20px 2px 10px;"><i class="fa-solid fa-table-list"></i> Mačai</div>';
    finished.forEach(m => {
        const t1 = (m.team1 || []).map(p => esc(p && p.name)).join(' / ');
        const t2 = (m.team2 || []).map(p => esc(p && p.name)).join(' / ');
        const title = m.isFinal ? esc(m.finalTitle || 'FINALAS') : ('RAUNDAS ' + (m.round || 'X') + ' · Kortas ' + (m.court || '-'));
        let bgTitle = 'background:#1a202c;';
        if (m.isFinal) {
            const tu = (m.finalTitle || '').toUpperCase();
            if (tu.indexOf('DIDYSIS') > -1) bgTitle = 'background:linear-gradient(to right,#d69e2e,#b7791f);';
            else if (tu.indexOf('MAŽASIS') > -1) bgTitle = 'background:linear-gradient(to right,#ed8936,#c05621);';
            else bgTitle = 'background:#4a5568;';
        }
        const w1 = (m.score1 > m.score2) ? 'font-weight:900;color:#2563eb;' : 'color:#1a202c;';
        const w2 = (m.score2 > m.score1) ? 'font-weight:900;color:#2563eb;' : 'color:#1a202c;';
        html += '<div style="border:1px solid #edf2f7;border-radius:10px;overflow:hidden;margin-bottom:10px;">' +
            '<div style="' + bgTitle + 'color:#fff;padding:6px 12px;font-size:10px;font-weight:bold;letter-spacing:1px;">' + title + '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;"><div style="font-size:13px;color:#1a202c;">' + t1 + '</div><div style="font-size:19px;' + w1 + '">' + (m.score1 || 0) + '</div></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#f8f9fb;"><div style="font-size:13px;color:#1a202c;">' + t2 + '</div><div style="font-size:19px;' + w2 + '">' + (m.score2 || 0) + '</div></div>' +
        '</div>';
    });
    return html;
}

function _resultsNoLinkHTML(t) {
    const isAdm = document.getElementById('adminMode')?.style.display === 'block';
    let h = '<div style="text-align:center;color:#718096;padding:40px 16px 20px;font-size:14px;"><i class="fa-solid fa-link-slash" style="font-size:30px;color:#cbd5e0;display:block;margin-bottom:14px;"></i>Šis turnyras dar nesusietas su rezultatų kambariu.</div>';
    if (isAdm) {
        h += '<div style="max-width:340px;margin:0 auto;padding:0 8px;">' +
            '<div style="font-size:12px;color:#718096;margin-bottom:8px;text-align:center;">Įveskite generatoriaus kambario ID, kuriame vyko šis turnyras:</div>' +
            '<div style="display:flex;gap:8px;">' +
                '<input type="text" id="offres-link-room" placeholder="Kambario ID" style="flex:1;padding:11px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:bold;outline:none;color:#1a202c;text-transform:uppercase;">' +
                '<button type="button" onclick="linkRoomAndShow(\'' + esc(String(t.id)) + '\')" style="padding:11px 16px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:bold;cursor:pointer;">Susieti</button>' +
            '</div></div>';
    }
    return h;
}

function linkRoomAndShow(id) {
    const val = (document.getElementById('offres-link-room')?.value || '').trim().toUpperCase();
    if (!val) { showToast('Įveskite kambario ID.'); return; }
    const t = tournaments.find(x => String(x.id) === String(id));
    if (!t) return;
    t.room = val;
    if (typeof saveData === 'function') saveData();
    showToast('Kambarys susietas.');
    openOfficialResults(id);
}

// ---------- BENDRAS OFICIALIŲ TURNYRŲ PASIRINKIMAS TRANSLIACIJAI ----------
// Naudoja ir WebRTC telefono transliacija, ir embed „Pridėti transliaciją".
let _streamPickCb = null;

function pickOfficialTournamentForStream(opts) {
    opts = opts || {};
    _streamPickCb = opts.onPick || null;
    const allowNone = opts.allowNone !== false;
    const title = opts.title || 'Pasirinkite turnyrą';
    const subtitle = opts.subtitle || 'Pasirinkite turnyrą — viskas prisikabins automatiškai.';

    const list = (typeof tournaments !== 'undefined' ? tournaments : [])
        .filter(t => t.room && getTimeState(t.date, t.time) !== 'past')
        .sort((a, b) => {
            const rank = x => (getTimeState(x.date, x.time) === 'live' ? 0 : 1);
            if (rank(a) !== rank(b)) return rank(a) - rank(b);
            return String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || ''));
        });
    _renderStreamTournamentPicker(list, title, subtitle, allowNone);
}

function _renderStreamTournamentPicker(list, title, subtitle, allowNone) {
    document.getElementById('stream-tpick-modal')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'stream-tpick-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:10010;display:flex;align-items:center;justify-content:center;padding:20px;';
    const items = list.length ? list.map(t => {
        const liveDot = getTimeState(t.date, t.time) === 'live' ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ef4444;margin-right:6px;vertical-align:middle;"></span>' : '';
        return `<button type="button" onclick="streamTournamentChosen('${esc(String(t.id))}')" style="display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;margin-bottom:8px;border:1px solid #e2e8f0;border-radius:10px;background:#f8f9fb;color:#1a202c;cursor:pointer;text-align:left;">
            <i class="fa-solid fa-trophy" style="color:#2563eb;font-size:16px;flex-shrink:0;"></i>
            <span style="flex:1;min-width:0;">
                <span style="display:block;font-weight:bold;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${liveDot}${esc(t.format)}</span>
                <span style="display:block;font-size:11px;color:#718096;">${esc(t.date)}${t.time ? ' · ' + esc(t.time) : ''} · kamb. ${esc(String(t.room))}</span>
            </span>
        </button>`;
    }).join('') : '<div style="font-size:13px;color:#718096;text-align:center;padding:14px 0;">Nėra aktualių turnyrų su kambariu.</div>';
    wrap.innerHTML = `
        <div style="background:white;border-radius:16px;padding:20px;width:100%;max-width:380px;max-height:80vh;display:flex;flex-direction:column;">
            <div style="font-weight:900;font-size:16px;color:#1a202c;margin-bottom:4px;">${title}</div>
            <div style="font-size:12px;color:#718096;margin-bottom:14px;">${subtitle}</div>
            <div style="flex:1;overflow-y:auto;margin-bottom:6px;">${items}</div>
            ${allowNone ? '<button type="button" onclick="streamTournamentChosen(null)" style="width:100%;padding:12px;margin-bottom:6px;border:none;border-radius:10px;background:#edf2f7;color:#1a202c;font-size:13px;font-weight:bold;cursor:pointer;">Be turnyro (bendra)</button>' : ''}
            <button type="button" onclick="_streamPickCancel()" style="width:100%;padding:10px;border:none;background:transparent;color:#718096;font-size:13px;font-weight:bold;cursor:pointer;">Atšaukti</button>
        </div>`;
    document.body.appendChild(wrap);
}

function streamTournamentChosen(idOrNull) {
    document.getElementById('stream-tpick-modal')?.remove();
    const cb = _streamPickCb;
    _streamPickCb = null;
    if (!cb) return;
    if (idOrNull === null || idOrNull === 'null') { cb(null, null); return; }
    const t = (typeof tournaments !== 'undefined' ? tournaments : []).find(x => String(x.id) === String(idOrNull));
    cb(t ? String(t.room) : null, t || null);
}

function _streamPickCancel() {
    document.getElementById('stream-tpick-modal')?.remove();
    _streamPickCb = null;
}

// „Stebėti" gyvai vykstantį turnyrą — atidaro LIVE langą, prisijungia prie to turnyro
// kambario ir rodo BŪTENT to turnyro transliaciją (filtruotą).
function watchTournamentLive(id) {
    const t = (typeof tournaments !== 'undefined' ? tournaments : []).find(x => String(x.id) === String(id));
    const room = (t && t.room) ? String(t.room) : null;
    if (typeof openLiveModal === 'function') openLiveModal({ stopPropagation: () => {} }, room);
    if (room) {
        const inp = document.getElementById('liveRoomInput');
        if (inp) inp.value = room;
        if (typeof connectLiveRoom === 'function') connectLiveRoom();
    }
}

// ========== PUSH PRANEŠIMAI (telefone, kai programa išjungta) ==========
// ⚠️ UŽPILDYK iš Firebase konsolės (Project settings):
//   messagingSenderId + appId → General → Your apps (Web app config)  (tas pats ir registras_auth.js, ir firebase-messaging-sw.js)
//   vapidKey → Cloud Messaging → Web Push certificates → "Key pair"
const PUSH_CFG = {
    vapidKey: "BN1uN2xhquH_gAFZaGsgTXnaLA8pX9QQD580A3liJARO8F6r7US_PRZHbWIe5nEu7ObMdWnlNIlj2l8Z5jDgN2c"
};

let _pushMsg = null, _pushInited = false;

function pushConfigReady() {
    return String(PUSH_CFG.vapidKey).indexOf('PASTE') === -1
        && typeof firebase !== 'undefined'
        && firebase.messaging
        && typeof firebase.messaging.isSupported === 'function'
        && firebase.messaging.isSupported()
        && firebase.app && firebase.app().options && !!firebase.app().options.messagingSenderId;
}

function pushInit() {
    if (_pushInited || !pushConfigReady()) return;
    try { _pushMsg = firebase.messaging(); } catch (e) { return; }
    _pushInited = true;
    _pushMsg.onMessage(payload => {
        const n = (payload && payload.notification) || {};
        if (typeof showToast === 'function') showToast((n.title ? n.title + ': ' : '') + (n.body || 'Naujas pranešimas'));
    });
}

function requestPushPermission() {
    if (!('Notification' in window)) { showToast("Šis įrenginys nepalaiko pranešimų."); return; }
    if (!pushConfigReady()) { showToast("Push dar nesukonfigūruotas."); return; }
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) { showToast("Pirmiausia prisijunkite."); return; }
    Notification.requestPermission().then(perm => {
        if (perm !== 'granted') { showToast("Pranešimai neįjungti."); return; }
        if (!_pushMsg) { try { _pushMsg = firebase.messaging(); _pushInited = true; } catch (e) { showToast("Klaida įjungiant."); return; } }
        _pushMsg.getToken({ vapidKey: PUSH_CFG.vapidKey }).then(token => {
            if (!token) { showToast("Nepavyko gauti rakto."); return; }
            const key = _pushHash(token);
            firebase.database().ref('padelio_push_tokens/' + currentUser.id + '/' + key)
                .set({ token: token, ts: Date.now(), ua: (navigator.userAgent || '').slice(0, 120) });
            showToast("✅ Telefono pranešimai įjungti!");
            document.getElementById('notif-panel')?.remove();
        }).catch(e => { showToast("Klaida: " + (e && e.message ? e.message : e)); });
    });
}

function _pushHash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return 'k' + Math.abs(h); }

function pushBannerHTML() {
    if (!pushConfigReady()) return '';
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') return '';
    return '<div style="padding:12px 14px;background:#f0f7ff;border-bottom:1px solid #dbeafe;">' +
        '<div style="font-size:12px;color:#1e40af;font-weight:bold;margin-bottom:8px;"><i class="fa-solid fa-mobile-screen"></i> Gauk svarbiausius priminimus į telefoną, net išjungus programą.</div>' +
        '<button type="button" onclick="requestPushPermission()" style="width:100%;padding:10px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:bold;cursor:pointer;">Įjungti telefono pranešimus</button>' +
        '</div>';
}

// ----- Vartotojo turnyrų indeksas (kad serveris žinotų, kam siųsti push) -----
function setUserTournament(t, status) {
    if (typeof firebase === 'undefined' || typeof currentUser === 'undefined' || !currentUser || !currentUser.id || !t) return;
    firebase.database().ref('padelio_user_tournaments/' + currentUser.id + '/' + t.id).set({
        status: status, name: currentUser.name || '', date: t.date || '', time: t.time || '', format: t.format || '', ts: Date.now()
    });
}
function clearUserTournament(tId) {
    if (typeof firebase === 'undefined' || typeof currentUser === 'undefined' || !currentUser || !currentUser.id || tId == null) return;
    firebase.database().ref('padelio_user_tournaments/' + currentUser.id + '/' + tId).remove();
}


// ========== PRANEŠIMŲ SISTEMA (varpelis) ==========
// Saugoma Firebase: padelio_notifications/{currentUser.id}/{type}_{tId}
let _notifRef = null, _notifPath = null, _notifData = {};

function notifInit() {
    if (typeof firebase === 'undefined') return;
    const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : null;
    const path = uid ? ('padelio_notifications/' + uid) : null;
    if (path === _notifPath) return; // jau klausom to paties vartotojo
    if (_notifRef) { try { _notifRef.off(); } catch (e) {} }
    _notifRef = null; _notifPath = path; _notifData = {};
    if (!path) { notifRender(); return; }
    _notifRef = firebase.database().ref(path);
    _notifRef.on('value', snap => { _notifData = snap.val() || {}; notifRender(); });
}

function notifAdd(type, tId, title, body, once) {
    if (typeof firebase === 'undefined') return;
    const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : null;
    if (!uid) return;
    const nid = (tId !== null && tId !== undefined) ? (type + '_' + tId) : (type + '_' + Date.now());
    const ref = firebase.database().ref('padelio_notifications/' + uid + '/' + nid);
    const payload = { type: type, title: title, body: body, tId: (tId !== null && tId !== undefined) ? tId : null, ts: Date.now(), read: false };
    if (once) {
        ref.once('value').then(snap => { if (!snap.exists()) ref.set(payload); }).catch(() => {});
    } else {
        ref.set(payload);
    }
}

function notifRender() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const unread = Object.keys(_notifData).filter(k => _notifData[k] && !_notifData[k].read).length;
    if (unread > 0) { badge.textContent = unread > 9 ? '9+' : String(unread); badge.classList.add('show'); }
    else { badge.classList.remove('show'); }
}

function notifMarkAllRead() {
    if (!_notifPath || typeof firebase === 'undefined') return;
    const updates = {};
    Object.keys(_notifData).forEach(k => { if (_notifData[k] && !_notifData[k].read) updates[k + '/read'] = true; });
    if (Object.keys(updates).length) firebase.database().ref(_notifPath).update(updates);
}

function notifClearAll() {
    if (!_notifPath || typeof firebase === 'undefined') return;
    firebase.database().ref(_notifPath).remove();
    _notifData = {};
    notifRender();
    document.getElementById('notif-panel')?.remove();
}

function notifTimeAgo(ts) {
    if (!ts) return '';
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'ką tik';
    if (m < 60) return 'prieš ' + m + ' min';
    const h = Math.floor(m / 60);
    if (h < 24) return 'prieš ' + h + ' val.';
    return 'prieš ' + Math.floor(h / 24) + ' d.';
}

function userIsRegistered(t) {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.name || !t || !t.players) return false;
    return t.players.some(p => String(p).split('/').some(part => part.trim().split('|')[0].trim() === currentUser.name));
}

function notifCheckReminders() {
    if (typeof currentUser === 'undefined' || !currentUser || typeof tournaments === 'undefined') return;
    const now = new Date();
    const today = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    tournaments.forEach(t => {
        if (!userIsRegistered(t)) return;
        if (t.date !== today) return;
        if (typeof getTimeState === 'function' && getTimeState(t.date, t.time) === 'past') return;
        notifAdd('reminder', t.id, 'Turnyro priminimas', 'Šiandien ' + t.time + ' — ' + t.format + '. Nepamiršk!', true);
    });
}

function openNotifications() {
    notifMarkAllRead();
    const items = Object.keys(_notifData).map(k => Object.assign({ _id: k }, _notifData[k])).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    document.getElementById('notif-panel')?.remove();
    const back = document.createElement('div');
    back.id = 'notif-panel';
    back.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,0.25);';
    back.addEventListener('click', e => { if (e.target === back) back.remove(); });
    const meta = { reg: { icon: 'fa-circle-check', col: '#00b85c' }, spot: { icon: 'fa-user-plus', col: '#e53e3e' }, reminder: { icon: 'fa-clock', col: '#2563eb' } };
    const list = items.length ? items.map(n => {
        const m = meta[n.type] || { icon: 'fa-bell', col: '#718096' };
        return '<div style="display:flex;gap:12px;padding:12px 14px;border-bottom:1px solid #f1f5f9;align-items:flex-start;background:' + (n.read ? '#fff' : '#f0f7ff') + ';">' +
            '<div style="width:34px;height:34px;border-radius:50%;background:' + m.col + '1a;color:' + m.col + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid ' + m.icon + '"></i></div>' +
            '<div style="flex:1;min-width:0;">' +
                '<div style="font-weight:bold;font-size:13px;color:#1a202c;">' + esc(n.title || '') + '</div>' +
                '<div style="font-size:12px;color:#4a5568;margin-top:2px;">' + esc(n.body || '') + '</div>' +
                '<div style="font-size:10px;color:#a0aec0;margin-top:4px;">' + notifTimeAgo(n.ts) + '</div>' +
            '</div>' +
        '</div>';
    }).join('') : '<div style="text-align:center;color:#a0aec0;font-size:13px;padding:44px 16px;"><i class="fa-regular fa-bell-slash" style="font-size:26px;display:block;margin-bottom:10px;"></i>Nėra pranešimų</div>';
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;top:62px;right:10px;width:min(360px,92vw);max-height:72vh;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.2);display:flex;flex-direction:column;overflow:hidden;';
    panel.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #edf2f7;flex-shrink:0;">' +
            '<div style="font-weight:900;font-size:15px;color:#1a202c;"><i class="fa-regular fa-bell"></i> Pranešimai</div>' +
            (items.length ? '<button type="button" onclick="notifClearAll()" style="background:none;border:none;color:#718096;font-size:12px;font-weight:bold;cursor:pointer;">Išvalyti</button>' : '') +
        '</div>' +
        pushBannerHTML() +
        '<div style="overflow-y:auto;">' + list + '</div>';
    back.appendChild(panel);
    document.body.appendChild(back);
}

function handleCardClick(id) { let t = tournaments.find(x => x.id === id); if (t.timeState === 'past') { openOfficialResults(id); return; } if (t.timeState === 'live') { watchTournamentLive(id); return; } if (t.status === 'open') { openRegisterModal(id); } else if (t.status === 'registered') { openCancelModal(id); } else if (t.status === 'waitlist') { openWaitlistCancelModal(id); } else if (t.status === 'full' && t.isDemoWaitlist) { openJoinWaitlistModal(id); } else if (t.status === 'full' && !t.isDemoWaitlist) { showToast("Šiame turnyre vietų nebėra."); } }
function shareBtn(e) { e.stopPropagation(); showToast("Nuoroda nukopijuota į iškarpinę!"); }
function openH2H(e) { e.stopPropagation(); showToast("Kraunama Head-to-Head statistika..."); }
function selectDate(dateKey, element) { document.querySelectorAll('.date-box').forEach(el => el.classList.remove('active')); element.classList.add('active'); activeDate = dateKey; let pFilter = document.getElementById('filterPlayer'); if(pFilter) pFilter.value = ''; renderTournaments(); }

// ==========================================
// REGISTRACIJOS MODALINIAI LANGAI
// ==========================================

const modal = document.getElementById('actionModal'); 
const modalTitle = document.getElementById('modalTitle'); 
const modalBody = document.getElementById('modalBody'); 
const modalActions = document.getElementById('modalActions'); 
function closeModal() { if(modal) modal.classList.remove('show'); }

// Universalus įvedimo modalas — pakeičia naršyklės prompt() langelius
function openInputModal(titleHtml, placeholder, confirmLabel, onConfirm, inputType) {
    modalTitle.innerHTML = titleHtml;
    modalBody.innerHTML = `<input id="genericModalInput" type="${inputType || 'text'}" placeholder="${placeholder}" autocomplete="off" style="width:100%; padding:14px; border:2px solid #cbd5e0; border-radius:10px; font-weight:bold; font-size:15px; outline:none; box-sizing:border-box; margin-top:8px;" />`;
    modalActions.innerHTML = `<button type="button" class="modal-btn primary" id="genericModalOk" style="width:100%; margin-bottom:8px;">${confirmLabel}</button><button type="button" class="modal-btn secondary" onclick="closeModal()" style="width:100%;">Atšaukti</button>`;
    const okBtn = document.getElementById('genericModalOk');
    const input = document.getElementById('genericModalInput');
    const submit = () => { const v = input.value; closeModal(); onConfirm(v); };
    okBtn.onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    modal.classList.add('show');
    setTimeout(() => input.focus(), 150);
}

// ==========================================
// ŽAIDĖJO PROFILIO KORTELĖ
// ==========================================

function openPlayerCard(playerId) {
    const p = (window._ratingsPool || []).find(x => String(x.id) === String(playerId));
    if (!p) return;

    let tierColor = 'var(--lvl-d)';
    if (p.tier === 'A') tierColor = 'var(--lvl-a)';
    else if (p.tier === 'B-/B') tierColor = 'var(--lvl-b)';
    else if (p.tier === 'C/C+') tierColor = 'var(--lvl-c)';
    else if (p.tier === 'C-/C') tierColor = 'var(--lvl-c2)';
    else if (p.tier === 'D/C-') tierColor = 'var(--lvl-d-c)';
    else if (p.tier === 'D-C') tierColor = 'var(--lvl-d-c)';

    const casualM = p.casual_matches || 0;
    const casualWinRate = casualM > 0 ? Math.round(((p.casual_wins || 0) / casualM) * 100) : 0;
    const lastPlayed = p.last_played ? new Date(p.last_played).toLocaleDateString('lt-LT') : '—';
    const initials = esc(p.name.substring(0, 2).toUpperCase());

    modalTitle.innerHTML = `<i class="fa-solid fa-user" style="color: var(--primary-blue);"></i> Žaidėjo kortelė`;
    modalBody.innerHTML = `
        <div style="text-align: center; padding: 10px 0;">
            <div id="playerCardAvatar" style="width: 72px; height: 72px; border-radius: 50%; background: #eff6ff; color: var(--primary-blue); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 900; border: 3px solid ${tierColor}; margin: 0 auto 12px auto; overflow: hidden;">${initials}</div>
            <div style="font-size: 18px; font-weight: 900; color: var(--text-dark);">${esc(p.name)}</div>
            <span style="background: ${tierColor}; color: white; padding: 4px 12px; border-radius: 14px; font-weight: 900; font-size: 11px; text-transform: uppercase; display: inline-block; margin-top: 6px;">${p.tier || 'D'} Lyga</span>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 18px; text-align: center;">
                <div style="background: #f8f9fb; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 9px; font-weight: bold; color: var(--text-grey); text-transform: uppercase;">ELO Reitingas</div>
                    <div style="font-size: 22px; font-weight: 900; color: ${tierColor};">${p.rating || 300}</div>
                </div>
                <div style="background: #f8f9fb; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 9px; font-weight: bold; color: var(--text-grey); text-transform: uppercase;">Oficialūs mačai</div>
                    <div style="font-size: 22px; font-weight: 900; color: var(--text-dark);">${p.total_matches || 0}</div>
                </div>
                <div style="background: #f8f9fb; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 9px; font-weight: bold; color: var(--text-grey); text-transform: uppercase;">Draugiški mačai</div>
                    <div style="font-size: 22px; font-weight: 900; color: var(--text-dark);">${casualM}</div>
                </div>
                <div style="background: #f8f9fb; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 9px; font-weight: bold; color: var(--text-grey); text-transform: uppercase;">Laimėta</div>
                    <div style="font-size: 22px; font-weight: 900; color: var(--status-green);">${casualWinRate}%</div>
                </div>
            </div>
            <div style="font-size: 11px; color: var(--text-grey); margin-top: 12px;"><i class="fa-regular fa-clock"></i> Paskutinį kartą žaidė: ${lastPlayed}</div>
        </div>
    `;
    modalActions.innerHTML = `<button type="button" class="modal-btn secondary" onclick="closeModal()" style="width: 100%;">Uždaryti</button>`;
    modal.classList.add('show');

    // Nuotrauka užkraunama fone jei yra
    if (p.hasPhoto) {
        firebase.database().ref('padelio_global_players_photos/' + p.id).once('value').then(snap => {
            const photo = snap.val();
            const av = document.getElementById('playerCardAvatar');
            if (photo && av) av.innerHTML = `<img src="${photo}" style="width:100%; height:100%; object-fit:cover;">`;
        });
    }
}

function openRegisterModal(id) { 
    if(!currentUser) { 
        pendingTournamentId = id; 
        showToast("Norėdami registruotis, pirmiausia prisijunkite!"); 
        openAuthModal(); 
        return; 
    }
    let t = tournaments.find(x => x.id === id); 
    let displayLevel = t.level; 
    if (t.level === 'Privatus') displayLevel = 'Draugų';
    modalTitle.innerHTML = `<i class="fa-solid fa-check-to-slot"></i> Turnyro Registracija`; modalBody.innerHTML = `Patvirtinkite dalyvavimą: <strong>${t.format} (${displayLevel} lygis)</strong>.<br>Laikas: ${t.time}.`; modalActions.innerHTML = `<button type="button" class="modal-btn primary" onclick="confirmRegistration(${id}, false)">Registruotis Individualiai</button><button type="button" class="modal-btn primary" onclick="confirmRegistration(${id}, true)"><i class="fa-solid fa-user-plus"></i> Pridėti Partnerį</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Atšaukti</button>`; modal.classList.add('show'); 
}

function confirmRegistration(id, withPartner) { 
    let t = tournaments.find(x => x.id === id); 
    if (!t) return;

    if (currentUser && currentUser.gender && t.category) {
        if (t.category === "Moterys" && currentUser.gender === "M") {
            if (!confirm(`⚠️ ĮSPĖJIMAS: Šis turnyras skirtas MOTERIMS, o jūsų lytis – Vyras.\n\nTęsti registraciją?`)) return;
        }
        if (t.category === "Vyrai" && currentUser.gender === "F") {
            if (!confirm(`⚠️ ĮSPĖJIMAS: Šis turnyras skirtas VYRAMS, o jūsų lytis – Moteris.\n\nTęsti registraciją?`)) return;
        }
    }

    if (withPartner) {
        selectedPartnerData = null;
        tempPartnerGender = null;
        
        modalTitle.innerHTML = `<i class="fa-solid fa-user-plus"></i> Pridėti Partnerį`;
        modalBody.innerHTML = `
            <div style="text-align: left; margin-top: 10px;">
                <label style="font-size: 11px; font-weight: 800; color: var(--text-grey); text-transform: uppercase; letter-spacing: 0.5px;">1. Telefono numeris arba Padel ID</label>
                <input type="text" id="partnerPhoneInput" oninput="handlePartnerPhoneInput(${id})" placeholder="Pvz. 37060000000" style="width: 100%; padding: 12px; border: 2px solid #cbd5e0; border-radius: 10px; font-weight: bold; margin-top: 5px; font-size: 14px; outline: none; box-sizing: border-box;" autocomplete="off" />
                
                <div id="partnerStatusMessage" style="margin-top: 8px; font-size: 12px; font-weight: bold; min-height: 18px;"></div>
                
                <div id="newPartnerFields" style="display: none; margin-top: 15px; border-top: 1px dashed #e2e8f0; padding-top: 15px;">
                    <label style="font-size: 11px; font-weight: 800; color: var(--text-grey); text-transform: uppercase; letter-spacing: 0.5px;">2. Partnerio Vardas ir Pavardė</label>
                    <input type="text" id="partnerNameInput" placeholder="Vardas Pavardė" style="width: 100%; padding: 12px; border: 2px solid #cbd5e0; border-radius: 10px; font-weight: bold; margin-top: 5px; font-size: 14px; outline: none; box-sizing: border-box;" />
                    
                    <label style="font-size: 11px; font-weight: 800; color: var(--text-grey); text-transform: uppercase; display: block; margin-top: 15px; letter-spacing: 0.5px;">3. Partnerio Lytis</label>
                    <div style="display: flex; gap: 10px; margin-top: 6px;">
                        <button type="button" id="partnerGenderM" onclick="setPartnerModalGender('M')" style="flex: 1; padding: 12px; font-weight: bold; border-radius: 10px; border: 2px solid #cbd5e0; background: #fff; color: #718096; cursor: pointer; font-size: 13px; transition: 0.2s;">Vyras (V)</button>
                        <button type="button" id="partnerGenderF" onclick="setPartnerModalGender('F')" style="flex: 1; padding: 12px; font-weight: bold; border-radius: 10px; border: 2px solid #cbd5e0; background: #fff; color: #718096; cursor: pointer; font-size: 13px; transition: 0.2s;">Moteris (M)</button>
                    </div>
                </div>
            </div>
        `;
        modalActions.innerHTML = `
            <button type="button" id="submitPartnerBtn" onclick="submitSmartPartner(${id})" class="modal-btn primary" style="width: 100%; margin-bottom: 8px; font-size: 13px; font-weight: bold; padding: 12px 0;" disabled>Suveskite duomenis...</button>
            <button type="button" class="modal-btn secondary" onclick="closeModal()" style="width: 100%; font-size: 13px; padding: 12px 0;">Atšaukti</button>
        `;
        modal.classList.add('show');
    } else {
        if (!t.players) t.players = [];
        t.status = 'registered';
        t.registered += 1;
        t.players.push(currentUser.name + '|' + (currentUser.gender || 'M'));
        saveData();
        closeModal();
        showToast("Jūs sėkmingai užregistruoti!");
        notifAdd('reg', id, 'Registracija patvirtinta', t.format + ' · ' + t.date + ' ' + t.time, false);
        setUserTournament(t, 'registered');
        renderUserProfile();
    }
}

function setPartnerModalGender(g) {
    tempPartnerGender = g;
    const btnM = document.getElementById('partnerGenderM');
    const btnF = document.getElementById('partnerGenderF');
    const submitBtn = document.getElementById('submitPartnerBtn');
    if (!btnM || !btnF) return;
    
    if (g === 'M') {
        btnM.style.background = '#eff6ff'; btnM.style.borderColor = '#2563eb'; btnM.style.color = '#2563eb';
        btnF.style.background = '#fff'; btnF.style.borderColor = '#cbd5e0'; btnF.style.color = '#718096';
    } else {
        btnM.style.background = '#fff'; btnM.style.borderColor = '#cbd5e0'; btnM.style.color = '#718096';
        btnF.style.background = '#fff5f5'; btnF.style.borderColor = '#ec4899'; btnF.style.color = '#ec4899';
    }
    
    if (submitBtn && !selectedPartnerData) {
        submitBtn.innerText = "Sukurti ir registruoti partnerį";
    }
}

function handlePartnerPhoneInput(tournamentId) {
    clearTimeout(partnerLookupTimeout);
    
    const phoneInput = document.getElementById('partnerPhoneInput');
    const msgDiv = document.getElementById('partnerStatusMessage');
    const extraFields = document.getElementById('newPartnerFields');
    const submitBtn = document.getElementById('submitPartnerBtn');
    
    if (!phoneInput || !msgDiv || !extraFields || !submitBtn) return;
    
    let inputVal = phoneInput.value.trim().toLowerCase();
    let safeId = inputVal.replace(/[^a-z0-9]/g, '');
    
    if (safeId.startsWith('86') && safeId.length === 9) safeId = '370' + safeId.substring(1);
    if (safeId.startsWith('06') && safeId.length === 9) safeId = '370' + safeId.substring(1);
    
    if (safeId === currentUser.id) {
        msgDiv.innerHTML = `<span style="color: var(--status-red);"><i class="fa-solid fa-triangle-exclamation"></i> Negalite pridėti savęs kaip partnerio!</span>`;
        extraFields.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.innerText = "Klaida...";
        return;
    }
    
    if (safeId.length < 7) {
        msgDiv.innerText = "";
        extraFields.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.innerText = "Suveskite duomenis...";
        selectedPartnerData = null;
        return;
    }
    
    msgDiv.innerHTML = `<span style="color: var(--status-orange);"><i class="fa-solid fa-spinner fa-spin"></i> Tikrinama bazė...</span>`;
    
    partnerLookupTimeout = setTimeout(() => {
        firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + safeId).once('value').then(snap => {
            let pData = snap.val();
            if (pData) {
                selectedPartnerData = pData;
                msgDiv.innerHTML = `<span style="color: var(--status-green);"><i class="fa-solid fa-circle-check"></i> Žaidėjas rastas: <strong>${esc(pData.name)}</strong> (${pData.gender === 'F' ? 'M' : 'V'})</span>`;
                extraFields.style.display = 'none';
                submitBtn.disabled = false;
                submitBtn.innerText = `Registruoti su ${pData.name.split(' ')[0]}`;
            } else {
                selectedPartnerData = null;
                msgDiv.innerHTML = `<span style="color: #4a5568;"><i class="fa-solid fa-user-plus"></i> Naujas žaidėjas (nerastas DB). Užpildykite:</span>`;
                extraFields.style.display = 'block';
                
                tempPartnerGender = null;
                document.getElementById('partnerGenderM').style.background = '#fff';
                document.getElementById('partnerGenderM').style.borderColor = '#cbd5e0';
                document.getElementById('partnerGenderM').style.color = '#718096';
                document.getElementById('partnerGenderF').style.background = '#fff';
                document.getElementById('partnerGenderF').style.borderColor = '#cbd5e0';
                document.getElementById('partnerGenderF').style.color = '#718096';
                
                submitBtn.disabled = false;
                submitBtn.innerText = "Pasirinkite lytį...";
            }
        });
    }, 400);
}

function submitSmartPartner(tournamentId) {
    let t = tournaments.find(x => x.id === tournamentId);
    if (!t) return;
    
    const phoneInput = document.getElementById('partnerPhoneInput');
    if (!phoneInput) return;
    
    let inputVal = phoneInput.value.trim().toLowerCase();
    let safeId = inputVal.replace(/[^a-z0-9]/g, '');
    if (safeId.startsWith('86') && safeId.length === 9) safeId = '370' + safeId.substring(1);
    if (safeId.startsWith('06') && safeId.length === 9) safeId = '370' + safeId.substring(1);

    if (selectedPartnerData) {
        completePairRegistration(t, currentUser.name, selectedPartnerData.name, currentUser.gender, selectedPartnerData.gender);
    } else {
        const nameInput = document.getElementById('partnerNameInput');
        let pName = nameInput ? nameInput.value.trim() : "";
        if (!pName) { alert("Įveskite partnerio vardą ir pavardę!"); return; }
        
        if (!tempPartnerGender) { 
            alert("KLAIDA: Prašome pasirinkti partnerio lytį (V arba M)!"); 
            return; 
        }
        
        let newPartnerUser = { 
            id: safeId, 
            name: pName, 
            gender: tempPartnerGender, 
            rating: 300, 
            tier: "D", 
            total_matches: 0, 
            last_played: Date.now() 
        };
        
        document.getElementById('submitPartnerBtn').disabled = true;
        document.getElementById('submitPartnerBtn').innerText = "Saugoma...";
        
        firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + safeId).set(newPartnerUser).then(() => {
            completePairRegistration(t, currentUser.name, newPartnerUser.name, currentUser.gender, newPartnerUser.gender);
        });
    }
}

function completePairRegistration(tournament, player1, player2, gender1, gender2) {
    if (!tournament.players) tournament.players = [];
    tournament.status = 'registered';
    tournament.registered += 2;
    const p1 = player1 + '|' + (gender1 || 'M');
    const p2 = player2 + '|' + (gender2 || 'M');
    tournament.players.push(`${p1} / ${p2}`);
    saveData();
    closeModal();
    showToast(`Sėkmingai užregistruota pora: ${player1} ir ${player2}!`);
    notifAdd('reg', tournament.id, 'Registracija patvirtinta (pora)', tournament.format + ' · ' + tournament.date + ' ' + tournament.time, false);
    setUserTournament(tournament, 'registered');
    renderUserProfile();
}

function openJoinWaitlistModal(id) { let t = tournaments.find(x => x.id === id); modalTitle.innerHTML = `<i class="fa-solid fa-hourglass-half" style="color: var(--status-orange);"></i> Registracija į Rezervą`; modalBody.innerHTML = `Šiuo metu vietų nėra. Stoti į eilę?`; modalActions.innerHTML = `<button type="button" class="modal-btn primary" onclick="confirmWaitlist(${id})">Taip</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Ne</button>`; modal.classList.add('show'); }
function confirmWaitlist(id) { let t = tournaments.find(x => x.id === id); t.status = 'waitlist'; t.waitlistCount += 1; saveData(); setUserTournament(t, 'waitlist'); closeModal(); showToast("Pridėta į rezervą."); }
function openCancelModal(id) { modalTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: var(--status-red);"></i> Atšaukti Dalyvavimą`; modalBody.innerHTML = `Ar tikrai norite atšaukti savo vietą?`; modalActions.innerHTML = `<button type="button" class="modal-btn danger" onclick="confirmCancel(${id})">Taip, atšaukti</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Ne</button>`; modal.classList.add('show'); }

function confirmCancel(id) { 
    let t = tournaments.find(x => x.id === id); 
    if(!t) return;

    let pName = currentUser ? currentUser.name : "Jūs"; 
    if(t.players) {
        let teamIndex = t.players.findIndex(p => p.toLowerCase().includes(pName.toLowerCase()));
        if(teamIndex !== -1) {
            let teamStr = t.players[teamIndex];
            if(teamStr.includes('/')) { t.registered -= 2; } else { t.registered -= 1; }
            t.players.splice(teamIndex, 1); 
        }
    }
    t.status = 'open';
    saveData(); 
    closeModal(); 
    clearUserTournament(id); showToast("Registracija sėkmingai atšauktą."); 
    renderUserProfile();
}

function openWaitlistCancelModal(id) { let t = tournaments.find(x => x.id === id); modalTitle.innerHTML = `Palikti rezervą?`; modalBody.innerHTML = `Išeiti iš eilės?`; modalActions.innerHTML = `<button type="button" class="modal-btn danger" onclick="confirmWaitlistCancel(${id})">Išeiti</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Pasilikti</button>`; modal.classList.add('show'); }
function confirmWaitlistCancel(id) { let t = tournaments.find(x => x.id === id); t.status = 'full'; t.waitlistCount -= 1; saveData(); clearUserTournament(id); closeModal(); showToast("Išbraukta iš rezervo."); }

let currentPushId = null; 
function simulateSpotOpening(e, id) { 
    e.stopPropagation(); currentPushId = id; let t = tournaments.find(x => x.id === id); t.status = 'registered'; t.registered += 1; t.waitlistCount -= 1; saveData(); 
    let pushFormat = document.getElementById('pushFormatName'); if(pushFormat) pushFormat.innerText = `${t.format}`;
    notifAdd('spot', id, 'Atsilaisvino vieta!', t.format + ' · ' + t.date + ' ' + t.time + ' — vieta jūsų!', false); setUserTournament(t, 'registered'); 
    let pushContainer = document.getElementById('pushNotification'); if(pushContainer) pushContainer.style.top = '20px'; 
    setTimeout(() => { if(pushContainer) pushContainer.style.top = '-100px'; }, 8000); 
}
function closePush() { let p = document.getElementById('pushNotification'); if(p) p.style.top = '-100px'; } 
function manageReservation() { closePush(); openCancelModal(currentPushId); } 
function showToast(text) { const toast = document.getElementById('toastMsg'); if(!toast) return; toast.innerText = text; toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 3000); }

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
        else if (leagueLevel === 'D/C-') spinner.style.color = 'var(--lvl-d-c)';
        else if (leagueLevel === 'C-/C') spinner.style.color = 'var(--lvl-c2)';
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
        let mappedPool = dataPool.map(p => ({ id: p.id, name: p.name, points: p.rating || 0 }));
        window._ratingsPool = dataPool;

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
                tbody.innerHTML += `<tr onclick="openPlayerCard('${esc(player.id)}')" style="cursor: pointer;" onmouseover="this.style.backgroundColor='#f8f9fb'" onmouseout="this.style.backgroundColor='transparent'"><td style="text-align: center; ${rankClass}">${rankNum}</td><td>${esc(player.name)} <i class="fa-solid fa-chevron-right" style="font-size: 9px; color: #cbd5e0; margin-left: 4px;"></i></td><td style="color: ${ptsColor}; font-weight: bold; text-align: right;">${player.points}</td></tr>`;
            });
        }

        if(rLoader) rLoader.style.display = 'none'; 
        if(rContent) rContent.style.display = 'block';
    }).catch(err => { console.error(err); });
}

// ==========================================
// NAVIGACIJA IR SKIRTUKAI
// ==========================================

function switchTab(pageId, element) { 
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active')); if(element) element.classList.add('active'); 
    document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active')); const page = document.getElementById(pageId); if(page) page.classList.add('active'); 
    
    if(pageId === 'page-cam') { 
        let mH = document.getElementById('mainHeader'); if(mH) mH.style.display = 'none'; 
        startCamera(); 
    } else { 
        let mH = document.getElementById('mainHeader'); if(mH) mH.style.display = 'flex'; 
        stopCamera(); 
    }
    if(pageId === 'page-trophy') { 
        document.querySelectorAll('.league-tab').forEach(el => el.classList.remove('active')); 
        let lTab = document.querySelector('.league-tab[data-league="all"]');
        if(lTab) lTab.classList.add('active'); 
        loadAutomatedRatings('all'); 
    }
    if(pageId === 'page-profile') { 
        renderUserProfile(); 
        if (typeof refreshCurrentUserFromFirebase === 'function') refreshCurrentUserFromFirebase();
    }
}
function goToHome() { const cal = document.getElementById('page-calendar'); if (cal && cal.classList.contains('active')) return; const calendarBtn = document.querySelector('[data-index="1"]'); if(calendarBtn) switchTab('page-calendar', calendarBtn); }
