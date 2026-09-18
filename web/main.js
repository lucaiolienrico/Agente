import "./style.css";
const root = document.querySelector("#app"),
  modal = document.querySelector("#modal");
let state,
  session,
  dirty = false,
  toastTimer;
const h = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const labels = {
  veterinario: "Veterinario",
  pet_shop: "Pet shop",
  da_verificare: "Da verificare",
  qualificato: "Qualificato",
  escluso: "Escluso",
  unknown: "Non documentato",
  inbound: "Richiesta ricevuta",
  consent: "Consenso documentato",
  opt_out: "Non contattare",
  queued: "In coda",
  running: "In corso",
  completed: "Completato",
  failed: "Non completato",
  cancelled: "Annullato",
  review: "Da revisionare",
  approved: "Approvata",
};
const date = (v) =>
  v
    ? new Date(v).toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const badge = (key) =>
  `<span class="badge ${h(key)}">${h(labels[key] || key)}</span>`;
const outreachLabels = {
  email: "Email",
  whatsapp: "WhatsApp",
  initial: "Primo contatto",
  reply: "Risposta",
  followup: "Promemoria",
  inbound: "In ingresso",
  queued: "In coda",
  approved: "Approvato",
  sending: "In invio",
  sent: "Inviato",
  delivered: "Consegnato",
  read: "Letto",
  failed: "Non riuscito",
  unknown: "Esito incerto",
  blocked: "Bloccato",
  cancelled: "Annullato",
  received: "Ricevuto",
};
const outreachBadge = (key) =>
  `<span class="badge ${h(key)}">${h(outreachLabels[key] || key)}</span>`;
const options = (arr, current) =>
  arr
    .map(
      (v) =>
        `<option value="${h(v)}" ${v === current ? "selected" : ""}>${h(labels[v] || v)}</option>`,
    )
    .join("");
const icon = (name) =>
  ({ overview: "▦", partners: "◎", drafts: "▤", contacts: "✉", knowledge: "◇", log: "≡" })[
    name
  ] || "↗";
