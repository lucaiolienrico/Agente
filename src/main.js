import "./style.css";
import { departments, initialLeads, filterLeads, reportLines } from "./data.js";
import {
  createManager,
  agentMetrics,
  agentStatus,
  logEvent,
} from "./agents.js";
import { createAgentConsole } from "./agent-console.js";

const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  network:
    '<circle cx="12" cy="5" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="m10 8-4 7m8-7 4 7M8 18h8"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-13 5h3"/>',
  chart: '<path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  message:
    '<path d="M21 11a8 8 0 0 1-8 8H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M7 8h10M7 12h7"/>',
  reply: '<path d="m8 4-6 6 6 6M2 10h12a7 7 0 0 1 7 7v3"/>',
  leaf: '<path d="M20 3C6 2 2 8 5 15s16 6 15-12ZM4 21 16 8"/>',
  sparkles:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m7 4 14 8-14 8Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  filter: '<path d="M4 7h16M7 12h10m-7 5h4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
  external:
    '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  building:
    '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-5h4v5"/>',
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem("agente-v1") || "{}");
} catch {}
if (!saved || typeof saved !== "object") saved = {};
const state = {
  page: window.location.hash === "#gestione-agenti" ? "Gestione agenti" : "Panoramica",
  manager: createManager(saved.manager),
  running: saved.running ?? true,
  leads: Array.isArray(saved.leads)
    ? saved.leads
    : structuredClone(initialLeads),
  campaign: saved.campaign || {
    name: "Nuovi clienti · Italia",
    sector: "Servizi B2B",
    city: "Italia",
    limit: 40,
  },
  query: "",
  filter: "Tutti",
  period: "Questa settimana",
  selectedDay: 2,
  activity: [],
};
const persist = () => {
  try {
    localStorage.setItem(
      "agente-v1",
      JSON.stringify({
        manager: state.manager,
        running: state.running,
        leads: state.leads,
        campaign: state.campaign,
      }),
    );
  } catch {
    toast(
      "Archiviazione locale non disponibile. Le modifiche valgono per questa sessione.",
    );
  }
};
const nav = [
  ["Panoramica", "grid"],
  ["Reparti & agenti", "network"],
  ["Gestione agenti", "settings"],
  ["Clienti potenziali", "users"],
  ["Agenda", "calendar"],
  ["Report & insight", "chart"],
];
function shell() {
  document.querySelector("#app").innerHTML =
    `<aside class="sidebar"><a class="brand" href="#" data-page="Panoramica"><span class="brand-mark">${icon("network")}</span>agente<span class="brand-dot">.</span></a><div class="workspace"><span class="workspace-logo">S</span><div>Il tuo workspace<small>Piano Business</small></div>${icon("down")}</div><div class="nav-label">WORKSPACE</div><nav>${nav.map(([n, i]) => `<button class="nav-item ${state.page === n ? "active" : ""}" data-page="${n}">${icon(i)}<span>${n}</span>${n === "Reparti & agenti" ? '<span class="nav-count">67</span>' : n === "Agenda" ? '<span class="nav-count simple">12</span>' : ""}</button>`).join("")}</nav><div class="sidebar-bottom"><div class="team-card"><div class="team-card-top"><span class="pulse-dot"></span>Il tuo team non si ferma</div><p>67 agenti. Un unico obiettivo.<br>La tua prossima chiamata.</p><div class="tiny-avatars"><span>R</span><span>Q</span><span>M</span><span>+64</span><i>Al tuo fianco, 24/7</i></div></div><button class="nav-item ${state.page === "Impostazioni" ? "active" : ""}" data-page="Impostazioni">${icon("settings")}Impostazioni</button><button class="nav-item" data-action="help">${icon("help")}Centro assistenza${icon("external", "small trailing")}</button><button class="profile" data-page="Impostazioni"><span class="avatar">LB</span><span>Luca Bianchi<small>Il tuo account</small></span>${icon("down")}</button></div></aside><div class="app-body"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="menu" aria-label="Apri menu">${icon("menu")}</button><span>Workspace</span>${icon("chevron")}<strong>${state.page}</strong></div><div class="topbar-right"><span class="demo-label">Ambiente demo</span><span class="system-status"><span class="pulse-dot ${state.running ? "" : "off"}"></span>${state.running ? "Sistemi operativi" : "Agenti in pausa"}</span><span class="topbar-divider"></span><button class="icon-button notification" data-action="notifications" aria-label="Notifiche">${icon("bell")}<i></i></button><span class="avatar small-avatar">LB</span></div></header><main id="main">${pageContent()}</main><footer><span><span class="pulse-dot"></span> Progettato per lavorare insieme a te.</span><span>Dati dimostrativi · Nessun invio reale</span></footer></div>`;
  bind();
}
function pageContent() {
  if (state.page === "Panoramica") return overview();
  if (state.page === "Gestione agenti") return agentConsole.render();
  if (state.page === "Reparti & agenti")
    return `<div class="page-heading"><div><div class="eyebrow">LA TUA SQUADRA DIGITALE</div><h1>Un team. Otto specializzazioni.</h1><p>67 agenti, ognuno con un compito preciso. Nessuno lavora da solo.</p></div><button class="button primary" data-action="toggle">${icon(state.running ? "pause" : "play")}${state.running ? "Metti in pausa" : "Riprendi agenti"}</button></div>${orchestrator()}<div class="section-heading"><h2>Tutti i reparti <span class="count-pill">8</span></h2><span class="muted">63 specialisti + 4 orchestratori</span></div>${departmentGrid(true)}`;
  if (state.page === "Clienti potenziali")
    return `<div class="page-heading"><div><div class="eyebrow">DAL PRIMO SEGNALE ALLA CHIAMATA</div><h1>Le relazioni iniziano qui.</h1><p>Una lista curata, non una lista qualunque.</p></div><button class="button primary" data-action="export">${icon("download")}Esporta contatti</button></div>${leadSection(true)}`;
  if (state.page === "Agenda") return agendaPage();
  if (state.page === "Report & insight") return reportPage();
  return settingsPage();
}
function overview() {
  return `<div class="page-heading"><div><div class="eyebrow">MENO OPERATIVITÀ, PIÙ OPPORTUNITÀ</div><h1>Il tuo prossimo cliente è già più vicino<span class="title-dot">.</span></h1><p>Il team lavora. Le relazioni crescono. Tu concentrati sulla chiamata.</p></div><button class="button primary" data-action="campaign">${icon("plus")}Nuova campagna</button></div><div class="overview-toolbar"><div class="live-label"><span class="pulse-dot ${state.running ? "" : "off"}"></span><strong>${state.running ? `${agentMetrics(state.manager, state.running).enabled} agenti abilitati` : "67 agenti in pausa"}</strong><span class="dot-separator">·</span><span>8 reparti, un solo obiettivo</span></div><button class="button period-button" data-action="period">${icon("calendar")}${state.period}${icon("down")}</button></div>${stats()}${orchestrator()}<section class="departments-section"><div class="section-heading"><div><h2>La tua squadra, in azione <span class="count-pill">8 reparti</span></h2><p>Un ciclo di sette giorni. Un motore che non smette di migliorare.</p></div><button class="text-button" data-page="Reparti & agenti">Esplora i 67 agenti ${icon("arrow")}</button></div>${departmentGrid()}</section><div class="bottom-grid">${leadSection(false)}${activityPanel()}</div><section class="bottom-banner"><span class="banner-icon">${icon("calendar")}</span><div><h3>Il lavoro preparatorio è nostro. La conversazione è tua.</h3><p>Hai 3 chiamate in programma questa settimana. Il tuo prossimo incontro è domani alle 10:30.</p></div><button class="text-button" data-page="Agenda">Apri l’agenda ${icon("arrow")}</button></section>`;
}
function stats() {
  const prev = state.period === "Settimana scorsa";
  const items = [
    [
      "Aziende individuate",
      prev ? "203" : "248",
      "+22%",
      "rispetto alla scorsa settimana",
      "search",
      "sage",
      [15, 22, 18, 30, 25, 34, 32, 44, 38, 48, 45, 57],
    ],
    [
      "Lead qualificati",
      prev ? "153" : "186",
      "+21%",
      "in linea con il tuo cliente ideale",
      "shield",
      "blue",
      [12, 20, 16, 29, 24, 33, 30, 40, 37, 45, 43, 53],
    ],
    [
      "Conversazioni avviate",
      prev ? "28" : "38",
      "+36%",
      "connessioni, non messaggi a vuoto",
      "message",
      "purple",
      [10, 17, 14, 22, 20, 31, 25, 37, 34, 43, 39, 50],
    ],
    [
      "Chiamate prenotate",
      prev ? "8" : "12",
      "+50%",
      "tu devi solo fare la chiamata",
      "calendar",
      "peach",
      [8, 8, 17, 17, 22, 20, 32, 32, 39, 36, 48, 55],
    ],
  ];
  return `<div class="stats-grid">${items.map(([label, value, delta, sub, i, c, bars]) => `<div class="stat-card"><div class="stat-label">${label}<span class="stat-icon ${c}">${icon(i)}</span></div><div class="stat-main"><strong>${value}</strong><span class="trend">↗ ${delta}</span><div class="spark-bars ${c}" aria-hidden="true">${bars.map((h) => `<i style="height:${h}px"></i>`).join("")}</div></div><p>${sub}</p></div>`).join("")}</div>`;
}
function orchestrator() {
  return `<section class="orchestrator"><div class="orchestrator-symbol">${icon("network")}<span></span></div><div class="orchestrator-copy"><div class="orchestrator-title"><h2>L’orchestratore tiene il filo.</h2><span class="orchestrator-badge">${state.running ? "Tutto sotto controllo" : "In pausa"}</span></div><p>Assegna i compiti, rispetta i limiti, ferma le anomalie. Il tuo team si muove come uno solo.</p><div class="orchestrator-details"><span>${icon("check")} Limiti di invio rispettati</span><span>${icon("check")} Nessuna anomalia</span><span>${icon("clock")} Report lunedì, 08:00</span></div></div><button class="pause-button" data-action="toggle">${icon(state.running ? "pause" : "play")}${state.running ? "Metti in pausa" : "Riprendi"}</button><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div></section>`;
}
function departmentGrid(expanded = false) {
  return `<div class="departments-grid">${departments.map((d, i) => `<button class="department-card ${i === 7 ? "orchestrator-card" : ""}" data-department="${i}"><div class="department-top"><span class="department-icon ${d.color}">${icon(d.icon)}</span><span class="day">${d.day}</span>${icon("arrow", "department-arrow")}</div><div class="department-name"><h3>${d.name}</h3><span>${d.count} agenti</span></div><p>${d.description}</p><div class="department-progress"><span class="${d.color}" style="width:${d.progress}%"></span></div><div class="department-footer"><span><i class="pulse-dot ${state.running ? "" : "off"}"></i>${state.running ? `${state.manager.agents.filter((a) => a.department === d.name && a.enabled).length} / ${d.count} agenti abilitati` : "Attività sospesa"}</span><span class="agent-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>${expanded ? `<div class="expanded-task">${d.task}${icon("chevron")}</div>` : ""}</button>`).join("")}</div>`;
}
const badgeClass = (status) =>
  ({
    Appuntamento: "sage",
    "In conversazione": "purple",
    Qualificato: "blue",
    "Messaggio pronto": "peach",
    "Da qualificare": "stone",
  })[status] || "stone";
