# PetNote Partnership Agent

Un agente dedicato a **[PetNote](https://www.petnote.it/partner)**: ricerca veterinari e pet shop in tutta Italia, costruisce un archivio commerciale e prepara proposte di partnership gratuita da sottoporre a revisione umana.

**Non è più la console dimostrativa a 67 ruoli.** Il vecchio lavoro è recuperabile dalla cronologia Git, ad esempio dal commit `64edb99` o `b9e1dd2`. La repository dell’app PetNote non è stata modificata.

## Cosa fa questa versione

- **Archivio SQLite persistente**, inizialmente vuoto: strutture, fonti, evidenze, qualifica, base di contatto, bozze, lavori e registro.
- **Ricerca web reale su richiesta** attraverso OpenAI Responses + `web_search`. Massimo 5 strutture per lavoro, 3 chiamate allo strumento e 6.000 token di output per richiesta. Nessun crawler, acquisto di liste, scraping di PEC o raccolta automatica di email.
- Importa solo risultati con URL normalizzato presente nelle fonti/citazioni restituite dal provider e coerenti con i filtri. Deduplica nome + città normalizzati. **Una citazione non certifica l’identità o la veridicità: tutti i risultati IA restano da verificare.** Può trovare zero strutture.
- Genera **bozze contestualizzate**, usando la scheda PetNote approvata dal titolare. Il contenuto pubblico è trattato come non attendibile; resta necessaria la revisione contro allucinazioni e prompt injection.
- Approva/esporta il testo solo con scheda corrente approvata, struttura qualificata, recapito professionale e richiesta pertinente o consenso documentato. Le modifiche a struttura, testo o scheda revocano le approvazioni. L’opt-out blocca generazione, approvazione ed esportazione.
- Esporta l’archivio in CSV con protezione dalle formule e le bozze approvate in TXT.
- Una coda, un solo lavoro alla volta, budget iniziale di 10 richieste IA al giorno UTC. Sospensione e annullamento disponibili. **Nessun retry automatico**, nemmeno dopo un riavvio; le richieste fallite già iniziate contano nel limite.
- Accesso con password amministrativa, sessioni server-side di 8 ore, cookie HttpOnly/SameSite Strict, Secure in produzione, controllo dell’origine e limiti ai tentativi di accesso.

### Cosa NON fa

**Non invia email, PEC, WhatsApp, notifiche o campagne. Non esiste un endpoint di invio.** Non registra contatti esterni come avvenuti, non attribuisce attivazioni/Premium e non genera ricavi fittizi. Non accede a proprietari, animali, dati sanitari o al database PetNote.

**PayPal e push telefono sono già presenti in PetNote**, come confermato dal titolare; qui non vengono ricostruiti. Un futuro collegamento di eventi richiederà un’integrazione separata e autorizzata. I flussi autenticati, i pagamenti e le notifiche non sono stati verificati end-to-end da questo progetto.

## Avvio locale

Richiede **Node.js 22.13+** (testato con 22.22.3), npm e spazio scrivibile per SQLite. `node:sqlite` può emettere un avviso sperimentale su Node 22.

```bash
npm ci
cp .env.example .env
# Modifica .env sul tuo computer/server; non inserire segreti in Git o in chat.
# Imposta almeno ADMIN_PASSWORD (>= 12 caratteri).
npm run build
npm start
```

Apri `http://localhost:3000`. `APP_ORIGIN` deve corrispondere all’origine esatta usata dal browser. Senza password il server locale mostra le istruzioni, ma non espone l’archivio. Senza provider puoi usare l’archivio manuale e la scheda prodotto; ricerca e generazione non sono disponibili, **non simulate**.

### Sviluppo frontend

Due terminali:

```bash
# .env: APP_ORIGIN=http://localhost:5173
npm run server
npm run dev
```

Apri `http://localhost:5173`. Vite inoltra `/api` al backend, senza URL localhost nel codice del browser. L’host `.e2b.app` è consentito per le anteprime Arena. Per un’anteprima autenticata imposta `APP_ORIGIN` all’URL HTTPS effettivo della preview, non a un vecchio indirizzo sandbox.

### Anteprima aperta, senza IA

`DEV_AUTH_BYPASS=true` è consentito **solo fuori dalla produzione** e toglie il login. L’anteprima:

- blocca sempre ogni chiamata IA, anche con chiavi configurate;
- usa il database separato `DATA_DIR/preview-only.sqlite`, mai `petnote.sqlite`;
- non contiene dati di esempio iniziali;
- è pubblicamente modificabile: **non inserire dati riservati o recapiti reali**.

Non è una modalità di esercizio. Le modifiche nell’anteprima non confluiscono nel database protetto.

## Collegare la ricerca e le bozze reali

Configura esclusivamente nell’ambiente del server:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=
DAILY_AI_LIMIT=10
DEV_AUTH_BYPASS=false
```

Inserisci la tua chiave e scegli esplicitamente un modello dell’account compatibile con **Responses, web_search e Structured Outputs**. Non viene imposto un modello predefinito né eseguita una chiamata di test a pagamento all’avvio. Lo stato «provider configurato» significa soltanto che le variabili sono presenti.

Il connettore chiama `https://api.openai.com/v1/responses` con `store:false`, timeout di 120 secondi e nessun retry. `store:false` **non è una garanzia di zero conservazione presso il provider**: verifica contratto, impostazioni e trattamento dei dati del tuo account. Non vengono trasmessi password, email del partner, documentazione del consenso, note interne o dati sanitari; nella bozza passano nome, segmento, città, fonte ed evidenze commerciali e la scheda prodotto.

Il limite giornaliero riguarda **tentativi API**, non euro e non singole ricerche interne allo strumento. Imposta anche i limiti di spesa nel pannello del provider. Token riportati e registro non sostituiscono la fatturazione. Annullare una richiesta non rimborsa costi già maturati.

## Primo ciclo operativo

1. Accedi al server protetto. In **Scheda PetNote**, verifica l’offerta e approvala. Nessuna promessa di commissioni, risultati garantiti o funzionalità illimitate.
2. In **Panoramica**, avvia una ricerca da **1 struttura** e controlla il registro. Errori, risultati scartati e duplicati sono espliciti.
3. In **Strutture**, apri la fonte e verifica attività, sede e pertinenza. Qualifica solo dopo la verifica umana.
4. Richiedi una bozza. Si può preparare un testo interno anche prima di documentare una base di contatto, ma non approvarlo/esportarlo.
5. Documenta solo una richiesta realmente ricevuta e pertinente oppure un consenso valido (origine, data, ambito) e il relativo recapito professionale. Un sito pubblico o un indirizzo email non autorizzano il marketing.
6. Rivedi il testo in **Bozze e approvazioni**. Conferma la revisione; scarica il TXT. **Nessun messaggio viene inviato dal sistema.**

La registrazione del consenso è un’attestazione dell’amministratore, non una verifica giuridica automatica. Non usare la funzione per giustificare contatti non autorizzati.

## Pubblicazione

**GitHub Pages non esegue Node, SQLite o lavori IA.** La pagina statica alla radice e quella in `/docs` annunciano il ritiro della vecchia demo e rimandano alle istruzioni; non fingono di essere l’agente attivo. La configurazione Pages esistente (branch di sessione, radice `/`) può restare invariata.

Per usare l’agente serve un server HTTPS con disco persistente. Vedi **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** per Docker, variabili, backup e controlli prima della messa in esercizio. Non è stato creato automaticamente un servizio di hosting esterno.

## Test e struttura

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

- `server/domain.js`: validazione, normalizzazione, regole di approvazione.
- `server/store.js`: SQLite, persistenza, sessioni, registro e budget.
- `server/provider.js`: connettore Responses e controllo delle fonti.
- `server/agent.js`: coda, annullamento, budget e importazione transazionale.
- `server/app.js`: API autenticata ed esportazioni; `server/index.js`: avvio.
- `web/`: workspace italiano responsive, senza SDK/chiavi del provider nel browser.
- `tests/`: unitari, integrazione API e browser. Il provider nei test è una fixture isolata; nessuna chiamata a pagamento.

### Automazione GitHub opzionale

La configurazione dei test è disponibile in [`docs/ci-workflow.example.yml`](docs/ci-workflow.example.yml), ma non è attiva come GitHub Actions: l’integrazione corrente non dispone del permesso `workflows`. Dopo aver aggiornato/ricollegato GitHub in Arena con quel permesso, puoi installarla in `.github/workflows/ci.yml`. I test locali non dipendono da questa automazione.

## Limiti della prima versione

Un amministratore, una singola istanza/processo Node, un solo database locale. Niente ruoli multiutente, Redis, scheduler periodico, sincronizzazione CRM, gestione allegati del consenso, antivirus, attribuzione di conversioni o messaggistica. Deduplicazione per nome/città, non per partita IVA. Il registro è operativo e modificabile da chi controlla il server, **non un audit immutabile**.

Non è una certificazione di sicurezza o conformità GDPR. Prima di caricare dati commerciali reali definisci responsabilità, conservazione, gestione delle opposizioni e backup; usa un recapito professionale autorizzato e non inserire dati sanitari. Il database contiene dati commerciali e sessioni: proteggi disco, backup e accesso al server. La prima verifica con un provider reale e la pubblicazione su hosting definitivo richiedono una configurazione sicura del titolare.
