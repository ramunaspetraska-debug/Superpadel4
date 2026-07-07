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
                        pairs.set(key, { name: `${names[0]} / ${names[1]}`, p1, p2, mp:0, w:0, t:0, l:0, sw:0, sd:0 }); 
                    } 
                    const s = pairs.get(key); 
                    s.mp++; 
                    s.sw += parseInt(myS || 0); 
                    s.sd += (parseInt(myS || 0) - parseInt(enS || 0)); 
                    if (parseInt(myS || 0) > parseInt(enS || 0)) s.w++; 
                    else if (parseInt(myS || 0) < parseInt(enS || 0)) s.l++; 
                    else s.t++; 
                } 
            }; 
            proc(m.team1, m.score1, m.score2); 
            proc(m.team2, m.score2, m.score1); 
        }); 
    } catch(e) { console.error("calculatePairsResults Error:", e); }
    // Rikiavimas: pergalių dalis su lygiosiomis (lygiosios = 0.5 pergalės) → taškų skirtumas → mačų kiekis.
    return Array.from(pairs.values()).sort((a,b) => ((b.w + 0.5*b.t)/b.mp) - ((a.w + 0.5*a.t)/a.mp) || (b.sd - a.sd) || (b.mp - a.mp));
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
        if (typeof settings !== 'undefined' && settings.format === 'cup') { alert("Taurės formatas atkrintamąsias ir finalus kuria automatiškai — spauskite „Kitas raundas“."); return; }
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
        if (typeof settings !== 'undefined' && settings.format === 'cup') { return generateCupRound(safeP); }
        if (typeof settings !== 'undefined' && settings.format === 'mexicano') { return generateMexicanoRound(safeP); }
        if (typeof settings !== 'undefined' && settings.format === 'king') { return generateKingRound(safeP); }
        if (safeP.length < 4 || safeP.length % 4 !== 0) { alert(`KLAIDA: Žaidėjų skaičius turi būti dalus iš 4! (Dabar yra ${safeP.length})`); return; }
        if (typeof settings !== 'undefined' && settings.format === 'mix_americano') { 
            const mC = safeP.filter(p => p.gender === 'M').length, fC = safeP.filter(p => p.gender === 'F').length; 
            if (mC !== fC) { alert("KLAIDA: Mix formatui reikia vienodo vyrų ir moterų skaičiaus!"); return; } 
        }
        
        let roundNum = (safeArr(matches).length > 0 ? (matches[matches.length-1].round || 0) : 0) + 1;
        
        // Fiksuotos matricos: Mix (8→12, 16→16 raundų) ir Americano 4-32 (tobuli whist blokai: 8 žaid. → 14 raundų,
        // kiti N → N-1 raundų). Viršijus jų ilgį, kartojam ciklu (dispatchRoundFromPreGen), todėl nepergeneruojam.
        const isMixMatrix = (typeof settings !== 'undefined' && settings.format === 'mix_americano' && (safeP.length === 8 || safeP.length === 16));
        const isAmericanoMatrix = (typeof settings !== 'undefined' && settings.format === 'americano' && (safeP.length === 8 || !!PERFECT_AMERICANO_MATRICES[safeP.length]));
        const needGen = preGeneratedTournament.length === 0 || (!isMixMatrix && !isAmericanoMatrix && (roundNum > preGeneratedTournament.length || !preGeneratedTournament[roundNum - 1]));
        // APSAUGA: Mix Americano reikia PO LYGIAI vyrų ir moterų, o žaidėjų skaičius turi dalintis iš 4 (4, 8, 12, 16...).
        if (needGen && typeof settings !== 'undefined' && settings.format === 'mix_americano') {
            const mc = safeP.filter(p => p && p.gender === 'M').length, wc = safeP.filter(p => p && p.gender === 'F').length;
            if (mc !== wc) { alert(`Mix Americano reikia PO LYGIAI vyrų ir moterų.\n\nDabar suvesta: ${mc} vyrai ir ${wc} moterys.\nPridėk arba pašalink žaidėjų, kad būtų po lygiai.`); return; }
            if (mc < 2 || mc % 2 !== 0) { alert(`Mix Americano žaidėjų skaičius turi dalintis iš 4 (pvz. 4, 8, 12, 16).\n\nDabar suvesta: ${safeP.length} žaidėjai.`); return; }
        }
        if (needGen) {
            let overlay = document.getElementById('loading-overlay');
            if(overlay) overlay.style.display = 'flex';
            setTimeout(() => {
                try {
                    if (typeof settings !== 'undefined' && settings.format === 'mix_americano') {
                        if (safeP.length === 8) { preGeneratedTournament = reorderMix8ForVariety(generateInterleavedMix8Matrix(safeP)); setStore('pregen', preGeneratedTournament); } 
                        else if (safeP.length === 16) { preGeneratedTournament = generatePerfectMix16Matrix(safeP); setStore('pregen', preGeneratedTournament); } 
                        else { generateLookaheadTournament(safeP, roundNum, 30); }
                    } else if (isAmericanoMatrix && safeP.length === 8) { preGeneratedTournament = generatePerfectAmericano8Matrix(safeP); setStore('pregen', preGeneratedTournament); }
                    else if (isAmericanoMatrix) { preGeneratedTournament = generatePerfectAmericanoMatrix(safeP); setStore('pregen', preGeneratedTournament); }
                    else { generateLookaheadTournament(safeP, roundNum, 30); }
                    if(overlay) overlay.style.display = 'none'; dispatchRoundFromPreGen(roundNum);
                } catch (e) { console.error("Matrix generation error:", e); if(overlay) overlay.style.display = 'none'; }
            }, 50);
        } else { dispatchRoundFromPreGen(roundNum); }
    } catch(e) { console.error("requestNextRound Error:", e); let overlay = document.getElementById('loading-overlay'); if(overlay) overlay.style.display = 'none'; }
}

// Permaišo Mix8 raundų EILIŠKUMĄ (ne pačias poras). Subalansuota tvarka:
//  - tas pats oponentas niekada nesikartoja 3 kartus iš eilės;
//  - tie patys vyrai niekada nežaidžia vienas prieš kitą dviejuose raunduose iš eilės (min tarpas 2);
//  - partnerystės tolygiai išsklaidytos (kiekviena pora maždaug kas 4 raundus).
// Variklio matrica NEKEIČIAMA — perrikiuojama tik jos išvestis. Seka fiksuota: Mix8 struktūra vienoda visiems turnyrams.
function reorderMix8ForVariety(matrix) {
    const ORDER = [1, 2, 4, 11, 9, 10, 0, 7, 5, 6, 8, 3];
    if (!Array.isArray(matrix) || matrix.length !== ORDER.length) return matrix;
    return ORDER.map(i => matrix[i]);
}

function generateInterleavedMix8Matrix(safePool) { let M = safePool.filter(p => p.gender === 'M'), F = safePool.filter(p => p.gender === 'F'); const opponentCycles = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]]; let baseRounds = []; for (let r = 0; r < 12; r++) { let roundMatches = [], oppSetup = opponentCycles[r % 3]; for (let c = 0; c < 2; c++) { let m1_idx = oppSetup[c][0], m2_idx = oppSetup[c][1], w1_idx = (m1_idx + r) % 4, w2_idx = (m2_idx + r) % 4; roundMatches.push({ t1: [M[m1_idx], F[w1_idx]], t2: [M[m2_idx], F[w2_idx]] }); } baseRounds.push(roundMatches); } const interleavePattern = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7]; let interleavedRounds = []; interleavePattern.forEach(idx => { interleavedRounds.push(baseRounds[idx]); }); let extendedPreGen = []; for (let copy = 0; copy < 1; copy++) { interleavedRounds.forEach(rm => extendedPreGen.push(rm)); } return extendedPreGen; }

