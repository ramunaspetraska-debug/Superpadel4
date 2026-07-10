// ==========================================
// VERSIJA: v2.0 (2026-07-07)
// Prisijungimai TIK patvirtinta el. pašto nuoroda (Firebase Auth email link):
// klientams — profilis susiejamas su telefonu (ID), adminams — klubų paskyros.
// Seni keliai (prisijungimas vien telefonu, admin PIN) pašalinti.
// ==========================================

// ==========================================
// FIREBASE KONFIGŪRACIJA IR INICIALIZACIJA
// ==========================================

const firebaseConfig = { 
    apiKey: "AIzaSyC_Z6srTcBfOWjG0aUKIoLD74ucozLUBHc", 
    authDomain: "padelio-turnyrai.firebaseapp.com", 
    databaseURL: "https://padelio-turnyrai-default-rtdb.europe-west1.firebasedatabase.app", 
    projectId: "padelio-turnyrai",
    storageBucket: "padelio-turnyrai.firebasestorage.app",
    messagingSenderId: "496685297949",
    appId: "1:496685297949:web:f851696c783185f2de71f4"
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
// (eRefAuthenticated pašalintas — E-teisėjo PIN nebenaudojamas)
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
// 0. SAUGUS PRISIJUNGIMAS EL. PAŠTO NUORODA (Firebase Auth email link)
// ==========================================
// Firebase pats išsiunčia vienkartinę prisijungimo nuorodą — SMTP serverio nereikia.
// BŪTINA įjungti konsolėje: Authentication → Sign-in method → Email/Password →
// „Email link (passwordless sign-in)". Kol neįjungta — mygtukai parodys instrukciją.
// DB šakos: padelio_email_links/{emailKey} = žaidėjo ID (kliento profilio susiejimas),
// padelio_clubs/{clubId} ir padelio_club_admins/{emailKey} — klubų administratoriai.

function authAvailable() {
    return typeof firebase !== 'undefined' && typeof firebase.auth === 'function';
}

// El. paštas → saugus Firebase DB raktas (be . # $ [ ] /)
function emailKey(email) {
    return String(email || '').trim().toLowerCase().replace(/[.#$\[\]\/]/g, ',');
}

function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

// Bendras nuorodos siuntimas. flow: 'client' | 'admin'; extra — papildomi duomenys grįžimui.
function sendLoginLink(email, flow, extra) {
    if (!authAvailable()) {
        showToast("El. pašto prisijungimas neprieinamas (neįkelta auth biblioteka).");
        return Promise.reject(new Error('no-auth'));
    }
    const actionCodeSettings = { url: location.origin + location.pathname, handleCodeInApp: true };
    return firebase.auth().sendSignInLinkToEmail(String(email).trim(), actionCodeSettings).then(() => {
        localStorage.setItem('sp_pending_email', String(email).trim());
        localStorage.setItem('sp_auth_flow', flow || 'client');
        if (extra) localStorage.setItem('sp_auth_extra', JSON.stringify(extra));
        else localStorage.removeItem('sp_auth_extra');
    });
}

// Suprantamas klaidos paaiškinimas + instrukcija, jei Auth dar neįjungtas konsolėje
function explainAuthError(err) {
    const code = err && err.code ? String(err.code) : '';
    if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found' || code === 'auth/admin-restricted-operation') {
        alert("⚠️ El. pašto prisijungimas dar neįjungtas Firebase pusėje.\n\nĮjungimo instrukcija (vienkartinė, ~2 min.):\n1. Atsidarykite console.firebase.google.com → projektą „padelio-turnyrai\".\n2. Kairėje: Authentication → Get started (jei rodo).\n3. Skirtukas „Sign-in method\" → Email/Password → įjunkite ABU jungiklius (Email/Password IR Email link).\n4. Skirtuke „Settings\" → „Authorized domains\" patikrinkite, kad būtų www.superpadel.lt ir superpadel.lt.\n\nĮjungę bandykite dar kartą.");
        return;
    }
    if (code === 'auth/unauthorized-continue-uri' || code === 'auth/unauthorized-domain') {
        alert("⚠️ Svetainės domenas dar nepatvirtintas Firebase pusėje.\n\nFirebase Console → Authentication → Settings → „Authorized domains\" → Add domain:\n• superpadel.lt\n• www.superpadel.lt\n\nPridėję bandykite dar kartą.");
        return;
    }
    if (code === 'auth/invalid-email') { showToast("Neteisingas el. pašto adresas."); return; }
    if (code === 'auth/too-many-requests') { showToast("Per daug bandymų — palaukite kelias minutes."); return; }
    showToast("⚠️ Nepavyko išsiųsti nuorodos: " + (err && err.message ? err.message : err));
}

// Kliento „Siųsti prisijungimo nuorodą" mygtukas prisijungimo lange
function clientSendEmailLink() {
    const inp = document.getElementById('authEmailInput');
    const email = inp ? inp.value.trim() : '';
    if (!validEmail(email)) { showToast("Įveskite teisingą el. pašto adresą."); return; }
    showToast("⏳ Siunčiama nuoroda...");
    sendLoginLink(email, 'client').then(() => {
        closeAuthModal();
        alert("📧 Prisijungimo nuoroda išsiųsta į\n" + email + "\n\nAtidarykite laišką ŠIAME įrenginyje ir paspauskite nuorodą. Jei laiško nematote — patikrinkite šlamšto (spam) aplanką.");
    }).catch(explainAuthError);
}

// Puslapio starte: jei grįžome paspaudę laiško nuorodą — užbaigiam prisijungimą
function handleEmailLinkReturn() {
    if (!authAvailable()) return;
    let auth;
    try { auth = firebase.auth(); } catch (e) { return; }
    let isLink = false;
    try { isLink = auth.isSignInWithEmailLink(window.location.href); } catch (e) { return; }
    if (!isLink) return;
    let email = localStorage.getItem('sp_pending_email');
    if (!email) email = window.prompt('Saugumo patikra: įveskite el. pašto adresą, kuriuo gavote nuorodą:');
    if (!email) return;
    showToast("⏳ Tvirtinamas prisijungimas...");
    auth.signInWithEmailLink(email.trim(), window.location.href).then(result => {
        localStorage.removeItem('sp_pending_email');
        const flow = localStorage.getItem('sp_auth_flow') || 'client';
        let extra = null;
        try { extra = JSON.parse(localStorage.getItem('sp_auth_extra') || 'null'); } catch (e) {}
        localStorage.removeItem('sp_auth_flow'); localStorage.removeItem('sp_auth_extra');
        try { history.replaceState(null, '', location.origin + location.pathname); } catch (e) {}
        const verifiedEmail = (result && result.user && result.user.email) || email.trim();
        if (flow === 'admin' && typeof adminEmailSignedIn === 'function') adminEmailSignedIn(verifiedEmail);
        else clientEmailSignedIn(verifiedEmail, extra);
    }).catch(err => {
        console.error('Email link klaida:', err);
        try { history.replaceState(null, '', location.origin + location.pathname); } catch (e) {}
        showToast('⚠️ Nuoroda nebegalioja arba jau panaudota. Išsiųskite naują.');
    });
}

// Klientas patvirtino el. paštą: randame susietą profilį arba siūlome susieti/sukurti
function clientEmailSignedIn(email, extra) {
    const ek = emailKey(email);
    firebase.database().ref('padelio_email_links/' + ek).once('value').then(snap => {
        const pid = snap.val();
        if (pid) {
            // El. paštas jau susietas su profiliu — prisijungiam
            firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + pid).once('value').then(ps => {
                const u = ps.val();
                if (!u) { showToast("Susietas profilis nerastas — kreipkitės į administratorių."); return; }
                currentUser = u;
                localStorage.setItem('sp_current_user', JSON.stringify(u));
                updateAuthUI();
                closeAuthModal();
                showToast('🔒 Prisijungta saugiai: ' + u.name);
                if (typeof renderTournaments === 'function') renderTournaments();
                if (typeof renderUserProfile === 'function') renderUserProfile();
            });
            return;
        }
        // Paskyros apsaugojimas iš profilio: susiejame su jau prisijungusio vartotojo profiliu
        if (extra && extra.linkPhone) { linkEmailToPlayerPhone(email, String(extra.linkPhone), true); return; }
        openEmailLinkAccountModal(email);
    });
}

// Modalas po pirmo prisijungimo el. paštu: telefonas PRIVALOMAS (jis — žaidėjo profilio ID,
// pagal jį veikia ELO, partnerių paieška ir push pranešimai). Jei profilis su tuo numeriu
// jau yra (pvz. sukurtas administratoriaus ar partnerio registracijos metu) — susiejamas,
// jei nėra — sukuriamas naujas. Visais atvejais profilis iškart užrakinamas šiuo el. paštu.
function openEmailLinkAccountModal(email) {
    const m = document.getElementById('actionModal');
    const mTitle = document.getElementById('modalTitle');
    const mBody = document.getElementById('modalBody');
    const mActions = document.getElementById('modalActions');
    if (!m || !mTitle || !mBody || !mActions) return;
    mTitle.innerHTML = '<i class="fa-solid fa-envelope-circle-check" style="color: var(--status-green);"></i> El. paštas patvirtintas';
    mBody.innerHTML = `
        <div style="font-size: 12px; color: var(--text-grey); margin-bottom: 12px;"><strong>${esc(email)}</strong> — patvirtintas. Liko susieti jį su žaidėjo profiliu.</div>
        <label style="font-size: 11px; font-weight: 800; color: var(--text-grey); text-transform: uppercase;">Telefono numeris (privalomas)</label>
        <input type="text" id="emailLinkPhone" placeholder="Pvz. 37060000000" style="width: 100%; padding: 12px; border: 1px solid #cbd5e0; border-radius: 8px; margin: 6px 0 12px; outline: none; font-weight: bold; box-sizing: border-box;">
        <div id="emailLinkNewFields">
            <label style="font-size: 11px; font-weight: 800; color: var(--text-grey); text-transform: uppercase;">Jūsų vardas (jei profilis dar nesukurtas)</label>
            <input type="text" id="emailLinkName" placeholder="Vardas Pavardė" style="width: 100%; padding: 12px; border: 1px solid #cbd5e0; border-radius: 8px; margin: 6px 0 8px; outline: none; font-weight: bold; box-sizing: border-box;">
            <select id="emailLinkGender" style="width: 100%; padding: 12px; border: 1px solid #cbd5e0; border-radius: 8px; outline: none; font-weight: bold; box-sizing: border-box;">
                <option value="M">Vyras</option><option value="F">Moteris</option>
            </select>
        </div>`;
    mActions.innerHTML = `
        <button type="button" class="modal-btn primary" onclick="emailLinkAccountSubmit('${esc(email)}')" style="width:100%; margin-bottom:8px;">Tęsti</button>
        <button type="button" class="modal-btn secondary" onclick="closeModal()" style="width:100%;">Atšaukti</button>`;
    m.classList.add('show');
    setTimeout(() => document.getElementById('emailLinkPhone')?.focus(), 150);
}

function emailLinkAccountSubmit(email) {
    const phoneRaw = (document.getElementById('emailLinkPhone')?.value || '').trim().toLowerCase();
    if (!phoneRaw) { showToast("Telefono numeris privalomas — pagal jį skaičiuojama jūsų statistika."); return; }
    let safeId = phoneRaw.replace(/[^a-z0-9]/g, '');
    if (safeId.startsWith('86') && safeId.length === 9) safeId = '370' + safeId.substring(1);
    if (safeId.startsWith('06') && safeId.length === 9) safeId = '370' + safeId.substring(1);
    if (!/^[0-9]{7,}$/.test(safeId)) { showToast("Neteisingas telefono numerio formatas."); return; }
    firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + safeId).once('value').then(snap => {
        if (snap.val()) { linkEmailToPlayerPhone(email, safeId, false); return; }
        // Profilio dar nėra — kuriam naują su telefono ID
        const name = (document.getElementById('emailLinkName')?.value || '').trim();
        const gender = document.getElementById('emailLinkGender')?.value || 'M';
        if (!name) { showToast("Profilis su šiuo numeriu nerastas — įveskite vardą naujam profiliui."); return; }
        const newUser = { id: safeId, name: name, gender: gender, rating: 300, tier: "D", total_matches: 0, last_played: Date.now(), email: String(email).trim().toLowerCase(), emailLocked: true };
        firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + safeId).set(newUser).then(() => {
            firebase.database().ref('padelio_email_links/' + emailKey(email)).set(safeId);
            currentUser = newUser;
            localStorage.setItem('sp_current_user', JSON.stringify(newUser));
            updateAuthUI(); closeModal(); closeAuthModal();
            showToast("🔒 Profilis sukurtas ir apsaugotas el. paštu!");
            if (typeof renderUserProfile === 'function') renderUserProfile();
        });
    });
}

