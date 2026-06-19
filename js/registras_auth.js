// ==========================================
// FIREBASE KONFIGŪRACIJA IR INICIALIZACIJA
// ==========================================

const firebaseConfig = { 
    apiKey: "AIzaSyC_Z6srTcBfOWjG0aUKIoLD74ucozLUBHc", 
    authDomain: "padelio-turnyrai.firebaseapp.com", 
    databaseURL: "https://padelio-turnyrai-default-rtdb.europe-west1.firebasedatabase.app", 
    projectId: "padelio-turnyrai",
    storageBucket: "padelio-turnyrai.firebasestorage.app"
};
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }

const DB_KEY = "padelio_pro_master"; 
const GLOBAL_PLAYERS_KEY = "padelio_global_players";
const GLOBAL_TOURNAMENTS_KEY = "padelio_global_tournaments"; 
const GLOBAL_ARCHIVE_KEY = "padelio_archive_turnyrai"; 

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
let globalAdminPlayers = [];
let tempAdminPlayerPhotoBase64 = null;

// Išmaniojo partnerio modalinio lango būsenos kintamieji
let selectedPartnerData = null;
let tempPartnerGender = 'M';
let partnerLookupTimeout = null;

// Pašalina "|lytis" priesagą nuo žaidėjo vardo (saugomo formatu "Vardas|M")
function cleanName(s) {
    if (!s) return '';
    return String(s).split('|')[0].trim();
}

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

// Po prisijungimo NEATIDARYTI atšaukimo lango automatiškai.
// Jei vartotojas jau registruotas turnyre — parodome žinutę ir nukreipiame į profilį,
// o ne atidarome bauginantį "Atšaukti dalyvavimą" langą.
function handlePostLoginCard(id) {
    if (typeof tournaments === 'undefined') return;
    const t = tournaments.find(x => x.id === id);
    if (!t) { if (typeof switchTab === 'function') switchTab('page-profile'); return; }
    if (t.status === 'registered') {
        showToast("Jūs jau užsiregistravęs šiame turnyre.");
        if (typeof switchTab === 'function') switchTab('page-profile');
        return;
    }
    if (typeof handleCardClick === 'function') handleCardClick(id);
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

    showToast("⏳ Jungiamasi...");

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
                handlePostLoginCard(targetId);
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
                        handlePostLoginCard(targetId);
                    }
                }).catch(err => {
                    console.error("Registracijos klaida:", err);
                    showToast("⚠️ Nepavyko išsaugoti profilio. Patikrinkite internetą.");
                });
            }
        }
    }).catch(err => {
        // SVARBU: jei Firebase skaitymas nepavyksta (silpnas internetas), prisijungimas
        // anksčiau tyliai nutrūkdavo. Dabar parodome klaidą ir, jei yra išsaugotas
        // profilis su tuo pačiu ID, prisijungiame iš atminties (veikia be interneto).
        console.error("Prisijungimo klaida:", err);
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem('sp_current_user') || 'null'); } catch(e) {}
        if (cached && cached.id === safeId) {
            currentUser = cached;
            showToast(`Prisijungta iš atminties (${cached.name}). Internetas neprieinamas.`);
            updateAuthUI();
            closeAuthModal();
        } else {
            showToast("⚠️ Nepavyko prisijungti. Patikrinkite internetą ir bandykite dar kartą.");
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
        btn.style.background = '#eff6ff';
        btn.style.color = 'var(--primary-blue)';
        btn.onclick = () => { pendingTournamentId = null; openAuthModal(); }; 
    }
    renderUserProfile();
}

