---
name: testing
description: SuperPadel testų technika — simuliaciniai logic.js testai, vm.runInThisContext su naršyklės/Firebase stub'ais, functions testai, lokali peržiūra. Naudok prieš rašant ar paleidžiant testus.
---

# SuperPadel testavimas

- Varikliai (logic.js): prieš liečiant generavimo logiką, paleisk simuliacinius
  testus Node aplinkoje (partnerių/varžovų balansas, raundų teisingumas).
- UI pakeitimai: bent node --check + rankinis Ramūno testas telefone.
- Lokali peržiūra: `python -m http.server 8000` repo šaknyje (arba npx serve;
  yra .claude/launch.json su npx serve -l 8000).
- Testų technika: vm.runInThisContext prieš tikrus failus su naršyklės/Firebase
  stub'ais. SVARBU: skripto viršaus let/const kintamieji gyvena bendroje
  globalioje leksinėje aplinkoje — testuose keisk juos PLIKAIS priskyrimais
  (currentUser = ...), NE per global.currentUser (property užgožiama).
- functions testams: TZ=UTC.
