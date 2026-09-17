import { AppError } from "./domain.js";

export function createAgent(store, provider, config) {
  let busy = false;
  let controller = null;
  let activeId = null;
  const available = () => {
    if (config.preview)
      throw new AppError(
        409,
        "Anteprima aperta: le chiamate IA sono disabilitate. Nessuna simulazione di ricerca.",
      );
    if (!config.apiKey || !config.model)
      throw new AppError(
        503,
        "Collega il provider sul server: servono OPENAI_API_KEY e OPENAI_MODEL.",
      );
    if (store.isPaused()) throw new AppError(409, "L’agente è in pausa.");
    const jobs = store.jobs();
    const pending = jobs.filter((j) =>
      ["queued", "running"].includes(j.status),
    ).length;
    const queued = jobs.filter((j) => j.status === "queued").length;
    if (pending >= 5)
      throw new AppError(429, "La coda contiene già cinque lavori.");
    if (store.callCount() + queued >= config.dailyLimit)
      throw new AppError(
        429,
        "Limite giornaliero delle richieste IA raggiunto (giorno UTC).",
      );
  };
  async function pump() {
    if (busy || store.isPaused()) return;
    const job = store
      .jobs()
      .filter((j) => j.status === "queued")
      .at(-1);
    if (!job) return;
    busy = true;
    activeId = job.id;
    controller = new AbortController();
    store.updateJob(job.id, {
      status: "running",
      startedAt: new Date().toISOString(),
    });
    try {
      if (store.callCount() >= config.dailyLimit)
        throw new AppError(429, "Limite giornaliero raggiunto.");
      if (job.kind === "draft") {
        const current = store.partner(job.request.partnerId);
        if (
          !current ||
          current.contactBasis === "opt_out" ||
          current.status === "escluso"
        )
          throw new AppError(409, "Struttura esclusa o in opt-out.");
        if (
          !store.knowledge().approved ||
          store.knowledge().version !== job.request.knowledge.version
        )
          throw new AppError(
            409,
            "Scheda prodotto cambiata: richiedi una nuova bozza.",
          );
      }
      const callId = store.startCall();
      store.log(
        job.id,
        "Chiamata al provider avviata. Può comportare costi del provider.",
      );
      const result =
        job.kind === "research"
          ? await provider.research(job.request, controller.signal)
          : await provider.draft(
              job.request.partner,
              job.request.knowledge,
              controller.signal,
            );
      store.finishCall(callId, result.usage);
      if (store.job(job.id).status === "cancelled" || store.isPaused()) return;
      store.db.exec("BEGIN IMMEDIATE");
      try {
        let summary;
        if (job.kind === "research") {
          let added = 0;
          let duplicates = 0;
          for (const p of result.partners) {
            const created = store.addPartner(
              {
                company: p.company,
                segment: p.segment,
                city: p.city,
                region: p.region,
                sourceUrl: p.sourceUrl,
                evidence: p.evidence,
                contactEmail: "",
                contactBasis: "unknown",
                contactEvidence: "",
                status: "da_verificare",
                notes: "",
              },
              { origin: "ai", jobId: job.id },
            );
            created ? added++ : duplicates++;
          }
          summary = {
            added,
            duplicates,
            discarded: result.discarded,
            sources: result.sources,
          };
        } else {
          const current = store.partner(job.request.partnerId);
          if (
            current.contactBasis === "opt_out" ||
            current.status === "escluso"
          )
            throw new AppError(
              409,
              "Struttura esclusa durante il lavoro. Bozza non salvata.",
            );
          if (
            !store.knowledge().approved ||
            store.knowledge().version !== job.request.knowledge.version
          )
            throw new AppError(
              409,
              "Scheda prodotto cambiata durante il lavoro. Bozza non salvata.",
            );
          const d = store.addDraft(
            job.request.partnerId,
            { subject: result.subject, body: result.body },
            job.request.knowledge.version,
            job.id,
          );
          summary = { draftId: d.id };
        }
        store.updateJob(job.id, {
          status: "completed",
          finishedAt: new Date().toISOString(),
          result: summary,
        });
        store.log(
          job.id,
          job.kind === "research"
            ? `Ricerca conclusa: ${summary.added} nuove strutture, ${summary.duplicates} duplicati, ${summary.discarded} risultati scartati. Tutti da verificare.`
            : "Bozza salvata per revisione. Nessun invio.",
        );
        store.db.exec("COMMIT");
      } catch (e) {
        store.db.exec("ROLLBACK");
        throw e;
      }
    } catch (error) {
      if (store.job(job.id).status !== "cancelled") {
        const message =
          error instanceof AppError
            ? error.message
            : "Operazione non completata. Controlla configurazione e disponibilità del servizio.";
        store.updateJob(job.id, {
          status: "failed",
          error: message,
          finishedAt: new Date().toISOString(),
        });
        store.log(job.id, message);
      }
    } finally {
      busy = false;
      activeId = null;
      controller = null;
      setImmediate(pump);
    }
  }
  return {
    enqueueResearch(request) {
      available();
      const j = store.addJob("research", request);
      setImmediate(pump);
      return j;
    },
    enqueueDraft(id) {
      available();
      const partner = store.partner(id);
      if (!partner) throw new AppError(404, "Struttura non trovata.");
      if (partner.contactBasis === "opt_out" || partner.status === "escluso")
        throw new AppError(409, "Struttura esclusa o in opt-out.");
      const knowledge = store.knowledge();
      if (!knowledge.approved)
        throw new AppError(409, "Approva prima la scheda prodotto.");
      if (
        store
          .jobs()
          .some(
            (j) =>
              j.kind === "draft" &&
              ["queued", "running"].includes(j.status) &&
              j.request.partnerId === id,
          )
      )
        throw new AppError(
          409,
          "Esiste già una bozza in lavorazione per questa struttura.",
        );
      const j = store.addJob("draft", { partnerId: id, partner, knowledge });
      setImmediate(pump);
      return j;
    },
    cancel(id) {
      const j = store.job(id);
      if (!j) throw new AppError(404, "Lavoro non trovato.");
      if (!["queued", "running"].includes(j.status))
        throw new AppError(409, "Il lavoro è già terminato.");
      store.updateJob(id, {
        status: "cancelled",
        finishedAt: new Date().toISOString(),
      });
      if (activeId === id) controller?.abort();
      store.log(
        id,
        "Lavoro annullato. Eventuali costi già maturati presso il provider non sono annullabili.",
      );
    },
    pause(value) {
      store.setPaused(value);
      if (value)
        for (const j of store
          .jobs()
          .filter((j) => ["queued", "running"].includes(j.status)))
          this.cancel(j.id);
    },
    shutdown() {
      if (activeId) controller?.abort();
    },
    idle: () => !busy && !store.jobs().some((j) => j.status === "queued"),
  };
}
