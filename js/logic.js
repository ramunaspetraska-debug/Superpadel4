function safeArr(val) { 
    if (!val) return []; 
    if (Array.isArray(val)) return val; 
    if (typeof val === 'object') return Object.values(val); 
    return []; 
}

function shuffle(array) { 
    let arr = [...array]; 
    for (let i = arr.length - 1; i > 0; i--) { 
        const j = Math.floor(Math.random() * (i + 1)); 
        [arr[i], arr[j]] = [arr[j], arr[i]]; 
    } 
    return arr; 
}

function uid() { 
    return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)); 
}

function calculatePairsResults(mArr, pArr) { 
    const pairs = new Map(); 
    try { 
        // 🌟 IŠTAISYTA SINTAKSĖS KLAIDA: m => m && m.finished (saugus tikrinimas)
        safeArr(mArr).filter(m => m && m.finished).forEach(m => { 
            const proc = (team, myS, enS) => { 
                let safeTeam = safeArr(team); 
                if (safeTeam.length >= 2 && safeTeam[0] && safeTeam[1]) { 
                    const names = [safeTeam[0].name, safeTeam[1].name].sort(), key = names.join('_'); 
                    if (!pairs.has(key)) { 
                        const p1 = safeArr(pArr).find(x => x && (x.id === safeTeam[0].id || x.name === safeTeam[0].name)) || safeTeam[0]; 
                        const p2 = safeArr(pArr).find(x => x && (x.id === safeTeam[1].id || x.name === safeTeam[1].name)) || safeTeam[1]; 
                        pairs.set(key, { name: `${names[0]} / ${names[1]}`, p1, p2, mp:0, w:0, t:0, l:0, sw:0 }); 
                    } 
                    const s = pairs.get(key); 
                    s.mp++; 
                    s.sw += parseInt(myS || 0); 
                    if (parseInt(myS || 0) > parseInt(enS || 0)) s.w++; 
                    else if (parseInt(myS || 0) < parseInt(enS || 0)) s.l++; 
                    else s.t++; 
                } 
            }; 
            proc(m.team1, m.score1, m.score2); 
            proc(m.team2, m.score2, m.score1); 
        }); 
    } catch(e) { console.error("calculatePairsResults Error:", e); } 
    return Array.from(pairs.values()).sort((a,b) => (b.w/b.mp) - (a.w/a.mp) || b.mp - a.mp); 
}

function calculateResults(mArr, pArr, isF = false) { 
    let res = []; 
    try { 
        let safeP = safeArr(pArr); 
        if(isF) { 
            for(let i=0; i<safeP.length; i+=2) if(i+1 < safeP.length) res.push({ id: safeP[i].id+'_'+safeP[i+1].id, name: safeP[i].name+' / '+safeP[i+1].name, p1: safeP[i], p2: safeP[i+1], rating: Math.round(((safeP[i].rating||300)+(safeP[i+1].rating||300))/2), mp:0, w:0, t:0, l:0, sw:0, sl:0, dif:0, lp:0, photo:null, gender:'M' }); 
        } else { 
            res = safeP.map(p => ({ ...p, mp:0, w:0, t:0, l:0, sw:0, sl:0, dif:0, lp:0 })); 
        } 
        safeArr(mArr).filter(m => m && m.finished).forEach(m => { 
            const up = (team, myS, enS) => { 
                let t = safeArr(team); if(t.length === 0) return; 
                let targets = isF ? [res.find(r => r && (r.p1.id === t[0].id || r.p2.id === t[0].id))] : t.map(p => res.find(r => r && (r.id === p?.id || r.name === p?.name))); 
                safeArr(targets).forEach(s => { 
                    if(!s) return; s.mp++; s.sw += myS; s.sl += enS; s.dif = s.sw - s.sl; 
                    if(myS > enS) { s.w++; s.lp += 2; } else if(myS < enS) s.l++; else { s.t++; s.lp += 1; } 
                }); 
            }; 
            up(m.team1, m.score1||0, m.score2||0); up(m.team2, m.score2||0, m.score1||0); 
        }); 
    } catch(e) { console.error("calculateResults Error:", e); } 
    return res.sort((a,b) => (typeof settings !== 'undefined' && settings.rankingMode === 'wins') ? (b.lp - a.lp || b.dif - a.dif) : (b.sw - a.sw || b.dif - a.dif)); 
}

