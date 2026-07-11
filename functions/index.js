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
const { getStorage } = require('firebase-admin/storage');

initializeApp({
    databaseURL: 'https://padelio-turnyrai-default-rtdb.europe-west1.firebasedatabase.app',
    storageBucket: 'padelio-turnyrai.firebasestorage.app'
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

        // MOKĖJIMŲ TERMINAI: nesumokėjusių rezervacijos atšaukiamos, vietos atlaisvinamos
        await enforcePaymentDeadlines(now);
        // REGISTRACIJOS UŽDARYMAS: likus regCloseMins iki starto sąrašas apkarpomas iki pilnų kortų
        await closeRegistrations(now);
        return null;
    }
);

// ===================== MOKAMI TURNYRAI =====================
// Firebase raktuose draudžiami . # $ / [ ] — players įrašas verčiamas payments raktu
// (IDENTIŠKA kliento payKey funkcijai registras_tournaments.js)
function payKey(entry) { return String(entry).replace(/[.#$/\[\]]/g, ','); }

// Pašalina players įrašą, atlaisvina vietas, išvalo payment ir praneša įrašo žaidėjams.
// all — padelio_user_tournaments turinys (perduodamas, kad neskaitytume kaskart).
async function removeEntryAndNotify(t, entry, all, title, body, tag) {
    const idx = (t.players || []).indexOf(entry);
    if (idx === -1) return false;
    const seats = String(entry).indexOf('/') !== -1 ? 2 : 1;
    t.players.splice(idx, 1);
    t.registered = Math.max(0, (t.registered || 0) - seats);
    if (t.payments) delete t.payments[payKey(entry)];
    const names = String(entry).split('/').map(p => p.trim().split('|')[0].trim().toLowerCase());
    for (const userId of Object.keys(all)) {
        const rec = all[userId] && all[userId][t.id];
        if (!rec) continue;
        const nm = String(rec.name || '').trim().toLowerCase();
        if (names.indexOf(nm) === -1) continue;
        await sendToUser(userId, title, body, tag);
        await db.ref('padelio_user_tournaments/' + userId + '/' + t.id).remove().catch(() => {});
    }
    return true;
}

// Laukiantys apmokėjimai su pasibaigusiu terminu — rezervacija atšaukiama.
// Atsilaisvinusią vietą rezervo eilei praneša esamas spotOpened trigeris.
async function enforcePaymentDeadlines(now) {
    const tSnap = await db.ref('padelio_global_tournaments').get();
    const raw = tSnap.val();
    if (!raw) return;
    const arr = (Array.isArray(raw) ? raw : Object.values(raw)).filter(Boolean);
    let changed = false;
    let all = null;
    for (const t of arr) {
        if (!t || !t.paid || !t.payments || !Array.isArray(t.players)) continue;
        const overdue = Object.keys(t.payments).filter(k => {
            const p = t.payments[k];
            return p && p.status === 'pending' && typeof p.deadline === 'number' && p.deadline < now;
        });
        if (!overdue.length) continue;
        if (all === null) {
            const utSnap = await db.ref('padelio_user_tournaments').get();
            all = utSnap.val() || {};
        }
        for (const k of overdue) {
            const entry = (t.payments[k] && t.payments[k].entry) || t.players.find(e => payKey(e) === k) || null;
            if (!entry) { delete t.payments[k]; changed = true; continue; }
            const ok = await removeEntryAndNotify(t, entry, all,
                '💶 Rezervacija atšaukta',
                (t.format || 'Turnyras') + ' (' + (t.date || '') + ' ' + (t.time || '') + ') — apmokėjimas negautas iki termino, vieta atlaisvinta.',
                'paydl_' + t.id);
            changed = changed || ok;
        }
    }
    if (changed) await db.ref('padelio_global_tournaments').set(arr);
}

// Kokiu žingsniu formatas reikalauja dalyvių: Americano/Mexicano/King — po 4, porų formatai — po 2
function requiredStep(format) {
    const f = String(format || '').toLowerCase();
    if (f.indexOf('fiksuotos') !== -1 || f.indexOf('taur') !== -1) return 2;
    return 4;
}

// Uždaro registracijas turnyrams, iki kurių starto liko mažiau nei jų regCloseMins (numatytoji 60 min.):
// dalyvių sąrašas apkarpomas iki formato kartotinio (paskutinieji atmetami, poros neskaldomos),
// atmestieji perkeliami į rezervo priekį ir gauna push pranešimą.
async function closeRegistrations(now) {
    const tSnap = await db.ref('padelio_global_tournaments').get();
    const raw = tSnap.val();
    if (!raw) return;
    const arr = (Array.isArray(raw) ? raw : Object.values(raw)).filter(Boolean);
    let changed = false;
    const rejectedByT = [];
    const removedUnpaidByT = []; // mokamų turnyrų neapmokėjusieji — pranešimams

    for (const t of arr) {
        if (!t || t.regClosed) continue;
        const startMs = tournamentStartMs(t.date, t.time);
        if (!startMs) continue;
        const closeMins = (typeof t.regCloseMins === 'number' && t.regCloseMins > 0) ? t.regCloseMins : 60;
        if (now < startMs - closeMins * 60000) continue; // dar ne laikas
        t.regClosed = true; changed = true;
        if (now > startMs) continue; // startas jau praėjo — tik pažymim, sąrašo nebeliečiam

        let players = Array.isArray(t.players) ? t.players : Object.values(t.players || {});

        // MOKAMAS TURNYRAS: uždarant registraciją NEAPMOKĖJUSIEJI šalinami pirmiausia —
        // tik tada sąrašas karpomas iki pilnų kortų pagal eilės tvarką.
        if (t.paid) {
            const unpaid = players.filter(e => {
                const p = (t.payments || {})[payKey(e)];
                return !(p && p.status === 'paid');
            });
            if (unpaid.length) {
                players = players.filter(e => unpaid.indexOf(e) === -1);
                unpaid.forEach(e => { if (t.payments) delete t.payments[payKey(e)]; });
                removedUnpaidByT.push({ t, entries: unpaid });
            }
        }
        const step = requiredStep(t.format);
        const countOf = (entry) => (String(entry).indexOf('/') !== -1 ? 2 : 1);
        let total = players.reduce((s, p) => s + countOf(p), 0);
        const fits = (n) => n >= 4 && n % step === 0;

        const rejected = [];
        while (players.length && !fits(total) && total >= 4) {
            const last = players.pop();
            total -= countOf(last);
            rejected.push(last);
        }
        if (total < 4) {
            // per mažai dalyvių — nieko neatmetam, sprendžia organizatorius
            while (rejected.length) { const r = rejected.pop(); players.push(r); total += countOf(r); }
            t.shortOfPlayers = true;
            t.players = players; t.registered = total;
            continue;
        }
        t.players = players;
        t.registered = total;
        if (rejected.length) {
            // Atmestieji (registracijos tvarka) — į rezervo PRIEKĮ, po vieną žmogų
            const wlEntries = [];
            rejected.reverse().forEach(entry => {
                String(entry).split('/').forEach(part => { const nm = part.trim(); if (nm) wlEntries.push(nm); });
            });
            const wl = Array.isArray(t.waitlist) ? t.waitlist : [];
            t.waitlist = wlEntries.concat(wl);
            t.waitlistCount = t.waitlist.length;
            rejectedByT.push({ t, wlEntries });
        }
    }

    if (!changed) return;
    await db.ref('padelio_global_tournaments').set(arr);

    // Pranešimai neapmokėjusiems (mokamų turnyrų) — vieta atlaisvinta, į rezervą nekeliami
    if (removedUnpaidByT.length) {
        const utSnap = await db.ref('padelio_user_tournaments').get();
        const all = utSnap.val() || {};
        for (const { t, entries } of removedUnpaidByT) {
            for (const entry of entries) {
                const names = String(entry).split('/').map(p => p.trim().split('|')[0].trim().toLowerCase());
                for (const userId of Object.keys(all)) {
                    const rec = all[userId] && all[userId][t.id];
                    if (!rec) continue;
                    if (names.indexOf(String(rec.name || '').trim().toLowerCase()) === -1) continue;
                    await sendToUser(userId, '💶 Nepatvirtintas apmokėjimas',
                        (t.format || 'Turnyras') + ' (' + (t.time || '') + ') — registracija uždaryta, apmokėjimas negautas, vieta atlaisvinta.',
                        'payclose_' + t.id);
                    await db.ref('padelio_user_tournaments/' + userId + '/' + t.id).remove().catch(() => {});
                }
            }
        }
    }

    // Push pranešimai atmestiesiems + jų registracijos statusas keičiamas į waitlist
    if (rejectedByT.length) {
        const utSnap = await db.ref('padelio_user_tournaments').get();
        const all = utSnap.val() || {};
        for (const { t, wlEntries } of rejectedByT) {
            for (const userId of Object.keys(all)) {
                const rec = all[userId] && all[userId][t.id];
                if (!rec || rec.status !== 'registered') continue;
                const nm = String(rec.name || '').trim().toLowerCase();
                const idx = wlEntries.findIndex(e => String(e).split('|')[0].trim().toLowerCase() === nm);
                if (idx === -1) continue;
                await sendToUser(userId, '⚠️ Netilpote į turnyrą', (t.format || 'Turnyras') + ' (' + (t.time || '') + ') — dalyviai apkarpyti iki pilnų kortų. Esate rezervo ' + (idx + 1) + '-as: atsilaisvinus vietai pranešime.', 'cut_' + t.id);
                await db.ref('padelio_user_tournaments/' + userId + '/' + t.id + '/status').set('waitlist');
            }
        }
    }
}

// 3) HIGHLIGHTS VALYMAS — kas naktį ištrina senesnius nei 7 d. klipus
// (DB įrašai + Storage failai). Failai be DB įrašo (našlaičiai — pvz. bandymų
// laikų likučiai) trinami po 1 dienos, kad saugyklos sąskaita neaugtų.
const HIGHLIGHTS_TTL_DAYS = 7;

exports.cleanupHighlights = onSchedule(
    { schedule: '10 4 * * *', timeZone: 'Europe/Vilnius', region: REGION },
    async () => {
        const now = Date.now();
        const cutoff = now - HIGHLIGHTS_TTL_DAYS * 864e5;

        // 1. DB įrašai: padelio_highlights/{kambarys}/{klipas}, ts < 7 d.
        const snap = await db.ref('padelio_highlights').get();
        const rooms = snap.val() || {};
        const updates = {};
        const liveUrls = [];
        for (const room of Object.keys(rooms)) {
            const clips = rooms[room] || {};
            for (const key of Object.keys(clips)) {
                const c = clips[key];
                if (!c || typeof c.ts !== 'number' || c.ts < cutoff) {
                    updates[room + '/' + key] = null;
                } else if (c.url) {
                    liveUrls.push(String(c.url));
                }
            }
        }
        if (Object.keys(updates).length) await db.ref('padelio_highlights').update(updates);

        // 2. Storage failai: highlights/** — seni (>7 d.) arba našlaičiai (>1 d. be DB įrašo)
        let deleted = 0;
        try {
            const bucket = getStorage().bucket();
            const [files] = await bucket.getFiles({ prefix: 'highlights/' });
            for (const f of files) {
                const created = Date.parse((f.metadata && f.metadata.timeCreated) || '') || 0;
                const isOld = created < cutoff;
                // Download URL kelias būna URL-koduotas (highlights%2F...), tikrinam abu variantus
                const enc = encodeURIComponent(f.name);
                const stillUsed = liveUrls.some(u => u.indexOf(enc) !== -1 || u.indexOf(f.name) !== -1);
                const isOrphan = !stillUsed && created < now - 864e5;
                if (isOld || isOrphan) {
                    await f.delete().catch(() => {});
                    deleted++;
                }
            }
        } catch (e) {
            console.error('cleanupHighlights storage klaida:', e);
        }
        console.log('cleanupHighlights: DB istrinta ' + Object.keys(updates).length + ', Storage istrinta ' + deleted);
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