function toast(message, error = false) {
  const el = document.querySelector("#toast");
  (modal.open ? modal : document.body).append(el);
  el.textContent = message;
  el.className = `visible ${error ? "error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 6000);
}
async function api(path, method = "GET", body) {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "/login") {
      session = { ...session, authenticated: false };
      state = null;
      renderLogin();
    }
    throw new Error(data.error || "Richiesta non riuscita.");
  }
  return data;
}
async function refresh() {
  state = await api("/state");
  dirty = false;
  render();
}
const route = () => location.hash.slice(1) || "panoramica";
const nav = [
  ["panoramica", "overview", "Panoramica"],
  ["strutture", "partners", "Strutture"],
  ["bozze", "drafts", "Bozze e approvazioni"],
  ["contatti", "contacts", "Contatti e invii"],
  ["petnote", "knowledge", "Scheda PetNote"],
  ["registro", "log", "Registro attività"],
];
function renderLogin() {
  root.innerHTML = `<div class="login-wrap"><section class="login-card"><a class="brand" href="#"><span class="logo">p.</span><span>PetNote<small>PARTNERSHIP WORKSPACE</small></span></a><p class="eyebrow">UN AGENTE, UN OBIETTIVO</p><h1>Le partnership giuste<br>iniziano qui.</h1><p class="muted">Ricerca, qualifica e prepara proposte per veterinari e pet shop in tutta Italia. Il controllo resta tuo.</p><form id="login-form"><label>Password amministratore<input type="password" name="password" autocomplete="current-password" required minlength="12" ${!session.configured ? "disabled" : ""}></label><button class="primary wide" ${!session.configured ? "disabled" : ""}>Accedi al workspace →</button></form>${!session.configured ? '<div class="notice">Server da configurare: imposta <code>ADMIN_PASSWORD</code> nell’ambiente del server e riavvialo. Non inviare password o chiavi in chat.</div>' : ""}<p class="fine">Invii esterni disattivati per impostazione predefinita e sempre approvati da te. Nessun accesso ai dati sanitari di PetNote.</p></section></div>`;
}
function render() {
  if (!state) return;
  const current = nav.find((n) => n[0] === route()) || nav[0];
  const a = state.agent;
  root.innerHTML = `<div class="layout"><aside class="sidebar"><a class="brand" href="#panoramica"><span class="logo">p.</span><span>PetNote<small>PARTNERSHIP</small></span></a><div class="workspace-label">IL TUO WORKSPACE <span>01</span></div><nav>${nav.map(([id, i, text]) => `<a href="#${id}" class="${current[0] === id ? "active" : ""}" ${current[0] === id ? 'aria-current="page"' : ""}><span class="nav-icon">${icon(i)}</span>${text}${id === "bozze" && state.drafts.filter((d) => d.status === "review").length ? `<b>${state.drafts.filter((d) => d.status === "review").length}</b>` : ""}${id === "contatti" && pendingOutreach().length ? `<b>${pendingOutreach().length}</b>` : ""}</a>`).join("")}</nav><div class="sidebar-bottom"><div class="human"><span>✓</span><div>Human in the loop<small>Decidi tu, prima di ogni contatto.</small></div></div><a class="external" href="https://www.petnote.it/partner" target="_blank" rel="noopener noreferrer">Programma partner PetNote ↗</a><p>Veterinari & pet shop · Italia</p></div></aside><div class="workspace"><header class="topbar"><div><span class="muted">Workspace</span><span class="slash">/</span>${h(current[2])}</div><div class="top-actions"><span class="connection"><i class="dot ${a.enabled && !a.paused ? "green" : ""}"></i>${a.preview ? "Anteprima" : !a.configured ? "IA da collegare" : a.paused ? "In pausa" : `${h(a.label)} configurato`}</span><button class="avatar" data-action="logout" title="Esci dal workspace" aria-label="Esci dal workspace">PN</button></div></header>${a.preview ? '<div class="preview-banner">Anteprima aperta · Non inserire dati riservati. Accesso senza password; tutte le chiamate IA sono disabilitate.</div>' : ""}<main>${{ panoramica: overview, strutture: partners, bozze: drafts, contatti: outreach, petnote: knowledge, registro: logs }[current[0]]()}</main><footer>PetNote Partnership <span>Ricerca pubblica · Revisione umana · Invii solo autorizzati e approvati</span><small>v0.2</small></footer></div></div>`;
}
function pageHeader(eyebrow, title, description, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="muted">${description}</p></div>${action}</div>`;
}
function overview() {
  const a = state.agent,
    qualified = state.partners.filter((p) => p.status === "qualificato").length,
    approved = state.drafts.filter((d) => d.status === "approved").length;
  return `${pageHeader("PETNOTE PARTNERSHIP", "Partnership, con criterio.", "Dalla prima ricerca alla proposta giusta. Un passo alla volta.", `<button data-action="add-partner" class="secondary">+ Aggiungi struttura</button>`)}<div class="stats">${[
    [
      state.partners.length,
      "Strutture in archivio",
      "Contatti commerciali, non clienti",
    ],
    [qualified, "Qualificate da te", "Pertinenza verificata da una persona"],
    [
      state.drafts.length,
      "Bozze preparate",
      `${approved} approvate · nessuna inviata`,
    ],
    [
      `${a.usedToday} / ${a.dailyLimit}`,
      "Richieste IA oggi",
      "Limite giornaliero · fuso UTC",
    ],
  ]
    .map(
      ([n, t, s]) =>
        `<article class="stat"><p>${h(t)}</p><strong>${h(n)}</strong><small>${h(s)}</small></article>`,
    )
    .join(
      "",
    )}</div><div class="overview-grid"><section class="agent-hero"><div class="hero-top"><span class="eyebrow">IL TUO AGENTE</span><span class="hero-tag">01 · PARTNERSHIP</span></div><h2>Più relazioni pertinenti.<br>Meno attività ripetitive.</h2><p>Un alleato dedicato a PetNote: individua strutture, raccoglie evidenze e prepara proposte di collaborazione gratuita. Tu verifichi e approvi.</p><div class="workflow"><div><b>01</b><span>Ricerca<small>Fonti pubbliche</small></span></div><i>→</i><div><b>02</b><span>Qualifica<small>Verifica umana</small></span></div><i>→</i><div><b>03</b><span>Proposta<small>Bozza da approvare</small></span></div></div><div class="hero-foot"><span>◎ Tutta Italia</span><span>Veterinari · Pet shop</span><span>Invii solo se autorizzati</span></div></section><section class="card readiness"><div class="section-title"><h2>Prima di partire</h2><span class="subtle">SETUP</span></div><div class="check-row"><span class="check yes">✓</span><div><b>Archivio persistente</b><p>Strutture, bozze e registro sul server.</p></div></div><div class="check-row"><span class="check ${state.knowledge.approved ? "yes" : ""}">${state.knowledge.approved ? "✓" : "2"}</span><div><b>Scheda prodotto ${state.knowledge.approved ? "approvata" : "da verificare"}</b><p>Conferma offerta e vincoli di PetNote.</p><a href="#petnote">Rivedi la scheda →</a></div></div><div class="check-row"><span class="check ${a.enabled ? "yes" : ""}">${a.enabled ? "✓" : "3"}</span><div><b>${a.preview ? "IA bloccata in anteprima" : a.configured ? `${h(a.label)} configurato` : `Collega ${h(a.label)}`}</b><p>${a.preview ? "Le chiamate IA richiedono un server protetto." : a.configured ? "Configurazione presente; non è un test di connessione riuscito." : "Chiave e modello si configurano solo sul server. Nessun risultato simulato."}</p><button class="text-button" data-action="setup">Istruzioni di attivazione →</button></div></div></section></div><div class="lower-grid"><section class="card"><div class="section-title"><div><p class="eyebrow">IL PROSSIMO PASSO</p><h2>Trova nuovi partner</h2></div><span class="badge neutral">Max 5 / ricerca</span></div><p class="muted">Seleziona un territorio e un segmento. Verranno importate solo strutture con una fonte restituita dal provider, ancora da verificare.</p><form id="research-form"><div class="form-grid"><label>Tipo di struttura<select name="segment"><option value="entrambi">Veterinari e pet shop</option>${options(["veterinario", "pet_shop"])}</select></label><label>Regione<select name="region">${options(state.regions, "Tutta Italia")}</select></label><label>Comune <span class="optional">facoltativo</span><input name="city" maxlength="80" placeholder="Es. Milano"></label><label>Numero massimo<select name="limit">${[1, 2, 3, 4, 5].map((n) => `<option ${n === 5 ? "selected" : ""}>${n}</option>`).join("")}</select></label></div><div class="form-bottom"><p class="fine">La ricerca usa quote del provider e può avere costi.<br>Le fonti pubbliche non autorizzano il contatto.</p><button class="primary" ${!a.researchEnabled || a.paused ? "disabled" : ""}>Avvia ricerca web ↗</button></div>${!a.researchEnabled ? `<p class="inline-warning">${h(a.researchHint)}</p>` : ""}</form></section><section class="card activity"><div class="section-title"><h2>Ultimi lavori</h2><a href="#registro">Vedi tutti →</a></div>${state.jobs.length ? state.jobs.slice(0, 4).map(jobCard).join("") : `<div class="empty compact"><span class="empty-symbol">↗</span><h3>Il primo passo spetta a te</h3><p>Nessuna ricerca ancora avviata.<br>Non ci sono attività o risultati dimostrativi.</p></div>`}<div class="quiet-note">PayPal e push telefono sono già presenti in PetNote. Questo workspace non è ancora collegato ai loro eventi.</div></section></div>`;
}
function jobCard(j) {
  return `<article class="job"><div class="job-top"><b>${j.kind === "research" ? "Ricerca web" : "Generazione bozza"}</b>${badge(j.status)}</div><p>${j.kind === "research" ? `${h(j.request.region)} · ${h(j.request.city || "Tutti i comuni")} · ${j.request.segment === "entrambi" ? "Entrambi i segmenti" : h(labels[j.request.segment])}` : h(j.request.partner?.company)}</p>${j.result && j.kind === "research" ? `<p class="result">${j.result.added} aggiunte · ${j.result.duplicates} duplicati · ${j.result.discarded} scartate</p>` : ""}${j.error ? `<p class="inline-warning">${h(j.error)}</p>` : ""}<div class="job-meta"><small>${date(j.createdAt)}${j.provider ? ` · ${h(j.provider)} · ${h(j.model)}` : ""}</small>${["queued", "running"].includes(j.status) ? `<button class="text-button danger" data-action="cancel" data-id="${j.id}">Annulla</button>` : ""}</div></article>`;
}
function partners() {
  return `${pageHeader("ARCHIVIO COMMERCIALE", "Le tue strutture.", "Realtà italiane da conoscere, non una lista per invii automatici.", `<div class="button-row"><a class="secondary" href="/api/export/partners.csv">Esporta CSV ↓</a><button class="primary" data-action="add-partner">+ Aggiungi struttura</button></div>`)}<section class="card"><div class="filters"><label class="search-label"><span class="sr-only">Cerca struttura</span><input id="partner-search" placeholder="Cerca per nome, città o regione…" type="search"></label><label><span class="sr-only">Filtra segmento</span><select id="segment-filter"><option value="">Tutti i segmenti</option>${options(["veterinario", "pet_shop"])}</select></label><label><span class="sr-only">Filtra stato</span><select id="status-filter"><option value="">Tutti gli stati</option>${options(["da_verificare", "qualificato", "escluso"])}</select></label><span class="count">${state.partners.length} strutture</span></div>${state.partners.length ? `<div class="table-wrap"><table><thead><tr><th>Struttura</th><th>Territorio</th><th>Qualifica</th><th>Permesso di contatto</th><th></th></tr></thead><tbody>${state.partners.map((p) => `<tr data-partner-row data-search="${h((p.company + " " + p.city + " " + p.region).toLowerCase())}" data-segment="${p.segment}" data-status="${p.status}"><td><strong>${h(p.company)}</strong><small>${h(labels[p.segment])} · ${p.origin === "ai" ? "Ricerca IA" : "Inserimento manuale"}</small></td><td>${h(p.city)}<small>${h(p.region)}</small></td><td>${badge(p.status)}</td><td>${badge(p.contactBasis)}</td><td><button class="text-button" data-action="edit-partner" data-id="${p.id}">Apri scheda →</button></td></tr>`).join("")}</tbody></table><p id="no-filter-results" class="hidden muted">Nessuna struttura corrisponde ai filtri.</p></div>` : '<div class="empty"><span class="empty-symbol">◎</span><h2>Un archivio da costruire bene.</h2><p>Aggiungi una struttura che conosci oppure avvia una ricerca web.<br>Ogni nuovo risultato IA richiederà la tua verifica.</p><button class="secondary" data-action="add-partner">Aggiungi la prima struttura</button></div>'}</section><div class="notice">Pertinenza ≠ consenso. Un veterinario qualificato non è automaticamente contattabile. Documenta una richiesta pertinente o un consenso prima di approvare una proposta.</div>`;
}
function approvalReason(d) {
  const p = state.partners.find((p) => p.id === d.partnerId);
  if (d.knowledgeVersion !== state.knowledge.version)
    return "Scheda prodotto superata: genera una nuova bozza dalla struttura.";
  if (!state.knowledge.approved) return "Approva prima la scheda PetNote.";
  if (p.status !== "qualificato")
    return "Verifica e qualifica prima la struttura.";
  if (
    !["inbound", "consent"].includes(p.contactBasis) ||
    p.contactEvidence.length < 10
  )
    return "Documenta una richiesta pertinente o un consenso: il sito pubblico non basta.";
  if (!p.contactEmail)
    return "Indica il recapito professionale autorizzato nella scheda.";
  return "";
}
function drafts() {
  return `${pageHeader("CONTROLLO UMANO", "Proposte, non invii.", "Ogni testo è una bozza IA. Rileggi contenuto, offerta e base del contatto prima di approvarlo.")}<div class="notice">L’approvazione sblocca solo l’esportazione del testo. Non invia email e non certifica la validità legale del consenso.</div>${
    !state.drafts.length
      ? `<section class="card empty"><span class="empty-symbol">▤</span><h2>Spazio alle proposte pertinenti.</h2><p>Approva la scheda PetNote e apri una struttura per richiedere una bozza.<br>La ricerca e le bozze IA richiedono un provider configurato.</p><a class="secondary" href="#strutture">Vai alle strutture →</a></section>`
      : `<div class="draft-list">${state.drafts
          .map((d) => {
            const p = state.partners.find((p) => p.id === d.partnerId),
              reason = approvalReason(d);
            return `<section class="card"><div class="section-title"><div><p class="eyebrow">${h(labels[p.segment])} · ${h(p.city)}</p><h2>${h(p.company)}</h2></div>${badge(d.status)}</div><form class="draft-form" data-id="${d.id}"><label>Oggetto<input name="subject" value="${h(d.subject)}" required maxlength="140"></label><label>Testo della proposta<textarea name="body" rows="10" required maxlength="4000">${h(d.body)}</textarea></label><p class="fine">Generata ${date(d.createdAt)} · Scheda prodotto v${d.knowledgeVersion}</p>${reason ? `<div class="inline-warning">${h(reason)} <button type="button" class="text-button" data-action="edit-partner" data-id="${p.id}">Apri struttura →</button></div>` : `<label class="checkbox"><input name="confirmed" type="checkbox">Ho verificato testo, offerta e pertinenza della richiesta o del consenso documentato.</label>`}<div class="button-row"><button class="secondary" name="intent" value="save">Salva modifiche</button><button class="primary" name="intent" value="approve" ${reason ? "disabled" : ""}>Approva testo</button>${d.status === "approved" && !reason ? `<a class="text-button" href="/api/drafts/${d.id}/export">Scarica testo approvato ↓</a>` : ""}</div></form></section>`;
          })
          .join("")}</div>`
  }`;
}
function knowledge() {
  const k = state.knowledge;
  return `${pageHeader("FONTE DI VERITÀ", "L’agente deve conoscere PetNote.", "Controlla le informazioni prima di autorizzarne l’uso nelle proposte.", badge(k.approved ? "approved" : "review"))}<div class="knowledge-grid"><section class="card"><form id="knowledge-form"><div class="section-title"><h2>Offerta e limiti</h2><span class="subtle">VERSIONE ${k.version}</span></div><label>Come presentare PetNote<textarea name="offer" rows="8" maxlength="3000" required>${h(k.offer)}</textarea></label><label>Vincoli, obiezioni e promesse da evitare<textarea name="rules" rows="8" maxlength="3000" required>${h(k.rules)}</textarea></label><label class="checkbox"><input type="checkbox" name="approved" ${k.approved ? "checked" : ""}>Confermo che queste informazioni sono aggiornate e autorizzo l’agente a usarle per le bozze.</label><div class="form-bottom"><p class="fine">Ogni salvataggio crea una nuova versione e revoca le precedenti approvazioni delle bozze.</p><button class="primary">Salva scheda</button></div></form></section><aside><section class="card"><p class="eyebrow">IL MODELLO DI PARTNERSHIP</p><h2>Partner → proprietari → Premium opzionale</h2><p class="muted">Non vendiamo un gestionale alle strutture. Il partner presenta PetNote ai proprietari con QR, link e materiali da concordare.</p><hr><h3>Fonti ufficiali da controllare</h3>${k.sources.map((url) => `<a class="source-link" href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(url.replace("https://www.", ""))} ↗</a>`).join("")}<p class="fine">La scheda iniziale deriva dalle pagine pubbliche: non è una verifica dell’area autenticata o dei flussi di pagamento.</p></section><div class="notice"><strong>Già presenti in PetNote</strong><br>PayPal e push sul telefono, confermati dal titolare. Non vengono ricostruiti qui e i loro eventi non sono ancora integrati.</div><div class="notice"><strong>Da non promettere</strong><br>Commissioni, risultati garantiti, dati sanitari dei clienti o funzionalità illimitate. Per i pet shop chiarire la presenza dei link Amazon.</div></aside></div>`;
}
function logs() {
  return `${pageHeader("TRACCIABILITÀ", "Quello che è successo davvero.", "Lavori persistenti e registro delle azioni. Nessun contatore di email inviate.", `<button class="${state.agent.paused ? "primary" : "secondary"}" data-action="pause">${state.agent.paused ? "Riprendi agente" : "Sospendi agente"}</button>`)}<div class="notice">Una sospensione annulla i lavori in coda e interrompe quelli attivi. I costi già maturati non sono annullabili. Dopo un riavvio, nessuna chiamata viene ripetuta automaticamente.</div><div class="lower-grid"><section class="card"><div class="section-title"><h2>Lavori recenti</h2><span class="subtle">MAX 100</span></div>${state.jobs.length ? state.jobs.map(jobCard).join("") : '<div class="empty compact"><h3>Nessun lavoro avviato</h3><p>Le attività appariranno qui dopo una tua richiesta.</p></div>'}</section><section class="card"><div class="section-title"><h2>Registro operativo</h2><span class="subtle">ULTIMI 500 EVENTI</span></div><p class="fine">Richieste al provider: ${state.agent.usage.requests} · Token riportati: ${state.agent.usage.inputTokens ?? "n.d."} input / ${state.agent.usage.outputTokens ?? "n.d."} output. Non è un calcolo dei costi: consulta la fatturazione del provider.</p>${state.audit.length ? `<ol class="timeline">${state.audit.map((e) => `<li><small>${date(e.time)}</small><p>${h(e.message)}</p></li>`).join("")}</ol>` : '<div class="empty compact"><p>Nessun evento registrato.</p></div>'}</section></div>`;
}
const outreachMsgs = () => (state?.messages || []).filter((m) => m.direction === "outbound");
const pendingOutreach = () =>
  outreachMsgs().filter((m) => ["queued", "approved", "blocked", "sending"].includes(m.status));
