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
1. GitHub Actions kör `scripts/import_laws.py` den 1 varje månad (och vid behov manuellt) och öppnar en pull request när något har ändrats. Beskrivningen listar nya, ändrade, borttagna och kommande paragrafer per författning.
2. `tests/test_editorial.js` kontrollerar att alla redaktionella rubriker i `assets/editorial.js` fortfarande pekar på befintliga paragrafer som inte är upphävda. En lagändring som flyttar en paragraf syns därför direkt som ett fel.
3. Redaktionella rubriker ligger bara i `assets/editorial.js` och påverkar aldrig själva lagtexten. Fler författningar läggs till i `data/catalog.json`.

## Version 0.6
- **55 författningar** (tidigare 14): alla balkar utom Handelsbalken samt lagar och förordningar för polis, domstol, åklagare, frihetsberövande, tvångsvård och specialstraffrätt. Katalogen är indelad i områden.
- **Hänvisningar** länkas i alla vanliga former: "21 kap. 3 a eller 3 b §", "1, 2, 5 eller 6 §", "1–4 §§", "6 kap. brottsbalken", "8 § första stycket 2 polislagen" och "samma balk". `tests/test_reference_coverage.js` mäter täckningen över all lagtext (98 %).
- **Menyknappen** ⋯ ligger längst till höger på paragrafraden.
- **Sökindex**: fritextsökningen går mot ett färdigbyggt index (`data/index`) och laddar bara de lagar som syns i träfflistan. Sökorden markeras i lagtexten.
- **Överstrykningar och samlingar**: markera text för att stryka under den i gult, grönt eller rosa, med valfri anteckning. Samla paragrafer i egna samlingar.
- **Hänvisat från**: varje paragraf visar vilka andra paragrafer som hänvisar till den.
- **Ändringsbevakning**: bevaka lagar (lagar med favoriter bevakas automatiskt). Under *Sparat* syns *Nytt sedan sist* och en tidslinje över kommande ändringar.
- Dela länk och kopiera kort hänvisning (t.ex. "RB 23:8 b") från paragrafmenyn. Svep åt sidan för att byta kapitel. Offline per område.
- Importen rättar kapitel med bokstav (t.ex. vapenlagen 1 a kap.) och kontrollerar att Riksdagens titel stämmer med katalogen innan en lag läggs in.

### Lägga till en lag
1. Lägg till en post i `data/catalog.json` med `sfs`, `name`, `type`, `aliases`, `area` och `check` (ett ord som måste finnas i Riksdagens titel).
2. Kör arbetsflödet *Kontrollera lagändringar*. Det hämtar lagen, bygger om `data/index` och öppnar en pull request med en ändringsrapport när lagtexten har ändrats.

## Version 0.7
- **Lagbokens ordning:** katalogen följer Sveriges Rikes Lag. Först grundlagarna, sedan balkarna, var och en med sina anslutande lagar och förordningar (t.ex. BrB → NSL, TBL, knivlagen; RB → FuK, delgivningslagen, häkteslagen), därefter polis, trafik, förvaltning och socialrätt. Ordningen styrs av `data/catalog.json` (`section` och `parent`).
- **91 författningar** (tidigare 58), bl.a. riksdagsordningen, vapen-, fängelse-, häktes-, körkorts-, utlännings-, alkohol- och sekretessförordningarna, polisens instruktion, LKN, LSO, LBE, fordonslagen, passlagen, socialtjänstlagen och HSL. Handelsbalken och kamerabevakningsförordningen finns inte i Riksdagens öppna data och saknas därför.
- **Kopplingar lag ↔ förordning:** under paragrafen visas *Kompletteras av …* (t.ex. RB 23:1 → FuK 1, 1 a §) och i förordningen *Kompletterar …*. Kopplingarna kommer dels från förordningarnas egna hänvisningar, dels från `data/relations.json` (kontrolleras av `tests/test_relations.js`). Lagens startsida visar anslutande förordningar.
- **Övergångsbestämmelser** ligger i en egen hopfälld del sist i lagen i stället för i sista paragrafens text.
- **Markeringar:** *Penna* i läsvyn – tryck på första och sista ordet. Tryck på en markering för färg, anteckning och borttagning direkt på plats. *Ångra* efter varje ändring. Senaste färgen kommer ihåg.
- **Anteckningar** skrivs direkt under paragrafen och sparas automatiskt. Under *Sparat* samlas markeringar och anteckningar per författning med sökning och färgfilter.
- **Jämför lydelser:** kommande lydelse visas med struken och ny text.
- **Fortsätt läsa**, **snabbhopp** (⌕ överallt, t.ex. ”rb 23 8b”), **sökfilter** (BrB m.fl., RB m.fl., Polis, Mina samlingar), synonymer (”LOB”, ”rattfylla”) och samlingar som text eller PDF.
- Texten ”Redaktionell rubrik” är borttagen. Kvalitetskontroller vid import: minskat antal paragrafer, tappade kapitel och ovanligt långa paragrafer flaggas i rapporten; `tests/test_data_quality.js` körs i CI.