function generatePerfectMix16Matrix(safePool) { let M = safePool.filter(p => p.gender === 'M'), F = safePool.filter(p => p.gender === 'F'); /* v2 OPTIMIZUOTA (2026-07): partnerystės nepakito — visos 64 M+F poros lygiai po 2x; oponentai: visos 120 žaidėjų porų susitinka bent 1x (buvo 112/120), maksimumas 3 susitikimai (buvo iki 6); vyras-prieš-vyrą ir moteris-prieš-moterį idealu (20 porų po 2x + 8 po 3x); 0 identiškų mačų pasikartojimų (buvo 3); 0 oponentų/partnerių pasikartojimų gretimuose raunduose. */ const perfectMatrix16 = [ [[[7,5], [4,2]], [[1,7], [5,3]], [[6,4], [2,0]], [[0,6], [3,1]]], [[[1,4], [7,2]], [[0,3], [2,5]], [[6,1], [4,7]], [[3,6], [5,0]]], [[[1,0], [2,1]], [[0,7], [7,6]], [[5,4], [6,5]], [[3,2], [4,3]]], [[[0,4], [4,0]], [[6,2], [2,6]], [[3,7], [1,5]], [[7,3], [5,1]]], [[[3,3], [6,6]], [[7,7], [2,2]], [[1,1], [4,4]], [[5,5], [0,0]]], [[[7,2], [6,1]], [[3,6], [2,5]], [[4,7], [5,0]], [[1,4], [0,3]]], [[[6,5], [0,7]], [[5,4], [3,2]], [[4,3], [2,1]], [[7,6], [1,0]]], [[[0,2], [4,6]], [[6,0], [1,3]], [[5,7], [2,4]], [[7,1], [3,5]]], [[[6,4], [0,6]], [[1,7], [3,1]], [[2,0], [4,2]], [[7,5], [5,3]]], [[[6,0], [3,5]], [[7,1], [2,4]], [[5,7], [4,6]], [[1,3], [0,2]]], [[[0,4], [3,7]], [[1,5], [2,6]], [[7,3], [4,0]], [[6,2], [5,1]]], [[[6,6], [4,4]], [[5,5], [1,1]], [[2,2], [0,0]], [[3,3], [7,7]]], [[[2,7], [4,1]], [[3,0], [1,6]], [[0,5], [6,3]], [[5,2], [7,4]]], [[[1,2], [4,5]], [[2,3], [3,4]], [[0,1], [5,6]], [[7,0], [6,7]]], [[[3,0], [5,2]], [[0,5], [2,7]], [[4,1], [6,3]], [[7,4], [1,6]]], [[[5,6], [2,3]], [[4,5], [3,4]], [[6,7], [1,2]], [[7,0], [0,1]]] ]; let baseRounds = []; perfectMatrix16.forEach((roundData) => { let currentRound = []; roundData.forEach((match) => { currentRound.push({ t1: [M[match[0][0]], F[match[0][1]]], t2: [M[match[1][0]], F[match[1][1]]] }); }); baseRounds.push(currentRound); }); let extendedPreGen = []; for (let copy = 0; copy < 1; copy++) { baseRounds.forEach(rm => extendedPreGen.push(rm)); } return extendedPreGen; }