function generateFinals() {
    try {
        ensureTournamentId();
        const safeP = safeArr(players);
        if (safeP.length < 4) { alert("Nepakanka žaidėjų finalams."); return; }

        const isF = (typeof settings !== 'undefined' && settings.format === 'fixed');
        const ranked = calculateResults(matches, players, isF); 

        let teams = [];
        if (typeof settings !== 'undefined' && settings.format === 'mix_americano') {
            const males = ranked.filter(p => p.gender === 'M');
            const females = ranked.filter(p => p.gender === 'F');
            const pairCount = Math.min(males.length, females.length);
            if(pairCount < 2) { alert("Trūksta vyrų arba moterų finalinėms poroms suformuoti."); return; }
            for(let i=0; i<pairCount; i++) teams.push([males[i], females[i]]);
        } else if (typeof settings !== 'undefined' && settings.format === 'fixed') {
            // Fiksuotos poros: ranked JAU yra komandos (calculateResults su isF=true grąžina poras).
            // Naudojam jas tiesiogiai — neporuojam iš naujo.
            // 4 žaid. (2 komandos) → 1 finalas; 8 žaid. (4 komandos) → didysis + mažasis.
            teams = ranked.map(t => [t.p1, t.p2]).filter(pair => pair[0] && pair[1]);
        } else {
            for(let i=0; i<ranked.length; i+=2) { if (i+1 < ranked.length) teams.push([ranked[i], ranked[i+1]]); }
        }

        let newM = [];
        let roundNum = (safeArr(matches).length > 0 ? (matches[matches.length-1].round || 0) : 0) + 1;
        let courtCounter = 1;

        for(let i=0; i<teams.length; i+=2) {
            if (i+1 < teams.length) {
                let title = i === 0 ? "🏆 DIDYSIS FINALAS" : (i === 2 ? "🥉 MAŽASIS FINALAS" : `DĖL ${i+1}-${i+2} VIETOS`);
                let matchBg = i === 0 ? "bg-gradient-to-r from-yellow-500 to-amber-600" : (i === 2 ? "bg-gradient-to-r from-orange-400 to-orange-600" : "bg-slate-800");

                newM.push({ id: uid(), round: roundNum, court: courtCounter++, finished: false, score1: 0, score2: 0, team1: teams[i], team2: teams[i+1], isFinal: true, finalTitle: title, finalBg: matchBg });
            }
        }

        if(newM.length === 0) { alert("Nepavyko suformuoti komandų finalams."); return; }
        matches = [...safeArr(matches), ...newM]; autoSave(true); switchView('matches');
    } catch(e) { console.error("generateFinals Error:", e); }
}

function requestNextRound() {
    try {
        ensureTournamentId(); 
        const safeP = safeArr(players); 
        if (typeof settings !== 'undefined' && settings.format === 'fixed') { return generateFixedRound(safeP); }
        if (safeP.length < 4 || safeP.length % 4 !== 0) { alert(`KLAIDA: Žaidėjų skaičius turi būti dalus iš 4! (Dabar yra ${safeP.length})`); return; }
        if (typeof settings !== 'undefined' && settings.format === 'mix_americano') { 
            const mC = safeP.filter(p => p.gender === 'M').length, fC = safeP.filter(p => p.gender === 'F').length; 
            if (mC !== fC) { alert("KLAIDA: Mix formatui reikia vienodo vyrų ir moterų skaičiaus!"); return; } 
        }
        
        let roundNum = (safeArr(matches).length > 0 ? (matches[matches.length-1].round || 0) : 0) + 1;
        
        if (preGeneratedTournament.length === 0 || roundNum > preGeneratedTournament.length || !preGeneratedTournament[roundNum - 1]) {
            let overlay = document.getElementById('loading-overlay');
            if(overlay) overlay.style.display = 'flex';
            setTimeout(() => {
                try {
                    if (typeof settings !== 'undefined' && settings.format === 'mix_americano') {
                        if (safeP.length === 8) { preGeneratedTournament = generateInterleavedMix8Matrix(safeP); setStore('pregen', preGeneratedTournament); } 
                        else if (safeP.length === 16) { preGeneratedTournament = generatePerfectMix16Matrix(safeP); setStore('pregen', preGeneratedTournament); } 
                        else { generateLookaheadTournament(safeP, roundNum, 30); }
                    } else { generateLookaheadTournament(safeP, roundNum, 30); }
                    if(overlay) overlay.style.display = 'none'; dispatchRoundFromPreGen(roundNum);
                } catch (e) { console.error("Matrix generation error:", e); if(overlay) overlay.style.display = 'none'; }
            }, 50);
        } else { dispatchRoundFromPreGen(roundNum); }
    } catch(e) { console.error("requestNextRound Error:", e); let overlay = document.getElementById('loading-overlay'); if(overlay) overlay.style.display = 'none'; }
}

