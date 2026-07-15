// ==========================================
// 2. TIESIOGIAI (LIVE) MAČŲ STEBĖJIMAS TV
// ==========================================

// --- YouTube Live transliacijos valdymas ---

let currentLiveRoomName = null;

// ==========================================
// UNIVERSALI TRANSLIACIJŲ LOGIKA (YouTube + Twitch + Facebook)
// ==========================================
// Saugoma Firebase: { platform: 'youtube'|'twitch'|'facebook', id: '...', url: '...' }
// Video srautas NEINA per Firebase — tik nuoroda. Visas srautas platformos pusėje.

// Atpažįsta platformą ir ištraukia reikiamą ID/nuorodą iš bet kokios transliacijos nuorodos
function parseStreamUrl(url) {
    if (!url) return null;
    url = url.trim();

    // YouTube
    const ytPatterns = [
        /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/,
        /youtube\.com\/live\/([a-zA-Z0-9_-]{6,})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/
    ];
    for (const p of ytPatterns) {
        const m = url.match(p);
        if (m) return { platform: 'youtube', id: m[1], url: url };
    }

    // Twitch — kanalo vardas (twitch.tv/vardas)
    const twMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]{3,30})/);
    if (twMatch) return { platform: 'twitch', id: twMatch[1], url: url };

    // Facebook — visa nuoroda reikalinga FB plugin'ui
    if (/facebook\.com\/|fb\.watch\//.test(url)) {
        return { platform: 'facebook', id: '', url: url };
    }

    return null;
}

// Senas pavadinimas — kad nesugriūtų kitos vietos, kurios jį kviečia
function extractYouTubeId(url) {
    const r = parseStreamUrl(url);
    return (r && r.platform === 'youtube') ? r.id : null;
}

