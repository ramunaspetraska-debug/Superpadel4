// ==========================================
// SUPERPADEL TV — didelio ekrano režimas klubui
// ==========================================
// Atidaroma TV/planšetės naršyklėje: registras.html?tv=1[&club=ID][&room=17]
//  • kai klubo turnyras VYKSTA (arba nurodytas &room) — gyvi kortų rezultatai;
//  • kitu metu — Lietuvos reitingų karuselė (lygiai keičiasi kas 12 s).
// Ekranas neužmiega (wake lock), duomenys atsinaujina gyvai.

let tvActive = false;
let tvRoomParam = null;
let tvClubParam = null;
let tvRoomRef = null;
let tvRoomData = null;
let tvPlayersCache = [];
let tvPlayersTs = 0;
let tvCarouselIdx = 0;
let tvTimer = null;
const TV_LEVELS = ['A', 'B-/B', 'C/C+', 'C-/C', 'D/C-', 'D'];
// Karuselės ciklas: 6 reitingų lygiai + 1 programos reklamos skaidrė.
// Reklama pasirodo po kiekvieno pilno lygių rato (~kas 1,5 min) 12-ai sekundžių —
// matoma dažnai, bet neužgožia reitingų, dėl kurių žmonės žiūri į ekraną.
const TV_SLIDES = TV_LEVELS.length + 1;

(function tvInit() {
    let params;
    try { params = new URLSearchParams(location.search); } catch (e) { return; }
    const tv = params.get('tv');
    if (!tv) return;
    tvRoomParam = params.get('room') || (tv !== '1' ? tv : null);
    tvClubParam = params.get('club') || null;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startTvMode);
    else startTvMode();
})();

