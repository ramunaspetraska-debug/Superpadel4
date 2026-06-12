// ==========================================
// 2. TIESIOGIAI (LIVE) MAČŲ STEBĖJIMAS TV
// ==========================================

// --- YouTube Live transliacijos valdymas ---

let currentLiveRoomName = null;

function extractYouTubeId(url) {
    if (!url) return null;
    const patterns = [
        /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/,
        /youtube\.com\/live\/([a-zA-Z0-9_-]{6,})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}

function loadLiveStream(roomName) {
    const frame = document.getElementById('liveYtFrame');
    const placeholder = document.getElementById('liveYtPlaceholder');
    if (!frame) return;
    firebase.database().ref(`${DB_KEY}/${roomName}/youtube_live`).once('value').then(snap => {
        const videoId = snap.val();
        if (videoId) {
            frame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`;
            frame.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
        } else {
            frame.src = '';
            frame.style.display = 'none';
            if (placeholder) placeholder.style.display = 'flex';
        }
    });
}

function setLiveStreamLink() {
    if (!currentLiveRoomName) { showToast("Pirmiausia prisijunkite prie kambario."); return; }
    openInputModal(
        '<i class="fa-brands fa-youtube" style="color: #ff0000;"></i> YouTube transliacija',
        'Įklijuokite nuorodą',
        'Išsaugoti',
        (url) => {
            if (!url || url.trim() === '') {
                firebase.database().ref(`${DB_KEY}/${currentLiveRoomName}/youtube_live`).remove().then(() => {
                    loadLiveStream(currentLiveRoomName);
                    showToast("Transliacija pašalinta.");
                });
                return;
            }
            const videoId = extractYouTubeId(url.trim());
            if (!videoId) { showToast("Neatpažinta YouTube nuoroda."); return; }
            firebase.database().ref(`${DB_KEY}/${currentLiveRoomName}/youtube_live`).set(videoId).then(() => {
                loadLiveStream(currentLiveRoomName);
                showToast("📺 Transliacija pridėta!");
            });
        },
        'url'
    );
}

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
                    let t1 = (m.team1 || []).map(p=>p.name).join(' / '); 
                    let t2 = (m.team2 || []).map(p=>p.name).join(' / ');
                    let title = m.isFinal ? (m.finalTitle || 'FINALAS') : `RAUNDAS ${m.round || 'X'} (Kortas ${m.court})`;
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
        document.getElementById('fbStatusTitleContainer').innerHTML = `<i class="fa-solid fa-server" id="fbStatusIcon" style="color: var(--status-green);"></i> <span id="fbStatusText">Tiesiogiai: ${data.settings?.format || 'Turnyras'}</span>`;
        renderLiveCourtFilters(); 
        if(!currentLiveMatches.find(m => m.court == activeLiveCourt)) { activeLiveCourt = currentLiveMatches[0].court; } 
        renderLiveScoreboard();
    });
}

function renderLiveCourtFilters() { 
    const container = document.getElementById('liveCourtsContainer'); 
    if(!container) return;
    container.innerHTML = ''; 
    let courts = [...new Set(currentLiveMatches.map(m => m.court))].sort((a,b) => a-b); 
    courts.forEach(courtNum => { 
        let activeCls = (courtNum == activeLiveCourt) ? 'active' : ''; 
        container.innerHTML += `<button type="button" class="live-filter-btn ${activeCls}" onclick="changeLiveCourt(${courtNum})">Kortas ${courtNum}</button>`; 
    }); 
}

function changeLiveCourt(courtNum) { 
    activeLiveCourt = courtNum; 
    renderLiveCourtFilters(); 
    renderLiveScoreboard(); 
}

function changeLiveScore(matchId, teamNum, change) {
    if (!currentFirebaseData || !currentFirebaseData.settings?.eReferee) return;
    if (!eRefAuthenticated) { 
        openInputModal(
            '<i class="fa-solid fa-gavel" style="color: var(--primary-blue);"></i> E-Teisėjas',
            'PIN kodas',
            'Patvirtinti',
            (pin) => {
                if (pin === currentFirebaseData.settings.eRefereePin) {
                    eRefAuthenticated = true;
                    showToast("Sėkmingai prisijungėte!");
                    changeLiveScore(matchId, teamNum, change);
                } else if (pin) {
                    showToast("Neteisingas PIN kodas!");
                }
            },
            'tel'
        );
        return;
    }
    const matchIndex = currentFirebaseData.matches.findIndex(m => m.id === matchId); 
    if (matchIndex === -1) return;
    
    let match = currentFirebaseData.matches[matchIndex]; 
    let currentScore = teamNum === 1 ? (match.score1 || 0) : (match.score2 || 0); 
    let newScore = Math.max(0, currentScore + change);
    
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
    
    const team1Names = (match.team1 || []).map(p => p.name).join('<br>') || 'Žaidėjas 1'; 
    const team2Names = (match.team2 || []).map(p => p.name).join('<br>') || 'Žaidėjas 2'; 
    let headerTitle = match.isFinal ? (match.finalTitle || 'FINALAS') : `RAUNDAS ${match.round || '1'} (Kortas ${match.court})`; 
    
    const isERef = currentFirebaseData?.settings?.eReferee;
    
    let score1Html = `<div class="team-score" style="color: var(--text-dark);">${match.score1 || 0}</div>`;
    let score2Html = `<div class="team-score" style="color: var(--text-dark);">${match.score2 || 0}</div>`;
    
    if (isERef) {
        score1Html = `<div style="display: flex; align-items: center; gap: 10px;"><button type="button" onclick="changeLiveScore('${match.id}', 1, -1)" style="width: 35px; height: 35px; border-radius: 50%; border: 1px solid #cbd5e0; background: #f8f9fb; font-size: 18px; font-weight: bold; color: #718096; cursor: pointer;">-</button><div style="font-size: 26px; font-weight: 900; width: 40px; text-align: center; color: var(--text-dark);">${match.score1 || 0}</div><button type="button" onclick="changeLiveScore('${match.id}', 1, 1)" style="width: 35px; height: 35px; border-radius: 50%; border: none; background: var(--status-green); font-size: 18px; font-weight: bold; color: white; cursor: pointer;">+</button></div>`;
        score2Html = `<div style="display: flex; align-items: center; gap: 10px;"><button type="button" onclick="changeLiveScore('${match.id}', 2, -1)" style="width: 35px; height: 35px; border-radius: 50%; border: 1px solid #cbd5e0; background: #f8f9fb; font-size: 18px; font-weight: bold; color: #718096; cursor: pointer;">-</button><div style="font-size: 26px; font-weight: 900; width: 40px; text-align: center; color: var(--text-dark);">${match.score2 || 0}</div><button type="button" onclick="changeLiveScore('${match.id}', 2, 1)" style="width: 35px; height: 35px; border-radius: 50%; border: none; background: var(--status-green); font-size: 18px; font-weight: bold; color: white; cursor: pointer;">+</button></div>`;
    }
    container.innerHTML = `<div class="score-box"><div style="background: #1a202c; color: white; padding: 6px 15px; font-size: 10px; font-weight: bold; letter-spacing: 1px;">${headerTitle}</div><div class="team-row"><div class="team-names">${team1Names}</div>${score1Html}</div><div class="team-row" style="border-bottom: none; background: #f8f9fb;"><div class="team-names">${team2Names}</div>${score2Html}</div></div>`; 
}