// ===================== AMERICANO — TOBULOS MATRICOS (4-32 žaidėjai) =====================
// Matematiškai optimalūs "whist" tvarkaraščiai (skirtumų metodas + kompiuterinė paieška, patikrinta auditu).
// Kiekvienam dydžiui N: N-1 raundų blokas, kuriame VISOS C(N,2) partnerių poros susitinka LYGIAI po 1 kartą,
// o visos žaidėjų poros yra varžovai LYGIAI po 2 kartus. Kortų pasiskirstymas subalansuotas.
// 16-32 žaidėjams: 0 varžovų pasikartojimų gretimuose raunduose; 12 žaid.: struktūrinis minimumas (10);
// 4 žaid.: pasikartojimai fiziškai neišvengiami (tik 3 varžovai). Lentelė [a,b,c,d] = (a,b) prieš (c,d).
// Viršijus bloko ilgį matrica kartojama ciklu (dispatchRoundFromPreGen). 8 žaidėjų atvejis turi atskirą
// 14 raundų (2 blokų) matricą — žr. generatePerfectAmericano8Matrix.
const PERFECT_AMERICANO_MATRICES = { 4: [[[0,1,2,3]], [[0,2,1,3]], [[0,3,1,2]]], 12: [[[1,7,8,9],[10,2,3,5],[11,6,0,4]], [[11,5,10,3],[0,6,7,8],[9,1,2,4]], [[8,0,1,3],[11,4,9,2],[10,5,6,7]], [[9,4,5,6],[11,3,8,1],[7,10,0,2]], [[11,2,7,0],[6,9,10,1],[8,3,4,5]], [[11,1,6,10],[7,2,3,4],[5,8,9,0]], [[4,7,8,10],[11,0,5,9],[6,1,2,3]], [[5,0,1,2],[3,6,7,9],[11,10,4,8]], [[2,5,6,8],[4,10,0,1],[11,9,3,7]], [[3,9,10,0],[11,8,2,6],[1,4,5,7]], [[0,3,4,6],[11,7,1,5],[2,8,9,10]]], 16: [[[12,6,1,5],[15,8,9,10],[13,3,0,7],[11,14,2,4]], [[3,6,9,11],[4,13,8,12],[15,0,1,2],[5,10,7,14]], [[10,13,1,3],[11,5,0,4],[12,2,14,6],[15,7,8,9]], [[2,5,8,10],[15,14,0,1],[4,9,6,13],[3,12,7,11]], [[15,6,7,8],[10,4,14,3],[11,1,13,5],[9,12,0,2]], [[15,13,14,0],[1,4,7,9],[2,11,6,10],[3,8,5,12]], [[8,11,14,1],[15,5,6,7],[10,0,12,4],[9,3,13,2]], [[2,7,4,11],[15,12,13,14],[0,3,6,8],[1,10,5,9]], [[7,10,13,0],[9,14,11,3],[8,2,12,1],[15,4,5,6]], [[0,9,4,8],[1,6,3,10],[14,2,5,7],[15,11,12,13]], [[6,9,12,14],[8,13,10,2],[15,3,4,5],[7,1,11,0]], [[15,10,11,12],[0,5,2,9],[14,8,3,7],[13,1,4,6]], [[15,2,3,4],[7,12,9,1],[5,8,11,13],[6,0,10,14]], [[12,0,3,5],[13,7,2,6],[15,9,10,11],[14,4,1,8]], [[5,14,9,13],[6,11,8,0],[4,7,10,12],[15,1,2,3]]], 20: [[[11,2,1,4],[13,5,8,9],[12,7,15,17],[19,0,18,6],[14,10,16,3]], [[0,15,2,8],[17,12,1,3],[19,5,4,11],[16,7,6,9],[18,10,13,14]], [[3,17,6,8],[5,1,7,13],[19,10,9,16],[2,12,11,14],[4,15,18,0]], [[7,17,16,0],[10,6,12,18],[19,15,14,2],[8,3,11,13],[9,1,4,5]], [[19,7,6,13],[1,12,15,16],[0,14,3,5],[2,17,4,10],[18,9,8,11]], [[19,4,3,10],[16,11,0,2],[15,6,5,8],[18,14,1,7],[17,9,12,13]], [[2,16,5,7],[19,9,8,15],[3,14,17,18],[1,11,10,13],[4,0,6,12]], [[6,17,1,2],[4,14,13,16],[19,12,11,18],[7,3,9,15],[5,0,8,10]], [[14,6,9,10],[15,11,17,4],[13,8,16,18],[12,3,2,5],[19,1,0,7]], [[0,11,14,15],[1,16,3,9],[17,8,7,10],[19,6,5,12],[18,13,2,4]], [[4,18,7,9],[19,11,10,17],[5,16,0,1],[3,13,12,15],[6,2,8,14]], [[19,14,13,1],[8,0,3,4],[7,2,10,12],[6,16,15,18],[9,5,11,17]], [[10,5,13,15],[9,0,18,2],[12,8,14,1],[19,17,16,4],[11,3,6,7]], [[16,8,11,12],[17,13,0,6],[19,3,2,9],[14,5,4,7],[15,10,18,1]], [[3,18,5,11],[19,8,7,14],[1,15,4,6],[0,10,9,12],[2,13,16,17]], [[19,13,12,0],[7,18,2,3],[6,1,9,11],[8,4,10,16],[5,15,14,17]], [[9,4,12,14],[10,2,5,6],[11,7,13,0],[8,18,17,1],[19,16,15,3]], [[16,12,18,5],[15,7,10,11],[13,4,3,6],[14,9,17,0],[19,2,1,8]], [[10,1,0,3],[11,6,14,16],[13,9,15,2],[19,18,17,5],[12,4,7,8]]], 24: [[[5,8,11,13],[3,16,17,22],[23,9,0,1],[6,18,19,2],[10,14,12,21],[4,20,7,15]], [[9,2,12,20],[11,0,1,7],[15,19,17,3],[10,13,16,18],[23,14,5,6],[8,21,22,4]], [[17,10,20,5],[0,4,2,11],[19,8,9,15],[16,6,7,12],[18,21,1,3],[23,22,13,14]], [[0,3,6,8],[23,4,18,19],[5,9,7,16],[22,15,2,10],[1,13,14,20],[21,11,12,17]], [[19,0,21,7],[23,18,9,10],[14,17,20,22],[15,4,5,11],[12,2,3,8],[13,6,16,1]], [[2,15,16,21],[9,13,11,20],[5,17,18,1],[4,7,10,12],[3,19,6,14],[23,8,22,0]], [[22,3,1,10],[17,20,0,2],[15,5,6,11],[18,7,8,14],[16,9,19,4],[23,21,12,13]], [[6,22,9,17],[7,10,13,15],[12,16,14,0],[23,11,2,3],[8,20,21,4],[5,18,19,1]], [[23,16,7,8],[12,15,18,20],[11,4,14,22],[17,21,19,5],[10,0,1,6],[13,2,3,9]], [[4,8,6,15],[21,14,1,9],[0,12,13,19],[23,3,17,18],[20,10,11,16],[22,2,5,7]], [[11,1,2,7],[12,5,15,0],[18,22,20,6],[13,16,19,21],[23,17,8,9],[14,3,4,10]], [[23,12,3,4],[6,19,20,2],[8,11,14,16],[9,21,22,5],[13,17,15,1],[7,0,10,18]], [[22,11,12,18],[21,1,4,6],[23,2,16,17],[20,13,0,8],[3,7,5,14],[19,9,10,15]], [[16,19,22,1],[15,8,18,3],[23,20,11,12],[14,4,5,10],[21,2,0,9],[17,6,7,13]], [[2,18,5,13],[23,7,21,22],[8,12,10,19],[3,6,9,11],[4,16,17,0],[1,14,15,20]], [[16,20,18,4],[11,14,17,19],[10,3,13,21],[9,22,0,5],[23,15,6,7],[12,1,2,8]], [[21,10,11,17],[19,12,22,7],[2,6,4,13],[23,1,15,16],[20,0,3,5],[18,8,9,14]], [[0,13,14,19],[3,15,16,22],[2,5,8,10],[1,17,4,12],[7,11,9,18],[23,6,20,21]], [[13,3,4,9],[14,7,17,2],[15,18,21,0],[20,1,22,8],[23,19,10,11],[16,5,6,12]], [[6,9,12,14],[5,21,8,16],[23,10,1,2],[7,19,20,3],[11,15,13,22],[4,17,18,0]], [[23,0,14,15],[1,5,3,12],[18,11,21,6],[17,7,8,13],[19,22,2,4],[20,9,10,16]], [[14,18,16,2],[23,13,4,5],[7,20,21,3],[10,22,0,6],[9,12,15,17],[8,1,11,19]], [[23,5,19,20],[6,10,8,17],[1,4,7,9],[2,14,15,21],[22,12,13,18],[0,16,3,11]]], 28: [[[11,6,12,24],[23,26,1,7],[16,3,20,4],[27,17,8,10],[15,5,18,9],[13,14,21,25],[19,0,22,2]], [[11,25,15,26],[14,22,17,24],[18,21,23,2],[10,0,13,4],[8,9,16,20],[27,12,3,5],[6,1,7,19]], [[27,2,20,22],[4,12,7,14],[1,15,5,16],[0,17,3,21],[23,18,24,9],[25,26,6,10],[8,11,13,19]], [[18,13,19,4],[22,12,25,16],[26,7,2,9],[3,6,8,14],[20,21,1,5],[23,10,0,11],[27,24,15,17]], [[27,14,5,7],[8,3,9,21],[13,0,17,1],[16,24,19,26],[10,11,18,22],[20,23,25,4],[12,2,15,6]], [[2,19,5,23],[10,13,15,21],[25,20,26,11],[3,17,7,18],[27,4,22,24],[0,1,8,12],[6,14,9,16]], [[9,26,12,3],[17,20,22,1],[10,24,14,25],[13,21,16,23],[7,8,15,19],[27,11,2,4],[5,0,6,18]], [[5,8,10,16],[1,9,4,11],[27,26,17,19],[24,14,0,18],[25,12,2,13],[20,15,21,6],[22,23,3,7]], [[0,3,5,11],[17,18,25,2],[19,9,22,13],[23,4,26,6],[15,10,16,1],[20,7,24,8],[27,21,12,14]], [[4,21,7,25],[12,15,17,23],[27,6,24,26],[5,19,9,20],[2,3,10,14],[0,22,1,13],[8,16,11,18]], [[17,12,18,3],[27,23,14,16],[25,6,1,8],[2,5,7,13],[19,20,0,4],[21,11,24,15],[22,9,26,10]], [[27,13,4,6],[19,22,24,3],[7,2,8,20],[15,23,18,25],[12,26,16,0],[11,1,14,5],[9,10,17,21]], [[16,6,19,10],[27,18,9,11],[20,1,23,3],[12,7,13,25],[24,0,2,8],[14,15,22,26],[17,4,21,5]], [[7,21,11,22],[10,18,13,20],[4,5,12,16],[6,23,9,0],[14,17,19,25],[27,8,26,1],[2,24,3,15]], [[24,19,25,10],[5,13,8,15],[26,0,7,11],[9,12,14,20],[27,3,21,23],[2,16,6,17],[1,18,4,22]], [[23,13,26,17],[27,25,16,18],[0,8,3,10],[24,11,1,12],[21,22,2,6],[4,7,9,15],[19,14,20,5]], [[1,2,9,13],[3,20,6,24],[27,5,23,25],[11,14,16,22],[7,15,10,17],[4,18,8,19],[26,21,0,12]], [[14,1,18,2],[21,24,26,5],[9,4,10,22],[27,15,6,8],[11,12,19,23],[17,25,20,0],[13,3,16,7]], [[24,5,0,7],[1,4,6,12],[27,22,13,15],[16,11,17,2],[21,8,25,9],[18,19,26,3],[20,10,23,14]], [[12,20,15,22],[16,19,21,0],[6,7,14,18],[27,10,1,3],[4,26,5,17],[9,23,13,24],[8,25,11,2]], [[14,9,15,0],[19,6,23,7],[18,8,21,12],[26,2,4,10],[16,17,24,1],[22,3,25,5],[27,20,11,13]], [[27,0,18,20],[2,10,5,12],[6,9,11,17],[25,15,1,19],[26,13,3,14],[21,16,22,7],[23,24,4,8]], [[6,20,10,21],[3,4,11,15],[13,16,18,24],[5,22,8,26],[27,7,25,0],[9,17,12,19],[1,23,2,14]], [[25,1,3,9],[13,8,14,26],[27,19,10,12],[17,7,20,11],[18,5,22,6],[21,2,24,4],[15,16,23,0]], [[8,22,12,23],[27,9,0,2],[11,19,14,21],[15,18,20,26],[7,24,10,1],[5,6,13,17],[3,25,4,16]], [[14,4,17,8],[10,5,11,23],[15,2,19,3],[22,25,0,6],[12,13,20,24],[27,16,7,9],[18,26,21,1]], [[22,17,23,8],[26,16,2,20],[0,14,4,15],[27,1,19,21],[3,11,6,13],[7,10,12,18],[24,25,5,9]]], 32: [[[31,26,10,5],[8,11,3,7],[16,4,21,29],[18,1,19,30],[13,20,17,27],[14,15,23,25],[12,28,0,6],[9,22,24,2]], [[29,5,2,12],[3,17,4,15],[1,20,6,14],[24,27,19,23],[31,11,26,21],[28,13,16,22],[25,7,9,18],[30,0,8,10]], [[21,3,5,14],[28,16,2,10],[31,7,22,17],[24,9,12,18],[25,1,29,8],[26,27,4,6],[30,13,0,11],[20,23,15,19]], [[3,19,22,28],[0,13,15,24],[9,23,10,21],[7,26,12,20],[4,11,8,18],[5,6,14,16],[31,17,1,27],[30,2,25,29]], [[19,26,23,2],[24,7,25,5],[15,28,30,8],[20,21,29,0],[14,17,9,13],[22,10,27,4],[31,1,16,11],[18,3,6,12]], [[23,6,24,4],[21,9,26,3],[14,27,29,7],[18,25,22,1],[31,0,15,10],[19,20,28,30],[13,16,8,12],[17,2,5,11]], [[31,29,13,8],[17,18,26,28],[19,7,24,1],[11,14,6,10],[16,23,20,30],[12,25,27,5],[21,4,22,2],[15,0,3,9]], [[30,15,18,24],[27,9,11,20],[5,19,6,17],[3,22,8,16],[1,2,10,12],[0,7,4,14],[26,29,21,25],[31,13,28,23]], [[16,17,25,27],[11,24,26,4],[10,13,5,9],[14,30,2,8],[31,28,12,7],[20,3,21,1],[15,22,19,29],[18,6,23,0]], [[8,15,12,22],[13,27,14,25],[11,30,16,24],[4,17,19,28],[3,6,29,2],[31,21,5,0],[9,10,18,20],[7,23,26,1]], [[5,18,20,29],[31,22,6,1],[9,16,13,23],[12,0,17,25],[14,28,15,26],[8,24,27,2],[4,7,30,3],[10,11,19,21]], [[26,8,10,19],[4,18,5,16],[30,6,3,13],[31,12,27,22],[0,1,9,11],[2,21,7,15],[29,14,17,23],[25,28,20,24]], [[4,23,9,17],[27,30,22,26],[1,8,5,15],[2,3,11,13],[31,14,29,24],[0,16,19,25],[28,10,12,21],[6,20,7,18]], [[25,13,30,7],[22,29,26,5],[27,10,28,8],[21,6,9,15],[17,20,12,16],[23,24,1,3],[18,0,2,11],[31,4,19,14]], [[27,15,1,9],[23,8,11,17],[24,0,28,7],[31,6,21,16],[20,2,4,13],[29,12,30,10],[25,26,3,5],[19,22,14,18]], [[28,4,1,11],[31,10,25,20],[23,26,18,22],[27,12,15,21],[24,6,8,17],[29,30,7,9],[0,19,5,13],[2,16,3,14]], [[11,25,12,23],[7,8,16,18],[1,4,27,0],[2,15,17,26],[5,21,24,30],[6,13,10,20],[9,28,14,22],[31,19,3,29]], [[13,1,18,26],[6,19,21,30],[11,12,20,22],[15,29,16,27],[9,25,28,3],[31,23,7,2],[10,17,14,24],[5,8,0,4]], [[16,29,0,9],[21,22,30,1],[31,2,17,12],[23,11,28,5],[25,8,26,6],[19,4,7,13],[20,27,24,3],[15,18,10,14]], [[27,3,0,10],[28,29,6,8],[26,11,14,20],[23,5,7,16],[31,9,24,19],[30,18,4,12],[1,15,2,13],[22,25,17,21]], [[18,21,13,17],[19,1,3,12],[24,25,2,4],[26,14,0,8],[22,7,10,16],[28,11,29,9],[23,30,27,6],[31,5,20,15]], [[17,30,1,10],[31,3,18,13],[16,19,11,15],[21,28,25,4],[22,23,0,2],[24,12,29,6],[20,5,8,14],[26,9,27,7]], [[7,20,22,0],[14,2,19,27],[31,24,8,3],[6,9,1,5],[12,13,21,23],[11,18,15,25],[10,26,29,4],[16,30,17,28]], [[7,14,11,21],[10,29,15,23],[6,22,25,0],[31,20,4,30],[3,16,18,27],[8,9,17,19],[2,5,28,1],[12,26,13,24]], [[6,25,11,19],[30,12,14,23],[2,18,21,27],[3,10,7,17],[4,5,13,15],[31,16,0,26],[8,22,9,20],[29,1,24,28]], [[31,18,2,28],[4,20,23,29],[5,12,9,19],[0,3,26,30],[1,14,16,25],[10,24,11,22],[6,7,15,17],[8,27,13,21]], [[21,24,16,20],[0,14,1,12],[26,2,30,9],[25,10,13,19],[22,4,6,15],[29,17,3,11],[31,8,23,18],[27,28,5,7]], [[31,30,14,9],[12,15,7,11],[13,26,28,6],[20,8,25,2],[18,19,27,29],[22,5,23,3],[17,24,21,0],[16,1,4,10]], [[28,0,23,27],[2,9,6,16],[3,4,12,14],[5,24,10,18],[7,21,8,19],[1,17,20,26],[31,15,30,25],[29,11,13,22]], [[7,10,2,6],[31,25,9,4],[17,0,18,29],[13,14,22,24],[15,3,20,28],[8,21,23,1],[12,19,16,26],[11,27,30,5]], [[15,16,24,26],[19,2,20,0],[10,23,25,3],[13,29,1,7],[17,5,22,30],[14,21,18,28],[31,27,11,6],[9,12,4,8]]] };
function generatePerfectAmericanoMatrix(safePool) {
    const N = safePool.length;
    const data = PERFECT_AMERICANO_MATRICES[N];
    if (!data) return null;
    const P = shuffle([...safePool]);
    return data.map(roundData => roundData.map(t => ({ t1: [P[t[0]], P[t[1]]], t2: [P[t[2]], P[t[3]]] })));
}

