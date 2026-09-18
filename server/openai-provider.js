import { z } from "zod";
import { AppError } from "./domain.js";
import {
  system,
  researchFormat,
  draftFormat,
  validateResearch,
  parseOutput,
} from "./provider-common.js";
export function createOpenAIProvider(config, { fetchImpl = fetch } = {}) {
  async function request(payload, signal) {
    if (config.preview)
      throw new AppError(
        409,
        "Le chiamate IA sono disabilitate nell’anteprima aperta.",
      );
    if (!config.apiKey || !config.model)
      throw new AppError(
        503,
        "Configura OPENAI_API_KEY e OPENAI_MODEL sul server. Nessuna ricerca viene simulata.",
      );
    let response;
    try {
      response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.any([
          signal || new AbortController().signal,
          AbortSignal.timeout(120000),
        ]),
        body: JSON.stringify({
          model: config.model,
          store: false,
          max_output_tokens: 6000,
          ...payload,
        }),
      });
    } catch (e) {
      if (signal?.aborted) throw new AppError(409, "Operazione annullata.");
      throw new AppError(
        502,
        "Provider non raggiungibile o tempo massimo superato. Nessun tentativo automatico.",
      );
    }
    if (!response.ok) {
      const message =
        response.status === 401
          ? "Chiave del provider non valida. Controlla la configurazione sul server."
          : response.status === 429
            ? "Quota o limite del provider raggiunto."
            : response.status === 400
              ? "Modello o strumenti non compatibili. Verifica Responses, web_search e Structured Outputs."
              : "Errore del provider. Nessun risultato importato.";
      throw new AppError(502, message);
    }
    try {
      return await response.json();
    } catch {
      throw new AppError(502, "Risposta del provider non leggibile.");
    }
  }
  return {
    async research(input, signal) {
      const response = await request(
        {
          instructions: system,
          input: `Ricerca ora sul web fino a ${input.limit} strutture reali. Segmento: ${input.segment}. Regione: ${input.region}. Comune, se specificato: ${input.city || "qualsiasi"}.
Usa fonti pubbliche autorizzate, preferisci siti ufficiali. Pet shop e negozio di animali sono categorie sovrapposte da deduplicare. Non includere privati, studi umani, attività estere o strutture ipotetiche.
Per ogni struttura indica ragione di pertinenza, città, regione e URL esatto della fonte visitata dallo strumento. La evidence deve descrivere l'evidenza trovata, non l'intenzione di acquisto. Non riportare email, numeri personali, PEC o dati di proprietari. Se non trovi evidenze restituisci un array vuoto.`,
          tools: [
            {
              type: "web_search",
              search_context_size: "low",
              user_location: { type: "approximate", country: "IT" },
            },
          ],
          tool_choice: "required",
          max_tool_calls: 3,
          include: ["web_search_call.action.sources"],
          text: { format: researchFormat },
        },
        signal,
      );
      return {
        ...validateResearch(response, input),
        usage: response.usage || {},
      };
    },
    async draft(partner, knowledge, signal) {
      const response = await request(
        {
          instructions:
            system +
            `\nPrepara una singola email in italiano: oggetto massimo 140 caratteri, corpo massimo 4000. Nessun invio. Non citare consenso, chiamate o contatti precedenti come avvenuti. Una sola richiesta finale: ricevere informazioni sul kit o una breve demo. Non inventare un kit già consegnato. Usa soltanto la scheda prodotto approvata.`,
          input: JSON.stringify({
            product: { offer: knowledge.offer, rules: knowledge.rules },
            untrustedPartner: {
              company: partner.company,
              segment: partner.segment,
              city: partner.city,
              evidence: partner.evidence,
              sourceUrl: partner.sourceUrl,
            },
          }),
          text: { format: draftFormat },
        },
        signal,
      );
      const parsed = z
        .object({
          subject: z.string().trim().min(1).max(140),
          body: z.string().trim().min(1).max(4000),
        })
        .strict()
        .safeParse(parseOutput(response));
      if (!parsed.success)
        throw new AppError(
          502,
          "Bozza IA non valida. Nessun contenuto salvato.",
        );
      return { ...parsed.data, usage: response.usage || {} };
    },
  };
}
