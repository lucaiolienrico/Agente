import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// No GitHub token is required, read or written by this setup.
export function codespacesOrigin(env) {
  const name = env.CODESPACE_NAME;
  if (!name) return null;
  const domain =
    env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev";
  if (
    !/^[a-z0-9-]+$/.test(name) ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]+$/.test(domain)
  ) {
    throw new Error("Nome Codespace o dominio di inoltro non valido.");
  }
  return `https://${name}-3000.${domain}`;
}

export function setupCodespaces({
  directory = process.cwd(),
  env = process.env,
} = {}) {
  const origin = codespacesOrigin(env);
  if (!origin) return { created: false, codespaces: false };
  // Prefer a pre-existing Codespaces secret without copying it into another file.
  const passwordFromEnvironment = Boolean(env.ADMIN_PASSWORD);
  const password = passwordFromEnvironment
    ? ""
    : randomBytes(24).toString("base64url");
  const content = `# File locale del Codespace, escluso da Git. Non condividerlo o pubblicarlo.
# Se ADMIN_PASSWORD è già un secret Codespaces, prevale sul valore di questo file.
NODE_ENV=production
PORT=3000
DATA_DIR=./data
APP_ORIGIN=${origin}
ADMIN_PASSWORD=${password}
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
GROQ_SEARCH_ENABLED=false
OPENAI_API_KEY=
OPENAI_MODEL=
DAILY_AI_LIMIT=10
DEV_AUTH_BYPASS=false
`;
  try {
    writeFileSync(resolve(directory, ".env"), content, {
      flag: "wx",
      mode: 0o600,
    });
    return { created: true, codespaces: true, origin, passwordFromEnvironment };
  } catch (error) {
    if (error.code === "EEXIST")
      return { created: false, codespaces: true, origin };
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = setupCodespaces();
  if (!result.codespaces) {
    console.log(
      "Questo comando prepara soltanto GitHub Codespaces. Per l’avvio locale segui README.md.",
    );
  } else {
    console.log(
      result.created
        ? "Configurazione privata .env creata. Nessuna chiave IA è stata generata o richiesta."
        : "Il file .env esiste già: non è stato modificato.",
    );
    console.log(`Origine HTTPS attesa (APP_ORIGIN): ${result.origin}`);
    console.log("Per avviare il workspace esegui: npm start");
    console.log("Apri la porta 3000 nel browser esterno e mantienila privata.");
    console.log(
      "Per il login usa ADMIN_PASSWORD dal file .env o dai tuoi secrets Codespaces. Non condividerla in chat.",
    );
  }
}