// ===================== AMERICANO 8 — TOBULA MATRICA =====================
// Matematiškai optimalus 8 žaidėjų Americano (rasta kompiuterine paieška, patikrinta auditu):
// • R1-R7 — tobulas "whist" blokas: VISOS 28 partnerių poros po 1 kartą, visi oponentai lygiai po 2x;
// • R8-R14 — antras tobulas blokas: per 14 raundų kiekviena pora partneriauja LYGIAI 2x, oponentai LYGIAI 4x;
// • 0 identiškų mačų; 0 partnerių/oponentų pasikartojimų gretimuose raunduose;
// • kortų balansas idealus (kiekvienas žaidėjas 1 korte lygiai 7x iš 14);
// • žaidžiant 12 raundų: aprėptos visos 28 poros, nė viena nesikartoja daugiau nei 2x.
// Virš 14 raundų matrica kartojama ciklu (dispatchRoundFromPreGen). Žaidėjai sumaišomi kaskart generuojant.
function generatePerfectAmericano8Matrix(safePool) {
    const P = shuffle([...safePool]);
    const perfectAmericano8 = [ [[[0,4], [2,5]], [[1,7], [3,6]]], [[[1,2], [5,7]], [[0,3], [4,6]]], [[[4,7], [5,6]], [[0,1], [2,3]]], [[[0,6], [1,5]], [[2,7], [3,4]]], [[[0,2], [6,7]], [[1,3], [4,5]]], [[[2,6], [3,5]], [[0,7], [1,4]]], [[[0,5], [3,7]], [[1,6], [2,4]]], [[[1,4], [5,3]], [[7,0], [2,6]]], [[[2,0], [1,3]], [[7,6], [5,4]]], [[[7,4], [2,3]], [[1,0], [5,6]]], [[[3,4], [6,0]], [[7,2], [1,5]]], [[[2,1], [6,4]], [[7,5], [3,0]]], [[[7,3], [1,6]], [[2,4], [5,0]]], [[[7,1], [0,4]], [[2,5], [3,6]]] ];
    return perfectAmericano8.map(roundData => roundData.map(m => ({ t1: [P[m[0][0]], P[m[0][1]]], t2: [P[m[1][0]], P[m[1][1]]] })));
}

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
        const pg = safeArr(preGeneratedTournament);
        let len = pg.length;
        let idx;
        if (len > 0) {
            // TRYNIMUI ATSPARUS dispatch: imam REČIAUSIAI panaudotos matricos eilutės turinį.
            // Normaliam žaidimui (be trynimo) tai duoda 0,1,2,...,len-1,0,1,... — identiška senam (roundNum-1)%len.
            // Bet ištrynus VIDURINĮ raundą, kitas raundas užpildo TĄ spragą (atstato porų balansą),
            // o ne aklai pakartoja R1 turinį. Variklio matrica NEKEIČIAMA.
            const teamSig = t => safeArr(t).map(p => (p && p.name) ? p.name : '?').sort().join('&');
            const rSig = (rd, a, b) => safeArr(rd).map(m => [teamSig(m[a]), teamSig(m[b])].sort().join('|')).sort().join('#');
            const sigToIdx = {};
            for (let i = 0; i < len; i++) sigToIdx[rSig(pg[i], 't1', 't2')] = i;
            const counts = new Array(len).fill(0);
            const byRound = {};
            safeArr(matches).forEach(m => { if (!m.isFinal) (byRound[m.round] = byRound[m.round] || []).push(m); });
            Object.keys(byRound).forEach(rn => { const s = rSig(byRound[rn], 'team1', 'team2'); if (s in sigToIdx) counts[sigToIdx[s]]++; });
            idx = 0; let best = counts[0];
            for (let i = 1; i < len; i++) { if (counts[i] < best) { best = counts[i]; idx = i; } }
        } else {
            idx = (roundNum - 1);
        }
        let roundData = pg[idx]; 
        if (roundData) { 
            let newM = roundData.map((m, ci) => ({ id: uid(), round: roundNum, court: ci + 1, finished: false, score1: 0, score2: 0, team1: m.t1, team2: m.t2 }));
            matches = [...safeArr(matches), ...newM]; autoSave(true); switchView('matches'); 
        }
    } catch(e) { console.error("dispatchRoundFromPreGen Error:", e); }
}