// Nuotraukos įkėlimas į profilį — sumažina ir išsaugo Firebase.
// Nuotrauka automatiškai susiejama: matoma profilyje, generatoriuje, žaidėjo kortelėje.
function uploadProfilePhoto(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || !currentUser) return;
    showToast("Apdorojama nuotrauka...");

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Sumažiname iki 200x200 (kvadratu, iškerpame centrą) — taupo vietą
            const size = 200;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2;
            const sy = (img.height - minDim) / 2;
            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

            // Išsaugome lokaliai ir Firebase
            currentUser.photo = dataUrl;
            currentUser.hasPhoto = true;
            localStorage.setItem('sp_current_user', JSON.stringify(currentUser));

            if (typeof firebase !== 'undefined') {
                // 1. Globalus profilis — žyma hasPhoto
                firebase.database().ref(`${GLOBAL_PLAYERS_KEY}/${currentUser.id}`).update({ hasPhoto: true });
                // 2. Nuotrauka į photos lentelę (čia ieško generatorius ir žaidėjo kortelė)
                firebase.database().ref(`${GLOBAL_PLAYERS_KEY}_photos/${currentUser.id}`).set(dataUrl);
            }

            renderUserProfile();
            showToast("✅ Nuotrauka išsaugota!");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Perskaito šviežius vartotojo duomenis iš Firebase ir atnaujina profilį.
