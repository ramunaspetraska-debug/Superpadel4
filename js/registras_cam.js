// ==========================================
// SUPERPADEL CAM — IŠMANUSIS FILMAVIMAS IR AUTOMATINIAI HIGHLIGHTS
// ==========================================
//
// Architektūra (mobiliam pritaikyta, be sunkių bibliotekų):
//
//  1. VIENAS BENDRAS ĮRAŠINĖTOJAS (master) — vienintelė MediaRecorder sesija
//     1s gabaliukais aptarnauja VISKĄ: pilną įrašą, highlight klipus (su
//     pre-roll) ir 15s atsukimą. Vienas recorderis vietoj keturių = gerokai
//     mažiau baterijos ir kaitimo, stabilesni klipai (vienas šaltinis).
//     Režimai: 'record' — kaupia viską (pilnam įrašui);
//              'buffer' — laiko tik paskutines ~17s (vien atsukimui).
//
//  2. JUDĖJIMO VARIKLIS — kadrų skirtumo analizė (frame differencing) ant mažo
//     paslėpto canvas (~128x72), ~10 FPS. Lengvas telefonui, veikia iš bet
//     kokio kampo (ypač iš viršaus virš korto).
//
//  3. HIGHLIGHT KLIPAI — iškarpomi iš bendro buferio pagal laiką:
//     ralio pradžia - 3s (servas) ... ralio pabaiga. Jokio atskiro recorderio.
//
//  4. SAUGOJIMAS — tik maži highlight klipai (~5MB) keliami į Firebase Storage,
//     susieti su turnyro ID. Pilnas įrašas lieka telefone.
//
//  5. "MAČAS BE PRASTOVŲ" — highlight klipai grojami iš eilės peržiūros lange.

// ---------- BŪSENA ----------
let camStream = null;
let camQuality = '720';
let camMimeType = '';

// Bendras įrašinėtojas (master)
let masterRecorder = null;
let masterMode = 'off';        // 'off' | 'buffer' | 'record'
let masterHeader = null;       // pirmas gabaliukas su WebM/MP4 antrašte (būtinas atkūrimui)
let masterChunks = [];         // [{ blob, ts }] — 1s gabaliukai
let masterStopCallback = null; // kviečiamas po recorderio flush'o sustabdant

// Aktyvaus ralio žymos (klipas kerpamas iš masterChunks pagal laiką)
let clipStartTs = 0;           // kada prasidėjo ralis (be pre-roll)
let clipFromTs = 0;            // nuo kada imti gabaliukus (su pre-roll)
let clipActive = false;

let motionCanvas = null;
let motionCtx = null;
let motionPrevFrame = null;
let motionRAF = null;
let motionLastSample = 0;
let recordingActive = false;
let recStartTime = 0;
let recTimerInt = null;

let rallyState = 'idle';
let rallyHighMotionFrames = 0;
let rallyLowMotionStart = 0;
let rallyClipStartedAt = 0;

let highlightClips = [];

// ---------- INSTANT REPLAY (15s atsukimas) ----------
let replayEnabled = false;
const REPLAY_SEC = 15;

let camTournamentId = null;
let camTournamentPlayers = [];

// ---------- KONSTANTOS (derinama pagal kortą/apšvietimą) ----------
const MOTION_PIXEL_DELTA = 24;       // mažesnis = jautresnis judesiui
const MOTION_RATIO_TRIGGER = 0.035;  // atsarginis slenkstis (naudojamas ir kaip „vidutinis")
const MOTION_FPS = 10;

// ---------- JAUTRUMAS IR AUTOMATINĖ KALIBRACIJA ----------
// Vartotojo pasirenkamas ralių gaudymo jautrumas + pirmųjų sekundžių fono
// matavimas: slenkstis pakeliamas virš natūralaus kadro triukšmo (šešėliai,
// žiūrovai už korto), kad skirtingose salėse veiktų vienodai.
const SENSITIVITY_TRIGGERS = { zemas: 0.06, vidutinis: 0.035, aukstas: 0.02 };
const CALIBRATION_MS = 4000;         // kiek laiko matuojamas fonas įrašo pradžioje
let camSensitivity = 'vidutinis';
try { camSensitivity = localStorage.getItem('camSensitivity') || 'vidutinis'; } catch (e) {}
if (!SENSITIVITY_TRIGGERS[camSensitivity]) camSensitivity = 'vidutinis';
let motionTriggerLevel = SENSITIVITY_TRIGGERS[camSensitivity];
let motionCalibrateUntil = 0;        // performance.now() riba, iki kada kalibruojama
let motionBaselineSamples = [];
let motionBaselineAvg = 0;

function camApplyTriggerLevel() {
    const userTrig = SENSITIVITY_TRIGGERS[camSensitivity] || MOTION_RATIO_TRIGGER;
    // fonas * 2.5 + nedidelė atsarga — bet niekada ne žemiau vartotojo pasirinkimo
    motionTriggerLevel = Math.max(userTrig, motionBaselineAvg * 2.5 + 0.008);
}

function setCamSensitivity(s) {
    if (!SENSITIVITY_TRIGGERS[s]) return;
    camSensitivity = s;
    try { localStorage.setItem('camSensitivity', s); } catch (e) {}
    syncSensitivityButtons();
    camApplyTriggerLevel();
    const labels = { zemas: "Ramus — tik ryškūs raliai", vidutinis: "Standartinis gaudymas", aukstas: "Jautrus — gaudo daugiau" };
    showToast(labels[s]);
}

