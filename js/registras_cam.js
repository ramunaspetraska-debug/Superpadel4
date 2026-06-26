// ==========================================
// SUPERPADEL CAM — IŠMANUSIS FILMAVIMAS IR AUTOMATINIAI HIGHLIGHTS
// ==========================================
//
// Architektūra (mobiliam pritaikyta, be sunkių bibliotekų):
//
//  1. PILNAS ĮRAŠAS  — viena nepertraukiama MediaRecorder sesija visą matčą.
//                      Naudojama "Atsisiųsti pilną įrašą".
//
//  2. JUDĖJIMO VARIKLIS — kadrų skirtumo analizė (frame differencing) ant mažo
//                      paslėpto canvas (~128x72), ~10 FPS. Lengvas telefonui,
//                      veikia iš bet kokio kampo (ypač iš viršaus virš korto).
//
//  3. HIGHLIGHT KLIPAI — atskira MediaRecorder sesija, aktyvi TIK ralio metu.
//                      Kiekvienas ralis = savarankiškas 15-25s WebM/MP4 klipas.
//
//  4. SAUGOJIMAS     — tik maži highlight klipai (~5MB) keliami į Firebase Storage,
//                      susieti su turnyro ID. Pilnas įrašas lieka telefone.
//
//  5. "MAČAS BE PRASTOVŲ" — highlight klipai grojami iš eilės peržiūros lange.

// ---------- BŪSENA ----------
let camStream = null;
let camQuality = '720';
let camMimeType = '';

let fullRecorder = null;
let fullChunks = [];

let clipRecorder = null;
let clipChunks = [];
let clipStartTs = 0;

// Pre-roll buferis — nuolat sukasi, laiko paskutines ~4s, kad pagautume servą
let bufferRecorder = null;
let bufferChunks = [];        // [{ blob, ts }]
let bufferHeaderChunk = null; // pirmas gabaliukas su WebM antrašte (būtinas atkūrimui)

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
let replayRecorder = null;
let replayChunks = [];          // [{ blob, ts }]
let replayHeader = null;        // pirmas gabaliukas su WebM antrašte
const REPLAY_SEC = 15;

let camTournamentId = null;
let camTournamentPlayers = [];

// ---------- KONSTANTOS (derinama pagal kortą/apšvietimą) ----------
const MOTION_PIXEL_DELTA = 24;       // mažesnis = jautresnis judesiui
const MOTION_RATIO_TRIGGER = 0.035;  // mažesnis = lengviau aptinka ralį
const MOTION_FPS = 10;
const RALLY_START_FRAMES = 2;        // greičiau pradeda ralį
const RALLY_END_MS = 2500;           // ilgesnė pauzė prieš užbaigiant (ralis nepertrūksta)
const CLIP_MIN_MS = 3000;
const CLIP_MAX_MS = 35000;
const PREROLL_SEC = 3;               // kiek sekundžių prieš ralį įtraukti (servui)
const PREBUFFER_CHUNK_MS = 1000;     // buferio gabaliuko dydis

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
        if (replayEnabled) { stopReplayBuffer(); startReplayBuffer(); }
    } catch (err) {
        console.error("Camera error:", err);
        const hint = document.getElementById('cameraHintText');
        if (hint) hint.innerHTML = "Nepavyko pasiekti kameros.<br>Patikrinkite leidimus naršyklėje.";
    }
}

function stopCamera() {
    stopReplayBuffer();
    if (recordingActive) stopSmartRecording();
    if (camStream) {
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
        const v = document.getElementById('cameraFeed');
        if (v) v.srcObject = null;
    }
}