function generateFixedRound(safePool) {
    try {
        if (safePool.length < 4) { alert(`KLAIDA: Fiksuotoms poroms reikia bent 4 žaidėjų. (Dabar yra ${safePool.length})`); return; }
        if (safePool.length % 2 !== 0) { alert(`KLAIDA: Fiksuotoms poroms žaidėjų skaičius turi būti lyginis! (Dabar yra ${safePool.length})\n\nPoros sudaromos pagal sąrašo eilę: 1-2, 3-4, 5-6...`); return; }
        let teams = []; for (let k = 0; k < safePool.length; k += 2) { teams.push([safePool[k], safePool[k + 1]]); }
        let roundNum = (safeArr(matches).length > 0 ? (matches[matches.length-1].round || 0) : 0) + 1;

        // Ratų sistema (circle method). Jei komandų skaičius NELYGINIS — pridedam tuščią vietą (-1 = "bye"):
        // su ja suporuota komanda tą raundą ilsisi. Taip kiekviena komanda sužaidžia su visomis kitomis.
        let idxs = teams.map((_, i) => i);
        if (idxs.length % 2 === 1) idxs.push(-1);
        const K_even = idxs.length;
        const cycleRounds = K_even - 1;

        // Vienos rotacijos (shift) poravimas: mačų indeksų poros + ilsisi komanda (bye atveju).
        const pairingForShift = (shift) => {
            let rotated = [idxs[0]]; let others = idxs.slice(1);
            for (let i = 0; i < shift; i++) others.unshift(others.pop());
            rotated.push(...others);
            let pairs = []; let resting = null;
            for (let i = 0; i < K_even / 2; i++) {
                let a = rotated[i], b = rotated[K_even - 1 - i];
                if (a === -1) { resting = b; continue; }
                if (b === -1) { resting = a; continue; }
                pairs.push([a, b]);
            }
            return { pairs, resting };
        };

        // TRYNIMUI ATSPARUS rotacijos parinkimas (tas pats principas kaip dispatchRoundFromPreGen):
        // suskaičiuojam, kiek kartų kiekviena rotacija jau panaudota esamuose raunduose, ir imam
        // REČIAUSIAI naudotą. Normaliam žaidimui (be trynimo) tai duoda 0,1,2,...,cycleRounds-1,0,...
        // — identiška senam (roundNum-1)%cycleRounds. Bet ištrynus VIDURINĮ raundą, kitas raundas
        // užpildo TĄ spragą (trūkstamą rotaciją), o ne aklai pakartoja jau sužaistą.
        const teamSig = t => safeArr(t).map(p => (p && p.id) ? p.id : '?').sort().join('&');
        const matchSig = (t1, t2) => [teamSig(t1), teamSig(t2)].sort().join('|');
        const shiftSigs = [];
        for (let s = 0; s < cycleRounds; s++) {
            const pr = pairingForShift(s);
            shiftSigs.push(pr.pairs.map(pair => matchSig(teams[pair[0]], teams[pair[1]])).sort().join('#'));
        }
        const counts = new Array(cycleRounds).fill(0);
        const byRound = {};
        safeArr(matches).forEach(m => { if (m && !m.isFinal) (byRound[m.round] = byRound[m.round] || []).push(m); });
        Object.keys(byRound).forEach(rn => {
            const s = byRound[rn].map(m => matchSig(m.team1, m.team2)).sort().join('#');
            const idx = shiftSigs.indexOf(s);
            if (idx !== -1) counts[idx]++;
        });
        let shift = 0, best = counts[0];
        for (let s = 1; s < cycleRounds; s++) { if (counts[s] < best) { best = counts[s]; shift = s; } }

        const chosen = pairingForShift(shift);
        let roundMatches = chosen.pairs.map(pair => ({ team1: teams[pair[0]], team2: teams[pair[1]] }));
        let restingTeam = (chosen.resting !== null && chosen.resting !== -1) ? teams[chosen.resting] : null;

        // Kortų priskyrimas pagal FAKTINĘ istoriją: mačui parenkam laisvą kortą, kuriame jo komandos
        // žaidė rečiausiai, kad poros nuolat nežaistų tame pačiame korte (circle metode pirmoji pora kitaip
        // liktų 1-ame korte visą turnyrą). Lygybės atveju kandidatai pradedami nuo rotacinio postūmio
        // (idx+shift) — kortai keičiasi net tuščioje istorijoje. Atsparu raundų trynimui.
        const courtHist = {};
        safeArr(matches).forEach(m => { if (m && !m.isFinal && m.court) { [m.team1, m.team2].forEach(t => { const k = teamSig(t); courtHist[k] = courtHist[k] || {}; courtHist[k][m.court] = (courtHist[k][m.court] || 0) + 1; }); } });
        const courtCount = roundMatches.length;
        const takenCourts = new Set();
        let newM = [];
        roundMatches.forEach((m, idx) => {
            let bestCourt = null, bestScore = Infinity;
            for (let ci = 0; ci < courtCount; ci++) {
                const c = ((idx + shift + ci) % courtCount) + 1;
                if (takenCourts.has(c)) continue;
                const score = ((courtHist[teamSig(m.team1)] || {})[c] || 0) + ((courtHist[teamSig(m.team2)] || {})[c] || 0);
                if (score < bestScore) { bestScore = score; bestCourt = c; }
            }
            takenCourts.add(bestCourt);
            newM.push({ id: uid(), round: roundNum, court: bestCourt, finished: false, score1: 0, score2: 0, team1: m.team1, team2: m.team2 });
        });

        matches = [...safeArr(matches), ...newM]; autoSave(true); switchView('matches');
        if (restingTeam) { setTimeout(() => alert(`ℹ️ ${roundNum} raundą ilsisi: ${restingTeam[0].name} / ${restingTeam[1].name}`), 100); }
    } catch(e) { console.error("generateFixedRound Error:", e); }
}

