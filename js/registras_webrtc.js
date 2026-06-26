// ==========================================
// SUPERPADEL WEBRTC — TIESIOGINĖ TRANSLIACIJA (P2P)
// ==========================================
//
// ETAPAS 2A: Signaling pagrindas (siuntėjas + 1 žiūrovas, su PIN)
//
// Kaip veikia:
//   Žaidėjas (siuntėjas) ──VIDEO tiesiai──> Žiūrovas
//          │                                    │
//          └──── signaling (Firebase) ──────────┘
//                offer/answer/ICE candidates
//
// Video srautas NEINA per Firebase — tik "supažindinimas". Firebase laiko
// tik tekstinius signaling duomenis (keli KB).
//
// SVARBU dėl NAT/firewall:
//   - Naudojami nemokami Google STUN serveriai (~70% atvejų pakanka)
//   - Jei skirtingi mobilūs tinklai neprisijungia — reikės TURN serverio (vėliau)

// ICE serveriai — nemokami Google STUN
const WEBRTC_ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// ---------- SIUNTĖJO (žaidėjo) BŪSENA ----------
let rtcBroadcastId = null;       // unikalus transliacijos ID
let rtcBroadcastPin = null;      // PIN kodas (privačiai transliacijai)
let rtcIsBroadcasting = false;
let rtcPeerConnections = {};     // { viewerId: RTCPeerConnection } — keliems žiūrovams (2B)
let rtcSignalRef = null;         // Firebase signaling šaka
let rtcViewerCount = 0;

// ---------- ŽIŪROVO BŪSENA ----------
let rtcViewerPC = null;          // žiūrovo peer connection
let rtcViewerSignalRef = null;
let rtcViewerId = null;
// Auto-prisijungimas nutrūkus ryšiui
let rtcViewerBroadcastId = null;
let rtcViewerPin = null;
let rtcViewerShouldReconnect = false;
let rtcViewerReconnectAttempts = 0;
let rtcViewerReconnectTimer = null;
let rtcViewerGraceTimer = null;
const RTC_MAX_RECONNECT = 10;

const RTC_SIGNAL_KEY = 'padelio_webrtc_signals';
const RTC_BROADCAST_KEY = 'padelio_webrtc_broadcasts';

// ==========================================
// SIUNTĖJAS (ŽAIDĖJAS) — pradeda transliaciją
// ==========================================

// Generuoja 4 skaitmenų PIN
function rtcGeneratePin() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Greitas kelias iš LIVE lango: pereina į kameros skirtuką (kamera pati įsijungia),
// palaukia kol pasiruoš, ir atidaro transliacijos tipo pasirinkimą.
function startPhoneCameraBroadcast() {
    if (typeof closeLiveModal === 'function') closeLiveModal();
    const camNav = document.querySelector('.nav-cam');
    if (camNav) camNav.click();
    else if (typeof switchTab === 'function') switchTab('page-cam', null);
    if (typeof showToast === 'function') showToast("Įjungiama kamera...");
    let tries = 0;
    const t = setInterval(() => {
        tries++;
        if (typeof camStream !== 'undefined' && camStream) {
            clearInterval(t);
            if (typeof rtcAskBroadcastType === 'function') rtcAskBroadcastType();
        } else if (tries > 30) {   // ~6s — leidžiam vartotojui pačiam
            clearInterval(t);
            if (typeof showToast === 'function') showToast("Įjunkite kamerą ir spauskite „Transliuoti tiesiogiai“.");
        }
    }, 200);
}