## Version 0.8
- **130 författningar** (tidigare 91): bl.a. utlämningslagen, lagen om europeisk arresteringsorder, lagen om internationell rättslig hjälp i brottmål, lagen om alkoholutandningsprov, djurskydds-, jakt- och säkerhetsskyddslagen, delgivnings-, rättshjälps-, belastningsregister-, narkotikakontroll-, fordons- och passförordningen samt en ny avdelning för civilrätt, arbete och näringsliv (avtalslagen, köplagen, konsumentköplagen, preskriptionslagen, aktiebolagslagen, LAS, arbetsmiljölagen m.fl.).
- **Kopplingar på lagnivå:** en förordning kopplas till den lag den själv nämner i sina första paragrafer (t.ex. belastningsregisterförordningen → lagen om belastningsregister).
- **Ny appikon** (präglat ”LAG” i guld på grön pärm med stort § i präglingen). Ta bort appen från hemskärmen och lägg till den igen för att se den.
- **Uppdateringar direkt:** appen hämtar alltid senaste versionen när det finns internet och visar ”Ny version – tryck för att uppdatera”. Version och datum för lagdata står under *Inställningar*.
- **Animationer:** ingen grön blinkning längre. Korta övergångar mellan vyer, menyer som glider upp och kan dras ned, utfällning, märkpennedrag vid markering, platshållare vid laddning. Allt stängs av med iPhones *Reducera rörelse*.
- **Svep från vänsterkanten** för att gå tillbaka, **textstorlek med reglage**, val av **typsnitt** (rakt eller bok), **Mina genvägar** på startsidan, påminnelse om **säkerhetskopia**, förhandsvisning vid delning av länk och bättre stöd för VoiceOver.

## Version 0.9
- **154 författningar** (tidigare 130): bl.a. promulgationslagarna till BrB och RB, lagen om beräkning av strafftid, lagen om visst stöldgods, näringsförbud, medling med anledning av brott, lagen om internationellt polisiärt samarbete, betalningsföreläggande, skuldebrevslagen, konsumenttjänstlagen, produktansvarslagen, försäkringsavtalslagen, marknadsföringslagen, MBL, semester-, arbetstids- och föräldraledighetslagen, LOU, LSS, patientlagen, patientsäkerhetslagen och smittskyddslagen. Titelkontrollen stoppade tre felaktiga SFS-nummer som rättades före import.
- **Sök i författningen:** knappen *⌕ Sök* i läsvyn öppnar ett sökfält som fungerar som ”Sök på sidan”: antal träffar, pilar för föregående/nästa (även över kapitelgränser) och markerade sökord.
- **Rättad menyanimation:** menyerna glider nu upp jämnt. Tidigare skrev animationen över centreringen så att menyn låg fel en kort stund och sedan hoppade på plats.

