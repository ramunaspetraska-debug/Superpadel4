Atlik pilną SuperPadel deploy procedūrą griežtai šia tvarka:

1. Paleisk `git status` ir išvardink pakeistus failus.
2. Paleisk `node --check` KIEKVIENAM pakeistam .js failui. Jei bent viena
   klaida — SUSTOK, parodyk klaidą lietuviškai ir nieko ne'commit'ink.
3. Jei tarp pakeistų failų yra html/js/css — perskaityk sw.js CACHE_NAME
   ir bump'ink versiją (+1).
4. Jei keitėsi css/registras.css — bump'ink ?v=N registras.html.
5. Jei keitėsi generatoriaus failai — bump'ink js/config.js APP_VERSION
   ir index.html versijos žymę (VNNN) sinchroniškai.
6. Trumpai lietuviškai paaiškink, ką keiti ir kodėl.
7. `git add -A`, commit su aiškia žinute, `git push`.
8. Pabaigoje primink: patikrinti www.superpadel.lt po ~1 min ir telefone
   visiškai uždaryti/atidaryti PWA.