// Pradeda WebRTC transliaciją. isPrivate=true → reikalingas PIN.
async function startWebRTCBroadcast(isPrivate) {
    if (typeof firebase === 'undefined') { showToast("Firebase neprieinamas."); return; }
    if (!camStream) { showToast("Pirmiausia įjunkite kamerą."); return; }
    if (rtcIsBroadcasting) { showToast("Transliacija jau vyksta."); return; }

    // Sukuriame unikalų ID ir (jei privatu) PIN
    rtcBroadcastId = 'live_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    rtcBroadcastPin = isPrivate ? rtcGeneratePin() : null;
    rtcIsBroadcasting = true;
    rtcViewerCount = 0;
    rtcPeerConnections = {};

    // Nustatome transliacijos kontekstą
    if (typeof detectTournamentContext === 'function') detectTournamentContext();
    const roomName = (typeof camTournamentId !== 'undefined' && camTournamentId) ? camTournamentId : 'transliacija';
    const broadcasterName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : 'Žaidėjas';

    // Registruojame transliaciją viešame sąraše (žiūrovai matys)
    firebase.database().ref(`${RTC_BROADCAST_KEY}/${rtcBroadcastId}`).set({
        room: roomName,
        broadcaster: broadcasterName,
        isPrivate: !!isPrivate,
        pin: rtcBroadcastPin,            // PIN tikrinamas serveryje per taisykles (kol kas kliente)
        startedAt: Date.now(),
        viewers: 0
    });
    firebase.database().ref(`${RTC_BROADCAST_KEY}/${rtcBroadcastId}`).onDisconnect().remove();

    // Klausome naujų žiūrovų prisijungimų (jų "offer" užklausų)
    rtcSignalRef = firebase.database().ref(`${RTC_SIGNAL_KEY}/${rtcBroadcastId}/viewers`);
    rtcSignalRef.on('child_added', (snap) => {
        const viewerId = snap.key;
        const viewerData = snap.val();
        if (viewerData && viewerData.offer && !rtcPeerConnections[viewerId]) {
            handleViewerOffer(viewerId, viewerData.offer);
        }
    });

    rtcShowBroadcastStatus(isPrivate, roomName);
}

// Uždaro vieno žiūrovo ryšį (siuntėjo pusėje) ir išvalo jo signaling mazgą
function rtcCloseViewerPC(viewerId) {
    const pc = rtcPeerConnections[viewerId];
    if (pc) { if (pc._dropTimer) { clearTimeout(pc._dropTimer); pc._dropTimer = null; } try { pc.close(); } catch(e){} delete rtcPeerConnections[viewerId]; }
    if (rtcBroadcastId) { try { firebase.database().ref(`${RTC_SIGNAL_KEY}/${rtcBroadcastId}/viewers/${viewerId}`).remove(); } catch(e){} }
    rtcViewerCount = Object.keys(rtcPeerConnections).length;
    rtcUpdateViewerCount();
}

// Kai prisijungia žiūrovas — sukuriame jam atskirą peer connection
async function handleViewerOffer(viewerId, offer) {
    const pc = new RTCPeerConnection(WEBRTC_ICE_SERVERS);
    rtcPeerConnections[viewerId] = pc;

    // Pridedame kameros srautą
    camStream.getTracks().forEach(track => pc.addTrack(track, camStream));

    // Bitrate riba pagal pasirinktą kokybę (duomenų taupymui per mobilų internetą)
    try {
        const cap = (typeof camQuality !== 'undefined') ? ({ '480': 700000, '720': 1800000, '1080': 3500000 }[camQuality] || 1800000) : 1800000;
        pc.getSenders().filter(s => s.track && s.track.kind === 'video').forEach(s => {
            const p = s.getParameters();
            if (!p.encodings || !p.encodings.length) p.encodings = [{}];
            p.encodings[0].maxBitrate = cap;
            s.setParameters(p).catch(e => console.warn("setParameters:", e));
        });
    } catch (e) { console.warn("bitrate cap:", e); }

    // Mūsų ICE candidates → žiūrovui
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            firebase.database().ref(`${RTC_SIGNAL_KEY}/${rtcBroadcastId}/viewers/${viewerId}/broadcasterCandidates`).push(event.candidate.toJSON());
        }
    };

    pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') {
            if (pc._dropTimer) { clearTimeout(pc._dropTimer); pc._dropTimer = null; }
            rtcViewerCount = Object.keys(rtcPeerConnections).filter(id => rtcPeerConnections[id].connectionState === 'connected').length;
            rtcUpdateViewerCount();
        } else if (st === 'failed') {
            rtcCloseViewerPC(viewerId);
        } else if (st === 'disconnected') {
            // duodam progą ryšiui atsigauti pačiam; jei ne — uždarom
            if (!pc._dropTimer) {
                pc._dropTimer = setTimeout(() => {
                    pc._dropTimer = null;
                    const cur = rtcPeerConnections[viewerId];
                    if (cur && (cur.connectionState === 'disconnected' || cur.connectionState === 'failed')) rtcCloseViewerPC(viewerId);
                }, 6000);
            }
        }
    };

    // Priimame žiūrovo offer, siunčiame answer
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    firebase.database().ref(`${RTC_SIGNAL_KEY}/${rtcBroadcastId}/viewers/${viewerId}/answer`).set({
        type: answer.type, sdp: answer.sdp
    });

    // Klausome žiūrovo ICE candidates
    firebase.database().ref(`${RTC_SIGNAL_KEY}/${rtcBroadcastId}/viewers/${viewerId}/viewerCandidates`).on('child_added', (snap) => {
        const cand = snap.val();
        if (cand) pc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn("ICE add error:", e));
    });
}

