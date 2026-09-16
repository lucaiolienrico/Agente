# Agente

Dashboard italiana per un team commerciale di **67 agenti in 8 reparti**, con interfaccia responsive e simulazione interattiva. Realizzata con JavaScript e Vite, senza backend.

## Avvio

Richiede Node.js 20.19+ oppure 22.12+.

```bash
npm ci
npm run dev
```

Il server ascolta su `0.0.0.0:5173`; gli host di anteprima `*.e2b.app` sono autorizzati. Per la versione distribuibile:

```bash
npm run build
npm run preview
```

## Cosa funziona

- Panoramica con KPI dimostrativi e confronto tra due periodi di esempio.
- Otto reparti consultabili con 67 identità stabili e responsabilità distinte.
- **Gestione agenti**: ricerca, filtro per reparto e stato, selezione multipla, pausa individuale o di gruppo.
- Incarico corrente, istruzioni operative e priorità modificabili per ciascun agente.
- Ciclo manuale fino a cinque incarichi, con precedenza per priorità e ID e rispetto della pausa globale.
- Approvazione/rigetto degli esiti sensibili e riapertura esplicita degli incarichi completati.
- Contatori dinamici della console, registro degli ultimi 300 eventi ed esportazione JSON.
- Report operativo dettagliato in Markdown, con inventario completo, contatori, incarichi e registro.
- Pausa/ripresa persistente della simulazione.
- Creazione e modifica del profilo campagna (settore, area e limite giornaliero).
- Ricerca dei contatti per azienda, persona, settore e città, combinata con filtro per stato.
- Dettaglio contatto, bozza personalizzata copiabile e modifica dello stato.
- Ciclo demo manuale che qualifica il primo contatto ancora da qualificare.
- Agenda dimostrativa navigabile per giorno.
- Esportazione CSV della lista filtrata e report testuale di dieci righe.
- Notifiche illustrative, guida rapida e informazioni sulle integrazioni mancanti.
- Salvataggio di campagna, contatti e stato pausa nel `localStorage` del browser.

I KPI di panoramica sono aggregati illustrativi, non calcolati dai sei contatti del campione. L'agenda contiene appuntamenti illustrativi indipendenti dagli stati modificabili della pipeline. Il periodo demo è il 14–20 settembre 2026.

## Ripartizione

| Reparto        | Agenti | Giorno      |
| -------------- | -----: | ----------- |
| Ricerca        |     12 | Lunedì      |
| Qualifica      |      9 | Martedì     |
| Messaggi       |     15 | Mercoledì   |
| Risposte       |      8 | Giovedì     |
| Agenda         |      5 | Venerdì     |
| Nutrimento     |      7 | Sabato      |
| Apprendimento  |      7 | Domenica    |
| Orchestrazione |      4 | Ogni giorno |
| **Totale**     | **67** |             |

Il brief elenca sette reparti operativi che sommano 63 agenti. I quattro ruoli dell'ottavo reparto sono: distribuzione del lavoro, limiti e deduplicazione, controllo anomalie, report del lunedì.

## Confini della demo

**Le schede rappresentano ruoli progettati, non 67 processi IA autonomi in esecuzione.** Non vengono effettuati scraping, chiamate a modelli IA, invii email o prenotazioni. Tutti i contatti sono fittizi e gli indirizzi usano domini riservati `.example`. Non inserire dati personali reali o credenziali in questa versione.

Le regole di follow-up dopo almeno tre giorni, un solo contatto giornaliero per destinatario, nutrimento ogni quattordici giorni, revisione del tono e report del lunedì alle 08:00 sono specifiche illustrate nell'interfaccia, **non job pianificati in esecuzione**. Le preferenze di invio sono soltanto salvate localmente. Il collegamento di servizi esterni è dichiaratamente indisponibile.

### Prima della produzione