function syncSensitivityButtons() {
    document.getElementById('camSensZemas')?.classList.toggle('active', camSensitivity === 'zemas');
    document.getElementById('camSensVidutinis')?.classList.toggle('active', camSensitivity === 'vidutinis');
    document.getElementById('camSensAukstas')?.classList.toggle('active', camSensitivity === 'aukstas');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncSensitivityButtons);
else syncSensitivityButtons();
const RALLY_START_FRAMES = 2;        // greičiau pradeda ralį
const RALLY_END_MS = 2500;           // ilgesnė pauzė prieš užbaigiant (ralis nepertrūksta)
const CLIP_MIN_MS = 3000;
const CLIP_MAX_MS = 35000;
const PREROLL_SEC = 3;               // kiek sekundžių prieš ralį įtraukti (servui)
const MASTER_CHUNK_MS = 1000;        // bendro buferio gabaliuko dydis

// ==========================================
// KAMEROS PALEIDIMAS / SUSTABDYMAS
// ==========================================

function getCamConstraints() {
    let q, fps;
    if (camQuality === '1080') { q = { width: { ideal: 1920 }, height: { ideal: 1080 } }; fps = { ideal: 30, max: 30 }; }
    else if (camQuality === '480') { q = { width: { ideal: 854 }, height: { ideal: 480 } }; fps = { ideal: 24, max: 30 }; }
    else { q = { width: { ideal: 1280 }, height: { ideal: 720 } }; fps = { ideal: 30, max: 30 }; }
    return {
        video: { facingMode: 'environment', frameRate: fps, ...q },
        audio: true
    };
}

// ---------- WAKE LOCK (ekranas neužminga, kol kamera/transliacija aktyvi) ----------
let camWakeLock = null;
async function camRequestWakeLock() {
    try { if ('wakeLock' in navigator && !camWakeLock) { camWakeLock = await navigator.wakeLock.request('screen'); } } catch (e) {}
}
function camReleaseWakeLock() {
    try { if (camWakeLock) { camWakeLock.release(); camWakeLock = null; } } catch (e) {}
}
// Užrakinimas automatiškai dingsta, kai puslapis paslepiamas — grįžus atstatom
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && camStream && !camWakeLock) camRequestWakeLock();
});

async function startCamera() {
    try {
        const videoElement = document.getElementById('cameraFeed');
        if (!videoElement || camStream) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Šis įrenginys nepalaiko kameros prieigos naršyklėje.");
            return;
        }
        camStream = await navigator.mediaDevices.getUserMedia(getCamConstraints());
        videoElement.srcObject = camStream;
        videoElement.play().catch(() => {});
        const hint = document.getElementById('cameraHintText');
        if (hint) hint.style.display = 'block';
        detectTournamentContext();
        // Naujas kameros srautas — jei atsukimas įjungtas, buferis perkuriamas ant naujo srauto
        if (replayEnabled && !recordingActive) restartMasterRecorder('buffer');
        camRequestWakeLock();
    } catch (err) {
        console.error("Camera error:", err);
        const hint = document.getElementById('cameraHintText');
        if (hint) hint.innerHTML = "Nepavyko pasiekti kameros.<br>Patikrinkite leidimus naršyklėje.";
    }
}

function stopCamera() {
    // Transliacijos metu kameros NESTABDOM — kitaip nutrūktų srautas (pvz. perėjus į kitą skirtuką).
    if (typeof rtcIsBroadcasting !== 'undefined' && rtcIsBroadcasting) return;
    if (recordingActive) stopSmartRecording();
    stopMasterRecorder();
    if (camStream) {
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
        const v = document.getElementById('cameraFeed');
        if (v) v.srcObject = null;
    }
    camReleaseWakeLock();
}

function setCamQuality(q) {
    if (recordingActive) { showToast("Kokybės keisti negalima filmuojant!"); return; }
    if (typeof rtcIsBroadcasting !== 'undefined' && rtcIsBroadcasting) { showToast("Kokybės keisti negalima transliacijos metu — sustabdykite ir pakeiskite."); return; }
    camQuality = q;
    document.getElementById('camQ480')?.classList.toggle('active', q === '480');
    document.getElementById('camQ720')?.classList.toggle('active', q === '720');
    document.getElementById('camQ1080')?.classList.toggle('active', q === '1080');
    if (camStream) {
        stopMasterRecorder(); // buferis (jei suktas) perkuriamas startCamera() metu ant naujo srauto
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
        startCamera();
    }
    showToast(q === '1080' ? "Kokybė: Full HD (1080p)" : (q === '480' ? "Kokybė: Duomenų taupymas (480p)" : "Kokybė: HD (720p)"));
}

function pickMimeType() {
    const candidates = [
        'video/mp4;codecs=h264,aac',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
    ];
    for (const c of candidates) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
    }
    return '';
}

// ==========================================
// BENDRAS ĮRAŠINĖTOJAS (master) — vienintelė MediaRecorder sesija
// ==========================================