function stopWebRTCBroadcast() {
    rtcIsBroadcasting = false;
    Object.values(rtcPeerConnections).forEach(pc => { try { pc.close(); } catch(e){} });
    rtcPeerConnections = {};
    if (rtcSignalRef) { rtcSignalRef.off(); rtcSignalRef = null; }
    if (rtcBroadcastId) {
        firebase.database().ref(`${RTC_BROADCAST_KEY}/${rtcBroadcastId}`).remove();
        firebase.database().ref(`${RTC_SIGNAL_KEY}/${rtcBroadcastId}`).remove();
    }
    rtcBroadcastId = null;
    rtcBroadcastPin = null;
    rtcViewerCount = 0;
    document.getElementById('rtc-broadcast-status')?.remove();
    // Jei nesame kameros skirtuke — sustabdom kamerą (kitaip liktų įjungta fone).
    const camPage = document.getElementById('page-cam');
    if (camPage && !camPage.classList.contains('active') && typeof stopCamera === 'function') stopCamera();
    showToast("Transliacija sustabdyta.");
}

function rtcUpdateViewerCount() {
    if (rtcBroadcastId) {
        firebase.database().ref(`${RTC_BROADCAST_KEY}/${rtcBroadcastId}/viewers`).set(rtcViewerCount);
    }
    const el = document.getElementById('rtcViewerCountDisplay');
    if (el) el.innerText = rtcViewerCount;
}

// ==========================================
// SIUNTĖJO STATUSO LANGAS
// ==========================================

function rtcShowBroadcastStatus(isPrivate, room) {
    document.getElementById('rtc-broadcast-status')?.remove();
    const roomReal = (room && !String(room).startsWith('profilis_') && room !== 'transliacija' && room !== 'bendri_highlights') ? room : null;
    const roomHtml = roomReal
        ? `<div style="background:rgba(22,163,74,0.13); border:1px solid rgba(22,163,74,0.35); border-radius:8px; padding:5px 8px; margin:4px 0 8px; font-size:11px; color:#22c55e; font-weight:bold;"><i class="fa-solid fa-trophy"></i> Turnyras: ${roomReal}</div>`
        : `<div style="background:rgba(51,65,85,0.2); border-radius:8px; padding:5px 8px; margin:4px 0 8px; font-size:10px; color:#94a3b8;">Neprijungta prie turnyro · bendra transliacija</div>`;
    const box = document.createElement('div');
    box.id = 'rtc-broadcast-status';
    box.style.cssText = 'position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:#0f172a; color:white; border-radius:14px; padding:14px 18px; z-index:9998; box-shadow:0 10px 30px rgba(0,0,0,0.4); text-align:center; min-width:220px; max-width:280px;';
    box.innerHTML = `
        <div style="font-weight:900; font-size:13px; margin-bottom:6px;"><span style="color:#ef4444;">🔴</span> Transliuojama tiesiogiai</div>
        ${roomHtml}
        ${isPrivate ? `<div style="background:#1e293b; border-radius:8px; padding:8px; margin:6px 0 10px;">
            <div style="font-size:10px; color:#94a3b8;">Privatus PIN — žiūrovui įvesti</div>
            <div style="font-size:24px; font-weight:900; letter-spacing:4px; color:#22c55e;">${rtcBroadcastPin}</div>
        </div>` : '<div style="font-size:11px; color:#94a3b8; margin:6px 0 10px;">Matoma „Korto peržiūroje" ir transliacijų sąraše</div>'}
        <div style="font-size:12px; color:#cbd5e1; margin-bottom:10px;"><i class="fa-solid fa-eye"></i> Žiūri: <span id="rtcViewerCountDisplay">0</span></div>
        <button onclick="stopWebRTCBroadcast()" style="background:#ef4444; color:white; border:none; padding:9px 16px; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer; width:100%;">Sustabdyti transliaciją</button>
    `;
    document.body.appendChild(box);
}

// ==========================================
// ŽIŪROVAS — prisijungia prie transliacijos
// ==========================================