function generateInterleavedMix8Matrix(safePool) { let M = safePool.filter(p => p.gender === 'M'), F = safePool.filter(p => p.gender === 'F'); const opponentCycles = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]]; let baseRounds = []; for (let r = 0; r < 12; r++) { let roundMatches = [], oppSetup = opponentCycles[r % 3]; for (let c = 0; c < 2; c++) { let m1_idx = oppSetup[c][0], m2_idx = oppSetup[c][1], w1_idx = (m1_idx + r) % 4, w2_idx = (m2_idx + r) % 4; roundMatches.push({ t1: [M[m1_idx], F[w1_idx]], t2: [M[m2_idx], F[w2_idx]] }); } baseRounds.push(roundMatches); } const interleavePattern = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7]; let interleavedRounds = []; interleavePattern.forEach(idx => { interleavedRounds.push(baseRounds[idx]); }); let extendedPreGen = []; for (let copy = 0; copy < 1; copy++) { interleavedRounds.forEach(rm => extendedPreGen.push(rm)); } return extendedPreGen; }

function generatePerfectMix16Matrix(safePool) { let M = safePool.filter(p => p.gender === 'M'), F = safePool.filter(p => p.gender === 'F'); const perfectMatrix16 = [ [[[0,0], [7,7]], [[1,1], [5,5]], [[2,2], [4,4]], [[3,3], [6,6]]], [[[0,1], [3,4]], [[1,2], [2,3]], [[4,5], [7,0]], [[5,6], [6,7]]], [[[0,2], [4,6]], [[1,3], [6,0]], [[2,4], [3,5]], [[5,7], [7,1]]], [[[0,3], [1,4]], [[2,5], [4,7]], [[3,6], [5,0]], [[6,1], [7,2]]], [[[0,4], [3,7]], [[1,5], [6,2]], [[2,6], [7,3]], [[4,0], [5,1]]], [[[0,5], [7,4]], [[1,6], [3,0]], [[2,7], [5,2]], [[4,1], [6,3]]], [[[0,6], [5,3]], [[1,7], [7,5]], [[2,0], [6,4]], [[3,1], [4,2]]], [[[0,7], [2,1]], [[1,0], [4,3]], [[3,2], [7,6]], [[5,4], [6,5]]], [[[0,0], [6,6]], [[1,1], [2,2]], [[3,3], [4,4]], [[5,5], [7,7]]], [[[0,1], [4,5]], [[1,2], [5,6]], [[2,3], [7,0]], [[3,4], [6,7]]], [[[0,2], [2,4]], [[1,3], [3,5]], [[4,6], [5,7]], [[6,0], [7,1]]], [[[0,3], [5,0]], [[1,4], [6,1]], [[2,5], [4,7]], [[3,6], [7,2]]], [[[0,4], [2,6]], [[1,5], [7,3]], [[3,7], [5,1]], [[4,0], [6,2]]], [[[0,5], [3,0]], [[1,6], [5,2]], [[2,7], [6,3]], [[4,1], [7,4]]], [[[0,6], [1,7]], [[2,0], [3,1]], [[4,2], [5,3]], [[6,4], [7,5]]], [[[0,7], [6,5]], [[1,0], [4,3]], [[2,1], [5,4]], [[3,2], [7,6]]] ]; let baseRounds = []; perfectMatrix16.forEach((roundData) => { let currentRound = []; roundData.forEach((match) => { currentRound.push({ t1: [M[match[0][0]], F[match[0][1]]], t2: [M[match[1][0]], F[match[1][1]]] }); }); baseRounds.push(currentRound); }); let extendedPreGen = []; for (let copy = 0; copy < 1; copy++) { baseRounds.forEach(rm => extendedPreGen.push(rm)); } return extendedPreGen; }