// mode: 'record' — kaupia viską (pilnam įrašui); 'buffer' — tik paskutines REPLAY_SEC+2s
function startMasterRecorder(mode) {
    if (!camStream || masterRecorder) return false;
    camMimeType = camMimeType || pickMimeType();
    if (!camMimeType) return false;
    masterMode = mode;
    masterHeader = null;
    masterChunks = [];
    try {
        const bitrate = camQuality === '1080' ? 4000000 : (camQuality === '480' ? 1200000 : 2500000);
        masterRecorder = new MediaRecorder(camStream, { mimeType: camMimeType, videoBitsPerSecond: bitrate });
    } catch (e) {
        try { masterRecorder = new MediaRecorder(camStream); } catch (e2) { masterRecorder = null; masterMode = 'off'; return false; }
    }
    masterRecorder.ondataavailable = (e) => {
        if (!e.data || e.data.size === 0) return;
        // Pirmas gabaliukas turi failo antraštę — saugomas atskirai (reikalingas kiekvienam iškirpimui)
        if (!masterHeader) { masterHeader = e.data; return; }
        masterChunks.push({ blob: e.data, ts: Date.now() });
        if (masterMode === 'buffer') {
            const cutoff = Date.now() - (REPLAY_SEC + 2) * 1000;
            while (masterChunks.length > 0 && masterChunks[0].ts < cutoff) masterChunks.shift();
        }
    };
    masterRecorder.onstop = () => {
        masterRecorder = null;
        masterMode = 'off';
        const cb = masterStopCallback;
        masterStopCallback = null;
        if (cb) cb();
    };
    masterRecorder.start(MASTER_CHUNK_MS);
    return true;
}

// Sustabdo master; afterStop kviečiamas kai paskutinis gabaliukas jau surinktas
function stopMasterRecorder(afterStop) {
    if (masterRecorder && masterRecorder.state !== 'inactive') {
        masterStopCallback = afterStop || null;
        try { masterRecorder.stop(); } catch (e) {
            masterRecorder = null; masterMode = 'off'; masterStopCallback = null;
            if (afterStop) afterStop();
        }
    } else {
        masterRecorder = null;
        masterMode = 'off';
        if (afterStop) afterStop();
    }
}

function restartMasterRecorder(mode) {
    stopMasterRecorder(() => { startMasterRecorder(mode); });
}

// Iškerpa gabaliukus nuo fromTs (imtinai) iki dabar į vieną grojamą blob'ą
function sliceMasterBlob(fromTs) {
    if (!masterHeader) return null;
    const parts = masterChunks.filter(c => c.ts >= fromTs).map(c => c.blob);
    if (parts.length === 0) return null;
    return new Blob([masterHeader, ...parts], { type: camMimeType || 'video/webm' });
}

// ==========================================
// IŠMANUSIS FILMAVIMAS
// ==========================================

function toggleRecording() {
    if (!recordingActive) startSmartRecording();
    else stopSmartRecording();
}

function startSmartRecording() {
    if (!camStream) { showToast("Kamera dar neparuošta."); return; }
    camMimeType = camMimeType || pickMimeType();
    if (!camMimeType) { alert("Šis įrenginys nepalaiko vaizdo įrašymo naršyklėje."); return; }

    highlightClips.forEach(h => { if (h.url) URL.revokeObjectURL(h.url); });
    highlightClips = [];
    clipActive = false;
    if (pendingClip) { clearTimeout(pendingClip.timer); pendingClip = null; }
    rallyState = 'idle';
    rallyHighMotionFrames = 0;
    rallyLowMotionStart = 0;
    motionPrevFrame = null;

    // Vienas bendras įrašinėtojas viskam — jei sukosi atsukimo buferis, perkuriam švariai
    restartMasterRecorder('record');

    recordingActive = true;
    recStartTime = Date.now();

    // Fono kalibracija: pirmas kelias sekundes matuojamas natūralus kadro triukšmas
    motionBaselineSamples = [];
    motionBaselineAvg = 0;
    motionCalibrateUntil = performance.now() + CALIBRATION_MS;
    camApplyTriggerLevel();

    initMotionCanvas();
    motionLoop();

    const btn = document.getElementById('recordBtn');
    const indicator = document.getElementById('recIndicator');
    const resultPanel = document.getElementById('camResultPanel');
    const infoText = document.getElementById('camInfoText');
    const statusBadge = document.getElementById('rallyStatusBadge');
    if (btn) btn.classList.add('recording');
    if (indicator) indicator.style.display = 'flex';
    if (resultPanel) resultPanel.style.display = 'none';
    if (statusBadge) statusBadge.style.display = 'flex';
    if (infoText) infoText.innerHTML = "\u25cf Filmuojama. DI automatiškai gaudo geriausius ralius.";

    recTimerInt = setInterval(updateRecTimer, 1000);
    updateHighlightCounter();
}

function stopSmartRecording() {
    recordingActive = false;
    clearInterval(recTimerInt);
    if (motionRAF) cancelAnimationFrame(motionRAF);
    motionRAF = null;

    // Sustabdome master, sulaukiame paskutinio gabaliuko, tada iškerpame
    // nebaigtus klipus ir sudedame pilną įrašą. Jei atsukimas lieka įjungtas —
    // buferis paleidžiamas iš naujo.
    stopMasterRecorder(() => {
        flushPendingClips();
        onFullRecordingStopped();
        masterHeader = null;
        masterChunks = [];
        if (replayEnabled && camStream) startMasterRecorder('buffer');
    });

    const btn = document.getElementById('recordBtn');
    const indicator = document.getElementById('recIndicator');
    const statusBadge = document.getElementById('rallyStatusBadge');
    if (btn) btn.classList.remove('recording');
    if (indicator) indicator.style.display = 'none';
    if (statusBadge) statusBadge.style.display = 'none';
}