// ===================== MEXICANO =====================
// Kiekvienas raundas formuojamas pagal GYVĄ turnyro lentelę: žaidėjai rikiuojami pagal rezultatus,
// grupuojami ketvertais pagal vietą (1-4 į 1 kortą, 5-8 į 2 kortą...), ketverte žaidžia 1+4 prieš 2+3.
// Pirmas raundas — atsitiktinis. Mix kategorijoje poros visada V+M.
function generateMexicanoRound(safePool) {
    try {
        const N = safePool.length;
        if (N < 4 || N % 4 !== 0) { alert(`KLAIDA: Mexicano formatui žaidėjų skaičius turi būti dalus iš 4! (Dabar yra ${N})`); return; }
        const isMix = (typeof settings !== 'undefined' && settings.category === 'Mix');
        if (isMix) {
            const mC = safePool.filter(p => p && p.gender === 'M').length, fC = N - mC;
            if (mC !== fC) { alert(`KLAIDA: Mix kategorijai reikia po lygiai vyrų ir moterų! (Dabar: ${mC} vyr. / ${fC} mot.)`); return; }
        }
        const roundNum = (safeArr(matches).length > 0 ? (matches[matches.length-1].round || 0) : 0) + 1;
        // Nebaigti mačai į lentelę neįtraukiami, todėl poravimas be jų rezultatų būtų netikslus — įspėjam.
        const unfinishedM = safeArr(matches).filter(m => m && !m.finished && !m.isFinal);
        if (unfinishedM.length > 0 && !confirm(`Dar ${unfinishedM.length} mač. nebaigta — lentelė nepilna, kitas raundas bus poruojamas be jų rezultatų.\n\nVis tiek generuoti?`)) return;
        const finished = safeArr(matches).filter(m => m && m.finished && !m.isFinal);
        let ordered;
        if (finished.length === 0) {
            ordered = shuffle([...safePool]);
        } else {
            const ranked = calculateResults(matches, safePool, false);
            ordered = ranked.map(r => safePool.find(p => p && (p.id === r.id)) || r).filter(Boolean);
        }
        let newM = [];
        if (isMix) {
            const Ms = ordered.filter(p => p.gender === 'M'), Fs = ordered.filter(p => p.gender !== 'M');
            for (let c = 0; c < N / 4; c++) {
                const m1 = Ms[2*c], m2 = Ms[2*c+1], f1 = Fs[2*c], f2 = Fs[2*c+1];
                if (!m1 || !m2 || !f1 || !f2) break;
                newM.push({ id: uid(), round: roundNum, court: c + 1, finished: false, score1: 0, score2: 0, team1: [m1, f2], team2: [m2, f1] });
            }
        } else {
            for (let c = 0; c < N / 4; c++) {
                const q = ordered.slice(4*c, 4*c + 4);
                if (q.length < 4) break;
                newM.push({ id: uid(), round: roundNum, court: c + 1, finished: false, score1: 0, score2: 0, team1: [q[0], q[3]], team2: [q[1], q[2]] });
            }
        }
        matches = [...safeArr(matches), ...newM]; autoSave(true); switchView('matches');
    } catch(e) { console.error("generateMexicanoRound Error:", e); }
}

// ===================== KING OF THE COURT =====================
// Kortai hierarchiniai (1 kortas — "karaliaus"). Po raundo laimėjusi pora kyla kortu aukštyn,
// pralaimėjusi leidžiasi žemyn (kraštuose lieka). Atvykusios poros SKYLA ir susikeičia partneriais.
// Lygiųjų atveju laimėtoja laikoma 1 komanda. Pirmas raundas (ar pasikeitus sudėčiai) — atsitiktinis.
function generateKingRound(safePool) {
    try {
        const N = safePool.length;
        if (N < 4 || N % 4 !== 0) { alert(`KLAIDA: King of the Court formatui žaidėjų skaičius turi būti dalus iš 4! (Dabar yra ${N})`); return; }
        const isMix = (typeof settings !== 'undefined' && settings.category === 'Mix');
        if (isMix) {
            const mC = safePool.filter(p => p && p.gender === 'M').length, fC = N - mC;
            if (mC !== fC) { alert(`KLAIDA: Mix kategorijai reikia po lygiai vyrų ir moterų! (Dabar: ${mC} vyr. / ${fC} mot.)`); return; }
        }
        const courts = N / 4;
        const roundNum = (safeArr(matches).length > 0 ? (matches[matches.length-1].round || 0) : 0) + 1;
        const prev = safeArr(matches).filter(m => m && !m.isFinal && m.round === roundNum - 1);
        // Nebaigtas praėjęs raundas → blokuojam: kitaip kortų hierarchija būtų prarasta ir sėja taptų atsitiktinė.
        if (prev.length > 0 && !prev.every(m => m.finished)) { alert(`Pabaikite visus ${roundNum - 1} raundo mačus prieš generuodami kitą!`); return; }
        let canMove = prev.length === courts && prev.every(m => m.finished);
        if (canMove) {
            const prevIds = new Set();
            prev.forEach(m => [...safeArr(m.team1), ...safeArr(m.team2)].forEach(p => p && prevIds.add(p.id)));
            canMove = prevIds.size === N && safePool.every(p => prevIds.has(p.id));
        }
        let newM = [];
        const mk = (court, t1, t2) => ({ id: uid(), round: roundNum, court: court, finished: false, score1: 0, score2: 0, team1: t1, team2: t2 });
        if (!canMove) {
            // Atsitiktinė sėja (1 raundas arba pasikeitusi sudėtis)
            if (isMix) {
                const Ms = shuffle(safePool.filter(p => p.gender === 'M')), Fs = shuffle(safePool.filter(p => p.gender !== 'M'));
                for (let c = 0; c < courts; c++) newM.push(mk(c + 1, [Ms[2*c], Fs[2*c]], [Ms[2*c+1], Fs[2*c+1]]));
            } else {
                const pool = shuffle([...safePool]);
                for (let c = 0; c < courts; c++) newM.push(mk(c + 1, [pool[4*c], pool[4*c+1]], [pool[4*c+2], pool[4*c+3]]));
            }
        } else {
            const byCourt = [...prev].sort((a, b) => (a.court || 0) - (b.court || 0));
            const winners = [], losers = [];
            byCourt.forEach(m => {
                const s1 = parseInt(m.score1 || 0), s2 = parseInt(m.score2 || 0);
                if (s1 >= s2) { winners.push(safeArr(m.team1)); losers.push(safeArr(m.team2)); }
                else { winners.push(safeArr(m.team2)); losers.push(safeArr(m.team1)); }
            });
            for (let c = 0; c < courts; c++) {
                let pairA, pairB; // dvi šio korto poros naujame raunde
                if (courts === 1) { pairA = winners[0]; pairB = losers[0]; }
                else if (c === 0) { pairA = winners[0]; pairB = winners[1]; }
                else if (c === courts - 1) { pairA = losers[c - 1]; pairB = losers[c]; }
                else { pairA = losers[c - 1]; pairB = winners[c + 1]; }
                let t1, t2;
                if (isMix) {
                    const mA = pairA.find(p => p && p.gender === 'M'), fA = pairA.find(p => p && p.gender !== 'M');
                    const mB = pairB.find(p => p && p.gender === 'M'), fB = pairB.find(p => p && p.gender !== 'M');
                    if (mA && fA && mB && fB) { t1 = [mA, fB]; t2 = [mB, fA]; }
                    else { t1 = [pairA[0], pairB[0]]; t2 = [pairA[1], pairB[1]]; }
                } else {
                    t1 = [pairA[0], pairB[0]]; t2 = [pairA[1], pairB[1]];
                }
                newM.push(mk(c + 1, t1, t2));
            }
        }
        matches = [...safeArr(matches), ...newM]; autoSave(true); switchView('matches');
    } catch(e) { console.error("generateKingRound Error:", e); }
}

