# Lagboken

En mobilanpassad lagbok för iPhone, hostad med GitHub Pages utan externa JavaScript-ramverk.

Appen öppnas på https://deashi03.github.io/Lagbok/ **efter att Pages aktiverats och en lyckad deploy verifierats**. Installera från Safari via Dela → Lägg till på hemskärmen.

Huvudflikar: Lagbok & sök, Sparat. Version 0.2 har smarta sökförslag och snabbkoder (BrB 1, BrB 24:1, FuK 12). Från lagläsningen finns snabb sökning i hela den öppnade författningen. Polisens FAP finns från lagboksvyn och öppnas via en inbyggd visare av Polismyndighetens original-PDF (med extern reservlänk och krav på internet). Lagboksvyn har kapitel, ämnesindelning, innehållsförteckning och sammanhängande scroll. Favoriter, personliga anteckningar, senast öppnade, direkta lagrumshänvisningar, kopiering och textinställningar sparas lokalt i webbläsaren.

## Källor och juridisk varning

Lagtext hämtas från Sveriges riksdags öppna data och sparas separat i data/laws. Importerade dokument kan innehålla äldre eller framtida lydelser och övergångsbestämmelser. Den här appen fastställer inte vilken lydelse som gäller vid ett angivet datum och är inte en auktoritativ lagtextkälla. Kontrollera alltid originalet innan text används rättsligt.

## Import och publicering

python scripts/import_laws.py
python -m unittest discover -s tests -v

GitHub Actions "Kontrollera lagändringar" hämtar de första författningarna vid ändring av importskriptet och gör därefter schemalagda granskningsförslag. För publicering behöver repositoryägaren aktivera **Settings → Pages → Build and deployment → Deploy from a branch → main / (root)**. I offline-läge fungerar enbart dokument som webbläsaren redan hunnit cachelagra.

Källor: Sveriges riksdag, data.riksdagen.se, samt Polismyndighetens författningssamling. Fristående privat projekt.

## Version 0.3
Lugn läsdesign i mjukvitt, djupgrönt och diskret vinrött; kompakt läsläge, förbättrad sökrankning och förhandsvisning av interna lagrumshänvisningar. Referenser måste verifieras innan ett annat lagrum visas.