function setCamQuality(q) {
    if (recordingActive) { showToast("Kokybės keisti negalima filmuojant!"); return; }
    if (typeof rtcIsBroadcasting !== 'undefined' && rtcIsBroadcasting) { showToast("Kokybės keisti negalima transliacijos metu — sustabdykite ir pakeiskite."); return; }
    camQuality = q;
    document.getElementById('camQ480')?.classList.toggle('active', q === '480');
    document.getElementById('camQ720')?.classList.toggle('active', q === '720');
    document.getElementById('camQ1080')?.classList.toggle('active', q === '1080');
    if (camStream) {
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
// IŠMANUSIS FILMAVIMAS
// ==========================================

function toggleRecording() {
    if (!recordingActive) startSmartRecording();
    else stopSmartRecording();
}

function startSmartRecording() {
    if (!camStream) { showToast("Kamera dar neparuošta."); return; }
    camMimeType = pickMimeType();
    if (!camMimeType) { alert("Šis įrenginys nepalaiko vaizdo įrašymo naršyklėje."); return; }

    fullChunks = [];
    highlightClips.forEach(h => { if (h.url) URL.revokeObjectURL(h.url); });
    highlightClips = [];
    rallyState = 'idle';
    rallyHighMotionFrames = 0;
    rallyLowMotionStart = 0;
    motionPrevFrame = null;

    const bitrate = camQuality === '1080' ? 4000000 : 2500000;
    try {
        fullRecorder = new MediaRecorder(camStream, { mimeType: camMimeType, videoBitsPerSecond: bitrate });
    } catch (e) {
        fullRecorder = new MediaRecorder(camStream);
    }
    fullRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) fullChunks.push(e.data); };
    fullRecorder.start(2000);

    // Pre-roll buferis — atskira sesija su 1s gabaliukais, laikoma tik paskutinė kelių sekundžių istorija
    bufferChunks = [];
    bufferHeaderChunk = null;
    try {
        const br = camQuality === '1080' ? 3500000 : 2200000;
        bufferRecorder = new MediaRecorder(camStream, { mimeType: camMimeType, videoBitsPerSecond: br });
        bufferRecorder.ondataavailable = (e) => {
            if (!e.data || e.data.size === 0) return;
            // Pirmas gabaliukas turi WebM antraštę — saugome atskirai
            if (!bufferHeaderChunk) {
                bufferHeaderChunk = e.data;
            } else {
                bufferChunks.push({ blob: e.data, ts: Date.now() });
                // Laikome tik paskutinių PREROLL_SEC+2 sekundžių gabaliukus
                const cutoff = Date.now() - (PREROLL_SEC + 2) * 1000;
                while (bufferChunks.length > 0 && bufferChunks[0].ts < cutoff) {
                    bufferChunks.shift();
                }
            }
        };
        bufferRecorder.start(PREBUFFER_CHUNK_MS);
    } catch (e) {
        bufferRecorder = null;
    }

    recordingActive = true;
    recStartTime = Date.now();

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

    if (clipRecorder && clipRecorder.state !== 'inactive') {
        finalizeClip();
    }

    // Sustabdome pre-roll buferį
    if (bufferRecorder && bufferRecorder.state !== 'inactive') {
        try { bufferRecorder.stop(); } catch (e) {}
    }
    bufferRecorder = null;
    bufferChunks = [];
    bufferHeaderChunk = null;

    if (fullRecorder && fullRecorder.state !== 'inactive') {
        fullRecorder.onstop = onFullRecordingStopped;
        fullRecorder.stop();
    } else {
        onFullRecordingStopped();
    }

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
    const moving = score > MOTION_RATIO_TRIGGER;
    const dot = document.getElementById('rallyStatusDot');
    const txt = document.getElementById('rallyStatusText');

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

function startClip() {
    if (!camStream || clipRecorder) return;
    clipChunks = [];
    clipStartTs = Date.now();

    // Į klipą iškart įdedame pre-roll buferį (servas prieš ralį):
    // antraštės gabaliukas + paskutinių ~3s gabaliukai
    if (bufferHeaderChunk) {
        clipChunks.push(bufferHeaderChunk);
        const cutoff = Date.now() - PREROLL_SEC * 1000;
        bufferChunks.forEach(c => { if (c.ts >= cutoff) clipChunks.push(c.blob); });
    }

    try {
        const br = camQuality === '1080' ? 3500000 : 2200000;
        clipRecorder = new MediaRecorder(camStream, { mimeType: camMimeType, videoBitsPerSecond: br });
    } catch (e) {
        try { clipRecorder = new MediaRecorder(camStream); } catch (e2) { clipRecorder = null; return; }
    }
    clipRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) clipChunks.push(e.data); };
    clipRecorder.onstop = onClipReady;
    clipRecorder.start();
}

function finalizeClip() {
    if (clipRecorder && clipRecorder.state !== 'inactive') {
        clipRecorder.stop();
    }
}