function updateRecTimer() {
    const s = Math.floor((Date.now() - recStartTime) / 1000);
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    const t = document.getElementById('recTimer');
    if (t) t.innerText = `${h}:${m}:${sec}`;
}

// ==========================================
// JUDĖJIMO DETEKCIJA (frame differencing)
// ==========================================

function initMotionCanvas() {
    if (!motionCanvas) {
        motionCanvas = document.createElement('canvas');
        motionCanvas.width = 128;
        motionCanvas.height = 72;
        motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
    }
    motionPrevFrame = null;
}

function motionLoop() {
    if (!recordingActive) return;
    motionRAF = requestAnimationFrame(motionLoop);

    const now = performance.now();
    if (now - motionLastSample < (1000 / MOTION_FPS)) return;
    motionLastSample = now;

    const video = document.getElementById('cameraFeed');
    if (!video || video.readyState < 2) return;

    try {
        motionCtx.drawImage(video, 0, 0, motionCanvas.width, motionCanvas.height);
        const frame = motionCtx.getImageData(0, 0, motionCanvas.width, motionCanvas.height);
        const score = computeMotionScore(frame);
        updateRallyState(score, now);
    } catch (e) { /* praleidžiam kadrą */ }
}

function computeMotionScore(frame) {
    const data = frame.data;
    if (!motionPrevFrame) {
        motionPrevFrame = data.slice(0);
        return 0;
    }
    let changed = 0;
    const total = motionCanvas.width * motionCanvas.height;
    for (let i = 0; i < data.length; i += 4) {
        const cur = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const prev = (motionPrevFrame[i] + motionPrevFrame[i + 1] + motionPrevFrame[i + 2]) / 3;
        if (Math.abs(cur - prev) > MOTION_PIXEL_DELTA) changed++;
    }
    motionPrevFrame = data.slice(0);
    return changed / total;
}

function updateRallyState(score, now) {
    const dot = document.getElementById('rallyStatusDot');
    const txt = document.getElementById('rallyStatusText');

    // Kalibracijos fazė: kaupiam foninius pavyzdžius, ralių dar negaudom
    if (motionCalibrateUntil && now < motionCalibrateUntil) {
        motionBaselineSamples.push(score);
        if (dot) dot.style.background = '#f59e0b';
        if (txt) txt.innerText = 'Kalibruojama...';
        return;
    }
    if (motionCalibrateUntil) {
        motionCalibrateUntil = 0;
        motionBaselineAvg = motionBaselineSamples.length
            ? motionBaselineSamples.reduce((a, b) => a + b, 0) / motionBaselineSamples.length
            : 0;
        camApplyTriggerLevel();
        if (dot) dot.style.background = '#22c55e';
        if (txt) txt.innerText = 'Pauzė';
    }

    const moving = score > motionTriggerLevel;

    if (rallyState === 'idle') {
        if (moving) {
            rallyHighMotionFrames++;
            if (rallyHighMotionFrames >= RALLY_START_FRAMES) {
                rallyState = 'active';
                rallyClipStartedAt = now;
                rallyLowMotionStart = 0;
                startClip();
                if (dot) dot.style.background = '#ef4444';
                if (txt) txt.innerText = 'Ralis vyksta';
            }
        } else {
            rallyHighMotionFrames = 0;
        }
    } else if (rallyState === 'active') {
        if (now - rallyClipStartedAt > CLIP_MAX_MS) {
            endRally(now);
            return;
        }
        if (moving) {
            rallyLowMotionStart = 0;
        } else {
            if (rallyLowMotionStart === 0) rallyLowMotionStart = now;
            else if (now - rallyLowMotionStart > RALLY_END_MS) {
                endRally(now);
            }
        }
    }
}

function endRally(now) {
    rallyState = 'idle';
    rallyHighMotionFrames = 0;
    rallyLowMotionStart = 0;
    finalizeClip();
    const dot = document.getElementById('rallyStatusDot');
    const txt = document.getElementById('rallyStatusText');
    if (dot) dot.style.background = '#22c55e';
    if (txt) txt.innerText = 'Pauzė';
}

// ==========================================
// HIGHLIGHT KLIPO ĮRAŠYMAS
// ==========================================

// Ralio pradžia: pažymime, nuo kada kirpti (su pre-roll — servas prieš ralį).
// Jokio naujo recorderio — klipas vėliau iškerpamas iš bendro buferio.
function startClip() {
    if (clipActive) return;
    clipActive = true;
    clipStartTs = Date.now();
    clipFromTs = clipStartTs - PREROLL_SEC * 1000;
}

let pendingClip = null; // { startedTs, fromTs, thumb, timer } — klipas, laukiantis paskutinio gabaliuko

// Mažas kadras iš kameros vaizdo (miniatiūra klipų sąrašui) — ~10 KB JPEG
function captureThumb() {
    try {
        const video = document.getElementById('cameraFeed');
        if (!video || video.readyState < 2) return null;
        const c = document.createElement('canvas');
        c.width = 160; c.height = 90;
        c.getContext('2d').drawImage(video, 0, 0, 160, 90);
        return c.toDataURL('image/jpeg', 0.6);
    } catch (e) { return null; }
}

