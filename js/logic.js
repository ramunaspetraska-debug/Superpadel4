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
    } catch(e) {} 
    return Array.from(pairs.values()).sort((a,b) => (b.w/b.mp) - (a.w/a.mp) || b.mp - a.mp); 
}

function calculateResults(mArr, pArr, isF = false) { 
    let res = []; 
    try { 
        let safeP = safeArr(pArr); 
        if(isF) { 
            for(let i=0; i<safeP.length; i+=2) if(i+1 < safeP.length) res.push({ id: safeP[i].id+'_'+safeP[i+1].id, name: safeP[i].name+' / '+safeP[i+1].name, p1: safeP[i], p2: safeP[i+1], mp:0, w:0, t:0, l:0, sw:0, sl:0, dif:0, lp:0, photo:null, gender:'M' }); 
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
    return res.sort((a,b) => settings.rankingMode === 'wins' ? (b.lp - a.lp || b.dif - a.dif) : (b.sw - a.sw || b.dif - a.dif)); 
}

function generateFinals() {
    try {
        ensureTournamentId();
        const safeP = safeArr(players);
        if (safeP.length < 4) { alert("Nepakanka žaidėjų finalams."); return; }

        const isF = settings.format === 'fixed';
        const ranked = calculateResults(matches, players, isF); 

        let teams = [];
        if (settings.format === 'mix_americano') {
            const males = ranked.filter(p => p.gender === 'M');
            const females = ranked.filter(p => p.gender === 'F');
            const pairCount = Math.min(males.length, females.length);
            if(pairCount < 2) { alert("Trūksta vyrų arba moterų finalinėms poroms suformuoti."); return; }
            for(let i=0; i<pairCount; i++) teams.push([males[i], females[i]]);
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
        if (settings.format === 'fixed') { return generateFixedRound(safeP); }
        if (safeP.length < 4 || safeP.length % 4 !== 0) { alert(`KLAIDA: Žaidėjų skaičius turi būti dalus iš 4! (Dabar yra ${safeP.length})`); return; }
        if (settings.format === 'mix_americano') { 
            const mC = safeP.filter(p => p.gender === 'M').length, fC = safeP.filter(p => p.gender === 'F').length; 
            if (mC !== fC) { alert("KLAIDA: Mix formatui reikia vienodo vyrų ir moterų skaičiaus!"); return; } 
        }
        
        let roundNum = (safeArr(matches).length > 0 ? (matches[matches.length-1].round || 0) : 0) + 1;
        
        if (preGeneratedTournament.length === 0 || roundNum > preGeneratedTournament.length || !preGeneratedTournament[roundNum - 1]) {
            el('loading-overlay').style.display = 'flex';
            setTimeout(() => {
                try {
                    if (settings.format === 'mix_americano') {
                        if (safeP.length === 8) { preGeneratedTournament = generateInterleavedMix8Matrix(safeP); setStore('pregen', preGeneratedTournament); } 
                        else if (safeP.length === 16) { preGeneratedTournament = generatePerfectMix16Matrix(safeP); setStore('pregen', preGeneratedTournament); } 
                        else { generateLookaheadTournament(safeP, roundNum, 30); }
                    } else { generateLookaheadTournament(safeP, roundNum, 30); }
                    el('loading-overlay').style.display = 'none'; dispatchRoundFromPreGen(roundNum);
                } catch (e) { console.error("Matrix generation error:", e); el('loading-overlay').style.display = 'none'; }
            }, 50);
        } else { dispatchRoundFromPreGen(roundNum); }
    } catch(e) { console.error("requestNextRound Error:", e); el('loading-overlay').style.display = 'none'; }
}

function generateInterleavedMix8Matrix(safePool) { let M = safePool.filter(p => p.gender === 'M'), F = safePool.filter(p => p.gender === 'F'); const opponentCycles = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]]; let baseRounds = []; for (let r = 0; r < 12; r++) { let roundMatches = [], oppSetup = opponentCycles[r % 3]; for (let c = 0; c < 2; c++) { let m1_idx = oppSetup[c][0], m2_idx = oppSetup[c][1], w1_idx = (m1_idx + r) % 4, w2_idx = (m2_idx + r) % 4; roundMatches.push({ t1: [M[m1_idx], F[w1_idx]], t2: [M[m2_idx], F[w2_idx]] }); } baseRounds.push(roundMatches); } const interleavePattern = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7]; let interleavedRounds = []; interleavePattern.forEach(idx => { interleavedRounds.push(baseRounds[idx]); }); let extendedPreGen = []; for (let copy = 0; copy < 1; copy++) { interleavedRounds.forEach(rm => extendedPreGen.push(rm)); } return extendedPreGen; }

