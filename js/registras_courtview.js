// ==========================================
// SUPERPADEL — KORTO PERŽIŪRA (kelios kameros vienu metu + atsukimas)
// ==========================================
//
// Skirta planšetei/PC prie korto įėjimo: rodo kelias tiesiogines transliacijas
// (pvz. 2 telefonai iš priešingų kampų) vienu metu, kiekviena su savo 15s
// buferiu — žaidėjas pribėgęs gali atsukti ginčo tašką iš bet kurio kampo.
//
// Kiekviena "plytelė" = nepriklausomas žiūrovo ryšys (atskiras viewerId, PC,
// signaling mazgas, MediaRecorder buferis). Siuntėjas (telefonas) jau palaiko
// kelis žiūrovus (mesh), tad jo keisti nereikia.
//
// Naudoja globalus iš registras_webrtc.js: WEBRTC_ICE_SERVERS, RTC_SIGNAL_KEY,
// RTC_BROADCAST_KEY (NEdeklaruojame iš naujo — bendras scope).

let courtViewTiles = {};        // { broadcastId: tile }
let courtBroadcastsRef = null;  // Firebase .on('value') prenumerata
let courtLastData = {};         // paskutiniai žinomi broadcasts duomenys
let courtRoomFilter = null;     // jei nustatyta — rodom tik šio kambario (turnyro) kameras
const COURT_REPLAY_SEC = 15;
const COURT_MAX_TILES = 4;

// ------------------------------------------
// ATIDARYMAS / UŽDARYMAS
// ------------------------------------------