const inboundMsgs = () => (state?.messages || []).filter((m) => m.direction === "inbound");
const contactById = (id) => (state?.contacts || []).find((c) => c.id === id);
const partnerOf = (contact) =>
  contact ? state.partners.find((p) => p.id === contact.partnerId) : null;

function outreach() {
  const o = state.outreach;
  const readyList = o.channels.map((c) => `${c.label}: ${c.ready ? "pronto" : "da configurare"}`).join(" · ");
  return `${pageHeader(
    "CONTATTO MULTICANALE",
    "Contatti autorizzati, non liste.",
    "Email e WhatsApp Business verso strutture con una richiesta pertinente o un consenso documentato. Ogni invio resta approvato da te.",
    `<div class="button-row"><button class="${o.paused ? "primary" : "secondary"}" data-action="pause-outreach" ${!o.enabled ? "disabled" : ""}>${o.paused ? "Riprendi invii" : "Ferma tutti gli invii"}</button></div>`,
  )}
  ${
    o.preview
      ? '<div class="preview-banner">Anteprima aperta: gli invii esterni sono bloccati in modo permanente. Nessuna email o messaggio WhatsApp può partire da qui.</div>'
      : !o.enabled
        ? `<div class="notice"><strong>Invii disattivati.</strong> ${h(o.configHint)}<br><span class="fine">${h(readyList)}</span></div>`
        : o.paused
          ? '<div class="notice"><strong>Invii sospesi.</strong> Nessun messaggio verrà consegnato finché non riprendi gli invii.</div>'
          : `<div class="notice"><strong>Invii attivi.</strong> Limite ${o.sentToday} / ${o.dailyLimit} oggi (UTC)${o.businessHours ? " · solo lun–ven 9–18 (Europe/Rome)" : ""}. ${h(readyList)}</div>`
  }
  <div class="stats">
    ${[
      [(state.contacts || []).length, "Contatti autorizzati", "Email e WhatsApp con base documentata"],
      [outreachMsgs().filter((m) => m.status === "sent" || m.status === "delivered" || m.status === "read").length, "Messaggi inviati", "Accettati dal provider"],
      [inboundMsgs().length, "Risposte ricevute", "Tramite webhook verificati"],
      [`${o.sentToday} / ${o.dailyLimit}`, "Invii oggi", "Limite giornaliero · fuso UTC"],
    ]
      .map(([n, t, sub]) => `<article class="stat"><p>${h(t)}</p><strong>${h(n)}</strong><small>${h(sub)}</small></article>`)
      .join("")}
  </div>
  <div class="lower-grid">
    <section class="card">
      <div class="section-title"><div><p class="eyebrow">DESTINATARI</p><h2>Contatti e autorizzazioni</h2></div><button class="secondary" data-action="add-contact" ${!state.partners.length ? "disabled" : ""}>+ Aggiungi contatto</button></div>
      ${(state.contacts || []).length ? `<div class="table-wrap"><table><thead><tr><th>Struttura</th><th>Canale</th><th>Base</th><th>Stato</th></tr></thead><tbody>${state.contacts
        .map((c) => {
          const p = partnerOf(c);
          return `<tr><td><strong>${h(p?.company || "—")}</strong><small>${h(c.address)}</small></td><td>${outreachBadge(c.channel)}</td><td>${badge(c.basis)}</td><td>${c.basis === "opt_out" ? outreachBadge("blocked") : ["inbound", "consent"].includes(c.basis) ? outreachBadge("approved") : outreachBadge("queued")}</td></tr>`;
        })
        .join("")}</tbody></table></div>` : '<div class="empty compact"><span class="empty-symbol">✉</span><h3>Nessun contatto</h3><p>Aggiungi un recapito a una struttura qualificata. Una fonte pubblica non autorizza il contatto.</p></div>'}
    </section>
    <section class="card">
      <div class="section-title"><div><p class="eyebrow">TESTI RIUTILIZZABILI</p><h2>Modelli approvati</h2></div><button class="secondary" data-action="add-template">+ Nuovo modello</button></div>
      ${(state.templates || []).length ? `<div class="draft-list">${state.templates
        .map((t) => `<article class="job"><div class="job-top"><b>${h(t.name)}</b>${outreachBadge(t.channel)}</div><p>${h(t.subject || (t.waName ? "Modello Meta: " + t.waName : ""))}</p><p class="result">${h(t.body.slice(0, 160))}${t.body.length > 160 ? "…" : ""}</p></article>`)
        .join("")}</div>` : '<div class="empty compact"><h3>Nessun modello</h3><p>Crea un testo approvato da riusare. Per WhatsApp serve un template statico approvato da Meta.</p></div>'}
    </section>
  </div>
  <section class="card">
    <div class="section-title"><div><p class="eyebrow">CODA E STORICO</p><h2>Messaggi</h2></div><button class="primary" data-action="add-message" ${!o.enabled || !(state.contacts || []).length ? "disabled" : ""}>+ Prepara messaggio</button></div>
    ${!o.enabled ? `<p class="inline-warning">${h(o.configHint)}</p>` : ""}
    ${outreachMsgs().length ? `<div class="draft-list">${outreachMsgs().map(messageCard).join("")}</div>` : '<div class="empty compact"><h3>Nessun messaggio in uscita</h3><p>Quando gli invii sono attivi, prepara un messaggio verso un contatto autorizzato. Richiede sempre la tua approvazione.</p></div>'}
  </section>
  <section class="card">
    <div class="section-title"><div><p class="eyebrow">RISPOSTE</p><h2>Conversazioni in ingresso</h2></div></div>
    ${inboundMsgs().length ? `<div class="draft-list">${inboundMsgs().map(inboundCard).join("")}</div>` : '<div class="empty compact"><h3>Nessuna risposta ricevuta</h3><p>Le risposte arrivano dai webhook verificati di Resend e WhatsApp. Un’opposizione mette il contatto in opt-out e annulla gli invii pendenti.</p></div>'}
  </section>
  <div class="notice">Un recapito pubblico non è consenso. L’agente non invia a strutture senza una richiesta pertinente o un consenso documentato, non raccoglie email o PEC dal web e non invia nulla senza la tua approvazione del singolo messaggio.</div>`;
}