// Sukuria įterpiamą (embed) nuorodą pagal platformą
function buildEmbedUrl(stream) {
    if (!stream || !stream.platform) return null;
    const host = (typeof location !== 'undefined') ? location.hostname : 'www.superpadel.lt';
    if (stream.platform === 'youtube') {
        return `https://www.youtube.com/embed/${stream.id}?autoplay=1&mute=1&playsinline=1`;
    }
    if (stream.platform === 'twitch') {
        return `https://player.twitch.tv/?channel=${stream.id}&parent=${host}&autoplay=true&muted=true`;
    }
    if (stream.platform === 'facebook') {
        return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(stream.url)}&autoplay=true&mute=1`;
    }
    return null;
}

function loadLiveStream(roomName) {
    const frame = document.getElementById('liveYtFrame');
    const placeholder = document.getElementById('liveYtPlaceholder');
    if (!frame) return;
    firebase.database().ref(`${DB_KEY}/${roomName}/live_stream`).once('value').then(snap => {
        let stream = snap.val();
        // Atgalinis suderinamumas: sena versija saugojo tik youtube_live = videoId (tekstas)
        if (!stream) {
            const legacy = null;
            firebase.database().ref(`${DB_KEY}/${roomName}/youtube_live`).once('value').then(legSnap => {
                const vid = legSnap.val();
                if (vid) {
                    const s = { platform: 'youtube', id: vid, url: '' };
                    showStreamFrame(s, frame, placeholder);
                } else {
                    hideStreamFrame(frame, placeholder);
                }
            });
            return;
        }
        showStreamFrame(stream, frame, placeholder);
    });
}

function showStreamFrame(stream, frame, placeholder) {
    const embed = buildEmbedUrl(stream);
    if (embed) {
        frame.src = embed;
        frame.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    } else {
        hideStreamFrame(frame, placeholder);
    }
}

function hideStreamFrame(frame, placeholder) {
    frame.src = '';
    frame.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
}

// Transliacijos nustatymas — platformos pasirinkimas + nuoroda
function setLiveStreamLink() {
    if (currentLiveRoomName) { openStreamSetupModal(); return; }
    if (typeof pickOfficialTournamentForStream === 'function') {
        pickOfficialTournamentForStream({
            title: '<i class="fa-solid fa-tower-broadcast" style="color:#2563eb;"></i> Kuriam turnyrui pridėti transliaciją?',
            subtitle: 'Pasirinkite turnyrą — nuoroda prisikabins prie jo automatiškai.',
            allowNone: false,
            onPick: function(room) {
                if (!room) { showToast("Pasirinkite turnyrą."); return; }
                const inp = document.getElementById('liveRoomInput');
                if (inp) inp.value = room;
                if (typeof connectLiveRoom === 'function') connectLiveRoom();
                openStreamSetupModal();
            }
        });
    } else {
        showToast("Pirmiausia prisijunkite prie kambario.");
    }
}

function openStreamSetupModal() {
    const old = document.getElementById('stream-setup-modal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'stream-setup-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.75);z-index:10001;display:flex;align-items:center;justify-content:center;padding:18px;';
    wrap.innerHTML = `
        <div style="background:white;border-radius:18px;padding:22px;width:100%;max-width:420px;">
            <div style="font-weight:900;font-size:16px;color:#1e293b;margin-bottom:4px;"><i class="fa-solid fa-tower-broadcast" style="color:#2563eb;"></i> Pradėti transliaciją</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:16px;">Transliuokite per pasirinktą platformą, tada įklijuokite nuorodą čia. Žiūrovai matys ją tiesiai SuperPadel'e.</div>

            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
                <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;">
                    <div style="font-weight:800;font-size:13px;color:#9146FF;margin-bottom:4px;"><i class="fa-brands fa-twitch"></i> Twitch <span style="background:#dcfce7;color:#16a34a;font-size:9px;padding:2px 6px;border-radius:4px;margin-left:4px;">Be apribojimų</span></div>
                    <div style="font-size:11px;color:#64748b;">Nereikia prenumeratorių. Transliuokite per Twitch programėlę, įklijuokite kanalo nuorodą.</div>
                </div>
                <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;">
                    <div style="font-weight:800;font-size:13px;color:#1877F2;margin-bottom:4px;"><i class="fa-brands fa-facebook"></i> Facebook Live</div>
                    <div style="font-size:11px;color:#64748b;">Transliuokite per Facebook, įklijuokite įrašo nuorodą.</div>
                </div>
                <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;opacity:0.6;">
                    <div style="font-weight:800;font-size:13px;color:#ff0000;margin-bottom:4px;"><i class="fa-brands fa-youtube"></i> YouTube <span style="background:#fef3c7;color:#92400e;font-size:9px;padding:2px 6px;border-radius:4px;margin-left:4px;">Reikia 50 prenumeratorių</span></div>
                    <div style="font-size:11px;color:#64748b;">Veikia, jei jūsų kanalas turi 50+ prenumeratorių.</div>
                </div>
            </div>

            <input type="text" id="streamUrlInput" placeholder="Įklijuokite transliacijos nuorodą..." style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font-size:13px;margin-bottom:12px;box-sizing:border-box;">
            <div style="display:flex;gap:8px;">
                <button onclick="document.getElementById('stream-setup-modal').remove()" style="flex:1;padding:12px;border:1px solid #cbd5e1;background:white;color:#64748b;border-radius:10px;font-weight:bold;font-size:13px;cursor:pointer;">Atšaukti</button>
                <button onclick="saveStreamFromModal()" style="flex:2;padding:12px;border:none;background:#2563eb;color:white;border-radius:10px;font-weight:bold;font-size:13px;cursor:pointer;">Pradėti transliaciją</button>
            </div>
            <button onclick="removeStream()" style="width:100%;margin-top:8px;padding:10px;border:none;background:transparent;color:#ef4444;font-size:12px;font-weight:bold;cursor:pointer;">Sustabdyti esamą transliaciją</button>
        </div>
    `;
    document.body.appendChild(wrap);
}

function saveStreamFromModal() {
    const input = document.getElementById('streamUrlInput');
    const url = input ? input.value.trim() : '';
    if (!url) { showToast("Įklijuokite nuorodą."); return; }
    const stream = parseStreamUrl(url);
    if (!stream) { showToast("Neatpažinta nuoroda. Naudokite Twitch, Facebook arba YouTube."); return; }

    firebase.database().ref(`${DB_KEY}/${currentLiveRoomName}/live_stream`).set(stream).then(() => {
        // Pažymime turnyrą kaip LIVE (kad portale matytųsi 🔴)
        firebase.database().ref(`${DB_KEY}/${currentLiveRoomName}/is_live`).set(true);
        // Viešas transliacijų indeksas — sąrašui nereikia skaityti visų kambarių
        // (kambarių šaka skaitoma tik po vieną, todėl bendras sąrašas be indekso neveiktų)
        firebase.database().ref(`padelio_live_index/${currentLiveRoomName}`).set({ platform: stream.platform, ts: Date.now() });
        document.getElementById('stream-setup-modal')?.remove();
        loadLiveStream(currentLiveRoomName);
        const labels = { youtube: 'YouTube', twitch: 'Twitch', facebook: 'Facebook' };
        showToast(`📺 ${labels[stream.platform]} transliacija pradėta!`);
    });
}

function removeStream() {
    if (!currentLiveRoomName) return;
    firebase.database().ref(`${DB_KEY}/${currentLiveRoomName}/live_stream`).remove();
    firebase.database().ref(`${DB_KEY}/${currentLiveRoomName}/youtube_live`).remove();
    firebase.database().ref(`${DB_KEY}/${currentLiveRoomName}/is_live`).remove();
    firebase.database().ref(`padelio_live_index/${currentLiveRoomName}`).remove();
    document.getElementById('stream-setup-modal')?.remove();
    loadLiveStream(currentLiveRoomName);
    showToast("Transliacija sustabdyta.");
}

// Senas pavadinimas suderinamumui
function setLiveStreamLink_legacy() { setLiveStreamLink(); }

function connectLiveRoom() {
    const roomInput = document.getElementById('liveRoomInput').value.trim();
    if (!roomInput) { showToast("Įveskite kambario pavadinimą!"); return; }
    document.getElementById('fbStatusIcon').style.color = "var(--status-orange)"; 
    document.getElementById('fbStatusText').innerText = `Jungiamasi prie "${roomInput}"...`;
    
    currentLiveRoomName = roomInput.toUpperCase();
    loadLiveStream(currentLiveRoomName);

    if (liveDbRef) { liveDbRef.off(); }
    liveDbRef = firebase.database().ref(DB_KEY + '/' + roomInput.toUpperCase());
    
    liveDbRef.on('value', snap => {
        const data = snap.val();
        currentFirebaseData = data;

        if (!data || !data.matches) { 
            document.getElementById('fbStatusIcon').style.color = "var(--status-red)"; 
            document.getElementById('fbStatusText').innerText = "Kambaryje dar nėra pradėtų mačų."; 
            document.getElementById('liveScoreBoxContainer').innerHTML = ""; 
            document.getElementById('liveCourtsContainer').innerHTML = ""; 
            return; 
        }
        document.getElementById('fbStatusIcon').style.color = "var(--status-green)"; 
        document.getElementById('fbStatusText').innerText = `Tiesiogiai: ${data.settings?.format || 'Turnyras'}`;
        
        currentLiveMatches = data.matches.filter(m => !m.finished);
        if(currentLiveMatches.length === 0) {
            document.getElementById('myCourtBar')?.remove();
            document.getElementById('liveCourtsContainer').innerHTML = "";
            let finishedMatches = data.matches.filter(m => m.finished);
            finishedMatches.sort((a, b) => { 
                function getWeight(m) { 
                    if (m.isFinal) { 
                        let t = (m.finalTitle || "").toUpperCase(); 
                        if (t.indexOf("DIDYSIS") > -1) return 10000; 
                        if (t.indexOf("MAŽASIS") > -1) return 9000; 
                        let matchNum = t.match(/\d+/); 
                        if (matchNum) return 8000 - parseInt(matchNum[0]); 
                        return 5000; 
                    } 
                    return (m.round || 0) * 10; 
                } 
                let wA = getWeight(a); 
                let wB = getWeight(b); 
                if (wA !== wB) return wB - wA; 
                return (a.court || 0) - (b.court || 0); 
            });
            
            if (finishedMatches.length > 0) {
                document.getElementById('fbStatusTitleContainer').innerHTML = `<i class="fa-solid fa-trophy" style="color: #d69e2e;"></i> <span id="fbStatusText">Turnyro rezultatai</span>`;
                let html = '';
                finishedMatches.forEach(m => {
                    let t1 = (m.team1 || []).map(p=>esc(p && p.name)).join(' / ');
                    let t2 = (m.team2 || []).map(p=>esc(p && p.name)).join(' / ');
                    let title = m.isFinal ? esc(m.finalTitle || 'FINALAS') : `RAUNDAS ${esc(m.round || 'X')} (Kortas ${esc(m.court)})`;
                    let bgTitle = 'background: #1a202c;';
                    if (m.isFinal) { 
                        let tUpper = title.toUpperCase(); 
                        if (tUpper.indexOf("DIDYSIS") > -1) bgTitle = 'background: linear-gradient(to right, #d69e2e, #b7791f);'; 
                        else if (tUpper.indexOf("MAŽASIS") > -1) bgTitle = 'background: linear-gradient(to right, #ed8936, #c05621);'; 
                        else bgTitle = 'background: #4a5568;'; 
                    }
                    let w1 = m.score1 > m.score2 ? 'font-weight: 900; color: var(--primary-blue);' : 'color: var(--text-dark);'; 
                    let w2 = m.score2 > m.score1 ? 'font-weight: 900; color: var(--primary-blue);' : 'color: var(--text-dark);';
                    html += `<div class="score-box" style="margin-bottom: 10px;"><div style="${bgTitle} color: white; padding: 6px 15px; font-size: 10px; font-weight: bold; letter-spacing: 1px;">${title}</div><div class="team-row" style="padding: 10px 15px;"><div class="team-names" style="font-size: 13px;">${t1}</div><div class="team-score" style="font-size: 20px; ${w1}">${m.score1 || 0}</div></div><div class="team-row" style="border-bottom: none; background: #f8f9fb; padding: 10px 15px;"><div class="team-names" style="font-size: 13px;">${t2}</div><div class="team-score" style="font-size: 20px; ${w2}">${m.score2 || 0}</div></div></div>`;
                });
                document.getElementById('liveScoreBoxContainer').innerHTML = html;
            } else { 
                document.getElementById('liveScoreBoxContainer').innerHTML = "<p style='margin-top:20px; color:#718096; font-size:13px; text-align:center;'>Šiuo metu mačų nėra.</p>"; 
            }
            return;
        }
        document.getElementById('fbStatusTitleContainer').innerHTML = `<i class="fa-solid fa-server" id="fbStatusIcon" style="color: var(--status-green);"></i> <span id="fbStatusText">Tiesiogiai: ${esc(data.settings?.format || 'Turnyras')}</span>`;
        if(!currentLiveMatches.find(m => m.court == activeLiveCourt)) { activeLiveCourt = currentLiveMatches[0].court; }
        // E-TEISĖJAVIMO PATOGUMAS: žaidžiančiam automatiškai atidaromas JO kortas
        // ir rodoma aiški juosta — nebereikia spėlioti, kur vesti rezultatą.
        highlightMyCourt();
        renderLiveCourtFilters();
        renderLiveScoreboard();
    });
}

// Kuriame korte vyksta MANO aktyvus mačas (arba null)
function findMyLiveCourt() {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.name) return null;
    const nm = currentUser.name.trim().toLowerCase();
    const my = currentLiveMatches.find(m =>
        [...(m.team1 || []), ...(m.team2 || [])].some(p => p && String(p.name || '').trim().toLowerCase() === nm));
    return my ? my.court : null;
}

function highlightMyCourt() {
    const myCourt = findMyLiveCourt();
    let bar = document.getElementById('myCourtBar');
    if (!myCourt) { if (bar) bar.remove(); window._myCourtLast = null; return; }
    // Automatinis perjungimas tik kai mano kortas PASIKEIČIA (naujas raundas) —
    // naršant kitus kortus juosta netrukdo, tik primena.
    if (window._myCourtLast !== myCourt) {
        window._myCourtLast = myCourt;
        activeLiveCourt = myCourt;
    }
    if (!bar) {
        const cont = document.getElementById('liveCourtsContainer');
        if (!cont || !cont.parentNode) return;
        bar = document.createElement('div');
        bar.id = 'myCourtBar';
        cont.parentNode.insertBefore(bar, cont);
    }
    bar.style.cssText = 'margin:8px 12px 0;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:9px 12px;font-size:13px;font-weight:800;color:#166534;cursor:pointer;text-align:center;';
    bar.innerHTML = `🎾 Jūsų mačas — Kortas ${myCourt}${Number(activeLiveCourt) !== Number(myCourt) ? ' <span style="text-decoration:underline;">(atidaryti)</span>' : ''}`;
    bar.onclick = () => changeLiveCourt(myCourt);
}

function renderLiveCourtFilters() {
    const container = document.getElementById('liveCourtsContainer');
    if(!container) return;
    container.innerHTML = '';
    const myCourt = findMyLiveCourt();
    let courts = [...new Set(currentLiveMatches.map(m => m.court))].sort((a,b) => a-b);
    courts.forEach(courtNum => {
        let activeCls = (courtNum == activeLiveCourt) ? 'active' : '';
        container.innerHTML += `<button type="button" class="live-filter-btn ${activeCls}" onclick="changeLiveCourt(${courtNum})">Kortas ${courtNum}${myCourt == courtNum ? ' 🎾' : ''}</button>`;
    });
}

function changeLiveCourt(courtNum) { 
    activeLiveCourt = courtNum; 
    renderLiveCourtFilters(); 
    renderLiveScoreboard(); 
}

// ===== E-TEISĖJAVIMAS =====
// Įjungiamas PORTALO admin panelėje kuriant/redaguojant turnyrą (turnyro laukas eReferee).
// Taškus vesti gali tik PRISIJUNGĘS vartotojas, kuris yra to turnyro dalyvis
// (jo vardas kambario žaidėjų sąraše arba portalo turnyro registracijoje). PIN nebenaudojamas.
function liveERefTournament() {
    if (!currentLiveRoomName || typeof tournaments === 'undefined') return null;
    return tournaments.find(x => x && x.room && String(x.room).toUpperCase() === String(currentLiveRoomName).toUpperCase()) || null;
}
function liveERefEnabled() {
    const t = liveERefTournament();
    return !!(t && t.eReferee);
}
function liveCanScore() {
    if (!liveERefEnabled()) return { ok: false, reason: 'off' };
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.name) return { ok: false, reason: 'login' };
    const myName = String(currentUser.name).trim().toLowerCase();
    const roomPlayers = (currentFirebaseData && Array.isArray(currentFirebaseData.players)) ? currentFirebaseData.players : [];
    const inRoom = roomPlayers.some(p => p && p.name && String(p.name).trim().toLowerCase() === myName);
    const t = liveERefTournament();
    const inTournament = !!(t && typeof userIsRegistered === 'function' && userIsRegistered(t));
    return (inRoom || inTournament) ? { ok: true } : { ok: false, reason: 'notplayer' };
}

function changeLiveScore(matchId, teamNum, change) {
    if (!currentFirebaseData) return;
    const access = liveCanScore();
    if (!access.ok) {
        if (access.reason === 'login') { showToast("Prisijunkite, kad galėtumėte vesti taškus."); if (typeof openAuthModal === 'function') openAuthModal(); }
        else if (access.reason === 'notplayer') { showToast("Taškus vesti gali tik šio turnyro dalyviai."); }
        return;
    }
    const matchIndex = currentFirebaseData.matches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return;

    let match = currentFirebaseData.matches[matchIndex];
    let currentScore = teamNum === 1 ? (match.score1 || 0) : (match.score2 || 0);
    let newScore = Math.max(0, currentScore + change);

    // Oficialumą sprendžiam pagal KAMBARIO owner.official — ta pati tiesa, kaip DB taisyklėje ir
    // serveryje (submitScore), kad nebūtų nesutapimo su turnyro isOfficial lauku.
    const isOfficialRoom = !!(currentFirebaseData.owner && currentFirebaseData.owner.official === true);
    if (isOfficialRoom) {
        // OFICIALUS (lygos ELO) — score per serverį: serveris pats patikrina, ar kviečiantysis
        // tikras dalyvis (klientas oficialaus kambario score tiesiogiai rašyti negali).
        const u = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
        if (!u) { showToast("Prisijunkite iš naujo, kad galėtumėte vesti taškus."); return; }
        // Optimistinis atnaujinimas (kad UI nevėluotų); serveris patvirtins per live listener'į,
        // o nepavykus — grąžinam seną reikšmę.
        match[`score${teamNum}`] = newScore;
        renderLiveScoreboard();
        u.getIdToken().then(idToken => fetch(STRIPE_FN_BASE + '/submitScore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: idToken, room: currentLiveRoomName, matchId: matchId, teamNum: teamNum, score: newScore })
        })).then(r => r.json()).then(data => {
            if (!(data && data.ok)) {
                match[`score${teamNum}`] = currentScore; renderLiveScoreboard();
                const err = data && data.error;
                showToast(err === 'not your court' ? "Galite vesti tik savo korto taškus."
                    : (err === 'not participant' ? "Taškus vesti gali tik šio turnyro dalyviai (registruoti su paskyra)."
                    : "Nepavyko išsaugoti taško."));
            }
        }).catch(() => { match[`score${teamNum}`] = currentScore; renderLiveScoreboard(); showToast("Klaida išsaugant tašką!"); });
        return;
    }

    // CASUAL — tiesioginis rašymas (DB taisyklė leidžia ne-oficialiems kambariams; greita)
    let updates = {};
    updates[`matches/${matchIndex}/score${teamNum}`] = newScore;
    updates[`lastUpdate`] = Date.now();

    liveDbRef.update(updates).catch(err => {
        console.error("Score update error:", err);
        showToast("Klaida išsaugant tašką!");
    });
}

function renderLiveScoreboard() { 
    const container = document.getElementById('liveScoreBoxContainer'); 
    if(!container) return;
    const match = currentLiveMatches.find(m => m.court == activeLiveCourt); 
    if(!match) { container.innerHTML = "<p>Klaida kraunant mačą.</p>"; return; } 
    
    const team1Names = (match.team1 || []).map(p => esc(p && p.name)).join('<br>') || 'Žaidėjas 1';
    const team2Names = (match.team2 || []).map(p => esc(p && p.name)).join('<br>') || 'Žaidėjas 2';
    let headerTitle = match.isFinal ? esc(match.finalTitle || 'FINALAS') : `RAUNDAS ${esc(match.round || '1')} (Kortas ${esc(match.court)})`;
    
    const isERef = liveERefEnabled();
    
    let score1Html = `<div class="team-score" style="color: var(--text-dark);">${match.score1 || 0}</div>`;
    let score2Html = `<div class="team-score" style="color: var(--text-dark);">${match.score2 || 0}</div>`;
    
    if (isERef) {
        score1Html = `<div style="display: flex; align-items: center; gap: 10px;"><button type="button" onclick="changeLiveScore('${match.id}', 1, -1)" style="width: 35px; height: 35px; border-radius: 50%; border: 1px solid #cbd5e0; background: #f8f9fb; font-size: 18px; font-weight: bold; color: #718096; cursor: pointer;">-</button><div style="font-size: 26px; font-weight: 900; width: 40px; text-align: center; color: var(--text-dark);">${match.score1 || 0}</div><button type="button" onclick="changeLiveScore('${match.id}', 1, 1)" style="width: 35px; height: 35px; border-radius: 50%; border: none; background: var(--status-green); font-size: 18px; font-weight: bold; color: white; cursor: pointer;">+</button></div>`;
        score2Html = `<div style="display: flex; align-items: center; gap: 10px;"><button type="button" onclick="changeLiveScore('${match.id}', 2, -1)" style="width: 35px; height: 35px; border-radius: 50%; border: 1px solid #cbd5e0; background: #f8f9fb; font-size: 18px; font-weight: bold; color: #718096; cursor: pointer;">-</button><div style="font-size: 26px; font-weight: 900; width: 40px; text-align: center; color: var(--text-dark);">${match.score2 || 0}</div><button type="button" onclick="changeLiveScore('${match.id}', 2, 1)" style="width: 35px; height: 35px; border-radius: 50%; border: none; background: var(--status-green); font-size: 18px; font-weight: bold; color: white; cursor: pointer;">+</button></div>`;
    }
    container.innerHTML = `<div class="score-box"><div style="background: #1a202c; color: white; padding: 6px 15px; font-size: 10px; font-weight: bold; letter-spacing: 1px;">${headerTitle}</div><div class="team-row"><div class="team-names">${team1Names}</div>${score1Html}</div><div class="team-row" style="border-bottom: none; background: #f8f9fb;"><div class="team-names">${team2Names}</div>${score2Html}</div></div>`; 
}

// ==========================================
// Parodo visus aktyvius LIVE turnyrus — žiūrovas paspaudžia ir prisijungia
function renderActiveStreams(filterRoom) {
    const box = document.getElementById('liveActiveStreamsList');
    if (!box) return;
    const fr = filterRoom ? String(filterRoom).toUpperCase() : null;
    box.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:11px;padding:10px;"><i class="fa-solid fa-spinner fa-spin"></i> Ieškoma transliacijų...</div>';

    // Įkeliame ABU šaltinius: Twitch/FB/YouTube (viešas live indeksas) ir WebRTC
    // (visos kambarių šakos skaityti negalima — taisyklės leidžia tik po vieną kambarį)
    Promise.all([
        // Kiekvienas šaltinis kraunasi nepriklausomai — vienos šakos klaida
        // (pvz. taisyklių pakeitimas) nebegriauna viso sąrašo
        firebase.database().ref('padelio_live_index').once('value').catch(() => null),
        firebase.database().ref('padelio_webrtc_broadcasts').once('value').catch(() => null)
    ]).then(([idxSnap, rtcSnap]) => {
        const data = (idxSnap && idxSnap.val()) || {};
        const rtcData = (rtcSnap && rtcSnap.val()) || {};
        const items = [];

        // 1. Twitch / FB / YouTube transliacijos
        Object.keys(data).forEach(roomName => {
            const rec = data[roomName];
            if (rec && rec.platform && (!fr || String(roomName).toUpperCase() === fr)) {
                items.push({
                    type: 'embed',
                    name: roomName,
                    platform: rec.platform,
                    format: rec.format || 'Turnyras'
                });
            }
        });

        // 2. WebRTC tiesioginės transliacijos
        Object.keys(rtcData).forEach(bid => {
            const b = rtcData[bid];
            if (b && (!fr || String(b.room || '').toUpperCase() === fr)) {
                items.push({
                    type: 'webrtc',
                    id: bid,
                    name: b.broadcaster || b.room || 'Žaidėjas',
                    isPrivate: !!b.isPrivate,
                    viewers: b.viewers || 0,
                    format: b.room || 'Tiesioginė'
                });
            }
        });

        if (items.length === 0) {
            box.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:11px;padding:10px;">' + (fr ? 'Šis turnyras šiuo metu netransliuojamas.' : 'Šiuo metu nėra aktyvių transliacijų.') + '</div>';
            return;
        }

        const platIcon = { youtube: '<i class="fa-brands fa-youtube" style="color:#ff0000;"></i>', twitch: '<i class="fa-brands fa-twitch" style="color:#9146FF;"></i>', facebook: '<i class="fa-brands fa-facebook" style="color:#1877F2;"></i>' };

        box.innerHTML = `
            <div style="font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:8px 0;"><i class="fa-solid fa-circle" style="color:#ef4444;font-size:7px;"></i> ${fr ? 'Šio turnyro transliacija' : 'Tiesiogiai dabar'}</div>
            ${items.map(r => {
                // Onclick atributui vardas išvalomas nuo pavojingų simbolių (kabučių, kampinių skliaustų),
                // o rodomam turiniui naudojamas esc() — vardus įveda vartotojai.
                const jsSafe = (s) => String(s || '').replace(/['"\\<>&]/g, '');
                if (r.type === 'webrtc') {
                    return `<div onclick="openWebRTCViewer('${jsSafe(r.id)}', ${!!r.isPrivate}, '${jsSafe(r.name)}')" style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 12px;margin-bottom:6px;cursor:pointer;">
                        <div style="font-size:18px;"><i class="fa-solid fa-video" style="color:#ef4444;"></i></div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:800;font-size:13px;color:white;">${esc(r.name)} ${r.isPrivate ? '<i class="fa-solid fa-lock" style="font-size:10px;color:#94a3b8;"></i>' : ''}</div>
                            <div style="font-size:10px;color:#94a3b8;">SuperPadel tiesioginė • <i class="fa-solid fa-eye"></i> ${Number(r.viewers) || 0}</div>
                        </div>
                        <div style="background:#ef4444;color:white;font-size:9px;font-weight:900;padding:3px 8px;border-radius:4px;">🔴 LIVE</div>
                    </div>`;
                } else {
                    return `<div onclick="watchLiveRoom('${jsSafe(r.name)}')" style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 12px;margin-bottom:6px;cursor:pointer;">
                        <div style="font-size:18px;">${platIcon[r.platform] || '<i class="fa-solid fa-video"></i>'}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:800;font-size:13px;color:white;">${esc(r.name)}</div>
                            <div style="font-size:10px;color:#94a3b8;">${esc(r.format)}</div>
                        </div>
                        <div style="background:#ef4444;color:white;font-size:9px;font-weight:900;padding:3px 8px;border-radius:4px;">🔴 LIVE</div>
                    </div>`;
                }
            }).join('')}
        `;
    }).catch((e) => {
        console.warn("renderActiveStreams error:", e);
        box.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:11px;padding:10px;">Nepavyko įkelti transliacijų.</div>';
    });
}

function watchLiveRoom(roomName) {
    const input = document.getElementById('liveRoomInput');
    if (input) input.value = roomName;
    connectLiveRoom();
}

// LIVE MODALINIS LANGAS (Stebėti mygtukas)
// ==========================================
function openLiveModal(e, filterRoom) {
    if (e && e.stopPropagation) e.stopPropagation();
    document.getElementById('liveModal')?.classList.add('show');
    if (typeof renderActiveStreams === 'function') renderActiveStreams(filterRoom || null);
}
function closeLiveModal() {
    document.getElementById('liveModal')?.classList.remove('show');
}