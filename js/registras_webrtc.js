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

const RTC_SIGNAL_KEY = 'padelio_webrtc_signals';
const RTC_BROADCAST_KEY = 'padelio_webrtc_broadcasts';

// ==========================================
// SIUNTĖJAS (ŽAIDĖJAS) — pradeda transliaciją
// ==========================================

// Generuoja 4 skaitmenų PIN
function rtcGeneratePin() {
    return Math.floor(1000 + Math.random() * 9000).toString();
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

    rtcShowBroadcastStatus(isPrivate);
}

// Kai prisijungia žiūrovas — sukuriame jam atskirą peer connection
async function handleViewerOffer(viewerId, offer) {
    const pc = new RTCPeerConnection(WEBRTC_ICE_SERVERS);
    rtcPeerConnections[viewerId] = pc;

    // Pridedame kameros srautą
    camStream.getTracks().forEach(track => pc.addTrack(track, camStream));

    // Mūsų ICE candidates → žiūrovui
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            firebase.database().ref(`${RTC_SIGNAL_KEY}/${rtcBroadcastId}/viewers/${viewerId}/broadcasterCandidates`).push(event.candidate.toJSON());
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
            rtcViewerCount = Object.keys(rtcPeerConnections).filter(id => rtcPeerConnections[id].connectionState === 'connected').length;
            rtcUpdateViewerCount();
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            if (rtcPeerConnections[viewerId]) {
                rtcPeerConnections[viewerId].close();
                delete rtcPeerConnections[viewerId];
            }
            rtcViewerCount = Object.keys(rtcPeerConnections).length;
            rtcUpdateViewerCount();
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

function rtcShowBroadcastStatus(isPrivate) {
    document.getElementById('rtc-broadcast-status')?.remove();
    const box = document.createElement('div');
    box.id = 'rtc-broadcast-status';
    box.style.cssText = 'position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:#0f172a; color:white; border-radius:14px; padding:14px 18px; z-index:9998; box-shadow:0 10px 30px rgba(0,0,0,0.4); text-align:center; min-width:240px;';
    box.innerHTML = `
        <div style="font-weight:900; font-size:13px; margin-bottom:6px;"><span style="color:#ef4444;">🔴</span> Transliuojama tiesiogiai</div>
        ${isPrivate ? `<div style="background:#1e293b; border-radius:8px; padding:8px; margin:8px 0;">
            <div style="font-size:10px; color:#94a3b8;">PRIVATUS PIN KODAS</div>
            <div style="font-size:24px; font-weight:900; letter-spacing:4px; color:#22c55e;">${rtcBroadcastPin}</div>
            <div style="font-size:9px; color:#64748b;">Pasakykite šį kodą žiūrovams</div>
        </div>` : '<div style="font-size:10px; color:#94a3b8; margin:4px 0;">Vieša transliacija — bet kas gali žiūrėti</div>'}
        <div style="font-size:11px; color:#94a3b8; margin-bottom:8px;"><i class="fa-solid fa-eye"></i> Žiūri: <span id="rtcViewerCountDisplay">0</span></div>
        <button onclick="stopWebRTCBroadcast()" style="background:#ef4444; color:white; border:none; padding:8px 16px; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer; width:100%;">Sustabdyti transliaciją</button>
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
        }
    };

    // Mūsų (žiūrovo) ICE candidates → siuntėjui
    rtcViewerPC.onicecandidate = (event) => {
        if (event.candidate) {
            firebase.database().ref(`${RTC_SIGNAL_KEY}/${broadcastId}/viewers/${rtcViewerId}/viewerCandidates`).push(event.candidate.toJSON());
        }
    };

    rtcViewerPC.onconnectionstatechange = () => {
        const status = document.getElementById('rtcViewerStatus');
        if (rtcViewerPC.connectionState === 'failed') {
            if (status) status.innerHTML = 'Nepavyko prisijungti.<br><span style="font-size:11px;">Galbūt skirtingi tinklai blokuoja ryšį.</span>';
        }
    };

    // Sukuriame offer, siunčiame siuntėjui
    const offer = await rtcViewerPC.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
    await rtcViewerPC.setLocalDescription(offer);
    firebase.database().ref(`${RTC_SIGNAL_KEY}/${broadcastId}/viewers/${rtcViewerId}/offer`).set({
        type: offer.type, sdp: offer.sdp
    });

    // Laukiame siuntėjo answer
    firebase.database().ref(`${RTC_SIGNAL_KEY}/${broadcastId}/viewers/${rtcViewerId}/answer`).on('value', (snap) => {
        const answer = snap.val();
        if (answer && rtcViewerPC && !rtcViewerPC.currentRemoteDescription) {
            rtcViewerPC.setRemoteDescription(new RTCSessionDescription(answer)).catch(e => console.warn("setRemote error:", e));
        }
    });

    // Siuntėjo ICE candidates
    firebase.database().ref(`${RTC_SIGNAL_KEY}/${broadcastId}/viewers/${rtcViewerId}/broadcasterCandidates`).on('child_added', (snap) => {
        const cand = snap.val();
        if (cand && rtcViewerPC) rtcViewerPC.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn("ICE add error:", e));
    });

    rtcViewerSignalRef = firebase.database().ref(`${RTC_SIGNAL_KEY}/${broadcastId}/viewers/${rtcViewerId}`);
    rtcViewerSignalRef.onDisconnect().remove();
}

function stopWatchingWebRTC() {
    if (rtcViewerPC) { try { rtcViewerPC.close(); } catch(e){} rtcViewerPC = null; }
    if (rtcViewerSignalRef) { rtcViewerSignalRef.remove(); rtcViewerSignalRef.off(); rtcViewerSignalRef = null; }
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