function leadSection(full) {
  return `<section class="panel leads-panel"><div class="panel-heading"><div><h2>${full ? "La tua pipeline" : "Le prossime opportunità"} ${full ? `<span class="count-pill">${state.leads.length}</span>` : ""}</h2><p>${full ? "Contatti dimostrativi selezionati dal tuo team." : "Aziende giuste. Persone giuste. Al momento giusto."}</p></div>${full ? "" : `<button class="text-button" data-page="Clienti potenziali">Vedi tutte ${icon("arrow")}</button>`}</div>${full ? `<div class="table-toolbar"><label class="search-field">${icon("search")}<input id="lead-search" placeholder="Cerca azienda, persona o città…" value="${esc(state.query)}" aria-label="Cerca contatti"></label><label class="filter-select">${icon("filter")}<select id="lead-filter" aria-label="Filtra per stato">${["Tutti", "Appuntamento", "In conversazione", "Qualificato", "Messaggio pronto", "Da qualificare"].map((s) => `<option ${state.filter === s ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>` : ""}<div class="table-scroll"><table><thead><tr><th>Azienda</th><th>Compatibilità</th><th>Stato</th><th><span class="sr-only">Dettagli</span></th></tr></thead><tbody id="lead-rows">${leadRows(full)}</tbody></table></div><div class="table-footer"><span>${icon("shield")} Ogni contatto passa dal reparto Qualifica.</span><span>${full ? "Dati di esempio" : "Aggiornato adesso"}</span></div></section>`;
}
function leadRows(full = true) {
  const rows = full
    ? filterLeads(state.leads, state.query, state.filter)
    : state.leads.slice(0, 4);
  return rows.length
    ? rows
        .map(
          (l) =>
            `<tr><td><button class="company-cell" data-lead="${l.id}"><span class="company-logo ${l.color}">${esc(l.initials)}</span><span><strong>${esc(l.company)}</strong><small>${esc(l.sector)} <span class="city">· ${esc(l.city)}</span></small></span></button></td><td><div class="score">${icon("sparkles")} ${l.score}%</div></td><td><span class="status-badge ${badgeClass(l.status)}"><i></i>${l.status}</span></td><td><button class="icon-button" data-lead="${l.id}" aria-label="Apri ${esc(l.company)}">${icon("chevron")}</button></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4"><div class="empty-state">${icon("search")}<h3>Nessun contatto trovato</h3><p>Prova un’altra ricerca o cambia il filtro.</p></div></td></tr>`;
}
function activityPanel() {
  const activities = [
    ...state.activity,
    ...[
      {
        icon: "calendar",
        color: "sage",
        title: "Una nuova chiamata in agenda",
        text: "Giulia di Studio Forma ha confermato.",
        time: "2 min fa",
      },
      {
        icon: "message",
        color: "purple",
        title: "Il messaggio giusto, per Marco",
        text: "Nexora Digital ha risposto. Ci pensa il team.",
        time: "12 min fa",
      },
      {
        icon: "shield",
        color: "blue",
        title: "8 nuovi contatti qualificati",
        text: "In linea con il tuo profilo cliente ideale.",
        time: "28 min fa",
      },
      {
        icon: "sparkles",
        color: "peach",
        title: "Si impara, ogni giorno",
        text: "I messaggi brevi ricevono il 18% di risposte in più.",
        time: "45 min fa",
      },
    ],
  ].slice(0, 4);
  return `<section class="panel activity-panel"><div class="panel-heading"><h2>Succede nel tuo team</h2><span class="live-pill"><i class="pulse-dot ${state.running ? "" : "off"}"></i>${state.running ? "Live demo" : "In pausa"}</span></div><div class="activity-list">${activities.map((a) => `<div class="activity-item"><span class="activity-icon ${a.color}">${icon(a.icon)}</span><div><h4>${esc(a.title)}</h4><p>${esc(a.text)}</p><time>${a.time}</time></div></div>`).join("")}</div><button class="activity-more" data-action="simulate">${icon("play")}Esegui un ciclo demo ${icon("arrow")}</button></section>`;
}
function agendaPage() {
  const dates = ["14", "15", "16", "17", "18", "19", "20"];
  return `<div class="page-heading"><div><div class="eyebrow">IL TUO UNICO COMPITO</div><h1>Presentati. Al resto pensiamo noi.</h1><p>Appuntamenti dimostrativi · 14–20 settembre 2026</p></div><button class="button primary" data-action="calendar-info">${icon("calendar")}Collega calendario</button></div><div class="calendar-week">${["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d, i) => `<button data-day="${i}" class="calendar-day ${state.selectedDay === i ? "selected" : ""}"><span>${d}</span><strong>${dates[i]}</strong><i class="${[3, 4].includes(i) ? "has-event" : ""}"></i></button>`).join("")}</div><section class="panel agenda-panel"><div class="panel-heading"><h2>${["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"][state.selectedDay]} ${dates[state.selectedDay]} settembre</h2><span class="muted">Fuso orario: Europe/Rome</span></div>${
    [3, 4].includes(state.selectedDay)
      ? (state.selectedDay === 3
          ? [
              {
                name: "Giulia Moretti",
                company: "Studio Forma",
                time: "10:30",
                id: 1,
              },
              {
                name: "Marco Rinaldi",
                company: "Nexora Digital",
                time: "15:00",
                id: 2,
              },
            ]
          : [
              {
                name: "Sara Ricci",
                company: "Linea Studio",
                time: "11:00",
                id: 5,
              },
            ]
        )
          .map(
            (a) =>
              `<div class="meeting"><div class="meeting-time">${a.time}<small>30 minuti</small></div><div class="meeting-description"><span class="status-badge sage">Chiamata conoscitiva · Demo</span><h3>${a.name} <span>· ${a.company}</span></h3><p>Il reparto Agenda ha preparato tutto. Dai un’occhiata al profilo prima della chiamata.</p></div><button class="button" data-lead="${a.id}">Prepara la chiamata ${icon("arrow")}</button></div>`,
          )
          .join("")
      : `<div class="empty-state large">${icon("calendar")}<h3>Spazio per la tua prossima opportunità.</h3><p>Nessuna chiamata in questo giorno. Il prossimo incontro è giovedì 17.</p><button class="button" data-day="3">Vai al prossimo incontro ${icon("arrow")}</button></div>`
  }</section><div class="notice">${icon("shield")} Nessun calendario collegato. Gli appuntamenti mostrati sono esempi, non prenotazioni reali.</div>`;
}
function reportPage() {
  return `<div class="page-heading"><div><div class="eyebrow">OGNI SETTIMANA, UN PASSO AVANTI</div><h1>I numeri raccontano una storia.</h1><p>Il tuo report del lunedì. Tutto quello che conta, in dieci righe.</p></div><div class="console-heading-actions"><button class="button" data-console="download">${icon("download")}Report dettagliato agenti</button><button class="button primary" data-action="report">${icon("download")}Scarica report</button></div></div>${stats()}<div class="report-grid"><section class="panel"><div class="panel-heading"><div><h2>Il punto della settimana</h2><p>14–20 settembre 2026 · Report dimostrativo</p></div><span class="department-icon sage">${icon("chart")}</span></div><ol class="report-lines">${reportLines(
    state.leads,
    state.campaign,
  )
    .map((l) => `<li>${esc(l)}</li>`)
    .join(
      "",
    )}</ol></section><section class="panel insight-panel"><span class="department-icon yellow">${icon("sparkles")}</span><h2>La prossima settimana<br>parte già più precisa.</h2><p>Il reparto Apprendimento confronta segnali e risultati per migliorare il ciclo successivo.</p><div class="insight"><small>01 / SETTORI</small><h3>Il design risponde meglio</h3><p>Nel campione demo, architettura e design mostrano la compatibilità più alta.</p></div><div class="insight"><small>02 / MESSAGGI</small><h3>Meno parole, più conversazioni</h3><p>Ipotesi da validare con dati reali: testare messaggi brevi e una sola domanda.</p></div><span class="status-badge stone">Insight illustrativi, non risultati reali</span></section></div>`;
}
function settingsPage() {
  return `<div class="page-heading"><div><div class="eyebrow">LE REGOLE LE DECIDI TU</div><h1>Il tuo team, a modo tuo.</h1><p>Definisci il cliente ideale e i confini entro cui lavorare.</p></div></div><div class="settings-grid"><section class="panel settings-panel"><h2>Campagna attuale</h2><p>Queste preferenze vengono salvate solo in questo browser.</p><form id="settings-form">${campaignFields()}<div class="form-note">${icon("shield")}Follow-up: minimo 3 giorni. Nutrimento: ogni 14 giorni. Un solo contatto al giorno per destinatario.</div><button class="button primary" type="submit">${icon("check")}Salva preferenze</button></form></section><section class="panel settings-panel"><h2>Connessioni</h2><p>La modalità demo non effettua connessioni esterne.</p>${[
    ["mail", "Email aziendale", "Invio, risposte e controllo disiscrizioni"],
    [
      "calendar",
      "Google / Microsoft Calendar",
      "Disponibilità reale e appuntamenti",
    ],
    ["building", "CRM e fonti dati", "Contatti da fonti autorizzate"],
  ]
    .map(
      ([i, n, d]) =>
        `<div class="integration"><span class="department-icon stone">${icon(i)}</span><div><h3>${n}</h3><p>${d}</p><small>Non collegato</small></div><button class="button" data-action="integration">Configura</button></div>`,
    )
    .join(
      "",
    )}<div class="notice">${icon("shield")}Prima dell’invio reale servono verifica della base giuridica, gestione opt-out, revisione umana e credenziali lato server.</div></section></div>`;
}
function campaignFields(newCampaign = false) {
  return `<label class="form-label">Nome campagna<input name="name" required maxlength="90" value="${newCampaign ? "" : esc(state.campaign.name)}" placeholder="Es. Nuovi clienti · Lombardia"></label><div class="form-row"><label class="form-label">Settore ideale<input name="sector" required maxlength="80" value="${esc(state.campaign.sector)}" placeholder="Servizi B2B"></label><label class="form-label">Area geografica<input name="city" required maxlength="80" value="${esc(state.campaign.city)}" placeholder="Italia"></label></div><label class="form-label">Limite giornaliero di invio<input name="limit" type="number" min="1" max="200" required value="${Number(state.campaign.limit)}"><small>Da 1 a 200 messaggi. In demo non viene inviata alcuna email.</small></label>`;
}
function bind() {
  document.querySelectorAll("[data-page]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.preventDefault();
        state.page = b.dataset.page;
        state.query = "";
        state.filter = "Tutti";
        shell();
        window.scrollTo(0, 0);
      }),
  );
  document
    .querySelectorAll("[data-action]")
    .forEach((b) => (b.onclick = () => actions[b.dataset.action]?.()));
  document
    .querySelectorAll("[data-department]")
    .forEach(
      (b) => (b.onclick = () => departmentModal(Number(b.dataset.department))),
    );
  bindLeads();
  agentConsole.bind();
  document.querySelectorAll("[data-day]").forEach(
    (b) =>
      (b.onclick = () => {
        state.selectedDay = Number(b.dataset.day);
        shell();
      }),
  );
  document.querySelector("#lead-search")?.addEventListener("input", (e) => {
    state.query = e.target.value;
    updateRows();
  });
  document.querySelector("#lead-filter")?.addEventListener("change", (e) => {
    state.filter = e.target.value;
    updateRows();
  });
  document.querySelector("#settings-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    saveCampaign(e.target);
    toast("Preferenze salvate nel browser.");
  });
}
function bindLeads() {
  document
    .querySelectorAll("[data-lead]")
    .forEach((b) => (b.onclick = () => leadModal(Number(b.dataset.lead))));
}
function updateRows() {
  document.querySelector("#lead-rows").innerHTML = leadRows();
  bindLeads();
}
function saveCampaign(form) {
  const data = Object.fromEntries(new FormData(form));
  state.campaign = { ...data, limit: Number(data.limit) };
  persist();
}
let toastTimeout;
function toast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove("visible"), 4200);
}
let lastFocus;
function modal(title, content, subtitle = "") {
  lastFocus = document.activeElement;
  document.querySelector("#modal-root").innerHTML =
    `<div class="modal-overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="icon-button modal-close" aria-label="Chiudi">${icon("close")}</button><h2 id="modal-title">${title}</h2>${subtitle ? `<p class="modal-subtitle">${subtitle}</p>` : ""}${content}</section></div>`;
  document.querySelector(".modal-close").onclick = closeModal;
  document.querySelector(".modal-overlay").onclick = (e) => {
    if (e.target.classList.contains("modal-overlay")) closeModal();
  };
  document.querySelector(".modal input, .modal button")?.focus();
}
function closeModal() {
  document.querySelector("#modal-root").innerHTML = "";
  lastFocus?.focus();
}
document.addEventListener("keydown", (e) => {
  if (!document.querySelector(".modal")) return;
  if (e.key === "Escape") closeModal();
  if (e.key === "Tab") {
    const items = [
      ...document.querySelectorAll(
        ".modal button, .modal input, .modal select, .modal textarea, .modal a[href]",
      ),
    ].filter((el) => !el.disabled);
    const first = items[0],
      last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
function departmentModal(i) {
  const d = departments[i];
  const agents = state.manager.agents.filter((a) => a.department === d.name);
  modal(
    `${d.name} <span class="count-pill">${d.count} agenti</span>`,
    `<div class="department-modal-summary ${d.color}">${icon(d.icon)}<div><strong>${d.description}</strong><p>${d.task}</p></div></div><div class="agent-list">${agents.map((a, n) => `<button class="agent-row agent-catalog-row" data-catalog-agent="${a.id}"><span class="agent-number">${String(n + 1).padStart(2, "0")}</span><span><strong>${a.role}</strong><small>${a.id} · Gestisci incarico e priorità</small></span><span class="status-badge ${state.running && a.enabled ? "sage" : "stone"}">${agentStatus(a, state.running)}</span></button>`).join("")}</div>`,
    `${d.day} · Ruoli dimostrativi`,
  );
  document.querySelectorAll("[data-catalog-agent]").forEach(
    (b) =>
      (b.onclick = () => {
        closeModal();
        agentConsole.openAgent(b.dataset.catalogAgent);
      }),
  );
}

function leadModal(id) {
  const l = state.leads.find((x) => x.id === id);
  if (!l) return;
  modal(
    esc(l.company),
    `<div class="contact-profile"><span class="company-logo large-logo ${l.color}">${esc(l.initials)}</span><div><h3>${esc(l.name)}</h3><p>${esc(l.role)} · ${esc(l.city)}</p><small>${esc(l.email)}</small></div><div class="score">${icon("sparkles")}${l.score}%</div></div><div class="lead-context"><h3>Perché è un buon contatto</h3><p>Azienda nel settore ${esc(l.sector.toLowerCase())}, con un decisore identificato. La compatibilità e i segnali riportati sono esempi dimostrativi.</p></div><label class="form-label">Stato nella pipeline<select id="contact-status">${["Da qualificare", "Qualificato", "Messaggio pronto", "In conversazione", "Appuntamento"].map((s) => `<option ${s === l.status ? "selected" : ""}>${s}</option>`).join("")}</select></label><div class="message-preview"><small>BOZZA PERSONALIZZATA · NON INVIATA</small><p>Ciao ${esc(l.name.split(" ")[0])}, ho scoperto ${esc(l.company)} e il vostro lavoro nel settore ${esc(l.sector.toLowerCase())}. Aiutiamo le aziende a dedicare meno tempo alla ricerca commerciale e più tempo alle relazioni. È una priorità anche per voi in questo periodo?</p></div><div class="modal-actions"><button class="button" id="copy-message">${icon("message")}Copia bozza</button><button class="button primary" id="save-lead">${icon("check")}Salva stato</button></div>`,
    `${esc(l.sector)} · Contatto dimostrativo`,
  );
  document.querySelector("#save-lead").onclick = () => {
    l.status = document.querySelector("#contact-status").value;
    persist();
    closeModal();
    shell();
    toast("Stato del contatto aggiornato. Nessuna azione esterna eseguita.");
  };
  document.querySelector("#copy-message").onclick = async () => {
    try {
      await navigator.clipboard.writeText(
        document.querySelector(".message-preview p").textContent,
      );
      toast("Bozza copiata negli appunti.");
    } catch {
      toast("Copia non disponibile: seleziona il testo della bozza.");
    }
  };
}
function download(name, text, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const actions = {
  toggle() {
    state.running = !state.running;
    logEvent(
      state.manager,
      "SISTEMA",
      state.running
        ? "Pausa globale disattivata. Le pause individuali restano invariate."
        : "Pausa globale attivata: nessun ciclo demo eseguibile.",
    );
    persist();
    shell();
    toast(
      state.running
        ? "Simulazione ripresa. I reparti sono disponibili."
        : "Tutti i reparti sono in pausa.",
    );
  },
  campaign() {
    modal(
      "Una nuova opportunità inizia qui.",
      `<form id="campaign-form">${campaignFields(true)}<div class="form-note">${icon("sparkles")}Configura il profilo della campagna demo. I dati di esempio rimarranno nella pipeline.</div><button class="button primary full-width" type="submit">Crea campagna demo ${icon("arrow")}</button></form>`,
      "Racconta ai tuoi agenti chi stai cercando.",
    );
    document.querySelector("#campaign-form").onsubmit = (e) => {
      e.preventDefault();
      saveCampaign(e.target);
      closeModal();
      toast(`Campagna “${state.campaign.name}” creata in modalità demo.`);
    };
  },
  period() {
    modal(
      "Scegli il periodo",
      `<div class="period-options">${["Questa settimana", "Settimana scorsa"].map((p) => `<button class="button ${state.period === p ? "primary" : ""}" data-period="${p}">${icon("calendar")}${p}${state.period === p ? icon("check") : ""}</button>`).join("")}</div>`,
      "Confronta i risultati dei due periodi dimostrativi.",
    );
    document.querySelectorAll("[data-period]").forEach(
      (b) =>
        (b.onclick = () => {
          state.period = b.dataset.period;
          closeModal();
          shell();
        }),
    );
  },
  notifications() {
    modal(
      "Tutto quello che è successo",
      `<div class="notification-list"><div>${icon("calendar")}<div><h3>Studio Forma ha confermato</h3><p>Chiamata demo giovedì 17 settembre alle 10:30.</p></div></div><div>${icon("shield")}<div><h3>Il team rispetta i tuoi limiti</h3><p>Limite configurato: ${state.campaign.limit} invii al giorno. Invii reali: 0.</p></div></div><div>${icon("chart")}<div><h3>Il tuo report è pronto</h3><p>Trovi il riepilogo nella sezione Report & insight.</p></div></div></div>`,
      "Notifiche dell’ambiente dimostrativo",
    );
  },
  simulate() {
    if (!state.running) {
      toast("Riprendi gli agenti prima di eseguire un ciclo.");
      return;
    }
    const lead = state.leads.find((l) => l.status === "Da qualificare");
    if (lead) {
      lead.status = "Qualificato";
      state.activity.unshift({
        icon: "shield",
        color: "blue",
        title: `${lead.company} è qualificata`,
        text: "Verifica demo completata. Profilo aggiornato.",
        time: "Adesso",
      });
      persist();
      shell();
      toast("Ciclo demo completato: un contatto qualificato.");
    } else {
      toast("Tutti i contatti del campione sono già qualificati.");
    }
  },
  export() {
    const cells = (v) =>
      '"' +
      String(v)
        .replace(/^[=+@\-]/, "'")
        .replaceAll('"', '""') +
      '"';
    const rows = filterLeads(state.leads, state.query, state.filter);
    download(
      "agente-contatti-demo.csv",
      "\ufeff" +
        [
          ["Azienda", "Nome", "Settore", "Città", "Compatibilità", "Stato"],
          ...rows.map((l) => [
            l.company,
            l.name,
            l.sector,
            l.city,
            l.score,
            l.status,
          ]),
        ]
          .map((r) => r.map(cells).join(";"))
          .join("\r\n"),
      "text/csv;charset=utf-8",
    );
    toast(`${rows.length} contatti esportati.`);
  },
  report() {
    download(
      "agente-report-demo.txt",
      reportLines(state.leads, state.campaign).join("\n"),
    );
    toast("Report di 10 righe scaricato.");
  },
  "calendar-info"() {
    actions.integration();
  },
  integration() {
    modal(
      "Le connessioni arrivano dopo la demo.",
      `<div class="integration-info">${icon("shield")}<p>Questa versione funziona localmente: non richiede credenziali e non accede ai tuoi account.</p><h3>Per passare in produzione</h3><ul><li>Backend protetto e connessioni OAuth a email e calendario.</li><li>Fonti dati autorizzate e verifica della base giuridica.</li><li>Gestione disiscrizioni, limiti d’invio e revisione umana.</li><li>Conferma degli slot e monitoraggio degli errori.</li></ul></div>`,
      "Nessun account è collegato. Nessun invio è attivo.",
    );
  },
  help() {
    modal(
      "Un team grande. Un utilizzo semplice.",
      `<div class="help-content"><h3>01. Definisci il cliente ideale</h3><p>Crea una campagna e scegli settore, area geografica e limiti.</p><h3>02. Esplora il tuo team</h3><p>Apri un reparto per vedere tutti gli agenti e le loro responsabilità. Il pulsante pausa sospende la simulazione.</p><h3>03. Segui le opportunità</h3><p>Cerca e filtra i contatti, leggi le bozze e aggiorna gli stati. Esporta la lista o il report.</p><div class="notice">Questo è un prototipo interattivo. Le 67 schede rappresentano ruoli: non processi IA autonomi collegati a servizi reali.</div></div>`,
      "La tua guida rapida ad Agente",
    );
  },
  menu() {
    document.querySelector(".sidebar").classList.toggle("mobile-open");
  },
};
const agentConsole = createAgentConsole({
  state,
  icon,
  esc,
  modal,
  closeModal,
  shell,
  persist,
  toast,
  download,
});
shell();