function startTvMode() {
    if (tvActive) return;
    tvActive = true;
    const wrap = document.createElement('div');
    wrap.id = 'tv-mode';
    wrap.style.cssText = 'position:fixed;inset:0;background:#0b1220;z-index:20000;display:flex;flex-direction:column;overflow:hidden;cursor:none;';
    wrap.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:18px 28px;flex-shrink:0;">
            <div style="font-size:26px;font-weight:900;color:white;letter-spacing:1px;"><span style="color:#3b82f6;">SUPER</span>PADEL<span style="color:#64748b;">.LT</span></div>
            <div id="tvClock" style="font-size:24px;font-weight:800;color:#94a3b8;font-variant-numeric:tabular-nums;"></div>
        </div>
        <div id="tvContent" style="flex:1;padding:0 28px 24px;overflow:hidden;display:flex;flex-direction:column;"></div>
    `;
    document.body.appendChild(wrap);

    // Laikrodis
    const tickClock = () => {
        const el = document.getElementById('tvClock');
        if (el) { const d = new Date(); el.innerText = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    };
    tickClock();
    setInterval(tickClock, 15000);

    // Ekranas neužmiega
    try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}

    // Kambario klausymas: tiesioginis (&room=) arba pagal klubo vykstantį turnyrą
    if (tvRoomParam) tvListenRoom(String(tvRoomParam).toUpperCase());
    if (tvClubParam && typeof firebase !== 'undefined') {
        firebase.database().ref('padelio_global_tournaments').on('value', snap => {
            const raw = snap.val();
            const arr = (Array.isArray(raw) ? raw : Object.values(raw || {})).filter(Boolean);
            const liveT = arr.find(t => t && t.clubId === tvClubParam && t.room
                && typeof getTimeState === 'function' && getTimeState(t.date, t.time) === 'live');
            const room = liveT ? String(liveT.room).toUpperCase() : null;
            if (room && room !== tvListeningRoom()) tvListenRoom(room);
            if (!room && !tvRoomParam && tvRoomRef) { tvStopRoom(); }
        });
    }

    tvRender();
    tvTimer = setInterval(() => { tvCarouselIdx++; tvRender(); }, 12000);
}

let _tvListeningRoom = null;
function tvListeningRoom() { return _tvListeningRoom; }

function tvListenRoom(room) {
    tvStopRoom();
    if (typeof firebase === 'undefined' || typeof DB_KEY === 'undefined') return;
    _tvListeningRoom = room;
    tvRoomRef = firebase.database().ref(DB_KEY + '/' + room);
    tvRoomRef.on('value', snap => { tvRoomData = snap.val(); tvRender(); });
}

function tvStopRoom() {
    if (tvRoomRef) { try { tvRoomRef.off(); } catch (e) {} tvRoomRef = null; }
    tvRoomData = null;
    _tvListeningRoom = null;
}

function tvTeamName(team) {
    return (Array.isArray(team) ? team : []).map(p => (p && p.name) ? p.name : '?').join(' / ');
}

function tvRender() {
    const box = document.getElementById('tvContent');
    if (!box) return;

    // 1) GYVI MAČAI — jei klausomas kambarys turi nebaigtų mačų
    const matches = (tvRoomData && Array.isArray(tvRoomData.matches)) ? tvRoomData.matches : [];
    const active = matches.filter(m => m && !m.finished);
    if (active.length) {
        const done = matches.filter(m => m && m.finished).slice(-4).reverse();
        const cell = (m) => `
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:18px;padding:22px 26px;display:flex;flex-direction:column;gap:12px;">
                <div style="font-size:15px;font-weight:900;color:#f59e0b;letter-spacing:2px;">KORTAS ${m.court || '?'}${m.isFinal ? ' · ' + String(m.finalTitle || 'FINALAS').replace(/[<>]/g, '') : ''}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;">
                    <div style="font-size:26px;font-weight:800;color:white;flex:1;min-width:0;">${tvNameEsc(tvTeamName(m.team1))}</div>
                    <div style="font-size:44px;font-weight:900;color:#3b82f6;font-variant-numeric:tabular-nums;">${parseInt(m.score1) || 0}</div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;">
                    <div style="font-size:26px;font-weight:800;color:white;flex:1;min-width:0;">${tvNameEsc(tvTeamName(m.team2))}</div>
                    <div style="font-size:44px;font-weight:900;color:#3b82f6;font-variant-numeric:tabular-nums;">${parseInt(m.score2) || 0}</div>
                </div>
            </div>`;
        box.innerHTML = `
            <div style="font-size:18px;font-weight:900;color:#22c55e;letter-spacing:2px;margin-bottom:14px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ef4444;margin-right:8px;animation:pulse 1.5s infinite;"></span>VYKSTA DABAR — ${tvNameEsc(String((tvRoomData.settings && tvRoomData.settings.tournamentName) || _tvListeningRoom || ''))}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px;">${active.slice(0, 4).map(cell).join('')}</div>
            ${done.length ? `<div style="margin-top:18px;font-size:13px;font-weight:800;color:#64748b;letter-spacing:1px;">PASKUTINIAI REZULTATAI</div>
            <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;">${done.map(m => `<div style="background:#0f172a;border-radius:10px;padding:8px 14px;font-size:15px;color:#94a3b8;font-weight:700;">${tvNameEsc(tvTeamName(m.team1))} <b style="color:white;">${parseInt(m.score1) || 0}:${parseInt(m.score2) || 0}</b> ${tvNameEsc(tvTeamName(m.team2))}</div>`).join('')}</div>` : ''}
            <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}</style>`;
        return;
    }

    // 2) KARUSELĖ: 6 reitingų lygiai + programos reklama po kiekvieno rato
    const slide = tvCarouselIdx % TV_SLIDES;
    if (slide === TV_LEVELS.length) { renderTvAd(box); return; }

    tvLoadPlayers().then(() => {
        const level = TV_LEVELS[slide];
        const rows = tvPlayersCache
            .filter(p => (p.tier || 'D') === level)
            .sort((a, b) => (b.rating || 0) - (a.rating || 0))
            .slice(0, 10);
        const body = rows.length ? rows.map((p, i) => `
            <div style="display:flex;align-items:center;gap:18px;padding:10px 18px;background:${i % 2 ? 'transparent' : '#0f172a'};border-radius:12px;">
                <div style="width:44px;font-size:24px;font-weight:900;color:${i === 0 ? '#f59e0b' : (i === 1 ? '#94a3b8' : (i === 2 ? '#d97706' : '#475569'))};">${i + 1}</div>
                <div style="flex:1;font-size:24px;font-weight:800;color:white;">${tvNameEsc(p.name || '?')}</div>
                <div style="font-size:26px;font-weight:900;color:#3b82f6;font-variant-numeric:tabular-nums;">${p.rating || 300}</div>
            </div>`).join('')
            : `<div style="text-align:center;color:#475569;font-size:20px;padding:60px;">Šiame lygyje žaidėjų dar nėra</div>`;
        box.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;">
                <div style="font-size:20px;font-weight:900;color:#94a3b8;letter-spacing:2px;">LYGOS REITINGAI</div>
                <div style="font-size:30px;font-weight:900;color:white;">${tvNameEsc(level)} <span style="font-size:16px;color:#475569;">lyga</span></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">${body}</div>
            <div style="margin-top:auto;padding-top:14px;display:flex;gap:8px;justify-content:center;">
                ${Array.from({ length: TV_SLIDES }, (_, i) => `<div style="width:36px;height:5px;border-radius:3px;background:${i === slide ? '#3b82f6' : '#1e293b'};"></div>`).join('')}
            </div>`;
    });
}