function onClipReady() {
    const rallyMs = Date.now() - clipStartTs;
    clipRecorder = null;

    // Atmetame per trumpus ralius (rallyMs — be pre-roll)
    if (rallyMs < CLIP_MIN_MS || clipChunks.length === 0) {
        clipChunks = [];
        return;
    }

    const blob = new Blob(clipChunks, { type: camMimeType || 'video/webm' });
    clipChunks = [];
    const url = URL.createObjectURL(blob);
    const entry = {
        blob, url,
        durationSec: Math.round((rallyMs / 1000) + PREROLL_SEC), // + pre-roll
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
    const blob = fullChunks.length ? new Blob(fullChunks, { type: camMimeType || 'video/webm' }) : null;
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
        <div style="position:absolute;top:14px;left:0;right:0;text-align:center;color:white;font-weight:800;font-size:15px;">${title}</div>
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
        startReplayBuffer();
        if (btn) { btn.style.background = '#16a34a'; btn.style.borderColor = '#16a34a'; btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> Pakartojimas: ĮJ'; }
        if (showBtn) showBtn.style.display = 'inline-flex';
        showToast("Pakartojimas įjungtas — kaupiamos paskutinės " + REPLAY_SEC + "s");
    } else {
        stopReplayBuffer();
        if (btn) { btn.style.background = '#0f172a'; btn.style.borderColor = '#334155'; btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> Pakartojimas: IŠJ'; }
        if (showBtn) showBtn.style.display = 'none';
        showToast("Pakartojimas išjungtas");
    }
}

// Nepertraukiamas paskutinių ~17s buferis (atskiras nuo highlight sistemos)
function startReplayBuffer() {
    if (!camStream || replayRecorder) return;
    const mime = camMimeType || pickMimeType();
    if (!mime) return;
    camMimeType = mime;
    replayChunks = [];
    replayHeader = null;
    try {
        const br = camQuality === '1080' ? 3500000 : (camQuality === '480' ? 800000 : 2200000);
        replayRecorder = new MediaRecorder(camStream, { mimeType: mime, videoBitsPerSecond: br });
        replayRecorder.ondataavailable = (e) => {
            if (!e.data || e.data.size === 0) return;
            // Pirmas gabaliukas turi WebM antraštę — saugome atskirai
            if (!replayHeader) { replayHeader = e.data; return; }
            replayChunks.push({ blob: e.data, ts: Date.now() });
            const cutoff = Date.now() - (REPLAY_SEC + 2) * 1000;
            while (replayChunks.length > 0 && replayChunks[0].ts < cutoff) replayChunks.shift();
        };
        replayRecorder.start(1000);
    } catch (e) { replayRecorder = null; console.warn("replay buffer:", e); }
}

function stopReplayBuffer() {
    if (replayRecorder) { try { replayRecorder.stop(); } catch(e){} replayRecorder = null; }
    replayChunks = [];
    replayHeader = null;
}

function showInstantReplay() {
    if (!replayEnabled) { showToast("Pirmiausia įjunkite pakartojimą."); return; }
    if (!replayHeader || replayChunks.length === 0) { showToast("Dar kaupiamas vaizdas — palaukite kelias sekundes."); return; }
    const cutoff = Date.now() - REPLAY_SEC * 1000;
    const recent = replayChunks.filter(c => c.ts >= cutoff).map(c => c.blob);
    if (recent.length === 0) { showToast("Per mažai vaizdo."); return; }
    const blob = new Blob([replayHeader, ...recent], { type: camMimeType });
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
    box.innerHTML = highlightClips.map((h, i) => `
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;display:flex;align-items:center;gap:12px;">
            <div onclick="openClipPlayer(highlightClips, ${i}, 'Highlight ${i+1}')" style="width:70px;height:48px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;cursor:pointer;flex-shrink:0;"><i class="fa-solid fa-play"></i></div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:800;font-size:13px;color:#1e293b;">Ralis ${i + 1}</div>
                <div style="font-size:11px;color:#64748b;">${h.durationSec}s ${h.uploaded ? '\u2022 <span style="color:#16a34a;">debesyje \u2713</span>' : ''}</div>
            </div>
            <button onclick="saveHighlightToGallery(${i})" style="background:#2563eb;color:white;border:none;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:bold;cursor:pointer;flex-shrink:0;"><i class="fa-solid fa-download"></i> Galerija</button>
        </div>
    `).join('');
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

function autoUploadHighlight(entry) {
    if (typeof firebase === 'undefined' || !firebase.storage) return;
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
            firebase.database().ref(`padelio_highlights/${camTournamentId}`).push({
                url: downloadUrl,
                durationSec: entry.durationSec,
                ts: entry.ts,
                players: camTournamentPlayers || []
            });
            updateHighlightCounter();
        }).catch(err => console.warn("Highlight upload klaida:", err.message));
    } catch (e) {
        console.warn("Firebase Storage neprieinama:", e);
    }
}