// Susieja patvirtintą el. paštą su esamu (telefono) profiliu ir jį užrakina
function linkEmailToPlayerPhone(email, playerId, silent) {
    const ek = emailKey(email);
    firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + playerId).once('value').then(snap => {
        const u = snap.val();
        if (!u) { showToast("Profilis su šiuo numeriu nerastas. Patikrinkite arba sukurkite naują."); return; }
        // APSAUGA: jau kitu el. paštu apsaugoto profilio perimti negalima
        if (u.emailLocked && u.email && String(u.email).toLowerCase() !== String(email).toLowerCase()) {
            showToast("🔒 Šis profilis jau apsaugotas kitu el. paštu."); return;
        }
        firebase.database().ref(GLOBAL_PLAYERS_KEY + '/' + playerId).update({ email: String(email).trim().toLowerCase(), emailLocked: true }).then(() => {
            firebase.database().ref('padelio_email_links/' + ek).set(playerId);
            u.email = String(email).trim().toLowerCase(); u.emailLocked = true;
            currentUser = u;
            localStorage.setItem('sp_current_user', JSON.stringify(u));
            updateAuthUI(); closeModal(); closeAuthModal();
            showToast(silent ? "🔒 Paskyra apsaugota el. paštu!" : ('🔒 Susieta! Sveiki, ' + u.name));
            if (typeof renderUserProfile === 'function') renderUserProfile();
        });
    });
}

