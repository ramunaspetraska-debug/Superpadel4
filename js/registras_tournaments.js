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
    dynamicDates.push({ fullDate: d, dateKey: dateKey, dayNumStr: d.getDate().toString(), dayNameStr: daysArr[d.getDay()], isToday: i === 0 }); 
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
        carousel.innerHTML += `<div ${idAttr} class="date-box ${activeCls}" onclick="selectDate('${d.dateKey}', this)"><div class="day-num">${d.dayNumStr}</div><div class="day-name">${d.dayNameStr}</div></div>`; 
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

function runBackgroundAutoArchiving(fetchedTournaments) {
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
        
        const profilePage = document.getElementById('page-profile');
        if (profilePage && profilePage.classList.contains('active')) {
            renderUserProfile();
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
        
        let demoBtn = (t.isDemoWaitlist && t.status === 'waitlist' && t.timeState === 'future') ? `<button type="button" class="test-trigger" onclick="simulateSpotOpening(event, ${t.id})">[Demo] Algoritmus perleidžia vietą</button>` : ''; 
        let avatar1 = (t.players && t.players[0]) ? t.players[0].substring(0,2) : 'AŽ'; 
        let avatar2 = (t.players && t.players[1]) ? t.players[1].substring(0,2) : 'MK';
        
        let lvlClass = t.level.toLowerCase();
        if (lvlClass === 'b-/b') lvlClass = 'b';
        if (lvlClass === 'c/c+') lvlClass = 'c';
        if (lvlClass === 'd-c') lvlClass = 'd-c';

        let cardHTML = `<div class="schedule-card level-${lvlClass} ${cardClassModifier}" onclick="handleCardClick(${t.id})"><div class="card-date-square"><div class="num">${dayNum}</div><div class="name">${dayName}</div></div><div class="card-info"><div class="card-header"><div class="card-title-group"><div class="card-title">${t.format}</div><div style="display: flex; gap: 5px; flex-wrap: wrap;"><div class="level-badge">${displayLevel} Lygis</div>${timeStateBadge}</div></div><button type="button" class="share-btn" onclick="shareBtn(event)"><i class="fa-solid fa-share-nodes"></i></button></div><div class="card-time">${t.time}</div><div class="avatars-row"><div class="avatar">${avatar1}</div><div class="avatar">${avatar2}</div><div class="avatar avatar-more">+${t.registered > 2 ? t.registered - 2 : 0}</div><div class="registration-count">${t.registered} / ${t.max}</div></div><div class="card-bottom">${statusHTML}${(t.status !== 'registered' && t.timeState !== 'past' && t.timeState !== 'live') ? `<button type="button" class="h2h-btn" onclick="openH2H(event)"><i class="fa-solid fa-chart-simple"></i> H2H</button>` : ''}</div></div>${demoBtn}</div>`;
        list.innerHTML += cardHTML;
    });
}

