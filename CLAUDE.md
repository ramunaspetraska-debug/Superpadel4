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

Backend: Firebase Realtime Database + FCM push + Cloud Functions (v2, Node 22).
Projektas: padelio-turnyrai, regionas europe-west1, Blaze planas.
Pagrindinės DB šakos: padelio_global_tournaments (turnyrai),
padelio_global_players + padelio_global_players_photos (žaidėjai ir bendros
nuotraukos — nuotrauka įkelta bet kur matoma visur), padelio_pro_master
(kambariai; {room}_photos vaikai), padelio_clubs (klubai: city, description,
canOfficial, legacyOwner), padelio_club_admins, padelio_email_links
(emailKey→playerId), padelio_user_tournaments, padelio_user_clubs (sekami
klubai), padelio_push_tokens/padelio_push_sent, padelio_notifications,
padelio_rooms (mėgėjų ELO), padelio_room_seq, padelio_archive_turnyrai.

## Sistemos būsena (2026-07-11, cache v285, APP_VERSION v212 / V231, registras.css?v=14)
- MOKAMI TURNYRAI: admin formose jungiklis „Mokamas turnyras" (t.paid, fee €/žaidėjui,
  payDeadlineHours 12/24/48/0=iki reg. pabaigos; struktūrizuoti rekvizitai
  payRecipient/payIban/payPhone, senas payInfo — tik fallback; payCashAllowed;
  payStripeEnabled). Registracija sukuria t.payments[payKey(entry)]=
  {entry,status:'pending',method:'manual',amount,deadline} (pora — 2x fee).
  payKey keičia [.#$/[]] → ','. Terminas VISADA <= registracijos uždarymo
  (paymentDeadlineMs min logika). Žaidėjo instrukcijos (openPaymentInstructions):
  rekvizitai su copy mygtukais, „Pažymėti: apmokėjau" (pay.claimed — serveris
  NEšalina, adminas mato 🔔), grynieji (method='cash', be termino, serveris
  nešalina), Stripe mygtukas. Adminas tvirtina per 💶 modalą. Serveris kas 15 min:
  enforcePaymentDeadlines (šalina pavėlavusius ne-claimed/ne-cash + priminimo push
  likus ~2h), closeRegistrations pirmiausiai šalina neapmokėjusius (be cash/claimed).