function messageCard(m) {
  const c = contactById(m.contactId);
  const p = partnerOf(c);
  const actionable = ["queued", "blocked", "failed"].includes(m.status);
  const cancellable = ["queued", "approved", "blocked"].includes(m.status);
  return `<article class="job"><div class="job-top"><b>${h(p?.company || "Destinatario")}</b>${outreachBadge(m.status)}</div>
    <p>${outreachBadge(m.channel)} · ${outreachBadge(m.purpose)} · ${h(m.address || c?.address || "")}</p>
    ${m.subject ? `<p class="result"><strong>${h(m.subject)}</strong></p>` : ""}
    <p class="result">${h((m.body || "").slice(0, 240))}${(m.body || "").length > 240 ? "…" : ""}</p>
    ${m.blockedReason ? `<p class="inline-warning">${h(m.blockedReason)}</p>` : ""}
    ${m.error ? `<p class="inline-warning">${h(m.error)}</p>` : ""}
    ${m.providerMessageId ? `<p class="fine">ID provider: ${h(m.providerMessageId)}${m.provider ? " · " + h(m.provider) : ""}</p>` : ""}
    <div class="job-meta"><small>${date(m.createdAt)}${m.scheduledAt ? ` · programmato ${date(m.scheduledAt)}` : ""}${m.sentAt ? ` · inviato ${date(m.sentAt)}` : ""}</small>
      <span>${actionable && state.outreach.enabled ? `<button class="text-button" data-action="approve-message" data-id="${m.id}">Approva e accoda</button>` : ""}${cancellable ? `<button class="text-button danger" data-action="cancel-message" data-id="${m.id}">Annulla</button>` : ""}</span>
    </div></article>`;
}

