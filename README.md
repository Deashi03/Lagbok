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

## Version 0.4
Läsaren har en enda innehållsknapp, utan föregående/nästa länkar eller verktygsrader mellan kapitelrubrik och lagtext. Paragrafnumret öppnar åtgärder. Innehållsförteckningen skrollar vertikalt, grupperar flera paragrafer under relevanta rubriker och visar särskilda ämnesetiketter i prioriterade kapitel. Övriga paragrafer får korta textutdrag när granskad redaktionell rubrik saknas. RB 28:1: **Reell husrannsakan**; RB 28:2: **Personell husrannsakan**.

## Version 0.5
- **Rätt lydelse.** Paragrafer med flera lydelser delas upp i separata versioner med datum för ikraftträdande och upphörande. Appen visar den lydelse som gäller i dag. Kommande lydelser ligger hopfällda under paragrafen och byts automatiskt in när datumet passeras. Ett obestämt datum ("den dag som regeringen bestämmer") räknas aldrig som inträffat.
- **Ren lagtext.** Ändringshänvisningen ("Lag (2026:253).") visas som en egen rad och upphävda paragrafer visas kompakt.
- **Direkta hänvisningar.** Ett tryck på en hänvisning öppnar lagrummet direkt, även i en annan författning (t.ex. *10 § polislagen (1984:387)*). Knappen *Tillbaka till …* tar dig tillbaka till samma ställe.
- **Kapitel och avsnitt.** I kapitellistan visar kapitel med rubriker sina avsnitt, så att du kan välja direkt t.ex. *28 kap. RB → Kroppsvisitation och kroppsbesiktning*. Samma rubriker visas i innehållsförteckningen och i lagtexten. Paragrafer i prioriterade kapitel (BrB 3, 4, 8, 9, 12, 17, 23, 24 och RB 24, 28) har en kort rubrik bredvid paragrafnumret.
- **Offline och säkerhetskopia.** Under *Inställningar* kan du ladda ner alla lagar för offlineläsning och exportera eller importera favoriter och anteckningar.
- iPhone-ikon för hemskärmen.

### Så uppdateras lagtexten
1. GitHub Actions kör `scripts/import_laws.py` varje vardag och öppnar en pull request när något har ändrats. Beskrivningen listar nya, ändrade, borttagna och kommande paragrafer per författning.
2. `tests/test_editorial.js` kontrollerar att alla redaktionella rubriker i `assets/editorial.js` fortfarande pekar på befintliga paragrafer som inte är upphävda. En lagändring som flyttar en paragraf syns därför direkt som ett fel.
3. Redaktionella rubriker ligger bara i `assets/editorial.js` och påverkar aldrig själva lagtexten. Fler författningar läggs till i `data/catalog.json`.