async function watchWebRTCBroadcast(broadcastId, enteredPin) {
    if (typeof firebase === 'undefined') { showToast("Firebase neprieinamas."); return; }

    // Patikriname transliaciją ir PIN
    const bSnap = await firebase.database().ref(`${RTC_BROADCAST_KEY}/${broadcastId}`).once('value');
    const broadcast = bSnap.val();
    if (!broadcast) { showToast("Transliacija nerasta arba pasibaigė."); return; }
    if (broadcast.isPrivate && broadcast.pin !== enteredPin) {
        showToast("Neteisingas PIN kodas.");
        return;
    }

    // Įsimenam duomenis automatiniam pri(si)jungimui
    rtcViewerBroadcastId = broadcastId;
    rtcViewerPin = enteredPin;
    rtcViewerShouldReconnect = true;
    rtcViewerReconnectAttempts = 0;
    rtcViewerConnect();
}

// Sukuria (arba atkuria po trikdžio) žiūrovo ryšį su nauju viewerId
function rtcViewerConnect() {
    const broadcastId = rtcViewerBroadcastId;
    if (!broadcastId) return;
    rtcViewerId = 'viewer_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    rtcViewerPC = new RTCPeerConnection(WEBRTC_ICE_SERVERS);

    // Priimame video srautą
    rtcViewerPC.ontrack = (event) => {
        const video = document.getElementById('rtcViewerVideo');
        if (video && event.streams[0]) {
            video.srcObject = event.streams[0];
            video.play().catch(() => {});
            const status = document.getElementById('rtcViewerStatus');
            if (status) status.style.display = 'none';
            rtcViewerReconnectAttempts = 0; // sėkmingai prisijungta
        }
    };

    // Mūsų (žiūrovo) ICE candidates → siuntėjui
    rtcViewerPC.onicecandidate = (event) => {
        if (event.candidate) {
            firebase.database().ref(`${RTC_SIGNAL_KEY}/${broadcastId}/viewers/${rtcViewerId}/viewerCandidates`).push(event.candidate.toJSON());
        }
    };

    rtcViewerPC.onconnectionstatechange = () => {
        const st = rtcViewerPC ? rtcViewerPC.connectionState : null;
        if (st === 'connected') {
            rtcViewerReconnectAttempts = 0;
            if (rtcViewerGraceTimer) { clearTimeout(rtcViewerGraceTimer); rtcViewerGraceTimer = null; }
        } else if (st === 'failed') {
            rtcViewerScheduleReconnect();
        } else if (st === 'disconnected') {
            // trumpiems trikdžiams – progą atsigauti; jei ne, perjungiam
            if (!rtcViewerGraceTimer) {
                rtcViewerGraceTimer = setTimeout(() => {
                    rtcViewerGraceTimer = null;
                    const cur = rtcViewerPC ? rtcViewerPC.connectionState : null;
                    if (cur === 'disconnected' || cur === 'failed') rtcViewerScheduleReconnect();
                }, 5000);
            }
        }
    };

    (async () => {
        try {
            const offer = await rtcViewerPC.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
            await rtcViewerPC.setLocalDescription(offer);
            firebase.database().ref(`${RTC_SIGNAL_KEY}/${broadcastId}/viewers/${rtcViewerId}/offer`).set({ type: offer.type, sdp: offer.sdp });

            firebase.database().ref(`${RTC_SIGNAL_KEY}/${broadcastId}/viewers/${rtcViewerId}/answer`).on('value', (snap) => {
                const answer = snap.val();
                if (answer && rtcViewerPC && !rtcViewerPC.currentRemoteDescription) {
                    rtcViewerPC.setRemoteDescription(new RTCSessionDescription(answer)).catch(e => console.warn("setRemote error:", e));
                }
            });

            firebase.database().ref(`${RTC_SIGNAL_KEY}/${broadcastId}/viewers/${rtcViewerId}/broadcasterCandidates`).on('child_added', (snap) => {
                const cand = snap.val();
                if (cand && rtcViewerPC) rtcViewerPC.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn("ICE add error:", e));
            });

            rtcViewerSignalRef = firebase.database().ref(`${RTC_SIGNAL_KEY}/${broadcastId}/viewers/${rtcViewerId}`);
            rtcViewerSignalRef.onDisconnect().remove();
        } catch (e) {
            console.warn("viewer connect error:", e);
            rtcViewerScheduleReconnect();
        }
    })();
}