function inboundCard(m) {
  const c = contactById(m.contactId);
  const p = partnerOf(c);
  return `<article class="job"><div class="job-top"><b>${h(p?.company || "Mittente sconosciuto")}</b>${outreachBadge("received")}</div>
    <p>${outreachBadge(m.channel)} · ${h(m.address || c?.address || "")}${m.subject ? " · " + h(m.subject) : ""}</p>
    ${m.body ? `<p class="result">${h(m.body.slice(0, 300))}${m.body.length > 300 ? "…" : ""}</p>` : `<p class="result"><em>${h(m.note || "Contenuto non testuale non trascritto.")}</em></p>`}
    ${m.note ? `<p class="inline-warning">${h(m.note)}</p>` : ""}
    <div class="job-meta"><small>${date(m.createdAt)}</small>${c && state.outreach.enabled ? `<button class="text-button" data-action="reply-message" data-id="${c.id}">Prepara risposta</button>` : ""}</div></article>`;
}

function openPartner(id) {
  document.body.append(document.querySelector("#toast"));
  dirty = false;
  const p = state.partners.find((p) => p.id === id) || {
    company: "",
    segment: "veterinario",
    city: "",
    region: "Lombardia",
    sourceUrl: "",
    evidence: "",
    contactEmail: "",
    contactBasis: "unknown",
    contactEvidence: "",
    status: "da_verificare",
    notes: "",
  };
  modal.innerHTML = `<div class="modal-head"><div><p class="eyebrow">SCHEDA STRUTTURA</p><h2>${id ? h(p.company) : "Aggiungi una struttura"}</h2></div><button class="close" data-action="close" aria-label="Chiudi">×</button></div><form id="partner-form" data-id="${id || ""}"><div class="form-grid"><label>Nome della struttura<input name="company" value="${h(p.company)}" maxlength="140" required></label><label>Segmento<select name="segment">${options(["veterinario", "pet_shop"], p.segment)}</select></label><label>Comune<input name="city" value="${h(p.city)}" maxlength="80" required></label><label>Regione<select name="region">${options(state.regions.slice(1), p.region)}</select></label></div><label>Fonte pubblica verificabile<input name="sourceUrl" type="url" value="${h(p.sourceUrl)}" maxlength="1500" placeholder="https://…" required></label>${p.sourceUrl ? `<a class="source-link" href="${h(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">Apri la fonte e verifica la struttura ↗</a>` : ""}<label>Evidenze di pertinenza<textarea name="evidence" rows="3" maxlength="1200" required>${h(p.evidence)}</textarea></label>${p.origin === "ai" ? '<p class="inline-warning">Evidenze proposte dall’IA: controlla che la fonte sostenga nome, attività e sede della struttura.</p>' : ""}<label>Qualifica umana<select name="status">${options(["da_verificare", "qualificato", "escluso"], p.status)}</select></label><hr><h3>Permesso di contatto</h3><p class="fine">Un recapito pubblico non basta. Non importare PEC o liste raccolte sul web. Usa un recapito professionale autorizzato per una richiesta pertinente o un consenso.</p><div class="form-grid"><label>Base documentata<select name="contactBasis">${options(["unknown", "inbound", "consent", "opt_out"], p.contactBasis)}</select></label><label>Email professionale <span class="optional">facoltativa</span><input name="contactEmail" type="email" value="${h(p.contactEmail)}" maxlength="200"></label></div><label>Origine, data e ambito della richiesta o del consenso<textarea name="contactEvidence" rows="3" maxlength="1200" placeholder="Documenta solo ciò che hai realmente ricevuto. Nessun dato sanitario.">${h(p.contactEvidence)}</textarea></label><label>Note interne<textarea name="notes" rows="2" maxlength="1600">${h(p.notes)}</textarea></label><div class="notice small-notice">Salvare una modifica revoca le approvazioni delle bozze di questa struttura. L’opt-out blocca generazione, approvazione ed esportazione.</div><div class="button-row"><button class="primary">Salva struttura</button>${id ? `<button type="button" class="secondary" data-action="draft" data-id="${id}" ${!state.agent.draftEnabled || state.agent.paused || !state.knowledge.approved || p.status === "escluso" || p.contactBasis === "opt_out" ? "disabled" : ""}>Genera bozza IA ↗</button>` : ""}<button type="button" class="text-button" data-action="close">Chiudi</button></div>${id ? '<p class="fine">La generazione usa i dati già salvati e può comportare costi IA. Salva prima le modifiche.</p>' : ""}</form>`;
  modal.showModal();
}
function setup() {
  document.body.append(document.querySelector("#toast"));
  modal.innerHTML = `<div class="modal-head"><h2>Attiva l’agente sul tuo server</h2><button class="close" data-action="close" aria-label="Chiudi">×</button></div><ol class="setup-list"><li><b>Server Node 22 + archivio persistente</b><p>GitHub Pages non può eseguire questo agente. Usa un server HTTPS con un volume per il database SQLite.</p></li><li><b>Proteggi l’accesso</b><p>Imposta ADMIN_PASSWORD e APP_ORIGIN nell’ambiente del server. In produzione usa NODE_ENV=production e DEV_AUTH_BYPASS=false.</p></li><li><b>Collega ${h(state.agent.label)}</b><p>${h(state.agent.configHint)} Quote e costi dipendono dal tuo account; nessun passaggio automatico ad altri provider.</p><p>${h(state.agent.researchHint)}</p><p>Con Groq puoi iniziare dalle bozze su strutture inserite manualmente. La ricerca con Compound Mini si abilita separatamente, dopo averne verificato i costi. Leggi docs/GROQ.md nella repository.</p></li><li><b>Conferma la scheda e prova una ricerca</b><p>Approva l’offerta PetNote, poi prova una singola struttura. Verifica le fonti prima di qualificare un risultato.</p></li></ol><div class="notice">Non inserire password o chiavi API in chat, nel frontend o nella repository. Consulta README.md e docs/DEPLOYMENT.md nella repository per i comandi.</div><button class="primary" data-action="close">Ho capito</button>`;
  modal.showModal();
}
const partnerOptions = (selected) =>
  state.partners
    .map(
      (p) =>
        `<option value="${h(p.id)}" ${p.id === selected ? "selected" : ""}>${h(p.company)} — ${h(p.city)}${p.status === "qualificato" ? "" : " (non qualificata)"}</option>`,
    )
    .join("");
