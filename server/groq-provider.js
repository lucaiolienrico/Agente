import { z } from "zod";
import { AppError, safeURL } from "./domain.js";
import { aiStatus, GROQ_SEARCH_MODEL } from "./ai-config.js";
import {
  system,
  draftFormat,
  researchFormat,
  validateResearch,
} from "./provider-common.js";

export function parseGroqOutput(response) {
  const choice = response?.choices?.[0];
  if (
    choice?.finish_reason !== "stop" ||
    typeof choice.message?.content !== "string"
  ) {
    throw new AppError(
      502,
      "Risposta Groq incompleta o non utilizzabile. Nessun risultato importato.",
    );
  }
  const text = choice.message.content.trim();
  // Compound does not combine structured output with tools. Accept a single JSON
  // object (optionally fenced), never extract fragments from arbitrary prose.
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
  try {
    return JSON.parse(fenced ? fenced[1] : text);
  } catch {
    throw new AppError(
      502,
      "Formato Groq non valido. Nessun risultato importato e nessun retry automatico.",
    );
  }
}

export function groqSearchSources(response) {
  const urls = new Set();
  let searched = false;
  const tools = response?.choices?.[0]?.message?.executed_tools;
  if (!Array.isArray(tools)) return { searched, urls: [] };
  for (const tool of tools) {
    // Only provider tool metadata counts as evidence, never model text/reasoning.
    const results = tool?.search_results?.results;
    if (!Array.isArray(results)) continue;
    searched = true;
    for (const result of results) {
      const url = safeURL(result?.url);
      if (url) urls.add(url);
    }
  }
  return { searched, urls: [...urls] };
}

export function createGroqProvider(config, { fetchImpl = fetch } = {}) {
  async function request(payload, signal) {
    if (config.preview)
      throw new AppError(
        409,
        "Le chiamate IA sono disabilitate nell’anteprima aperta.",
      );
    if (!config.apiKey || !config.model)
      throw new AppError(503, aiStatus(config).configHint);
    let response;
    try {
      response = await fetchImpl(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.any([
            signal || new AbortController().signal,
            AbortSignal.timeout(120000),
          ]),
          body: JSON.stringify({ stream: false, ...payload }),
        },
      );
    } catch {
      if (signal?.aborted) throw new AppError(409, "Operazione annullata.");
      throw new AppError(
        502,
        "Groq non raggiungibile o tempo massimo superato. Nessun retry e nessun passaggio a OpenAI.",
      );
    }
    if (!response.ok) {
      const message =
        response.status === 401 || response.status === 403
          ? "Chiave Groq non valida o accesso non autorizzato. Verifica la configurazione sul server."
          : response.status === 429
            ? "Quota o limite Groq raggiunto. Attendi il ripristino della quota: nessun upgrade, retry o passaggio a OpenAI automatico."
            : response.status === 400 || response.status === 404
              ? "Modello o formato Groq non disponibile. Verifica GROQ_MODEL e le capacità previste dalla configurazione."
              : "Errore Groq. Nessun risultato importato e nessun passaggio ad altri provider.";
      throw new AppError(502, message);
    }
    try {
      return await response.json();
    } catch {
      throw new AppError(502, "Risposta Groq non leggibile.");
    }
  }
  const usage = (response) => ({
    input_tokens: response.usage?.prompt_tokens,
    output_tokens: response.usage?.completion_tokens,
  });
  return {
    async draft(partner, knowledge, signal) {
      const { type, ...json_schema } = draftFormat;
      const response = await request(
        {
          model: config.model,
          max_completion_tokens: 2048,
          messages: [
            {
              role: "system",
              content:
                system +
                "\nPrepara una singola email in italiano: oggetto massimo 140 caratteri, corpo massimo 4000. Usa solo la scheda prodotto approvata. Non affermare che ci siano stati contatti precedenti o kit già consegnati. Una richiesta finale per ricevere informazioni o una demo. Rispondi in JSON con subject e body. Nessun invio.",
            },
            {
              role: "user",
              content: JSON.stringify({
                product: { offer: knowledge.offer, rules: knowledge.rules },
                untrustedPartner: {
                  company: partner.company,
                  segment: partner.segment,
                  city: partner.city,
                  sourceUrl: partner.sourceUrl,
                  evidence: partner.evidence,
                },
              }),
            },
          ],
          response_format: { type, json_schema },
        },
        signal,
      );
      const parsed = z
        .object({
          subject: z.string().trim().min(1).max(140),
          body: z.string().trim().min(1).max(4000),
        })
        .strict()
        .safeParse(parseGroqOutput(response));
      if (!parsed.success)
        throw new AppError(
          502,
          "Bozza Groq non valida. Nessun contenuto salvato.",
        );
      return { ...parsed.data, usage: usage(response) };
    },
    async research(input, signal) {
      if (!aiStatus(config).researchEnabled)
        throw new AppError(
          config.preview ? 409 : !config.apiKey ? 503 : 409,
          aiStatus(config).researchHint,
        );
      const response = await request(
        {
          model: GROQ_SEARCH_MODEL,
          max_completion_tokens: 6000,
          compound_custom: { tools: { enabled_tools: ["web_search"] } },
          search_settings: {
            country: "italy",
            exclude_domains: ["inipec.gov.it", "*.inipec.gov.it"],
          },
          messages: [
            {
              role: "system",
              content:
                system +
                "\nUsa lo strumento web_search per cercare strutture reali. Restituisci esclusivamente un oggetto JSON, senza commenti o citazioni fuori dal JSON, conforme a questo schema: " +
                JSON.stringify(researchFormat.schema),
            },
            {
              role: "user",
              content: JSON.stringify({
                task: "Ricerca pubblica di partner italiani PetNote. Per ogni struttura indica nome, attività, comune, regione e ragione di pertinenza. Usa soltanto URL presenti nei risultati dello strumento. Non raccogliere email, PEC, telefoni, clienti o dati sanitari. Non inventare aziende: restituisci meno risultati, anche zero, se non trovi prove. Pet shop e negozi animali sono categorie sovrapposte.",
                filters: input,
              }),
            },
          ],
        },
        signal,
      );
      const output = parseGroqOutput(response);
      const sources = groqSearchSources(response);
      if (!sources.searched)
        throw new AppError(
          502,
          "Groq non ha restituito risultati dello strumento web. Nessuna struttura importata: il testo del modello non basta come fonte.",
        );
      // Reuse the exact same region, segment, limit and source validation as OpenAI.
      const validated = validateResearch(
        {
          status: "completed",
          output: [
            {
              type: "web_search_call",
              action: { sources: sources.urls.map((url) => ({ url })) },
            },
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(output) }],
            },
          ],
        },
        input,
      );
      return { ...validated, usage: usage(response) };
    },
  };
}
