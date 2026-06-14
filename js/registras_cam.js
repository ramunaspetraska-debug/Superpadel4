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

let camTournamentId = null;
let camTournamentPlayers = [];

// ---------- KONSTANTOS (derinama pagal kortą/apšvietimą) ----------
const MOTION_PIXEL_DELTA = 28;
const MOTION_RATIO_TRIGGER = 0.045;
const MOTION_FPS = 10;
const RALLY_START_FRAMES = 3;
const RALLY_END_MS = 2000;
const CLIP_MIN_MS = 4000;
const CLIP_MAX_MS = 30000;

// ==========================================
// KAMEROS PALEIDIMAS / SUSTABDYMAS
// ==========================================

function getCamConstraints() {
    const q = camQuality === '1080'
        ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };
    return {
        video: { facingMode: 'environment', frameRate: { ideal: 30, max: 30 }, ...q },
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
    } catch (err) {
        console.error("Camera error:", err);
        const hint = document.getElementById('cameraHintText');
        if (hint) hint.innerHTML = "Nepavyko pasiekti kameros.<br>Patikrinkite leidimus naršyklėje.";
    }
}

function stopCamera() {
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
    camQuality = q;
    document.getElementById('camQ720')?.classList.toggle('active', q === '720');
    document.getElementById('camQ1080')?.classList.toggle('active', q === '1080');
    if (camStream) {
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
        startCamera();
    }
    showToast(q === '1080' ? "Kokybė: Full HD (1080p)" : "Kokybė: HD (720p)");
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
    const durationMs = Date.now() - clipStartTs;
    clipRecorder = null;

    if (durationMs < CLIP_MIN_MS || clipChunks.length === 0) {
        clipChunks = [];
        return;
    }

    const blob = new Blob(clipChunks, { type: camMimeType || 'video/webm' });
    clipChunks = [];
    const url = URL.createObjectURL(blob);
    const entry = {
        blob, url,
        durationSec: Math.round(durationMs / 1000),
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
    if (highlightClips.length === 0) { showToast("Highlight'ų nerasta."); return; }
    openClipPlayer(highlightClips, 0, "Mačas be prastovų");
}

function showHighlightsList() {
    if (highlightClips.length === 0) { showToast("Highlight'ų nerasta."); return; }
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

function openClipPlayer(clips, startIdx, title) {
    const old = document.getElementById('clip-player-modal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'clip-player-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;';
    wrap.innerHTML = `
        <div style="position:absolute;top:14px;left:0;right:0;text-align:center;color:white;font-weight:800;font-size:15px;">${title}</div>
        <div style="position:absolute;top:42px;left:0;right:0;text-align:center;color:#94a3b8;font-size:12px;" id="clipPlayerCounter"></div>
        <video id="clipPlayerVideo" playsinline autoplay controls style="max-width:100%;max-height:70vh;border-radius:12px;background:black;"></video>
        <div style="display:flex;gap:10px;margin-top:18px;">
            <button id="clipPlayerPrev" style="background:#1a202c;color:white;border:1px solid #4a5568;width:48px;height:48px;border-radius:50%;font-size:16px;cursor:pointer;"><i class="fa-solid fa-backward-step"></i></button>
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
    video.onended = () => { if (clips.length > 1) load(idx + 1); };
    document.getElementById('clipPlayerNext').onclick = () => load(idx + 1);
    document.getElementById('clipPlayerPrev').onclick = () => load(idx - 1);
    load(startIdx);
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
