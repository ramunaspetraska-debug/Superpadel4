// ==========================================
// FIREBASE KONFIGŪRACIJA IR INICIALIZACIJA
// ==========================================

const firebaseConfig = { 
    apiKey: "AIzaSyC_Z6srTcBfOWjG0aUKIoLD74ucozLUBHc", 
    authDomain: "padelio-turnyrai.firebaseapp.com", 
    databaseURL: "https://padelio-turnyrai-default-rtdb.europe-west1.firebasedatabase.app", 
    projectId: "padelio-turnyrai" 
};
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }

const DB_KEY = "padelio_pro_master"; 
const GLOBAL_PLAYERS_KEY = "padelio_global_players";
const GLOBAL_TOURNAMENTS_KEY = "padelio_global_tournaments"; 
const GLOBAL_ARCHIVE_KEY = "padelio_archive_turnyrai"; 
const GLOBAL_FRIENDLIES_KEY = "padelio_global_friendlies"; 

const LEAGUE_LEVELS = ['Atviras', 'A', 'B-/B', 'C/C+', 'D-C', 'D', 'Privatus'];

// ==========================================
// GLOBALŪS KINTAMIEJI (visi failai naudoja)
// ==========================================

let liveDbRef = null; 
let casualPlayersRef = null;
let currentLiveMatches = []; 
let activeLiveCourt = 1;
let eRefAuthenticated = false; 
let currentFirebaseData = null;
let currentUser = JSON.parse(localStorage.getItem('sp_current_user')) || null;
let isAppMode = true; 
let pendingTournamentId = null; 
let friendlyMatches = []; 
let globalAdminPlayers = [];
let tempAdminPlayerPhotoBase64 = null;

// Išmaniojo partnerio modalinio lango būsenos kintamieji
let selectedPartnerData = null;
let tempPartnerGender = 'M';
let partnerLookupTimeout = null;

function esc(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[m]);
}

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

    if (safeId.startsWith('86') && safeId.length === 9) {
        safeId = '370' + safeId.substring(1); 
    }
    else if (safeId.startsWith('06') && safeId.length === 9) {
        safeId = '370' + safeId.substring(1); 
    }

    firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + safeId).once('value').then(snap => {
        let user = snap.val();
        if(user) {
            currentUser = user;
            localStorage.setItem('sp_current_user', JSON.stringify(currentUser));
            showToast(`Sveiki sugrįžę, ${user.name}!`);
            updateAuthUI();
            closeAuthModal();
            if (pendingTournamentId) {
                const targetId = pendingTournamentId;
                pendingTournamentId = null; 
                handleCardClick(targetId);
            }
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
                    showToast("Registracija sėkmingai! Profilis sukurtas.");
                    updateAuthUI();
                    closeAuthModal();
                    if (pendingTournamentId) {
                        const targetId = pendingTournamentId;
                        pendingTournamentId = null; 
                        handleCardClick(targetId);
                    }
                });
            }
        }
    });
}

function updateAuthUI() {
    let btn = document.getElementById('authBtn');
    if(!btn) return;
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
        btn.onclick = () => { pendingTournamentId = null; openAuthModal(); }; 
    }
    renderUserProfile();
}