function openCourtView() {
    document.getElementById('court-view-modal')?.remove();
    courtViewTiles = {};
    const hasRoom = (typeof currentLiveRoomName !== 'undefined' && currentLiveRoomName);
    courtRoomFilter = hasRoom ? currentLiveRoomName : null;
    const wrap = document.createElement('div');
    wrap.id = 'court-view-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:#0b1220;z-index:10008;display:flex;flex-direction:column;';
    wrap.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:#0f172a;border-bottom:1px solid #1e293b;flex-shrink:0;">
            <div style="font-weight:900;font-size:15px;color:white;"><i class="fa-solid fa-table-cells-large" style="color:#22c55e;"></i> Korto peržiūra</div>
            <div style="flex:1;"></div>
            ${hasRoom ? `<button id="courtFilterBtn" onclick="courtToggleRoomFilter()" style="background:#1e293b;color:#22c55e;border:1px solid #16a34a;padding:7px 10px;border-radius:8px;font-size:11px;font-weight:bold;cursor:pointer;white-space:nowrap;"><i class="fa-solid fa-filter"></i> <span id="courtFilterLabel">Tik ${esc(currentLiveRoomName)}</span></button>` : ''}
            <button onclick="closeCourtView()" style="background:#ef4444;color:white;border:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:bold;cursor:pointer;">Uždaryti</button>
        </div>
        <div id="courtSources" style="display:flex;gap:8px;padding:10px 12px;overflow-x:auto;background:#0f172a;border-bottom:1px solid #1e293b;flex-shrink:0;min-height:54px;align-items:center;"></div>
        <div id="courtGrid" style="flex:1;display:flex;flex-wrap:wrap;gap:8px;padding:8px;overflow:auto;align-content:flex-start;"></div>
    `;
    document.body.appendChild(wrap);
    courtSetGridEmpty();

    if (typeof firebase === 'undefined') {
        const s = document.getElementById('courtSources');
        if (s) s.innerHTML = '<div style="color:#ef4444;font-size:12px;">Firebase neprieinamas.</div>';
        return;
    }
    // Gyvai sekam aktyvias transliacijas
    courtBroadcastsRef = firebase.database().ref(RTC_BROADCAST_KEY);
    courtBroadcastsRef.on('value', (snap) => {
        courtLastData = snap.val() || {};
        courtRenderSources(courtLastData);
        // Jei rodoma plytelė dingo iš sąrašo (transliacija baigėsi) — pažymim
        Object.keys(courtViewTiles).forEach(id => {
            if (!courtLastData[id]) {
                const st = document.getElementById('court-status-' + id);
                if (st) { st.style.display = 'flex'; st.innerHTML = 'Transliacija baigėsi'; }
                courtViewTiles[id].shouldReconnect = false;
            }
        });
    });
}

function closeCourtView() {
    if (courtBroadcastsRef) { try { courtBroadcastsRef.off(); } catch (e) {} courtBroadcastsRef = null; }
    Object.keys(courtViewTiles).forEach(id => courtRemoveTile(id));
    courtViewTiles = {};
    document.getElementById('court-replay-modal')?.remove();
    document.getElementById('court-view-modal')?.remove();
}

function courtSetGridEmpty() {
    const box = document.getElementById('courtGrid');
    if (box && Object.keys(courtViewTiles).length === 0) {
        box.innerHTML = '<div style="margin:auto;text-align:center;color:#64748b;font-size:13px;max-width:280px;"><i class="fa-solid fa-video" style="font-size:28px;display:block;margin-bottom:10px;color:#334155;"></i>Bakstelėkite kameras viršuje, kurias norite matyti. Galima rodyti kelias vienu metu.</div>';
    }
}

// ------------------------------------------
// ŠALTINIŲ JUOSTA (pasirinkimas)
// ------------------------------------------

function courtRenderSources(data) {
    const box = document.getElementById('courtSources');
    if (!box) return;
    let ids = Object.keys(data || {});
    if (courtRoomFilter) ids = ids.filter(id => (data[id] && data[id].room) === courtRoomFilter);
    if (ids.length === 0) {
        box.innerHTML = courtRoomFilter
            ? '<div style="color:#64748b;font-size:12px;">Šiame turnyre dar nėra kamerų. Bakstelėkite filtrą viršuje, kad matytumėte visas.</div>'
            : '<div style="color:#64748b;font-size:12px;">Nėra aktyvių kamerų. Įjunkite transliaciją telefone.</div>';
        return;
    }
    box.innerHTML = ids.map(id => {
        const b = data[id] || {};
        const name = (b.broadcaster || b.room || 'Kamera');
        const selected = !!courtViewTiles[id];
        const lock = b.isPrivate ? ' <i class="fa-solid fa-lock" style="font-size:9px;"></i>' : '';
        const safeName = String(name).replace(/['"\\<>&]/g, ''); // onclick atributui — be pavojingų simbolių
        return `<button onclick="courtToggleSource('${id}', '${safeName}', ${!!b.isPrivate})" style="flex-shrink:0;display:flex;align-items:center;gap:6px;background:${selected ? '#16a34a' : '#1e293b'};color:white;border:1px solid ${selected ? '#16a34a' : '#334155'};padding:8px 12px;border-radius:20px;font-size:12px;font-weight:bold;cursor:pointer;white-space:nowrap;">
            <i class="fa-solid ${selected ? 'fa-check' : 'fa-video'}" style="font-size:11px;"></i> ${esc(name)}${lock}
        </button>`;
    }).join('');
}

function courtRefreshSources() { courtRenderSources(courtLastData); }

// Perjungia: tik šio turnyro (kambario) kameros <-> visos kameros
function courtToggleRoomFilter() {
    if (courtRoomFilter) {
        courtRoomFilter = null;
    } else {
        courtRoomFilter = (typeof currentLiveRoomName !== 'undefined' && currentLiveRoomName) ? currentLiveRoomName : null;
    }
    const lbl = document.getElementById('courtFilterLabel');
    const btn = document.getElementById('courtFilterBtn');
    if (lbl) lbl.innerText = courtRoomFilter ? ('Tik ' + courtRoomFilter) : 'Visos kameros';
    if (btn) { btn.style.color = courtRoomFilter ? '#22c55e' : '#94a3b8'; btn.style.borderColor = courtRoomFilter ? '#16a34a' : '#334155'; }
    courtRefreshSources();
}

function courtToggleSource(id, name, isPrivate) {
    if (courtViewTiles[id]) { courtRemoveTile(id); courtRefreshSources(); return; }
    if (Object.keys(courtViewTiles).length >= COURT_MAX_TILES) {
        if (typeof showToast === 'function') showToast('Daugiausia ' + COURT_MAX_TILES + ' kameros vienu metu.');
        return;
    }
    let pin = null;
    if (isPrivate) {
        pin = prompt(`"${name}" transliacija privati.\n\nĮveskite PIN kodą:`);
        if (!pin) return;
        // PIN tikrina siuntėjas — neteisingas PIN grąžins „rejected" ir plytelė parodys klaidą
    }
    courtAddTile(id, name, pin, isPrivate);
    courtRefreshSources();
}

// ------------------------------------------
// PLYTELĖ
// ------------------------------------------

function courtAddTile(id, name, pin, isPrivate) {
    const grid = document.getElementById('courtGrid');
    if (!grid) return;
    if (Object.keys(courtViewTiles).length === 0) grid.innerHTML = '';
    const tile = {
        broadcastId: id, name: name, pin: pin || null, isPrivate: !!isPrivate,
        pc: null, viewerId: null, signalRef: null, stream: null,
        replayRecorder: null, replayChunks: [], replayHeader: null, mime: '',
        shouldReconnect: true, reconnectAttempts: 0, reconnectTimer: null, graceTimer: null
    };
    courtViewTiles[id] = tile;

    const safeName = String(name).replace(/['"\\<>&]/g, ''); // onclick atributui — be pavojingų simbolių
    const el = document.createElement('div');
    el.id = 'court-tile-' + id;
    el.style.cssText = 'position:relative;flex:1 1 46%;min-width:300px;background:#000;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center;aspect-ratio:16/9;';
    el.innerHTML = `
        <video id="court-vid-${id}" playsinline autoplay muted style="width:100%;height:100%;object-fit:contain;background:black;"></video>
        <div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.55);color:white;font-size:12px;font-weight:800;padding:3px 8px;border-radius:6px;"><span style="color:#ef4444;">🔴</span> ${esc(name)}</div>
        <div id="court-status-${id}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;background:rgba(0,0,0,0.45);"><i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Jungiamasi...</div>
        <button onclick="courtTileReplayClick('${id}')" style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);background:rgba(34,197,94,0.95);color:white;border:none;padding:10px 18px;border-radius:24px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.4);z-index:3;"><i class="fa-solid fa-clock-rotate-left"></i> Atsukti ${COURT_REPLAY_SEC}s</button>
        <button onclick="courtToggleSource('${id}', '${safeName}', ${!!isPrivate})" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.55);color:white;border:none;width:28px;height:28px;border-radius:50%;font-size:14px;cursor:pointer;z-index:3;">&times;</button>
    `;
    grid.appendChild(el);
    courtTileConnect(tile);
}

function courtRemoveTile(id) {
    const tile = courtViewTiles[id];
    if (!tile) return;
    tile.shouldReconnect = false;
    if (tile.reconnectTimer) { clearTimeout(tile.reconnectTimer); tile.reconnectTimer = null; }
    courtTileStopReplay(tile);
    courtTileCleanupConn(tile);
    document.getElementById('court-tile-' + id)?.remove();
    delete courtViewTiles[id];
    courtSetGridEmpty();
}

function courtTileReplayClick(id) {
    const tile = courtViewTiles[id];
    if (tile) courtTileShowReplay(tile);
}

// ------------------------------------------
// RYŠYS (žiūrovas — kaip registras_webrtc.js, tik per-plytelę)
// ------------------------------------------

function courtTileConnect(tile) {
    tile.viewerId = 'viewer_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const pc = new RTCPeerConnection(WEBRTC_ICE_SERVERS);
    tile.pc = pc;
    const bid = tile.broadcastId;

    pc.ontrack = (event) => {
        if (!event.streams[0]) return;
        tile.stream = event.streams[0];
        const v = document.getElementById('court-vid-' + bid);
        if (v) { v.srcObject = event.streams[0]; v.play().catch(() => {}); }
        const st = document.getElementById('court-status-' + bid);
        if (st) st.style.display = 'none';
        tile.reconnectAttempts = 0;
        courtTileStartReplay(tile);
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            firebase.database().ref(`${RTC_SIGNAL_KEY}/${bid}/viewers/${tile.viewerId}/viewerCandidates`).push(event.candidate.toJSON());
        }
    };

    pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === 'connected') {
            tile.reconnectAttempts = 0;
            if (tile.graceTimer) { clearTimeout(tile.graceTimer); tile.graceTimer = null; }
        } else if (s === 'failed') {
            courtTileScheduleReconnect(tile);
        } else if (s === 'disconnected') {
            if (!tile.graceTimer) {
                tile.graceTimer = setTimeout(() => {
                    tile.graceTimer = null;
                    const c = tile.pc ? tile.pc.connectionState : null;
                    if (c === 'disconnected' || c === 'failed') courtTileScheduleReconnect(tile);
                }, 5000);
            }
        }
    };

    (async () => {
        try {
            const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
            await pc.setLocalDescription(offer);
            // offer + pin vienu update'u — PIN tikrina siuntėjas (žr. registras_webrtc.js)
            const initData = { offer: { type: offer.type, sdp: offer.sdp } };
            if (tile.pin) initData.pin = String(tile.pin);
            firebase.database().ref(`${RTC_SIGNAL_KEY}/${bid}/viewers/${tile.viewerId}`).update(initData);

            firebase.database().ref(`${RTC_SIGNAL_KEY}/${bid}/viewers/${tile.viewerId}/answer`).on('value', (snap) => {
                const a = snap.val();
                if (a && tile.pc && !tile.pc.currentRemoteDescription) {
                    tile.pc.setRemoteDescription(new RTCSessionDescription(a)).catch(e => console.warn('court setRemote:', e));
                }
            });

            // Siuntėjas atmetė (neteisingas PIN) — nebebandome jungtis
            firebase.database().ref(`${RTC_SIGNAL_KEY}/${bid}/viewers/${tile.viewerId}/rejected`).on('value', (snap) => {
                if (snap.val() === true) {
                    tile.shouldReconnect = false;
                    const st = document.getElementById('court-status-' + bid);
                    if (st) { st.style.display = 'flex'; st.innerHTML = '<i class="fa-solid fa-lock"></i>&nbsp; Neteisingas PIN'; }
                }
            });

            firebase.database().ref(`${RTC_SIGNAL_KEY}/${bid}/viewers/${tile.viewerId}/broadcasterCandidates`).on('child_added', (snap) => {
                const c = snap.val();
                if (c && tile.pc) tile.pc.addIceCandidate(new RTCIceCandidate(c)).catch(e => console.warn('court ICE:', e));
            });

            tile.signalRef = firebase.database().ref(`${RTC_SIGNAL_KEY}/${bid}/viewers/${tile.viewerId}`);
            tile.signalRef.onDisconnect().remove();
        } catch (e) {
            console.warn('court tile connect:', e);
            courtTileScheduleReconnect(tile);
        }
    })();
}

function courtTileScheduleReconnect(tile) {
    if (!tile.shouldReconnect) return;
    if (tile.reconnectTimer) return;
    const st = document.getElementById('court-status-' + tile.broadcastId);
    if (tile.reconnectAttempts >= 10) {
        if (st) { st.style.display = 'flex'; st.innerHTML = 'Ryšys nutrūko'; }
        return;
    }
    tile.reconnectAttempts++;
    const delay = Math.min(1500 * tile.reconnectAttempts, 7000);
    if (st) { st.style.display = 'flex'; st.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Atkuriama...'; }
    tile.reconnectTimer = setTimeout(async () => {
        tile.reconnectTimer = null;
        try {
            const snap = await firebase.database().ref(`${RTC_BROADCAST_KEY}/${tile.broadcastId}`).once('value');
            if (!snap.val()) {
                tile.shouldReconnect = false;
                courtTileCleanupConn(tile);
                if (st) { st.style.display = 'flex'; st.innerHTML = 'Transliacija baigėsi'; }
                return;
            }
        } catch (e) {}
        courtTileCleanupConn(tile);
        if (tile.shouldReconnect) courtTileConnect(tile);
    }, delay);
}

function courtTileCleanupConn(tile) {
    if (tile.graceTimer) { clearTimeout(tile.graceTimer); tile.graceTimer = null; }
    if (tile.pc) { try { tile.pc.close(); } catch (e) {} tile.pc = null; }
    if (tile.signalRef) { try { tile.signalRef.off(); tile.signalRef.remove(); } catch (e) {} tile.signalRef = null; }
    tile.viewerId = null;
}

// ------------------------------------------
// ATSUKIMO BUFERIS (per-plytelę, ant gaunamo srauto)
// ------------------------------------------

function courtPickMime() {
    const opts = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (const o of opts) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(o)) return o; }
    return '';
}

function courtTileStartReplay(tile) {
    if (!tile.stream || tile.replayRecorder) return;
    const mime = courtPickMime();
    if (!mime) return;
    tile.mime = mime;
    tile.replayChunks = [];
    tile.replayHeader = null;
    try {
        tile.replayRecorder = new MediaRecorder(tile.stream, { mimeType: mime });
        tile.replayRecorder.ondataavailable = (e) => {
            if (!e.data || e.data.size === 0) return;
            if (!tile.replayHeader) { tile.replayHeader = e.data; return; }  // WebM antraštė
            tile.replayChunks.push({ blob: e.data, ts: Date.now() });
            const cutoff = Date.now() - (COURT_REPLAY_SEC + 2) * 1000;
            while (tile.replayChunks.length > 0 && tile.replayChunks[0].ts < cutoff) tile.replayChunks.shift();
        };
        tile.replayRecorder.start(1000);
    } catch (e) { tile.replayRecorder = null; console.warn('court replay buffer:', e); }
}

function courtTileStopReplay(tile) {
    if (tile.replayRecorder) { try { tile.replayRecorder.stop(); } catch (e) {} tile.replayRecorder = null; }
    tile.replayChunks = [];
    tile.replayHeader = null;
}

function courtTileShowReplay(tile) {
    if (!tile.replayHeader || !tile.replayChunks || tile.replayChunks.length === 0) {
        if (typeof showToast === 'function') showToast('Dar kaupiamas vaizdas — palaukite kelias sekundes.');
        return;
    }
    const cutoff = Date.now() - COURT_REPLAY_SEC * 1000;
    const recent = tile.replayChunks.filter(c => c.ts >= cutoff).map(c => c.blob);
    if (recent.length === 0) { if (typeof showToast === 'function') showToast('Per mažai vaizdo.'); return; }
    const blob = new Blob([tile.replayHeader, ...recent], { type: tile.mime });
    courtOpenReplayPlayer(URL.createObjectURL(blob), tile.name);
}

function courtOpenReplayPlayer(url, label) {
    document.getElementById('court-replay-modal')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'court-replay-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.94);z-index:10012;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;';
    wrap.innerHTML = `
        <div style="position:absolute;top:14px;left:0;right:0;text-align:center;color:white;font-weight:800;font-size:15px;"><i class="fa-solid fa-clock-rotate-left" style="color:#22c55e;"></i> ${label || ''} — paskutinės ${COURT_REPLAY_SEC}s</div>
        <video id="courtReplayVideo" playsinline autoplay controls loop style="max-width:100%;max-height:70vh;border-radius:12px;background:black;"></video>
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;justify-content:center;">
            <button id="courtReplaySpeed" style="background:#1a202c;color:white;border:1px solid #4a5568;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:bold;cursor:pointer;">0.5x lėtai</button>
            <button id="courtReplayRestart" style="background:#1a202c;color:white;border:1px solid #4a5568;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:bold;cursor:pointer;"><i class="fa-solid fa-rotate-left"></i> Nuo pradžių</button>
        </div>
        <button id="courtReplayClose" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);color:white;border:none;width:42px;height:42px;border-radius:50%;font-size:20px;cursor:pointer;">&times;</button>
    `;
    document.body.appendChild(wrap);
    const v = document.getElementById('courtReplayVideo');
    v.src = url;
    v.play().catch(() => {});
    let slow = false;
    document.getElementById('courtReplaySpeed').onclick = (e) => {
        slow = !slow;
        v.playbackRate = slow ? 0.5 : 1.0;
        e.currentTarget.innerText = slow ? '1x normaliai' : '0.5x lėtai';
    };
    document.getElementById('courtReplayRestart').onclick = () => { v.currentTime = 0; v.play().catch(() => {}); };
    document.getElementById('courtReplayClose').onclick = () => { try { URL.revokeObjectURL(url); } catch (e) {} wrap.remove(); };
}
