# Contatti multicanale (email + WhatsApp)

Questa funzione aggiunge all’agente la possibilità di **contattare i partner già autorizzati** su email e WhatsApp Business, oltre a registrare le loro risposte. È **disattivata per impostazione predefinita** e resta subordinata alle stesse garanzie del resto del progetto: richiesta pertinente o consenso documentato, approvazione umana del singolo messaggio, limiti giornalieri e orario lavorativo.

> Nessuna chiave, token o segreto va inserito in chat, nel frontend o nella repository. Le variabili seguenti vivono solo nell’ambiente del server (`.env` privato o secrets).

## Principi di sicurezza

- **Un recapito pubblico non è consenso.** L’agente non invia a una struttura senza `basis = inbound` (richiesta ricevuta) oppure `consent` (consenso documentato), con evidenza di almeno 10 caratteri e, se presente, scadenza non superata.
- **Approvazione per messaggio.** Ogni messaggio in uscita nasce `queued` e viene consegnato a un provider solo dopo l’approvazione. Se il testo cambia dopo l’approvazione, l’invio si blocca e serve una nuova approvazione.
- **Re-check immediato prima dell’invio.** Autorizzazione, opt-out, canale configurato, limite giornaliero e orario lavorativo sono verificati di nuovo un istante prima della consegna, non solo alla creazione.
- **Opt-out vincolante.** Un’opposizione (es. “STOP”, “non contattarmi”, “cancellami”) ricevuta su qualsiasi canale mette contatto **e** struttura in `opt_out`, annulla i messaggi pendenti e non è reversibile da questa interfaccia.
- **Nessun retry cieco.** Un errore transitorio del provider può essere rinviato una sola volta; un errore permanente resta `failed`. Se il processo si interrompe durante la consegna, l’esito diventa `unknown` e va verificato sul provider: nessun secondo invio automatico.
- **Webhook firmati.** I callback di Resend (firma Svix) e WhatsApp (`X-Hub-Signature-256`) sono verificati con confronto a tempo costante; senza firma valida vengono respinti. Gli eventi sono deduplicati.
- **Anteprima aperta = invii impossibili.** Con `DEV_AUTH_BYPASS=true` il modulo è bloccato in modo permanente e `OUTREACH_ENABLED=true` viene rifiutato all’avvio.

## Attivazione

1. Predisponi un server Node 22 sempre raggiungibile con HTTPS e un disco persistente (Codespaces va bene per sviluppo e prove, non per garantire invii e ricezione continuativi).
2. Nel `.env` privato del server imposta:

```dotenv
OUTREACH_ENABLED=true
OUTREACH_DAILY_LIMIT=20
OUTREACH_BUSINESS_HOURS=true

# Email tramite Resend
RESEND_API_KEY=re_...
RESEND_FROM=PetNote <partner@tuodominio.it>
RESEND_REPLY_TO=partner@tuodominio.it
RESEND_WEBHOOK_SECRET=whsec_...   # almeno 16 caratteri

# WhatsApp Business tramite API Cloud Meta
WA_ACCESS_TOKEN=...
WA_PHONE_NUMBER_ID=100000000000001
WA_BUSINESS_ACCOUNT_ID=100000000000002
WA_GRAPH_VERSION=v23.0
WA_APP_SECRET=...
WA_VERIFY_TOKEN=...               # almeno 16 caratteri
```

3. Configura i webhook sui provider puntandoli al server:
   - Resend → `https://TUO-ORIGIN/api/webhooks/resend` (eventi `email.received`, `email.delivered`, `email.bounced`, `email.failed`, …).
   - WhatsApp → `https://TUO-ORIGIN/api/webhooks/whatsapp` (verifica GET con `WA_VERIFY_TOKEN`, messaggi e stati POST).
4. Riavvia il server. All’avvio la console indica se gli invii sono abilitati e quali canali risultano pronti.

Puoi abilitare anche **un solo canale**: l’altro resta `ready: false` e i relativi messaggi vengono bloccati, non simulati.

## Uso nella console

Vai alla sezione **Contatti e invii**:

1. **Aggiungi contatto** su una struttura qualificata: scegli canale, recapito, base (`inbound`/`consent`) e documenta origine, data e ambito.
2. **Nuovo modello**: un testo approvato e riutilizzabile. Per WhatsApp serve il nome di un template statico già approvato in Meta Business Manager (nessun parametro `{{…}}`).
3. **Prepara messaggio**: scegli contatto, scopo (primo contatto / risposta / promemoria), modello o testo libero ed eventualmente una data. Con la conferma il messaggio viene approvato e accodato; senza conferma resta da approvare.
4. **Ferma tutti gli invii** in qualsiasi momento: annulla la coda e blocca le consegne.

Le **risposte** arrivano dai webhook e compaiono nelle conversazioni in ingresso. Da lì puoi preparare una risposta.

## Endpoint API principali

| Metodo | Percorso | Scopo |
|---|---|---|
| GET | `/api/outreach/status` | Stato invii, canali, limite e usato oggi (nessun segreto). |
| POST | `/api/outreach/pause` | `{ "paused": true\|false }` sospende/riattiva tutti gli invii. |
| GET/POST | `/api/outreach/contacts` | Elenca/crea contatti autorizzati. |
| PUT | `/api/outreach/contacts/:id` | Aggiorna contatto (opt-out irreversibile). |
| GET | `/api/outreach/contacts/:id/reachability` | Dice se un contatto è raggiungibile e perché no. |
| GET/POST | `/api/outreach/templates` | Modelli approvati. |
| GET/POST | `/api/outreach/messages` | Coda e storico messaggi. |
| POST | `/api/outreach/messages/:id/approve` | Approva e accoda (`{ "confirmed": true }`). |
| POST | `/api/outreach/messages/:id/cancel` | Annulla prima della consegna. |
| GET/POST | `/api/outreach/campaigns` | Campagne limitate a contatti già autorizzati. |
| GET | `/api/outreach/conversations` | Conversazioni, messaggi ed eventi webhook. |
| GET/POST | `/api/webhooks/whatsapp` | Verifica e callback WhatsApp (firmati). |
| POST | `/api/webhooks/resend` | Callback email Resend (firmati). |

Tutti gli endpoint `/api/outreach/*` richiedono la sessione amministrativa. I webhook no, ma richiedono la firma del provider e sono attivi solo se gli invii sono abilitati.

## Costi e limiti reali

- **Groq non rende gratuiti WhatsApp o l’email.** Ogni provider ha quote, tariffe e condizioni proprie: verifica nel tuo account Resend e Meta prima di attivare.
- **WhatsApp Business API** richiede un numero dedicato e, fuori dalla finestra di 24 ore dalla risposta dell’utente, un **template approvato da Meta**. Le conversazioni hanno costi per categoria e paese.
- Il limite giornaliero (`OUTREACH_DAILY_LIMIT`) conta i messaggi **accettati dal provider** per giorno UTC. L’orario lavorativo (lun–ven 9–18 Europe/Rome) rinvia i primi contatti e i promemoria; le risposte a un messaggio ricevuto possono partire anche fuori orario.
- Un promemoria viene annullato, non insistito, se nel frattempo il contatto non è più autorizzato.

## Cosa NON fa

- Non invia a strutture trovate sul web senza richiesta o consenso.
- Non raccoglie email, PEC o numeri dal web.
- Non invia nulla senza approvazione del singolo messaggio (o di una regola di campagna comunque vincolata alle autorizzazioni).
- Non dichiara come “consegnato” un messaggio che il provider non ha confermato: gli stati restano distinti (`sent`, `delivered`, `read`, `failed`, `unknown`).
- Non misura iscrizioni, attivazioni Premium o ricavi: per quello servirà una futura integrazione autorizzata con PetNote.
- Non usa automazioni di WhatsApp Web o dell’account personale: solo API ufficiali.

## Stato di verifica

Il modulo è coperto da test automatici isolati (provider simulati, nessuna chiamata esterna reale): validazione di configurazione, autorizzazioni, approvazione, deduplica, limiti, orario, opt-out, errori transitori/permanenti, esito sconosciuto, webhook firmati e campigne. **Non è stata eseguita una spedizione reale** verso Resend o Meta: la prima consegna effettiva va provata con cautela su pochi contatti realmente autorizzati, verificando costi e ricezione degli esiti.
