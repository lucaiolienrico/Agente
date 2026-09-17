export const GROQ_DEFAULT_MODEL = "openai/gpt-oss-20b";
export const GROQ_SEARCH_MODEL = "groq/compound-mini";

export function aiStatus(config) {
  const provider = config.provider || "groq";
  const label = provider === "groq" ? "Groq" : "OpenAI";
  const configured = Boolean(config.apiKey && config.model);
  const enabled = configured && !config.preview;
  const configHint =
    provider === "groq"
      ? "Configura AI_PROVIDER=groq, GROQ_API_KEY e GROQ_MODEL sul server."
      : "Configura AI_PROVIDER=openai, OPENAI_API_KEY e OPENAI_MODEL sul server.";
  const searchAllowed = provider === "openai" || config.searchEnabled === true;
  return {
    provider,
    label,
    configured,
    enabled,
    model: config.model || null,
    draftEnabled: enabled,
    researchEnabled: enabled && searchAllowed,
    researchModel:
      provider === "groq" ? GROQ_SEARCH_MODEL : config.model || null,
    configHint,
    researchHint: config.preview
      ? "Ricerca disabilitata nell’anteprima aperta."
      : !configured
        ? configHint
        : !searchAllowed
          ? "Groq è disponibile per le bozze. Ricerca web disattivata: verifica quote e costi di Compound Mini prima di impostare GROQ_SEARCH_ENABLED=true."
          : "Ricerca configurata, non ancora verificata con una chiamata reale. Controlla quote e costi nel tuo account.",
  };
}
