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
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const { getStorage } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');

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

// AUTORITETINGAS „apmokėta" registras (padelio_paid/{tid}/{key}=true). Rašo TIK serveris
// (Admin SDK; taisyklė .write:false), todėl klientas negali suklastoti apmokėjimo. VISOS
// serverio „ar apmokėta" patikros (enforce/close) remiasi šiuo, o NE kliento t.payments.status.
async function loadPaidChecker() {
    const s = await db.ref('padelio_paid').get();
    const ledger = s.val() || {};
    return (tid, k) => !!(ledger[String(tid)] && ledger[String(tid)][String(k)]);
}

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
// Likus ~2 val. iki termino siunčiamas vienkartinis priminimas.
// Atsilaisvinusią vietą rezervo eilei praneša esamas spotOpened trigeris.
async function enforcePaymentDeadlines(now) {
    const tSnap = await db.ref('padelio_global_tournaments').get();
    const raw = tSnap.val();
    if (!raw) return;
    const arr = (Array.isArray(raw) ? raw : Object.values(raw)).filter(Boolean);
    // Kol registro migracija (backfillPaidLedger) neužbaigta — NEšalinam nieko pagal apmokėjimą
    // (kitaip seni apmokėję, kurių dar nėra registre, būtų klaidingai pašalinti).
    if ((await db.ref('padelio_paid_meta/ready').get()).val() !== true) return;
    const isPaid = await loadPaidChecker();
    let changed = false;
    let all = null;
    let sent = null;
    const sentUpdates = {};
    const loadAll = async () => {
        if (all === null) { const s = await db.ref('padelio_user_tournaments').get(); all = s.val() || {}; }
    };
    for (const t of arr) {
        if (!t || !t.paid || !t.payments || !Array.isArray(t.players)) continue;

        // 1) Pavėlavę — šalinami. IŠIMTIS: pažymėjusieji „apmokėjau" (claimed) —
        // pinigai gali būti kelyje, sprendžia organizatorius rankiniu būdu.
        const overdue = Object.keys(t.payments).filter(k => {
            const p = t.payments[k];
            return p && !isPaid(t.id, k) && p.method !== 'cash' && !p.claimed && typeof p.deadline === 'number' && p.deadline < now;
        });
        if (overdue.length) {
            await loadAll();
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

        // 2) Priminimas likus ~2 val. iki termino (vienkartinis; grynaisiais mokančių neliečia)
        const soonKeys = Object.keys(t.payments).filter(k => {
            const p = t.payments[k];
            return p && !isPaid(t.id, k) && p.method !== 'cash' && !p.claimed && typeof p.deadline === 'number'
                && p.deadline > now && p.deadline - now <= 2.5 * 3600000;
        });
        if (soonKeys.length) {
            await loadAll();
            if (sent === null) { const s = await db.ref('padelio_push_sent').get(); sent = s.val() || {}; }
            for (const k of soonKeys) {
                const p = t.payments[k];
                const entry = p.entry || t.players.find(e => payKey(e) === k) || '';
                const names = String(entry).split('/').map(x => x.trim().split('|')[0].trim().toLowerCase());
                for (const userId of Object.keys(all)) {
                    const rec = all[userId] && all[userId][t.id];
                    if (!rec || names.indexOf(String(rec.name || '').trim().toLowerCase()) === -1) continue;
                    const sKey = 'payrem_' + userId + '_' + t.id;
                    if (sent[sKey] || sentUpdates[sKey]) continue;
                    await sendToUser(userId, '💶 Priminimas apmokėti',
                        (t.format || 'Turnyras') + ' — liko nedaug laiko apmokėti ' + (p.amount || t.fee || '') + ' €. Nespėjus, vieta bus atlaisvinta.',
                        'payrem_' + t.id);
                    sentUpdates[sKey] = now;
                }
            }
        }
    }
    if (Object.keys(sentUpdates).length) await db.ref('padelio_push_sent').update(sentUpdates);
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
    const isPaid = await loadPaidChecker();
    // Kol registro migracija neužbaigta — neapmokėjusiųjų NEšalinam (žr. enforcePaymentDeadlines).
    const paidReady = (await db.ref('padelio_paid_meta/ready').get()).val() === true;
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
        // Pasirinkusieji mokėti GRYNAIS vietoje (method='cash') NEšalinami —
        // jie atsiskaito organizatoriui atvykę į turnyrą.
        if (t.paid && paidReady) {
            const unpaid = players.filter(e => {
                const k = payKey(e);
                const p = (t.payments || {})[k];
                return !(isPaid(t.id, k) || (p && (p.method === 'cash' || p.claimed)));
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


// ===================== STRIPE — APMOKĖJIMAS IŠ KARTO REGISTRUOJANTIS =====================
// Raktai laikomi Cloud Functions "secrets" saugykloje (ne kode):
//   firebase functions:secrets:set STRIPE_SECRET_KEY      (sk_live_... arba sk_test_...)
//   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET  (whsec_..., webhook parašui)
// Kol raktų nėra, funkcijos grąžina klaidą, o klientas gražiai grįžta prie pavedimo.
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const EMAIL_USER = defineSecret('EMAIL_USER');
const EMAIL_PASS = defineSecret('EMAIL_PASS');
// Resend (rekomenduojama produkcijai): siuntimas iš info@superpadel.lt.
// Kai įrašomas tikras raktas (re_...) — jis naudojamas vietoj Gmail automatiškai.
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

// Pažymi apmokėjimą gautu (kviečia webhook IR grįžimo patikra — idempotentiška)
// ir išsiunčia push visiems įrašo žaidėjams.
async function markStripePaid(tid, key, sessionId) {
    const ref = db.ref('padelio_global_tournaments');
    const snap = await ref.get();
    const raw = snap.val();
    const arr = (Array.isArray(raw) ? raw : Object.values(raw || {})).filter(Boolean);
    const t = arr.find(x => String(x.id) === String(tid));
    if (!t) return false;
    // Idempotencija per REGISTRĄ (ne kliento t.payments.status). AUTORITETINGAS „apmokėta" registras —
    // TIK serveris (Admin SDK) čia rašo; klientas negali (padelio_paid .write:false).
    const paidRef = db.ref('padelio_paid/' + String(tid) + '/' + String(key));
    const alreadyPaid = (await paidRef.get()).val() === true;
    // Charge patvirtinta Stripe — VISADA įrašom į registrą, net jei t.payments įrašas buvo perrakintas
    // tarp checkout ir webhook (kad apmokėjimas neprapultų).
    await paidRef.set(true);
    if (t.payments && t.payments[key]) {
        t.payments[key].status = 'paid';
        t.payments[key].method = 'stripe';
        t.payments[key].paidTs = Date.now();
        t.payments[key].stripeSession = String(sessionId || '');
        t.payments[key].deadline = null;
        await ref.set(arr);
    }
    if (alreadyPaid) return true; // pranešimą jau siuntėme (webhook + return lenktynė)
    const entry = (t.payments && t.payments[key] && t.payments[key].entry) || '';
    const names = String(entry).split('/').map(p2 => p2.trim().split('|')[0].trim().toLowerCase());
    const utSnap = await db.ref('padelio_user_tournaments').get();
    const all = utSnap.val() || {};
    for (const userId of Object.keys(all)) {
        const rec = all[userId] && all[userId][tid];
        if (!rec || names.indexOf(String(rec.name || '').trim().toLowerCase()) === -1) continue;
        await sendToUser(userId, '✅ Apmokėjimas gautas',
            (t.format || 'Turnyras') + ' (' + (t.date || '') + ' ' + (t.time || '') + ') — vieta patvirtinta. Iki susitikimo korte!',
            'paid_' + tid);
        await sendEmailToUser(userId, '✅ Apmokėjimas gautas — ' + (t.format || 'Turnyras'),
            '<b>' + emailEsc(t.format || 'Turnyras') + '</b> (' + emailEsc(t.date || '') + ' ' + emailEsc(t.time || '') + ')<br>Apmokėjimas kortele gautas — jūsų vieta patvirtinta. Iki susitikimo korte! 🎾');
    }
    return true;
}

// Sukuria Stripe Checkout sesiją. SUMĄ skaičiuoja serveris iš DB (ne klientas) —
// kainos suklastoti neįmanoma.
exports.createStripeCheckout = onRequest(
    { region: REGION, cors: true, invoker: 'public', secrets: [STRIPE_SECRET_KEY, EMAIL_USER, EMAIL_PASS, RESEND_API_KEY] },
    async (req, res) => {
        try {
            const body = req.body || {};
            const tid = body.tid, key = body.key;
            if (!tid || !key) { res.status(400).json({ error: 'missing params' }); return; }
            const sk = String(STRIPE_SECRET_KEY.value() || '').trim();
            if (!sk || sk.indexOf('sk_') !== 0) { res.status(503).json({ error: 'stripe not configured' }); return; }
            const stripe = require('stripe')(sk);
            const snap = await db.ref('padelio_global_tournaments').get();
            const raw = snap.val();
            const arr = (Array.isArray(raw) ? raw : Object.values(raw || {})).filter(Boolean);
            const t = arr.find(x => String(x.id) === String(tid));
            if (!t || !t.paid || !t.payStripeEnabled) { res.status(400).json({ error: 'not payable' }); return; }
            const pay = (t.payments || {})[key];
            if (!pay) { res.status(400).json({ error: 'no payment record' }); return; }
            // „Jau apmokėta" — iš autoritetingo registro (ne kliento t.payments.status)
            const alreadyPaid = (await db.ref('padelio_paid/' + String(tid) + '/' + String(key)).get()).val();
            if (alreadyPaid === true) { res.status(400).json({ error: 'already paid' }); return; }
            const entry = pay.entry || '';
            const seats = String(entry).indexOf('/') !== -1 ? 2 : 1;
            const amountCents = Math.round((t.fee || 0) * seats * 100);
            if (amountCents < 50) { res.status(400).json({ error: 'amount too small' }); return; }
            const origin = (typeof body.origin === 'string' && /^https?:\/\//.test(body.origin)) ? body.origin : 'https://www.superpadel.lt';
            const session = await stripe.checkout.sessions.create({
                mode: 'payment',
                line_items: [{
                    quantity: 1,
                    price_data: {
                        currency: 'eur',
                        unit_amount: amountCents,
                        product_data: { name: (t.format || 'Turnyras') + ' ' + (t.date || '') + ' — dalyvio mokestis' + (seats === 2 ? ' (pora)' : '') }
                    }
                }],
                success_url: origin + '/registras.html?paysession={CHECKOUT_SESSION_ID}',
                cancel_url: origin + '/registras.html?paycancel=' + encodeURIComponent(String(tid)),
                metadata: { tid: String(tid), key: String(key) }
            });
            res.json({ url: session.url });
        } catch (e) {
            console.error('createStripeCheckout:', e);
            res.status(500).json({ error: 'stripe error' });
        }
    }
);

// Grįžus iš Checkout (?paysession=ID): patikrina sesiją per Stripe API ir pažymi
// apmokėjimą — greitas kelias, kol webhook dar nesukonfigūruotas arba vėluoja.
exports.verifyStripeSession = onRequest(
    { region: REGION, cors: true, invoker: 'public', secrets: [STRIPE_SECRET_KEY, EMAIL_USER, EMAIL_PASS, RESEND_API_KEY] },
    async (req, res) => {
        try {
            const sessionId = (req.body && req.body.session) || req.query.session;
            if (!sessionId) { res.status(400).json({ error: 'missing session' }); return; }
            const sk = String(STRIPE_SECRET_KEY.value() || '').trim();
            if (!sk || sk.indexOf('sk_') !== 0) { res.status(503).json({ error: 'stripe not configured' }); return; }
            const stripe = require('stripe')(sk);
            const session = await stripe.checkout.sessions.retrieve(String(sessionId));
            if (session && session.payment_status === 'paid' && session.metadata && session.metadata.tid && session.metadata.key) {
                const ok = await markStripePaid(session.metadata.tid, session.metadata.key, session.id);
                res.json({ paid: ok });
                return;
            }
            res.json({ paid: false });
        } catch (e) {
            console.error('verifyStripeSession:', e);
            res.status(500).json({ error: 'verify error' });
        }
    }
);

// Stripe webhook (checkout.session.completed) — patikimas automatinis žymėjimas,
// veikia net žaidėjui negrįžus į portalą. Jei STRIPE_WEBHOOK_SECRET sukonfigūruotas —
// tikrinamas Stripe parašas; jei ne — payload'u nepasitikima ir sesija PERSKAITOMA
// tiesiai iš Stripe API (suklastoti neįmanoma, whsec nebūtinas).
exports.stripeWebhook = onRequest(
    { region: REGION, invoker: 'public', secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, EMAIL_USER, EMAIL_PASS, RESEND_API_KEY] },
    async (req, res) => {
        try {
            const sk = String(STRIPE_SECRET_KEY.value() || '').trim();
            const whsec = String(STRIPE_WEBHOOK_SECRET.value() || '').trim();
            if (!sk || sk.indexOf('sk_') !== 0) {
                res.status(503).send('stripe not configured');
                return;
            }
            const stripe = require('stripe')(sk);
            let sessionId = null;
            if (whsec && whsec.indexOf('whsec_') === 0) {
                // Griežtas kelias: Stripe parašo tikrinimas
                let event;
                try {
                    event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], whsec);
                } catch (e) {
                    res.status(400).send('bad signature');
                    return;
                }
                if (event.type === 'checkout.session.completed' && event.data && event.data.object) sessionId = event.data.object.id;
            } else {
                // Be whsec: iš payload'o imamas TIK sesijos ID, o tiesa tikrinama
                // žemiau per Stripe API — netikras ID nieko nepasieks.
                let body = req.body;
                if (!body || typeof body !== 'object') {
                    try { body = JSON.parse(String(req.rawBody || '{}')); } catch (e) { body = {}; }
                }
                if (body && body.type === 'checkout.session.completed' && body.data && body.data.object && body.data.object.id) {
                    sessionId = String(body.data.object.id);
                }
            }
            if (sessionId) {
                let session = null;
                try { session = await stripe.checkout.sessions.retrieve(sessionId); }
                catch (e) { session = null; } // neegzistuojanti/suklastota sesija — tyliai ignoruojama
                if (session && session.payment_status === 'paid' && session.metadata && session.metadata.tid && session.metadata.key) {
                    await markStripePaid(session.metadata.tid, session.metadata.key, session.id);
                }
            }
            res.json({ received: true });
        } catch (e) {
            console.error('stripeWebhook:', e);
            res.status(500).send('err');
        }
    }
);


// ===================== ATSARGINĖS KOPIJOS =====================
// Kasdien 03:40 svarbiausios šakos nukopijuojamos į padelio_backups/{YYYY-MM-DD}.
// Laikomos 14 dienų kopijos. Šaka klientams neprieinama (tik admin SDK) —
// atkūrimo atveju duomenys pasiekiami per Firebase konsolę arba CLI:
//   firebase database:get /padelio_backups/2026-07-12 --project padelio-turnyrai > kopija.json
// Admino RANKINIS apmokėjimo patvirtinimas (pavedimas/grynieji). Autoritetą turi SERVERIS:
// patikrina kviečiančiojo Firebase ID token'ą ir ar jis TIKRAI to klubo administratorius per
// NESUKLASTOJAMĄ padelio_clubs/{clubId}/admins/{ek} (padelio_clubs .write griežtas; NE
// self-writable padelio_club_admins). Tik tada rašo padelio_paid registrą.
exports.confirmManualPayment = onRequest(
    { region: REGION, cors: true, invoker: 'public' },
    async (req, res) => {
        try {
            const body = req.body || {};
            const idToken = body.idToken, tid = body.tid, key = body.key;
            const makePaid = body.paid !== false; // numatytai true; false = atšaukti
            if (!idToken || !tid || !key) { res.status(400).json({ error: 'missing params' }); return; }
            let decoded;
            try { decoded = await getAuth().verifyIdToken(String(idToken)); }
            catch (e) { res.status(401).json({ error: 'auth' }); return; }
            const email = String(decoded.email || '').toLowerCase();
            if (!email) { res.status(401).json({ error: 'no email' }); return; }
            const ek = email.replace(/[.#$\[\]\/]/g, ','); // IDENTIŠKA kliento emailKey
            const snap = await db.ref('padelio_global_tournaments').get();
            const raw = snap.val();
            const arr = (Array.isArray(raw) ? raw : Object.values(raw || {})).filter(Boolean);
            const t = arr.find(x => String(x.id) === String(tid));
            if (!t || !t.paid) { res.status(400).json({ error: 'not payable' }); return; }
            let ok = false;
            if (t.clubId) ok = (await db.ref('padelio_clubs/' + t.clubId + '/admins/' + ek).get()).exists();
            if (!ok) { // platformos savininkas (legacyOwner klubo adminas) — visada gali
                const clubs = (await db.ref('padelio_clubs').get()).val() || {};
                ok = Object.keys(clubs).some(cid => clubs[cid] && clubs[cid].legacyOwner === true && clubs[cid].admins && clubs[cid].admins[ek]);
            }
            if (!ok) { res.status(403).json({ error: 'not club admin' }); return; }
            const pref = db.ref('padelio_paid/' + String(tid) + '/' + String(key));
            if (makePaid) await pref.set(true); else await pref.remove();
            res.json({ ok: true, paid: makePaid });
        } catch (e) {
            console.error('confirmManualPayment:', e);
            res.status(500).json({ error: 'server error' });
        }
    }
);

// VIENKARTINĖ migracija: esamus t.payments[...].status==='paid' perkelia į padelio_paid registrą.
// Tik platformos savininkas (legacyOwner). Paleisti VIENĄ kartą po funkcijų diegimo, PRIEŠ frontend cutover.
exports.backfillPaidLedger = onRequest(
    { region: REGION, cors: true, invoker: 'public' },
    async (req, res) => {
        try {
            const idToken = (req.body || {}).idToken;
            if (!idToken) { res.status(400).json({ error: 'missing token' }); return; }
            let decoded;
            try { decoded = await getAuth().verifyIdToken(String(idToken)); }
            catch (e) { res.status(401).json({ error: 'auth' }); return; }
            const ek = String(decoded.email || '').toLowerCase().replace(/[.#$\[\]\/]/g, ',');
            const clubs = (await db.ref('padelio_clubs').get()).val() || {};
            const isOwner = Object.keys(clubs).some(cid => clubs[cid] && clubs[cid].legacyOwner === true && clubs[cid].admins && clubs[cid].admins[ek]);
            if (!isOwner) { res.status(403).json({ error: 'owner only' }); return; }
            // VIENKARTINĖ: jei jau migruota (ready=true), NEBEperkeliam — kad pakartotinis paleidimas
            // nepaverstų kliento suklastoto t.payments.status='paid' į autoritetingą registrą.
            if ((await db.ref('padelio_paid_meta/ready').get()).val() === true) {
                res.json({ ok: true, migrated: 0, note: 'already migrated' }); return;
            }
            const snap = await db.ref('padelio_global_tournaments').get();
            const raw = snap.val();
            const arr = (Array.isArray(raw) ? raw : Object.values(raw || {})).filter(Boolean);
            const updates = {};
            let count = 0;
            for (const t of arr) {
                if (!t || !t.payments) continue;
                for (const k of Object.keys(t.payments)) {
                    if (t.payments[k] && t.payments[k].status === 'paid') { updates[String(t.id) + '/' + k] = true; count++; }
                }
            }
            if (count) await db.ref('padelio_paid').update(updates);
            // Nuo dabar registras užpildytas — enforce/close gali remtis juo ir šalinti neapmokėjusius.
            await db.ref('padelio_paid_meta/ready').set(true);
            res.json({ ok: true, migrated: count });
        } catch (e) {
            console.error('backfillPaidLedger:', e);
            res.status(500).json({ error: 'server error' });
        }
    }
);

// E-teisėjo taškų rašymas OFICIALIUOSE (lygos ELO) kambariuose — per serverį, kad būtų
// patikrinta kviečiančiojo tapatybė (idToken) ir kad jis TIKRAI to turnyro dalyvis su
// įjungtu eReferee. Klientas oficialaus kambario score tiesiogiai rašyti negali (DB taisyklė).
exports.submitScore = onRequest(
    { region: REGION, cors: true, invoker: 'public' },
    async (req, res) => {
        try {
            const b = req.body || {};
            const idToken = b.idToken, room = b.room, matchId = b.matchId, teamNum = Number(b.teamNum), score = Number(b.score);
            if (!idToken || !room || matchId === undefined || matchId === null || (teamNum !== 1 && teamNum !== 2) || !(score >= 0 && score <= 200)) {
                res.status(400).json({ error: 'bad params' }); return;
            }
            let decoded;
            try { decoded = await getAuth().verifyIdToken(String(idToken)); }
            catch (e) { res.status(401).json({ error: 'auth' }); return; }
            const email = String(decoded.email || '').toLowerCase();
            if (!email) { res.status(401).json({ error: 'no email' }); return; }
            const ek = email.replace(/[.#$\[\]\/]/g, ',');
            const playerId = (await db.ref('padelio_email_links/' + ek).get()).val();
            if (!playerId) { res.status(403).json({ error: 'no profile' }); return; }
            const prof = (await db.ref('padelio_global_players/' + playerId).get()).val() || {};
            // PATIKIMA tapatybė: profilio el. paštas TURI sutapti su verifikuoto token'o el. paštu.
            // padelio_email_links REIKŠMĖ kliento rašoma — vien ja pasitikėti negalima; step-2 apsauga
            // neleidžia keisti užrakinto profilio email, tad šis kryžminis patikrinimas patikimas.
            // Tapatybė patikima TIK užrakintiems (reali apsaugota paskyra): neužrakinto profilio email
            // yra pasauliniu būdu rašomas (step-2 residual), tad be emailLocked užpuolikas galėtų perrašyti
            // svetimo dalyvio email į savo ir „tapti" juo. Reikalaujam emailLocked — tai ir atitinka „privalo
            // turėti anketą" (registruotasi el. paštu). Neapsaugoti (importo/telefono) profiliai e-teisėjauti negali.
            if (String(prof.email || '').toLowerCase() !== email || prof.emailLocked !== true) { res.status(403).json({ error: 'identity' }); return; }
            const roomKey = String(room).toUpperCase();
            const roomData = (await db.ref('padelio_pro_master/' + roomKey).get()).val() || {};
            // TIK oficialiam kambariui (casual eina tiesiogiai per DB taisyklę)
            if (!(roomData.owner && roomData.owner.official === true)) { res.status(400).json({ error: 'not official' }); return; }
            // Turnyras šiam kambariui (tid + eReferee įjungtas)
            const tRaw = (await db.ref('padelio_global_tournaments').get()).val();
            const tarr = (Array.isArray(tRaw) ? tRaw : Object.values(tRaw || {})).filter(Boolean);
            const t = tarr.find(x => x && x.room && String(x.room).toUpperCase() === roomKey);
            if (!t || !t.eReferee) { res.status(403).json({ error: 'eref off' }); return; }
            // Randam mačą pagal id (masyvas arba objektas)
            const matchesRaw = roomData.matches || {};
            const mkeys = Array.isArray(matchesRaw) ? matchesRaw.map((_, i) => i) : Object.keys(matchesRaw);
            let idx = -1, theMatch = null;
            for (const k of mkeys) { const m = matchesRaw[k]; if (m && String(m.id) === String(matchId)) { idx = k; theMatch = m; break; } }
            if (idx === -1 || !theMatch) { res.status(404).json({ error: 'no match' }); return; }
            // ADMINAS gali VISUS kortus — per PATIKIMĄ kambario owner.clubId (jį rašo tik klubo adminas,
            // priešingai nei turnyro clubId) + sugriežtintą clubs/admins (4 žingsnis).
            const clubId = roomData.owner && roomData.owner.clubId;
            let isAdmin = false;
            if (clubId) isAdmin = (await db.ref('padelio_clubs/' + clubId + '/admins/' + ek).get()).exists();
            if (!isAdmin) {
                // DALYVIS gali vesti TIK SAVO KORTO taškus — privalo būti ŠIO mačo komandoje pagal PATIKIMĄ ID.
                // Kambario mačų komandų žaidėjų id generatorius priskiria IMPORTUOJANT (app.js: name→globalMatch.id),
                // t.y. iš tikrų globalių profilių — admino valdomas kambarys. Kviečiančiojo playerId gaunamas iš
                // verifikuotos tapatybės (prof.email===token). Vardo atsargos NĖRA — vardai vieši ir klastojami;
                // tik ID sutapimas įrodo, kad tai TIKRAS to mačo žaidėjas (ne bendravardis).
                const inThisMatch = ['team1', 'team2'].some(tk => Array.isArray(theMatch[tk]) && theMatch[tk].some(p =>
                    p && p.id && String(p.id) === String(playerId)));
                if (!inThisMatch) { res.status(403).json({ error: 'not your court' }); return; }
            }
            await db.ref('padelio_pro_master/' + roomKey + '/matches/' + idx + '/score' + teamNum).set(score);
            await db.ref('padelio_pro_master/' + roomKey + '/lastUpdate').set(Date.now());
            res.json({ ok: true });
        } catch (e) {
            console.error('submitScore:', e);
            res.status(500).json({ error: 'server error' });
        }
    }
);

const BACKUP_BRANCHES = [
    'padelio_global_tournaments', 'padelio_global_players', 'padelio_clubs',
    'padelio_club_admins', 'padelio_email_links', 'padelio_rooms',
    'padelio_archive_turnyrai', 'padelio_user_tournaments',
    'padelio_chat', 'padelio_user_clubs', 'padelio_paid', 'padelio_paid_meta'
];

exports.dailyBackup = onSchedule(
    { schedule: '40 3 * * *', timeZone: 'Europe/Vilnius', region: REGION },
    async () => {
        const stamp = new Intl.DateTimeFormat('lt-LT', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const backup = { createdAt: Date.now() };
        for (const b of BACKUP_BRANCHES) {
            const snap = await db.ref(b).get();
            backup[b] = snap.val() || null;
        }
        await db.ref('padelio_backups/' + stamp).set(backup);
        // Mažas meta įrašas — jį (o ne pačias dideles kopijas) skaito Platformos langas
        await db.ref('padelio_backups_meta/' + stamp).set({ createdAt: Date.now(), branches: BACKUP_BRANCHES.length });
        // Senesnių nei 14 d. kopijų valymas
        const allSnap = await db.ref('padelio_backups').get();
        const keys = Object.keys(allSnap.val() || {});
        const cutoff = Date.now() - 14 * 864e5;
        for (const k of keys) {
            const t = Date.parse(k + 'T00:00:00Z');
            if (!isNaN(t) && t < cutoff) { await db.ref('padelio_backups/' + k).remove().catch(() => {}); await db.ref('padelio_backups_meta/' + k).remove().catch(() => {}); }
        }
        // NUOTRAUKOS (didziausia sala) — kopijuojamos karta per savaite (sekmadieni),
        // laikomos 3 savaitines kopijos: apsauga yra, o vieta nesvaistoma.
        const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vilnius', weekday: 'short' }).format(new Date());
        if (weekday === 'Sun') {
            const phSnap = await db.ref('padelio_global_players_photos').get();
            await db.ref('padelio_backups_photos/' + stamp).set(phSnap.val() || null);
            const phAll = await db.ref('padelio_backups_photos').get();
            const phKeys = Object.keys(phAll.val() || {}).sort();
            while (phKeys.length > 3) { const old = phKeys.shift(); await db.ref('padelio_backups_photos/' + old).remove().catch(() => {}); }
        }
        console.log('dailyBackup: issaugota ' + stamp + ' (' + BACKUP_BRANCHES.length + ' sakos)');
        return null;
    }
);

// ===================== EL. PAŠTO PRANEŠIMAI =====================
// Du kanalai (getMailer pasirenka automatiškai):
//  1) RESEND (rekomenduojama produkcijai) — siunčia iš info@superpadel.lt per
//     smtp.resend.com. Aktyvuojasi, kai įrašomas RESEND_API_KEY (re_...):
//       firebase functions:secrets:set RESEND_API_KEY   (Resend API raktas)
//     Reikia patvirtinto domeno superpadel.lt Resend sistemoje (SPF/DKIM DNS).
//  2) GMAIL (atsarginis) — SMTP su App Password, siunčia iš EMAIL_USER adreso:
//       firebase functions:secrets:set EMAIL_USER / EMAIL_PASS
// Kol nė vieno rakto nėra — laiškai tyliai praleidžiami (push lieka pagrindinis kanalas).
// getMailer() grąžina { t: transportas, from: siuntėjo adresas } arba null.

let _mailer = null;
function getMailer() {
    try {
        if (_mailer) return _mailer;
        const nodemailer = require('nodemailer');
        // 1) Resend — profesionalus info@superpadel.lt (jei raktas įrašytas)
        const resendKey = String(RESEND_API_KEY.value() || '').trim();
        if (resendKey && resendKey.indexOf('re_') === 0) {
            _mailer = {
                t: nodemailer.createTransport({ host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass: resendKey } }),
                from: '"SuperPadel.lt" <info@superpadel.lt>'
            };
            return _mailer;
        }
        // 2) Gmail atsarginis kelias
        const user = String(EMAIL_USER.value() || '').trim();
        const pass = String(EMAIL_PASS.value() || '').trim();
        if (!user || user.indexOf('@') === -1 || !pass || pass.length < 8) return null;
        _mailer = {
            t: nodemailer.createTransport({ service: 'gmail', auth: { user: user, pass: pass } }),
            from: '"SuperPadel.lt" <' + user + '>'
        };
        return _mailer;
    } catch (e) { return null; } // secrets nepririšti šiai funkcijai arba neįrašyti
}

// Žaidėjo el. paštas: padelio_global_players/{id}/email (įrašomas apsaugant paskyrą)
async function getUserEmail(userId) {
    try {
        const snap = await db.ref('padelio_global_players/' + userId + '/email').get();
        const em = snap.val();
        return (em && String(em).indexOf('@') !== -1) ? String(em) : null;
    } catch (e) { return null; }
}

async function sendEmailToUser(userId, subject, bodyHtml) {
    try {
        const mailer = getMailer();
        if (!mailer) return false;
        const email = await getUserEmail(userId);
        if (!email) return false;
        await mailer.t.sendMail({
            from: mailer.from,
            to: email,
            subject: subject,
            html: '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">'
                + '<div style="background:#0f172a;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:bold;">SUPERPADEL.LT</div>'
                + '<div style="border:1px solid #e2e8f0;border-top:none;padding:18px;border-radius:0 0 10px 10px;font-size:14px;color:#1e293b;line-height:1.5;">'
                + bodyHtml
                + '<div style="margin-top:16px;"><a href="' + APP_LINK + '" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;">Atidaryti portalą</a></div>'
                + '</div></div>'
        });
        return true;
    } catch (e) {
        console.warn('sendEmailToUser klaida:', e && e.message ? e.message : e);
        return false;
    }
}

// PRIMINIMAI EL. PAŠTU — kartu su push (kas 15 min, tie patys langai, atskiros žymos)
exports.emailReminders = onSchedule(
    { schedule: 'every 15 minutes', timeZone: 'Europe/Vilnius', region: REGION, secrets: [EMAIL_USER, EMAIL_PASS, RESEND_API_KEY] },
    async () => {
        if (!getMailer()) return null; // el. paštas dar nesukonfigūruotas
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
                const dayKey = 'em_' + userId + '_' + tId + '_day';
                if (diffH <= 24.5 && diffH >= 23.5 && !sent[dayKey]) {
                    const ok = await sendEmailToUser(userId, '⏰ Rytoj turnyras — ' + (rec.format || 'SuperPadel'),
                        '<b>' + (rec.format || 'Turnyras') + '</b> vyks rytoj, ' + (rec.date || '') + ' ' + (rec.time || '') + '.<br>Jei planai pasikeitė — atšaukite vietą portale, kad ją gautų rezervo eilė.');
                    if (ok) updates[dayKey] = now;
                }
                const hKey = 'em_' + userId + '_' + tId + '_hours';
                if (diffH <= 3.5 && diffH >= 2.5 && !sent[hKey]) {
                    const ok = await sendEmailToUser(userId, '🎾 Turnyras jau šiandien!',
                        '<b>' + (rec.format || 'Turnyras') + '</b> prasideda šiandien ' + (rec.time || '') + '. Sėkmės korte!');
                    if (ok) updates[hKey] = now;
                }
            }
        }
        if (Object.keys(updates).length) await db.ref('padelio_push_sent').update(updates);
        return null;
    }
);


// Paprastas HTML escape laiškams (DB reikšmės — adminų/žaidėjų įvestis)
function emailEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// REGISTRACIJOS PATVIRTINIMAS EL. PAŠTU — suveikia atsiradus padelio_user_tournaments
// įrašui su status='registered'. Laiške visa turnyro informacija: klubas su žemėlapio
// nuoroda, data/laikas, formatas, partneris, apmokėjimo statusas ir rekvizitai.
exports.registrationEmail = onValueWritten(
    { ref: '/padelio_user_tournaments/{uid}/{tid}', region: REGION, instance: DB_INSTANCE, secrets: [EMAIL_USER, EMAIL_PASS, RESEND_API_KEY] },
    async (event) => {
        const before = event.data.before.val();
        const after = event.data.after.val();
        if (!after || after.status !== 'registered') return null;
        if (before && before.status === 'registered') return null; // ne nauja registracija
        if (!getMailer()) return null; // el. paštas dar nesukonfigūruotas
        const uid = event.params.uid, tid = event.params.tid;

        const tSnap = await db.ref('padelio_global_tournaments').get();
        const raw = tSnap.val();
        const arr = (Array.isArray(raw) ? raw : Object.values(raw || {})).filter(Boolean);
        const t = arr.find(x => String(x.id) === String(tid));
        if (!t) return null;

        // Mano players įrašas — partneriui ir apmokėjimo būsenai
        const myName = String(after.name || '').trim().toLowerCase();
        const entry = (Array.isArray(t.players) ? t.players : []).find(e =>
            String(e).split('/').some(part => part.trim().split('|')[0].trim().toLowerCase() === myName)) || null;

        let partnerHtml = '';
        if (entry && String(entry).indexOf('/') !== -1) {
            const parts = String(entry).split('/').map(x => x.trim().split('|')[0].trim());
            const partner = parts.find(x => x.toLowerCase() !== myName) || '';
            if (partner) partnerHtml = '<tr><td style="padding:6px 0;color:#64748b;">Partneris</td><td style="font-weight:bold;">' + emailEsc(partner) + '</td></tr>';
        }

        // Klubas + Google Maps nuoroda pagal pavadinimą ir miestą
        let clubHtml = '';
        if (t.clubName) {
            let city = '', address = '';
            if (t.clubId) {
                try { const cSnap = await db.ref('padelio_clubs/' + t.clubId).get(); const cRec = cSnap.val() || {}; city = cRec.city || ''; address = cRec.address || ''; } catch (e) {}
            }
            // Tikslus adresas (jei klubas nurodė) — geresnis žemėlapio taikinys nei pavadinimas
            const q = encodeURIComponent(address ? address : (String(t.clubName) + (city ? ' ' + city : '') + ' padel'));
            clubHtml = '<tr><td style="padding:6px 0;color:#64748b;">Klubas</td><td style="font-weight:bold;">' + emailEsc(t.clubName) + (city ? ' (' + emailEsc(city) + ')' : '')
                + ' &middot; <a href="https://www.google.com/maps/search/?api=1&query=' + q + '" style="color:#2563eb;">žemėlapis</a></td></tr>';
        }

        // Apmokėjimo statusas ir rekvizitai
        let payHtml = '';
        if (t.paid && entry) {
            const pay = (t.payments || {})[payKey(entry)];
            const seats = String(entry).indexOf('/') !== -1 ? 2 : 1;
            const amount = (pay && pay.amount) || (t.fee || 0) * seats;
            if (pay && pay.status === 'paid') {
                payHtml = '<tr><td style="padding:6px 0;color:#64748b;">Apmokėjimas</td><td style="font-weight:bold;color:#16a34a;">Apmokėta (' + amount + ' €)</td></tr>';
            } else if (pay && pay.method === 'cash') {
                payHtml = '<tr><td style="padding:6px 0;color:#64748b;">Apmokėjimas</td><td style="font-weight:bold;color:#1d4ed8;">Grynais atvykus — ' + amount + ' €</td></tr>';
            } else {
                const dl = (pay && pay.deadline)
                    ? new Date(pay.deadline).toLocaleString('lt-LT', { timeZone: 'Europe/Vilnius', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : '';
                const req = [];
                if (t.payRecipient) req.push('Gavėjas: <b>' + emailEsc(t.payRecipient) + '</b>');
                if (t.payIban) req.push('IBAN: <b>' + emailEsc(t.payIban) + '</b>');
                if (t.payPhone) req.push('Tel.: <b>' + emailEsc(t.payPhone) + '</b>');
                payHtml = '<tr><td style="padding:6px 0;color:#64748b;">Apmokėjimas</td><td style="font-weight:bold;color:#b45309;">Laukiama — ' + amount + ' €' + (dl ? ' (iki ' + dl + ')' : '') + '</td></tr>'
                    + (req.length ? '<tr><td style="padding:6px 0;color:#64748b;">Rekvizitai</td><td>' + req.join('<br>') + '</td></tr>' : '');
            }
        }

        const bodyHtml = '<div style="font-size:16px;font-weight:bold;margin-bottom:10px;">Registracija patvirtinta! ✅</div>'
            + '<table style="width:100%;font-size:14px;border-collapse:collapse;">'
            + '<tr><td style="padding:6px 0;color:#64748b;width:130px;">Turnyras</td><td style="font-weight:bold;">' + emailEsc(t.format || '') + (t.level ? ' (' + emailEsc(t.level) + ')' : '') + '</td></tr>'
            + '<tr><td style="padding:6px 0;color:#64748b;">Data ir laikas</td><td style="font-weight:bold;">' + emailEsc(t.date || '') + ' &middot; ' + emailEsc(t.time || '') + '</td></tr>'
            + clubHtml + partnerHtml + payHtml
            + '</table>'
            + '<div style="font-size:12px;color:#64748b;margin-top:12px;">Priminsime prieš dieną ir prieš 3 val. Jei planai pasikeis — atšaukite vietą portale, ją iškart gaus rezervo eilė.</div>';

        await sendEmailToUser(uid, '🎾 Registracija patvirtinta — ' + (t.format || 'Turnyras') + ' ' + (t.date || ''), bodyHtml);
        return null;
    }
);
