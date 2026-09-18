# Configurare Groq per PetNote

Il provider predefinito ora è **Groq**, non OpenAI. Non serve un abbonamento ChatGPT. Nessun errore, quota esaurita o modello indisponibile provoca un passaggio automatico a OpenAI o un upgrade del piano.

**Non promettiamo uso gratuito illimitato.** Verifica il piano e le quote effettive nel tuo account Groq: eventuali limiti gratuiti e disponibilità dipendono dall’account/modello e possono cambiare. La ricerca con strumenti ha condizioni e costi propri. L’app non può sapere se il tuo account è fatturato, non seleziona il piano e non impone un tetto in euro al provider.

## 1. Aggiorna il Codespace già esistente

Nel tuo Codespace, ferma il server con **Ctrl+C**. Assicurati di essere sul ramo `arena/01a0aba2-agente`, poi:

```bash
git pull --ff-only origin arena/01a0aba2-agente
npm ci
npm run build
```

Se Git segnala modifiche locali o divergenze, fermati: non usare reset forzati e non cancellare file. Il database `data/` e il file `.env` non sono versionati e non vanno eliminati. Questa modifica al codice non sostituisce la password del tuo Codespace.

## 2. Inserisci la chiave solo nel Codespace

Crea una chiave nel tuo account su **https://console.groq.com/keys**. Non usare un token GitHub: è un’altra credenziale.

Apri il file `.env` nel Codespace e aggiungi o aggiorna queste variabili, senza duplicare le righe e senza toccare `ADMIN_PASSWORD`, `APP_ORIGIN` o `DATA_DIR`:

```dotenv
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
GROQ_SEARCH_ENABLED=false
DAILY_AI_LIMIT=10
```

Scrivi la tua chiave dopo `GROQ_API_KEY=` **solo nel file privato**. Non mandarla in chat, screenshot, commit o issue. Puoi invece usare i secrets GitHub Codespaces limitati alla repository Agente: le variabili d’ambiente prevalgono sui valori di `.env`.

Il nome `openai/gpt-oss-20b` identifica un **modello open-weight eseguito da Groq**. Le chiamate vanno a `api.groq.com`, non a ChatGPT o all’API di OpenAI. Puoi scegliere un altro modello Groq compatibile con Structured Outputs in modalità strict; se non lo supporta, la richiesta fallisce senza cambiare modello o provider automaticamente.

Le vecchie variabili `OPENAI_API_KEY` e `OPENAI_MODEL` sono ignorate con `AI_PROVIDER=groq`. Se `AI_PROVIDER` è assente, il nuovo default è Groq: un vecchio Codespace configurato solo con chiave OpenAI risulterà non collegato finché non imposti Groq (oppure scegli esplicitamente OpenAI).

Riavvia:

```bash
npm start
```

## 3. Primo uso: bozze su strutture inserite da te

1. Accedi usando la password amministrativa già esistente.
2. Verifica e approva **Scheda PetNote**.
3. Aggiungi una struttura con fonte pubblica ed evidenze pertinenti in **Strutture**.
4. Apri la scheda e premi **Genera bozza IA**.
5. Rivedi il testo. Per approvarlo ed esportarlo restano obbligatori qualifica, richiesta pertinente o consenso documentato e recapito autorizzato.

Senza chiave le funzioni IA sono indisponibili, non simulate. «Groq configurato» indica solo la presenza delle variabili: la prima richiesta verifica effettivamente disponibilità, modello e quota. Nell’anteprima aperta tutte le chiamate IA restano bloccate, anche con chiave presente.

## 4. Ricerca web Groq: facoltativa e separata

Per le ricerche reali è integrato **`groq/compound-mini`**, che supporta una sola chiamata a uno strumento per richiesta. L’app abilita esclusivamente `web_search`: niente esecuzione di codice, visita arbitraria di URL o altri strumenti.

Dopo aver controllato disponibilità e condizioni economiche di Compound Mini nel tuo account, puoi impostare:

```dotenv
GROQ_SEARCH_ENABLED=true
```

Riavvia il server. Scegli **una sola struttura** per la prima prova. La ricerca può trovare meno risultati o zero; non si affida alla memoria del modello per inventare aziende.

L’importazione accetta soltanto URL presenti nei metadati `executed_tools[].search_results.results` restituiti da Groq. URL scritte dal modello nel testo o nel ragionamento non bastano. Restano attivi i filtri per regione/comune/segmento, la deduplica e il limite di cinque strutture. Una fonte non certifica identità, pertinenza o consenso: verifica sempre personalmente.

Compound non combina in questo connettore strumenti e Structured Outputs: viene richiesto JSON nel prompt e validato sul server. Se formato o fonti non sono utilizzabili, il lavoro fallisce senza importare dati e senza retry a pagamento.

## Limiti e trattamento dei dati

- Bozze: massimo **2.048 token di completamento**, JSON strict e validazione server-side.
- Ricerca: massimo **6.000 token di completamento**, Compound Mini con un solo strumento abilitato.
- Massimo iniziale **10 tentativi API al giorno UTC**, incluso un tentativo fallito dopo l’avvio. È un limite di richieste, non euro né token complessivi dei modelli interni di Compound.
- Una coda e un lavoro alla volta; timeout 120 secondi; nessun retry automatico, nessun replay al riavvio e nessun fallback.
- HTTP 429: attendi il ripristino della quota. Il sistema non acquista crediti e non passa a servizi a pagamento alternativi.
- Le bozze trasmettono offerta/vincoli e nome, segmento, comune, fonte ed evidenze commerciali della struttura. Email del contatto, documentazione del consenso e note interne non sono incluse come campi nel payload. Non inserire dati personali riservati o sanitari nelle evidenze.
- Valuta termini, conservazione e impostazioni privacy del tuo account Groq. Non è garantita conservazione zero; i servizi web di Compound coinvolgono strumenti esterni. Nessun dato dell’app sanitaria PetNote viene collegato.
- I token mostrati sono quelli riportati in `usage` dal provider; non sono una fattura completa dei consumi interni di Compound.

La ricerca e le bozze sono testate con risposte isolate di test. **Non è stata eseguita una chiamata live con una tua chiave né aggiornata da remoto la configurazione del tuo Codespace.**

## Fonti tecniche

- [Groq Structured Outputs e modelli compatibili](https://console.groq.com/docs/structured-outputs)
- [Groq Compound e Compound Mini](https://console.groq.com/docs/compound)
- [Strumenti abilitabili e condizioni economiche](https://console.groq.com/docs/compound/built-in-tools)
- [Metadati delle fonti di web search](https://console.groq.com/docs/tool-use/built-in-tools/web-search)
- [Rate limits](https://console.groq.com/docs/rate-limits) e [quote del tuo account](https://console.groq.com/settings/limits)
- [Prezzi Groq](https://groq.com/pricing)