// ===================== TAURĖ (CUP) =====================
// Fiksuotos poros (pagal sąrašo eilę: 1-2, 3-4...) → grupės → atkrintamosios.
// Iki 5 komandų — 1 grupė; 6-9 — 2 grupės; 10-16 — 4 grupės. Grupėse — ratų sistema (su poilsiu, jei nelyginis sk.).
// Atkrintamosios kuriamos automatiškai spaudžiant "Kitas raundas", kai baigti visi grupių mačai.
function cupTeamKey(t) { return [t[0].id, t[1].id].sort().join('~'); }
function cupTeamsFromPool(safePool) {
    const teams = [];
    for (let k = 0; k < safePool.length; k += 2) teams.push([safePool[k], safePool[k + 1]]);
    return teams;
}
function cupGroupStandings(groupKeys, teamsByKey) {
    const stats = {};
    groupKeys.forEach(k => stats[k] = { key: k, w: 0, dif: 0, sw: 0 });
    safeArr(matches).filter(m => m && m.finished && !m.isFinal).forEach(m => {
        const k1 = (safeArr(m.team1).length === 2) ? cupTeamKey(m.team1) : null;
        const k2 = (safeArr(m.team2).length === 2) ? cupTeamKey(m.team2) : null;
        if (!k1 || !k2 || !stats[k1] || !stats[k2]) return;
        const s1 = parseInt(m.score1 || 0), s2 = parseInt(m.score2 || 0);
        stats[k1].sw += s1; stats[k1].dif += s1 - s2;
        stats[k2].sw += s2; stats[k2].dif += s2 - s1;
        if (s1 > s2) stats[k1].w++; else if (s2 > s1) stats[k2].w++;
    });
    return groupKeys.map(k => stats[k]).sort((a, b) => b.w - a.w || b.dif - a.dif || b.sw - a.sw).map(s => teamsByKey[s.key]);
}
function cupKoWinnerLoser(m) {
    const s1 = parseInt(m.score1 || 0), s2 = parseInt(m.score2 || 0);
    return (s1 >= s2) ? { win: safeArr(m.team1), lose: safeArr(m.team2) } : { win: safeArr(m.team2), lose: safeArr(m.team1) };
}
function generateCupRound(safePool) {
    try {
        const N = safePool.length;
        if (N < 4) { alert(`KLAIDA: Taurės formatui reikia bent 4 žaidėjų (2 porų). (Dabar yra ${N})`); return; }
        if (N % 2 !== 0) { alert(`KLAIDA: Taurės formatui žaidėjų skaičius turi būti lyginis! (Dabar yra ${N})\n\nPoros sudaromos pagal sąrašo eilę: 1-2, 3-4, 5-6...`); return; }
        const teams = cupTeamsFromPool(safePool);
        const T = teams.length;
        const teamsByKey = {}; teams.forEach(t => teamsByKey[cupTeamKey(t)] = t);
        const sig = Object.keys(teamsByKey).sort().join(';');

        // Inicializacija (arba perkūrimas pasikeitus sudėčiai)
        if (typeof settings.cupState === 'undefined' || !settings.cupState || settings.cupState.sig !== sig) {
            if (settings.cupState && settings.cupState.sig !== sig && safeArr(matches).length > 0) {
                if (!confirm("⚠️ Pasikeitė žaidėjų/porų sudėtis — Taurės struktūra (grupės) bus perkurta iš naujo. Tęsti?")) return;
            }
            let groupCount;
            if (T <= 5) groupCount = 1; else if (T <= 9) groupCount = 2; else groupCount = 4;
            // Sėjimas pagal komandų reitingą (gyvatėlės principu): stipriausios komandos išskirstomos
            // po skirtingas grupes, kad nesusitiktų grupių etape. Vienodo pajėgumo — atsitiktine tvarka.
            const teamAvg = k => (((teamsByKey[k][0] && teamsByKey[k][0].rating) || 300) + ((teamsByKey[k][1] && teamsByKey[k][1].rating) || 300)) / 2;
            const order = shuffle([...Object.keys(teamsByKey)]);
            order.sort((a, b) => teamAvg(b) - teamAvg(a));
            const groups = Array.from({ length: groupCount }, () => []);
            order.forEach((k, i) => {
                const block = Math.floor(i / groupCount), pos = i % groupCount;
                groups[block % 2 === 0 ? pos : groupCount - 1 - pos].push(k);
            });
            const roundsForGroup = (g) => (g.length <= 1 ? 0 : (g.length % 2 === 0 ? g.length - 1 : g.length));
            let groupRoundsTotal = Math.max(...groups.map(roundsForGroup));
            if (T === 2) groupRoundsTotal = 0; // 2 komandos — iškart finalas
            settings.cupState = { sig: sig, groups: groups, groupRoundsTotal: groupRoundsTotal };
            autoSave(true);
        }
        const st = settings.cupState;
        const roundNum = (safeArr(matches).length > 0 ? (matches[matches.length-1].round || 0) : 0) + 1;

        // --- GRUPIŲ ETAPAS (trynimui atsparus) ---
        // Kiekvienai grupei skaičiuojam, kiek kartų kiekviena jos ratų rotacija jau yra tarp esamų mačų,
        // ir generuojam REČIAUSIAI naudotą (tas pats principas kaip generateFixedRound): ištrynus raundą
        // spraga užsipildo trūkstamais mačais, o ne šokama į atkrintamąsias su nepilna lentele.
        // Kai visos grupės sužaidė visas rotacijas — tęsiama žemyn į atkrintamąsias.
        if (st.groupRoundsTotal > 0) {
            let newM = []; let court = 1; let resting = [];
            st.groups.forEach((gKeys) => {
                if (gKeys.length <= 1) return;
                let idxs = gKeys.map((_, i) => i);
                if (idxs.length % 2 === 1) idxs.push(-1);
                const K = idxs.length, cycle = K - 1;
                const pairingForShift = (shift) => {
                    let rot = [idxs[0]]; let others = idxs.slice(1);
                    for (let s = 0; s < shift; s++) others.unshift(others.pop());
                    rot.push(...others);
                    let prs = []; let rest = null;
                    for (let i = 0; i < K / 2; i++) {
                        const a = rot[i], b = rot[K - 1 - i];
                        if (a === -1) { rest = b; continue; }
                        if (b === -1) { rest = a; continue; }
                        prs.push([a, b]);
                    }
                    return { prs, rest };
                };
                const shiftSigs = [];
                for (let s = 0; s < cycle; s++) {
                    const pr = pairingForShift(s);
                    shiftSigs.push(pr.prs.map(p => [gKeys[p[0]], gKeys[p[1]]].sort().join('|')).sort().join('#'));
                }
                // Esamų šios grupės mačų raundai → rotacijų panaudojimo skaičiai
                const gSet = new Set(gKeys);
                const byRound = {};
                safeArr(matches).forEach(m => {
                    if (!m || m.isFinal) return;
                    const k1 = (safeArr(m.team1).length === 2) ? cupTeamKey(m.team1) : null;
                    const k2 = (safeArr(m.team2).length === 2) ? cupTeamKey(m.team2) : null;
                    if (k1 && k2 && gSet.has(k1) && gSet.has(k2)) (byRound[m.round] = byRound[m.round] || []).push([k1, k2].sort().join('|'));
                });
                const counts = new Array(cycle).fill(0);
                Object.keys(byRound).forEach(rn => {
                    const idx = shiftSigs.indexOf(byRound[rn].sort().join('#'));
                    if (idx !== -1) counts[idx]++;
                });
                let shift = 0, best = counts[0];
                for (let s = 1; s < cycle; s++) { if (counts[s] < best) { best = counts[s]; shift = s; } }
                if (best >= 1) return; // ši grupė jau sužaidė visas rotacijas (ratas baigtas)
                const chosen = pairingForShift(shift);
                chosen.prs.forEach(p => {
                    newM.push({ id: uid(), round: roundNum, court: court++, finished: false, score1: 0, score2: 0, team1: teamsByKey[gKeys[p[0]]], team2: teamsByKey[gKeys[p[1]]] });
                });
                if (chosen.rest !== null && chosen.rest !== -1) resting.push(teamsByKey[gKeys[chosen.rest]]);
            });
            if (newM.length > 0) {
                matches = [...safeArr(matches), ...newM]; autoSave(true); switchView('matches');
                if (resting.length > 0) setTimeout(() => alert(`ℹ️ Šį raundą ilsisi: ${resting.map(t => t[0].name + ' / ' + t[1].name).join('; ')}`), 100);
                return;
            }
            // Visos grupės baigė visas rotacijas — tęsiam į atkrintamąsias.
        }

        // --- ATKRINTAMOSIOS ---
        const unfinishedGroup = safeArr(matches).filter(m => m && !m.isFinal && !m.finished);
        if (unfinishedGroup.length > 0) { alert(`Prieš atkrintamąsias pabaikite visus grupių mačus! (Liko: ${unfinishedGroup.length})`); return; }
        const koMatches = safeArr(matches).filter(m => m && m.isFinal);
        const koByTitle = (word) => koMatches.filter(m => (m.finalTitle || '').indexOf(word) !== -1);
        const qf = koByTitle('KETVIRTFINALIS'), sf = koByTitle('PUSFINALIS');
        const finals = koMatches.filter(m => (m.finalTitle || '').indexOf('FINALAS') !== -1 && (m.finalTitle || '').indexOf('PUSFINALIS') === -1 && (m.finalTitle || '').indexOf('KETVIRTFINALIS') === -1);
        const mkKO = (court, t1, t2, title, bg) => ({ id: uid(), round: roundNum, court: court, finished: false, score1: 0, score2: 0, team1: t1, team2: t2, isFinal: true, finalTitle: title, finalBg: bg || "bg-slate-800" });
        let newM = [];

        if (finals.length > 0) { alert("🏆 Turnyras baigtas! Visi atkrintamųjų etapai sužaisti."); return; }

        if (sf.length > 0) {
            // Pusfinaliai sužaisti? → finalai
            if (sf.some(m => !m.finished)) { alert("Pabaikite pusfinalius prieš finalus!"); return; }
            const r1 = cupKoWinnerLoser(sf[0]), r2 = cupKoWinnerLoser(sf[1]);
            newM.push(mkKO(1, r1.win, r2.win, "🏆 DIDYSIS FINALAS", "bg-gradient-to-r from-yellow-500 to-amber-600"));
            newM.push(mkKO(2, r1.lose, r2.lose, "🥉 MAŽASIS FINALAS", "bg-gradient-to-r from-orange-400 to-orange-600"));
        } else if (qf.length > 0) {
            // Ketvirtfinaliai sužaisti? → pusfinaliai
            if (qf.some(m => !m.finished)) { alert("Pabaikite ketvirtfinalius prieš pusfinalius!"); return; }
            const sorted = [...qf].sort((a, b) => (a.court || 0) - (b.court || 0));
            const w = sorted.map(m => cupKoWinnerLoser(m).win);
            newM.push(mkKO(1, w[0], w[1], "PUSFINALIS 1"));
            newM.push(mkKO(2, w[2], w[3], "PUSFINALIS 2"));
        } else {
            // Pirmas atkrintamųjų raundas — pagal grupių lenteles
            const standings = st.groups.map(g => cupGroupStandings(g, teamsByKey));
            if (st.groups.length === 1) {
                const s = standings[0];
                if (s.length < 2) { alert("Per mažai komandų finalams."); return; }
                newM.push(mkKO(1, s[0], s[1], "🏆 DIDYSIS FINALAS", "bg-gradient-to-r from-yellow-500 to-amber-600"));
                if (s.length >= 4) newM.push(mkKO(2, s[2], s[3], "🥉 MAŽASIS FINALAS", "bg-gradient-to-r from-orange-400 to-orange-600"));
            } else if (st.groups.length === 2) {
                const A = standings[0], B = standings[1];
                if (A.length < 2 || B.length < 2) { alert("Grupėse per mažai komandų pusfinaliams."); return; }
                newM.push(mkKO(1, A[0], B[1], "PUSFINALIS 1"));
                newM.push(mkKO(2, B[0], A[1], "PUSFINALIS 2"));
            } else {
                const A = standings[0], B = standings[1], C = standings[2], D = standings[3];
                if ([A, B, C, D].some(g => g.length < 2)) { alert("Grupėse per mažai komandų ketvirtfinaliams."); return; }
                newM.push(mkKO(1, A[0], D[1], "KETVIRTFINALIS 1"));
                newM.push(mkKO(2, B[0], C[1], "KETVIRTFINALIS 2"));
                newM.push(mkKO(3, C[0], B[1], "KETVIRTFINALIS 3"));
                newM.push(mkKO(4, D[0], A[1], "KETVIRTFINALIS 4"));
            }
        }
        if (newM.length === 0) { alert("Nepavyko suformuoti atkrintamųjų."); return; }
        matches = [...safeArr(matches), ...newM]; autoSave(true); switchView('matches');
    } catch(e) { console.error("generateCupRound Error:", e); }
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