function renderUserProfile() {
    const container = document.getElementById('page-profile');
    if (!container) return;

    if (!currentUser) {
        container.style.padding = "40px 20px";
        container.style.textAlign = "center";
        container.innerHTML = `
            <div style="background: #f8f9fb; width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; color: #a0aec0; border: 1px dashed #cbd5e0;">
                <i class="fa-regular fa-user" style="font-size: 32px;"></i>
            </div>
            <h3 style="font-weight: 800; color: var(--text-dark); margin-bottom: 8px; font-size: 18px;">Mano Profilis</h3>
            <p style="font-size: 13px; color: var(--text-grey); margin-bottom: 25px; line-height: 1.5;">Prisijunkite prie savo paskyros, kad matytumėte asmeninę statistiką, reitingo taškus ir draugiškų turnyrų istoriją.</p>
            <button type="button" class="modal-btn primary" onclick="openAuthModal()" style="padding: 12px 30px; font-size: 14px; font-weight: bold; border-radius: 8px; margin: 0 auto;">Prisijungti dabar</button>
        `;
        return;
    }

    container.style.padding = "20px";
    container.style.textAlign = "left";

    let myUpcoming = tournaments.filter(t => {
        if (!t.players || !Array.isArray(t.players)) return false;
        t.timeState = getTimeState(t.date, t.time);
        return t.players.some(p => p.toLowerCase().includes(currentUser.name.toLowerCase())) && t.timeState !== 'past';
    });

    let ptsColor = 'var(--primary-blue)';
    if (currentUser.tier === 'A') ptsColor = 'var(--lvl-a)';
    else if (currentUser.tier === 'B-/B') ptsColor = 'var(--lvl-b)';
    else if (currentUser.tier === 'C/C+') ptsColor = 'var(--lvl-c)';
    else if (currentUser.tier === 'D-C') ptsColor = 'var(--lvl-d-c)';
    else ptsColor = 'var(--lvl-d)';

    const casualWinRate = (currentUser.casual_matches || 0) > 0
        ? Math.round(((currentUser.casual_wins || 0) / currentUser.casual_matches) * 100)
        : 0;

    let html = `
        <div style="background: white; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.02); margin-bottom: 20px; display: flex; align-items: center; gap: 15px;">
            <div style="width: 50px; height: 50px; border-radius: 50%; background: #ebf8ff; color: var(--primary-blue); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; border: 2px solid var(--primary-blue); text-transform: uppercase;">
                ${currentUser.name.substring(0,2)}
            </div>
            <div style="flex: 1;">
                <div style="font-size: 16px; font-weight: 900; color: var(--text-dark);">${currentUser.name}</div>
                <div style="font-size: 11px; color: var(--text-grey); font-weight: 600; margin-top: 3px;"><i class="fa-solid fa-id-badge" style="margin-right:4px;"></i> ID: ${currentUser.id}</div>
            </div>
            <div style="text-align: right;">
                <span style="background: ${ptsColor}; color: white; padding: 4px 8px; border-radius: 6px; font-weight: 900; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">${currentUser.tier || 'D'} Lyga</span>
            </div>
        </div>

        <div style="font-size: 11px; font-weight: 800; color: var(--text-grey); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Oficiali Lyga</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 10px; font-weight: bold; color: var(--text-grey);">ELO Reitingas</div>
                <div style="font-size: 20px; font-weight: 900; color: ${ptsColor};">${currentUser.rating || 300}</div>
            </div>
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 10px; font-weight: bold; color: var(--text-grey);">Oficialūs mačai</div>
                <div style="font-size: 20px; font-weight: 900; color: var(--text-dark);">${currentUser.total_matches || 0}</div>
            </div>
        </div>

        <div style="font-size: 11px; font-weight: 800; color: var(--text-grey); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Mėgėjų Lyga</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px;">
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 9px; font-weight: bold; color: var(--text-grey);">Draugiški mačai</div>
                <div style="font-size: 18px; font-weight: 900; color: var(--text-dark);">${currentUser.casual_matches || 0}</div>
            </div>
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 9px; font-weight: bold; color: var(--text-grey);">Laimėta</div>
                <div style="font-size: 18px; font-weight: 900; color: var(--status-green);">${casualWinRate}%</div>
            </div>
        </div>

        <a href="/index.html" style="text-decoration: none; display: block; margin-bottom: 25px;">
            <div style="background: linear-gradient(to right, var(--primary-blue), #2b6cb0); color: white; border-radius: 10px; padding: 14px; font-size: 13px; font-weight: bold; text-align: center; box-shadow: 0 4px 6px rgba(49,130,206,0.2); display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fa-solid fa-table-tennis-paddle-ball"></i> Paleisti Mačų Skaičiuoklę / Generatorių
            </div>
        </a>

        <!-- AKTYVŪS KAMBARIAI -->
        <div style="font-size: 12px; font-weight: 800; color: var(--text-dark); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-door-open" style="color: var(--primary-blue); font-size: 13px;"></i> Aktyvūs kambariai
        </div>
        <div id="profile-rooms-container" style="margin-bottom: 25px;">
            <div style="text-align: center; padding: 15px; color: var(--text-grey); font-size: 12px;">
                <i class="fa-solid fa-spinner fa-spin"></i> Ieškoma aktyvių kambarių...
            </div>
        </div>

        <!-- MANO TURNYRAI -->
        <div style="font-size: 12px; font-weight: 800; color: var(--text-dark); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
            <i class="fa-regular fa-calendar-check" style="color: var(--primary-blue); font-size: 13px;"></i> Mano turnyrai (${myUpcoming.length})
        </div>
    `;

    if (myUpcoming.length === 0) {
        html += `
            <div style="background: #f8f9fb; border: 1px dashed #cbd5e0; border-radius: 8px; padding: 15px; text-align: center; color: var(--text-grey); font-size: 12px; margin-bottom: 25px;">
                Būsimų registracijų nėra.
            </div>
        `;
    } else {
        html += `<div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 25px;">`;
        myUpcoming.forEach(t => {
            let displayLevel = t.level;
            let partnerInfo = "";
            let actionButtons = "";
            let teamStr = t.players.find(p => p.toLowerCase().includes(currentUser.name.toLowerCase())) || "";
            let hasPartner = teamStr.includes('/');

            if (hasPartner) {
                let parts = teamStr.split('/');
                let pName = parts[0].trim().toLowerCase() === currentUser.name.toLowerCase() ? parts[1].trim() : parts[0].trim();
                partnerInfo = `<div style="font-size: 11px; color: var(--status-green); font-weight: bold; margin-top: 3px; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-user-group"></i> ${pName}</div>`;
            } else {
                actionButtons += `
                    <button type="button" onclick="event.stopPropagation(); confirmRegistration(${t.id}, true);" style="background: var(--status-green); color: white; border: none; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; transition: 0.2s;">
                        <i class="fa-solid fa-user-plus"></i>
                    </button>
                `;
            }

            actionButtons += `
                <button type="button" onclick="event.stopPropagation(); openCancelModal(${t.id});" style="background: #fff; color: var(--status-red); border: 1px solid #fed7d7; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; margin-left: 6px;">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;

            html += `
                <div style="background: white; border: 1px solid #e2e8f0; border-left: 4px solid var(--primary-blue); border-radius: 12px; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="activeDate='${t.date}'; switchTab('page-calendar'); setTimeout(() => { renderTournaments(); initDates(); }, 50);">
                    <div style="flex: 1; padding-right: 10px;">
                        <div style="font-weight: 800; color: var(--text-dark); font-size: 14px;">${t.format} <span style="font-size: 10px; background: #edf2f7; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: var(--text-dark); margin-left: 5px;">${displayLevel}</span></div>
                        <div style="font-size: 12px; color: var(--text-grey); margin-top: 2px; font-weight: 600;">
                            <i class="fa-regular fa-clock" style="margin-right: 2px; font-size: 11px;"></i> ${t.date} • ${t.time}
                        </div>
                        ${partnerInfo}
                    </div>
                    <div style="display: flex; align-items: center;">
                        ${actionButtons}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    container.innerHTML = html;

    // Užkrauname aktyvius kambarius dinamiškai
    loadActiveRooms();
}

// ==========================================
// 2. AKTYVIŲ KAMBARIŲ SISTEMA
// ==========================================

function loadActiveRooms() {
    const container = document.getElementById('profile-rooms-container');
    if (!container || !currentUser) return;

    const cutoff = Date.now() - (4 * 60 * 60 * 1000); // paskutinės 4 valandos

    firebase.database().ref('padelio_pro_master_rooms').once('value').then(snap => {
        const roomsData = snap.val() || {};
        const activeRoomNames = Object.entries(roomsData)
            .filter(([, timestamp]) => timestamp > cutoff)
            .map(([name]) => name);

        if (activeRoomNames.length === 0) {
            container.innerHTML = `
                <div style="background: #f8f9fb; border: 1px dashed #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; color: var(--text-grey); font-size: 12px;">
                    Šiuo metu aktyvių kambarių nėra.
                </div>
            `;
            return;
        }

        // Nuskaitome kiekvieno kambario duomenis
        let loaded = 0;
        let roomCards = [];

        activeRoomNames.forEach(roomName => {
            Promise.all([
                firebase.database().ref(`${DB_KEY}/${roomName}/players`).once('value'),
                firebase.database().ref(`${DB_KEY}/${roomName}/portal_links/${currentUser.id}`).once('value')
            ]).then(([playersSnap, linkSnap]) => {
                const playersRaw = playersSnap.val();
                const roomPlayers = playersRaw
                    ? (Array.isArray(playersRaw) ? playersRaw : Object.values(playersRaw)).filter(p => p && p.name)
                    : [];
                const linkedRoomPlayerId = linkSnap.val(); // null arba roomPlayerId

                roomCards.push({ roomName, roomPlayers, linkedRoomPlayerId });
                loaded++;

                if (loaded === activeRoomNames.length) {
                    renderRoomCards(container, roomCards);
                }
            }).catch(() => {
                loaded++;
                if (loaded === activeRoomNames.length) {
                    renderRoomCards(container, roomCards);
                }
            });
        });
    }).catch(() => {
        container.innerHTML = `
            <div style="background: #fff5f5; border-radius: 8px; padding: 12px; text-align: center; color: var(--status-red); font-size: 12px;">
                Nepavyko įkelti kambarių.
            </div>
        `;
    });
}

function renderRoomCards(container, roomCards) {
    if (roomCards.length === 0) {
        container.innerHTML = `
            <div style="background: #f8f9fb; border: 1px dashed #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; color: var(--text-grey); font-size: 12px;">
                Šiuo metu aktyvių kambarių nėra.
            </div>
        `;
        return;
    }

    let html = `<div style="display: flex; flex-direction: column; gap: 10px;">`;

    roomCards.forEach(({ roomName, roomPlayers, linkedRoomPlayerId }) => {
        const isLinked = linkedRoomPlayerId !== null;
        const linkedPlayer = isLinked
            ? roomPlayers.find(p => p.id === linkedRoomPlayerId)
            : null;

        const playerCountText = `${roomPlayers.length} žaidėj${roomPlayers.length === 1 ? 'as' : roomPlayers.length < 10 ? 'ai' : 'ų'}`;

        if (isLinked) {
            // Jau prisijungta — rodo žalią statusą
            html += `
                <div style="background: white; border: 1px solid #c6f6d5; border-left: 4px solid var(--status-green); border-radius: 12px; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 900; color: var(--text-dark); font-size: 14px;">${esc(roomName)}</div>
                        <div style="font-size: 11px; color: var(--status-green); font-weight: 700; margin-top: 3px;">
                            <i class="fa-solid fa-circle-check"></i> Statistika skaičiuojama
                            ${linkedPlayer ? ` · kaip <strong>${esc(linkedPlayer.name)}</strong>` : ''}
                        </div>
                        <div style="font-size: 10px; color: var(--text-grey); margin-top: 2px;">${playerCountText}</div>
                    </div>
                    <button type="button" onclick="disconnectFromRoom('${esc(roomName)}')" style="background: #fff; border: 1px solid #fed7d7; color: var(--status-red); padding: 6px 12px; border-radius: 8px; font-size: 10px; font-weight: bold; cursor: pointer; white-space: nowrap;">
                        Atsijungti
                    </button>
                </div>
            `;
        } else {
            // Dar neprisijungta
            html += `
                <div style="background: white; border: 1px solid #e2e8f0; border-left: 4px solid #e2e8f0; border-radius: 12px; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 900; color: var(--text-dark); font-size: 14px;">${esc(roomName)}</div>
                        <div style="font-size: 10px; color: var(--text-grey); margin-top: 3px;">${playerCountText} · statistika neskaičiuojama</div>
                    </div>
                    <button type="button" onclick="openRoomJoinModal('${esc(roomName)}')" style="background: var(--primary-blue); color: white; border: none; padding: 8px 14px; border-radius: 8px; font-size: 11px; font-weight: bold; cursor: pointer; white-space: nowrap;">
                        <i class="fa-solid fa-link"></i> Prisijungti
                    </button>
                </div>
            `;
        }
    });

    html += `</div>`;
    container.innerHTML = html;
}

function openRoomJoinModal(roomName) {
    if (!currentUser) { showToast("Pirmiausia prisijunkite!"); return; }

    // Nuskaitome žaidėjus iš kambario
    firebase.database().ref(`${DB_KEY}/${roomName}/players`).once('value').then(snap => {
        const playersRaw = snap.val();
        const roomPlayers = playersRaw
            ? (Array.isArray(playersRaw) ? playersRaw : Object.values(playersRaw)).filter(p => p && p.name)
            : [];

        if (roomPlayers.length === 0) {
            showToast("Kambaryje žaidėjų nerasta.");
            return;
        }

        // Ieškome tikslaus vardo sutapimo
        const exactMatch = roomPlayers.find(p =>
            p.name.toLowerCase().trim() === currentUser.name.toLowerCase().trim()
        );

        // Surikiuojame — tikslus sutapimas viršuje, tada panašūs vardai
        const myFirstName = currentUser.name.split(' ')[0].toLowerCase();
        const sorted = [...roomPlayers].sort((a, b) => {
            const aMatch = a.name.toLowerCase().includes(myFirstName) ? 0 : 1;
            const bMatch = b.name.toLowerCase().includes(myFirstName) ? 0 : 1;
            return aMatch - bMatch;
        });

        // Rodome modalą su žaidėjų sąrašu
        const modal = document.getElementById('actionModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalActions = document.getElementById('modalActions');

        modalTitle.innerHTML = `<i class="fa-solid fa-link" style="color: var(--primary-blue);"></i> Prisijungti prie ${esc(roomName)}`;

        let bodyHtml = `
            <p style="font-size: 13px; color: var(--text-grey); margin-bottom: 15px;">
                Pasirinkite save iš kambario žaidėjų sąrašo. Nuo šiol jūsų statistika bus skaičiuojama automatiškai.
            </p>
            <div style="display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow-y: auto;">
        `;

        sorted.forEach(p => {
            const isMe = exactMatch && exactMatch.id === p.id;
            const highlight = isMe
                ? 'border: 2px solid var(--primary-blue); background: #ebf8ff;'
                : 'border: 1px solid #e2e8f0; background: white;';
            const badge = isMe
                ? `<span style="font-size: 9px; background: var(--primary-blue); color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 6px;">SUTAMPA</span>`
                : '';

            bodyHtml += `
                <div onclick="confirmJoinRoom('${esc(roomName)}', '${esc(p.id)}')" style="${highlight} border-radius: 10px; padding: 12px 14px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: 0.15s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                    <div>
                        <span style="font-weight: 800; color: var(--text-dark); font-size: 14px;">${esc(p.name)}</span>
                        ${badge}
                        <div style="font-size: 10px; color: var(--text-grey); margin-top: 2px;">${p.gender === 'M' ? 'Vyras' : 'Moteris'}</div>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color: #cbd5e0;"></i>
                </div>
            `;
        });

        bodyHtml += `</div>`;
        modalBody.innerHTML = bodyHtml;
        modalActions.innerHTML = `
            <button type="button" class="modal-btn secondary" onclick="closeModal()" style="width: 100%;">Atšaukti</button>
        `;
        modal.classList.add('show');
    }).catch(() => {
        showToast("Nepavyko įkelti kambario žaidėjų.");
    });
}

function confirmJoinRoom(roomName, roomPlayerId) {
    if (!currentUser) return;

    const updates = {};
    updates[`${DB_KEY}/${roomName}/portal_links/${currentUser.id}`] = roomPlayerId;
    updates[`${DB_KEY}/${roomName}/portal_links_reverse/${roomPlayerId}`] = currentUser.id;

    firebase.database().ref().update(updates).then(() => {
        closeModal();
        loadActiveRooms();

        // Retrospektyvus skaičiavimas — tik pirmą kartą prisijungus
        firebase.database().ref(`${DB_KEY}/${roomName}/portal_links_retro/${currentUser.id}`).once('value').then(retroSnap => {
            if (retroSnap.val()) {
                showToast(`✅ Prisijungta! Statistika pradės skaičiuotis.`);
                return;
            }
            calculateRetroactiveStats(roomName, roomPlayerId, currentUser.id);
        });
    }).catch(() => {
        showToast("Klaida jungiantis prie kambario.");
    });
}

function calculateRetroactiveStats(roomName, roomPlayerId, phoneId) {
    showToast(`⏳ Tikrinami praeities mačai...`);

    firebase.database().ref(`${DB_KEY}/${roomName}`).once('value').then(snap => {
        const roomData = snap.val();
        if (!roomData) {
            showToast(`✅ Prisijungta! Praeities mačų nerasta.`);
            return;
        }

        let foundMatches = 0;
        let foundWins = 0;

        const processMatch = (match, isOfficialTournament) => {
            if (!match || !match.finished || isOfficialTournament) return;
            const inTeam1 = (match.team1 || []).some(p => p && p.id === roomPlayerId);
            const inTeam2 = (match.team2 || []).some(p => p && p.id === roomPlayerId);
            if (!inTeam1 && !inTeam2) return;
            const s1 = parseInt(match.score1 || 0);
            const s2 = parseInt(match.score2 || 0);
            foundMatches++;
            if ((inTeam1 && s1 > s2) || (inTeam2 && s2 > s1)) foundWins++;
        };

        // Praeities turnyrai (savedTournaments)
        const savedT = Array.isArray(roomData.savedTournaments)
            ? roomData.savedTournaments
            : Object.values(roomData.savedTournaments || {});
        savedT.forEach(t => {
            if (!t || !t.matches) return;
            const tMatches = Array.isArray(t.matches) ? t.matches : Object.values(t.matches);
            tMatches.forEach(m => processMatch(m, t.settings?.isOfficial === true));
        });

        // Dabartinio turnyro baigti mačai
        const currentMatches = Array.isArray(roomData.matches)
            ? roomData.matches
            : Object.values(roomData.matches || {});
        currentMatches.forEach(m => processMatch(m, roomData.settings?.isOfficial === true));

        // Žymime kad retrospektyva atlikta (neleis skaičiuoti antrą kartą)
        firebase.database().ref(`${DB_KEY}/${roomName}/portal_links_retro/${phoneId}`).set(Date.now());

        if (foundMatches === 0) {
            showToast(`✅ Prisijungta! Praeities mačų nerasta.`);
            return;
        }

        // Atnaujiname globalų profilį
        firebase.database().ref(`${GLOBAL_PLAYERS_KEY}/${phoneId}`).once('value').then(gSnap => {
            const gData = gSnap.val();
            if (!gData) {
                showToast(`✅ Prisijungta! Rasti ${foundMatches} mačai.`);
                return;
            }
            firebase.database().ref(`${GLOBAL_PLAYERS_KEY}/${phoneId}`).update({
                casual_matches: (gData.casual_matches || 0) + foundMatches,
                casual_wins: (gData.casual_wins || 0) + foundWins,
                last_played: Date.now()
            }).then(() => {
                // Atnaujiname vietinę kopiją iš karto
                currentUser.casual_matches = (currentUser.casual_matches || 0) + foundMatches;
                currentUser.casual_wins = (currentUser.casual_wins || 0) + foundWins;
                localStorage.setItem('sp_current_user', JSON.stringify(currentUser));
                renderUserProfile();
                showToast(`✅ Rasti ${foundMatches} praeities mačai — statistika atnaujinta!`);
            });
        });
    }).catch(err => {
        console.error("Retroactive stats error:", err);
        showToast(`✅ Prisijungta! Statistika pradės skaičiuotis.`);
    });
}

function disconnectFromRoom(roomName) {
    if (!currentUser) return;
    if (!confirm(`Ar tikrai norite atsijungti nuo kambario "${roomName}"? Statistika nebebebus skaičiuojama.`)) return;

    // Pirma randame roomPlayerId kad galėtume ištrinti ir reverse link
    firebase.database().ref(`${DB_KEY}/${roomName}/portal_links/${currentUser.id}`).once('value').then(snap => {
        const roomPlayerId = snap.val();
        const updates = {};
        updates[`${DB_KEY}/${roomName}/portal_links/${currentUser.id}`] = null;
        if (roomPlayerId) {
            updates[`${DB_KEY}/${roomName}/portal_links_reverse/${roomPlayerId}`] = null;
        }
        return firebase.database().ref().update(updates);
    }).then(() => {
        showToast("Atsijungta nuo kambario.");
        loadActiveRooms();
    }).catch(() => {
        showToast("Klaida atsijungiant.");
    });
}
