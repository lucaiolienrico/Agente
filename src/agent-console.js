import { departments } from "./data.js";
import {
  priorities,
  agentMetrics,
  agentStatus,
  filterAgents,
  setEnabled,
  updateAgent,
  runAgents,
  reviewAgent,
  requeueAgent,
  detailedReport,
} from "./agents.js";
import "./agent-console.css";

export function createAgentConsole({
  state,
  icon,
  esc,
  modal,
  closeModal,
  shell,
  persist,
  toast,
  download,
}) {
  const ui = {
    view: "Agenti",
    query: "",
    department: "Tutti",
    status: "Tutti",
    selected: new Set(),
  };
  const manager = () => state.manager;
  const visible = () => filterAgents(manager().agents, ui, state.running);
  const effective = (a) => agentStatus(a, state.running);
  const date = (value) =>
    value
      ? new Date(value).toLocaleString("it-IT", {
          timeZone: "Europe/Rome",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "Mai eseguito";
  const badge = (a) =>
    `<span class="status-badge ${effective(a) === "Abilitato" ? "sage" : "stone"}"><i></i>${effective(a)}</span>`;
  const taskBadge = (a) =>
    `<span class="status-badge ${a.taskState === "Da approvare" ? "peach" : a.taskState === "Completato" ? "sage" : "blue"}">${a.taskState}</span>`;
  function stats() {
    const m = agentMetrics(manager(), state.running);
    return `<div class="console-stats">${[
      [
        m.enabled,
        "Agenti abilitati",
        `${m.paused} sospesi · ${m.total} totali`,
        "network",
        "sage",
      ],
      [
        m.queued,
        "Incarichi in coda",
        `${m.ready} pronti per un ciclo demo`,
        "clock",
        "blue",
      ],
      [
        m.review,
        "Da approvare",
        "Revisione umana degli esiti",
        "shield",
        "peach",
      ],
      [
        m.completed,
        "Completamenti demo",
        `${m.runs} esecuzioni cumulative`,
        "check",
        "purple",
      ],
    ]
      .map(
        ([n, title, sub, i, c]) =>
          `<div class="panel console-stat"><span class="department-icon ${c}">${icon(i)}</span><strong>${n}</strong><div>${title}<small>${sub}</small></div></div>`,
      )
      .join("")}</div>`;
  }
  function render() {
    const visibleIds = new Set(visible().map((a) => a.id));
    ui.selected = new Set([...ui.selected].filter((id) => visibleIds.has(id)));
    return `<div class="page-heading console-heading"><div><div class="eyebrow">CENTRALE DI CONTROLLO · MODALITÀ DEMO</div><h1>67 agenti. Il controllo è tuo<span class="title-dot">.</span></h1><p>Assegna le priorità, coordina il lavoro e approva ogni passaggio delicato.</p></div><div class="console-heading-actions"><button class="button" data-console="download">${icon("download")}Report dettagliato</button><button class="button primary" data-action="toggle">${icon(state.running ? "pause" : "play")}${state.running ? "Pausa globale" : "Riprendi sistema"}</button></div></div>${stats()}<div class="console-tabs"><div>${["Agenti", "Registro attività", "Report operativo"].map((view) => `<button data-console-view="${view}" class="${ui.view === view ? "selected" : ""}" aria-pressed="${ui.view === view}">${icon(view === "Agenti" ? "network" : view === "Registro attività" ? "clock" : "chart")}${view}</button>`).join("")}</div><span>${icon("shield")}Nessuna azione esterna</span></div>${ui.view === "Agenti" ? agentsView() : ui.view === "Registro attività" ? auditView() : reportView()}`;
  }
  function agentsView() {
    return `<div class="department-switcher" aria-label="Filtra gli agenti per reparto">${["Tutti", ...departments.map((d) => d.name)].map((name) => `<button data-console-department="${name}" aria-pressed="${ui.department === name}" class="${ui.department === name ? "selected" : ""}">${name}<span>${name === "Tutti" ? 67 : departments.find((d) => d.name === name).count}</span></button>`).join("")}</div><section class="panel console-agents"><div class="panel-heading"><div><h2>Il tuo team operativo <span id="console-total" class="count-pill">${visible().length} agenti</span></h2><p>Ogni ruolo ha un incarico, una priorità e un interruttore indipendente.</p></div><span class="console-demo-pill">Simulazione locale</span></div><div class="table-toolbar"><label class="search-field">${icon("search")}<input id="agent-query" aria-label="Cerca agenti" placeholder="Cerca per ID, ruolo o incarico…" value="${esc(ui.query)}"></label><label class="filter-select">${icon("filter")}<select id="agent-status" aria-label="Filtra stato agente">${["Tutti", "Abilitato", "In pausa", "Pausa globale", "In coda", "Da approvare", "Completato"].map((s) => `<option ${ui.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label></div><div id="console-selection">${selectionBar()}</div><div class="table-scroll console-table-scroll"><table class="console-table"><thead><tr><th><input type="checkbox" id="select-agents" aria-label="Seleziona tutti gli agenti visibili"></th><th>Agente / incarico</th><th>Reparto</th><th>Stato</th><th>Priorità</th><th>Workflow</th><th>Azioni</th></tr></thead><tbody id="agent-rows">${rows()}</tbody></table></div><div class="table-footer"><span>${icon("clock")}Ciclo manuale: massimo 5 incarichi, ordinati per priorità e ID.</span><span>Dati salvati in questo browser</span></div></section><div class="console-guide"><div>${icon("network")}<h3>Un incarico alla volta</h3><p>Apri un agente per modificare compito e istruzioni. I ruoli restano specializzati.</p></div><div>${icon("shield")}<h3>La revisione è tua</h3><p>Messaggi, risposte, agenda e nutrimento si fermano sempre prima dell’approvazione.</p></div><div>${icon("pause")}<h3>Puoi fermare tutto</h3><p>La pausa globale prevale sui singoli agenti, senza cancellare le loro impostazioni.</p></div></div>`;
  }
  function selectionBar() {
    const count = ui.selected.size;
    return `<div class="selection-bar"><strong>${count ? `${count} selezionati` : "Seleziona gli agenti da gestire"}<small>Massimo 5 incarichi per ciclo demo</small></strong><div><button class="button" data-console="pause" ${count ? "" : "disabled"}>${icon("pause")}Pausa selezionati</button><button class="button" data-console="resume" ${count ? "" : "disabled"}>${icon("play")}Abilita selezionati</button><button class="button primary" data-console="run" ${!state.running || !visible().length ? "disabled" : ""}>${icon("play")}Esegui ${count ? `su ${count} selezionati` : `su ${visible().length} visibili`}</button></div></div>`;
  }
  function rows() {
    const agents = visible();
    return agents.length
      ? agents
          .map(
            (a) =>
              `<tr><td><input type="checkbox" data-select-agent="${a.id}" aria-label="Seleziona ${a.id}" ${ui.selected.has(a.id) ? "checked" : ""}></td><td><button class="console-agent-name" data-manage-agent="${a.id}"><span class="department-icon ${a.color}">${icon(a.icon)}</span><span><small>${a.id}</small><strong>${esc(a.role)}</strong><span>${esc(a.task)}</span></span></button></td><td><span class="console-department">${a.department}</span></td><td>${badge(a)}</td><td><span class="priority-label ${a.priority === "Alta" ? "high" : ""}"><i></i>${a.priority}</span></td><td>${taskBadge(a)}<small class="console-last-run">${date(a.lastRun)}</small></td><td><div class="console-row-actions"><button class="icon-button" data-agent-toggle="${a.id}" aria-label="${a.enabled ? "Sospendi" : "Abilita"} ${a.id}" title="${a.enabled ? "Sospendi" : "Abilita"} agente">${icon(a.enabled ? "pause" : "play")}</button><button class="button" data-manage-agent="${a.id}" aria-label="Gestisci ${a.id}">Gestisci ${icon("chevron")}</button></div></td></tr>`,
          )
          .join("")
      : `<tr><td colspan="7"><div class="empty-state">${icon("search")}<h3>Nessun agente corrisponde ai filtri.</h3><p>Cambia reparto, stato o termine di ricerca.</p><button class="button" data-console="reset-filters">Azzera filtri</button></div></td></tr>`;
  }
  function auditView() {
    return `<section class="panel"><div class="panel-heading"><div><h2>Ogni decisione lascia una traccia <span class="count-pill">${manager().audit.length} eventi</span></h2><p>Ultimi 300 eventi della console · Europe/Rome · Dal più recente</p></div><button class="button" data-console="audit-export">${icon("download")}Esporta registro</button></div>${
      manager().audit.length
        ? `<div class="console-audit">${manager()
            .audit.map(
              (e) =>
                `<div class="audit-event"><span class="activity-icon stone">${icon("clock")}</span><time datetime="${esc(e.time)}">${date(e.time)}</time><span class="audit-id">${esc(e.agentId)}</span><p>${esc(e.message)}</p></div>`,
            )
            .join("")}</div>`
        : `<div class="empty-state large">${icon("clock")}<h3>Il registro inizia con la tua prima azione.</h3><p>Configura un agente, modifica uno stato o esegui un ciclo demo.</p></div>`
    }</section><div class="notice">${icon("shield")}Il registro riguarda solo la console agenti e l’interruttore globale. Non è un audit certificato: è locale, modificabile dal browser e limitato agli ultimi 300 eventi.</div>`;
  }
  function reportView() {
    const m = agentMetrics(manager(), state.running);
    return `<div class="console-report-grid"><section class="panel"><div class="panel-heading"><div><h2>Il punto, reparto per reparto</h2><p>Contatori dinamici della console, non KPI commerciali.</p></div>${icon("chart")}</div><div class="table-scroll"><table class="console-report-table"><thead><tr><th>Reparto</th><th>Abilitati</th><th>In coda</th><th>Revisione</th><th>Completamenti</th></tr></thead><tbody>${departments
      .map((d) => {
        const k = agentMetrics(
          { agents: manager().agents.filter((a) => a.department === d.name) },
          state.running,
        );
        return `<tr><td><span class="report-department">${icon(d.icon)}${d.name}</span></td><td>${k.enabled} / ${k.total}</td><td>${k.queued}</td><td>${k.review}</td><td>${k.completed}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><div class="console-report-note">${m.runs} esecuzioni demo · ${m.completed} completamenti cumulativi. Riaprire un incarico non azzera i contatori.</div></section><section class="panel console-readiness"><span class="department-icon sage">${icon("shield")}</span><h2>Pronti a coordinare.<br>Non ancora a contattare.</h2><p>Il controllo operativo funziona nel browser. Le connessioni esterne sono tutte da implementare.</p>${[
      ["Console e persistenza locale", true],
      ["Approvazione manuale demo", true],
      ["Modelli IA e worker", false],
      ["CRM, email e calendario", false],
      ["Scheduler e policy di invio", false],
    ]
      .map(
        ([label, ready]) =>
          `<div>${icon(ready ? "check" : "clock")}<span>${label}</span><small>${ready ? "Demo pronta" : "Da integrare"}</small></div>`,
      )
      .join(
        "",
      )}</section></div><section class="panel console-report-summary"><div><h2>Un report completo, non solo numeri.</h2><p>Scarica sintesi, inventario dei 67 agenti, incarichi, registro, limiti e piano di rilascio. Lo snapshot riflette lo stato attuale del browser.</p></div><button class="button primary" data-console="download">${icon("download")}Scarica report .md</button></section><div class="notice">${icon("help")}Abilitato non significa “processo IA in esecuzione”. Gli esiti sono riepiloghi deterministici. Nessun risultato di vendita, costo token o ROI è misurato.</div>`;
  }
  function refresh() {
    const ids = new Set(visible().map((a) => a.id));
    ui.selected = new Set([...ui.selected].filter((id) => ids.has(id)));
    persist();
    shell();
  }
  function bindActions() {
    document.querySelectorAll("[data-console]").forEach(
      (b) =>
        (b.onclick = () => {
          const action = b.dataset.console;
          if (action === "download") {
            download(
              "agente-report-dettagliato.md",
              detailedReport(manager(), state.running, state.campaign),
              "text/markdown;charset=utf-8",
            );
            toast("Report dettagliato scaricato con lo stato attuale.");
          } else if (action === "audit-export") {
            download(
              "agente-registro-demo.json",
              JSON.stringify(
                {
                  mode: "demo",
                  exportedAt: new Date().toISOString(),
                  events: manager().audit,
                },
                null,
                2,
              ),
              "application/json",
            );
          } else if (action === "reset-filters") {
            ui.query = "";
            ui.status = "Tutti";
            ui.department = "Tutti";
            ui.selected.clear();
            shell();
          } else if (action === "pause" || action === "resume") {
            const count = setEnabled(
              manager(),
              [...ui.selected],
              action === "resume",
            );
            refresh();
            toast(
              `${count} agenti ${action === "resume" ? "abilitati" : "sospesi"}.${!state.running ? " La pausa globale resta attiva." : ""}`,
            );
          } else if (action === "run") {
            const result = runAgents(
              manager(),
              state.running,
              ui.selected.size ? [...ui.selected] : visible().map((a) => a.id),
            );
            refresh();
            toast(
              result.reason ||
                `${result.processed} incarichi simulati; ${result.review} esiti da approvare. Nessuna azione esterna.`,
            );
          }
        }),
    );
  }
  function updateSelection() {
    document.querySelector("#console-selection").innerHTML = selectionBar();
    const box = document.querySelector("#select-agents");
    const all = visible();
    box.checked = !!all.length && all.every((a) => ui.selected.has(a.id));
    box.indeterminate = ui.selected.size > 0 && !box.checked;
    box.disabled = !all.length;
    bindActions();
  }
  function bindRows() {
    document
      .querySelectorAll("[data-manage-agent]")
      .forEach((b) => (b.onclick = () => openAgent(b.dataset.manageAgent)));
    document.querySelectorAll("[data-agent-toggle]").forEach(
      (b) =>
        (b.onclick = () => {
          const a = manager().agents.find(
            (a) => a.id === b.dataset.agentToggle,
          );
          setEnabled(manager(), [a.id], !a.enabled);
          refresh();
        }),
    );
    document.querySelectorAll("[data-select-agent]").forEach(
      (b) =>
        (b.onchange = () => {
          b.checked
            ? ui.selected.add(b.dataset.selectAgent)
            : ui.selected.delete(b.dataset.selectAgent);
          updateSelection();
        }),
    );
  }
  function updateRows() {
    ui.selected.clear();
    document.querySelector("#agent-rows").innerHTML = rows();
    document.querySelector("#console-total").textContent =
      `${visible().length} agenti`;
    bindRows();
    updateSelection();
  }
  function bind() {
    bindActions();
    document.querySelectorAll("[data-console-view]").forEach(
      (b) =>
        (b.onclick = () => {
          ui.view = b.dataset.consoleView;
          shell();
        }),
    );
    document.querySelectorAll("[data-console-department]").forEach(
      (b) =>
        (b.onclick = () => {
          ui.department = b.dataset.consoleDepartment;
          ui.selected.clear();
          shell();
        }),
    );
    document.querySelector("#agent-query")?.addEventListener("input", (e) => {
      ui.query = e.target.value;
      updateRows();
    });
    document.querySelector("#agent-status")?.addEventListener("change", (e) => {
      ui.status = e.target.value;
      updateRows();
    });
    const selectAll = document.querySelector("#select-agents");
    if (selectAll) {
      selectAll.onchange = () => {
        ui.selected = selectAll.checked
          ? new Set(visible().map((a) => a.id))
          : new Set();
        document.querySelector("#agent-rows").innerHTML = rows();
        bindRows();
        updateSelection();
      };
      bindRows();
      updateSelection();
    }
  }
  function openAgent(id) {
    const a = manager().agents.find((a) => a.id === id);
    if (!a) return;
    modal(
      `${esc(a.role)}`,
      `<div class="agent-editor-intro"><span class="department-icon ${a.color}">${icon(a.icon)}</span><div><strong>${a.id} · ${a.department}</strong><small>${a.completed} completamenti · ${a.runs} esecuzioni · ${date(a.lastRun)}</small></div>${badge(a)}</div><form id="agent-editor"><label class="form-label">Incarico corrente<textarea name="task" required maxlength="600" rows="3">${esc(a.task)}</textarea></label><label class="form-label">Istruzioni operative<textarea name="instructions" required maxlength="1200" rows="4">${esc(a.instructions)}</textarea><small>Registrate nel simulatore; non eseguite da un modello IA. Non inserire dati sensibili.</small></label><label class="form-label">Priorità<select name="priority" aria-label="Priorità">${priorities.map((p) => `<option ${p === a.priority ? "selected" : ""}>${p}</option>`).join("")}</select></label><div class="editor-save"><span>Modificare incarico o istruzioni riapre la coda.</span><button class="button primary" type="submit">${icon("check")}Salva configurazione</button></div></form><div class="agent-workflow"><div><h3>Esito dell’incarico salvato</h3>${taskBadge(a)}</div>${a.output ? `<pre>${esc(a.output)}</pre>` : `<p>Nessun esito corrente. Salva prima le modifiche, poi esegui una simulazione.</p>`}<div class="modal-actions">${a.taskState === "Da approvare" ? `<button class="button" id="reject-agent">Rimetti in coda</button><button class="button primary" id="approve-agent">${icon("check")}Approva esito demo</button>` : a.taskState === "Completato" ? `<button class="button" id="requeue-agent">${icon("reply")}Riapri incarico</button>` : `<button class="button" id="run-agent" ${!state.running || !a.enabled ? "disabled" : ""}>${icon("play")}Esegui incarico salvato</button>`}</div>${!state.running || !a.enabled ? '<p class="editor-warning">Esecuzione sospesa: verifica la pausa globale e lo stato individuale.</p>' : ""}</div>`,
      "Scheda di gestione · Agente simulato",
    );
    document.querySelector("#agent-editor").onsubmit = (e) => {
      e.preventDefault();
      try {
        updateAgent(manager(), id, Object.fromEntries(new FormData(e.target)));
        closeModal();
        refresh();
        toast("Configurazione salvata nel browser.");
      } catch (error) {
        toast(error.message);
      }
    };
    document.querySelector("#run-agent")?.addEventListener("click", () => {
      runAgents(manager(), state.running, [id]);
      closeModal();
      refresh();
      openAgent(id);
    });
    for (const [selector, approved] of [
      ["#approve-agent", true],
      ["#reject-agent", false],
    ])
      document.querySelector(selector)?.addEventListener("click", () => {
        reviewAgent(manager(), id, approved);
        closeModal();
        refresh();
        openAgent(id);
      });
    document.querySelector("#requeue-agent")?.addEventListener("click", () => {
      requeueAgent(manager(), id);
      closeModal();
      refresh();
      openAgent(id);
    });
  }
  return { render, bind, openAgent };
}