function generateLookaheadTournament(safePool, startRound, countToGenerate) {
    let M = [], F = []; 
    if (typeof settings !== 'undefined' && settings.format === 'mix_americano') { M = safePool.filter(p => p.gender === 'M'); F = safePool.filter(p => p.gender === 'F'); } 
    else { let shuffledPool = shuffle([...safePool]); let half = shuffledPool.length / 2; M = shuffledPool.slice(0, half); F = shuffledPool.slice(half); }
    
    let halfNum = M.length, courtsNeeded = halfNum / 2, partners = new Map(), opponents = new Map(), pastMatches = new Set();
    const PLAYERS = [...M, ...F], totalPlayers = PLAYERS.length; 
    
    PLAYERS.forEach(p1 => { partners.set(p1.id, new Map()); opponents.set(p1.id, new Map()); PLAYERS.forEach(p2 => { partners.get(p1.id).set(p2.id, 0); opponents.get(p1.id).set(p2.id, 0); }); });
    const getP = (a, b) => partners.get(a.id)?.get(b.id) || 0; 
    const getO = (a, b) => opponents.get(a.id)?.get(b.id) || 0;
    
    const addStats = (m) => { 
        if(!m.t1 || !m.t2 || m.t1.length < 2 || m.t2.length < 2) return;
        let m1c = partners.get(m.t1[0]?.id); if(m1c) m1c.set(m.t1[1]?.id, (m1c.get(m.t1[1]?.id)||0)+1); 
        let m2c = partners.get(m.t1[1]?.id); if(m2c) m2c.set(m.t1[0]?.id, (m2c.get(m.t1[0]?.id)||0)+1); 
        let m3c = partners.get(m.t2[0]?.id); if(m3c) m3c.set(m.t2[1]?.id, (m3c.get(m.t2[1]?.id)||0)+1); 
        let m4c = partners.get(m.t2[1]?.id); if(m4c) m4c.set(m.t2[0]?.id, (m4c.get(m.t2[0]?.id)||0)+1); 
        
        const addOpp = (a, b) => { if(!a || !b) return; let o1 = opponents.get(a.id); if(o1) o1.set(b.id, (o1.get(b.id)||0)+1); let o2 = opponents.get(b.id); if(o2) o2.set(a.id, (o2.get(a.id)||0)+1); }; 
        addOpp(m.t1[0], m.t2[0]); addOpp(m.t1[0], m.t2[1]); addOpp(m.t1[1], m.t2[0]); addOpp(m.t1[1], m.t2[1]); 
        
        if (m.t1[0] && m.t1[1] && m.t2[0] && m.t2[1]) { let mk = [ [m.t1[0].id, m.t1[1].id].sort().join('+'), [m.t2[0].id, m.t2[1].id].sort().join('+') ].sort().join('VS'); pastMatches.add(mk); }
    };
    
    let lastRoundOpponents = new Set(); 
    const updateLastRoundOpponents = (roundMatches) => { lastRoundOpponents.clear(); if(!roundMatches) return; roundMatches.forEach(m => { m.t1.forEach(p1 => m.t2.forEach(p2 => { lastRoundOpponents.add(p1.id + '_' + p2.id); lastRoundOpponents.add(p2.id + '_' + p1.id); })); }); };
    
    let maxHistoricalRound = 0; 
    safeArr(matches).forEach(m => { if(m && safeArr(m.team1).length > 0 && safeArr(m.team2).length > 0) { addStats({ t1: m.team1, t2: m.team2 }); if(m.round > maxHistoricalRound) maxHistoricalRound = m.round; } }); 
    if (maxHistoricalRound > 0) { let lastHistRound = safeArr(matches).filter(m => m.round === maxHistoricalRound).map(m => ({t1: m.team1, t2: m.team2})); updateLastRoundOpponents(lastHistRound); }
    
    let newPreGen = [];
    for (let round = startRound; round < startRound + countToGenerate; round++) {
        let bestSet = null, minPenalty = Infinity, iterations = 2000; 
        for (let iter = 0; iter < iterations; iter++) {
            let currentPenalty = 0, roundMatches = [];
            if (typeof settings !== 'undefined' && settings.format === 'mix_americano') {
                let roundShift = round - 1, pairs = []; for(let i = 0; i < halfNum; i++) { pairs.push([M[i], F[(i + roundShift) % halfNum]]); } pairs = shuffle(pairs); 
                for(let c = 0; c < courtsNeeded; c++) { 
                    let t1 = pairs[c * 2], t2 = pairs[c * 2 + 1], mk = [ [t1[0].id, t1[1].id].sort().join('+'), [t2[0].id, t2[1].id].sort().join('+') ].sort().join('VS'); 
                    if (pastMatches.has(mk)) currentPenalty += 50000; 
                    t1.forEach(p1 => t2.forEach(p2 => { if (lastRoundOpponents.has(p1.id + '_' + p2.id)) currentPenalty += 500000; })); 
                    let oSum = getO(t1[0], t2[0]) + getO(t1[0], t2[1]) + getO(t1[1], t2[0]) + getO(t1[1], t2[1]); if (oSum === 0) currentPenalty -= 20000; 
                    currentPenalty += Math.pow(getO(t1[0], t2[0]) + 1, 5) * 1000; currentPenalty += Math.pow(getO(t1[1], t2[1]) + 1, 5) * 1000; currentPenalty += Math.pow(getO(t1[0], t2[1]) + 1, 5) * 1500; currentPenalty += Math.pow(getO(t1[1], t2[0]) + 1, 5) * 1500; 
                    roundMatches.push({ t1: t1, t2: t2 }); 
                }
            } else {
                let tempAll = shuffle([...M, ...F]); let maxAllowedP = Math.ceil(round / (totalPlayers - 1));
                for(let c = 0; c < courtsNeeded; c++) { 
                    const t1 = [tempAll.pop(), tempAll.pop()], t2 = [tempAll.pop(), tempAll.pop()]; 
                    if (getP(t1[0], t1[1]) >= maxAllowedP) currentPenalty += 5000000; if (getP(t2[0], t2[1]) >= maxAllowedP) currentPenalty += 5000000; 
                    let mk = [ [t1[0].id, t1[1].id].sort().join('+'), [t2[0].id, t2[1].id].sort().join('+') ].sort().join('VS'); 
                    if (pastMatches.has(mk)) currentPenalty += 50000; 
                    t1.forEach(p1 => t2.forEach(p2 => { if (lastRoundOpponents.has(p1.id + '_' + p2.id)) currentPenalty += 500000; })); 
                    if (getP(t1[0], t1[1]) === 0) currentPenalty -= 10000; if (getP(t2[0], t2[1]) === 0) currentPenalty -= 10000; 
                    let oSum = getO(t1[0], t2[0]) + getO(t1[0], t2[1]) + getO(t1[1], t2[0]) + getO(t1[1], t2[1]); if (oSum === 0) currentPenalty -= 20000; 
                    currentPenalty += Math.pow(getP(t1[0], t1[1]) + 1, 4) * 5000; currentPenalty += Math.pow(getP(t2[0], t2[1]) + 1, 4) * 5000; 
                    currentPenalty += Math.pow(getO(t1[0], t2[0]) + 1, 5) * 1000; currentPenalty += Math.pow(getO(t1[1], t2[1]) + 1, 5) * 1000; currentPenalty += Math.pow(getO(t1[0], t2[1]) + 1, 5) * 1500; currentPenalty += Math.pow(getO(t1[1], t2[0]) + 1, 5) * 1500; 
                    roundMatches.push({ t1: t1, t2: t2 }); 
                }
            }
            if (currentPenalty < minPenalty) { minPenalty = currentPenalty; bestSet = roundMatches; }
        }
        if(bestSet) bestSet.forEach(m => addStats(m)); newPreGen.push(bestSet); updateLastRoundOpponents(bestSet);
    }
    let fullPreGen = new Array(startRound - 1).fill(null).concat(newPreGen); preGeneratedTournament = fullPreGen; setStore('pregen', preGeneratedTournament);
}

