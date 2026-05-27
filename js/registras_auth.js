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
            <p style="font-size: 13px; color: var(--text-grey); margin-bottom: 25px; line-height: 1.5;">Prisijunkite prie savo paskyros, kad matytumėte asmeninę statistiką, reitingo taškus bei ateinančių turnyrų rezervacijas.</p>
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

    let myPastTournaments = tournaments.filter(t => {
        if (!t.players || !Array.isArray(t.players)) return false;
        t.timeState = getTimeState(t.date, t.time);
        return t.players.some(p => p.toLowerCase().includes(currentUser.name.toLowerCase())) && t.timeState === 'past';
    });

    let myFriendlies = friendlyMatches.filter(m => 
        m.creatorName.toLowerCase() === currentUser.name.toLowerCase() ||
        m.partner.toLowerCase() === currentUser.name.toLowerCase() ||
        m.opp1.toLowerCase() === currentUser.name.toLowerCase() ||
        m.opp2.toLowerCase() === currentUser.name.toLowerCase()
    );

    let friendlyWins = 0;
    let partnersCount = {};

    myFriendlies.forEach(m => {
        let iAmTeam1 = m.creatorName.toLowerCase() === currentUser.name.toLowerCase() || m.partner.toLowerCase() === currentUser.name.toLowerCase();
        let team1Won = m.score1 > m.score2;
        if ((iAmTeam1 && team1Won) || (!iAmTeam1 && !team1Won && m.score1 !== m.score2)) {
            friendlyWins++;
        }
        
        if (m.creatorName.toLowerCase() === currentUser.name.toLowerCase() && m.partner && !m.partner.includes("Be partnerio")) {
            partnersCount[m.partner] = (partnersCount[m.partner] || 0) + 1;
        } else if (m.partner.toLowerCase() === currentUser.name.toLowerCase()) {
            partnersCount[m.creatorName] = (partnersCount[m.creatorName] || 0) + 1;
        }
    });

    let friendlyWinRate = myFriendlies.length > 0 ? Math.round((friendlyWins / myFriendlies.length) * 100) : 0;
    
    let topPartner = "-";
    let maxPCount = 0;
    for (let p in partnersCount) {
        if (partnersCount[p] > maxPCount) {
            maxPCount = partnersCount[p];
            topPartner = p.split(' ')[0]; 
        }
    }

    let ptsColor = 'var(--primary-blue)';
    if (currentUser.tier === 'A') ptsColor = 'var(--lvl-a)';
    else if (currentUser.tier === 'B-/B') ptsColor = 'var(--lvl-b)';
    else if (currentUser.tier === 'C/C+') ptsColor = 'var(--lvl-c)';
    else if (currentUser.tier === 'D-C') ptsColor = 'var(--lvl-d-c)';
    else ptsColor = 'var(--lvl-d)';

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
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.01);">
                <div style="font-size: 10px; font-weight: bold; color: var(--text-grey);">ELO Reitingas</div>
                <div style="font-size: 20px; font-weight: 900; color: ${ptsColor};">${currentUser.rating || 300}</div>
            </div>
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.01);">
                <div style="font-size: 10px; font-weight: bold; color: var(--text-grey);">Oficialūs mačai</div>
                <div style="font-size: 20px; font-weight: 900; color: var(--text-dark);">${currentUser.total_matches || 0}</div>
            </div>
        </div>

        <div style="font-size: 11px; font-weight: 800; color: var(--text-grey); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Mėgėjų Lyga</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px;">
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.01);">
                <div style="font-size: 9px; font-weight: bold; color: var(--text-grey);">Draugiški mačai</div>
                <div style="font-size: 18px; font-weight: 900; color: var(--text-dark);">${currentUser.casual_matches || 0}</div>
            </div>
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.01);">
                <div style="font-size: 9px; font-weight: bold; color: var(--text-grey);">Laimėta</div>
                <div style="font-size: 18px; font-weight: 900; color: var(--status-green);">${(currentUser.casual_matches || 0) > 0 ? Math.round(((currentUser.casual_wins || 0) / currentUser.casual_matches) * 100) : 0}%</div>
            </div>
        </div>

        <a href="/index.html" style="text-decoration: none; display: block; margin-bottom: 25px;">
            <div style="background: linear-gradient(to right, var(--primary-blue), #2b6cb0); color: white; border-radius: 10px; padding: 14px; font-size: 13px; font-weight: bold; text-align: center; box-shadow: 0 4px 6px rgba(49,130,206,0.2); transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fa-solid fa-table-tennis-paddle-ball"></i> Paleisti Mačų Skaičiuoklę / Generatorių
            </div>
        </a>

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
                    <button type="button" onclick="event.stopPropagation(); confirmRegistration(${t.id}, true);" style="background: var(--status-green); color: white; border: none; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; transition: 0.2s; box-shadow: 0 2px 4px rgba(72,187,120,0.2);">
                        <i class="fa-solid fa-user-plus"></i>
                    </button>
                `;
            }

            actionButtons += `
                <button type="button" onclick="event.stopPropagation(); openCancelModal(${t.id});" style="background: #fff; color: var(--status-red); border: 1px solid #fed7d7; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; margin-left: 6px; transition: 0.2s;">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;

            html += `
                <div style="background: white; border: 1px solid #e2e8f0; border-left: 4px solid var(--primary-blue); border-radius: 12px; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: 0.2s;" onclick="activeDate='${t.date}'; switchTab('page-calendar'); setTimeout(() => { renderTournaments(); initDates(); }, 50);">
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

    html += `
        <div style="font-size: 12px; font-weight: 800; color: var(--text-dark); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-user-group" style="color: #a0aec0; font-size: 13px;"></i> Draugiški mačai (${myFriendlies.length})
        </div>
    `;

    if (myFriendlies.length === 0) {
        html += `
            <div style="background: #f8f9fb; border: 1px dashed #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; color: var(--text-grey); font-size: 11px;">
                Draugiškų mačų istorija tuščia.
            </div>
        `;
    } else {
        html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
        let sortedFriendlies = [...myFriendlies].sort((a,b) => b.id - a.id);
        
        sortedFriendlies.forEach(m => {
            let iAmTeam1 = m.creatorName.toLowerCase() === currentUser.name.toLowerCase() || m.partner.toLowerCase() === currentUser.name.toLowerCase();
            let team1Won = m.score1 > m.score2;
            let iWon = (iAmTeam1 && team1Won) || (!iAmTeam1 && !team1Won && m.score1 !== m.score2);
            let isTie = m.score1 === m.score2;

            let badgeHtml = isTie ? 
                `<span style="font-size: 9px; background: #e2e8f0; color: #4a5568; padding: 2px 6px; border-radius: 4px; font-weight: bold;">LYGIOSIOS</span>` :
                (iWon ? 
                    `<span style="font-size: 9px; background: #c6f6d5; color: #22543d; padding: 2px 6px; border-radius: 4px; font-weight: bold;">LAIMĖTA</span>` : 
                    `<span style="font-size: 9px; background: #fed7d7; color: #742a2a; padding: 2px 6px; border-radius: 4px; font-weight: bold;">PRALAIMĖTA</span>`
                );

            let t1Names = m.partner && !m.partner.includes("Be partnerio") ? `${m.creatorName.split(' ')[0]} / ${m.partner.split(' ')[0]}` : m.creatorName.split(' ')[0];
            let t2Names = m.opp2 ? `${m.opp1.split(' ')[0]} / ${m.opp2.split(' ')[0]}` : m.opp1.split(' ')[0];

            html += `
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.01);">
                    <div>
                        <div style="font-weight: 800; color: var(--text-dark); font-size: 13px;">
                            ${t1Names} <span style="font-weight:normal; color:#a0aec0; font-size:11px;">vs</span> ${t2Names}
                        </div>
                        <div style="font-size: 11px; color: var(--text-grey); margin-top: 2px; font-weight: 600;">
                            <i class="fa-regular fa-clock"></i> ${m.date} • Rezultatas: <strong style="color:var(--text-dark);">${m.score1}:${m.score2}</strong>
                        </div>
                    </div>
                    <div>
                        ${badgeHtml}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    container.innerHTML = html;
}