// Profilio mygtukas „Apsaugoti paskyrą": siunčia nuorodą, o grįžus automatiškai susieja šį profilį
function protectAccountWithEmail() {
    if (!currentUser || !currentUser.id) { showToast("Pirmiausia prisijunkite."); return; }
    const email = window.prompt("Įveskite savo el. pašto adresą paskyros apsaugai:");
    if (!email) return;
    if (!validEmail(email)) { showToast("Neteisingas el. pašto adresas."); return; }
    showToast("⏳ Siunčiama nuoroda...");
    sendLoginLink(email, 'client', { linkPhone: currentUser.id }).then(() => {
        alert("📧 Patvirtinimo nuoroda išsiųsta į\n" + email.trim() + "\n\nPaspauskite ją ŠIAME įrenginyje — paskyra bus apsaugota: prisijungti bus galima tik per el. paštą.");
    }).catch(explainAuthError);
}

// ==========================================
// 1. AUTENTIFIKACIJA IR VARTOTOJO PROFILIS
// ==========================================

function openAuthModal() {
    const emailInp = document.getElementById('authEmailInput');
    if (emailInp) emailInp.value = '';
    document.getElementById('authModal').classList.add('show');
    setTimeout(() => emailInp && emailInp.focus(), 150);
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
    if (typeof effectiveStatusFor === 'function' && effectiveStatusFor(t) === 'registered') {
        showToast("Jūs jau užsiregistravęs šiame turnyre.");
        if (typeof switchTab === 'function') switchTab('page-profile');
        return;
    }
    if (typeof handleCardClick === 'function') handleCardClick(id);
}

