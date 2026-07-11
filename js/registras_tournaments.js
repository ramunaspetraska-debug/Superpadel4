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
        // Admin formos „Pirmojo turnyro diena" — tik nuo šiandienos (praėjusios dienos
        // reikalingos tik kalendoriaus karuselei, ne naujo turnyro kūrimui).
        if(adminSelect && !d.isPast) adminSelect.innerHTML += `<option value="${d.dateKey}" ${selected}>${d.dayNumStr} d. (${d.dayNameStr})</option>`;
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
    // Archyvuoti gali tik prisijungęs vartotojas (DB taisyklės reikalauja auth rašymui).
    // Anonimas praleidžiamas be žymos — archyvavimą atliks pirmas prisijungęs lankytojas.
    if (typeof authAvailable !== 'function' || !authAvailable() || !firebase.auth().currentUser) return;
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
        // MM-DD be metų: jei data atrodo toli ateityje (>60 d.), tai praėjusių metų turnyras
        // (pvz. gruodžio turnyras žiūrint sausį) — kitaip jis niekada nebūtų archyvuojamas.
        if (tDate.getTime() > Date.now() + 60 * 864e5) tDate.setFullYear(tDate.getFullYear() - 1);

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

    // Push: tylus tokeno atnaujinimas kaskart atidarius portalą (jei leidimas jau suteiktas).
    // Vėlinam 2.5s, kad pirmiausia užsikrautų prisijungimas (currentUser) ir Firebase.
    setTimeout(() => { try { pushSilentRefresh(); } catch(e) {} }, 2500);

    firebase.database().ref(GLOBAL_TOURNAMENTS_KEY).on('value', snap => {
        let data = snap.val();
        if (data) {
            tournaments = Array.isArray(data) ? data : Object.values(data);
            tournaments = tournaments.filter(t => t !== null); 
            runBackgroundAutoArchiving(tournaments);
        } else {
            // DB tuščia — rodome pavyzdinį sąrašą tik lokaliai (nerašome: anonimas neturi rašymo teisės)
            tournaments = JSON.parse(JSON.stringify(defaultTournaments));
        }
        
        renderTournaments();

        userTournamentsInit();
        userClubsInit();
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
    return firebase.database().ref(GLOBAL_TOURNAMENTS_KEY).set(tournaments)
        .then(() => true)
        .catch(err => {
            console.error('saveData klaida:', err);
            const denied = String((err && err.message) || err).toUpperCase().indexOf('PERMISSION') !== -1;
            showToast(denied ? '🔒 Veiksmui reikia prisijungti — prisijunkite el. paštu ir bandykite vėl.' : '❌ Nepavyko išsaugoti į debesį! Patikrinkite ryšį.');
            return false;
        });
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

    // Dalinimosi nuoroda (?t=ID): atsidarius, kalendorius peršoka į to turnyro dieną
    if (window._pendingShareTid !== undefined && Array.isArray(tournaments) && tournaments.length) {
        const shared = tournaments.find(x => String(x.id) === String(window._pendingShareTid));
        window._pendingShareTid = undefined;
        if (shared) {
            activeDate = shared.date;
            if (typeof initDates === 'function') initDates();
            const navBtn = document.querySelector('.nav-item[onclick*="page-calendar"]');
            if (typeof switchTab === 'function' && navBtn) switchTab('page-calendar', navBtn);
        }
    }

    const formatFilter = document.getElementById('filterFormat')?.value || 'all';
    const levelFilter = document.getElementById('filterLevel')?.value || 'all';
    const playerFilter = (document.getElementById('filterPlayer')?.value || "").toLowerCase().trim();
    const clubFilter = document.getElementById('filterClub')?.value || 'all';
    updateClubFilterOptions();
    list.innerHTML = '';

    let filtered = tournaments.filter(t => {
        let matchDate = (t.date === activeDate);
        let matchFormat = (formatFilter === 'all' || t.format === formatFilter);
        let matchLevel = (levelFilter === 'all' || t.level === levelFilter);
        let matchClub = clubFilter === 'all' || (clubFilter === 'mine' ? !!(t.clubId && myClubs[t.clubId]) : t.clubId === clubFilter);
        let matchPlayer = true;
        if (playerFilter !== '') {
            if (t.players && Array.isArray(t.players)) {
                matchPlayer = t.players.some(p => p.toLowerCase().includes(playerFilter));
            } else { matchPlayer = false; }
        }
        return matchDate && matchFormat && matchLevel && matchClub && matchPlayer;
    });
    
    if(filtered.length === 0) { 
        list.innerHTML = `<div style="text-align:center; padding: 30px; color: var(--text-grey);">Pagal šiuos filtrus turnyrų nerasta.</div>`; 
        return; 
    }
    
    // Kortelės kaupiamos į eilutę ir įterpiamos VIENU kartu — innerHTML += cikle
    // priverčia naršyklę perkurti visą sąrašą po kiekvienos kortelės (kvadratinis lėtėjimas)
    let cardsHtml = '';
    filtered.forEach(t => {
        let dayObj = dynamicDates.find(d => d.dateKey === t.date);
        let dayName = dayObj ? dayObj.dayNameStr : 'D'; 
        let dayNum = dayObj ? dayObj.dayNumStr : t.date; 
        
        let displayLevel = t.level; 
        if (t.level === 'Privatus') displayLevel = 'Draugų';
        
        t.timeState = getTimeState(t.date, t.time);
        const persStatus = effectiveStatusFor(t); // asmeninė būsena (ne bendras t.status laukas)
        let statusHTML = ''; let timeStateBadge = ''; let cardClassModifier = '';

        if (t.timeState === 'past') {
            timeStateBadge = `<div class="status-badge-time badge-past">ĮVYKO</div>`;
            cardClassModifier = 'card-past';
            statusHTML = `<div class="status-indicator" style="color: var(--text-grey);"><i class="fa-solid fa-flag-checkered"></i> Turnyras baigėsi</div><button type="button" class="edit-badge" onclick="event.stopPropagation(); openOfficialResults(${t.id});" style="cursor:pointer;"><i class="fa-solid fa-list-ol"></i> Rezultatai</button>`;
        } else if (t.timeState === 'live') {
            timeStateBadge = `<div class="status-badge-time badge-live"><i class="fa-solid fa-circle" style="font-size: 8px;"></i> VYKSTA DABAR</div>`;
            statusHTML = `<div class="status-indicator" style="color: var(--status-red);"><i class="fa-solid fa-tower-broadcast"></i> Tiesiogiai</div><button type="button" class="watch-badge" onclick="event.stopPropagation(); watchTournamentLive(${t.id});"><i class="fa-solid fa-play"></i> Stebėti</button>`;
        } else {
            if (persStatus === 'registered') {
                const payPend = paymentPendingFor(t);
                if (payPend && payPend.method === 'cash') {
                    statusHTML = `<div class="status-indicator status-in"><i class="fa-solid fa-check"></i> Dalyvaujate</div><button type="button" class="edit-badge" onclick="event.stopPropagation(); openPaymentInstructions(${Number(t.id)});" style="cursor:pointer; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">💵 ${payPend.amount} € vietoje</button>`;
                } else if (payPend && payPend.claimed) {
                    statusHTML = `<div class="status-indicator" style="color:#1d4ed8;"><i class="fa-solid fa-circle-check"></i> Laukia patvirtinimo</div><button type="button" class="edit-badge" onclick="event.stopPropagation(); openPaymentInstructions(${Number(t.id)});" style="cursor:pointer; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;"><i class="fa-solid fa-euro-sign"></i> Apmokėta?</button>`;
                } else if (payPend) {
                    statusHTML = `<div class="status-indicator" style="color:#b45309;"><i class="fa-solid fa-hourglass-half"></i> Laukia apmokėjimo</div><button type="button" class="edit-badge" onclick="event.stopPropagation(); openPaymentInstructions(${Number(t.id)});" style="cursor:pointer; background:#fffbeb; color:#92400e; border:1px solid #fde68a;"><i class="fa-solid fa-euro-sign"></i> ${payPend.amount} € apmokėti</button>`;
                } else {
                    statusHTML = `<div class="status-indicator status-in"><i class="fa-solid fa-check"></i> Dalyvaujate${t.paid ? ' · apmokėta' : ''}</div><div class="edit-badge"><i class="fa-solid fa-pen"></i> Keisti</div>`;
                }
            } else if (persStatus === 'waitlist') {
                const myPos = userWaitlistPosition(t);
                const posTxt = myPos > 0 ? `Jūs ${myPos}-as eilėje` : `eilėje ${t.waitlistCount || 1}`;
                statusHTML = `<div class="status-indicator status-wait"><i class="fa-solid fa-hourglass-half"></i> Rezervas (${posTxt})</div><div class="edit-badge"><i class="fa-solid fa-pen"></i> Keisti</div>`;
            } else if (persStatus === 'closed') {
                statusHTML = `<div class="status-indicator status-full"><i class="fa-solid fa-lock"></i> Registracija baigta</div><div class="edit-badge"><i class="fa-solid fa-hourglass-half"></i> Į rezervą</div>`;
            } else if (persStatus === 'open') {
                const closeAt = regCloseTimeStr(t);
                statusHTML = `<div class="status-indicator status-open"><i class="fa-regular fa-circle-check"></i> Laisva${closeAt ? ` <span style="font-weight:600;color:var(--text-grey);font-size:11px;">· iki ${closeAt}</span>` : ''}</div>`;
            } else if (persStatus === 'full' && !t.isDemoWaitlist) {
                statusHTML = `<div class="status-indicator status-full">Vietų nėra</div>`;
            } else if (persStatus === 'full' && t.isDemoWaitlist) {
                statusHTML = `<div class="status-indicator status-wait"><i class="fa-solid fa-plus"></i> Stoti į eilę (${t.waitlistCount})</div>`;
            }
        }

        let demoBtn = (t.isDemoWaitlist && persStatus === 'waitlist' && t.timeState === 'future') ? `<button type="button" class="test-trigger" onclick="simulateSpotOpening(event, ${t.id})">[Demo] Algoritmus perleidžia vietą</button>` : '';
        let avatar1 = (t.players && t.players[0]) ? esc(String(t.players[0]).substring(0,2)) : 'AŽ';
        let avatar2 = (t.players && t.players[1]) ? esc(String(t.players[1]).substring(0,2)) : 'MK';
        
        let lvlClass = t.level.toLowerCase();
        if (lvlClass === 'b-/b') lvlClass = 'b';
        if (lvlClass === 'c/c+') lvlClass = 'c';
        if (lvlClass === 'c-/c') lvlClass = 'c2';
        if (lvlClass === 'd/c-' || lvlClass === 'd-c') lvlClass = 'd-c';

        let cardHTML = `<div class="schedule-card level-${lvlClass} ${cardClassModifier}" onclick="handleCardClick(${Number(t.id)})"><div class="card-date-square"><div class="num">${esc(dayNum)}</div><div class="name">${esc(dayName)}</div></div><div class="card-info"><div class="card-header"><div class="card-title-group"><div class="card-title">${esc(t.format)}</div><div style="display: flex; gap: 5px; flex-wrap: wrap;"><div class="level-badge">${esc(displayLevel)}</div>${t.category ? `<div class="level-badge" style="background:#64748b;">${esc(t.category)}</div>` : ''}${t.clubName ? `<div class="level-badge" style="background:#0f766e;"><i class="fa-solid fa-building" style="font-size:8px;"></i> ${esc(t.clubName)}</div>` : ''}${timeStateBadge}</div></div><button type="button" class="share-btn" onclick="shareBtn(event, ${Number(t.id)})"><i class="fa-solid fa-share-nodes"></i></button></div><div class="card-time">${esc(t.time)}</div><div class="avatars-row"><div class="avatar">${avatar1}</div><div class="avatar">${avatar2}</div><div class="avatar avatar-more">+${t.registered > 2 ? t.registered - 2 : 0}</div><div class="registration-count">${(t.max || 0) > 0 ? `${t.registered} / ${t.max}` : `${t.registered} dalyv.`}</div></div><div class="card-bottom">${statusHTML}${(persStatus !== 'registered' && t.timeState !== 'past' && t.timeState !== 'live') ? `<button type="button" class="h2h-btn" onclick="openH2H(event)"><i class="fa-solid fa-chart-simple"></i> H2H</button>` : ''}</div></div>${demoBtn}</div>`;
        cardsHtml += cardHTML;
    });
    list.innerHTML = cardsHtml;
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

// Lentelė rikiuojama TAIP PAT kaip generatoriuje (logic.js calculateResults):
// 'points' → pagal taškų sumą (sw), 'wins' → pagal lygos taškus (2 už pergalę, 1 už lygiąsias);
// abiem atvejais antras kriterijus — taškų skirtumas. Kitaip portalo eiliškumas skirtųsi nuo generatoriaus.
function _resultsLeaderboard(matches, rankingMode) {
    const stats = {};
    (matches || []).filter(m => m && m.finished).forEach(m => {
        const s1 = Number(m.score1) || 0, s2 = Number(m.score2) || 0;
        const upd = (team, my, en) => (team || []).forEach(p => {
            const n = p && p.name; if (!n) return;
            const s = stats[n] || (stats[n] = { name: n, points: 0, played: 0, w: 0, t: 0, l: 0, dif: 0, lp: 0 });
            s.points += my; s.dif += my - en; s.played++;
            if (my > en) { s.w++; s.lp += 2; } else if (my < en) { s.l++; } else { s.t++; s.lp += 1; }
        });
        upd(m.team1, s1, s2); upd(m.team2, s2, s1);
    });
    const arr = Object.values(stats);
    if (rankingMode === 'wins') arr.sort((a, b) => b.lp - a.lp || b.dif - a.dif || a.name.localeCompare(b.name));
    else arr.sort((a, b) => b.points - a.points || b.dif - a.dif || a.name.localeCompare(b.name));
    return arr;
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
    const rankingMode = (data.settings && data.settings.rankingMode) || 'points';
    const lb = _resultsLeaderboard(data.matches, rankingMode);
    const medal = ['#d69e2e', '#a0aec0', '#cd7f32'];
    let html = '';
    if (lb.length) {
        const modeLabel = rankingMode === 'wins' ? ' (pagal pergales)' : '';
        html += '<div style="font-size:11px;font-weight:bold;color:#718096;text-transform:uppercase;letter-spacing:1px;margin:0 2px 10px;"><i class="fa-solid fa-ranking-star"></i> Galutinė lentelė' + modeLabel + '</div>';
        lb.forEach((p, i) => {
            const rankBg = i < 3 ? medal[i] : '#e2e8f0';
            const rankCol = i < 3 ? '#fff' : '#718096';
            const rowBg = i === 0 ? '#fffbeb' : '#f8f9fb';
            const rowBorder = i === 0 ? '#fde68a' : '#edf2f7';
            const mainVal = rankingMode === 'wins' ? p.lp : p.points;
            html += '<div style="display:flex;align-items:center;gap:12px;padding:11px 12px;margin-bottom:6px;background:' + rowBg + ';border:1px solid ' + rowBorder + ';border-radius:10px;">' +
                '<div style="width:26px;height:26px;border-radius:50%;background:' + rankBg + ';color:' + rankCol + ';font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (i + 1) + '</div>' +
                '<div style="flex:1;font-weight:700;color:#1a202c;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.name) + '</div>' +
                '<div style="font-size:11px;color:#a0aec0;font-weight:600;">' + p.played + ' mač. · ' + p.w + ' perg.</div>' +
                '<div style="font-weight:900;color:#2563eb;font-size:17px;min-width:34px;text-align:right;">' + mainVal + '</div>' +
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
    // Susieti gali tik turnyrą valdantis klubo administratorius
    if (typeof currentClub === 'undefined' || !currentClub || (typeof canManageTournament === 'function' && !canManageTournament(t))) {
        showToast('🔒 Susieti gali tik šio turnyro klubo administratorius.'); return;
    }
    const doLink = () => { t.room = val; if (typeof saveData === 'function') saveData(); showToast('Kambarys susietas.'); openOfficialResults(id); };
    // Kambarys pažymimas klubo nuosavybe; jei jis jau priklauso kitam klubui — nesusiejame
    if (typeof claimRoomForClub === 'function') {
        claimRoomForClub(val).then(ok => { if (ok) doLink(); else showToast('🔒 Šis kambarys priklauso kitam klubui — pasirinkite kitą.'); });
    } else { doLink(); }
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

// Laukia Firebase Auth sesijos atstatymo (be jos DB atmes rakto įrašymą,
// nes padelio_push_tokens rašyti gali tik autentifikuotas savininkas)
function pushAuthReady() {
    try {
        const u = firebase.auth().currentUser;
        if (u) return Promise.resolve(u);
        return new Promise(resolve => {
            let done = false;
            const finish = (usr) => { if (!done) { done = true; resolve(usr || firebase.auth().currentUser); } };
            const off = firebase.auth().onAuthStateChanged(usr => { try { off(); } catch (e) {} finish(usr); });
            setTimeout(() => finish(null), 6000);
        });
    } catch (e) { return Promise.resolve(null); }
}

function requestPushPermission() {
    if (!('Notification' in window)) { showToast("Šis įrenginys nepalaiko pranešimų."); return; }
    if (!pushConfigReady()) { showToast("Push dar nesukonfigūruotas."); return; }
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) { showToast("Pirmiausia prisijunkite."); return; }
    Notification.requestPermission().then(perm => {
        if (perm !== 'granted') { showToast("Pranešimai neįjungti."); return; }
        if (!_pushMsg) { try { _pushMsg = firebase.messaging(); _pushInited = true; } catch (e) { showToast("Klaida įjungiant."); return; } }
        Promise.all([
            navigator.serviceWorker.ready.then(swReg => _pushMsg.getToken({ vapidKey: PUSH_CFG.vapidKey, serviceWorkerRegistration: swReg })),
            pushAuthReady()
        ]).then(([token, authUser]) => {
            if (!token) { showToast("Nepavyko gauti rakto."); return; }
            if (!authUser) {
                // Auth sesija pasibaigusi — raktas nebūtų įrašytas. Prašom prisijungti iš naujo.
                showToast("Prisijungimo sesija pasibaigusi — prisijunkite iš naujo ir bandykite dar kartą.");
                openAuthModal();
                return;
            }
            const key = _pushHash(token);
            firebase.database().ref('padelio_push_tokens/' + currentUser.id + '/' + key)
                .set({ token: token, ts: Date.now(), ua: (navigator.userAgent || '').slice(0, 120) })
                .then(() => {
                    showToast("✅ Telefono pranešimai įjungti!");
                    document.getElementById('notif-panel')?.remove();
                })
                .catch(e => {
                    // Raktas NEĮRAŠYTAS — anksčiau ši klaida buvo nuryjama tyliai ir
                    // vartotojas matydavo „įjungta", nors serveris neturėjo kam siųsti.
                    showToast("❌ Nepavyko užregistruoti įrenginio: " + ((e && e.message) || 'nėra teisių') + ". Prisijunkite iš naujo.");
                });
        }).catch(e => { showToast("Klaida: " + (e && e.message ? e.message : e)); });
    });
}

function _pushHash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return 'k' + Math.abs(h); }

function pushBannerHTML() {
    if (!pushConfigReady()) return '';
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        return '<div style="padding:9px 14px;background:#f0fdf4;border-bottom:1px solid #dcfce7;font-size:11px;color:#15803d;font-weight:bold;">' +
            '<i class="fa-solid fa-circle-check"></i> Telefono pranešimai įjungti' +
            '</div>';
    }
    return '<div style="padding:12px 14px;background:#f0f7ff;border-bottom:1px solid #dbeafe;">' +
        '<div style="font-size:12px;color:#1e40af;font-weight:bold;margin-bottom:8px;"><i class="fa-solid fa-mobile-screen"></i> Gauk svarbiausius priminimus į telefoną, net išjungus programą.</div>' +
        '<button type="button" onclick="requestPushPermission()" style="width:100%;padding:10px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:bold;cursor:pointer;">Įjungti telefono pranešimus</button>' +
        '</div>';
}

// Tylus tokeno atnaujinimas: jei leidimas JAU suteiktas, kaskart atidarius portalą
// prisijungusiam vartotojui tokenas gaunamas iš naujo ir įrašomas į padelio_push_tokens.
// Tai būtina, nes: 1) leidimas galėjo būti suteiktas senai versijai (be tokeno saugojimo),
// 2) FCM tokenai laikui bėgant keičiasi. Jokių dialogų — viskas fone.
function pushSilentRefresh() {
    try {
        // Tyli versija: jokių dialogų ar toast'ų — tik console.log diagnostikai
        const say = (m) => { try { console.log('[PUSH] ' + m); } catch(e) {} };
        if (!('Notification' in window)) { say('įrenginys nepalaiko Notification'); return; }
        if (Notification.permission !== 'granted') { say('leidimas: ' + Notification.permission); return; }
        if (String(PUSH_CFG.vapidKey).indexOf('PASTE') !== -1) { say('vapidKey neįrašytas'); return; }
        if (typeof firebase === 'undefined' || !firebase.messaging) { say('firebase.messaging biblioteka neįkelta'); return; }
        if (typeof firebase.messaging.isSupported === 'function' && !firebase.messaging.isSupported()) { say('naršyklė nepalaiko FCM'); return; }
        if (!firebase.app || !firebase.app().options || !firebase.app().options.messagingSenderId) { say('config be messagingSenderId'); return; }
        if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) { say('neprisijungęs (currentUser nėra)'); return; }
        pushInit();
        if (!_pushMsg) { say('messaging init nepavyko'); return; }
        Promise.all([
            navigator.serviceWorker.ready.then(swReg => _pushMsg.getToken({ vapidKey: PUSH_CFG.vapidKey, serviceWorkerRegistration: swReg })),
            pushAuthReady() // be auth sesijos DB atmestų įrašymą — palaukiam atstatymo
        ]).then(([token, authUser]) => {
            if (!token) { say('tokenas tuščias'); return; }
            if (!authUser) { say('auth sesijos nėra — tokenas neįrašytas (prisijunkite portale iš naujo)'); return; }
            const key = _pushHash(token);
            firebase.database().ref('padelio_push_tokens/' + currentUser.id + '/' + key)
                .set({ token: token, ts: Date.now(), ua: (navigator.userAgent || '').slice(0, 120) })
                .then(() => { say('tokenas atnaujintas'); })
                .catch(err => { say('DB įrašymo klaida: ' + (err && err.message ? err.message : err)); });
        }).catch(err => { say('getToken klaida: ' + (err && err.message ? err.message : err)); });
    } catch (e) { try { console.log('[PUSH] klaida: ' + (e && e.message ? e.message : e)); } catch(x) {} }
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

// ----- ASMENINĖ turnyro būsena -----
// SVARBU: t.status laukas DB yra bendras visiems vartotojams (istorinis) — juo remtis rodyme
// negalima, nes vienam užsiregistravus visi matytų „Dalyvaujate". Asmeninę būseną vedam iš
// players sąrašo (mano vardas) ir savo padelio_user_tournaments įrašo (rezervo eilė).
let userTournamentStatus = {};
let _utRef = null, _utUid = null;
function userTournamentsInit() {
    if (typeof firebase === 'undefined') return;
    const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : null;
    if (uid === _utUid) return; // jau klausom šio vartotojo
    if (_utRef) { try { _utRef.off(); } catch (e) {} }
    _utRef = null; _utUid = uid; userTournamentStatus = {};
    if (!uid) return;
    _utRef = firebase.database().ref('padelio_user_tournaments/' + uid);
    _utRef.on('value', snap => {
        const v = snap.val() || {};
        userTournamentStatus = {};
        Object.keys(v).forEach(tid => { if (v[tid] && v[tid].status) userTournamentStatus[tid] = v[tid].status; });
        renderTournaments();
    });
}
// Mano vieta rezervo eilėje: 1, 2, ... arba 0 jei eilėje nesu.
// t.waitlist — vardinis sąrašas („Vardas|Lytis"); seni turnyrai jo neturi (tik waitlistCount).
function userWaitlistPosition(t) {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.name || !t || !Array.isArray(t.waitlist)) return 0;
    const idx = t.waitlist.findIndex(p => String(p).split('|')[0].trim().toLowerCase() === currentUser.name.toLowerCase());
    return idx === -1 ? 0 : idx + 1;
}
function effectiveStatusFor(t) {
    if (!t) return 'open';
    if (typeof currentUser !== 'undefined' && currentUser) {
        if (userIsRegistered(t)) return 'registered';
        if (userWaitlistPosition(t) > 0 || userTournamentStatus[t.id] === 'waitlist') return 'waitlist';
    }
    if (t.regClosed) return 'closed'; // serveris uždarė registraciją — liko tik rezervas
    const mx = t.max || 0; // max=0 — NERIBOTAS dalyvių skaičius
    return (mx > 0 && (t.registered || 0) >= mx) ? 'full' : 'open';
}

// Kada uždaroma registracija („HH:MM"): turnyro startas minus regCloseMins (numatytoji 60 min.)
function regCloseTimeStr(t) {
    try {
        const start = String(t.time || '').split('-')[0].trim();
        const p = start.split(':');
        let mins = parseInt(p[0]) * 60 + parseInt(p[1] || 0) - (t.regCloseMins || 60);
        if (isNaN(mins)) return '';
        if (mins < 0) mins += 24 * 60;
        return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
    } catch (e) { return ''; }
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

function handleCardClick(id) { let t = tournaments.find(x => x.id === id); if (!t) return; if (t.timeState === 'past') { openOfficialResults(id); return; } if (t.timeState === 'live') { watchTournamentLive(id); return; } const st = effectiveStatusFor(t); if (st === 'registered') { openCancelModal(id); } else if (st === 'waitlist') { openWaitlistCancelModal(id); } else if (st === 'open') { openRegisterModal(id); } else if (st === 'closed' || (st === 'full' && t.isDemoWaitlist)) { openJoinWaitlistModal(id); } else { showToast("Šiame turnyre vietų nebėra."); } }
// Turnyro dalinimasis: telefone — sisteminis meniu (WhatsApp ir kt.), kompiuteryje —
// kopijavimas. Nuoroda ?t=ID atidaro portalą to turnyro dienoje (žr. renderTournaments).
function shareBtn(e, id) {
    e.stopPropagation();
    const t = tournaments.find(x => String(x.id) === String(id));
    const url = location.origin + location.pathname + (t ? '?t=' + encodeURIComponent(t.id) : '');
    const text = t ? `${t.format} (${t.level}) — ${t.date} ${t.time}${t.clubName ? ' · ' + t.clubName : ''}` : 'SuperPadel turnyras';
    if (navigator.share) {
        navigator.share({ title: 'SuperPadel.lt', text: text, url: url }).catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => showToast("Nuoroda nukopijuota į iškarpinę!")).catch(() => showToast(url));
    } else {
        showToast(url);
    }
}

// Puslapio starte įsimenam ?t=ID iš dalinimosi nuorodos (apdorojama, kai užsikrauna turnyrai)
try {
    const _shareParams = new URLSearchParams(location.search);
    if (_shareParams.get('t')) {
        window._pendingShareTid = _shareParams.get('t');
        history.replaceState(null, '', location.pathname);
    }
} catch (e) {}
function openH2H(e) { e.stopPropagation(); showToast("Kraunama Head-to-Head statistika..."); }
function selectDate(dateKey, element) { document.querySelectorAll('.date-box').forEach(el => el.classList.remove('active')); element.classList.add('active'); activeDate = dateKey; let pFilter = document.getElementById('filterPlayer'); if(pFilter) pFilter.value = ''; renderTournaments(); }

// ==========================================
// MOKAMI TURNYRAI — apmokėjimo būsenos
// ==========================================
// Vieta rezervuojama registruojantis, o „Dalyvaujate" tampa tik organizatoriui
// patvirtinus apmokėjimą (t.payments[raktas].status: 'pending' → 'paid').
// method laukas ('manual') paruoštas ateities Stripe integracijai.

// Firebase raktuose draudžiami . # $ / [ ] — players įrašą verčiam saugiu raktu
function payKey(entry) { return String(entry).replace(/[.#$/\[\]]/g, ','); }

// Mano players įrašas šiame turnyre (individualus 'Vardas|M' arba poros 'V|M / P|F')
function myPlayersEntry(t) {
    if (typeof currentUser === 'undefined' || !currentUser || !t || !Array.isArray(t.players)) return null;
    return t.players.find(p => String(p).split('/').some(part => part.trim().split('|')[0].trim().toLowerCase() === currentUser.name.toLowerCase())) || null;
}

// Turnyro starto laikas (ms) kliento pusėje — terminams skaičiuoti
function tournamentStartMsClient(t) {
    try {
        const dm = String(t.date).split('-').map(Number);
        const start = String(t.time).split('-')[0].trim().split(':').map(Number);
        const now = new Date();
        let d = new Date(now.getFullYear(), dm[0] - 1, dm[1], start[0], start[1] || 0);
        if (d.getTime() < Date.now() - 300 * 864e5) d = new Date(now.getFullYear() + 1, dm[0] - 1, dm[1], start[0], start[1] || 0);
        return d.getTime();
    } catch (e) { return Date.now() + 864e5; }
}

// Apmokėjimo terminas: registracija + X val., bet ne vėliau registracijos uždarymo.
// payDeadlineHours=0 reiškia „iki registracijos pabaigos".
function paymentDeadlineMs(t, regTs) {
    const closeMs = tournamentStartMsClient(t) - (t.regCloseMins || 60) * 60000;
    const hours = (typeof t.payDeadlineHours === 'number') ? t.payDeadlineHours : 24;
    if (!hours) return closeMs;
    return Math.min(regTs + hours * 3600000, closeMs);
}

// Mano laukiantis apmokėjimas šiame turnyre (arba null)
function paymentPendingFor(t) {
    if (!t || !t.paid || !t.payments) return null;
    const entry = myPlayersEntry(t);
    if (!entry) return null;
    const pay = t.payments[payKey(entry)];
    return (pay && pay.status === 'pending') ? pay : null;
}

// Sukuria laukiančio apmokėjimo įrašą ką tik įregistruotam players įrašui
function createPendingPayment(t, entry, seats) {
    if (!t.paid) return;
    if (!t.payments) t.payments = {};
    t.payments[payKey(entry)] = {
        entry: entry,
        status: 'pending',
        method: 'manual',
        amount: (t.fee || 0) * seats,
        ts: Date.now(),
        deadline: paymentDeadlineMs(t, Date.now())
    };
}

// Apmokėjimo instrukcijų langas (po registracijos ir paspaudus „Apmokėti")
function openPaymentInstructions(id) {
    const t = tournaments.find(x => x.id === id);
    if (!t || !t.paid) return;
    const entry = myPlayersEntry(t);
    if (!entry) return;
    const isPair = String(entry).includes('/');
    const pay = (t.payments || {})[payKey(entry)];
    const amount = (pay && pay.amount) || (t.fee || 0) * (isPair ? 2 : 1);
    const alreadyPaid = pay && pay.status === 'paid';
    const isCash = pay && pay.method === 'cash' && !alreadyPaid;
    const dlStr = (pay && pay.deadline)
        ? new Date(pay.deadline).toLocaleString('lt-LT', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';
    const isClaimed = pay && pay.claimed && !alreadyPaid && !isCash;
    const headBg = alreadyPaid ? '#f0fdf4' : (isCash ? '#eff6ff' : '#fffbeb');
    const headBorder = alreadyPaid ? '#bbf7d0' : (isCash ? '#bfdbfe' : '#fde68a');
    const headColor = alreadyPaid ? '#166534' : (isCash ? '#1d4ed8' : '#92400e');
    const headLabel = alreadyPaid ? 'Apmokėta ✅' : (isCash ? '💵 Mokėsite grynais atvykę' : (isClaimed ? 'Laukia organizatoriaus patvirtinimo' : 'Mokėtina suma'));

    // Struktūrizuoti rekvizitai su kopijavimo mygtukais; seni turnyrai — payInfo tekstas
    const reqRow = (label, value) => `
        <div style="display:flex; align-items:center; gap:8px; background:#f8f9fb; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; margin-bottom:6px;">
            <div style="flex:1; min-width:0;">
                <div style="font-size:9px; font-weight:800; color:var(--text-grey); text-transform:uppercase;">${label}</div>
                <div style="font-size:13px; font-weight:700; color:var(--text-dark); word-break:break-all;">${esc(value)}</div>
            </div>
            <button type="button" onclick="copyPayField(this, '${esc(value).replace(/'/g, '')}')" style="background:#eff6ff; color:var(--primary-blue); border:1px solid #bfdbfe; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:12px; flex-shrink:0;"><i class="fa-regular fa-copy"></i></button>
        </div>`;
    let reqHtml = '';
    if (t.payRecipient) reqHtml += reqRow('Gavėjas', t.payRecipient);
    if (t.payIban) reqHtml += reqRow('Sąskaita (IBAN)', t.payIban);
    if (t.payPhone) reqHtml += reqRow('Telefonas', t.payPhone);
    if (!reqHtml && t.payInfo) reqHtml = `<div style="background:#f8f9fb; border:1px solid #e2e8f0; border-radius:8px; padding:10px; font-size:13px; white-space:pre-wrap; word-break:break-word;">${esc(t.payInfo)}</div>`;

    modalTitle.innerHTML = `<i class="fa-solid fa-euro-sign" style="color:#16a34a;"></i> Apmokėjimas`;
    modalBody.innerHTML = `
        <div style="text-align:left;">
            <div style="background:${headBg}; border:1px solid ${headBorder}; border-radius:10px; padding:12px; margin-bottom:10px; text-align:center;">
                <div style="font-size:11px; font-weight:700; color:${headColor}; text-transform:uppercase;">${headLabel}</div>
                <div style="font-size:28px; font-weight:900; color:${headColor};">${amount} €</div>
                ${isPair ? '<div style="font-size:11px; color:var(--text-grey);">už porą (2 žaidėjai)</div>' : ''}
            </div>
            ${isCash ? `<div style="font-size:12px; color:var(--text-grey); margin-bottom:8px;">Vieta rezervuota — sumokėsite organizatoriui atvykę į turnyrą. Terminas jums negalioja.</div>` : ''}
            ${isClaimed ? `<div style="font-size:12px; color:#1d4ed8; margin-bottom:8px;"><i class="fa-solid fa-circle-check"></i> Pažymėjote, kad apmokėjote — organizatorius patvirtins gavęs pinigus.</div>` : ''}
            ${!alreadyPaid && !isCash && reqHtml ? `
                <div style="font-size:11px; font-weight:800; color:var(--text-grey); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Mokėjimo rekvizitai</div>
                ${reqHtml}` : ''}
            ${!alreadyPaid && !isCash ? `<div style="font-size:12px; margin-top:8px; color:var(--text-grey);">Mokėjimo paskirtis: <b style="color:var(--text-dark);">${esc(t.format)} ${esc(t.date)} — ${esc(cleanName(String(entry).split('/')[0]))}</b></div>` : ''}
            ${!alreadyPaid && !isCash && !isClaimed && dlStr ? `<div style="font-size:12px; margin-top:8px; color:#b45309; font-weight:700;"><i class="fa-solid fa-hourglass-half"></i> Apmokėkite iki ${dlStr} — kitaip vieta atlaisvinama automatiškai.</div>` : ''}
        </div>`;

    // Veiksmai: Stripe kortelė / pažymėti apmokėjus / grynieji / pavedimas
    let methodBtns = '';
    if (!alreadyPaid && !isCash && t.payStripeEnabled) {
        methodBtns += `<button type="button" class="modal-btn primary" onclick="startStripeCheckout(${Number(t.id)})" style="width:100%; margin-bottom:8px; background:#635bff;"><i class="fa-solid fa-credit-card"></i> Apmokėti kortele dabar</button>`;
    }
    if (!alreadyPaid && !isCash && !isClaimed) {
        methodBtns += `<button type="button" class="modal-btn primary" onclick="markPaymentClaimed(${Number(t.id)})" style="width:100%; margin-bottom:8px; background:#16a34a;"><i class="fa-solid fa-check"></i> Pažymėti: apmokėjau pavedimu</button>`;
    }
    if (!alreadyPaid && t.payCashAllowed) {
        methodBtns += isCash
            ? `<button type="button" class="modal-btn secondary" onclick="choosePaymentMethod(${Number(t.id)}, 'manual')" style="width:100%; margin-bottom:8px;"><i class="fa-solid fa-building-columns"></i> Vis dėlto mokėsiu pavedimu</button>`
            : `<button type="button" class="modal-btn secondary" onclick="choosePaymentMethod(${Number(t.id)}, 'cash')" style="width:100%; margin-bottom:8px;"><i class="fa-solid fa-money-bill-wave"></i> Mokėsiu grynais atvykęs</button>`;
    }
    modalActions.innerHTML = `${methodBtns}<button type="button" class="modal-btn secondary" onclick="closeModal()" style="width:100%;">Uždaryti</button>`;
    modal.classList.add('show');
}

// Rekvizito kopijavimas (IBAN, telefonas...) su vizualiu patvirtinimu
function copyPayField(btn, value) {
    const done = () => { if (btn) { btn.innerHTML = '<i class="fa-solid fa-check"></i>'; setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500); } };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(done).catch(() => showToast(value));
    } else { showToast(value); }
}

// Žaidėjas pažymi, kad pavedimą atliko: statusas lieka „pending", bet organizatorius
// mato 🔔 žymą, o sistema tokio įrašo NEBEšalina pagal terminą (pinigai gali būti kelyje).
function markPaymentClaimed(id) {
    const t = tournaments.find(x => x.id === id);
    if (!t || !t.paid) return;
    const entry = myPlayersEntry(t);
    if (!entry || !t.payments) return;
    const key = payKey(entry);
    const pay = t.payments[key];
    if (!pay || pay.status === 'paid') return;
    pay.claimed = true;
    pay.claimedTs = Date.now();
    saveData();
    showToast("✅ Pažymėta — organizatorius patvirtins gavęs pinigus.");
    openPaymentInstructions(id);
    renderTournaments();
    if (typeof renderUserProfile === 'function') renderUserProfile();
}

// ==========================================
// STRIPE — apmokėjimas kortele iš karto
// ==========================================
const STRIPE_FN_BASE = 'https://europe-west1-padelio-turnyrai.cloudfunctions.net';

// Atidaro Stripe Checkout langą. Nepavykus (raktas nesukonfigūruotas, tinklo bėda) —
// grįžtama prie įprastų pavedimo instrukcijų, registracija NEprarandama.
async function startStripeCheckout(id) {
    const t = tournaments.find(x => x.id === id);
    if (!t || !t.paid) return;
    const entry = myPlayersEntry(t);
    if (!entry) return;
    showToast("Atidaroma saugi mokėjimo sistema...");
    try {
        const resp = await fetch(STRIPE_FN_BASE + '/createStripeCheckout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tid: t.id, key: payKey(entry), origin: location.origin })
        });
        const data = await resp.json();
        if (data && data.url) { location.href = data.url; return; }
        throw new Error((data && data.error) || 'no url');
    } catch (e) {
        console.warn('stripe checkout:', e);
        showToast("Kortelių apmokėjimas šiuo metu nepasiekiamas — apmokėkite pavedimu.");
        openPaymentInstructions(id);
    }
}

// Grįžimas iš Stripe: ?paysession=ID — serveris patikrina ir pažymi apmokėjimą
function handleStripeReturn() {
    let params;
    try { params = new URLSearchParams(location.search); } catch (e) { return; }
    const session = params.get('paysession');
    const cancelTid = params.get('paycancel');
    if (!session && !cancelTid) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    if (cancelTid) {
        showToast("Apmokėjimas atšauktas — galite apmokėti pavedimu arba bandyti dar kartą.");
        setTimeout(() => { try { openPaymentInstructions(Number(cancelTid)); } catch (e) {} }, 1200);
        return;
    }
    showToast("Tikrinamas apmokėjimas...");
    fetch(STRIPE_FN_BASE + '/verifyStripeSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: session })
    }).then(r => r.json()).then(data => {
        if (data && data.paid) showToast("✅ Apmokėjimas gautas — vieta patvirtinta!");
        else showToast("Apmokėjimas dar apdorojamas — būsena atsinaujins netrukus.");
    }).catch(() => showToast("Apmokėjimas apdorojamas — būsena atsinaujins netrukus."));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handleStripeReturn);
else handleStripeReturn();

// Perjungia mokėjimo būdą: grynais (terminas nebegalioja) <-> pavedimu (terminas atstatomas)
function choosePaymentMethod(id, method) {
    const t = tournaments.find(x => x.id === id);
    if (!t || !t.paid) return;
    const entry = myPlayersEntry(t);
    if (!entry) return;
    if (!t.payments) t.payments = {};
    const key = payKey(entry);
    const existing = t.payments[key] || {};
    if (existing.status === 'paid') { openPaymentInstructions(id); return; }
    const seats = String(entry).includes('/') ? 2 : 1;
    if (method === 'cash') {
        if (!t.payCashAllowed) return;
        t.payments[key] = Object.assign({}, existing, { entry: entry, status: 'pending', method: 'cash', amount: existing.amount || (t.fee || 0) * seats, deadline: null });
        showToast("💵 Pažymėta: mokėsite grynais atvykę.");
    } else {
        t.payments[key] = Object.assign({}, existing, { entry: entry, status: 'pending', method: 'manual', amount: existing.amount || (t.fee || 0) * seats, deadline: paymentDeadlineMs(t, Date.now()) });
        showToast("Pažymėta: mokėsite pavedimu.");
    }
    saveData();
    openPaymentInstructions(id);
    renderTournaments();
    if (typeof renderUserProfile === 'function') renderUserProfile();
}

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

    // Dvi atskiros statistikos: oficiali lyga ir mėgėjų (draugiškų mačų) lyga —
    // tokia pati struktūra kaip savo profilyje: ELO / mačai / laimėta %
    const officialM = p.total_matches || 0;
    const officialWinRate = officialM > 0 ? Math.round(((p.official_wins || 0) / officialM) * 100) : 0;
    const casualM = p.casual_matches || 0;
    const casualWinRate = casualM > 0 ? Math.round(((p.casual_wins || 0) / casualM) * 100) : 0;
    let casualColor = 'var(--lvl-d)';
    const ct = p.casual_tier;
    if (ct === 'A') casualColor = 'var(--lvl-a)';
    else if (ct === 'B-/B') casualColor = 'var(--lvl-b)';
    else if (ct === 'C/C+') casualColor = 'var(--lvl-c)';
    else if (ct === 'C-/C') casualColor = 'var(--lvl-c2)';
    else if (ct === 'D/C-' || ct === 'D-C') casualColor = 'var(--lvl-d-c)';
    const lastPlayed = p.last_played ? new Date(p.last_played).toLocaleDateString('lt-LT') : '—';
    const initials = esc(p.name.substring(0, 2).toUpperCase());
    const statBox = (label, value, color) => `
                <div style="background: #f8f9fb; border-radius: 10px; padding: 10px 6px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 9px; font-weight: bold; color: var(--text-grey); text-transform: uppercase;">${label}</div>
                    <div style="font-size: 19px; font-weight: 900; color: ${color};">${value}</div>
                </div>`;

    modalTitle.innerHTML = `<i class="fa-solid fa-user" style="color: var(--primary-blue);"></i> Žaidėjo kortelė`;
    modalBody.innerHTML = `
        <div style="text-align: center; padding: 10px 0;">
            <div id="playerCardAvatar" style="width: 72px; height: 72px; border-radius: 50%; background: #eff6ff; color: var(--primary-blue); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 900; border: 3px solid ${tierColor}; margin: 0 auto 12px auto; overflow: hidden;">${initials}</div>
            <div style="font-size: 18px; font-weight: 900; color: var(--text-dark);">${esc(p.name)}</div>
            <span style="background: ${tierColor}; color: white; padding: 4px 12px; border-radius: 14px; font-weight: 900; font-size: 11px; text-transform: uppercase; display: inline-block; margin-top: 6px;">${esc(p.tier || 'D')} Lyga</span>

            <div style="font-size: 10px; font-weight: 800; color: var(--text-grey); text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 6px; text-align: left;">Oficiali lyga</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; text-align: center;">
                ${statBox('ELO Reitingas', p.rating || 300, tierColor)}
                ${statBox('Mačai', officialM, 'var(--text-dark)')}
                ${statBox('Laimėta', officialWinRate + '%', 'var(--status-green)')}
            </div>

            <div style="font-size: 10px; font-weight: 800; color: var(--text-grey); text-transform: uppercase; letter-spacing: 0.5px; margin: 14px 0 6px; text-align: left;">Mėgėjų lyga (draugiški)</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; text-align: center;">
                ${statBox('ELO Reitingas', p.casual_rating || 300, casualColor)}
                ${statBox('Mačai', casualM, 'var(--text-dark)')}
                ${statBox('Laimėta', casualWinRate + '%', 'var(--status-green)')}
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
    // Mokamo turnyro sąlygos parodomos PRIEŠ registraciją — jokių staigmenų.
    // Rodomas FAKTINIS terminas: „X val. po registracijos", bet niekada ne vėliau
    // registracijos uždarymo (registruojantis vėlai terminas savaime trumpesnis).
    let payNote = '';
    if (t.paid) {
        const dl = paymentDeadlineMs(t, Date.now());
        const dlStr = new Date(dl).toLocaleString('lt-LT', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        payNote = `<div style="margin-top:12px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px; font-size:12px; color:#166534; text-align:left;"><b>💶 Dalyvio mokestis: ${t.fee || 0} €</b> (porai ${(t.fee || 0) * 2} €).<br>Vieta rezervuojama — apmokėkite iki <b>${dlStr}</b>, kitaip vieta atlaisvinama automatiškai.</div>`;
    }
    modalTitle.innerHTML = `<i class="fa-solid fa-check-to-slot"></i> Turnyro Registracija`; modalBody.innerHTML = `Patvirtinkite dalyvavimą: <strong>${esc(t.format)} (${esc(displayLevel)} lygis)</strong>.<br>Laikas: ${esc(t.time)}.${payNote}`; modalActions.innerHTML = `<button type="button" class="modal-btn primary" onclick="confirmRegistration(${id}, false)">Registruotis Individualiai</button><button type="button" class="modal-btn primary" onclick="confirmRegistration(${id}, true)"><i class="fa-solid fa-user-plus"></i> Pridėti Partnerį</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Atšaukti</button>`; modal.classList.add('show');
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

    // LAIKO KONFLIKTAS: tą pačią dieną jau dalyvaujate kitame turnyre (persidengia / arti) — tik įspėjame
    const conflicts = registrationConflicts(t);
    if (conflicts.length) {
        const c = conflicts[0];
        const kind = c.overlap ? 'LAIKAI PERSIDENGIA' : 'startai arčiau nei 3 val.';
        if (!confirm(`⚠️ Tą pačią dieną jau dalyvaujate:\n${c.t.format}${c.t.clubName ? ' (' + c.t.clubName + ')' : ''} · ${c.t.time}\n\nŠis turnyras: ${t.time} — ${kind}.\n\nAr tikrai registruotis?`)) return;
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
        if (userIsRegistered(t)) { closeModal(); showToast("Jūs jau užsiregistravęs šiame turnyre."); return; }
        if (t.regClosed) { closeModal(); showToast("🔒 Registracija baigta — galite stoti į rezervą."); renderTournaments(); return; }
        if ((t.max || 0) > 0 && (t.registered || 0) + 1 > t.max) { closeModal(); showToast("Deja, vietų nebėra."); renderTournaments(); return; }
        if (!t.players) t.players = [];

        const entry = currentUser.name + '|' + (currentUser.gender || 'M');
        t.registered += 1;
        t.players.push(entry);
        if (t.paid) createPendingPayment(t, entry, 1);
        saveData();
        closeModal();
        if (t.paid) {
            notifAdd('reg', id, 'Vieta rezervuota — laukia apmokėjimo', t.format + ' · ' + t.date + ' ' + t.time, false);
            // „Apmokėjimas iš karto": atidaromas Stripe langas; kitaip — pavedimo instrukcijos
            if (t.payStripeEnabled) startStripeCheckout(id);
            else openPaymentInstructions(id);
        } else {
            showToast("Jūs sėkmingai užregistruoti!");
            notifAdd('reg', id, 'Registracija patvirtinta', t.format + ' · ' + t.date + ' ' + t.time, false);
        }
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
                msgDiv.innerHTML = `<span id="partnerFoundAv" style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:#f0fdf4; color:var(--status-green); font-size:9px; font-weight:900; overflow:hidden; vertical-align:middle; margin-right:4px;">${esc(String(pData.name || '?').substring(0, 2).toUpperCase())}</span><span style="color: var(--status-green);"><i class="fa-solid fa-circle-check"></i> Žaidėjas rastas: <strong>${esc(pData.name)}</strong> (${pData.gender === 'F' ? 'M' : 'V'})</span>`;
                // Partnerio nuotrauka iš bendros saugyklos — matote, KĄ registruojate
                if (pData.hasPhoto) {
                    firebase.database().ref(GLOBAL_PLAYERS_KEY + '_photos/' + safeId).once('value').then(ps => {
                        const photo = ps.val();
                        const av = document.getElementById('partnerFoundAv');
                        if (photo && av) av.innerHTML = `<img src="${photo}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                    }).catch(() => {});
                }
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
    // JAU registruotas INDIVIDUALIAI? Įrašas konvertuojamas į porą (užimama +1 vieta).
    const myEntry = myPlayersEntry(tournament);
    if (myEntry && String(myEntry).includes('/')) { closeModal(); showToast("Jau žaidžiate poroje šiame turnyre."); return; }
    if (myEntry) {
        if (tournament.regClosed) { closeModal(); showToast("🔒 Registracija baigta — partnerio pridėti nebegalima."); return; }
        if ((tournament.max || 0) > 0 && (tournament.registered || 0) + 1 > tournament.max) { closeModal(); showToast("Deja, partneriui vietos nebėra."); renderTournaments(); return; }
        const idx = tournament.players.indexOf(myEntry);
        if (idx === -1) return;
        const pairEntry = `${myEntry} / ${player2}|${gender2 || 'M'}`;
        tournament.players[idx] = pairEntry;
        tournament.registered = (tournament.registered || 0) + 1;
        if (tournament.paid) {
            // Mokėjimo įrašas perskaičiuojamas: jei už save JAU apmokėta — belieka
            // partnerio dalis (1x fee); jei dar ne — visa poros suma (2x fee).
            if (!tournament.payments) tournament.payments = {};
            const old = tournament.payments[payKey(myEntry)] || {};
            delete tournament.payments[payKey(myEntry)];
            const wasPaid = old.status === 'paid';
            tournament.payments[payKey(pairEntry)] = {
                entry: pairEntry,
                status: 'pending',
                method: old.method === 'cash' ? 'cash' : 'manual',
                amount: (tournament.fee || 0) * (wasPaid ? 1 : 2),
                note: wasPaid ? 'Už save apmokėta — liko partnerio dalis' : null,
                ts: Date.now(),
                deadline: old.method === 'cash' ? null : paymentDeadlineMs(tournament, Date.now())
            };
        }
        saveData();
        closeModal();
        showToast(`Partneris pridėtas: ${player2}!`);
        if (tournament.paid) openPaymentInstructions(tournament.id);
        renderTournaments();
        renderUserProfile();
        return;
    }
    if (tournament.regClosed) { closeModal(); showToast("🔒 Registracija baigta — galite stoti į rezervą."); renderTournaments(); return; }
    if ((tournament.max || 0) > 0 && (tournament.registered || 0) + 2 > tournament.max) { closeModal(); showToast("Deja, porai vietų nebėra."); renderTournaments(); return; }
    if (!tournament.players) tournament.players = [];

    tournament.registered += 2;
    const p1 = player1 + '|' + (gender1 || 'M');
    const p2 = player2 + '|' + (gender2 || 'M');
    const pairEntry = `${p1} / ${p2}`;
    tournament.players.push(pairEntry);
    if (tournament.paid) createPendingPayment(tournament, pairEntry, 2); // mokestis už ABU žaidėjus
    saveData();
    closeModal();
    if (tournament.paid) {
        notifAdd('reg', tournament.id, 'Poros vieta rezervuota — laukia apmokėjimo', tournament.format + ' · ' + tournament.date + ' ' + tournament.time, false);
        if (tournament.payStripeEnabled) startStripeCheckout(tournament.id);
        else openPaymentInstructions(tournament.id);
    } else {
        showToast(`Sėkmingai užregistruota pora: ${player1} ir ${player2}!`);
        notifAdd('reg', tournament.id, 'Registracija patvirtinta (pora)', tournament.format + ' · ' + tournament.date + ' ' + tournament.time, false);
    }
    setUserTournament(tournament, 'registered');
    renderUserProfile();
}

function openJoinWaitlistModal(id) { let t = tournaments.find(x => x.id === id); if (!t) return; modalTitle.innerHTML = `<i class="fa-solid fa-hourglass-half" style="color: var(--status-orange);"></i> Rezervas`; modalBody.innerHTML = t.regClosed ? `Registracija baigta. Atsilaisvinus vietai, rezervas kviečiamas eilės tvarka. Stoti į eilę?` : `Šiuo metu vietų nėra. Stoti į eilę?`; modalActions.innerHTML = `<button type="button" class="modal-btn primary" onclick="confirmWaitlist(${Number(t.id)})">Taip</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Ne</button>`; modal.classList.add('show'); }
function confirmWaitlist(id) {
    if (typeof currentUser === 'undefined' || !currentUser) { closeModal(); pendingTournamentId = id; showToast("Norėdami stoti į eilę, pirmiausia prisijunkite!"); openAuthModal(); return; }
    let t = tournaments.find(x => x.id === id); if (!t) return;
    if (!Array.isArray(t.waitlist)) t.waitlist = [];
    if (userWaitlistPosition(t) === 0) t.waitlist.push(currentUser.name + '|' + (currentUser.gender || 'M'));

    t.waitlistCount = t.waitlist.length;
    saveData(); setUserTournament(t, 'waitlist'); closeModal();
    showToast(`Pridėta į rezervą (jūs ${userWaitlistPosition(t)}-as eilėje).`);
}
function openCancelModal(id) { modalTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: var(--status-red);"></i> Atšaukti Dalyvavimą`; modalBody.innerHTML = `Ar tikrai norite atšaukti savo vietą?`; modalActions.innerHTML = `<button type="button" class="modal-btn danger" onclick="confirmCancel(${id})">Taip, atšaukti</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Ne</button>`; modal.classList.add('show'); }

function confirmCancel(id) {
    let t = tournaments.find(x => x.id === id);
    if(!t) return;
    // Apsauga: atšaukti galima tik SAVO registraciją (t.status bendras, juo nepasikliaujam)
    if (!currentUser || !userIsRegistered(t)) { closeModal(); showToast("Jūs nesate užsiregistravęs šiame turnyre."); return; }

    let pName = currentUser.name;
    if(t.players) {
        // Tikslus vardo atitikimas (ne includes — kad „Tomas" nepagautų „Tomas Tomaitis")
        let teamIndex = t.players.findIndex(p => String(p).split('/').some(part => part.trim().split('|')[0].trim().toLowerCase() === pName.toLowerCase()));
        if(teamIndex !== -1) {
            let teamStr = t.players[teamIndex];
            if(teamStr.includes('/')) { t.registered = Math.max(0, (t.registered || 0) - 2); } else { t.registered = Math.max(0, (t.registered || 0) - 1); }
            t.players.splice(teamIndex, 1);
            // Mokamo turnyro apmokėjimo įrašas išvalomas kartu su registracija
            if (t.payments && t.payments[payKey(teamStr)]) delete t.payments[payKey(teamStr)];
        }
    }

    saveData();
    closeModal();
    clearUserTournament(id); showToast("Registracija sėkmingai atšaukta.");
    renderUserProfile();
}

// PARTNERIO ATŠAUKIMAS: pora tampa individualia registracija (mano vieta lieka).
// Mokamame turnyre suma perskaičiuojama į 1x fee (permoką grąžina organizatorius).
function openRemovePartnerModal(id) {
    const t = tournaments.find(x => x.id === id);
    if (!t) return;
    const entry = myPlayersEntry(t);
    if (!entry || !String(entry).includes('/')) { showToast("Neturite partnerio šiame turnyre."); return; }
    const parts = String(entry).split('/').map(p => p.trim());
    const partnerPart = parts.find(p => p.split('|')[0].trim().toLowerCase() !== currentUser.name.toLowerCase()) || parts[1];
    const partnerName = cleanName(partnerPart);
    modalTitle.innerHTML = `<i class="fa-solid fa-user-minus" style="color: var(--status-red);"></i> Atšaukti partnerį`;
    modalBody.innerHTML = `Partneris <b>${esc(partnerName)}</b> bus pašalintas iš turnyro, o jūsų vieta liks. Tęsti?`;
    modalActions.innerHTML = `<button type="button" class="modal-btn danger" onclick="confirmRemovePartner(${Number(t.id)})">Taip, atšaukti partnerį</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Ne</button>`;
    modal.classList.add('show');
}

function confirmRemovePartner(id) {
    const t = tournaments.find(x => x.id === id);
    if (!t) return;
    const entry = myPlayersEntry(t);
    if (!entry || !String(entry).includes('/')) { closeModal(); return; }
    const parts = String(entry).split('/').map(p => p.trim());
    const myPart = parts.find(p => p.split('|')[0].trim().toLowerCase() === currentUser.name.toLowerCase()) || parts[0];
    const idx = t.players.indexOf(entry);
    if (idx === -1) { closeModal(); return; }
    t.players[idx] = myPart;
    t.registered = Math.max(0, (t.registered || 0) - 1);
    if (t.paid && t.payments) {
        const old = t.payments[payKey(entry)] || {};
        delete t.payments[payKey(entry)];
        t.payments[payKey(myPart)] = {
            entry: myPart,
            status: old.status === 'paid' ? 'paid' : 'pending',
            method: old.method || 'manual',
            amount: (t.fee || 0),
            claimed: old.claimed || null,
            ts: old.ts || Date.now(),
            paidTs: old.paidTs || null,
            deadline: old.status === 'paid' || old.method === 'cash' ? null : (old.deadline || paymentDeadlineMs(t, Date.now()))
        };
    }
    saveData();
    closeModal();
    showToast("Partneris atšauktas — jūsų vieta liko.");
    renderTournaments();
    renderUserProfile();
}

function openWaitlistCancelModal(id) { let t = tournaments.find(x => x.id === id); modalTitle.innerHTML = `Palikti rezervą?`; modalBody.innerHTML = `Išeiti iš eilės?`; modalActions.innerHTML = `<button type="button" class="modal-btn danger" onclick="confirmWaitlistCancel(${id})">Išeiti</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Pasilikti</button>`; modal.classList.add('show'); }
function confirmWaitlistCancel(id) {
    let t = tournaments.find(x => x.id === id); if (!t) return;
    if (Array.isArray(t.waitlist) && currentUser && currentUser.name) {
        const idx = t.waitlist.findIndex(p => String(p).split('|')[0].trim().toLowerCase() === currentUser.name.toLowerCase());
        if (idx !== -1) t.waitlist.splice(idx, 1);
        t.waitlistCount = t.waitlist.length;
    } else {
        t.waitlistCount = Math.max(0, (t.waitlistCount || 0) - 1);
    }

    saveData(); clearUserTournament(id); closeModal(); showToast("Išbraukta iš rezervo.");
}

let currentPushId = null;
function simulateSpotOpening(e, id) {
    e.stopPropagation(); currentPushId = id; let t = tournaments.find(x => x.id === id); if (!t) return;
    t.registered += 1;
    if (Array.isArray(t.waitlist) && currentUser && currentUser.name) {
        const idx = t.waitlist.findIndex(p => String(p).split('|')[0].trim().toLowerCase() === currentUser.name.toLowerCase());
        if (idx !== -1) t.waitlist.splice(idx, 1);
        t.waitlistCount = t.waitlist.length;
    } else { t.waitlistCount = Math.max(0, (t.waitlistCount || 0) - 1); }
    if (currentUser && currentUser.name) { if (!t.players) t.players = []; if (!userIsRegistered(t)) t.players.push(currentUser.name + '|' + (currentUser.gender || 'M')); }
    saveData();
    let pushFormat = document.getElementById('pushFormatName'); if(pushFormat) pushFormat.innerText = `${t.format}`;
    notifAdd('spot', id, 'Atsilaisvino vieta!', t.format + ' · ' + t.date + ' ' + t.time + ' — vieta jūsų!', false); setUserTournament(t, 'registered'); 
    let pushContainer = document.getElementById('pushNotification'); if(pushContainer) { pushContainer.style.top = '20px'; pushContainer.style.pointerEvents = 'auto'; } 
    setTimeout(() => { if(pushContainer) { pushContainer.style.top = '-260px'; pushContainer.style.pointerEvents = 'none'; } }, 8000); 
}
function closePush() { let p = document.getElementById('pushNotification'); if(p) { p.style.top = '-260px'; p.style.pointerEvents = 'none'; } } 
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
        let mappedPool = dataPool.map(p => ({ id: p.id, name: p.name, points: p.rating || 0, hasPhoto: p.hasPhoto === true, gender: p.gender || 'M' }));
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
            // Eilutės kaupiamos ir įterpiamos vienu kartu (žr. renderTournaments pastabą)
            let rowsHtml = '';
            mappedPool.forEach((player, index) => {
                let rankNum = index + 1;
                let rankClass = index === 0 ? 'color: #d69e2e; font-size: 18px; font-weight: 900;' : index === 1 ? 'color: #a0aec0; font-weight: 800;' : index === 2 ? 'color: #dd6b20; font-weight: 800;' : 'color: var(--text-grey);';
                let ptsColor = 'var(--primary-blue)';
                const avBg = player.gender === 'F' ? '#fdf2f8' : '#eff6ff';
                const avCol = player.gender === 'F' ? '#db2777' : 'var(--primary-blue)';
                const initials = esc(String(player.name || '?').substring(0, 2).toUpperCase());
                const av = `<span class="rt-av" data-pid="${esc(String(player.id))}" style="display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:50%; background:${avBg}; color:${avCol}; font-size:10px; font-weight:900; overflow:hidden; flex-shrink:0;">${initials}</span>`;
                rowsHtml += `<tr onclick="openPlayerCard('${esc(player.id)}')" style="cursor: pointer;" onmouseover="this.style.backgroundColor='#f8f9fb'" onmouseout="this.style.backgroundColor='transparent'"><td style="text-align: center; ${rankClass}">${rankNum}</td><td><div style="display:flex; align-items:center; gap:8px;">${av}<span>${esc(player.name)}</span> <i class="fa-solid fa-chevron-right" style="font-size: 9px; color: #cbd5e0;"></i></div></td><td style="color: ${ptsColor}; font-weight: bold; text-align: right;">${player.points}</td></tr>`;
            });
            tbody.innerHTML = rowsHtml;
        }

        // Nuotraukos iš bendros saugyklos: podium (3) + pirmieji 30 lentelės — asinchroniškai
        const podiumIds = ['pod1-av', 'pod2-av', 'pod3-av'];
        podiumIds.forEach((pid, i) => { const e = document.getElementById(pid); if (e) e.innerHTML = String(i + 1); });
        mappedPool.slice(0, 30).forEach((player, index) => {
            if (!player.hasPhoto) return;
            firebase.database().ref(GLOBAL_PLAYERS_KEY + '_photos/' + player.id).once('value').then(s => {
                const photo = s.val();
                if (!photo) return;
                const img = `<img src="${photo}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                document.querySelectorAll(`.rt-av[data-pid="${String(player.id)}"]`).forEach(e => { e.innerHTML = img; });
                if (index < 3) { const pav = document.getElementById(podiumIds[index]); if (pav) pav.innerHTML = img; }
            }).catch(() => {});
        });

        if(rLoader) rLoader.style.display = 'none';
        if(rContent) rContent.style.display = 'block';
    }).catch(err => { console.error(err); });
}

// ==========================================
// KLUBAI: sąrašas, miestų filtras, sekimas
// ==========================================
// Namelio skirtukas rodo visus klubus su jų artimiausiais turnyrais. Žaidėjas gali
// „sekti" kelis klubus (be jokių ribų) — sekimai saugomi padelio_user_clubs/{playerId}
// ir naudojami kalendoriaus filtre „⭐ Mano klubai" bei profilio sąraše.

let allClubsCache = {};       // clubId -> klubo duomenys (Klubų puslapiui ir filtrams)
let myClubs = {};             // clubId -> {ts, clubName} — mano sekami klubai
let _ucRef = null, _ucUid = null;

function userClubsInit() {
    if (typeof firebase === 'undefined') return;
    const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : null;
    if (uid === _ucUid) return;
    if (_ucRef) { try { _ucRef.off(); } catch (e) {} }
    _ucRef = null; _ucUid = uid; myClubs = {};
    if (!uid) return;
    _ucRef = firebase.database().ref('padelio_user_clubs/' + uid);
    _ucRef.on('value', snap => {
        myClubs = snap.val() || {};
        renderClubsPage();
        // Jei atidarytas profilis — atnaujinam „Mano klubai" sąrašą (su debounce, kad nemirgėtų)
        const profilePage = document.getElementById('page-profile');
        if (profilePage && profilePage.classList.contains('active') && typeof renderUserProfile === 'function') {
            if (window._clubsProfileTimer) clearTimeout(window._clubsProfileTimer);
            window._clubsProfileTimer = setTimeout(() => renderUserProfile(), 400);
        }
    });
}

function loadClubsPage() {
    firebase.database().ref('padelio_clubs').once('value').then(snap => {
        allClubsCache = snap.val() || {};
        // Miestų filtras (unikalūs, abėcėlės tvarka)
        const citySel = document.getElementById('filterClubCity');
        if (citySel) {
            const keep = citySel.value || 'all';
            const cities = [...new Set(Object.values(allClubsCache).map(c => (c && c.city ? String(c.city).trim() : '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'lt'));
            citySel.innerHTML = '<option value="all">Visi miestai</option>' + cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
            if (citySel.querySelector(`option[value="${CSS && CSS.escape ? CSS.escape(keep) : keep}"]`)) citySel.value = keep;
        }
        renderClubsPage();
    }).catch(() => { const l = document.getElementById('clubs-list'); if (l) l.innerHTML = '<div style="text-align:center; padding:30px; color:var(--status-red); font-size:13px;">Nepavyko įkelti klubų.</div>'; });
}

function renderClubsPage() {
    const list = document.getElementById('clubs-list');
    if (!list) return;
    const cityF = document.getElementById('filterClubCity')?.value || 'all';
    const ids = Object.keys(allClubsCache).filter(id => {
        const c = allClubsCache[id];
        return c && (cityF === 'all' || String(c.city || '').trim() === cityF);
    });
    if (!ids.length) { list.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-grey); font-size:13px;">Klubų pagal šį filtrą nėra.</div>'; return; }

    // Klubai su artimiausiais turnyrais viršuje
    const upcomingOf = (clubId) => (typeof tournaments !== 'undefined' ? tournaments : [])
        .filter(t => t && t.clubId === clubId && getTimeState(t.date, t.time) === 'future')
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));

    list.innerHTML = ids.map(id => {
        const c = allClubsCache[id];
        const up = upcomingOf(id);
        const followed = !!myClubs[id];
        const official = (c.canOfficial === true || c.legacyOwner === true) ? '<span style="font-size:10px; background:#fffbeb; color:#92400e; border:1px solid #fde68a; padding:2px 6px; border-radius:4px; font-weight:800;">🏆 Oficialūs</span>' : '';
        const tourRows = up.slice(0, 3).map(t => {
            const d = dynamicDates.find(x => x.dateKey === t.date);
            const dayTxt = d ? `${d.dayNumStr} d. (${d.dayNameStr})` : t.date;
            return `<div onclick="event.stopPropagation(); goToTournament('${String(t.date).replace(/[^0-9-]/g, '')}')" style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#fff; border:1px solid #edf2f7; border-radius:8px; margin-top:6px; cursor:pointer; font-size:12px;">
                <span style="font-weight:700; color:var(--text-dark);">${esc(t.format)}</span>
                <span style="color:var(--text-grey); font-weight:600;">${esc(dayTxt)} · ${esc(String(t.time).split('-')[0].trim())}</span>
            </div>`;
        }).join('');
        return `<div style="background:var(--card-bg); border:1px solid #e2e8f0; border-radius:12px; padding:14px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:900; font-size:15px; color:var(--text-dark);">${esc(c.name)}</div>
                    <div style="font-size:11px; color:var(--text-grey); font-weight:600; margin-top:2px;"><i class="fa-solid fa-location-dot"></i> ${esc(c.city || 'Miestas nenurodytas')} ${official}</div>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button type="button" onclick="openClubChat('${esc(id)}', '${String(c.name || '').replace(/['"\\<>&]/g, '')}')" title="Klubo pokalbiai" style="padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; background:#fff; color:var(--primary-blue); font-size:13px; font-weight:800; cursor:pointer;"><i class="fa-solid fa-comments"></i></button>
                    <button type="button" onclick="toggleFollowClub('${esc(id)}')" style="padding:8px 14px; border-radius:8px; border:none; background:${followed ? 'var(--status-green)' : 'var(--primary-blue)'}; color:#fff; font-size:11px; font-weight:800; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);">${followed ? '✓ Sekamas' : '⭐ Sekti'}</button>
                </div>
            </div>
            ${c.description ? `<div style="font-size:12px; color:var(--text-grey); margin-top:8px; line-height:1.4;">${esc(c.description)}</div>` : ''}
            <div style="font-size:10px; font-weight:800; color:var(--text-grey); text-transform:uppercase; margin-top:10px;">${up.length ? 'Artimiausi turnyrai (' + up.length + ')' : 'Būsimų turnyrų nėra'}</div>
            ${tourRows}
        </div>`;
    }).join('');
}

function toggleFollowClub(clubId) {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) {
        showToast("Prisijunkite, kad galėtumėte sekti klubus."); openAuthModal(); return;
    }
    userClubsInit(); // užtikrinam, kad sekimų klausytojas prijungtas (pvz. prisijungus vėliau)
    const ref = firebase.database().ref('padelio_user_clubs/' + currentUser.id + '/' + clubId);
    if (myClubs[clubId]) {
        ref.remove().then(() => {
            delete myClubs[clubId]; // atnaujinam iškart — mygtukas persipiešia nelaukiant serverio
            renderClubsPage();
            showToast("Klubo nebesekate.");
        }).catch(() => showToast("Nepavyko išsaugoti — prisijunkite iš naujo el. paštu."));
    } else {
        const c = allClubsCache[clubId] || {};
        const entry = { ts: Date.now(), clubName: c.name || '', city: c.city || '' };
        ref.set(entry).then(() => {
            myClubs[clubId] = entry; // atnaujinam iškart
            renderClubsPage();
            showToast('⭐ Sekate klubą — jo turnyrus rasite filtre „Mano klubai".');
        }).catch(() => showToast("Nepavyko išsaugoti — prisijunkite iš naujo el. paštu."));
    }
}

// Kalendoriaus klubo filtro parinktys — iš turnyruose esančių klubų (pavadinimas + miestas)
function updateClubFilterOptions() {
    const sel = document.getElementById('filterClub');
    if (!sel || typeof tournaments === 'undefined') return;
    const keep = sel.value || 'all';
    const seen = {};
    tournaments.forEach(t => { if (t && t.clubId && t.clubName && !seen[t.clubId]) seen[t.clubId] = t.clubName; });
    const opts = Object.keys(seen).map(id => {
        const city = allClubsCache[id] && allClubsCache[id].city ? ' (' + allClubsCache[id].city + ')' : '';
        return `<option value="${esc(id)}">${esc(seen[id] + city)}</option>`;
    }).join('');
    sel.innerHTML = '<option value="all">Visi klubai</option><option value="mine">⭐ Mano klubai</option>' + opts;
    if (sel.querySelector(`option[value="${keep}"]`)) sel.value = keep;
}

// Peršoka į kalendorių ties nurodyta data (iš klubo kortelės turnyro eilutės)
function goToTournament(dateKey) {
    activeDate = dateKey;
    const calendarBtn = document.querySelector('.nav-item[data-index="1"]');
    switchTab('page-calendar', calendarBtn);
    renderTournaments(); initDates();
}

// ==========================================
// REGISTRACIJŲ LAIKO KONFLIKTAI
// ==========================================
// Ribojimų nėra (galima registruotis į kelių klubų turnyrus) — tik ĮSPĖJIMAS,
// jei tą pačią dieną jau dalyvaujate turnyre, kurio laikas persidengia arba
// startas arčiau nei 3 val. nuo naujo turnyro starto.
function _timeRange(timeStr) {
    const parts = String(timeStr || '').split('-');
    if (parts.length !== 2) return null;
    const p1 = parts[0].trim().split(':'), p2 = parts[1].trim().split(':');
    const s = parseInt(p1[0]) * 60 + parseInt(p1[1] || 0), e = parseInt(p2[0]) * 60 + parseInt(p2[1] || 0);
    return (isNaN(s) || isNaN(e)) ? null : { start: s, end: e };
}
function registrationConflicts(t) {
    if (!t || typeof tournaments === 'undefined') return [];
    const nt = _timeRange(t.time);
    if (!nt) return [];
    const out = [];
    tournaments.forEach(x => {
        if (!x || x.id === t.id || x.date !== t.date || !userIsRegistered(x)) return;
        const xt = _timeRange(x.time);
        if (!xt) return;
        const overlap = nt.start < xt.end && nt.end > xt.start;
        const near = Math.abs(nt.start - xt.start) < 180;
        if (overlap || near) out.push({ t: x, overlap: overlap });
    });
    return out;
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
    if(pageId === 'page-home') {
        loadClubsPage();
    }
    if(pageId === 'page-profile') {
        renderUserProfile();
        if (typeof refreshCurrentUserFromFirebase === 'function') refreshCurrentUserFromFirebase();
    }
}
function goToHome() { const cal = document.getElementById('page-calendar'); if (cal && cal.classList.contains('active')) return; const calendarBtn = document.querySelector('[data-index="1"]'); if(calendarBtn) switchTab('page-calendar', calendarBtn); }
