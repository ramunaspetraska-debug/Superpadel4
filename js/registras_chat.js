// ==========================================
// SUPERPADEL CHAT — klubų pokalbiai ir žaidimo paieška
// ==========================================
// Kiekvienas klubas turi savo pokalbių kambarį: padelio_chat/{clubId}/{msgId} =
// { uid, name, text, ts, type:'msg'|'seek', seek:{level,date,time} }.
// Skaityti gali visi, rašyti — prisijungę, trinti — tik to klubo administratorius
// (DB taisyklės). Rodomos paskutinės 100 žinučių.

let chatRef = null;
let chatClubId = null;
let chatMsgCount = 0;
let chatFilter = 'all'; // 'all' | 'seek' — srauto filtras (žinutės / „Ieškau žaidimo")

function chatJsSafe(s) { return String(s || '').replace(/['"\\<>&]/g, ''); }

// Ar „Ieškau žaidimo" skelbimo laikas jau praėjo (pasibaigęs). Nauji skelbimai turi pilną dateIso;
// seniems (tik MM-DD) — geriausios pastangos su einamaisiais metais.
function seekIsPast(seek) {
    if (!seek) return false;
    let iso = seek.dateIso;
    if (!iso && seek.date && /^\d{2}-\d{2}$/.test(seek.date)) iso = new Date().getFullYear() + '-' + seek.date;
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    let time = (seek.time && /^\d{1,2}:\d{2}/.test(seek.time)) ? seek.time : '23:59';
    if (time.length === 4) time = '0' + time; // H:MM -> HH:MM
    const dt = new Date(iso + 'T' + time);
    if (isNaN(dt.getTime())) return false;
    return dt.getTime() < Date.now();
}

function openClubChat(clubId, clubName) {
    closeClubChat();
    chatClubId = String(clubId);
    chatMsgCount = 0;
    chatFilter = 'all';
    const isLogged = (typeof currentUser !== 'undefined' && currentUser && currentUser.id);
    const wrap = document.createElement('div');
    wrap.id = 'club-chat-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.7);z-index:10000;display:flex;align-items:flex-end;justify-content:center;';
    wrap.innerHTML = `
        <div style="background:#f8f9fb;border-radius:20px 20px 0 0;width:100%;max-width:480px;height:85vh;display:flex;flex-direction:column;overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:white;border-bottom:1px solid #e2e8f0;flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                    ${(typeof allClubsCache !== 'undefined' && allClubsCache[chatClubId] && allClubsCache[chatClubId].logo) ? `<img src="${allClubsCache[chatClubId].logo}" style="width:38px;height:38px;border-radius:10px;object-fit:cover;flex-shrink:0;">` : ''}
                    <div style="min-width:0;">
                        <div style="font-weight:900;font-size:15px;color:var(--text-dark);"><i class="fa-solid fa-comments" style="color:var(--primary-blue);"></i> ${esc(clubName || 'Klubo pokalbiai')}</div>
                        <div style="font-size:10px;color:var(--text-grey);">Bendraukite ir tarkitės dėl žaidimų</div>
                    </div>
                </div>
                <button type="button" onclick="closeClubChat()" style="background:#f1f5f9;border:none;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;flex-shrink:0;">&times;</button>
            </div>
            <div style="display:flex;gap:6px;padding:8px 12px;background:white;border-bottom:1px solid #e2e8f0;flex-shrink:0;">
                <button type="button" id="chatTabAll" onclick="setChatFilter('all')" style="flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;border:1px solid var(--primary-blue);background:var(--primary-blue);color:white;">Visos žinutės</button>
                <button type="button" id="chatTabSeek" onclick="setChatFilter('seek')" style="flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;border:1px solid #fde68a;background:#fffbeb;color:#92400e;">🎾 Ieškau žaidimo</button>
            </div>
            <div id="chatSeekFilters" style="display:none;gap:8px;padding:6px 12px;background:#fffbeb;border-bottom:1px solid #fde68a;flex-shrink:0;align-items:center;">
                <select id="chatSeekLevelFilter" onchange="applyChatFilter()" style="flex:1;padding:7px;border:1px solid #fde68a;border-radius:8px;font-size:11px;font-weight:700;">
                    <option value="">Visi lygiai</option>
                    <option value="A">A</option><option value="B-/B">B-/B</option><option value="C/C+">C/C+</option>
                    <option value="C-/C">C-/C</option><option value="D/C-">D/C-</option><option value="D">D</option>
                </select>
                <label style="font-size:11px;color:#92400e;font-weight:700;display:flex;align-items:center;gap:4px;white-space:nowrap;cursor:pointer;"><input type="checkbox" id="chatHideExpired" checked onchange="applyChatFilter()"> Slėpti pasibaigusius</label>
            </div>
            <div id="chatMessages" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;">
                <div id="chatLoadingPh" style="text-align:center;color:#94a3b8;font-size:12px;padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Kraunamos žinutės...</div>
            </div>
            <div id="chatComposer" style="flex-shrink:0;background:white;border-top:1px solid #e2e8f0;padding:10px 12px;">
                ${isLogged ? `
                <div style="display:flex;gap:8px;align-items:center;">
                    <button type="button" onclick="openSeekGameForm()" title="Ieškau žaidimo — skelbimas" style="background:#fffbeb;border:1px solid #fde68a;width:42px;height:42px;border-radius:10px;font-size:17px;cursor:pointer;flex-shrink:0;">🎾</button>
                    <input id="chatInput" type="text" maxlength="400" placeholder="Rašykite žinutę..." autocomplete="off" style="flex:1;min-width:0;padding:12px;border:1px solid #cbd5e0;border-radius:10px;font-size:14px;outline:none;" onkeydown="if(event.key==='Enter'){sendChatMessage();}">
                    <button type="button" onclick="sendChatMessage()" style="background:var(--primary-blue);color:white;border:none;width:42px;height:42px;border-radius:10px;font-size:15px;cursor:pointer;flex-shrink:0;"><i class="fa-solid fa-paper-plane"></i></button>
                </div>` : `
                <button type="button" onclick="closeClubChat(); openAuthModal();" style="width:100%;padding:12px;background:var(--primary-blue);color:white;border:none;border-radius:10px;font-weight:bold;font-size:13px;cursor:pointer;">Prisijunkite, kad rašytumėte</button>`}
            </div>
        </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => { if (e.target === wrap) closeClubChat(); });

    if (typeof firebase === 'undefined') {
        const ph = document.getElementById('chatLoadingPh');
        if (ph) ph.innerText = 'Ryšio nėra — pabandykite vėliau.';
        return;
    }
    chatRef = firebase.database().ref('padelio_chat/' + chatClubId).limitToLast(100);
    chatRef.on('child_added', snap => appendChatMessage(snap.key, snap.val()));
    chatRef.on('child_changed', snap => {
        // Skelbimo atnaujinimas (pvz. kažkas prisijungė prie „Ieškau žaidimo")
        const old = document.getElementById('chatmsg-' + snap.key);
        if (!old) return;
        const fresh = buildChatMessageEl(snap.key, snap.val());
        old.replaceWith(fresh);
        if (chatFilter !== 'all') applyChatFilter();
    });
    chatRef.on('child_removed', snap => {
        document.getElementById('chatmsg-' + snap.key)?.remove();
        chatMsgCount = Math.max(0, chatMsgCount - 1);
        if (chatMsgCount === 0) showChatEmptyPlaceholder();
    });
    // Jei per 1.5s žinučių neatėjo — kambarys tuščias
    setTimeout(() => { if (chatMsgCount === 0) showChatEmptyPlaceholder(); }, 1500);
}

function closeClubChat() {
    if (chatRef) { try { chatRef.off(); } catch (e) {} chatRef = null; }
    chatClubId = null;
    document.getElementById('club-chat-modal')?.remove();
}

function showChatEmptyPlaceholder() {
    const box = document.getElementById('chatMessages');
    if (!box) return;
    document.getElementById('chatLoadingPh')?.remove();
    if (!document.getElementById('chatEmptyPh') && chatMsgCount === 0) {
        box.innerHTML = '<div id="chatEmptyPh" style="text-align:center;color:#94a3b8;font-size:12px;padding:24px;">Žinučių dar nėra — parašykite pirmi! 👋</div>';
    }
}

// Perjungia srauto filtrą (visos žinutės / tik „Ieškau žaidimo")
function setChatFilter(f) {
    chatFilter = f;
    const all = document.getElementById('chatTabAll'), seek = document.getElementById('chatTabSeek'), sf = document.getElementById('chatSeekFilters');
    const base = 'flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;';
    if (all) all.style.cssText = base + (f === 'all' ? 'border:1px solid var(--primary-blue);background:var(--primary-blue);color:white;' : 'border:1px solid #cbd5e0;background:white;color:var(--text-grey);');
    if (seek) seek.style.cssText = base + (f === 'seek' ? 'border:1px solid #d97706;background:#d97706;color:white;' : 'border:1px solid #fde68a;background:#fffbeb;color:#92400e;');
    if (sf) sf.style.display = (f === 'seek') ? 'flex' : 'none';
    applyChatFilter();
}

// Pritaiko dabartinį filtrą (rodo/slepia elementus). „Ieškau žaidimo" tabe — tik seek skelbimai,
// papildomai filtruoja pagal lygį ir slepia pasibaigusius (jei pažymėta).
function applyChatFilter() {
    const box = document.getElementById('chatMessages');
    if (!box) return;
    const levelF = (document.getElementById('chatSeekLevelFilter') && document.getElementById('chatSeekLevelFilter').value) || '';
    const hideExp = !!(document.getElementById('chatHideExpired') && document.getElementById('chatHideExpired').checked);
    let visible = 0;
    Array.from(box.children).forEach(el => {
        if (!el.id || el.id.indexOf('chatmsg-') !== 0) return; // praleidžiam placeholder'ius
        let show = true;
        if (chatFilter === 'seek') {
            show = el.getAttribute('data-msgtype') === 'seek';
            if (show && levelF) show = (el.getAttribute('data-seeklevel') === levelF);
            if (show && hideExp && el.getAttribute('data-seekpast') === '1') show = false;
        }
        el.style.display = show ? '' : 'none';
        if (show) visible++;
    });
    let ph = document.getElementById('chatFilterEmpty');
    if (chatFilter === 'seek' && visible === 0) {
        if (!ph) { ph = document.createElement('div'); ph.id = 'chatFilterEmpty'; ph.style.cssText = 'text-align:center;color:#94a3b8;font-size:12px;padding:24px;'; box.appendChild(ph); }
        ph.textContent = 'Aktyvių „Ieškau žaidimo" skelbimų nėra. Paskelbkite savo! 🎾';
        ph.style.display = '';
    } else if (ph) { ph.style.display = 'none'; }
}

function chatTimeStr(ts) {
    try {
        const d = new Date(ts || 0);
        const now = new Date();
        const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        return sameDay ? hm : (String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + hm);
    } catch (e) { return ''; }
}

function appendChatMessage(key, m) {
    const box = document.getElementById('chatMessages');
    if (!box || !m) return;
    document.getElementById('chatLoadingPh')?.remove();
    document.getElementById('chatEmptyPh')?.remove();
    chatMsgCount++;
    box.appendChild(buildChatMessageEl(key, m));
    if (chatFilter !== 'all') applyChatFilter();
    box.scrollTop = box.scrollHeight;
}

function buildChatMessageEl(key, m) {
    const mine = (typeof currentUser !== 'undefined' && currentUser && String(m.uid) === String(currentUser.id));
    // Trinti gali tik klubo adminas (prisijungęs prie SAVO klubo admin paskyros)
    const canDelete = (typeof currentClub !== 'undefined' && currentClub && String(currentClub.id) === String(chatClubId));
    const delBtn = canDelete ? `<button type="button" onclick="deleteChatMessage('${chatJsSafe(key)}')" title="Ištrinti" style="background:none;border:none;color:#cbd5e0;font-size:11px;cursor:pointer;padding:2px 4px;"><i class="fa-solid fa-trash"></i></button>` : '';

    const el = document.createElement('div');
    el.id = 'chatmsg-' + key;

    if (m.type === 'seek' && m.seek) {
        // „Ieškau žaidimo" skelbimas: kiek trūksta, kas prisijungė, mygtukas „Prisijungiu"
        const needed = Math.max(1, parseInt(m.seek.needed) || 1);
        const joined = m.joined || {};
        const joinedIds = Object.keys(joined);
        const joinedNames = joinedIds.map(k => (joined[k] && joined[k].name) || '?');
        const iAmAuthor = mine;
        const myId = (typeof currentUser !== 'undefined' && currentUser) ? String(currentUser.id) : null;
        const iJoined = myId ? joinedIds.indexOf(chatJsSafe(myId)) !== -1 : false;
        const full = joinedIds.length >= needed;
        const past = seekIsPast(m.seek);
        el.setAttribute('data-msgtype', 'seek');
        el.setAttribute('data-seeklevel', m.seek.level || '');
        el.setAttribute('data-seekpast', past ? '1' : '0');

        let joinBtn = '';
        if (past) {
            joinBtn = `<div style="margin-top:8px;text-align:center;font-size:12px;font-weight:800;color:#94a3b8;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:8px;">⏳ Skelbimas pasibaigęs</div>`;
        } else if (myId && !iAmAuthor) {
            joinBtn = iJoined
                ? `<button type="button" onclick="leaveSeek('${chatJsSafe(key)}')" style="width:100%;margin-top:8px;padding:10px;background:white;border:1px solid #fca5a5;color:#dc2626;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;">↩ Atšaukti prisijungimą</button>`
                : (full
                    ? `<div style="margin-top:8px;text-align:center;font-size:12px;font-weight:800;color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px;">✅ SURINKTA — žaidėjų nebereikia</div>`
                    : `<button type="button" onclick="joinSeek('${chatJsSafe(key)}')" style="width:100%;margin-top:8px;padding:10px;background:#16a34a;border:none;color:white;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">🎾 Prisijungiu!</button>`);
        } else if (iAmAuthor && full) {
            joinBtn = `<div style="margin-top:8px;text-align:center;font-size:12px;font-weight:800;color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px;">✅ SURINKTA — komanda pilna!</div>`;
        }

        el.style.cssText = 'align-self:stretch;';
        el.innerHTML = `
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:10px 12px;${past ? 'opacity:0.55;' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="font-size:11px;font-weight:900;color:#92400e;">🎾 IEŠKO ${needed > 1 ? needed + ' ŽAIDĖJŲ' : 'ŽAIDĖJO'}${past ? ' · PASIBAIGĘS' : ''}</div>
                    <div style="display:flex;align-items:center;gap:4px;"><span style="font-size:10px;color:#b45309;">${chatTimeStr(m.ts)}</span>${delBtn}</div>
                </div>
                <div style="font-size:13px;font-weight:800;color:var(--text-dark);margin-top:4px;">${esc(m.name)}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
                    <span style="font-size:11px;background:white;border:1px solid #fde68a;border-radius:6px;padding:3px 8px;font-weight:700;color:#92400e;">Lygis: ${esc(m.seek.level || 'Bet koks')}</span>
                    ${m.seek.date ? `<span style="font-size:11px;background:white;border:1px solid #fde68a;border-radius:6px;padding:3px 8px;font-weight:700;color:#92400e;">📅 ${esc(m.seek.date)}</span>` : ''}
                    ${m.seek.time ? `<span style="font-size:11px;background:white;border:1px solid #fde68a;border-radius:6px;padding:3px 8px;font-weight:700;color:#92400e;">🕐 ${esc(m.seek.time)}</span>` : ''}
                </div>
                ${m.text ? `<div style="font-size:12px;color:var(--text-grey);margin-top:6px;">${esc(m.text)}</div>` : ''}
                <div style="font-size:12px;font-weight:700;color:${full ? '#16a34a' : '#92400e'};margin-top:8px;">
                    Prisijungė: ${joinedIds.length}/${needed}${joinedNames.length ? ' — ' + joinedNames.map(esc).join(', ') : ''}
                </div>
                ${joinBtn}
            </div>`;
        return el;
    }

    el.setAttribute('data-msgtype', 'msg');
    if (mine) {
        el.style.cssText = 'align-self:flex-end;max-width:82%;';
        el.innerHTML = `
            <div style="background:var(--primary-blue);color:white;border-radius:14px 14px 4px 14px;padding:9px 12px;">
                <div style="font-size:13px;word-break:break-word;">${esc(m.text)}</div>
                <div style="font-size:9px;opacity:0.75;text-align:right;margin-top:3px;">${chatTimeStr(m.ts)}</div>
            </div>`;
    } else {
        el.style.cssText = 'align-self:flex-start;max-width:82%;';
        el.innerHTML = `
            <div style="background:white;border:1px solid #e2e8f0;border-radius:14px 14px 14px 4px;padding:9px 12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                    <div style="font-size:11px;font-weight:800;color:var(--primary-blue);">${esc(m.name || 'Žaidėjas')}</div>
                    ${delBtn}
                </div>
                <div style="font-size:13px;color:var(--text-dark);word-break:break-word;margin-top:2px;">${esc(m.text)}</div>
                <div style="font-size:9px;color:#a0aec0;text-align:right;margin-top:3px;">${chatTimeStr(m.ts)}</div>
            </div>`;
    }
    return el;
}

// ---------- PRISIJUNGIMAS PRIE „IEŠKAU ŽAIDIMO" SKELBIMO ----------
function joinSeek(key) {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) { showToast("Prisijunkite prie paskyros."); openAuthModal(); return; }
    if (!chatClubId || !key) return;
    firebase.database().ref('padelio_chat/' + chatClubId + '/' + key + '/joined/' + chatJsSafe(String(currentUser.id)))
        .set({ name: currentUser.name || 'Žaidėjas', ts: Date.now() })
        .then(() => showToast("🎾 Prisijungėte! Skelbėjas matys jūsų vardą."))
        .catch(e => showToast("Nepavyko: " + ((e && e.message) || 'klaida')));
}

function leaveSeek(key) {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) return;
    if (!chatClubId || !key) return;
    firebase.database().ref('padelio_chat/' + chatClubId + '/' + key + '/joined/' + chatJsSafe(String(currentUser.id)))
        .remove()
        .then(() => showToast("Prisijungimas atšauktas."))
        .catch(e => showToast("Nepavyko: " + ((e && e.message) || 'klaida')));
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    if (!input || !chatClubId) return;
    const text = input.value.trim();
    if (!text) return;
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) { showToast("Prisijunkite, kad rašytumėte."); return; }
    input.value = '';
    firebase.database().ref('padelio_chat/' + chatClubId).push({
        uid: String(currentUser.id),
        name: currentUser.name || 'Žaidėjas',
        text: text,
        ts: Date.now(),
        type: 'msg'
    }).catch(e => showToast("Nepavyko išsiųsti: " + ((e && e.message) || 'klaida')));
}

function deleteChatMessage(key) {
    if (!chatClubId || !key) return;
    if (!confirm("Ištrinti šią žinutę?")) return;
    firebase.database().ref('padelio_chat/' + chatClubId + '/' + key).remove()
        .catch(e => showToast("Nepavyko ištrinti: " + ((e && e.message) || 'nėra teisių')));
}

// ---------- „IEŠKAU ŽAIDIMO" SKELBIMAS ----------
function openSeekGameForm() {
    if (typeof currentUser === 'undefined' || !currentUser) { showToast("Prisijunkite."); return; }
    document.getElementById('seek-form')?.remove();
    const composer = document.getElementById('chatComposer');
    if (!composer) return;
    const today = new Date();
    const isoToday = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const form = document.createElement('div');
    form.id = 'seek-form';
    form.style.cssText = 'background:#fffbeb;border-top:1px solid #fde68a;padding:12px;';
    form.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-size:12px;font-weight:900;color:#92400e;">🎾 Ieškau žaidimo — skelbimas</div>
            <button type="button" onclick="document.getElementById('seek-form').remove()" style="background:none;border:none;font-size:16px;cursor:pointer;color:#92400e;">&times;</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
            <select id="seekNeeded" style="flex:0.9;padding:9px;border:1px solid #fde68a;border-radius:8px;font-size:12px;font-weight:700;">
                <option value="1">Trūksta 1</option>
                <option value="2">Trūksta 2</option>
                <option value="3" selected>Trūksta 3</option>
            </select>
            <select id="seekLevel" style="flex:1;padding:9px;border:1px solid #fde68a;border-radius:8px;font-size:12px;font-weight:700;">
                <option value="Bet koks">Bet koks lygis</option>
                <option value="A">A</option>
                <option value="B-/B">B-/B</option>
                <option value="C/C+">C/C+</option>
                <option value="C-/C">C-/C</option>
                <option value="D/C-">D/C-</option>
                <option value="D">D</option>
            </select>
            <input id="seekDate" type="date" min="${isoToday}" value="${isoToday}" style="flex:1;padding:8px;border:1px solid #fde68a;border-radius:8px;font-size:12px;font-weight:700;">
            <input id="seekTime" type="time" value="18:00" style="flex:0.8;padding:8px;border:1px solid #fde68a;border-radius:8px;font-size:12px;font-weight:700;">
        </div>
        <input id="seekNote" type="text" maxlength="200" placeholder="Papildoma žinutė (nebūtina)..." style="width:100%;padding:9px;border:1px solid #fde68a;border-radius:8px;font-size:12px;box-sizing:border-box;margin-bottom:8px;">
        <button type="button" onclick="sendSeekMessage()" style="width:100%;padding:11px;background:#d97706;color:white;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">Paskelbti</button>`;
    composer.parentNode.insertBefore(form, composer);
}

function sendSeekMessage() {
    if (!chatClubId || typeof currentUser === 'undefined' || !currentUser) return;
    const level = document.getElementById('seekLevel')?.value || 'Bet koks';
    const dateIso = document.getElementById('seekDate')?.value || '';
    const time = document.getElementById('seekTime')?.value || '';
    const note = (document.getElementById('seekNote')?.value || '').trim();
    const dateMD = dateIso ? dateIso.slice(5) : ''; // YYYY-MM-DD -> MM-DD (kaip visur sistemoje)
    firebase.database().ref('padelio_chat/' + chatClubId).push({
        uid: String(currentUser.id),
        name: currentUser.name || 'Žaidėjas',
        text: note,
        ts: Date.now(),
        type: 'seek',
        seek: { level: level, date: dateMD, dateIso: dateIso, time: time, needed: parseInt(document.getElementById('seekNeeded')?.value || 3) }
    }).then(() => {
        document.getElementById('seek-form')?.remove();
        showToast("🎾 Skelbimas paskelbtas!");
    }).catch(e => showToast("Nepavyko paskelbti: " + ((e && e.message) || 'klaida')));
}

// ==========================================
// BENDRAS „IEŠKAU ŽAIDIMO" SRAUTAS — visų klubų skelbimai vienoje vietoje
// ==========================================
// Kad nebūtų perkrauta: filtras pagal MIESTĄ (numatytai — sekamo klubo miestas), lygį; rodomi tik
// AKTYVŪS (nepasibaigę) skelbimai; skaitomi tik atrinkti klubai (iki 30). Skaitymas viešas (be login).

let _allSeeksData = [];
let _allSeeksCapped = false;

// Mygtukas klubų puslapiui (kviečiamas renderClubsPage per typeof guard)
function allSeeksButtonHtml() {
    return `<button type="button" onclick="openAllSeeksModal()" style="width:100%;padding:12px;margin-bottom:12px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">🎾 Rasti žaidimą — visų klubų skelbimai</button>`;
}

function openAllSeeksModal() {
    if (typeof firebase === 'undefined') { showToast('Ryšio nėra — pabandykite vėliau.'); return; }
    document.getElementById('all-seeks-modal')?.remove();
    const clubsCache = (typeof allClubsCache !== 'undefined') ? allClubsCache : {};
    const followed = (typeof myClubs !== 'undefined') ? myClubs : {};
    const cities = [...new Set(Object.values(clubsCache).map(c => (c && c.city ? String(c.city).trim() : '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'lt'));
    // Numatytas miestas: sekamo klubo miestas (srautas siauresnis, ne visas pasaulis)
    let defCity = 'all';
    for (const id of Object.keys(followed)) { if (clubsCache[id] && clubsCache[id].city) { defCity = String(clubsCache[id].city).trim(); break; } }
    const wrap = document.createElement('div');
    wrap.id = 'all-seeks-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.7);z-index:10000;display:flex;align-items:flex-end;justify-content:center;';
    wrap.innerHTML = `
        <div style="background:#f8f9fb;border-radius:20px 20px 0 0;width:100%;max-width:480px;height:85vh;display:flex;flex-direction:column;overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:white;border-bottom:1px solid #e2e8f0;flex-shrink:0;">
                <div style="font-weight:900;font-size:15px;color:var(--text-dark);">🎾 Ieškau žaidimo — visi klubai</div>
                <button type="button" onclick="document.getElementById('all-seeks-modal').remove()" style="background:#f1f5f9;border:none;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;">&times;</button>
            </div>
            <div style="display:flex;gap:6px;padding:8px 12px;background:white;border-bottom:1px solid #e2e8f0;flex-shrink:0;">
                <select id="allSeekCity" onchange="loadAllSeeks()" style="flex:1;min-width:0;padding:8px;border:1px solid #cbd5e0;border-radius:8px;font-size:12px;font-weight:700;">
                    <option value="all">Visi miestai</option>
                    ${cities.map(c => `<option value="${esc(c)}"${c === defCity ? ' selected' : ''}>${esc(c)}</option>`).join('')}
                </select>
                <select id="allSeekLevel" onchange="renderAllSeeks()" style="flex:1;min-width:0;padding:8px;border:1px solid #cbd5e0;border-radius:8px;font-size:12px;font-weight:700;">
                    <option value="">Visi lygiai</option>
                    <option value="A">A</option><option value="B-/B">B-/B</option><option value="C/C+">C/C+</option>
                    <option value="C-/C">C-/C</option><option value="D/C-">D/C-</option><option value="D">D</option>
                </select>
            </div>
            <div id="allSeeksList" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;">
                <div style="text-align:center;color:#94a3b8;font-size:12px;padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Ieškoma skelbimų...</div>
            </div>
        </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    loadAllSeeks();
}

function loadAllSeeks() {
    const list = document.getElementById('allSeeksList');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:12px;padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Ieškoma skelbimų...</div>';
    const clubsCache = (typeof allClubsCache !== 'undefined') ? allClubsCache : {};
    const followed = (typeof myClubs !== 'undefined') ? myClubs : {};
    const city = document.getElementById('allSeekCity')?.value || 'all';
    let clubIds = Object.keys(clubsCache).filter(id => {
        const c = clubsCache[id]; if (!c) return false;
        return city === 'all' || String(c.city || '').trim() === city;
    });
    // Sekamus klubus visada įtraukiam (net jei kito miesto)
    Object.keys(followed).forEach(id => { if (clubsCache[id] && clubIds.indexOf(id) === -1) clubIds.push(id); });
    _allSeeksCapped = clubIds.length > 30;
    clubIds = clubIds.slice(0, 30);
    if (!clubIds.length) { list.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:13px;padding:24px;">Klubų pagal šį filtrą nėra.</div>'; _allSeeksData = []; return; }
    Promise.all(clubIds.map(id =>
        firebase.database().ref('padelio_chat/' + id).limitToLast(80).once('value')
            .then(snap => ({ id: id, val: snap.val() || {} })).catch(() => ({ id: id, val: {} }))
    )).then(results => {
        const seeks = [];
        results.forEach(r => {
            const c = clubsCache[r.id] || {};
            Object.keys(r.val).forEach(key => {
                const m = r.val[key];
                if (m && m.type === 'seek' && m.seek) {
                    seeks.push({ clubId: r.id, clubName: c.name || 'Klubas', city: c.city || '', key: key, uid: m.uid, seek: m.seek, name: m.name, text: m.text, ts: m.ts, joined: m.joined || {} });
                }
            });
        });
        seeks.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        _allSeeksData = seeks;
        renderAllSeeks();
    }).catch(() => { if (list) list.innerHTML = '<div style="text-align:center;color:var(--status-red);font-size:12px;padding:20px;">Nepavyko įkelti skelbimų.</div>'; });
}

function renderAllSeeks() {
    const list = document.getElementById('allSeeksList');
    if (!list) return;
    const levelF = (document.getElementById('allSeekLevel') && document.getElementById('allSeekLevel').value) || '';
    const shown = _allSeeksData.filter(s => !seekIsPast(s.seek) && (!levelF || (s.seek.level || '') === levelF));
    if (!shown.length) {
        list.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:13px;padding:24px;">Aktyvių „Ieškau žaidimo" skelbimų pagal šį filtrą nėra.</div>';
        return;
    }
    const myId = (typeof currentUser !== 'undefined' && currentUser) ? String(currentUser.id) : null;
    list.innerHTML = shown.map(s => buildAggSeekCard(s, myId)).join('')
        + (_allSeeksCapped ? '<div style="text-align:center;color:#94a3b8;font-size:11px;padding:8px;">Rodomi ne visi klubai — patikslinkite miestą, kad matytumėte visus.</div>' : '');
}

function buildAggSeekCard(s, myId) {
    const needed = Math.max(1, parseInt(s.seek.needed) || 1);
    const joinedIds = Object.keys(s.joined || {});
    const joinedNames = joinedIds.map(k => (s.joined[k] && s.joined[k].name) || '?');
    const iAmAuthor = myId && String(s.uid) === myId;
    const iJoined = myId ? joinedIds.indexOf(chatJsSafe(myId)) !== -1 : false;
    const full = joinedIds.length >= needed;
    const chip = 'font-size:11px;background:white;border:1px solid #fde68a;border-radius:6px;padding:3px 8px;font-weight:700;color:#92400e;';
    let btn = '';
    if (!myId) {
        btn = `<button type="button" onclick="document.getElementById('all-seeks-modal').remove(); openAuthModal();" style="width:100%;margin-top:8px;padding:9px;background:var(--primary-blue);border:none;color:white;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;">Prisijunkite, kad prisijungtumėte prie žaidimo</button>`;
    } else if (!iAmAuthor) {
        btn = iJoined
            ? `<button type="button" onclick="leaveSeekAgg('${chatJsSafe(s.clubId)}','${chatJsSafe(s.key)}')" style="width:100%;margin-top:8px;padding:10px;background:white;border:1px solid #fca5a5;color:#dc2626;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;">↩ Atšaukti prisijungimą</button>`
            : (full
                ? `<div style="margin-top:8px;text-align:center;font-size:12px;font-weight:800;color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px;">✅ SURINKTA</div>`
                : `<button type="button" onclick="joinSeekAgg('${chatJsSafe(s.clubId)}','${chatJsSafe(s.key)}')" style="width:100%;margin-top:8px;padding:10px;background:#16a34a;border:none;color:white;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">🎾 Prisijungiu!</button>`);
    } else {
        btn = `<div style="margin-top:8px;text-align:center;font-size:11px;font-weight:700;color:#92400e;">Jūsų skelbimas${full ? ' · ✅ komanda pilna!' : ''}</div>`;
    }
    return `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:10px 12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:11px;font-weight:900;color:#92400e;">🎾 IEŠKO ${needed > 1 ? needed + ' ŽAIDĖJŲ' : 'ŽAIDĖJO'}</div>
            <span style="font-size:10px;color:#b45309;">${chatTimeStr(s.ts)}</span>
        </div>
        <div style="font-size:12px;font-weight:800;color:var(--primary-blue);margin-top:3px;"><i class="fa-solid fa-location-dot" style="font-size:10px;"></i> ${esc(s.clubName)}${s.city ? ' · ' + esc(s.city) : ''}</div>
        <div style="font-size:13px;font-weight:700;color:var(--text-dark);margin-top:2px;">${esc(s.name)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            <span style="${chip}">Lygis: ${esc(s.seek.level || 'Bet koks')}</span>
            ${s.seek.date ? `<span style="${chip}">📅 ${esc(s.seek.date)}</span>` : ''}
            ${s.seek.time ? `<span style="${chip}">🕐 ${esc(s.seek.time)}</span>` : ''}
        </div>
        ${s.text ? `<div style="font-size:12px;color:var(--text-grey);margin-top:6px;">${esc(s.text)}</div>` : ''}
        <div style="font-size:12px;font-weight:700;color:${full ? '#16a34a' : '#92400e'};margin-top:8px;">Prisijungė: ${joinedIds.length}/${needed}${joinedNames.length ? ' — ' + joinedNames.map(esc).join(', ') : ''}</div>
        ${btn}
    </div>`;
}

function joinSeekAgg(clubId, key) {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) { showToast("Prisijunkite prie paskyros."); return; }
    firebase.database().ref('padelio_chat/' + clubId + '/' + key + '/joined/' + chatJsSafe(String(currentUser.id)))
        .set({ name: currentUser.name || 'Žaidėjas', ts: Date.now() })
        .then(() => {
            showToast("🎾 Prisijungėte! Skelbėjas matys jūsų vardą.");
            const s = _allSeeksData.find(x => x.clubId === clubId && x.key === key);
            if (s) { s.joined = s.joined || {}; s.joined[String(currentUser.id)] = { name: currentUser.name || 'Žaidėjas', ts: Date.now() }; }
            renderAllSeeks();
        })
        .catch(e => showToast("Nepavyko: " + ((e && e.message) || 'klaida')));
}

function leaveSeekAgg(clubId, key) {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) return;
    firebase.database().ref('padelio_chat/' + clubId + '/' + key + '/joined/' + chatJsSafe(String(currentUser.id)))
        .remove()
        .then(() => {
            showToast("Prisijungimas atšauktas.");
            const s = _allSeeksData.find(x => x.clubId === clubId && x.key === key);
            if (s && s.joined) { delete s.joined[String(currentUser.id)]; }
            renderAllSeeks();
        })
        .catch(e => showToast("Nepavyko: " + ((e && e.message) || 'klaida')));
}