// PASTABA: senasis prisijungimas vien telefono numeriu (processAuth) PAŠALINTAS —
// prisijungiama tik patvirtinta el. pašto nuoroda (žr. clientSendEmailLink / clientEmailSignedIn).
// Telefono numeris liko tik kaip žaidėjo profilio ID (jo prašoma susiejant/kuriant profilį).

function updateAuthUI() {
    // Prisijungus/atsijungus perjungiam asmeninius klausytojus (registracijos, sekami klubai) —
    // kitaip prisijungus VĖLIAU nei užsikrovė turnyrai, profilio „Mano klubai" likdavo tuščias.
    if (typeof userTournamentsInit === 'function') { try { userTournamentsInit(); } catch (e) {} }
    if (typeof userClubsInit === 'function') { try { userClubsInit(); } catch (e) {} }
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

// „Įrankiai" — perėjimai į kitas sistemos dalis. Vienoda kortelių kalba abiejose
// programose; rodoma ir neprisijungus (klubo adminas gali neturėti žaidėjo paskyros).
function profileToolsHtml() {
    return `
        <div style="font-size: 12px; font-weight: 800; color: var(--text-dark); margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px; text-align: left;">
            <i class="fa-solid fa-toolbox" style="color: var(--primary-blue); font-size: 13px;"></i> Įrankiai
        </div>
        <a href="/index.html" style="text-decoration: none; display: block; margin-bottom: 10px;">
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; display: flex; align-items: center; gap: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); text-align: left;">
                <div style="width: 42px; height: 42px; border-radius: 10px; background: #eff6ff; color: var(--primary-blue); display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0;"><i class="fa-solid fa-table-tennis-paddle-ball"></i></div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 800; font-size: 14px; color: var(--text-dark);">Turnyro skaičiuoklė</div>
                    <div style="font-size: 11px; color: var(--text-grey); margin-top: 2px;">Mačų generavimas ir taškų vedimas prie korto</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="color: #cbd5e0; font-size: 12px;"></i>
            </div>
        </a>
        <div onclick="promptAdmin()" style="cursor: pointer; margin-bottom: 25px;">
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; display: flex; align-items: center; gap: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); text-align: left;">
                <div style="width: 42px; height: 42px; border-radius: 10px; background: #f0fdf4; color: #16a34a; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0;"><i class="fa-solid fa-building-lock"></i></div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 800; font-size: 14px; color: var(--text-dark);">Klubo valdymas</div>
                    <div style="font-size: 11px; color: var(--text-grey); margin-top: 2px;">Turnyrų skelbimas ir dalyviai — klubų administratoriams</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="color: #cbd5e0; font-size: 12px;"></i>
            </div>
        </div>`;
}

function renderUserProfile() {
    if (typeof notifInit === 'function') notifInit();
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
            <button type="button" class="modal-btn primary" onclick="openAuthModal()" style="padding: 12px 30px; font-size: 14px; font-weight: bold; border-radius: 8px; margin: 0 auto 35px;">Prisijungti dabar</button>
            ${profileToolsHtml()}
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
                ${currentUser.photo ? `<img src="${esc(currentUser.photo)}" style="width:100%;height:100%;object-fit:cover;">` : esc(currentUser.name.substring(0,2))}
            </div>
            <input type="file" id="profilePhotoInput" accept="image/*" style="display:none;" onchange="uploadProfilePhoto(event)">
            <div style="flex: 1;">
                <div style="font-size: 16px; font-weight: 900; color: var(--text-dark);">${esc(currentUser.name)}</div>
                <div style="font-size: 11px; color: var(--text-grey); font-weight: 600; margin-top: 3px;"><i class="fa-solid fa-id-badge" style="margin-right:4px;"></i> ID: ${esc(currentUser.id)}</div>
            </div>
            <div style="text-align: right;">
                <span style="background: ${ptsColor}; color: white; padding: 4px 8px; border-radius: 6px; font-weight: 900; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">${esc(currentUser.tier || 'D')} Lyga</span>
            </div>
        </div>

        ${currentUser.emailLocked
            ? `<div style="background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 10px; padding: 10px 14px; margin-bottom: 15px; font-size: 12px; color: #15803d; font-weight: bold;"><i class="fa-solid fa-lock"></i> Paskyra apsaugota el. paštu${currentUser.email ? ' (' + esc(currentUser.email) + ')' : ''}</div>`
            : `<button type="button" onclick="protectAccountWithEmail()" style="width: 100%; background: #fffbeb; color: #92400e; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; font-size: 12px; font-weight: bold; cursor: pointer; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 6px;"><i class="fa-solid fa-lock"></i> Apsaugoti paskyrą el. paštu (rekomenduojama)</button>`}

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
                partnerInfo = `<div style="font-size: 11px; color: var(--status-green); font-weight: bold; margin-top: 3px; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-user-group"></i> ${esc(pName)}</div>`;
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
                <div style="background: white; border: 1px solid #e2e8f0; border-left: 4px solid var(--primary-blue); border-radius: 12px; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="activeDate='${String(t.date).replace(/[^0-9-]/g, '')}'; switchTab('page-calendar'); setTimeout(() => { renderTournaments(); initDates(); }, 50);">
                    <div style="flex: 1; padding-right: 10px;">
                        <div style="font-weight: 800; color: var(--text-dark); font-size: 14px;">${esc(t.format)} <span style="font-size: 10px; background: #edf2f7; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: var(--text-dark); margin-left: 5px;">${esc(displayLevel)}</span>${t.clubName ? ` <span style="font-size: 10px; background: #f0fdfa; color: #0f766e; border: 1px solid #ccfbf1; padding: 2px 6px; border-radius: 4px; font-weight: bold;"><i class="fa-solid fa-building" style="font-size:8px;"></i> ${esc(t.clubName)}</span>` : ''}</div>
                        <div style="font-size: 12px; color: var(--text-grey); margin-top: 2px; font-weight: 600;">
                            <i class="fa-regular fa-clock" style="margin-right: 2px; font-size: 11px;"></i> ${esc(t.date)} • ${esc(t.time)}${t.regClosed ? ' · <span style="color:#b45309;">registracija baigta</span>' : ''}
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

    // REZERVO REGISTRACIJOS — su tikslia vieta eilėje
    const myWaitlist = tournaments.filter(t => {
        if (!t) return false;
        t.timeState = getTimeState(t.date, t.time);
        return t.timeState !== 'past' && typeof userWaitlistPosition === 'function' && userWaitlistPosition(t) > 0;
    });
    if (myWaitlist.length) {
        html += `<div style="font-size: 12px; font-weight: 800; color: var(--text-dark); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-hourglass-half" style="color: var(--status-orange); font-size: 13px;"></i> Rezervas (${myWaitlist.length})</div>`;
        html += `<div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 25px;">`;
        myWaitlist.forEach(t => {
            const pos = userWaitlistPosition(t);
            html += `<div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid var(--status-orange); border-radius: 12px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="activeDate='${String(t.date).replace(/[^0-9-]/g, '')}'; switchTab('page-calendar'); setTimeout(() => { renderTournaments(); initDates(); }, 50);">
                <div>
                    <div style="font-weight: 800; color: var(--text-dark); font-size: 13px;">${esc(t.format)}${t.clubName ? ` <span style="font-size: 10px; color: #0f766e; font-weight: bold;">· ${esc(t.clubName)}</span>` : ''}</div>
                    <div style="font-size: 11px; color: var(--text-grey); font-weight: 600; margin-top: 2px;">${esc(t.date)} • ${esc(t.time)}</div>
                </div>
                <span style="font-size: 11px; font-weight: 900; color: #92400e; background: #fef3c7; padding: 4px 10px; border-radius: 12px; white-space: nowrap;">Jūs ${pos}-as</span>
            </div>`;
        });
        html += `</div>`;
    }

    // MANO KLUBAI — sekami klubai (žr. „Klubai" skirtuką)
    const clubIds = (typeof myClubs !== 'undefined') ? Object.keys(myClubs) : [];
    html += `<div style="font-size: 12px; font-weight: 800; color: var(--text-dark); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-building" style="color: #0f766e; font-size: 13px;"></i> Mano klubai (${clubIds.length})</div>`;
    if (clubIds.length) {
        html += `<div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 25px;">`;
        clubIds.forEach(id => {
            const c = myClubs[id] || {};
            html += `<div style="background: white; border: 1px solid #ccfbf1; border-left: 4px solid #0f766e; border-radius: 12px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 800; color: var(--text-dark); font-size: 13px;">${esc(c.clubName || id)}</div>
                    ${c.city ? `<div style="font-size: 11px; color: var(--text-grey); font-weight: 600; margin-top: 2px;"><i class="fa-solid fa-location-dot"></i> ${esc(c.city)}</div>` : ''}
                </div>
                <button type="button" onclick="toggleFollowClub('${esc(id)}'); setTimeout(renderUserProfile, 400);" style="background: #fff; border: 1px solid #fed7d7; color: var(--status-red); padding: 6px 12px; border-radius: 8px; font-size: 10px; font-weight: bold; cursor: pointer;">Nebesekti</button>
            </div>`;
        });
        html += `</div>`;
    } else {
        html += `<div style="background: #f8f9fb; border: 1px dashed #cbd5e0; border-radius: 8px; padding: 12px; text-align: center; color: var(--text-grey); font-size: 12px; margin-bottom: 25px;">Dar nesekate klubų — atraskite juos skirtuke <i class="fa-solid fa-house"></i></div>`;
    }

    // PASKUTINIAI MAČAI — perkelta į apačią
    html += `
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
    `;

    // ĮRANKIAI — perėjimai į skaičiuoklę ir klubo valdymą (profilio apačioje)
    html += profileToolsHtml();

    container.innerHTML = html;

    // Užkrauname aktyvius kambarius dinamiškai
    loadActiveRooms();

    // Automatinis statistikos perskaičiavimas KARTĄ per sesiją (tyliai) —
    // kad rodomas skaičius būtų tikslus (karjeros suma iš visų kambarių),
    // nereikalaujant spausti "Atnaujinti". Vėliavėlė saugo nuo ciklo.
    if (!window._statsAutoRecomputed && currentUser && currentUser.id) {
        window._statsAutoRecomputed = true;
        setTimeout(() => { try { recomputeMyStats(true); } catch(e) {} }, 1800);
    }
}

// ==========================================
// 2. AKTYVIŲ KAMBARIŲ SISTEMA
// ==========================================

function loadActiveRooms(retryCount) {
    retryCount = retryCount || 0;
    const container = document.getElementById('profile-rooms-container');
    if (!container || !currentUser) return;

    const cutoff = Date.now() - (12 * 60 * 60 * 1000); // paskutinės 12 valandų (dienos turnyrai)

    const setStatus = (msg, isError) => {
        container.innerHTML = `<div style="background:${isError ? '#fff5f5' : '#f8f9fb'}; border:1px dashed ${isError ? '#feb2b2' : '#e2e8f0'}; border-radius:8px; padding:15px; text-align:center; color:${isError ? 'var(--status-red)' : 'var(--text-grey)'}; font-size:12px;">${msg}${isError ? '<br><button type="button" onclick="loadActiveRooms()" style="margin-top:8px; background:var(--primary-blue); color:white; border:none; padding:6px 14px; border-radius:8px; font-size:11px; font-weight:bold; cursor:pointer;">Bandyti vėl</button>' : ''}</div>`;
    };

    // Jei jau turim įkeltus kambarius — rodom IŠKART (be mirgėjimo / "Skaitau..." ciklo).
    // Net jei renderUserProfile kviečiamas pakartotinai, kambariai matomi nuolat.
    const hasCache = loadActiveRooms._cache && loadActiveRooms._cache.length;
    if (hasCache) {
        renderRoomCards(container, loadActiveRooms._cache);
    } else {
        setStatus('<i class="fa-solid fa-spinner fa-spin"></i> Skaitau kambarius...');
    }

    // DEBOUNCE: jei ką tik atnaujinom (< 4s) ir kambariai jau rodomi — NEKARTOJAM skaitymo.
    // Taip net jei renderUserProfile kviečiamas kas 1-2s, sąrašas nepersikrauna ir nemirga.
    const nowTs = Date.now();
    if (hasCache && loadActiveRooms._lastFetch && (nowTs - loadActiveRooms._lastFetch < 4000)) {
        return; // kambariai jau matomi iš atminties — nieko daugiau nedarom
    }
    loadActiveRooms._lastFetch = nowTs;

    // silent = turim cache → atnaujinam fone TYLIAI (nerodom "kraunu...", kambariai lieka)
    const silent = hasCache;

    // Pakartojimas TIK kambarių sąrašo skaitymui (kol Firebase prisijungia).
    let settled = false;
    const retryOrFail = (reason) => {
        if (settled) return;
        settled = true;
        if (retryCount < 4) {
            setStatus(`<i class="fa-solid fa-spinner fa-spin"></i> Jungiamasi prie Firebase... (${retryCount + 2})`);
            setTimeout(() => loadActiveRooms(retryCount + 1), 700);
        } else {
            setStatus('Nepavyko įkelti kambarių.<br><span style="font-size:10px;">' + (reason || 'silpnas ryšys') + '</span>', true);
        }
    };

    // Laiko limitas DENGIA TIK sąrašo skaitymą (ne kiekvieno kambario)
    const listTimeout = setTimeout(() => retryOrFail('per ilgai'), 8000);

    const readWithTimeout = (ref, ms) => Promise.race([
        ref.once('value'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);

    readWithTimeout(firebase.database().ref('padelio_pro_master_rooms'), 7000).then(snap => {
        if (settled) return;
        settled = true;
        clearTimeout(listTimeout); // sąrašas perskaitytas — JOKIO pakartojimo daugiau, ciklas neįmanomas

        const roomsData = snap.val() || {};
        const allNames = Object.keys(roomsData);
        const activeRoomNames = Object.entries(roomsData)
            .filter(([, ts]) => typeof ts === 'number' && ts > cutoff)
            .map(([name]) => name);

        console.log(`📋 padelio_pro_master_rooms: viso ${allNames.length}, aktyvių ${activeRoomNames.length}`);

        if (activeRoomNames.length === 0) {
            loadActiveRooms._cache = null;
            const msg = allNames.length === 0
                ? 'Šiuo metu aktyvių kambarių nėra.<br><span style="font-size:10px;">(Sukurkite kambarį generatoriuje)</span>'
                : `Aktyvių kambarių nėra.<br><span style="font-size:10px;">(Rasta ${allNames.length} senų — senesni nei 12 val.)</span>`;
            const c = document.getElementById('profile-rooms-container') || container;
            c.innerHTML = `<div style="background:#f8f9fb; border:1px dashed #e2e8f0; border-radius:8px; padding:15px; text-align:center; color:var(--text-grey); font-size:12px;">${msg}</div>`;
            return;
        }

        // Rodome "kraunu..." TIK pirmą kartą (be cache). Su cache — atnaujinam tyliai.
        if (!silent) {
            setStatus(`<i class="fa-solid fa-spinner fa-spin"></i> Rasta ${activeRoomNames.length} kambarių, kraunu...`);
        }

        // Kiekvieno kambario skaitymai NEPRIVALOMI (allSettled visada baigiasi).
        // JOKIO bendro laiko limito — kambariai užsikraus ir LIKS (be pakartojimo).
        Promise.allSettled(activeRoomNames.map(roomName => {
            const playersP = readWithTimeout(firebase.database().ref(`${DB_KEY}/${roomName}/players`), 6000)
                .then(s => s.val()).catch(() => null);
            const linkP = readWithTimeout(firebase.database().ref(`${DB_KEY}/${roomName}/portal_links/${currentUser.id}`), 6000)
                .then(s => s.val()).catch(() => null);
            return Promise.all([playersP, linkP]).then(([playersRaw, link]) => {
                const roomPlayers = playersRaw
                    ? (Array.isArray(playersRaw) ? playersRaw : Object.values(playersRaw)).filter(p => p && p.name)
                    : [];
                return { roomName, roomPlayers, linkedRoomPlayerId: link };
            });
        })).then(results => {
            const roomCards = results.filter(r => r.status === 'fulfilled').map(r => r.value);
            loadActiveRooms._cache = roomCards; // išsaugom — kiti perpaišymai rodys iškart
            // Paimam DABARTINĮ konteinerį (jei renderUserProfile perpaišė, senasis nebematomas)
            const freshContainer = document.getElementById('profile-rooms-container') || container;
            renderRoomCards(freshContainer, roomCards);
        });
    }).catch((err) => {
        console.error('loadActiveRooms klaida (bandymas ' + (retryCount + 1) + '):', err);
        retryOrFail((err && err.message) ? err.message : 'klaida');
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
// „Atnaujinti mano statistiką": perskaičiuoja MAČŲ IR PERGALIŲ SKAIČIUS iš naujo
// pagal visus kambarius (nustato, ne prideda — dvigubo skaičiavimo nėra).
// ELO reitingai čia NEskaičiuojami — jie evoliucionuoja tik mačas po mačo
// (processGlobalEloForMatch), nes ELO neįmanoma teisingai atkurti iš win/loss sumų.
function recomputeMyStats(silent) {
    if (!currentUser || !currentUser.id) { if (!silent) showToast("Pirmiausia prisijunkite."); return; }
    if (!silent) showToast("⏳ Perskaičiuojama statistika...");

    const phoneId = currentUser.id;
    const fullName = (currentUser.name || '').toLowerCase().trim();
    const firstName = fullName.split(/\s+/)[0];

    const matchesPlayer = (p, roomPlayerId) => {
        if (!p) return false;
        if (p.id === phoneId) return true; // tikslus telefono ID — patikimiausia
        if (roomPlayerId && p.id === roomPlayerId) return true;
        const pName = (p.name ? String(p.name).split('|')[0] : '').toLowerCase().trim();
        if (!pName) return false;
        if (fullName && pName === fullName) return true;
        // Vien vardo atitikimas — TIK kai kambaryje įrašytas vardas be pavardės
        // (kitaip „Jonas Kitas" mačai būtų priskirti „Jonas Petraitis")
        if (firstName && pName.indexOf(' ') === -1 && pName === firstName) return true;
        return false;
    };

    const readWithTimeout = (ref, ms) => Promise.race([
        ref.once('value'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);

    readWithTimeout(firebase.database().ref('padelio_pro_master_rooms'), 8000).then(roomsSnap => {
        const roomsData = roomsSnap.val() || {};
        const roomNames = Object.keys(roomsData);
        if (roomNames.length === 0) { if (!silent) showToast("Kambarių nerasta."); return; }

        let totalMatches = 0;
        let totalWins = 0;
        let officialMatches = 0;
        let officialWins = 0;
        let checked = 0;
        let roomsWithMe = 0;

        const finish = () => {
            // SVARBU: perskaičiuojami TIK mačų/pergalių skaičiai. ELO reitingų (rating,
            // casual_rating) ir tier žymų NELIEČIAME — jie evoliucionuoja mačas po mačo
            // (processGlobalEloForMatch); perrašymas formule sunaikintų ELO istoriją.
            firebase.database().ref(`${GLOBAL_PLAYERS_KEY}/${phoneId}`).update({
                casual_matches: totalMatches,
                casual_wins: totalWins,
                total_matches: officialMatches,
                official_wins: officialWins,
                last_played: Date.now()
            }).then(() => {
                currentUser.casual_matches = totalMatches;
                currentUser.casual_wins = totalWins;
                currentUser.total_matches = officialMatches;
                currentUser.official_wins = officialWins;
                localStorage.setItem('sp_current_user', JSON.stringify(currentUser));
                renderUserProfile();
                if (!silent) {
                    if (totalMatches > 0 || officialMatches > 0) {
                        showToast(`✅ Atnaujinta: ${totalMatches} mėgėjų (${totalWins} perg.), ${officialMatches} oficialūs (${officialWins} perg.)`);
                    } else {
                        showToast(`Baigtų mačų nerasta. Ar mačai pažymėti kaip baigti?`);
                    }
                }
            }).catch(() => { if (!silent) showToast("Klaida saugant statistiką."); });
        };

        // KARJEROS suma — skaitome KIEKVIENĄ kambarį (ne tik prisijungtus).
        // Mačas priskaičiuojamas, jei žaidėjo vardas/ID jame pasirodo. Taip atsijungimas
        // nebepraranda istorijos, o skaičius sutampa su generatoriaus "Karjeros" lentele.
        roomNames.forEach(roomName => {
            readWithTimeout(firebase.database().ref(`${DB_KEY}/${roomName}`), 6000).then(snap => {
                const roomData = snap.val() || {};
                // portal_links (jei yra) duoda tikslų ID; jei nėra — naudojam vardo atpažinimą
                const roomPlayerId = (roomData.portal_links && roomData.portal_links[phoneId]) || null;
                let foundHere = false;

                const processMatch = (match, isOfficial) => {
                    if (!match || !match.finished) return;
                    const inT1 = (match.team1 || []).some(p => matchesPlayer(p, roomPlayerId));
                    const inT2 = (match.team2 || []).some(p => matchesPlayer(p, roomPlayerId));
                    if (!inT1 && !inT2) return;
                    foundHere = true;
                    const s1 = parseInt(match.score1 || 0);
                    const s2 = parseInt(match.score2 || 0);
                    const won = (inT1 && s1 > s2) || (inT2 && s2 > s1);
                    if (isOfficial) {
                        officialMatches++;
                        if (won) officialWins++;
                    } else {
                        totalMatches++;
                        if (won) totalWins++;
                    }
                };

                const savedT = Array.isArray(roomData.savedTournaments) ? roomData.savedTournaments : Object.values(roomData.savedTournaments || {});
                savedT.forEach(t => {
                    if (!t || !t.matches) return;
                    const tM = Array.isArray(t.matches) ? t.matches : Object.values(t.matches);
                    tM.forEach(m => processMatch(m, t.settings && t.settings.isOfficial === true));
                });
                const curM = Array.isArray(roomData.matches) ? roomData.matches : Object.values(roomData.matches || {});
                curM.forEach(m => processMatch(m, roomData.settings && roomData.settings.isOfficial === true));

                if (foundHere) roomsWithMe++;
                checked++; if (checked === roomNames.length) finish();
            }).catch(() => { checked++; if (checked === roomNames.length) finish(); });
        });
    }).catch(() => { if (!silent) showToast("Klaida perskaičiuojant."); });
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

// ==========================================
// EL. PAŠTO NUORODOS APDOROJIMAS PUSLAPIO STARTE
// ==========================================
// Jei vartotojas atėjo paspaudęs laiško nuorodą — užbaigiam prisijungimą.
// setTimeout: laukiam, kol užsikraus visi skriptai (admin funkcijos apibrėžtos vėliau).
setTimeout(function () { try { handleEmailLinkReturn(); } catch (e) { console.error('handleEmailLinkReturn:', e); } }, 400);
