# SuperPadel.lt — padel turnyrų PWA

## Kas tai
Vanilla JavaScript + HTML + CSS PWA. BE build sistemos, BE npm (frontend'ui).
Talpinama GitHub Pages, custom domenas www.superpadel.lt (CNAME failas šaknyje).
Repo turi DU atskirus app'us ir serverio funkcijas:
- Generatorius: index.html + js/config.js, storage.js, logic.js, ui.js, app.js
- Žaidėjų portalas: registras.html + js/registras_auth.js, registras_live.js,
  registras_tournaments.js, registras_admin.js, registras_cam.js,
  registras_webrtc.js, registras_courtview.js + css/registras.css
- Cloud Functions: functions/index.js (tournamentReminders, spotOpened)
- Bendras service worker: sw.js (šaknyje) — jame integruotas ir Firebase
  messaging (foniniai push). Failas firebase-messaging-sw.js NEBENAUDOJAMAS.

Backend: Firebase Realtime Database + FCM push + Cloud Functions.
Projektas: padelio-turnyrai, regionas europe-west1, Blaze planas.
Pagrindinės DB šakos: padelio_global_tournaments (turnyrai),
padelio_global_players (žaidėjai), padelio_pro_master (kambariai),
padelio_push_tokens, padelio_user_tournaments, padelio_room_seq.

## KRITINĖS TAISYKLĖS — VISADA
- VISADA po BET KOKIO pakeitimo, kuris liečia cache'inamą turinį (html, js, css),
  bump'ink sw.js CACHE_NAME versiją (+1): superpadel-cache-vNNN → vNNN+1.
  Perskaityk esamą numerį iš failo — NIEKADA nespėk jo iš atminties.
- VISADA keisdamas css/registras.css bump'ink ir ?v=N parametrą registras.html
  eilutėje <link rel="stylesheet" href="/css/registras.css?v=N">.
- VISADA keisdamas generatoriaus failus (index.html, js/logic|ui|app|config|storage)
  bump'ink js/config.js APP_VERSION ir index.html versijos žymę (VNNN) sinchroniškai.
- VISADA paleisk `node --check <failas.js>` KIEKVIENAM pakeistam JS failui
  prieš commit. Jei klaida — sustok ir pranešk lietuviškai, ne commit'ink.
- VISADA prieš `git push` trumpai lietuviškai paaiškink, ką pakeitei.

## KRITINĖS TAISYKLĖS — NIEKADA (be aiškaus Ramūno nurodymo)
- NIEKADA nekeisk šių funkcijų js/logic.js (matematiškai patikrintos matricos,
  pakeitimas sugadintų turnyrus):
  - generateInterleavedMix8Matrix (Mix Americano 8 — IŠTOBULINTA)
  - reorderMix8ForVariety (ORDER seka [1,2,4,11,9,10,0,7,5,6,8,3])
  - generatePerfectMix16Matrix (Mix Americano 16 — v2 optimizuota)
  - generatePerfectAmericano8Matrix (Americano 8 — 14 raundų, du whist blokai)
  - PERFECT_AMERICANO_MATRICES konstanta ir generatePerfectAmericanoMatrix
    (Americano 4–32 — tobulos whist matricos, patikrintos auditu)
- NIEKADA netrink ir nekeisk CNAME failo repo šaknyje (laiko www.superpadel.lt).
- NIEKADA nekeisk Firebase config reikšmių (apiKey, messagingSenderId, appId,
  vapidKey) — jos suderintos tarp registras_auth.js, sw.js ir functions.
- NIEKADA nedaryk git push --force ar git reset --hard.
- NIEKADA neliesk .env ar service account raktų.

## Deploy
- Frontend (GitHub Pages): git add → commit → push į main. Deploy automatinis,
  live per ~1 min. Jokių build žingsnių nereikia.
- Cloud Functions (tik kai keičiasi functions/ turinys):
  `firebase deploy --only functions --project padelio-turnyrai --non-interactive`
- Po deploy primink Ramūnui: telefone visiškai uždaryti ir iš naujo atidaryti
  PWA, kad aktyvuotųsi naujas service worker.

## Testavimas
- Varikliai (logic.js): prieš liečiant generavimo logiką, paleisk simuliacinius
  testus Node aplinkoje (partnerių/varžovų balansas, raundų teisingumas).
- UI pakeitimai: bent node --check + rankinis Ramūno testas telefone.
- Lokali peržiūra: `python -m http.server 8000` repo šaknyje (arba npx serve).

## Commit stilius
- Trumpos aiškios žinutės lietuviškai arba angliškai, pvz.:
  "Fix: varpelio paspaudimas (push kortelės pointer-events)".
- Vienas commit = vienas loginis pakeitimas. Commit'ink dažnai.