1. Backend autenticato, database, gestione ruoli e secret manager lato server.
2. Connettori a fonti autorizzate; rispetto dei termini delle piattaforme, della base giuridica e delle norme applicabili alle comunicazioni commerciali.
3. Motore di orchestrazione con code, scheduler, idempotenza e registri di audit.
4. Esecutori IA con strumenti autorizzati e revisione umana delle bozze/anomalie.
5. Email via OAuth/API, lista di soppressione, disiscrizioni, deduplicazione e limiti applicati lato server.
6. Calendario reale con gestione del fuso orario, verifica atomica degli slot e conferme.
7. Metriche da eventi reali, monitoraggio, retention e procedure di cancellazione dati.

## Test

```bash
npm test                       # 17 test unitari
npx playwright install chromium
npm run test:e2e                # 15 test browser, inclusa navigazione mobile
```

Playwright riutilizza un server Vite attivo sulla porta 5173 oppure ne avvia uno per i test. È possibile impostare `CHROMIUM_PATH` per usare un browser già installato.

## Struttura

- `src/data.js`: reparti, contatti fittizi, filtri e report.
- `src/main.js`: interfaccia, navigazione, modali e interazioni.
- `src/agents.js`: catalogo, ripristino dei dati, macchina a stati, audit e report dettagliato.
- `src/agent-console.js`: console di gestione, editor, selezioni e report operativo.
- `src/agent-console.css`: layout e componenti della console.
- `docs/REPORT_DETTAGLIATO.md`: report di consegna con baseline e inventario.
- `src/style.css`: design system e layout responsive.
- `tests/`: test unitari e browser.

Font: DM Sans e Manrope da Google Fonts, con fallback sans-serif. Tutte le icone sono SVG inline.

## Utilizzare la console agenti

1. Apri **Gestione agenti** dal menu laterale.
2. Filtra per reparto o cerca un ID (es. `MES-01`).
3. Premi **Gestisci**, assegna l'incarico e salva istruzioni e priorità.
4. Esegui l'incarico salvato, oppure seleziona più agenti e avvia un ciclo (massimo cinque).
5. Gli esiti di Messaggi, Risposte, Agenda e Nutrimento passano in **Da approvare**. Approvare non invia nulla; respingere rimette in coda.
6. Consulta **Registro attività** e **Report operativo**; scarica lo snapshot `.md` dello stato attuale.

Le istruzioni sono memorizzate, non interpretate da un modello. Gli output sono riepiloghi deterministici del passaggio nel simulatore. Il registro è locale e riguarda la console e l'interruttore globale, non tutte le operazioni dell'app.

La migrazione dei salvataggi precedenti aggiunge le 67 configurazioni mancanti senza cancellare campagna e contatti. Un agente ha una sola assegnazione corrente. Le modifiche a incarico/istruzioni riaprono il workflow; i contatori sono cumulativi. Cambiare un filtro azzera la selezione multipla, per evitare azioni involontarie su righe nascoste. La pausa globale conserva le pause individuali.

Per azzerare la demo, rimuovere la chiave `agente-v1` dal localStorage tramite gli strumenti del browser (operazione distruttiva: esportare prima il report e il registro). Non è disponibile l'importazione dei file esportati.

## Pubblicazione su GitHub Pages

La versione distribuibile per Pages si genera con `npm run build:pages` e viene scritta in `docs/`, con base URL `/Agente/`. `docs/index.html`, `docs/assets/` e `docs/.nojekyll` sono intenzionalmente versionati per la pubblicazione dalla cartella `/docs`; il report esistente viene preservato.

Il sito deve utilizzare il ramo **arena/01a0aba2-agente**, senza modificare `main` o creare altri rami. Per attivarlo occorre un amministratore in **Settings → Pages → Deploy from a branch → arena/01a0aba2-agente → /docs**. La connessione Arena ha restituito HTTP 403 per l'attivazione automatica: la presenza della build non certifica che il sito sia online.

Istruzioni complete: [Pubblicazione](docs/PUBBLICAZIONE.md). Dopo ogni modifica al frontend, rigenerare e caricare anche la build statica.

`npm run test:pages` esegue due test aggiuntivi sulla versione pubblicabile (asset con prefisso, link diretto, console, mobile e report), separati dai 17 test unitari e 15 test browser dell'app. Per un Chromium già installato è supportata la variabile `CHROMIUM_PATH`.