const toISO = (value) => (value ? new Date(value).toISOString() : null);

function openContact() {
  document.body.append(document.querySelector("#toast"));
  if (!state.partners.length) {
    toast("Aggiungi prima una struttura all’archivio.", true);
    return;
  }
  modal.innerHTML = `<div class="modal-head"><div><p class="eyebrow">DESTINATARIO AUTORIZZATO</p><h2>Aggiungi un contatto</h2></div><button class="close" data-action="close" aria-label="Chiudi">×</button></div>
  <form id="contact-form">
    <label>Struttura<select name="partnerId" required>${partnerOptions()}</select></label>
    <div class="form-grid">
      <label>Canale<select name="channel">${options(["email", "whatsapp"], "email")}</select></label>
      <label>Recapito<input name="address" required maxlength="200" placeholder="email@esempio.it oppure +393401234567"></label>
    </div>
    <label>Base del contatto<select name="basis">${options(["inbound", "consent", "unknown", "opt_out"], "inbound")}</select></label>
    <label>Origine, data e ambito della richiesta o del consenso<textarea name="evidence" rows="3" maxlength="1500" placeholder="Es. richiesta ricevuta via modulo pubblico il 2026-09-10 per informazioni sulla partnership."></textarea></label>
    <div class="form-grid">
      <label>Data di raccolta<input name="obtainedAt" type="datetime-local" required></label>
      <label>Scade il <span class="optional">facoltativo</span><input name="expiresAt" type="datetime-local"></label>
    </div>
    <div class="notice small-notice">Un recapito pubblico non è consenso. Senza “richiesta ricevuta” o “consenso documentato” il contatto non è raggiungibile e nessun messaggio può essere inviato.</div>
    <div class="button-row"><button class="primary">Salva contatto</button><button type="button" class="text-button" data-action="close">Chiudi</button></div>
  </form>`;
  modal.showModal();
}

