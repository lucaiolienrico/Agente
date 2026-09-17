# Agente — Report dettagliato di consegna

**Data di consegna: 16 settembre 2026**

**Aggiornamento successivo:** il target predefinito è ora veterinari, pet shop e negozi di animali in tutta Italia. Vedi [Profilo clienti](PROFILO_CLIENTI.md). I numeri e la campagna generica di questo documento restano la baseline storica iniziale; il report esportato dalla console riflette invece lo stato corrente.

**Ambito:** nuova console Gestione agenti, report operativo e test di regressione.

> Questo documento fotografa la configurazione iniziale del progetto, non legge lo stato del browser dell’utente. Per un report aggiornato alle proprie azioni, aprire Gestione agenti → Report operativo → Scarica report .md. Nessun numero qui riportato rappresenta un risultato di vendita reale.

## 1. Sintesi esecutiva

La dashboard gestisce 67 schede agente in 8 reparti. È un simulatore locale, non una rete di processi IA autonomi. Gli indicatori seguenti derivano dalla configurazione iniziale ricostruita dal codice. Nell’esportazione dalla dashboard derivano invece dallo stato locale effettivo del browser.

- Campagna configurata: Nuovi clienti · Italia.
- Settore: Servizi B2B. Area: Italia.
- Interruttore globale: simulazione abilitata.
- Agenti effettivamente abilitati: 67; sospesi: 0.
- Incarichi in coda: 67, di cui eseguibili: 67.
- Esiti in attesa di revisione: 0.
- Esecuzioni demo cumulative: 0; completamenti cumulativi: 0.
- Limite giornaliero configurato: 40. È una preferenza, non un limite applicato a un servizio reale.
- Chiamate a modelli IA: 0. Email reali inviate: 0. Prenotazioni reali: 0.

## 2. Ripartizione per reparto

| Reparto        | Giorno      | Agenti | Abilitati effettivi | In coda | Da approvare | Completamenti cumulativi |
| -------------- | ----------- | -----: | ------------------: | ------: | -----------: | -----------------------: |
| Ricerca        | Lunedì      |     12 |                  12 |      12 |            0 |                        0 |
| Qualifica      | Martedì     |      9 |                   9 |       9 |            0 |                        0 |
| Messaggi       | Mercoledì   |     15 |                  15 |      15 |            0 |                        0 |
| Risposte       | Giovedì     |      8 |                   8 |       8 |            0 |                        0 |
| Agenda         | Venerdì     |      5 |                   5 |       5 |            0 |                        0 |
| Nutrimento     | Sabato      |      7 |                   7 |       7 |            0 |                        0 |
| Apprendimento  | Domenica    |      7 |                   7 |       7 |            0 |                        0 |
| Orchestrazione | Ogni giorno |      4 |                   4 |       4 |            0 |                        0 |

I sette reparti operativi sommano 63 agenti. I quattro orchestratori portano il totale a 67. I giorni rappresentano l'organizzazione proposta, non uno scheduler attivo.

## 3. Inventario completo degli agenti