// Ralio pabaiga: iškerpame gabaliukus [ralio pradžia - 3s ... dabar] į klipą.
// Mažas uždelsimas leidžia master'iui atiduoti paskutinį dar nepilną gabaliuką.
function finalizeClip() {
    if (!clipActive) return;
    clipActive = false;
    const p = { startedTs: clipStartTs, fromTs: clipFromTs, thumb: captureThumb(), timer: null };
    pendingClip = p;
    p.timer = setTimeout(() => {
        if (pendingClip === p) pendingClip = null;
        onClipReady(p.startedTs, p.fromTs, p.thumb);
    }, MASTER_CHUNK_MS + 200);
}

// Iškerpa laukiančius klipus IŠKART — kviečiama sustabdžius master, kai visi
// gabaliukai jau surinkti, o buferis tuoj bus išvalytas.
function flushPendingClips() {
    if (clipActive) { clipActive = false; onClipReady(clipStartTs, clipFromTs, captureThumb()); }
    if (pendingClip) {
        clearTimeout(pendingClip.timer);
        const p = pendingClip;
        pendingClip = null;
        onClipReady(p.startedTs, p.fromTs, p.thumb);
    }
}

function onClipReady(startedTs, fromTs, thumb) {
    const rallyMs = Date.now() - startedTs;

    // Atmetame per trumpus ralius (rallyMs — be pre-roll)
    if (rallyMs < CLIP_MIN_MS) return;

    const blob = sliceMasterBlob(fromTs);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const entry = {
        blob, url,
        thumb: thumb || null,
        durationSec: Math.round(rallyMs / 1000 + PREROLL_SEC), // + pre-roll
        ts: Date.now(),
        uploaded: false
    };
    highlightClips.push(entry);
    updateHighlightCounter();
    autoUploadHighlight(entry);
}

function updateHighlightCounter() {
    const el = document.getElementById('highlightCounter');
    if (el) el.innerText = highlightClips.length;
    if (recordingActive) {
        const cnt = document.getElementById('liveHighlightCount');
        if (cnt) cnt.innerText = highlightClips.length;
    }
}

// ==========================================
// PABAIGTO MAČO REZULTATŲ LANGAS (3 mygtukai)
// ==========================================

function onFullRecordingStopped() {
    const totalSec = Math.floor((Date.now() - recStartTime) / 1000);
    const blob = (masterHeader && masterChunks.length)
        ? new Blob([masterHeader, ...masterChunks.map(c => c.blob)], { type: camMimeType || 'video/webm' })
        : null;
    window._fullMatchBlob = blob;

    const sizeMB = blob ? (blob.size / (1024 * 1024)).toFixed(0) : '0';
    const durM = Math.floor(totalSec / 60);

    const panel = document.getElementById('camResultPanel');
    const info = document.getElementById('camResultInfo');
    const infoText = document.getElementById('camInfoText');
    if (info) info.innerHTML = `Trukmė: <b>${durM} min</b> &bull; Dydis: <b>${sizeMB} MB</b> &bull; Highlights: <b>${highlightClips.length}</b>`;
    if (panel) panel.style.display = 'block';
    if (infoText) infoText.innerHTML = "Mačas baigtas. Pasirinkite ką daryti su įrašu.";
}

function downloadFullMatch() {
    const blob = window._fullMatchBlob;
    if (!blob) { showToast("Įrašo nėra."); return; }
    triggerDownload(blob, 'pilnas');
    showToast("Pilnas įrašas atsisiunčiamas!");
}

function playMatchNoPauses() {
    if (highlightClips.length === 0) { showToast("DI neaptiko ralių. Pabandykite filmuoti su ryškesniais judesiais."); return; }
    openClipPlayer(highlightClips, 0, "Mačas be prastovų", true);
}

function showHighlightsList() {
    if (highlightClips.length === 0) { showToast("DI neaptiko ralių. Pabandykite filmuoti su ryškesniais judesiais."); return; }
    renderHighlightsModal();
}

function triggerDownload(blob, prefix) {
    const ext = (camMimeType && camMimeType.includes('mp4')) ? 'mp4' : 'webm';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}_${d.getHours()}-${d.getMinutes().toString().padStart(2,'0')}`;
    a.href = url;
    a.download = `SuperPadel_${prefix}_${stamp}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 8000);
}

// ==========================================
// KLIPŲ GROTUVAS (sekvencinė peržiūra)
// ==========================================

