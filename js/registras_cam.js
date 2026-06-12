// ==========================================
// SUPERPADEL CAM — TIKRAS ĮRAŠYMAS IR GINČŲ PERŽIŪRA
// ==========================================
// Funkcijos:
//  - Tikras vaizdo įrašymas (MediaRecorder)
//  - Ginčų peržiūra: vaizdas vėlinamas 15 s, kad žaidėjai galėtų
//    prieiti ir peržiūrėti ginčytiną epizodą
//  - Kokybės pasirinkimas (720p / 1080p)
//  - Įrašo atsisiuntimas ir dalinimasis (YouTube per Android Share)

let camStream = null;
let camRecorder = null;
let camChunks = [];           // visas įrašas atsisiuntimui
let camRecording = false;
let camTimerInt = null;
let camSeconds = 0;
let camMimeType = '';
let camQuality = '720';       // '720' arba '1080'

// Ginčų peržiūros (vėlinto vaizdo) būsena
const REPLAY_DELAY_SEC = 15;
let delayMediaSource = null;
let delaySourceBuffer = null;
let delayQueue = [];
let delayPlaybackStarted = false;
let delayCleanupInt = null;
let replayMode = false;       // ar šiuo metu rodomas vėlintas vaizdas

// ------------------------------------------
// KAMEROS PALEIDIMAS / SUSTABDYMAS
// ------------------------------------------

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
        const hint = document.getElementById('cameraHintText');
        if (hint) hint.style.display = 'block';
    } catch (err) {
        console.error("Camera error:", err);
        const hint = document.getElementById('cameraHintText');
        if (hint) hint.innerHTML = "Nepavyko pasiekti kameros.<br>Patikrinkite leidimus naršyklėje.";
    }
}

function stopCamera() {
    if (camRecording) stopRecordingInternal(false); // saugiai užbaigiam jei filmuojama
    if (camStream) {
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
        const v = document.getElementById('cameraFeed');
        if (v) v.srcObject = null;
    }
    exitReplayView();
}

function setCamQuality(q) {
    if (camRecording) { showToast("Kokybės keisti negalima filmuojant!"); return; }
    camQuality = q;
    document.getElementById('camQ720')?.classList.toggle('active', q === '720');
    document.getElementById('camQ1080')?.classList.toggle('active', q === '1080');
    // Perkraunam kamerą su nauja kokybe
    if (camStream) {
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
        startCamera();
    }
    showToast(q === '1080' ? "Kokybė: Full HD (1080p)" : "Kokybė: HD (720p)");
}

// ------------------------------------------
// ĮRAŠYMAS
// ------------------------------------------

function pickMimeType() {
    const candidates = [
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

function toggleRecording() {
    if (!camRecording) startRecordingInternal();
    else stopRecordingInternal(true);
}

function startRecordingInternal() {
    if (!camStream) { showToast("Kamera dar neparuošta."); return; }
    camMimeType = pickMimeType();
    if (!camMimeType) { alert("Šis įrenginys nepalaiko vaizdo įrašymo naršyklėje."); return; }

    camChunks = [];
    delayQueue = [];
    delayPlaybackStarted = false;

    const bitrate = camQuality === '1080' ? 4_000_000 : 2_500_000;
    try {
        camRecorder = new MediaRecorder(camStream, { mimeType: camMimeType, videoBitsPerSecond: bitrate });
    } catch (e) {
        camRecorder = new MediaRecorder(camStream);
    }

    camRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
            camChunks.push(e.data);
            feedDelayBuffer(e.data);
        }
    };
    camRecorder.onstop = onRecordingStopped;

    initDelayPipeline();
    camRecorder.start(1000); // gabaliukai kas 1 s — reikalinga vėlintam vaizdui
    camRecording = true;
    camSeconds = 0;

    const btn = document.getElementById('recordBtn');
    const indicator = document.getElementById('recIndicator');
    const infoText = document.getElementById('camInfoText');
    const replayBtn = document.getElementById('replayToggleBtn');
    const resultPanel = document.getElementById('camResultPanel');
    if (btn) btn.classList.add('recording');
    if (indicator) indicator.style.display = 'flex';
    if (replayBtn) replayBtn.style.display = 'flex';
    if (resultPanel) resultPanel.style.display = 'none';
    if (infoText) infoText.innerHTML = "● Filmuojama. Ginčų peržiūra bus pasiekiama po 15 sek.";

    camTimerInt = setInterval(() => {
        camSeconds++;
        const h = Math.floor(camSeconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((camSeconds % 3600) / 60).toString().padStart(2, '0');
        const s = (camSeconds % 60).toString().padStart(2, '0');
        const t = document.getElementById('recTimer');
        if (t) t.innerText = `${h}:${m}:${s}`;
        // Po 15 s aktyvuojame ginčų peržiūros galimybę
        if (camSeconds === REPLAY_DELAY_SEC) {
            startDelayedPlayback();
            const rb = document.getElementById('replayToggleBtn');
            if (rb) rb.classList.add('ready');
            if (infoText) infoText.innerHTML = "● Filmuojama. Ginčų peržiūra paruošta — spauskite ⏪";
        }
    }, 1000);
}

function stopRecordingInternal(showResult) {
    if (camRecorder && camRecorder.state !== 'inactive') {
        camRecorder._showResult = showResult;
        camRecorder.stop();
    }
    camRecording = false;
    clearInterval(camTimerInt);
    clearInterval(delayCleanupInt);

    const btn = document.getElementById('recordBtn');
    const indicator = document.getElementById('recIndicator');
    if (btn) btn.classList.remove('recording');
    if (indicator) indicator.style.display = 'none';
    exitReplayView();
}

function onRecordingStopped() {
    const showResult = camRecorder?._showResult !== false;
    if (!showResult || camChunks.length === 0) return;

    const blob = new Blob(camChunks, { type: camMimeType || 'video/webm' });
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
    const durM = Math.floor(camSeconds / 60);
    const durS = camSeconds % 60;

    window._lastRecordingBlob = blob;

    const panel = document.getElementById('camResultPanel');
    const info = document.getElementById('camResultInfo');
    const infoText = document.getElementById('camInfoText');
    if (info) info.innerText = `Trukmė: ${durM} min ${durS} s • Dydis: ${sizeMB} MB`;
    if (panel) panel.style.display = 'block';
    if (infoText) infoText.innerHTML = "Įrašas paruoštas. Atsisiųskite arba dalinkitės.";

    // Dalinimosi mygtukas rodomas tik jei įrenginys palaiko failų dalinimąsi
    const shareBtn = document.getElementById('camShareBtn');
    if (shareBtn) {
        const file = new File([blob], 'superpadel_match.webm', { type: blob.type });
        const canShare = navigator.canShare && navigator.canShare({ files: [file] });
        shareBtn.style.display = canShare ? 'block' : 'none';
    }
}

function downloadRecording() {
    const blob = window._lastRecordingBlob;
    if (!blob) { showToast("Įrašo nėra."); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}_${d.getHours()}-${d.getMinutes().toString().padStart(2,'0')}`;
    a.href = url;
    a.download = `SuperPadel_${stamp}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast("Įrašas atsisiunčiamas!");
}

async function shareRecording() {
    const blob = window._lastRecordingBlob;
    if (!blob) { showToast("Įrašo nėra."); return; }
    const file = new File([blob], 'superpadel_match.webm', { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'SuperPadel mačas',
                text: 'Padelio mačo įrašas iš SuperPadel.lt'
            });
        } catch (e) { /* vartotojas atšaukė */ }
    } else {
        showToast("Šis įrenginys nepalaiko dalinimosi. Naudokite Atsisiųsti.");
    }
}