function openTemplate() {
  document.body.append(document.querySelector("#toast"));
  modal.innerHTML = `<div class="modal-head"><div><p class="eyebrow">TESTO RIUTILIZZABILE</p><h2>Nuovo modello</h2></div><button class="close" data-action="close" aria-label="Chiudi">×</button></div>
  <form id="template-form">
    <div class="form-grid">
      <label>Nome interno<input name="name" required maxlength="100" placeholder="Presentazione PetNote"></label>
      <label>Canale<select name="channel">${options(["email", "whatsapp"], "email")}</select></label>
    </div>
    <label>Oggetto <span class="optional">solo email</span><input name="subject" maxlength="140" placeholder="PetNote: programma partner gratuito"></label>
    <label>Nome template Meta <span class="optional">solo WhatsApp</span><input name="waName" maxlength="100" pattern="[a-z0-9_]*" placeholder="petnote_partner"></label>
    <label>Testo<textarea name="body" rows="8" maxlength="4000" required placeholder="Testo approvato. Per WhatsApp nessun parametro {{…}}: deve coincidere con il template approvato da Meta."></textarea></label>
    <div class="notice small-notice">Il modello non invia nulla da solo: serve a preparare messaggi che approverai uno per uno.</div>
    <div class="button-row"><button class="primary">Salva modello</button><button type="button" class="text-button" data-action="close">Chiudi</button></div>
  </form>`;
  modal.showModal();
}

function openMessage(preselectContactId = "") {
  document.body.append(document.querySelector("#toast"));
  if (!state.outreach.enabled) {
    toast("Invii disattivati sul server: nessun messaggio può essere accodato.", true);
    return;
  }
  const contacts = state.contacts || [];
  if (!contacts.length) {
    toast("Aggiungi prima un contatto autorizzato.", true);
    return;
  }
  const contactOptions = contacts
    .map((c) => {
      const p = partnerOf(c);
      return `<option value="${h(c.id)}" ${c.id === preselectContactId ? "selected" : ""}>${h(p?.company || "—")} · ${h(outreachLabels[c.channel])} · ${h(c.address)}</option>`;
    })
    .join("");
  const templateOptions =
    `<option value="">— Testo libero —</option>` +
    (state.templates || [])
      .map((t) => `<option value="${h(t.id)}">${h(t.name)} (${h(outreachLabels[t.channel])})</option>`)
      .join("");
  modal.innerHTML = `<div class="modal-head"><div><p class="eyebrow">MESSAGGIO IN USCITA</p><h2>Prepara un messaggio</h2></div><button class="close" data-action="close" aria-label="Chiudi">×</button></div>
  <form id="message-form">
    <label>Contatto<select name="contactId" required>${contactOptions}</select></label>
    <div class="form-grid">
      <label>Scopo<select name="purpose">${options(["initial", "reply", "followup"], "initial")}</select></label>
      <label>Modello<select name="templateId">${templateOptions}</select></label>
    </div>
    <label>Oggetto <span class="optional">solo email</span><input name="subject" maxlength="140"></label>
    <label>Testo<textarea name="body" rows="8" maxlength="4000" placeholder="Lascia vuoto per usare il modello selezionato."></textarea></label>
    <label>Programmalo per <span class="optional">facoltativo</span><input name="scheduledAt" type="datetime-local"></label>
    <label class="checkbox"><input type="checkbox" name="confirmed">Ho riletto il testo e verificato che il destinatario abbia una richiesta pertinente o un consenso documentato per questo canale.</label>
    <div class="notice small-notice">Con la conferma il messaggio viene approvato e accodato: sarà consegnato solo entro limite giornaliero, orario lavorativo e autorizzazione ancora valida. Senza conferma resta in coda da approvare.</div>
    <div class="button-row"><button class="primary">Salva messaggio</button><button type="button" class="text-button" data-action="close">Chiudi</button></div>
  </form>`;
  modal.showModal();
}