function handleCardClick(id) { let t = tournaments.find(x => x.id === id); if (t.timeState === 'past') { showToast("Šis turnyras jau baigėsi."); return; } if (t.timeState === 'live') { openLiveModal({stopPropagation: () => {}}); return; } if (t.status === 'open') { openRegisterModal(id); } else if (t.status === 'registered') { openCancelModal(id); } else if (t.status === 'waitlist') { openWaitlistCancelModal(id); } else if (t.status === 'full' && t.isDemoWaitlist) { openJoinWaitlistModal(id); } else if (t.status === 'full' && !t.isDemoWaitlist) { showToast("Šiame turnyre vietų nebėra."); } }
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
    else if (p.tier === 'D-C') tierColor = 'var(--lvl-d-c)';

    const casualM = p.casual_matches || 0;
    const casualWinRate = casualM > 0 ? Math.round(((p.casual_wins || 0) / casualM) * 100) : 0;
    const lastPlayed = p.last_played ? new Date(p.last_played).toLocaleDateString('lt-LT') : '—';
    const initials = esc(p.name.substring(0, 2).toUpperCase());

    modalTitle.innerHTML = `<i class="fa-solid fa-user" style="color: var(--primary-blue);"></i> Žaidėjo kortelė`;
    modalBody.innerHTML = `
        <div style="text-align: center; padding: 10px 0;">
            <div id="playerCardAvatar" style="width: 72px; height: 72px; border-radius: 50%; background: #f0fdf4; color: var(--primary-blue); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 900; border: 3px solid ${tierColor}; margin: 0 auto 12px auto; overflow: hidden;">${initials}</div>
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

    const formatUpper = t.format.toUpperCase();
    if (currentUser && currentUser.gender) {
        if (formatUpper.includes("MOTERŲ") && currentUser.gender === "M") {
            if (!confirm(`⚠️ ĮSPĖJIMAS: Skirta MOTERIMS (${t.format}), o jūsų lytis – Vyras.\n\nTęsti registraciją?`)) {
                return; 
            }
        }
        if (formatUpper.includes("VYRŲ") && currentUser.gender === "F") {
            if (!confirm(`⚠️ ĮSPĖJIMAS: Skirta VYRAMS (${t.format}), o jūsų lytis – Moteris.\n\nTęsti registraciją?`)) {
                return; 
            }
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
        t.players.push(currentUser.name);
        saveData();
        closeModal();
        showToast("Jūs sėkmingai užregistruoti!");
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
        btnM.style.background = '#f0fdf4'; btnM.style.borderColor = '#16a34a'; btnM.style.color = '#16a34a';
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
        completePairRegistration(t, currentUser.name, selectedPartnerData.name);
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
            completePairRegistration(t, currentUser.name, newPartnerUser.name);
        });
    }
}

function completePairRegistration(tournament, player1, player2) {
    if (!tournament.players) tournament.players = [];
    tournament.status = 'registered';
    tournament.registered += 2;
    tournament.players.push(`${player1} / ${player2}`);
    saveData();
    closeModal();
    showToast(`Sėkmingai užregistruota pora: ${player1} ir ${player2}!`);
    renderUserProfile();
}

function openJoinWaitlistModal(id) { let t = tournaments.find(x => x.id === id); modalTitle.innerHTML = `<i class="fa-solid fa-hourglass-half" style="color: var(--status-orange);"></i> Registracija į Rezervą`; modalBody.innerHTML = `Šiuo metu vietų nėra. Stoti į eilę?`; modalActions.innerHTML = `<button type="button" class="modal-btn primary" onclick="confirmWaitlist(${id})">Taip</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Ne</button>`; modal.classList.add('show'); }
function confirmWaitlist(id) { let t = tournaments.find(x => x.id === id); t.status = 'waitlist'; t.waitlistCount += 1; saveData(); closeModal(); showToast("Pridėta į rezervą."); }
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
    let notifBadge = document.getElementById('notifBadge');
    if(notifBadge) notifBadge.style.display = 'none'; 
    showToast("Registracija sėkmingai atšauktą."); 
    renderUserProfile();
}

function openWaitlistCancelModal(id) { let t = tournaments.find(x => x.id === id); modalTitle.innerHTML = `Palikti rezervą?`; modalBody.innerHTML = `Išeiti iš eilės?`; modalActions.innerHTML = `<button type="button" class="modal-btn danger" onclick="confirmWaitlistCancel(${id})">Išeiti</button><button type="button" class="modal-btn secondary" onclick="closeModal()">Pasilikti</button>`; modal.classList.add('show'); }
function confirmWaitlistCancel(id) { let t = tournaments.find(x => x.id === id); t.status = 'full'; t.waitlistCount -= 1; saveData(); closeModal(); showToast("Išbraukta iš rezervo."); }

let currentPushId = null; 
function simulateSpotOpening(e, id) { 
    e.stopPropagation(); currentPushId = id; let t = tournaments.find(x => x.id === id); t.status = 'registered'; t.registered += 1; t.waitlistCount -= 1; saveData(); 
    let pushFormat = document.getElementById('pushFormatName'); if(pushFormat) pushFormat.innerText = `${t.format}`;
    let notif = document.getElementById('notifBadge'); if(notif) notif.style.display = 'flex'; 
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
function goToHome() { const calendarBtn = document.querySelector('[data-index="1"]'); if(calendarBtn) switchTab('page-calendar', calendarBtn); }