| ID     | Reparto        | Responsabilità                    | Stato effettivo | Priorità | Incarico attuale                                                    | Fase    | Esecuzioni | Completamenti |
| ------ | -------------- | --------------------------------- | --------------- | -------- | ------------------------------------------------------------------- | ------- | ---------: | ------------: |
| RIC-01 | Ricerca        | Profilo cliente ideale            | Abilitato       | Normale  | Prepara un esempio dimostrativo: profilo cliente ideale.            | In coda |          0 |             0 |
| RIC-02 | Ricerca        | Ricerca siti aziendali            | Abilitato       | Normale  | Prepara un esempio dimostrativo: ricerca siti aziendali.            | In coda |          0 |             0 |
| RIC-03 | Ricerca        | Analisi annunci                   | Abilitato       | Normale  | Prepara un esempio dimostrativo: analisi annunci.                   | In coda |          0 |             0 |
| RIC-04 | Ricerca        | Registri aziendali                | Abilitato       | Normale  | Prepara un esempio dimostrativo: registri aziendali.                | In coda |          0 |             0 |
| RIC-05 | Ricerca        | Profili professionali autorizzati | Abilitato       | Normale  | Prepara un esempio dimostrativo: profili professionali autorizzati. | In coda |          0 |             0 |
| RIC-06 | Ricerca        | Ricerca geografica                | Abilitato       | Normale  | Prepara un esempio dimostrativo: ricerca geografica.                | In coda |          0 |             0 |
| RIC-07 | Ricerca        | Segnali di crescita               | Abilitato       | Normale  | Prepara un esempio dimostrativo: segnali di crescita.               | In coda |          0 |             0 |
| RIC-08 | Ricerca        | Mappatura tecnologie              | Abilitato       | Normale  | Prepara un esempio dimostrativo: mappatura tecnologie.              | In coda |          0 |             0 |
| RIC-09 | Ricerca        | Analisi concorrenti               | Abilitato       | Normale  | Prepara un esempio dimostrativo: analisi concorrenti.               | In coda |          0 |             0 |
| RIC-10 | Ricerca        | Deduplicazione aziende            | Abilitato       | Normale  | Prepara un esempio dimostrativo: deduplicazione aziende.            | In coda |          0 |             0 |
| RIC-11 | Ricerca        | Verifica delle fonti              | Abilitato       | Normale  | Prepara un esempio dimostrativo: verifica delle fonti.              | In coda |          0 |             0 |
| RIC-12 | Ricerca        | Composizione lista prospect       | Abilitato       | Normale  | Prepara un esempio dimostrativo: composizione lista prospect.       | In coda |          0 |             0 |
| QUA-01 | Qualifica      | Verifica del settore              | Abilitato       | Normale  | Prepara un esempio dimostrativo: verifica del settore.              | In coda |          0 |             0 |
| QUA-02 | Qualifica      | Dimensioni aziendali              | Abilitato       | Normale  | Prepara un esempio dimostrativo: dimensioni aziendali.              | In coda |          0 |             0 |
| QUA-03 | Qualifica      | Identificazione decisore          | Abilitato       | Normale  | Prepara un esempio dimostrativo: identificazione decisore.          | In coda |          0 |             0 |
| QUA-04 | Qualifica      | Verifica del ruolo                | Abilitato       | Normale  | Prepara un esempio dimostrativo: verifica del ruolo.                | In coda |          0 |             0 |
| QUA-05 | Qualifica      | Segnali di acquisto               | Abilitato       | Normale  | Prepara un esempio dimostrativo: segnali di acquisto.               | In coda |          0 |             0 |
| QUA-06 | Qualifica      | Compatibilità con offerta         | Abilitato       | Normale  | Prepara un esempio dimostrativo: compatibilità con offerta.         | In coda |          0 |             0 |
| QUA-07 | Qualifica      | Verifica dati di contatto         | Abilitato       | Normale  | Prepara un esempio dimostrativo: verifica dati di contatto.         | In coda |          0 |             0 |
| QUA-08 | Qualifica      | Punteggio di priorità             | Abilitato       | Normale  | Prepara un esempio dimostrativo: punteggio di priorità.             | In coda |          0 |             0 |
| QUA-09 | Qualifica      | Revisione lista qualificata       | Abilitato       | Normale  | Prepara un esempio dimostrativo: revisione lista qualificata.       | In coda |          0 |             0 |
| MES-01 | Messaggi       | Contesto aziendale                | Abilitato       | Normale  | Prepara un esempio dimostrativo: contesto aziendale.                | In coda |          0 |             0 |
| MES-02 | Messaggi       | Contesto di settore               | Abilitato       | Normale  | Prepara un esempio dimostrativo: contesto di settore.               | In coda |          0 |             0 |
| MES-03 | Messaggi       | Personalizzazione geografica      | Abilitato       | Normale  | Prepara un esempio dimostrativo: personalizzazione geografica.      | In coda |          0 |             0 |
| MES-04 | Messaggi       | Analisi del problema              | Abilitato       | Normale  | Prepara un esempio dimostrativo: analisi del problema.              | In coda |          0 |             0 |
| MES-05 | Messaggi       | Proposta di valore                | Abilitato       | Normale  | Prepara un esempio dimostrativo: proposta di valore.                | In coda |          0 |             0 |
| MES-06 | Messaggi       | Oggetto email                     | Abilitato       | Normale  | Prepara un esempio dimostrativo: oggetto email.                     | In coda |          0 |             0 |
| MES-07 | Messaggi       | Apertura personalizzata           | Abilitato       | Normale  | Prepara un esempio dimostrativo: apertura personalizzata.           | In coda |          0 |             0 |
| MES-08 | Messaggi       | Prova di rilevanza                | Abilitato       | Normale  | Prepara un esempio dimostrativo: prova di rilevanza.                | In coda |          0 |             0 |
| MES-09 | Messaggi       | Invito alla conversazione         | Abilitato       | Normale  | Prepara un esempio dimostrativo: invito alla conversazione.         | In coda |          0 |             0 |
| MES-10 | Messaggi       | Sintesi del messaggio             | Abilitato       | Normale  | Prepara un esempio dimostrativo: sintesi del messaggio.             | In coda |          0 |             0 |
| MES-11 | Messaggi       | Variante A                        | Abilitato       | Normale  | Prepara un esempio dimostrativo: variante a.                        | In coda |          0 |             0 |
| MES-12 | Messaggi       | Variante B                        | Abilitato       | Normale  | Prepara un esempio dimostrativo: variante b.                        | In coda |          0 |             0 |
| MES-13 | Messaggi       | Controllo delle affermazioni      | Abilitato       | Normale  | Prepara un esempio dimostrativo: controllo delle affermazioni.      | In coda |          0 |             0 |
| MES-14 | Messaggi       | Revisione linguistica             | Abilitato       | Normale  | Prepara un esempio dimostrativo: revisione linguistica.             | In coda |          0 |             0 |
| MES-15 | Messaggi       | Controllo finale del tono         | Abilitato       | Normale  | Prepara un esempio dimostrativo: controllo finale del tono.         | In coda |          0 |             0 |
| RIS-01 | Risposte       | Classificazione delle risposte    | Abilitato       | Normale  | Prepara un esempio dimostrativo: classificazione delle risposte.    | In coda |          0 |             0 |
| RIS-02 | Risposte       | Riconoscimento interesse          | Abilitato       | Normale  | Prepara un esempio dimostrativo: riconoscimento interesse.          | In coda |          0 |             0 |
| RIS-03 | Risposte       | Gestione obiezioni                | Abilitato       | Normale  | Prepara un esempio dimostrativo: gestione obiezioni.                | In coda |          0 |             0 |
| RIS-04 | Risposte       | Bozze di risposta                 | Abilitato       | Normale  | Prepara un esempio dimostrativo: bozze di risposta.                 | In coda |          0 |             0 |
| RIS-05 | Risposte       | Follow-up a tre giorni            | Abilitato       | Normale  | Prepara un esempio dimostrativo: follow-up a tre giorni.            | In coda |          0 |             0 |
| RIS-06 | Risposte       | Controllo frequenza contatti      | Abilitato       | Normale  | Prepara un esempio dimostrativo: controllo frequenza contatti.      | In coda |          0 |             0 |
| RIS-07 | Risposte       | Gestione disiscrizioni            | Abilitato       | Normale  | Prepara un esempio dimostrativo: gestione disiscrizioni.            | In coda |          0 |             0 |
| RIS-08 | Risposte       | Escalation al titolare            | Abilitato       | Normale  | Prepara un esempio dimostrativo: escalation al titolare.            | In coda |          0 |             0 |
| AGE-01 | Agenda         | Verifica disponibilità            | Abilitato       | Normale  | Prepara un esempio dimostrativo: verifica disponibilità.            | In coda |          0 |             0 |
| AGE-02 | Agenda         | Proposta degli slot               | Abilitato       | Normale  | Prepara un esempio dimostrativo: proposta degli slot.               | In coda |          0 |             0 |
| AGE-03 | Agenda         | Gestione fusi orari               | Abilitato       | Normale  | Prepara un esempio dimostrativo: gestione fusi orari.               | In coda |          0 |             0 |
| AGE-04 | Agenda         | Conferma appuntamento             | Abilitato       | Normale  | Prepara un esempio dimostrativo: conferma appuntamento.             | In coda |          0 |             0 |
| AGE-05 | Agenda         | Preparazione della chiamata       | Abilitato       | Normale  | Prepara un esempio dimostrativo: preparazione della chiamata.       | In coda |          0 |             0 |
| NUT-01 | Nutrimento     | Segmentazione per interesse       | Abilitato       | Normale  | Prepara un esempio dimostrativo: segmentazione per interesse.       | In coda |          0 |             0 |
| NUT-02 | Nutrimento     | Piano dei contenuti               | Abilitato       | Normale  | Prepara un esempio dimostrativo: piano dei contenuti.               | In coda |          0 |             0 |
| NUT-03 | Nutrimento     | Selezione risorse utili           | Abilitato       | Normale  | Prepara un esempio dimostrativo: selezione risorse utili.           | In coda |          0 |             0 |
| NUT-04 | Nutrimento     | Personalizzazione contenuti       | Abilitato       | Normale  | Prepara un esempio dimostrativo: personalizzazione contenuti.       | In coda |          0 |             0 |
| NUT-05 | Nutrimento     | Cadenza quattordicinale           | Abilitato       | Normale  | Prepara un esempio dimostrativo: cadenza quattordicinale.           | In coda |          0 |             0 |
| NUT-06 | Nutrimento     | Monitoraggio interazioni          | Abilitato       | Normale  | Prepara un esempio dimostrativo: monitoraggio interazioni.          | In coda |          0 |             0 |
| NUT-07 | Nutrimento     | Riqualifica contatti maturi       | Abilitato       | Normale  | Prepara un esempio dimostrativo: riqualifica contatti maturi.       | In coda |          0 |             0 |
| APP-01 | Apprendimento  | Analisi settori                   | Abilitato       | Normale  | Prepara un esempio dimostrativo: analisi settori.                   | In coda |          0 |             0 |
| APP-02 | Apprendimento  | Analisi messaggi                  | Abilitato       | Normale  | Prepara un esempio dimostrativo: analisi messaggi.                  | In coda |          0 |             0 |
| APP-03 | Apprendimento  | Analisi orari                     | Abilitato       | Normale  | Prepara un esempio dimostrativo: analisi orari.                     | In coda |          0 |             0 |
| APP-04 | Apprendimento  | Analisi delle risposte            | Abilitato       | Normale  | Prepara un esempio dimostrativo: analisi delle risposte.            | In coda |          0 |             0 |
| APP-05 | Apprendimento  | Valutazione esperimenti           | Abilitato       | Normale  | Prepara un esempio dimostrativo: valutazione esperimenti.           | In coda |          0 |             0 |
| APP-06 | Apprendimento  | Qualità dei dati                  | Abilitato       | Normale  | Prepara un esempio dimostrativo: qualità dei dati.                  | In coda |          0 |             0 |
| APP-07 | Apprendimento  | Raccomandazioni settimanali       | Abilitato       | Normale  | Prepara un esempio dimostrativo: raccomandazioni settimanali.       | In coda |          0 |             0 |
| ORC-01 | Orchestrazione | Distribuzione del lavoro          | Abilitato       | Normale  | Prepara un esempio dimostrativo: distribuzione del lavoro.          | In coda |          0 |             0 |
| ORC-02 | Orchestrazione | Limiti e deduplicazione           | Abilitato       | Normale  | Prepara un esempio dimostrativo: limiti e deduplicazione.           | In coda |          0 |             0 |
| ORC-03 | Orchestrazione | Controllo delle anomalie          | Abilitato       | Normale  | Prepara un esempio dimostrativo: controllo delle anomalie.          | In coda |          0 |             0 |
| ORC-04 | Orchestrazione | Report del lunedì                 | Abilitato       | Normale  | Prepara un esempio dimostrativo: report del lunedì.                 | In coda |          0 |             0 |