function dispatchRoundFromPreGen(roundNum) { 
    try {
        let roundData = preGeneratedTournament[roundNum - 1]; 
        if (roundData) { 
            let newM = roundData.map((m, idx) => ({ id: uid(), round: roundNum, court: idx + 1, finished: false, score1: 0, score2: 0, team1: m.t1, team2: m.t2 }));
            matches = [...safeArr(matches), ...newM]; autoSave(true); switchView('matches'); 
        }
    } catch(e) { console.error("dispatchRoundFromPreGen Error:", e); }
}

function generateFixedRound(safePool) { 
    try {
        let teams = []; for (let k = 0; k < safePool.length; k += 2) { if (k + 1 < safePool.length) teams.push([safePool[k], safePool[k + 1]]); } 
        let roundNum = (safeArr(matches).length > 0 ? (matches[matches.length-1].round || 0) : 0) + 1;
        
        let K_even = teams.length;
        let cycleRounds = K_even - 1;
        let shift = (roundNum - 1) % cycleRounds;
        
        let rotatedIndices = [0]; let others = [];
        for (let i = 1; i < K_even; i++) others.push(i);
        for (let i = 0; i < shift; i++) others.unshift(others.pop());
        rotatedIndices.push(...others);
        
        let roundMatches = [];
        for (let i = 0; i < K_even / 2; i++) {
            let t1Idx = rotatedIndices[i], t2Idx = rotatedIndices[K_even - 1 - i];
            if (t1Idx < teams.length && t2Idx < teams.length) roundMatches.push({ team1: teams[t1Idx], team2: teams[t2Idx] });
        }
        
        let newM = [];
        roundMatches.forEach((m, idx) => { newM.push({ id: uid(), round: roundNum, court: idx + 1, finished: false, score1: 0, score2: 0, team1: m.team1, team2: m.team2 }); });
        
        matches = [...safeArr(matches), ...newM]; autoSave(true); switchView('matches'); 
    } catch(e) { console.error("generateFixedRound Error:", e); }
}