// ---------- PROGRAMOS REKLAMOS SKAIDRĖ ----------
let _tvQrSvg = null;
function tvAdQr() {
    if (_tvQrSvg) return _tvQrSvg;
    try {
        const qr = qrcode(0, 'M');
        qr.addData('https://www.superpadel.lt/registras.html');
        qr.make();
        _tvQrSvg = qr.createSvgTag({ cellSize: 7, margin: 2, scalable: true });
        // baltas QR fonas skaitomumui iš toli
        _tvQrSvg = '<div style="background:white;padding:12px;border-radius:16px;display:inline-block;line-height:0;">' + _tvQrSvg.replace('<svg ', '<svg style="width:190px;height:190px;display:block;" ') + '</div>';
    } catch (e) { _tvQrSvg = ''; }
    return _tvQrSvg;
}

function renderTvAd(box) {
    const usp = (icon, title, sub) => `
        <div style="display:flex;align-items:center;gap:16px;background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:14px 18px;">
            <div style="font-size:30px;flex-shrink:0;">${icon}</div>
            <div style="min-width:0;">
                <div style="font-size:19px;font-weight:900;color:white;">${title}</div>
                <div style="font-size:14px;color:#94a3b8;font-weight:600;">${sub}</div>
            </div>
        </div>`;
    box.innerHTML = `
        <div style="flex:1;display:flex;align-items:center;gap:36px;min-height:0;">
            <div style="flex:1.4;display:flex;flex-direction:column;gap:12px;">
                <div style="font-size:44px;font-weight:900;color:white;letter-spacing:1px;line-height:1.1;">
                    <span style="color:#3b82f6;">SUPER</span>PADEL<span style="color:#64748b;">.LT</span>
                </div>
                <div style="font-size:20px;font-weight:800;color:#f59e0b;margin-bottom:6px;">Visi padelio turnyrai — tavo telefone</div>
                ${usp('📅', 'Registruokis į turnyrus internetu', 'Kalendorius, rezervo eilė ir priminimai į telefoną')}
                ${usp('🏆', 'Sek savo ELO reitingą', 'Oficiali ir mėgėjų lyga — matyk savo lygį Lietuvoje')}
                ${usp('🎥', 'DI gaudo tavo geriausius taškus', 'Automatiniai highlights klipai ir tiesioginės transliacijos')}
                ${usp('💬', 'Susirask žaidimą klubo chate', '„Ieškau žaidimo" skelbimai pagal lygį ir laiką')}
            </div>
            <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:14px;">
                ${tvAdQr()}
                <div style="font-size:18px;font-weight:900;color:white;text-align:center;">Nuskenuok ir<br>prisijunk nemokamai</div>
                <div style="font-size:15px;font-weight:700;color:#3b82f6;">www.superpadel.lt</div>
            </div>
        </div>
        <div style="padding-top:12px;display:flex;gap:8px;justify-content:center;">
            ${Array.from({ length: TV_SLIDES }, (_, i) => `<div style="width:36px;height:5px;border-radius:3px;background:${i === TV_LEVELS.length ? '#f59e0b' : '#1e293b'};"></div>`).join('')}
        </div>`;
}

function tvNameEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

function tvLoadPlayers() {
    if (typeof firebase === 'undefined') return Promise.resolve();
    if (tvPlayersCache.length && Date.now() - tvPlayersTs < 5 * 60000) return Promise.resolve();
    return firebase.database().ref('padelio_global_players').once('value').then(snap => {
        const v = snap.val() || {};
        tvPlayersCache = Object.keys(v).map(k => v[k]).filter(p => p && p.name);
        tvPlayersTs = Date.now();
    }).catch(() => {});
}