## 4. Funzionamento del controllo operativo

- Identità e reparto stabili; incarico, istruzioni e priorità modificabili.
- Una sola assegnazione corrente per agente. Modificare incarico o istruzioni azzera l'esito corrente e riapre la coda; i contatori cumulativi restano invariati.
- Il ciclo manuale elabora al massimo 5 incarichi selezionati: priorità Alta, Normale, Bassa; a parità, ordine alfabetico per ID.
- La pausa globale prevale sui singoli interruttori. Riprendere il sistema non riabilita agenti sospesi individualmente.
- Messaggi, Risposte, Agenda e Nutrimento producono esiti da approvare manualmente. Approvare un esito demo non invia nulla.
- Un incarico già completato o in revisione non viene rieseguito automaticamente. Può essere riaperto esplicitamente; una revisione respinta torna in coda.
- Output deterministici: le istruzioni sono registrate, non interpretate da un modello IA.
- Conservazione locale degli ultimi 300 eventi della console. Registro modificabile dal browser, non audit di sicurezza certificato. Nessuna cronologia completa delle versioni di incarico.

## 5. Registro disponibile (0 eventi, dal più recente)

Nessuna operazione della console ancora registrata.

## 6. Misurazione: cosa significano i numeri

Gli agenti abilitati sono configurazioni disponibili, non worker attivi. La coda conta tutti gli incarichi aperti, inclusi quelli sospesi. I completamenti sono cumulativi e possono superare 67 se gli incarichi vengono riaperti. Le esecuzioni includono i passaggi successivamente respinti. I KPI commerciali della Panoramica e gli appuntamenti dell'Agenda sono esempi statici separati: non vanno sommati o confrontati con questi contatori.