function processGlobalEloForMatch(match, globalData, globalRef) {
    // Komandų vardai mačų istorijai
    const t1Names = (match.team1 || []).map(x => x && x.name ? x.name.split(' ')[0] : '?').join(' / ');
    const t2Names = (match.team2 || []).map(x => x && x.name ? x.name.split(' ')[0] : '?').join(' / ');
    if (typeof isCloud === 'undefined' || !isCloud || !globalRef) return;
    if (typeof settings !== 'undefined' && settings.level === 'Privatus') return;
    if (!match || !match.team1 || !match.team2) return;
    
    let s1 = parseInt(match.score1 || 0);
    let s2 = parseInt(match.score2 || 0);
    if (s1 === 0 && s2 === 0 && !match.finished) return; 

    const isOfficial = (typeof settings !== 'undefined' && settings.isOfficial === true);

    if (isOfficial) {
        const getP = (p) => globalData[p.id] || { rating: 300, total_matches: 0 };
        let t1Players = safeArr(match.team1);
        let t2Players = safeArr(match.team2);
        if (t1Players.length === 0 || t2Players.length === 0) return;
        
        let t1R = t1Players.reduce((sum, p) => sum + getP(p).rating, 0) / t1Players.length;
        let t2R = t2Players.reduce((sum, p) => sum + getP(p).rating, 0) / t2Players.length;
        
        let e1 = 1 / (1 + Math.pow(10, (t2R - t1R) / 400));
        let e2 = 1 / (1 + Math.pow(10, (t1R - t2R) / 400));
        let out1 = s1 > s2 ? 1 : (s1 === s2 ? 0.5 : 0);
        let out2 = s2 > s1 ? 1 : (s1 === s2 ? 0.5 : 0);
        let diff = Math.abs(s1 - s2);
        let mov = Math.log(diff + 2); 
        let K = 32; 
        let delta1 = K * mov * (out1 - e1);
        let delta2 = K * mov * (out2 - e2);
        
        const updatePlayer = (p, delta) => {
            // Tik registruotiems žaidėjams (telefono numeris kaip ID) rašome globalų ELO.
            if (!/^[0-9]{7,}$/.test(String(p.id))) return;
            let g = getP(p);
            let oldR = g.rating;
            let newR = Math.round(oldR + delta);
            if (newR < 0) newR = 0;
            if (newR > 1000) newR = 1000;
            let newMatches = (g.total_matches || 0) + 1;
            
            let tier = "D";
            if (newR >= 851) tier = "A";
            else if (newR >= 701) tier = "B-/B";
            else if (newR >= 551) tier = "C/C+";
            else if (newR >= 451) tier = "C-/C";
            else if (newR >= 351) tier = "D/C-";
            
            // Mačų istorija (paskutiniai 10)
            let hist = (g.recent_matches || []).slice();
            hist.unshift({ d: Date.now(), t1: t1Names, t2: t2Names, s1: s1, s2: s2, win: delta > 0, official: true });
            hist = hist.slice(0, 10);

            globalRef.child(p.id).update({
                rating: newR,
                tier: tier,
                total_matches: newMatches,
                official_wins: (g.official_wins || 0) + (delta > 0 ? 1 : 0),
                last_played: Date.now(),
                recent_matches: hist
            });
            if(globalData[p.id]) {
                globalData[p.id].rating = newR;
                globalData[p.id].total_matches = newMatches;
                globalData[p.id].tier = tier;
            }
        };
        t1Players.forEach(p => updatePlayer(p, delta1));
        t2Players.forEach(p => updatePlayer(p, delta2));
    } else {
        // SVARBU: naudojame activeRoom (globalų kintamąjį), NE įvesties laukelį.
        // Po puslapio perkrovimo + auto-prisijungimo laukelis 'fb-room' būna tuščias,
        // todėl ankstesnė versija nerasdavo kambario ir sinchronizacija neveikdavo.
        const roomName = (typeof activeRoom !== 'undefined' && activeRoom) ? activeRoom : (document.getElementById('fb-room')?.value?.trim() || '');
        if (!roomName) return; 
        const casualRef = firebase.database().ref("padelio_rooms/" + roomName + "/casual_players");
        
        casualRef.once('value').then(snap => {
            const casualData = snap.val() || {};
            const getP = (p) => {
                if (casualData[p.id]) return casualData[p.id];
                let lp = players.find(x => x.id === p.id);
                return { rating: (lp && lp.rating) ? lp.rating : 300, total_matches: 0 };
            };
            
            let t1Players = safeArr(match.team1);
            let t2Players = safeArr(match.team2);
            if (t1Players.length === 0 || t2Players.length === 0) return;
            
            let t1R = t1Players.reduce((sum, p) => sum + getP(p).rating, 0) / t1Players.length;
            let t2R = t2Players.reduce((sum, p) => sum + getP(p).rating, 0) / t2Players.length;
            
            let e1 = 1 / (1 + Math.pow(10, (t2R - t1R) / 400));
            let e2 = 1 / (1 + Math.pow(10, (t1R - t2R) / 400));
            let out1 = s1 > s2 ? 1 : (s1 === s2 ? 0.5 : 0);
            let out2 = s2 > s1 ? 1 : (s1 === s2 ? 0.5 : 0);
            let diff = Math.abs(s1 - s2);
            let mov = Math.log(diff + 2); 
            let K = 32; 
            let delta1 = K * mov * (out1 - e1);
            let delta2 = K * mov * (out2 - e2);
            
            const updatePlayer = (p, delta) => {
                let g = getP(p);
                let oldR = g.rating;
                let newR = Math.round(oldR + delta);
                if (newR < 0) newR = 0;
                if (newR > 1000) newR = 1000;
                let newMatches = (g.total_matches || 0) + 1;
                
                let tier = "D";
                if (newR >= 851) tier = "A";
                else if (newR >= 701) tier = "B-/B";
                else if (newR >= 551) tier = "C/C+";
                else if (newR >= 451) tier = "C-/C";
                else if (newR >= 351) tier = "D/C-";
                
                casualRef.child(p.id).update({
                    id: p.id,
                    name: p.name,
                    gender: p.gender || "M", 
                    rating: newR,
                    tier: tier,
                    total_matches: newMatches,
                    last_played: Date.now()
                });

                let localPlayer = players.find(x => x.id === p.id);
                if (localPlayer) {
                    localPlayer.rating = newR;
                    localPlayer.tier = tier;
                }
            };
            t1Players.forEach(p => updatePlayer(p, delta1));
            t2Players.forEach(p => updatePlayer(p, delta2));

            // 🌟 Sinchronizuojame casual statistiką į globalų profilį
            // Naudojame 3 metodus eilės tvarka: tiesioginį ID, vardą, portal_links
            // 🌟 Sinchronizuojame casual statistiką į globalų profilį
            // SVARBU: portalo ryšys (telefono nr.) tikrinamas PIRMAS.
            // UUID "šešėlinis" profilis naudojamas tik jei žaidėjas NEturi portalo ryšio.
            const syncCasualToGlobal = (p, isWin, delta) => {
                if (!p.id && !p.name) return;

                const doUpdate = (phoneId) => {
                    firebase.database().ref(`${GLOBAL_PLAYERS_KEY}/${phoneId}`).once('value').then(gSnap => {
                        const gData = gSnap.val();
                        if (!gData) return;
                        let hist = (gData.recent_matches || []).slice();
                        hist.unshift({ d: Date.now(), t1: t1Names, t2: t2Names, s1: s1, s2: s2, win: isWin, official: false });
                        hist = hist.slice(0, 10);

                        // Mėgėjų lygos ELO — atskiras nuo oficialaus, skaičiuojamas pagal casual mačus
                        const curCasualElo = gData.casual_rating || 300;
                        let newCasualElo = Math.round(curCasualElo + delta);
                        if (newCasualElo < 0) newCasualElo = 0;
                        if (newCasualElo > 1000) newCasualElo = 1000;
                        let casualTier = "D";
                        if (newCasualElo >= 851) casualTier = "A";
                        else if (newCasualElo >= 701) casualTier = "B-/B";
                        else if (newCasualElo >= 551) casualTier = "C/C+";
                        else if (newCasualElo >= 451) casualTier = "C-/C";
                        else if (newCasualElo >= 351) casualTier = "D/C-";

                        firebase.database().ref(`${GLOBAL_PLAYERS_KEY}/${phoneId}`).update({
                            casual_matches: (gData.casual_matches || 0) + 1,
                            casual_wins: (gData.casual_wins || 0) + (isWin ? 1 : 0),
                            casual_rating: newCasualElo,
                            casual_tier: casualTier,
                            last_played: Date.now(),
                            recent_matches: hist
                        });
                    });
                };

                // 1 metodas (PIRMAS): portalo ryšys pagal vardą — tikras telefono profilis
                if (p.name) {
                    const nameKey = p.name.toLowerCase().trim().replace(/\s+/g, '_');
                    const firstName = p.name.toLowerCase().trim().split(/\s+/)[0];
                    const path1 = `${DB_KEY}/${roomName}/portal_links_by_name`;
                    console.log(`🔍 [${p.name}] Ieškau nameKey="${nameKey}" (arba vardo "${firstName}") kelyje: ${path1}`);
                    firebase.database().ref(path1).once('value').then(byNameSnap => {
                        const byName = byNameSnap.val() || {};
                        // 1a. Tikslus atitikimas (pilnas vardas)
                        if (byName[nameKey]) { console.log(`✅ [${p.name}] 1-VARDAS (tikslus) rado phoneId=${byName[nameKey]}`); doUpdate(byName[nameKey]); return; }
                        // 1b. Atitikimas pagal vardą (be pavardės)
                        if (byName[firstName]) { console.log(`✅ [${p.name}] 1-VARDAS (vardas) rado phoneId=${byName[firstName]}`); doUpdate(byName[firstName]); return; }
                        // 1c. Skenuojam visus raktus — jei kurio nors raktas prasideda žaidėjo vardu
                        const matchKey = Object.keys(byName).find(k => k === firstName || k.split('_')[0] === firstName);
                        if (matchKey) { console.log(`✅ [${p.name}] 1-VARDAS (skenavimas "${matchKey}") rado phoneId=${byName[matchKey]}`); doUpdate(byName[matchKey]); return; }
                        console.log(`⏭️ [${p.name}] 1-VARDAS nerado. Bandau portal_links...`);

                        // 2 metodas: portal_links skenavimas pagal žaidėjo ID
                        firebase.database().ref(`${DB_KEY}/${roomName}/portal_links`).once('value').then(linksSnap => {
                            const links = linksSnap.val() || {};
                            console.log(`📋 [${p.name}] portal_links =`, JSON.stringify(links));
                            const phoneId = Object.keys(links).find(pid => links[pid] === p.id);
                            if (phoneId) { console.log(`✅ [${p.name}] 2-LINKS rado phoneId=${phoneId}`); doUpdate(phoneId); return; }
                            console.log(`⏭️ [${p.name}] 2-LINKS nerado (žaidėjo ID=${p.id}). Bandau UUID...`);

                            // 3 metodas (PASKUTINIS): UUID šešėlinis profilis — tik jei nėra portalo ryšio
                            firebase.database().ref(`${GLOBAL_PLAYERS_KEY}/${p.id}`).once('value').then(snap => {
                                if (snap.val()) { console.log(`⚠️ [${p.name}] 3-UUID šešėlinis profilis rastas, rašau ten ID=${p.id}`); doUpdate(p.id); }
                                else { console.log(`❌ [${p.name}] NIEKAS NERADO. Žaidėjas niekur nesusietas.`); }
                            });
                        });
                    }).catch(err => console.error("Casual global sync error:", err));
                } else {
                    // Be vardo — tik UUID profilis
                    firebase.database().ref(`${GLOBAL_PLAYERS_KEY}/${p.id}`).once('value').then(snap => {
                        if (snap.val()) doUpdate(p.id);
                    });
                }
            };
            t1Players.forEach(p => syncCasualToGlobal(p, s1 > s2, delta1));
            t2Players.forEach(p => syncCasualToGlobal(p, s2 > s1, delta2));

            if (typeof savePlayers === 'function') savePlayers(); 
            if (typeof renderPlayers === 'function') renderPlayers();
            if (typeof renderLeaderboard === 'function') renderLeaderboard();
        }).catch(err => console.error("Casual ELO Error:", err));
    }
}