// Suplanuoja pakartotinį prisijungimą su didėjančiu laukimu (iki ribos)
function rtcViewerScheduleReconnect() {
    if (!rtcViewerShouldReconnect) return;       // vartotojas išėjo
    if (rtcViewerReconnectTimer) return;          // jau suplanuota
    const status = document.getElementById('rtcViewerStatus');
    if (rtcViewerReconnectAttempts >= RTC_MAX_RECONNECT) {
        if (status) { status.style.display = 'block'; status.innerHTML = 'Ryšys nutrūko.<br><button onclick="rtcViewerManualRetry()" style="margin-top:8px;padding:8px 16px;border:none;border-radius:8px;background:#22c55e;color:white;font-weight:bold;cursor:pointer;">Bandyti dar kartą</button>'; }
        return;
    }
    rtcViewerReconnectAttempts++;
    const delay = Math.min(1500 * rtcViewerReconnectAttempts, 7000);
    if (status) { status.style.display = 'block'; status.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Atkuriamas ryšys... (${rtcViewerReconnectAttempts})`; }
    rtcViewerReconnectTimer = setTimeout(async () => {
        rtcViewerReconnectTimer = null;
        // jei transliacija pasibaigė — nebekartojam
        try {
            const snap = await firebase.database().ref(`${RTC_BROADCAST_KEY}/${rtcViewerBroadcastId}`).once('value');
            if (!snap.val()) {
                rtcViewerShouldReconnect = false;
                rtcViewerCleanupConnection();
                const s2 = document.getElementById('rtcViewerStatus');
                if (s2) { s2.style.display = 'block'; s2.innerHTML = 'Transliacija pasibaigė.'; }
                return;
            }
        } catch (e) {}
        rtcViewerCleanupConnection();
        if (rtcViewerShouldReconnect) rtcViewerConnect();
    }, delay);
}

function rtcViewerManualRetry() {
    rtcViewerReconnectAttempts = 0;
    rtcViewerCleanupConnection();
    if (rtcViewerShouldReconnect && rtcViewerBroadcastId) rtcViewerConnect();
}

// Uždaro seną žiūrovo ryšį ir pašalina jo signaling mazgą (prieš atkuriant)
function rtcViewerCleanupConnection() {
    if (rtcViewerGraceTimer) { clearTimeout(rtcViewerGraceTimer); rtcViewerGraceTimer = null; }
    if (rtcViewerPC) { try { rtcViewerPC.close(); } catch(e){} rtcViewerPC = null; }
    if (rtcViewerSignalRef) { try { rtcViewerSignalRef.off(); rtcViewerSignalRef.remove(); } catch(e){} rtcViewerSignalRef = null; }
    rtcViewerId = null;
}

function stopWatchingWebRTC() {
    rtcViewerShouldReconnect = false;
    if (rtcViewerReconnectTimer) { clearTimeout(rtcViewerReconnectTimer); rtcViewerReconnectTimer = null; }
    if (rtcViewerGraceTimer) { clearTimeout(rtcViewerGraceTimer); rtcViewerGraceTimer = null; }
    rtcViewerReconnectAttempts = 0;
    rtcViewerBroadcastId = null;
    rtcViewerPin = null;
    if (rtcViewerPC) { try { rtcViewerPC.close(); } catch(e){} rtcViewerPC = null; }
    if (rtcViewerSignalRef) { try { rtcViewerSignalRef.remove(); rtcViewerSignalRef.off(); } catch(e){} rtcViewerSignalRef = null; }
    rtcViewerId = null;
    document.getElementById('rtc-viewer-modal')?.remove();
}

// ==========================================
// UI: SIUNTĖJO PASIRINKIMAS (vieša / privati)
// ==========================================

function rtcAskBroadcastType() {
    if (!camStream) { showToast("Pirmiausia įjunkite kamerą (paspauskite įrašymo zoną)."); return; }
    const old = document.getElementById('rtc-type-modal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'rtc-type-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.75);z-index:10001;display:flex;align-items:center;justify-content:center;padding:18px;';
    wrap.innerHTML = `
        <div style="background:white;border-radius:18px;padding:22px;width:100%;max-width:380px;">
            <div style="font-weight:900;font-size:16px;color:#1e293b;margin-bottom:4px;"><i class="fa-solid fa-tower-broadcast" style="color:#ef4444;"></i> Tiesioginė transliacija</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:16px;">Vaizdas iš jūsų telefono keliaus tiesiai žiūrovams (be YouTube/Twitch). Tinka 3-5 žiūrovams.</div>
            <button onclick="rtcStartPublic()" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:10px;background:white;cursor:pointer;text-align:left;">
                <div style="font-weight:800;font-size:14px;color:#1e293b;"><i class="fa-solid fa-globe" style="color:#2563eb;"></i> Vieša transliacija</div>
                <div style="font-size:11px;color:#64748b;margin-top:2px;">Bet kas iš LIVE sąrašo gali žiūrėti</div>
            </button>
            <button onclick="rtcStartPrivate()" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:14px;background:white;cursor:pointer;text-align:left;">
                <div style="font-weight:800;font-size:14px;color:#1e293b;"><i class="fa-solid fa-lock" style="color:#16a34a;"></i> Privati transliacija (PIN)</div>
                <div style="font-size:11px;color:#64748b;margin-top:2px;">Tik su PIN kodu — saugu nuo nepažįstamų</div>
            </button>
            <button onclick="document.getElementById('rtc-type-modal').remove()" style="width:100%;padding:12px;border:1px solid #cbd5e1;background:white;color:#64748b;border-radius:10px;font-weight:bold;font-size:13px;cursor:pointer;">Atšaukti</button>
        </div>
    `;
    document.body.appendChild(wrap);
}

function rtcStartPublic() {
    document.getElementById('rtc-type-modal')?.remove();
    startWebRTCBroadcast(false);
}

function rtcStartPrivate() {
    document.getElementById('rtc-type-modal')?.remove();
    startWebRTCBroadcast(true);
}

// ==========================================
// UI: ŽIŪROVO MODALAS (vaizdo peržiūra)
// ==========================================

function openWebRTCViewer(broadcastId, isPrivate, broadcasterName) {
    const old = document.getElementById('rtc-viewer-modal');
    if (old) old.remove();

    // Jei privatu — pirma PIN
    if (isPrivate) {
        const pin = prompt(`"${broadcasterName}" transliacija privati.\n\nĮveskite PIN kodą:`);
        if (!pin) return;
        rtcLaunchViewer(broadcastId, pin, broadcasterName);
    } else {
        rtcLaunchViewer(broadcastId, null, broadcasterName);
    }
}

function rtcLaunchViewer(broadcastId, pin, broadcasterName) {
    const wrap = document.createElement('div');
    wrap.id = 'rtc-viewer-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:#000;z-index:10002;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    wrap.innerHTML = `
        <div style="position:absolute;top:14px;left:0;right:0;text-align:center;color:white;font-weight:800;font-size:14px;z-index:2;"><span style="color:#ef4444;">🔴</span> ${broadcasterName || 'Transliacija'}</div>
        <video id="rtcViewerVideo" playsinline autoplay controls style="max-width:100%;max-height:100%;background:black;"></video>
        <div id="rtcViewerStatus" style="position:absolute;color:#94a3b8;font-size:13px;text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Jungiamasi prie transliacijos...</div>
        <button onclick="stopWatchingWebRTC()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);color:white;border:none;width:40px;height:40px;border-radius:50%;font-size:18px;cursor:pointer;z-index:2;">&times;</button>
    `;
    document.body.appendChild(wrap);
    watchWebRTCBroadcast(broadcastId, pin);
}

// ==========================================
// QR / NUORODA — kopijavimas ir automatinis prisijungimas
// ==========================================

function rtcCopyJoinLink(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => showToast("Nuoroda nukopijuota")).catch(() => showToast(url));
    } else {
        showToast(url);
    }
}

// Jei puslapis atidarytas su ?watch=ID (iš QR ar nuorodos) — paleidžiam žiūrovą
function rtcHandleWatchParam() {
    let params;
    try { params = new URLSearchParams(location.search); } catch (e) { return; }
    const watchId = params.get('watch');
    if (!watchId) return;
    const urlPin = params.get('pin');
    // Išvalom URL — kad perkrovus nesikartotų ir PIN nesimatytų adreso juostoje
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    let tries = 0;
    const tick = setInterval(() => {
        tries++;
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
            clearInterval(tick);
            firebase.database().ref(`${RTC_BROADCAST_KEY}/${watchId}`).once('value').then((snap) => {
                const b = snap.val();
                if (!b) { if (typeof showToast === 'function') showToast("Transliacija nerasta arba pasibaigė."); return; }
                const name = b.broadcaster || 'Transliacija';
                if (b.isPrivate) {
                    if (urlPin) rtcLaunchViewer(watchId, urlPin, name);
                    else openWebRTCViewer(watchId, true, name);   // paprašys PIN rankiniu būdu
                } else {
                    rtcLaunchViewer(watchId, null, name);
                }
            }).catch(() => {});
        } else if (tries > 100) { clearInterval(tick); }   // ~10s ir liaujamės
    }, 100);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rtcHandleWatchParam);
else rtcHandleWatchParam();