Non sono misurabili in questa versione: ricavi, ROI, conversioni effettive, tempo risparmiato, costi token, deliverability, latenza delle risposte o disponibilità reale dei calendari.

## 7. Sicurezza e limiti

- Nessun backend, login reale, controllo dei ruoli, sincronizzazione multiutente o cifratura applicativa dei dati locali.
- Non inserire dati sensibili, contatti reali o credenziali nelle istruzioni.
- Nessun connettore web, LinkedIn, registro, CRM, email o calendario è attivo.
- Follow-up a 3 giorni, un contatto al giorno, nutrimento ogni 14 giorni e report del lunedì alle 08:00 sono specifiche da implementare lato server.
- La verifica di base giuridica, termini delle fonti, informative, opt-out e retention richiede valutazione prima dell'utilizzo reale.
- Il titolare nella demo gestisce anche configurazione e revisioni. La promessa “solo la chiamata” è un obiettivo futuro, non una funzionalità già raggiunta.

## 8. Piano per la messa in produzione

1. Definire offerta, cliente ideale, territori, criteri di esclusione e KPI di successo.
2. Implementare backend autenticato, database, ruoli, secret manager e tracciamento degli eventi.
3. Collegare un provider IA; versionare prompt, strumenti, budget, timeout e controlli sugli output.
4. Implementare code di lavoro, scheduler, retry, idempotenza e blocco delle anomalie.
5. Integrare fonti autorizzate, CRM, email e calendario via API/OAuth; controllare gli slot in modo atomico.
6. Applicare lato server limiti per destinatario, lista di soppressione, opt-out, revisione umana e politiche di conservazione.
7. Avviare un pilota controllato con approvazione preventiva e misurare esiti reali prima di aumentare i volumi.