root.addEventListener("input", () => (dirty = true));
modal.addEventListener("input", () => (dirty = true));
root.addEventListener("input", (e) => {
  if (
    ["partner-search", "segment-filter", "status-filter"].includes(e.target.id)
  )
    filterPartners();
});
root.addEventListener("change", (e) => {
  if (["segment-filter", "status-filter"].includes(e.target.id))
    filterPartners();
});
function filterPartners() {
  const query = document.querySelector("#partner-search").value.toLowerCase(),
    segment = document.querySelector("#segment-filter").value,
    status = document.querySelector("#status-filter").value;
  let count = 0;
  document.querySelectorAll("[data-partner-row]").forEach((row) => {
    row.hidden = !(
      row.dataset.search.includes(query) &&
      (!segment || row.dataset.segment === segment) &&
      (!status || row.dataset.status === status)
    );
    if (!row.hidden) count++;
  });
  document.querySelector(".count").textContent = `${count} strutture`;
  document
    .querySelector("#no-filter-results")
    ?.classList.toggle("hidden", count > 0);
}
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (
    !form.matches(
      "#login-form,#research-form,#knowledge-form,#partner-form,.draft-form,#contact-form,#template-form,#message-form",
    )
  )
    return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const submitter = event.submitter;
  submitter.disabled = true;
  try {
    if (form.id === "login-form") {
      await api("/login", "POST", values);
      session = await api("/session");
      await refresh();
    } else if (form.id === "research-form") {
      await api("/research", "POST", {
        ...values,
        limit: Number(values.limit),
      });
      await refresh();
      toast("Ricerca in coda. I risultati richiederanno una verifica.");
    } else if (form.id === "knowledge-form") {
      await api("/knowledge", "PUT", {
        offer: values.offer,
        rules: values.rules,
        approved: values.approved === "on",
      });
      await refresh();
      toast("Scheda prodotto salvata.");
    } else if (form.id === "partner-form") {
      await api(
        "/partners" + (form.dataset.id ? "/" + form.dataset.id : ""),
        form.dataset.id ? "PUT" : "POST",
        values,
      );
      modal.close();
      await refresh();
      toast("Struttura salvata.");
    } else if (form.id === "contact-form") {
      await api("/outreach/contacts", "POST", {
        partnerId: values.partnerId,
        channel: values.channel,
        address: values.address,
        basis: values.basis,
        evidence: values.evidence,
        obtainedAt: toISO(values.obtainedAt),
        expiresAt: toISO(values.expiresAt),
      });
      modal.close();
      await refresh();
      toast("Contatto registrato. Nessun invio eseguito.");
    } else if (form.id === "template-form") {
      await api("/outreach/templates", "POST", {
        name: values.name,
        channel: values.channel,
        subject: values.subject || "",
        body: values.body,
        waName: values.waName || "",
        language: "it",
      });
      modal.close();
      await refresh();
      toast("Modello salvato.");
    } else if (form.id === "message-form") {
      const created = await api("/outreach/messages", "POST", {
        requestId: crypto.randomUUID(),
        contactId: values.contactId,
        purpose: values.purpose,
        templateId: values.templateId || null,
        subject: values.subject || "",
        body: values.body || "",
        scheduledAt: toISO(values.scheduledAt),
        confirmed: values.confirmed === "on",
      });
      modal.close();
      await refresh();
      toast(
        created.duplicate
          ? "Messaggio identico già presente: nessun duplicato creato."
          : created.status === "approved"
            ? "Messaggio approvato e accodato. Consegna soggetta a limiti e verifiche."
            : created.status === "blocked"
              ? "Messaggio bloccato: " + (created.blockedReason || "verifica autorizzazione.")
              : "Messaggio in coda: approvalo quando pronto.",
      );
    } else {
      if (submitter.value === "approve" && values.confirmed !== "on")
        throw new Error(
          "Conferma prima la revisione del testo e della base di contatto.",
        );
      await api("/drafts/" + form.dataset.id, "PUT", {
        subject: values.subject,
        body: values.body,
      });
      if (submitter.value === "approve")
        await api("/drafts/" + form.dataset.id + "/approve", "POST", {
          confirmed: true,
        });
      await refresh();
      toast(
        submitter.value === "approve"
          ? "Testo approvato. Nessun messaggio inviato."
          : "Bozza salvata: revisione richiesta.",
      );
    }
  } catch (e) {
    toast(e.message, true);
  } finally {
    submitter.disabled = false;
  }
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const { action, id } = button.dataset;
  try {
    if (action === "add-partner") openPartner();
    else if (action === "edit-partner") openPartner(id);
    else if (action === "close") {
      modal.close();
      dirty = false;
    } else if (action === "setup") setup();
    else if (action === "logout") {
      if (session.preview) {
        toast(
          "Anteprima aperta: per proteggere l’accesso disattiva DEV_AUTH_BYPASS sul server.",
        );
        return;
      }
      await api("/logout", "POST", {});
      session = await api("/session");
      state = null;
      renderLogin();
    } else if (action === "draft") {
      if (
        dirty &&
        !confirm(
          "La bozza usa solo i dati già salvati. Continuare senza salvare eventuali modifiche?",
        )
      )
        return;
      button.disabled = true;
      await api("/partners/" + id + "/drafts", "POST", {});
      modal.close();
      await refresh();
      toast(
        "Generazione richiesta. Controlla il registro e poi revisiona la bozza.",
      );
    } else if (action === "cancel") {
      await api("/jobs/" + id + "/cancel", "POST", {});
      await refresh();
      toast("Lavoro annullato. Eventuali costi già maturati rimangono.");
    } else if (action === "pause") {
      if (
        !state.agent.paused &&
        !confirm("Sospendere l’agente e annullare i lavori attivi e in coda?")
      )
        return;
      await api("/agent/pause", "POST", { paused: !state.agent.paused });
      await refresh();
    } else if (action === "add-contact") openContact();
    else if (action === "add-template") openTemplate();
    else if (action === "add-message") openMessage();
    else if (action === "reply-message") openMessage(id);
    else if (action === "pause-outreach") {
      const next = !state.outreach.paused;
      if (
        next &&
        !confirm(
          "Fermare tutti gli invii? I messaggi in coda verranno annullati e nessun provider sarà contattato.",
        )
      )
        return;
      await api("/outreach/pause", "POST", { paused: next });
      await refresh();
      toast(next ? "Invii sospesi." : "Invii riattivati.");
    } else if (action === "approve-message") {
      if (
        !confirm(
          "Approvare e accodare questo messaggio? Sarà consegnato al provider entro limiti e verifiche.",
        )
      )
        return;
      button.disabled = true;
      await api("/outreach/messages/" + id + "/approve", "POST", {
        confirmed: true,
      });
      await refresh();
      toast("Messaggio approvato e accodato.");
    } else if (action === "cancel-message") {
      button.disabled = true;
      await api("/outreach/messages/" + id + "/cancel", "POST", {});
      await refresh();
      toast("Messaggio annullato. Nessun invio esterno.");
    }
  } catch (e) {
    button.disabled = false;
    toast(e.message, true);
  }
});
window.addEventListener("hashchange", async () => {
  dirty = false;
  if (session?.authenticated) {
    try {
      await refresh();
    } catch (e) {
      toast(e.message, true);
    }
  }
});
modal.addEventListener("cancel", () => (dirty = false));
async function boot() {
  try {
    session = await api("/session");
    if (session.authenticated) await refresh();
    else renderLogin();
  } catch (e) {
    root.innerHTML = `<div class="login-wrap"><section class="card"><h1>Il server non risponde.</h1><p class="muted">Questo workspace richiede il backend Node: GitHub Pages da solo non è sufficiente.</p><p>${h(e.message)}</p><button class="primary">Ricarica</button></section></div>`;
    root.querySelector("button").addEventListener("click", boot);
  }
}
setInterval(async () => {
  if (!state || dirty || modal.open) return;
  try {
    const updated = await api("/state");
    if (JSON.stringify(updated) !== JSON.stringify(state)) {
      state = updated;
      render();
    }
  } catch {}
}, 4000);
boot();