## Version 0.9 – färdigställd
- **306 författningar** (154 i första utgåvan av 0.9), med tyngdpunkt på polis, domstol, process och rättigheter, och i övrigt i samma ordning som Sveriges Rikes Lag. Bland annat ingår den nya **vapenlagen och vapenförordningen (2026)**. Lagar som redan är upphävda tas bort automatiskt, och ett kommande upphävande visas överst i lagen. Långa bilagor, till exempel barnkonventionens text, ligger i en egen del som öppnas vid behov.
- **Balkarna och deras anslutande författningar:** alla balkar visas som vanliga rader i katalogen. De anslutande lagarna hänger under sin balk som grenar i ett träd, utan att man behöver trycka fram dem.
- **Lag och förordning hänger ihop på paragrafnivå.** Uttryckliga hänvisningar kopplas som tidigare. Nu kopplas också förordningsparagrafer under samma rubrik som ett avsnitt i lagen, till exempel *Vanlig delgivning* i delgivningsförordningen och delgivningslagen. Förordningar med samma namnstam som en lag kopplas också, som brottsskadeförordningen och brottsskadelagen.
- **Startar direkt:** appen och katalogen visas från sparade kopior, och nya versioner hämtas i bakgrunden. Är något nytt visas *Ny version – tryck för att uppdatera*. Appen startar även utan nät.
- **Statusfältet** överst på iPhone har samma färg som appens toppfält, så det blir ingen skarv.
- **Byggt för hela lagboken:** sökindexet är uppdelat i små delar som hämtas vid behov: paragrafregistret i block om 2 000 paragrafer och orden i delar om högst cirka 60 kB. Därför klarar appen hela Sveriges Rikes Lag utan att starten eller sökningen blir långsammare.
- **Animationer:** jämna övergångar, menyer som glider upp och kan dras ned, och tryckrespons på rader och knappar.
- **Sparat** visar markeringar och anteckningar först, sedan favoriter, samlingar och bevakning.
- **Annat:** kapitelöversikt för stora lagar, sökfilter på typ (lag, förordning) och balk, hantering av offlineutrymme, och ett webbläsartest i CI som kör de viktigaste flödena i iPhone-storlek.

## Version 1.0
- **Hela svensk lag i appen: 1 853 författningar.** Det är 1 766 av 1 770 gällande lagar i SFS, alltså 99,8 %, och därmed all lagtext i den stora blå lagboken. Riksdagens förteckning över hela SFS har gåtts igenom, och varje gällande lag har lagts in med sin lagtext. Fyra lagar saknar text hos Riksdagen.
- **Placerade som i Sveriges Rikes Lag:** först grundlagarna, sedan balkarna i lagbokens ordning med sina anslutande författningar, nu även Byggningabalken och Handelsbalken med avtalslagen, köplagen, skuldebrevslagen m.fl. Därefter kommer 14 rättsområden. Placeringarna föreslogs automatiskt utifrån titel och departement och granskades sedan; 342 rättades för hand (`data/placement.json`).
- **Förkortningar** för alla författningar som har en vedertagen förkortning: SkolL, DelgF, IL, ML, ÅRL, HB med flera, totalt 327 unika. De syns i katalogen och i lagens rubrik och fungerar som snabbkoder, till exempel *SkolL 7:2*. Ett test stoppar dubbletter.
- **Katalogen:** avdelningar som kan fällas ihop och bara ritas när de öppnas, så att starten är lika snabb med 1 853 författningar. Överst finns snabbval för avdelningarna och ett **register A–Ö**.
- **Täckningsmätare** under Inställningar: hur stor del av gällande lagar och författningar som finns i appen, räknat mot Riksdagens förteckning.
- **Lagar utan paragrafer**, till exempel skatteavtal som gäller som lag, visas som lagtext med avtalet som bilaga.
- **Hänvisningar:** långa uppräkningar som avslutas med lagens namn ("… 12 kap. 64 §, allt jordabalken") och "balken" i promulgationslagar länkas rätt.
- **Månatlig kontroll** hittar även nya lagar i SFS och föreslår dem för granskning. Offlinenedladdningen hämtar sex filer åt gången.
- Genvägsrutorna har samma bredd oavsett namnets längd.