Criterio di rilascio: nessun invio senza controlli verificati, nessuna prenotazione senza slot confermato, errori e costi osservabili e possibilità di arresto immediato.

## 9. Funzionalità consegnate

| Area          | Funzionalità disponibile                      | Comportamento verificabile                                          |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| Catalogo      | 67 ID stabili e responsabilità distinte       | Conteggio per reparto e unicità testati                             |
| Ricerca       | ID, ruolo, incarico e reparto                 | Ricerca combinata con filtri di reparto e stato                     |
| Selezioni     | Gestione multipla dei soli agenti selezionati | Il cambio di filtro azzera la selezione                             |
| Controlli     | Pausa individuale, di gruppo e globale        | La pausa globale conserva le impostazioni individuali               |
| Editor        | Compito, istruzioni e priorità                | Salvataggio locale e input obbligatori con lunghezze limitate       |
| Ciclo demo    | Massimo cinque incarichi per ciclo            | Solo incarichi in coda e agenti abilitati, senza chiamate IA        |
| Revisione     | Approvazione e rigetto manuale                | Approvazione idempotente; rigetto rimette in coda                   |
| Riapertura    | Riapri incarico completato                    | Nuovo ciclo esplicito e contatori storici mantenuti                 |
| Persistenza   | Ripristino dopo ricaricamento                 | Migrazione dei salvataggi precedenti e normalizzazione del catalogo |
| Registro      | Ultimi 300 eventi della console               | Configurazioni, sospensioni, cicli e revisioni                      |
| Export        | Report Markdown e registro JSON               | Snapshot dello stato corrente; nessuna importazione automatica      |
| Compatibilità | Desktop e mobile                              | Menu mobile e tabelle scorrevoli senza overflow della pagina        |

