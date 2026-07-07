/**
 * SuperPadel.lt — Push pranešimų Cloud Functions (v2)
 *
 * Diegimas:
 *   1) firebase deploy --only functions
 *
 * Siunčia tik svarbiausius push pranešimus:
 *   - Priminimas prieš ~1 dieną
 *   - Priminimas prieš ~3 valandas
 *   - Atsilaisvinusi vieta (rezerve esantiems)
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onValueWritten } = require('firebase-functions/v2/database');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp({
    databaseURL: 'https://padelio-turnyrai-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = getDatabase();
const messaging = getMessaging();
const REGION = 'europe-west1';
const DB_INSTANCE = 'padelio-turnyrai-default-rtdb';
const APP_LINK = 'https://superpadel.lt/registras.html';

// Kiek Vilniaus sieninis laikas lenkia UTC duotu momentu (įskaitant vasaros/žiemos laiką)
function vilniusOffsetMs(ts) {
    const dtf = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const p = {};
    dtf.formatToParts(new Date(ts)).forEach(x => { p[x.type] = x.value; });
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    return wall - ts;
}

// Vilniaus sieninis laikas (metai, mėnuo, diena, val., min.) -> epoch ms
function vilniusTimeToMs(year, month, day, hour, minute) {
    let ts = Date.UTC(year, month - 1, day, hour, minute, 0);
    // dvi iteracijos padengia DST perjungimo ribas
    for (let i = 0; i < 2; i++) ts = Date.UTC(year, month - 1, day, hour, minute, 0) - vilniusOffsetMs(ts);
    return ts;
}

// "MM-DD" + "HH:MM - HH:MM" -> turnyro pradžios epoch ms (einamieji metai).
// SVARBU: serveris veikia UTC laiko juosta, todėl new Date(y,m,d,h) čia reikštų UTC laiką
// ir priminimai išeitų 2-3 val. per vėlai — konvertuojam kaip Vilniaus sieninį laiką.
function tournamentStartMs(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const dm = String(dateStr).split('-').map(Number);
    const mm = dm[0], dd = dm[1];
    const startTime = String(timeStr).split('-')[0].trim(); // "HH:MM"
    const tm = startTime.split(':').map(Number);
    const hh = tm[0], mi = tm[1] || 0;
    if (isNaN(mm) || isNaN(dd) || isNaN(hh)) return null;
    const now = Date.now();
    const curYear = new Date().getFullYear();
    let t = vilniusTimeToMs(curYear, mm, dd, hh, mi);
    if (t < now - 300 * 864e5) t = vilniusTimeToMs(curYear + 1, mm, dd, hh, mi);
    return t;
}

// Išsiunčia push į visus vartotojo įrenginius; išvalo negaliojančius tokenus
async function sendToUser(userId, title, body, tag) {
    const snap = await db.ref('padelio_push_tokens/' + userId).get();
    const toks = snap.val() || {};
    const keys = Object.keys(toks);
    const tokens = keys.map(k => toks[k] && toks[k].token).filter(Boolean);
    if (!tokens.length) return 0;
    let res;
    try {
        res = await messaging.sendEachForMulticast({
            tokens: tokens,
            notification: { title: title, body: body },
            data: { tag: tag || '', link: APP_LINK },
            webpush: { fcmOptions: { link: APP_LINK } },
            android: { priority: 'high' },
            apns: { headers: { 'apns-priority': '10' } }
        });
    } catch (e) {
        console.error('send error', e);
        return 0;
    }
    res.responses.forEach((r, i) => {
        if (!r.success) {
            const code = r.error && r.error.code;
            if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-argument') {
                const k = keys[i];
                if (k) db.ref('padelio_push_tokens/' + userId + '/' + k).remove().catch(() => {});
            }
        }
    });
    return res.successCount;
}

// 1) PRIMINIMAI — kas 15 min
exports.tournamentReminders = onSchedule(
    { schedule: 'every 15 minutes', timeZone: 'Europe/Vilnius', region: REGION },
    async () => {
        const utSnap = await db.ref('padelio_user_tournaments').get();
        const all = utSnap.val() || {};
        const sentSnap = await db.ref('padelio_push_sent').get();
        const sent = sentSnap.val() || {};
        const now = Date.now();
        const updates = {};

        for (const userId of Object.keys(all)) {
            const ut = all[userId] || {};
            for (const tId of Object.keys(ut)) {
                const rec = ut[tId];
                if (!rec || rec.status !== 'registered') continue;
                const startMs = tournamentStartMs(rec.date, rec.time);
                if (!startMs) continue;
                const diffH = (startMs - now) / 3600000;

                const dayKey = userId + '_' + tId + '_day';
                if (diffH <= 24.5 && diffH >= 23.5 && !sent[dayKey]) {
                    await sendToUser(userId, '⏰ Rytoj turnyras', (rec.format || 'Turnyras') + ' rytoj ' + (rec.time || '') + '.', 'rem_' + tId);
                    updates[dayKey] = now;
                }
                const hKey = userId + '_' + tId + '_hours';
                if (diffH <= 3.5 && diffH >= 2.5 && !sent[hKey]) {
                    await sendToUser(userId, '🎾 Turnyras netrukus', (rec.format || 'Turnyras') + ' šiandien ' + (rec.time || '') + '. Pasiruošk!', 'rem_' + tId);
                    updates[hKey] = now;
                }
            }
        }
        // Valymas: "išsiųsta" žymos senesnės nei 14 d. nebereikalingos (turnyrai jau seniai įvykę)
        for (const key of Object.keys(sent)) {
            const ts = sent[key];
            if (typeof ts === 'number' && now - ts > 14 * 864e5) updates[key] = null;
        }
        if (Object.keys(updates).length) await db.ref('padelio_push_sent').update(updates);
        return null;
    }
);

// 2) ATSILAISVINO VIETA — trigeris ant turnyrų sąrašo
exports.spotOpened = onValueWritten(
    { ref: '/padelio_global_tournaments', instance: DB_INSTANCE, region: REGION },
    async (event) => {
        const before = event.data.before.val();
        const after = event.data.after.val();
        if (!after) return null;

        const toArr = v => (Array.isArray(v) ? v : Object.values(v || {})).filter(Boolean);
        const bById = {};
        toArr(before).forEach(t => { if (t && t.id != null) bById[t.id] = t; });

        const sentSnap = await db.ref('padelio_push_sent').get();
        const sent = sentSnap.val() || {};
        const now = Date.now();
        const updates = {};
        let all = null; // padelio_user_tournaments — skaitom vieną kartą ir tik jei tikrai atsilaisvino vieta

        for (const t of toArr(after)) {
            if (!t || t.id == null) continue;
            const b = bById[t.id];
            if (!b) continue;
            const wasFull = (b.registered || 0) >= (b.max || 0);
            const nowOpen = (t.registered || 0) < (t.max || 0);
            if (!(wasFull && nowOpen)) continue;

            if (all === null) {
                const utSnap = await db.ref('padelio_user_tournaments').get();
                all = utSnap.val() || {};
            }
            for (const userId of Object.keys(all)) {
                const rec = all[userId] && all[userId][t.id];
                if (!rec || rec.status !== 'waitlist') continue;
                const sKey = userId + '_' + t.id + '_spot';
                // nesiųsti pakartotinai dažniau nei kas 60 min
                if (sent[sKey] && (now - sent[sKey]) < 60 * 60 * 1000) continue;
                await sendToUser(userId, '🟢 Atsilaisvino vieta!', (t.format || 'Turnyras') + ' (' + (t.date || '') + ' ' + (t.time || '') + ') — skubėk registruotis!', 'spot_' + t.id);
                updates[sKey] = now;
            }
        }
        if (Object.keys(updates).length) await db.ref('padelio_push_sent').update(updates);
        return null;
    }
);