function openClipPlayer(clips, startIdx, title, continuous) {
    const old = document.getElementById('clip-player-modal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'clip-player-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;';
    wrap.innerHTML = `
        <div style="position:absolute;top:14px;left:0;right:0;text-align:center;color:white;font-weight:800;font-size:15px;">${esc(title)}</div>
        <div style="position:absolute;top:42px;left:0;right:0;text-align:center;color:#94a3b8;font-size:12px;" id="clipPlayerCounter"></div>
        <video id="clipPlayerVideo" playsinline autoplay controls style="max-width:100%;max-height:70vh;border-radius:12px;background:black;"></video>
        <div style="display:flex;gap:10px;margin-top:18px;align-items:center;">
            <button id="clipPlayerPrev" style="background:#1a202c;color:white;border:1px solid #4a5568;width:48px;height:48px;border-radius:50%;font-size:16px;cursor:pointer;"><i class="fa-solid fa-backward-step"></i></button>
            <div style="color:#94a3b8;font-size:11px;min-width:90px;text-align:center;">${continuous ? '<i class="fa-solid fa-play"></i> Auto-grojimas' : ''}</div>
            <button id="clipPlayerNext" style="background:#1a202c;color:white;border:1px solid #4a5568;width:48px;height:48px;border-radius:50%;font-size:16px;cursor:pointer;"><i class="fa-solid fa-forward-step"></i></button>
        </div>
        <button onclick="document.getElementById('clip-player-modal').remove()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);color:white;border:none;width:40px;height:40px;border-radius:50%;font-size:18px;cursor:pointer;">&times;</button>
    `;
    document.body.appendChild(wrap);

    const video = document.getElementById('clipPlayerVideo');
    const counter = document.getElementById('clipPlayerCounter');
    let idx = startIdx;

    const load = (i) => {
        idx = (i + clips.length) % clips.length;
        video.src = clips[idx].url;
        video.play().catch(() => {});
        if (counter) counter.innerText = `Ralis ${idx + 1} iš ${clips.length} \u2022 ${clips[idx].durationSec}s`;
    };
    // Vientisas grojimas: kitas ralis prasideda automatiškai (be pauzės tarp jų)
    video.onended = () => {
        if (continuous) {
            if (idx < clips.length - 1) load(idx + 1);
            // Pasiekus paskutinį — sustojam (nesikartoja)
        } else if (clips.length > 1) {
            load(idx + 1);
        }
    };
    document.getElementById('clipPlayerNext').onclick = () => load(idx + 1);
    document.getElementById('clipPlayerPrev').onclick = () => load(idx - 1);
    load(startIdx);
}

// ==========================================
// INSTANT REPLAY — 15s ATSUKIMAS (ginčui dėl taško)
// ==========================================

function toggleInstantReplay() {
    replayEnabled = !replayEnabled;
    const btn = document.getElementById('replayToggleBtn');
    const showBtn = document.getElementById('instantReplayBtn');
    if (replayEnabled) {
        if (!camStream) { showToast("Pirmiausia įjunkite kamerą."); replayEnabled = false; return; }
        // Jei įrašymas jau vyksta — atsukimas ims vaizdą iš to paties bendro buferio
        if (!recordingActive) startMasterRecorder('buffer');
        if (btn) { btn.style.background = '#16a34a'; btn.style.borderColor = '#16a34a'; btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> Pakartojimas: ĮJ'; }
        if (showBtn) showBtn.style.display = 'inline-flex';
        showToast("Pakartojimas įjungtas — kaupiamos paskutinės " + REPLAY_SEC + "s");
    } else {
        // Buferį stabdome tik jei jis suktas vien atsukimui (įrašymo neliečiam)
        if (!recordingActive) stopMasterRecorder();
        if (btn) { btn.style.background = '#0f172a'; btn.style.borderColor = '#334155'; btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> Pakartojimas: IŠJ'; }
        if (showBtn) showBtn.style.display = 'none';
        showToast("Pakartojimas išjungtas");
    }
}

function showInstantReplay() {
    if (!replayEnabled) { showToast("Pirmiausia įjunkite pakartojimą."); return; }
    const blob = sliceMasterBlob(Date.now() - REPLAY_SEC * 1000);
    if (!blob) { showToast("Dar kaupiamas vaizdas — palaukite kelias sekundes."); return; }
    openReplayPlayer(URL.createObjectURL(blob));
}

function openReplayPlayer(url) {
    const old = document.getElementById('replay-player-modal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'replay-player-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.93);z-index:10005;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;';
    wrap.innerHTML = `
        <div style="position:absolute;top:14px;left:0;right:0;text-align:center;color:white;font-weight:800;font-size:15px;"><i class="fa-solid fa-clock-rotate-left" style="color:#22c55e;"></i> Paskutinės ${REPLAY_SEC}s</div>
        <video id="replayPlayerVideo" playsinline autoplay controls loop style="max-width:100%;max-height:68vh;border-radius:12px;background:black;"></video>
        <div style="display:flex;gap:8px;margin-top:16px;align-items:center;flex-wrap:wrap;justify-content:center;">
            <button id="replaySpeedBtn" style="background:#1a202c;color:white;border:1px solid #4a5568;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:bold;cursor:pointer;">0.5x lėtai</button>
            <button id="replayRestartBtn" style="background:#1a202c;color:white;border:1px solid #4a5568;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:bold;cursor:pointer;"><i class="fa-solid fa-rotate-left"></i> Nuo pradžių</button>
        </div>
        <button id="replayCloseBtn" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);color:white;border:none;width:40px;height:40px;border-radius:50%;font-size:18px;cursor:pointer;">&times;</button>
    `;
    document.body.appendChild(wrap);
    const video = document.getElementById('replayPlayerVideo');
    video.src = url;
    video.play().catch(() => {});
    let slow = false;
    document.getElementById('replaySpeedBtn').onclick = (e) => {
        slow = !slow;
        video.playbackRate = slow ? 0.5 : 1.0;
        e.currentTarget.innerText = slow ? '1x normaliai' : '0.5x lėtai';
    };
    document.getElementById('replayRestartBtn').onclick = () => { video.currentTime = 0; video.play().catch(() => {}); };
    document.getElementById('replayCloseBtn').onclick = () => { try { URL.revokeObjectURL(url); } catch(e){} wrap.remove(); };
}

// ==========================================
// HIGHLIGHTS SĄRAŠO MODALAS
// ==========================================

function renderHighlightsModal() {
    const old = document.getElementById('highlights-modal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'highlights-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.7);z-index:10000;display:flex;align-items:flex-end;justify-content:center;';
    wrap.innerHTML = `
        <div style="background:white;border-radius:20px 20px 0 0;width:100%;max-width:480px;max-height:85vh;display:flex;flex-direction:column;padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <div style="font-weight:900;font-size:16px;color:#1e293b;"><i class="fa-solid fa-fire" style="color:#ef4444;"></i> Turnyro Highlights (${highlightClips.length})</div>
                <button onclick="document.getElementById('highlights-modal').remove()" style="background:#f1f5f9;border:none;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;">&times;</button>
            </div>
            <div id="highlightsListBox" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;"></div>
        </div>
    `;
    document.body.appendChild(wrap);

    const box = document.getElementById('highlightsListBox');
    box.innerHTML = highlightClips.map((h, i) => {
        const thumbHtml = h.thumb
            ? `<img src="${h.thumb}" style="width:100%;height:100%;object-fit:cover;" alt="">`
            : '<i class="fa-solid fa-play"></i>';
        return `
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;display:flex;align-items:center;gap:12px;">
            <div onclick="openClipPlayer(highlightClips, ${i}, 'Highlight ${i+1}')" style="width:70px;height:48px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;cursor:pointer;flex-shrink:0;overflow:hidden;">${thumbHtml}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:800;font-size:13px;color:#1e293b;">Ralis ${i + 1}</div>
                <div style="font-size:11px;color:#64748b;">${h.durationSec}s ${h.uploaded ? '\u2022 <span style="color:#16a34a;">debesyje \u2713</span>' : ''}</div>
            </div>
            <button onclick="shareLocalHighlight(${i})" title="Dalintis" style="background:#16a34a;color:white;border:none;width:36px;height:36px;border-radius:10px;font-size:13px;cursor:pointer;flex-shrink:0;"><i class="fa-solid fa-share-nodes"></i></button>
            <button onclick="saveHighlightToGallery(${i})" title="\u012e galerij\u0105" style="background:#2563eb;color:white;border:none;width:36px;height:36px;border-radius:10px;font-size:13px;cursor:pointer;flex-shrink:0;"><i class="fa-solid fa-download"></i></button>
        </div>`;
    }).join('');
}

function saveHighlightToGallery(i) {
    const h = highlightClips[i];
    if (!h) return;
    triggerDownload(h.blob, `highlight_${i + 1}`);
    showToast("Highlight'as išsaugomas į galeriją!");
}

// ==========================================
// FIREBASE STORAGE ĮKĖLIMAS (tik highlights)
// ==========================================

function detectTournamentContext() {
    if (typeof currentLiveRoomName !== 'undefined' && currentLiveRoomName) {
        camTournamentId = currentLiveRoomName;
    } else if (typeof currentUser !== 'undefined' && currentUser) {
        camTournamentId = 'profilis_' + currentUser.id;
    } else {
        camTournamentId = 'bendri_highlights';
    }
}

let camUploadWarned = false;
function autoUploadHighlight(entry) {
    if (typeof firebase === 'undefined' || !firebase.storage) return;
    // Debesies taisyklės reikalauja prisijungimo — neprisijungus klipai lieka telefone
    if (!firebase.auth || !firebase.auth().currentUser) {
        if (!camUploadWarned) { camUploadWarned = true; showToast("Klipai liks tik telefone — prisijunkite, kad keltųsi į debesį."); }
        return;
    }
    if (!camTournamentId) detectTournamentContext();
    if (entry.blob.size > 8 * 1024 * 1024) {
        console.warn("Highlight per didelis Firebase įkėlimui:", entry.blob.size);
        return;
    }
    try {
        const ext = (camMimeType && camMimeType.includes('mp4')) ? 'mp4' : 'webm';
        const fname = `highlights/${camTournamentId}/${entry.ts}.${ext}`;
        const ref = firebase.storage().ref().child(fname);
        ref.put(entry.blob).then(snap => snap.ref.getDownloadURL()).then(downloadUrl => {
            entry.uploaded = true;
            entry.cloudUrl = downloadUrl;
            const rec = {
                url: downloadUrl,
                durationSec: entry.durationSec,
                ts: entry.ts,
                players: camTournamentPlayers || []
            };
            if (entry.thumb) rec.thumb = entry.thumb;
            firebase.database().ref(`padelio_highlights/${camTournamentId}`).push(rec);
            updateHighlightCounter();
        }).catch(err => console.warn("Highlight upload klaida:", err.message));
    } catch (e) {
        console.warn("Firebase Storage neprieinama:", e);
    }
}

// ==========================================
// TURNYRO HIGHLIGHTS GALERIJA (klipai iš debesies)
// ==========================================

let cloudHighlights = [];

function openTournamentHighlights(roomOverride) {
    if (typeof firebase === 'undefined') { showToast("Firebase neprieinamas."); return; }
    const room = roomOverride
        || (typeof currentLiveRoomName !== 'undefined' && currentLiveRoomName)
        || (document.getElementById('liveRoomInput')?.value || '').trim().toUpperCase();
    if (!room) { showToast("Įveskite kambario ID ir prisijunkite prie turnyro."); return; }

    document.getElementById('cloud-highlights-modal')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'cloud-highlights-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.7);z-index:10000;display:flex;align-items:flex-end;justify-content:center;';
    wrap.innerHTML = `
        <div style="background:white;border-radius:20px 20px 0 0;width:100%;max-width:480px;max-height:85vh;display:flex;flex-direction:column;padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="font-weight:900;font-size:16px;color:#1e293b;"><i class="fa-solid fa-fire" style="color:#ef4444;"></i> Highlights — ${esc(String(room))}</div>
                <button onclick="document.getElementById('cloud-highlights-modal').remove()" style="background:#f1f5f9;border:none;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;">&times;</button>
            </div>
            <div style="font-size:11px;color:#64748b;margin-bottom:12px;">Klipai debesyje saugomi 7 dienas — parsisiųskite tuos, kuriuos norite pasilikti.</div>
            <div id="cloudHlActions" style="display:none;margin-bottom:12px;">
                <button onclick="playCloudHighlightsAll()" style="width:100%;background:#2563eb;color:white;border:none;padding:12px;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;"><i class="fa-solid fa-bolt"></i> Žiūrėti viską iš eilės — mačas be prastovų</button>
            </div>
            <div id="cloudHlList" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;">
                <div style="text-align:center;padding:24px;color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> Kraunami klipai...</div>
            </div>
        </div>
    `;
    document.body.appendChild(wrap);

    firebase.database().ref('padelio_highlights/' + room).once('value').then(snap => {
        const data = snap.val() || {};
        cloudHighlights = Object.keys(data)
            .map(k => data[k])
            .filter(c => c && c.url)
            .sort((a, b) => (a.ts || 0) - (b.ts || 0));
        renderCloudHighlightsList();
    }).catch(err => {
        const box = document.getElementById('cloudHlList');
        if (box) box.innerHTML = '<div style="text-align:center;padding:24px;color:#ef4444;">Nepavyko įkelti klipų: ' + esc(err.message || '') + '</div>';
    });
}

function renderCloudHighlightsList() {
    const box = document.getElementById('cloudHlList');
    if (!box) return;
    if (cloudHighlights.length === 0) {
        box.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;"><i class="fa-solid fa-video-slash" style="font-size:24px;display:block;margin-bottom:8px;"></i>Šis turnyras dar neturi klipų.<br><span style="font-size:11px;">Filmuokite kameros skirtuke — geriausi raliai atsiras čia automatiškai.</span></div>';
        return;
    }
    const actions = document.getElementById('cloudHlActions');
    if (actions) actions.style.display = 'block';
    box.innerHTML = cloudHighlights.map((c, i) => {
        const t = new Date(c.ts || 0);
        const hh = t.getHours().toString().padStart(2, '0');
        const mm = t.getMinutes().toString().padStart(2, '0');
        const thumb = c.thumb
            ? `<img src="${c.thumb}" style="width:100%;height:100%;object-fit:cover;" alt="">`
            : '<i class="fa-solid fa-play"></i>';
        return `
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;display:flex;align-items:center;gap:12px;">
            <div onclick="playCloudHighlight(${i})" style="width:70px;height:48px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;cursor:pointer;flex-shrink:0;overflow:hidden;">${thumb}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:800;font-size:13px;color:#1e293b;">Ralis ${i + 1}</div>
                <div style="font-size:11px;color:#64748b;">${parseInt(c.durationSec) || '?'}s &bull; ${hh}:${mm}</div>
            </div>
            <button onclick="shareCloudHighlight(${i})" title="Dalintis" style="background:#16a34a;color:white;border:none;width:36px;height:36px;border-radius:10px;font-size:13px;cursor:pointer;flex-shrink:0;"><i class="fa-solid fa-share-nodes"></i></button>
            <button onclick="downloadCloudHighlight(${i})" title="Atsisiųsti" style="background:#2563eb;color:white;border:none;width:36px;height:36px;border-radius:10px;font-size:13px;cursor:pointer;flex-shrink:0;"><i class="fa-solid fa-download"></i></button>
        </div>`;
    }).join('');
}

function playCloudHighlight(i) {
    if (!cloudHighlights[i]) return;
    openClipPlayer(cloudHighlights, i, 'Ralis ' + (i + 1));
}

function playCloudHighlightsAll() {
    if (cloudHighlights.length === 0) return;
    openClipPlayer(cloudHighlights, 0, 'Mačas be prastovų', true);
}

function shareCloudHighlight(i) {
    const c = cloudHighlights[i];
    if (!c) return;
    if (navigator.share) {
        navigator.share({ title: 'SuperPadel highlight', text: 'Pažiūrėk šį ralį! 🎾', url: c.url }).catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(c.url).then(() => showToast("Nuoroda nukopijuota!")).catch(() => showToast(c.url));
    } else {
        showToast(c.url);
    }
}

async function downloadCloudHighlight(i) {
    const c = cloudHighlights[i];
    if (!c) return;
    showToast("Siunčiama...");
    try {
        const resp = await fetch(c.url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const blob = await resp.blob();
        triggerDownload(blob, 'highlight_' + (i + 1));
        showToast("Klipas išsaugomas!");
    } catch (e) {
        window.open(c.url, '_blank'); // atsarginis kelias — atidaryti tiesiogiai
    }
}