### Prova guidata

1. Aprire **Gestione agenti**: al primo avvio sono presenti 67 agenti abilitati e 67 incarichi in coda.
2. Selezionare il reparto **Messaggi**, cercare **MES-01** e premere **Gestisci**.
3. Modificare il compito, mantenere istruzioni prive di dati reali, impostare priorità Alta e salvare.
4. Riaprire la scheda ed eseguire l’incarico salvato: l’esito diventa **Da approvare**.
5. Leggere l’esito deterministico e scegliere se approvarlo oppure rimetterlo in coda.
6. Controllare contatori e registro; poi attivare la pausa globale per verificare il blocco dei cicli.
7. Scaricare il report operativo e ricaricare la pagina per verificare il ripristino.

## 10. Ciclo settimanale previsto

**Output attesi quando il sistema sarà operativo, non risultati già ottenuti.**

| Giorno      | Reparto        | Output atteso                             | Controllo necessario in produzione                     |
| ----------- | -------------- | ----------------------------------------- | ------------------------------------------------------ |
| Lunedì      | Ricerca        | Lista aziende compatibili                 | Fonti autorizzate, provenienza e deduplicazione        |
| Martedì     | Qualifica      | Decisori validati e punteggi motivati     | Evidenze verificabili e criteri di esclusione          |
| Mercoledì   | Messaggi       | Bozze pertinenti per ciascun destinatario | Controllo affermazioni, tono e approvazione            |
| Giovedì     | Risposte       | Risposte e follow-up opportuni            | Opt-out, duplicati e distanza minima di 3 giorni       |
| Venerdì     | Agenda         | Appuntamenti confermati                   | Disponibilità reale, fusi orari e assenza di conflitti |
| Sabato      | Nutrimento     | Contenuti utili per contatti non pronti   | Preferenze, base giuridica e cadenza di 14 giorni      |
| Domenica    | Apprendimento  | Analisi di settori, messaggi e orari      | Dati sufficienti, test controllati e supervisione      |
| Ogni giorno | Orchestrazione | Assegnazioni, blocchi e report            | Monitoraggio, audit server e arresto di emergenza      |

Non è stata eseguita una settimana reale di acquisizione: la tabella traduce il brief in una specifica operativa.