- STRIPE (apmokėjimas iš karto registruojantis): functions createStripeCheckout /
  verifyStripeSession (?paysession= grįžimas) / stripeWebhook (checkout.session.
  completed → markStripePaid + push). Sumą skaičiuoja SERVERIS iš DB. Raktai —
  Cloud Functions secrets STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (be jų —
  503, klientas fallback'ina į pavedimą). Kliente STRIPE_FN_BASE +
  startStripeCheckout/handleStripeReturn (registras_tournaments.js).
- TV REZIMAS: registras.html?tv=1[&club=ID][&room=X] (registras_tv.js) — gyvi
  kortu rezultatai vykstant turnyrui arba karusele: 6 reitingu lygiai + programos
  REKLAMOS skaidre su QR (renderTvAd) po kiekvieno rato (~kas 1,5 min). Admin
  apzvalgoje TV nuoroda + adminDownloadBackup (JSON i kompiuteri). Serveris:
  dailyBackup (03:40, padelio_backups/{data}, 14d; nuotraukos — sekmadieniais i padelio_backups_photos, 3 kopijos) ir emailReminders (24h/3h
  laiskai per Gmail SMTP; secrets EMAIL_USER/EMAIL_PASS — be ju tyliai skip).
  registrationEmail — DB trigeris ant padelio_user_tournaments: registracijos
  laiskas su turnyro info, gmaps nuoroda, partneriu ir apmokejimo busena;
  markStripePaid siuncia ir laiska. userClubsInit/userTournamentsInit turi
  klaidos callback su auth-retry (sekimu dingimo po refresh fix).
- PUSH FIX: requestPushPermission/pushSilentRefresh laukia pushAuthReady()
  (auth atstatymo) ir rodo DB iraso klaidas — anksciau tokenas tyliai
  neisirasydavo ir vartotojas matydavo „ijungta“ be raktu serveryje.
- E-teisejavimas: highlightMyCourt — zaidejo kortas atidaromas automatiskai,
  juosta „Jusu macas — Kortas N“. Treniruotems: klipu palyginimas greta
  (toggleCompare/openComparePlayer, ⚖ mygtukai galerijose).
- CHATAS: padelio_chat/{clubId} — klubu pokalbiai (registras_chat.js, 💬 mygtukai
  klubu sarase ir profilyje), seek skelbimai (type=seek, {level,date,time}),
  trinti gali tik klubo adminas (DB rules), limitToLast(100).
- Admin dalyviu valdymas: openParticipantsModal (👥 mygtukas) — salinti dalyvius/
  rezerva. Partnerio pridejimas PO registracijos: completePairRegistration
  konvertuoja individualu irasa i pora (mokamame perskaiciuoja suma — jei uz save
  apmoketa, lieka partnerio dalis); openRemovePartnerModal — atsaukti tik partneri.
- Kambarių prieiga generatoriuje laukia auth atstatymo (authEmailReady, storage.js) —
  be jo klubo adminas gaudavo „TIK PERŽIŪRA". Turnyro dalinimasis: ?t=ID deep link.
- Prisijungimai: TIK el. pašto nuorodos (Firebase Auth email-link, be slaptažodžių).
  Telefono/PIN 7030 sistemos PAŠALINTOS. emailKey() = el. paštas mažosiomis,
  [.#$[]/] → ','. Sesija bendra tarp index.html ir registras.html (ta pati kilmė).
- Multi-tenancy: kiekvienas klubas turi savo admin paskyras (padelio_club_admins),
  klubo adminas mato tik savo klubo turnyrus/kambarius.
- Oficialūs turnyrai (lygos ELO): kurti gali TIK klubai su canOfficial=true,
  kurį suteikia tik platformos savininkas per generatoriaus „Platform statistics"
  ekraną (superadmin — atpažįstamas pagal el. paštą, be slaptų kodų).
- Kambariai: klubo kambariai (official) — redaguoja tik klubo adminai; draugų
  kambariai — savininkas + pasirinktinai 4 skaitmenų PIN. E-teisėjas = turnyro
  vėliavėlė portalo admin'e (nebe atskiras prisijungimas).
- DB saugumo taisyklės ĮDIEGTOS serveryje (database.rules.json repo šaknyje):
  skaitymas daugiausia viešas, rašymas auth-gated; owner taisyklės per
  padelio_email_links lookup; padelio_user_clubs/padelio_user_tournaments —
  tik savininkas. Atsarginė kopija: rollback taisyklės buvo scratchpad'e.
- Registracija: neribota (max=0), Cloud Function closeRegistrations uždaro
  ~1 val. prieš startą (regCloseMins), apkarpo iki pilnų kortų (žingsnis 4 arba
  2 pagal formatą), atmestieji → rezervo priekis + push pranešimas.
- Klubų puslapis portale (namelio ikona, page-home): miestų filtras, sekimas
  be limitų („⭐ Sekti" mėlynas / „✓ Sekamas" žalias, optimistinis atnaujinimas),
  kalendoriaus filtras „Mano klubai", laiko konfliktų įspėjimai registruojantis
  (persidengimas arba <180 min tą pačią dieną). Profilio „Mano klubai" pildosi
  per userClubsInit(), kuris prijungiamas updateAuthUI() metu (kiekvieną
  prisijungimą) — NE tik puslapio starto metu.
- Cloud Functions: tournamentReminders (priminimai dieną/valandas prieš),
  closeRegistrations, spotOpened (atsilaisvinus vietai), cleanupHighlights
  (naktinis 7 d. klipų valymas DB + Storage, našlaičiai po 1 d.). Vilniaus
  laiko juostos helper'iai funkcijose (vilniusTimeToMs ir kt.).
- Filmavimas (2026-07-10 pertvarkyta): registras_cam.js — VIENAS master
  MediaRecorder (1s gabaliukai) aptarnauja pilną įrašą, highlight klipus
  (pre-roll iš buferio) ir 15s atsukimą; jautrumo mygtukai (localStorage
  camSensitivity) + fono kalibracija 4s; klipų miniatiūros (captureThumb),
  Web Share dalinimasis. Highlights galerija portale: LIVE modale mygtukas
  → padelio_highlights/{room} klipai (žiūrėti/dalintis/parsisiųsti).
  WebRTC: PIN tikrina SIUNTĖJAS (offer'e pin, atsakymas rejected; PIN DB
  nebesaugomas), ICE su Open Relay TURN (perrašoma per padelio_config/
  iceServers), QR kodas transliacijos lange (js/vendor/qrcode.js).
  Korto peržiūra: fullscreen bakstelėjus, garsas vienai kamerai,
  „Atsukti visas" (visų kamerų 15s viename lange). Storage taisyklės
  storage.rules (highlights/ video iki 10MB, rašymas tik auth).
- Laukiantys darbai: Ramūnas turi užpildyti savo klubo miestą per „Klubo
  informacija"; naujiems klubams canOfficial tvirtinamas per Platform statistics.

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
- Lokali peržiūra: `python -m http.server 8000` repo šaknyje (arba npx serve;
  yra .claude/launch.json su npx serve -l 8000).
- Testų technika: vm.runInThisContext prieš tikrus failus su naršyklės/Firebase
  stub'ais. SVARBU: skripto viršaus let/const kintamieji gyvena bendroje
  globalioje leksinėje aplinkoje — testuose keisk juos PLIKAIS priskyrimais
  (currentUser = ...), NE per global.currentUser (property užgožiama).
- functions testams: TZ=UTC. Firebase CLI Git Bash'e: MSYS_NO_PATHCONV=1
  (kitaip „Path must begin with /"); STDIN neveikia Windows — naudok --data.

## Commit stilius
- Trumpos aiškios žinutės lietuviškai arba angliškai, pvz.:
  "Fix: varpelio paspaudimas (push kortelės pointer-events)".
- Vienas commit = vienas loginis pakeitimas. Commit'ink dažnai.