// ------------------------------------------
// GINČŲ PERŽIŪRA (15 s vėlintas vaizdas)
// ------------------------------------------
// Veikimo principas: MediaRecorder gabaliukai (kas 1 s) paduodami į
// MediaSource buferį. Vėlinto vaizdo grotuvas pradeda groti tik po 15 s,
// todėl jis visada rodo tai, kas vyko prieš 15 sekundžių.

function initDelayPipeline() {
    const dv = document.getElementById('delayedFeed');
    if (!dv || !window.MediaSource) return;
    if (!MediaSource.isTypeSupported(camMimeType)) {
        console.warn("MediaSource nepalaiko:", camMimeType);
        return;
    }
    delayMediaSource = new MediaSource();
    dv.src = URL.createObjectURL(delayMediaSource);
    delayMediaSource.addEventListener('sourceopen', () => {
        try {
            delaySourceBuffer = delayMediaSource.addSourceBuffer(camMimeType);
            delaySourceBuffer.mode = 'sequence';
            delaySourceBuffer.addEventListener('updateend', pumpDelayQueue);
            pumpDelayQueue();
        } catch (e) { console.error("SourceBuffer error:", e); }
    });

    // Atminties valymas: kas 30 s pašaliname seniau nei 60 s mačiusį buferį
    delayCleanupInt = setInterval(() => {
        const v = document.getElementById('delayedFeed');
        if (delaySourceBuffer && !delaySourceBuffer.updating && v && v.currentTime > 60) {
            try { delaySourceBuffer.remove(0, v.currentTime - 45); } catch (e) {}
        }
    }, 30000);
}

function feedDelayBuffer(blobChunk) {
    if (!delaySourceBuffer) return;
    blobChunk.arrayBuffer().then(buf => {
        delayQueue.push(buf);
        pumpDelayQueue();
    });
}

function pumpDelayQueue() {
    if (!delaySourceBuffer || delaySourceBuffer.updating || delayQueue.length === 0) return;
    try {
        delaySourceBuffer.appendBuffer(delayQueue.shift());
    } catch (e) { /* buferis pilnas — praleidžiam, išsivalys */ }
}

function startDelayedPlayback() {
    const dv = document.getElementById('delayedFeed');
    if (!dv || delayPlaybackStarted) return;
    dv.currentTime = 0;
    dv.play().then(() => { delayPlaybackStarted = true; }).catch(() => {});
}

function toggleReplayView() {
    if (!camRecording) { showToast("Pirmiausia pradėkite filmavimą."); return; }
    if (!delayPlaybackStarted) { showToast(`Palaukite — peržiūra bus paruošta po ${Math.max(0, REPLAY_DELAY_SEC - camSeconds)} s`); return; }
    replayMode ? exitReplayView() : enterReplayView();
}

function enterReplayView() {
    replayMode = true;
    document.getElementById('cameraFeed')?.classList.add('hidden-feed');
    document.getElementById('delayedFeed')?.classList.add('visible-feed');
    document.getElementById('replayBadge')?.style.setProperty('display', 'flex');
    const rb = document.getElementById('replayToggleBtn');
    if (rb) rb.innerHTML = '<i class="fa-solid fa-video"></i> Grįžti į tiesioginį';
}

function exitReplayView() {
    replayMode = false;
    document.getElementById('cameraFeed')?.classList.remove('hidden-feed');
    document.getElementById('delayedFeed')?.classList.remove('visible-feed');
    document.getElementById('replayBadge')?.style.setProperty('display', 'none');
    const rb = document.getElementById('replayToggleBtn');
    if (rb) rb.innerHTML = '<i class="fa-solid fa-backward"></i> Ginčų peržiūra (-15 s)';
}
