import { departments } from "./data.js";

// Catalogo stabile: identità e responsabilità non dipendono dai dati salvati.
export const roles = [
  [
    "Profilo cliente ideale",
    "Ricerca siti aziendali",
    "Analisi annunci",
    "Registri aziendali",
    "Profili professionali autorizzati",
    "Ricerca geografica",
    "Segnali di crescita",
    "Mappatura tecnologie",
    "Analisi concorrenti",
    "Deduplicazione aziende",
    "Verifica delle fonti",
    "Composizione lista prospect",
  ],
  [
    "Verifica del settore",
    "Dimensioni aziendali",
    "Identificazione decisore",
    "Verifica del ruolo",
    "Segnali di acquisto",
    "Compatibilità con offerta",
    "Verifica dati di contatto",
    "Punteggio di priorità",
    "Revisione lista qualificata",
  ],
  [
    "Contesto aziendale",
    "Contesto di settore",
    "Personalizzazione geografica",
    "Analisi del problema",
    "Proposta di valore",
    "Oggetto email",
    "Apertura personalizzata",
    "Prova di rilevanza",
    "Invito alla conversazione",
    "Sintesi del messaggio",
    "Variante A",
    "Variante B",
    "Controllo delle affermazioni",
    "Revisione linguistica",
    "Controllo finale del tono",
  ],
  [
    "Classificazione delle risposte",
    "Riconoscimento interesse",
    "Gestione obiezioni",
    "Bozze di risposta",
    "Follow-up a tre giorni",
    "Controllo frequenza contatti",
    "Gestione disiscrizioni",
    "Escalation al titolare",
  ],
  [
    "Verifica disponibilità",
    "Proposta degli slot",
    "Gestione fusi orari",
    "Conferma appuntamento",
    "Preparazione della chiamata",
  ],
  [
    "Segmentazione per interesse",
    "Piano dei contenuti",
    "Selezione risorse utili",
    "Personalizzazione contenuti",
    "Cadenza quattordicinale",
    "Monitoraggio interazioni",
    "Riqualifica contatti maturi",
  ],
  [
    "Analisi settori",
    "Analisi messaggi",
    "Analisi orari",
    "Analisi delle risposte",
    "Valutazione esperimenti",
    "Qualità dei dati",
    "Raccomandazioni settimanali",
  ],
  [
    "Distribuzione del lavoro",
    "Limiti e deduplicazione",
    "Controllo delle anomalie",
    "Report del lunedì",
  ],
];
export const priorities = ["Alta", "Normale", "Bassa"];
export const taskStates = ["In coda", "Da approvare", "Completato"];
export const catalog = departments.flatMap((d, index) =>
  roles[index].map((role, n) => ({
    id: `${d.name.slice(0, 3).toUpperCase()}-${String(n + 1).padStart(2, "0")}`,
    role,
    department: d.name,
    color: d.color,
    icon: d.icon,
    reviewRequired: ["Messaggi", "Risposte", "Agenda", "Nutrimento"].includes(
      d.name,
    ),
  })),
);
const text = (value, fallback, max = 1200) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
const integer = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;
export function createManager(raw = {}) {
  if (!raw || typeof raw !== "object") raw = {};
  const stored = Array.isArray(raw.agents) ? raw.agents : [];
  return {
    version: 1,
    agents: catalog.map((base) => {
      const a = stored.find((item) => item && item.id === base.id) || {};
      return {
        ...base,
        enabled: typeof a.enabled === "boolean" ? a.enabled : true,
        priority: priorities.includes(a.priority) ? a.priority : "Normale",
        task: text(
          a.task,
          `Prepara un esempio dimostrativo: ${base.role.toLowerCase()}.`,
          600,
        ),
        instructions: text(
          a.instructions,
          "Lavora solo sul campione demo. Segnala informazioni mancanti e non inventare dati o risultati. Non effettuare azioni esterne.",
        ),
        taskState: taskStates.includes(a.taskState) ? a.taskState : "In coda",
        output: typeof a.output === "string" ? a.output.slice(0, 3000) : "",
        completed: integer(a.completed),
        runs: integer(a.runs),
        lastRun:
          typeof a.lastRun === "string" &&
          Number.isFinite(Date.parse(a.lastRun))
            ? a.lastRun
            : null,
      };
    }),
    audit: (Array.isArray(raw.audit) ? raw.audit : [])
      .filter(
        (e) =>
          e &&
          typeof e.message === "string" &&
          typeof e.agentId === "string" &&
          Number.isFinite(Date.parse(e.time)),
      )
      .slice(0, 300)
      .map((e) => ({
        time: e.time,
        agentId: e.agentId.slice(0, 30),
        message: e.message.slice(0, 1000),
      })),
  };
}
export function logEvent(
  manager,
  agentId,
  message,
  now = new Date().toISOString(),
) {
  manager.audit.unshift({ time: now, agentId, message });
  manager.audit = manager.audit.slice(0, 300);
}
export function agentStatus(agent, running) {
  if (!running) return "Pausa globale";
  return agent.enabled ? "Abilitato" : "In pausa";
}
export function filterAgents(
  agents,
  { query = "", department = "Tutti", status = "Tutti" } = {},
  running = true,
) {
  const q = query.trim().toLocaleLowerCase("it");
  return agents.filter(
    (a) =>
      (department === "Tutti" || a.department === department) &&
      (status === "Tutti" ||
        a.taskState === status ||
        agentStatus(a, running) === status) &&
      `${a.id} ${a.role} ${a.task} ${a.department}`
        .toLocaleLowerCase("it")
        .includes(q),
  );
}
export function agentMetrics(manager, running) {
  const agents = manager.agents;
  return {
    total: agents.length,
    enabled: running ? agents.filter((a) => a.enabled).length : 0,
    paused: running ? agents.filter((a) => !a.enabled).length : agents.length,
    queued: agents.filter((a) => a.taskState === "In coda").length,
    ready: agents.filter(
      (a) => running && a.enabled && a.taskState === "In coda",
    ).length,
    review: agents.filter((a) => a.taskState === "Da approvare").length,
    completed: agents.reduce((n, a) => n + a.completed, 0),
    runs: agents.reduce((n, a) => n + a.runs, 0),
  };
}
export function setEnabled(manager, ids, enabled) {
  let count = 0;
  manager.agents
    .filter((a) => ids.includes(a.id) && a.enabled !== enabled)
    .forEach((a) => {
      a.enabled = enabled;
      count++;
      logEvent(
        manager,
        a.id,
        enabled
          ? "Agente abilitato alla simulazione."
          : "Agente messo in pausa.",
      );
    });
  return count;
}
export function updateAgent(manager, id, patch) {
  const a = manager.agents.find((item) => item.id === id);
  if (!a) throw new Error("Agente non trovato.");
  const task = text(patch.task, "", 600);
  const instructions = text(patch.instructions, "", 1200);
  if (!task || !instructions || !priorities.includes(patch.priority))
    throw new Error("Compila incarico, istruzioni e priorità validi.");
  if (a.task !== task || a.instructions !== instructions) {
    a.taskState = "In coda";
    a.output = "";
  }
  a.task = task;
  a.instructions = instructions;
  a.priority = patch.priority;
  logEvent(
    manager,
    id,
    `Configurazione salvata. Priorità: ${a.priority}. Incarico: ${a.task}`,
  );
}
export function runAgents(
  manager,
  running,
  ids = manager.agents.map((a) => a.id),
) {
  if (!running)
    return { processed: 0, review: 0, reason: "La pausa globale è attiva." };
  const eligible = manager.agents
    .filter((a) => ids.includes(a.id) && a.enabled && a.taskState === "In coda")
    .sort(
      (a, b) =>
        priorities.indexOf(a.priority) - priorities.indexOf(b.priority) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 5);
  let review = 0;
  for (const a of eligible) {
    a.runs++;
    a.lastRun = new Date().toISOString();
    a.taskState = a.reviewRequired ? "Da approvare" : "Completato";
    if (a.reviewRequired) review++;
    else a.completed++;
    a.output = `ESITO SIMULATO · ${a.id}\nIncarico: ${a.task}\nIstruzioni registrate: ${a.instructions}\nVerifica locale: incarico presente e agente abilitato.\n${a.reviewRequired ? "Contenuto o azione sensibile: richiesta revisione umana. Nessuna comunicazione o prenotazione eseguita." : "Passaggio di workflow completato nel simulatore. Nessuna ricerca, analisi IA o azione esterna eseguita."}\nQuesto testo è un riepilogo deterministico, non un risultato prodotto da un modello IA.`;
    logEvent(
      manager,
      a.id,
      `Ciclo demo: ${a.taskState.toLowerCase()}. Nessuna azione esterna.`,
    );
  }
  return {
    processed: eligible.length,
    review,
    reason: eligible.length
      ? ""
      : "Nessun incarico eseguibile nella selezione.",
  };
}
export function reviewAgent(manager, id, approved) {
  const a = manager.agents.find((item) => item.id === id);
  if (!a || a.taskState !== "Da approvare") return false;
  a.taskState = approved ? "Completato" : "In coda";
  if (approved) a.completed++;
  else a.output = "";
  logEvent(
    manager,
    id,
    approved
      ? "Esito demo approvato manualmente. Nessun invio autorizzato o effettuato."
      : "Revisione respinta: incarico rimesso in coda.",
  );
  return true;
}
export function requeueAgent(manager, id) {
  const a = manager.agents.find((item) => item.id === id);
  if (!a || a.taskState !== "Completato") return false;
  a.taskState = "In coda";
  a.output = "";
  logEvent(manager, id, "Incarico completato rimesso in coda manualmente.");
  return true;
}
const md = (value) =>
  String(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/([\\`*_<>{}\[\]#|])/g, "\\$1");
export function detailedReport(manager, running, campaign, now = new Date()) {
  const m = agentMetrics(manager, running);
  return `# Agente — Report operativo dettagliato

Generato: ${now.toLocaleString("it-IT", { timeZone: "Europe/Rome" })} · Europe/Rome

## 1. Sintesi esecutiva

La dashboard gestisce ${m.total} schede agente in 8 reparti. È un simulatore locale, non una rete di processi IA autonomi. Gli indicatori seguenti derivano dallo stato salvato in questo browser, non da risultati commerciali reali.

- Campagna configurata: ${md(campaign.name)}.
- Settore: ${md(campaign.sector)}. Area: ${md(campaign.city)}.
- Interruttore globale: ${running ? "simulazione abilitata" : "pausa attiva"}.
- Agenti effettivamente abilitati: ${m.enabled}; sospesi: ${m.paused}.
- Incarichi in coda: ${m.queued}, di cui eseguibili: ${m.ready}.
- Esiti in attesa di revisione: ${m.review}.
- Esecuzioni demo cumulative: ${m.runs}; completamenti cumulativi: ${m.completed}.
- Limite giornaliero configurato: ${md(campaign.limit)}. È una preferenza, non un limite applicato a un servizio reale.
- Chiamate a modelli IA: 0. Email reali inviate: 0. Prenotazioni reali: 0.

## 2. Ripartizione per reparto

| Reparto | Giorno | Agenti | Abilitati effettivi | In coda | Da approvare | Completamenti cumulativi |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${departments
  .map((d) => {
    const subset = {
      agents: manager.agents.filter((a) => a.department === d.name),
    };
    const k = agentMetrics(subset, running);
    return `| ${d.name} | ${d.day} | ${k.total} | ${k.enabled} | ${k.queued} | ${k.review} | ${k.completed} |`;
  })
  .join("\n")}

I sette reparti operativi sommano 63 agenti. I quattro orchestratori portano il totale a 67. I giorni rappresentano l'organizzazione proposta, non uno scheduler attivo.

## 3. Inventario completo degli agenti

| ID | Reparto | Responsabilità | Stato effettivo | Priorità | Incarico attuale | Fase | Esecuzioni | Completamenti |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: |
${manager.agents.map((a) => `| ${a.id} | ${a.department} | ${a.role} | ${agentStatus(a, running)} | ${a.priority} | ${md(a.task)} | ${a.taskState} | ${a.runs} | ${a.completed} |`).join("\n")}

## 4. Funzionamento del controllo operativo

- Identità e reparto stabili; incarico, istruzioni e priorità modificabili.
- Una sola assegnazione corrente per agente. Modificare incarico o istruzioni azzera l'esito corrente e riapre la coda; i contatori cumulativi restano invariati.
- Il ciclo manuale elabora al massimo 5 incarichi selezionati: priorità Alta, Normale, Bassa; a parità, ordine alfabetico per ID.
- La pausa globale prevale sui singoli interruttori. Riprendere il sistema non riabilita agenti sospesi individualmente.
- Messaggi, Risposte, Agenda e Nutrimento producono esiti da approvare manualmente. Approvare un esito demo non invia nulla.
- Un incarico già completato o in revisione non viene rieseguito automaticamente. Può essere riaperto esplicitamente; una revisione respinta torna in coda.
- Output deterministici: le istruzioni sono registrate, non interpretate da un modello IA.
- Conservazione locale degli ultimi 300 eventi della console. Registro modificabile dal browser, non audit di sicurezza certificato. Nessuna cronologia completa delle versioni di incarico.

## 5. Registro disponibile (${manager.audit.length} eventi, dal più recente)

${manager.audit.length ? manager.audit.map((e) => `- ${e.time} · ${md(e.agentId)} · ${md(e.message)}`).join("\n") : "Nessuna operazione della console ancora registrata."}

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
`;
}