function refreshCurrentUserFromFirebase() {
    if (!currentUser || !currentUser.id) return;
    const savedPhoto = currentUser.photo; // išsaugome lokalią nuotrauką
    firebase.database().ref(`${GLOBAL_PLAYERS_KEY}/${currentUser.id}`).once('value').then(snap => {
        const fresh = snap.val();
        if (!fresh) return;
        currentUser = fresh;
        if (savedPhoto) currentUser.photo = savedPhoto; // grąžiname nuotrauką
        localStorage.setItem('sp_current_user', JSON.stringify(currentUser));
        renderUserProfile();
        // Jei profilis pažymėtas hasPhoto, bet nuotraukos nėra lokaliai — užkrauname iš Firebase
        if (fresh.hasPhoto && !currentUser.photo) {
            firebase.database().ref(`${GLOBAL_PLAYERS_KEY}_photos/${currentUser.id}`).once('value').then(pSnap => {
                const photo = pSnap.val();
                if (photo) {
                    currentUser.photo = photo;
                    localStorage.setItem('sp_current_user', JSON.stringify(currentUser));
                    renderUserProfile();
                }
            });
        }
    }).catch(err => console.error("refreshCurrentUser error:", err));
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
    else if (currentUser.tier === 'C-/C') ptsColor = 'var(--lvl-c2)';
    else if (currentUser.tier === 'D/C-') ptsColor = 'var(--lvl-d-c)';
    else if (currentUser.tier === 'D-C') ptsColor = 'var(--lvl-d-c)';
    else ptsColor = 'var(--lvl-d)';

    const casualWinRate = (currentUser.casual_matches || 0) > 0
        ? Math.round(((currentUser.casual_wins || 0) / currentUser.casual_matches) * 100)
        : 0;

    const officialWinRate = (currentUser.total_matches || 0) > 0
        ? Math.round(((currentUser.official_wins || 0) / currentUser.total_matches) * 100)
        : 0;

    // Mėgėjų lygos ELO spalva pagal casual_tier
    let casualPtsColor = 'var(--lvl-d)';
    const ct = currentUser.casual_tier;
    if (ct === 'A') casualPtsColor = 'var(--lvl-a)';
    else if (ct === 'B-/B') casualPtsColor = 'var(--lvl-b)';
    else if (ct === 'C/C+') casualPtsColor = 'var(--lvl-c)';
    else if (ct === 'C-/C') casualPtsColor = 'var(--lvl-c2)';
    else if (ct === 'D/C-') casualPtsColor = 'var(--lvl-d-c)';

    let html = `
        <div style="background: white; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.02); margin-bottom: 20px; display: flex; align-items: center; gap: 15px;">
            <div onclick="document.getElementById('profilePhotoInput').click()" style="position: relative; width: 50px; height: 50px; border-radius: 50%; background: #eff6ff; color: var(--primary-blue); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; border: 2px solid var(--primary-blue); text-transform: uppercase; cursor: pointer; overflow: hidden; flex-shrink: 0;" id="profileAvatar">
                ${currentUser.photo ? `<img src="${currentUser.photo}" style="width:100%;height:100%;object-fit:cover;">` : currentUser.name.substring(0,2)}
            </div>
            <input type="file" id="profilePhotoInput" accept="image/*" style="display:none;" onchange="uploadProfilePhoto(event)">
            <div style="flex: 1;">
                <div style="font-size: 16px; font-weight: 900; color: var(--text-dark);">${currentUser.name}</div>
                <div style="font-size: 11px; color: var(--text-grey); font-weight: 600; margin-top: 3px;"><i class="fa-solid fa-id-badge" style="margin-right:4px;"></i> ID: ${currentUser.id}</div>
            </div>
            <div style="text-align: right;">
                <span style="background: ${ptsColor}; color: white; padding: 4px 8px; border-radius: 6px; font-weight: 900; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">${currentUser.tier || 'D'} Lyga</span>
            </div>
        </div>

        <div style="font-size: 11px; font-weight: 800; color: var(--text-grey); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Oficiali Lyga</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 15px;">
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 9px; font-weight: bold; color: var(--text-grey);">ELO Reitingas</div>
                <div style="font-size: 18px; font-weight: 900; color: ${ptsColor};">${currentUser.rating || 300}</div>
            </div>
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 9px; font-weight: bold; color: var(--text-grey);">Mačai</div>
                <div style="font-size: 18px; font-weight: 900; color: var(--text-dark);">${currentUser.total_matches || 0}</div>
            </div>
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 9px; font-weight: bold; color: var(--text-grey);">Laimėta</div>
                <div style="font-size: 18px; font-weight: 900; color: var(--status-green);">${officialWinRate}%</div>
            </div>
        </div>

        <div style="font-size: 11px; font-weight: 800; color: var(--text-grey); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Mėgėjų Lyga</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 20px;">
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 9px; font-weight: bold; color: var(--text-grey);">ELO Reitingas</div>
                <div style="font-size: 18px; font-weight: 900; color: ${casualPtsColor};">${currentUser.casual_rating || 300}</div>
            </div>
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 9px; font-weight: bold; color: var(--text-grey);">Mačai</div>
                <div style="font-size: 18px; font-weight: 900; color: var(--text-dark);">${currentUser.casual_matches || 0}</div>
            </div>
            <div style="background: white; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 9px; font-weight: bold; color: var(--text-grey);">Laimėta</div>
                <div style="font-size: 18px; font-weight: 900; color: var(--status-green);">${casualWinRate}%</div>
            </div>
        </div>

        <div style="font-size: 11px; font-weight: 800; color: var(--text-grey); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Paskutiniai mačai</div>
        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px;">
            ${(currentUser.recent_matches && currentUser.recent_matches.length > 0) ? currentUser.recent_matches.map(m => {
                const badge = m.win
                    ? '<span style="font-size: 9px; background: #c6f6d5; color: #22543d; padding: 2px 8px; border-radius: 4px; font-weight: bold;">LAIMĖTA</span>'
                    : (m.s1 === m.s2
                        ? '<span style="font-size: 9px; background: #e2e8f0; color: #4a5568; padding: 2px 8px; border-radius: 4px; font-weight: bold;">LYGIOSIOS</span>'
                        : '<span style="font-size: 9px; background: #fed7d7; color: #742a2a; padding: 2px 8px; border-radius: 4px; font-weight: bold;">PRALAIMĖTA</span>');
                const typeBadge = m.official
                    ? '<i class="fa-solid fa-trophy" style="color: #d69e2e; font-size: 10px;" title="Oficialus"></i>'
                    : '<i class="fa-solid fa-user-group" style="color: #a0aec0; font-size: 10px;" title="Draugiškas"></i>';
                const dateStr = new Date(m.d).toLocaleDateString('lt-LT', { month: '2-digit', day: '2-digit' });
                return `<div style="background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 800; color: var(--text-dark); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${typeBadge} ${esc(m.t1)} <span style="font-weight: normal; color: #a0aec0;">vs</span> ${esc(m.t2)}</div>
                        <div style="font-size: 10px; color: var(--text-grey); margin-top: 2px;">${dateStr} • <strong style="color: var(--text-dark);">${m.s1}:${m.s2}</strong></div>
                    </div>
                    <div style="margin-left: 8px;">${badge}</div>
                </div>`;
            }).join('') : '<div style="background: #f8f9fb; border: 1px dashed #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; color: var(--text-grey); font-size: 11px;">Mačų istorija tuščia.</div>'}
        </div>

        <a href="/index.html" style="text-decoration: none; display: block; margin-bottom: 25px;">
            <div style="background: linear-gradient(to right, var(--primary-blue), #1d4ed8); color: white; border-radius: 10px; padding: 14px; font-size: 13px; font-weight: bold; text-align: center; box-shadow: 0 4px 6px rgba(49,130,206,0.2); display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fa-solid fa-table-tennis-paddle-ball"></i> Paleisti Mačų Skaičiuoklę / Generatorių
            </div>
        </a>

        <!-- AKTYVŪS KAMBARIAI -->
        <div style="font-size: 12px; font-weight: 800; color: var(--text-dark); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-door-open" style="color: var(--primary-blue); font-size: 13px;"></i> Aktyvūs kambariai
        </div>
        <div id="profile-rooms-container" style="margin-bottom: 12px;">
            <div style="text-align: center; padding: 15px; color: var(--text-grey); font-size: 12px;">
                <i class="fa-solid fa-spinner fa-spin"></i> Ieškoma aktyvių kambarių...
            </div>
        </div>
        <button type="button" onclick="recomputeMyStats()" style="width:100%; background:#eff6ff; color:var(--primary-blue); border:1px solid #bfdbfe; border-radius:10px; padding:10px; font-size:12px; font-weight:bold; cursor:pointer; margin-bottom:25px; display:flex; align-items:center; justify-content:center; gap:6px;"><i class="fa-solid fa-rotate"></i> Atnaujinti mano statistiką</button>

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
                let parts = teamStr.split('/').map(cleanName);
                let pName = parts[0].toLowerCase() === currentUser.name.toLowerCase() ? parts[1] : parts[0];
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
                    <div style="display:flex; gap:6px;">
                    <button type="button" onclick="showRoomQR('${esc(roomName)}')" style="background: #fff; border: 1px solid #cbd5e0; color: var(--text-dark); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; font-size: 13px;"><i class="fa-solid fa-qrcode"></i></button>
                    <button type="button" onclick="disconnectFromRoom('${esc(roomName)}')" style="background: #fff; border: 1px solid #fed7d7; color: var(--status-red); padding: 6px 12px; border-radius: 8px; font-size: 10px; font-weight: bold; cursor: pointer; white-space: nowrap;">Atsijungti</button>
                    </div>
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
                    <div style="display:flex; gap:6px;">
                    <button type="button" onclick="showRoomQR('${esc(roomName)}')" style="background: #fff; border: 1px solid #cbd5e0; color: var(--text-dark); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; font-size: 13px;"><i class="fa-solid fa-qrcode"></i></button>
                    <button type="button" onclick="openRoomJoinModal('${esc(roomName)}')" style="background: var(--primary-blue); color: white; border: none; padding: 8px 14px; border-radius: 8px; font-size: 11px; font-weight: bold; cursor: pointer; white-space: nowrap;"><i class="fa-solid fa-link"></i> Prisijungti</button>
                    </div>
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
                ? 'border: 2px solid var(--primary-blue); background: #eff6ff;'
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

    const nameKey = currentUser.name.toLowerCase().trim().replace(/\s+/g, '_');
    // Generatoriuje žaidėjai dažnai vadinami tik VARDU (pvz. "Ramūnas"), o profilis turi
    // pilną vardą ("Ramūnas Petraška"). Todėl saugome ryšį pagal ABU variantus,
    // kad statistika susietų nepriklausomai nuo to, kaip žaidėjas pavadintas generatoriuje.
    const firstNameKey = currentUser.name.toLowerCase().trim().split(/\s+/)[0];

    const updates = {};
    updates[`${DB_KEY}/${roomName}/portal_links/${currentUser.id}`] = roomPlayerId;
    updates[`${DB_KEY}/${roomName}/portal_links_reverse/${roomPlayerId}`] = currentUser.id;
    // Stabilus ryšys pagal vardą — veikia net kai keičiasi žaidėjo ID naujuose turnyruose
    updates[`${DB_KEY}/${roomName}/portal_links_by_name/${nameKey}`] = currentUser.id;
    if (firstNameKey && firstNameKey !== nameKey) {
        updates[`${DB_KEY}/${roomName}/portal_links_by_name/${firstNameKey}`] = currentUser.id;
    }

    console.log("💾 PRISIJUNGIMAS: išsaugau ryšius:", JSON.stringify(updates));

    firebase.database().ref().update(updates).then(() => {
        console.log("✅ PRISIJUNGIMAS išsaugotas. nameKey=" + nameKey + " currentUser.id=" + currentUser.id);
        closeModal();
        loadActiveRooms();

        // Retrospektyvus skaičiavimas — tik pirmą kartą prisijungus
        firebase.database().ref(`${DB_KEY}/${roomName}/portal_links_retro/${currentUser.id}`).once('value').then(retroSnap => {
            if (retroSnap.val()) {
                showToast(`✅ Prisijungta! Statistika pradės skaičiuotis.`);
                return;
            }
            calculateRetroactiveStats(roomName, roomPlayerId, currentUser.id, currentUser.name);
        });
    }).catch(() => {
        showToast("Klaida jungiantis prie kambario.");
    });
}

function calculateRetroactiveStats(roomName, roomPlayerId, phoneId, playerName) {
    showToast(`⏳ Tikrinami praeities mačai...`);

    firebase.database().ref(`${DB_KEY}/${roomName}`).once('value').then(snap => {
        const roomData = snap.val();
        if (!roomData) {
            showToast(`✅ Prisijungta! Praeities mačų nerasta.`);
            return;
        }

        let foundMatches = 0;
        let foundWins = 0;

        const _fullName = (playerName || '').toLowerCase().trim();
        const _firstName = _fullName.split(/\s+/)[0];
        const matchesPlayer = (p) => {
            if (!p) return false;
            if (p.id === roomPlayerId) return true;
            // Vardas saugomas formatu "Vardas|lytis" — nuvalome priesagą
            const pName = (p.name ? String(p.name).split('|')[0] : '').toLowerCase().trim();
            if (!pName) return false;
            if (_fullName && pName === _fullName) return true;            // pilnas vardas
            if (_firstName && pName.split(/\s+/)[0] === _firstName) return true; // tik vardas
            return false;
        };

        const processMatch = (match, isOfficialTournament) => {
            if (!match || !match.finished || isOfficialTournament) return;
            const inTeam1 = (match.team1 || []).some(matchesPlayer);
            const inTeam2 = (match.team2 || []).some(matchesPlayer);
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

// ==========================================
// RANKINIS STATISTIKOS PERSKAIČIAVIMAS
// ==========================================
// Patikimas būdas: perskaičiuoja casual mačus IŠ NAUJO pagal visus kambarius,
// kuriuose vartotojas prisijungęs. Sutapimas pagal pilną IR tik vardą.
// Nustato (ne prideda) reikšmes — todėl dvigubo skaičiavimo nėra.
function recomputeMyStats() {
    if (!currentUser || !currentUser.id) { showToast("Pirmiausia prisijunkite."); return; }
    showToast("⏳ Perskaičiuojama statistika...");

    const phoneId = currentUser.id;
    const fullName = (currentUser.name || '').toLowerCase().trim();
    const firstName = fullName.split(/\s+/)[0];

    const matchesPlayer = (p, roomPlayerId) => {
        if (!p) return false;
        if (roomPlayerId && p.id === roomPlayerId) return true;
        const pName = (p.name ? String(p.name).split('|')[0] : '').toLowerCase().trim();
        if (!pName) return false;
        if (fullName && pName === fullName) return true;
        if (firstName && pName.split(/\s+/)[0] === firstName) return true;
        return false;
    };

    firebase.database().ref('padelio_pro_master_rooms').once('value').then(roomsSnap => {
        const roomsData = roomsSnap.val() || {};
        const roomNames = Object.keys(roomsData);
        if (roomNames.length === 0) { showToast("Aktyvių kambarių nerasta."); return; }

        let totalMatches = 0;
        let totalWins = 0;
        let checked = 0;

        const finish = () => {
            firebase.database().ref(`${GLOBAL_PLAYERS_KEY}/${phoneId}`).update({
                casual_matches: totalMatches,
                casual_wins: totalWins,
                last_played: Date.now()
            }).then(() => {
                currentUser.casual_matches = totalMatches;
                currentUser.casual_wins = totalWins;
                localStorage.setItem('sp_current_user', JSON.stringify(currentUser));
                renderUserProfile();
                if (totalMatches > 0) {
                    showToast(`✅ Atnaujinta: ${totalMatches} mačai, ${totalWins} laimėti!`);
                } else {
                    showToast(`Mačų nerasta. Įsitikinkite, kad prisijungę prie kambario ir mačai baigti.`);
                }
            }).catch(() => showToast("Klaida saugant statistiką."));
        };

        roomNames.forEach(roomName => {
            // Tikriname ar vartotojas prisijungęs prie šio kambario
            firebase.database().ref(`${DB_KEY}/${roomName}/portal_links/${phoneId}`).once('value').then(linkSnap => {
                const roomPlayerId = linkSnap.val();
                if (!roomPlayerId) { checked++; if (checked === roomNames.length) finish(); return; }

                firebase.database().ref(`${DB_KEY}/${roomName}`).once('value').then(snap => {
                    const roomData = snap.val() || {};
                    const processMatch = (match, isOfficial) => {
                        if (!match || !match.finished || isOfficial) return;
                        const inT1 = (match.team1 || []).some(p => matchesPlayer(p, roomPlayerId));
                        const inT2 = (match.team2 || []).some(p => matchesPlayer(p, roomPlayerId));
                        if (!inT1 && !inT2) return;
                        const s1 = parseInt(match.score1 || 0);
                        const s2 = parseInt(match.score2 || 0);
                        totalMatches++;
                        if ((inT1 && s1 > s2) || (inT2 && s2 > s1)) totalWins++;
                    };
                    const savedT = Array.isArray(roomData.savedTournaments) ? roomData.savedTournaments : Object.values(roomData.savedTournaments || {});
                    savedT.forEach(t => {
                        if (!t || !t.matches) return;
                        const tM = Array.isArray(t.matches) ? t.matches : Object.values(t.matches);
                        tM.forEach(m => processMatch(m, t.settings && t.settings.isOfficial === true));
                    });
                    const curM = Array.isArray(roomData.matches) ? roomData.matches : Object.values(roomData.matches || {});
                    curM.forEach(m => processMatch(m, roomData.settings && roomData.settings.isOfficial === true));

                    checked++; if (checked === roomNames.length) finish();
                }).catch(() => { checked++; if (checked === roomNames.length) finish(); });
            }).catch(() => { checked++; if (checked === roomNames.length) finish(); });
        });
    }).catch(() => showToast("Klaida perskaičiuojant."));
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

// ==========================================
// KAMBARIO QR KODAS
// ==========================================
// Organizatorius parodo QR — žaidėjai nuskenuoja telefonu ir iškart
// patenka į portalą su atidarytu to kambario prisijungimo langu.

function showRoomQR(roomName) {
    const modalEl = document.getElementById('actionModal');
    const link = window.location.origin + '/registras?room=' + encodeURIComponent(roomName);

    document.getElementById('modalTitle').innerHTML = `<i class="fa-solid fa-qrcode" style="color: var(--primary-blue);"></i> ${esc(roomName)}`;
    document.getElementById('modalBody').innerHTML = `
        <div style="text-align: center; padding: 10px 0;">
            <div id="roomQrBox" style="display: inline-block; padding: 14px; background: white; border: 2px solid #e2e8f0; border-radius: 12px;"></div>
            <div style="font-size: 12px; color: var(--text-grey); margin-top: 12px; line-height: 1.5;">Žaidėjai nuskenuoja kodą telefonu ir<br>iškart prisijungia prie kambario statistikai.</div>
        </div>
    `;
    document.getElementById('modalActions').innerHTML = `<button type="button" class="modal-btn secondary" onclick="closeModal()" style="width: 100%;">Uždaryti</button>`;
    modalEl.classList.add('show');

    if (typeof QRCode !== 'undefined') {
        new QRCode(document.getElementById('roomQrBox'), { text: link, width: 180, height: 180 });
    } else {
        document.getElementById('roomQrBox').innerHTML = `<div style="font-size:11px; padding:20px; color:var(--text-grey); word-break:break-all;">${link}</div>`;
    }
}