## 11. Architettura attuale

- **Interfaccia:** HTML, CSS e JavaScript modulare, con Vite per sviluppo e build.
- **Catalogo e logica:** `src/agents.js` contiene identità, validazione del ripristino, filtri, contatori, transizioni di stato e generatore del report.
- **Console:** `src/agent-console.js` contiene tabella, selezione multipla, editor, registro e report a video.
- **Layout:** `src/agent-console.css` estende lo stile della dashboard esistente.
- **Integrazione:** `src/main.js` collega navigazione, stato condiviso, pausa globale, schede reparto ed esportazioni.
- **Storage:** chiave `agente-v1` nel localStorage; aggiunta delle configurazioni senza cancellare campagna e pipeline precedenti.
- **Test:** unit test con Node e test browser con Playwright/Chromium.
- **Anteprima:** server su `0.0.0.0:5173`, con host `*.e2b.app` autorizzati. Nessun backend richiesto.

Il registro e i contatori non costituiscono un sistema di event sourcing: non esiste una cronologia completa degli incarichi. Se il browser elimina i dati locali, lo stato non è recuperabile dal server. I file esportati sono leggibili ma non reimportabili automaticamente.

## 12. Qualità e verifiche

**32 test superati: 17 unitari e 15 browser. Build di produzione riuscita.**

### Verifiche sulla console

- Unicità e conteggio dei 67 agenti, ripartizione 63 + 4 e responsabilità distinte.
- Ripristino da vecchi salvataggi e normalizzazione delle configurazioni agente.
- Filtri combinati e stato effettivo durante la pausa globale.
- Azioni multiple circoscritte e transizioni idempotenti.
- Priorità, limite di cinque incarichi e rispetto della pausa e dei task già elaborati.
- Approvazione nei quattro reparti sensibili, rigetto e riapertura.
- Contatori cumulativi e limite di 300 eventi del registro.
- Persistenza dopo ricaricamento e contenuto dei file Markdown/JSON esportati.
- Navigazione mobile e assenza di overflow orizzontale del documento.

### Regressioni controllate

Sono rimasti funzionanti: schede reparto, pausa/ripresa generale, creazione campagna, ricerca contatti, modifica pipeline, agenda dimostrativa, CSV e report breve. La nuova console è stata ispezionata visivamente su desktop e mobile.

I test coprono il simulatore. Non certificano qualità dei modelli IA, deliverability, provider esterni, conformità legale o carichi produttivi, perché tali integrazioni non esistono ancora. Non è stato eseguito un audit completo di accessibilità o sicurezza.

## 13. Priorità del prossimo sviluppo

| Priorità | Lavoro                                      | Criterio di completamento                                               |
| -------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| P0       | Definire azienda, offerta e cliente ideale  | Profilo approvato con esclusioni, territori e obiettivi misurabili      |
| P0       | Backend, login, ruoli e storage persistente | Isolamento tra workspace e controllo delle autorizzazioni               |
| P0       | Verificare fonti e policy commerciali       | Fonti autorizzate e regole di contatto valutate prima del pilota        |
| P1       | Primo agente IA reale in modalità bozza     | Output tracciabile, nessun invio automatico, costi e timeout visibili   |
| P1       | Coda, scheduler e audit server              | Retry controllati, idempotenza, errori osservabili e arresto verificato |
| P1       | CRM, email e calendario                     | OAuth lato server, opt-out applicato e slot verificati                  |
| P2       | Pilota limitato con supervisione            | Misure reali di qualità, risposte, appuntamenti e costi                 |
| P2       | Ottimizzazione settimanale                  | Miglioramenti basati su dati sufficienti e test controllati             |

**Decisioni ancora necessarie:** settore dell’azienda, offerta concreta, cliente ideale, area geografica, provider email/calendario/CRM, modello IA, budget, volumi consentiti e responsabilità della supervisione. Non sono stimati ricavi o ritorni economici in assenza di questi dati.