function generatePerfectMix16Matrix(safePool) { let M = safePool.filter(p => p.gender === 'M'), F = safePool.filter(p => p.gender === 'F'); const perfectMatrix16 = [ [[[0,0], [7,7]], [[1,1], [5,5]], [[2,2], [4,4]], [[3,3], [6,6]]], [[[0,1], [3,4]], [[1,2], [2,3]], [[4,5], [7,0]], [[5,6], [6,7]]], [[[0,2], [4,6]], [[1,3], [6,0]], [[2,4], [3,5]], [[5,7], [7,1]]], [[[0,3], [1,4]], [[2,5], [4,7]], [[3,6], [5,0]], [[6,1], [7,2]]], [[[0,4], [3,7]], [[1,5], [6,2]], [[2,6], [7,3]], [[4,0], [5,1]]], [[[0,5], [7,4]], [[1,6], [3,0]], [[2,7], [5,2]], [[4,1], [6,3]]], [[[0,6], [5,3]], [[1,7], [7,5]], [[2,0], [6,4]], [[3,1], [4,2]]], [[[0,7], [2,1]], [[1,0], [4,3]], [[3,2], [7,6]], [[5,4], [6,5]]], [[[0,0], [6,6]], [[1,1], [2,2]], [[3,3], [4,4]], [[5,5], [7,7]]], [[[0,1], [4,5]], [[1,2], [5,6]], [[2,3], [7,0]], [[3,4], [6,7]]], [[[0,2], [2,4]], [[1,3], [3,5]], [[4,6], [5,7]], [[6,0], [7,1]]], [[[0,3], [5,0]], [[1,4], [6,1]], [[2,5], [4,7]], [[3,6], [7,2]]], [[[0,4], [2,6]], [[1,5], [7,3]], [[3,7], [5,1]], [[4,0], [6,2]]], [[[0,5], [3,0]], [[1,6], [5,2]], [[2,7], [6,3]], [[4,1], [7,4]]], [[[0,6], [1,7]], [[2,0], [3,1]], [[4,2], [5,3]], [[6,4], [7,5]]], [[[0,7], [6,5]], [[1,0], [4,3]], [[2,1], [5,4]], [[3,2], [7,6]]] ]; let baseRounds = []; perfectMatrix16.forEach((roundData) => { let currentRound = []; roundData.forEach((match) => { currentRound.push({ t1: [M[match[0][0]], F[match[0][1]]], t2: [M[match[1][0]], F[match[1][1]]] }); }); baseRounds.push(currentRound); }); let extendedPreGen = []; for (let copy = 0; copy < 1; copy++) { baseRounds.forEach(rm => extendedPreGen.push(rm)); } return extendedPreGen; }

function generateLookaheadTournament(safePool, startRound, countToGenerate) {
    let M = [], F = []; 
    if (settings.format === 'mix_americano') { M = safePool.filter(p => p.gender === 'M'); F = safePool.filter(p => p.gender === 'F'); } 
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
            if (settings.format === 'mix_americano') {
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
        bestSet.forEach(m => addStats(m)); newPreGen.push(bestSet); updateLastRoundOpponents(bestSet);
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
