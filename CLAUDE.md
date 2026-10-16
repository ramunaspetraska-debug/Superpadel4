# SuperPadel.lt — padel turnyrų PWA

## Kas tai
Vanilla JavaScript + HTML + CSS PWA. BE build sistemos, BE npm (frontend'ui).
Talpinama GitHub Pages, custom domenas www.superpadel.lt (CNAME failas šaknyje).
Du atskiri app'ai: generatorius (index.html + js/config|storage|logic|ui|app.js) ir
žaidėjų portalas (registras.html + js/registras_*.js + css/registras.css); serveris — functions/.
Backend: Firebase RTDB + FCM + Cloud Functions v2 (Node 22), projektas padelio-turnyrai,
regionas europe-west1, Blaze planas.

## Gotchas (iš kodo neakivaizdu)
- sw.js (šaknyje) — vienintelis service worker, jame integruotas ir Firebase messaging.
  Failas firebase-messaging-sw.js NEBENAUDOJAMAS.
- Auth atstatymo laukimas: push (requestPushPermission/pushSilentRefresh laukia
  pushAuthReady() — anksčiau tokenas tyliai neįsirašydavo); kambarių prieiga
  generatoriuje laukia authEmailReady (storage.js) — be jo klubo adminas gaudavo
  „TIK PERŽIŪRA". userClubsInit() prijungiamas per updateAuthUI() (kiekvieną
  prisijungimą) — NE tik puslapio starto metu; userClubsInit/userTournamentsInit
  turi klaidos callback su auth-retry.
- Prisijungimai: TIK el. pašto nuorodos (Firebase Auth email-link). Telefono/PIN 7030
  sistemos PAŠALINTOS. Sesija bendra tarp index.html ir registras.html (ta pati kilmė).
- Multi-tenancy: klubo adminas (padelio_club_admins) mato tik savo klubo turnyrus/
  kambarius. Oficialius turnyrus kuria TIK klubai su canOfficial=true, kurį suteikia
  tik platformos savininkas (legacyOwner, atpažįstamas pagal el. paštą, be slaptų kodų).
- DB saugumo taisyklės (database.rules.json) ĮDIEGTOS serveryje: skaitymas daugiausia
  viešas, rašymas auth-gated; padelio_user_clubs/padelio_user_tournaments — tik savininkas.
- Mokami turnyrai: sumą skaičiuoja SERVERIS iš DB; mokėjimo terminas VISADA <=
  registracijos uždarymo; pay.claimed ir method='cash' serveris NEšalina.
- Cloud Functions secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (be jų — 503,
  klientas fallback'ina į pavedimą); EMAIL_USER/EMAIL_PASS (be jų laiškai tyliai skip).
- WebRTC: PIN tikrina SIUNTĖJAS (PIN DB nebesaugomas).

## Laukiantys darbai
- Ramūnas turi užpildyti savo klubo miestą per „Klubo informacija"; naujiems klubams
  canOfficial tvirtinamas per Platform statistics.

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
- VISADA sukūręs NAUJĄ DB šaką pridėk ją į functions/index.js BACKUP_BRANCHES
  sąrašą (kitaip naktinė atsarginė kopija jos neapims).

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
- Frontend (GitHub Pages): push į main = automatinis deploy, live per ~1 min, be build.
- Pilna procedūra (įskaitant Cloud Functions deploy ir priminimus) — /deploy komanda.

## Testavimas
- logic.js generavimo logika: prieš liečiant paleisk simuliacinius testus Node aplinkoje.
- UI pakeitimai: bent node --check + rankinis Ramūno testas telefone.
- Testų technika, stub'ai ir lokali peržiūra — skill `testing`.

## Commit stilius
- Trumpos aiškios žinutės lietuviškai arba angliškai, pvz.:
  "Fix: varpelio paspaudimas (push kortelės pointer-events)".
- Vienas commit = vienas loginis pakeitimas. Commit'ink dažnai.
