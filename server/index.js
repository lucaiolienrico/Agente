import { aiStatus } from "./ai-config.js";
import { resolve } from "node:path";
import { createStore } from "./store.js";
import { createProvider } from "./provider.js";
import { createAgent } from "./agent.js";
import { createApp, configFromEnv } from "./app.js";
import { createOutreachChannels } from "./outreach-channels.js";
import { createOutreach } from "./outreach.js";
import { outreachStatus } from "./outreach-domain.js";

const config = configFromEnv();
const store = createStore(
  resolve(
    process.env.DATA_DIR || "data",
    config.preview ? "preview-only.sqlite" : "petnote.sqlite",
  ),
);
store.recover();
const agent = createAgent(store, createProvider(config), config);
const outreach = createOutreach({
  store,
  config,
  outreach: config.outreach,
  channels: createOutreachChannels(config, config.outreach),
});
const app = createApp({ store, agent, config, outreach });
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, "0.0.0.0", () => {
  const channels = outreachStatus(config);
  console.log(`PetNote Partnership in ascolto sulla porta ${port}.`);
  console.log(
    config.preview
      ? "ANTEPRIMA APERTA: non inserire dati riservati; chiamate IA e invii esterni disabilitati."
      : `Accesso amministratore ${config.password ? "configurato" : "da configurare"}. ${aiStatus(config).label} ${config.apiKey && config.model ? "configurato (non ancora verificato)" : "non configurato"}.`,
  );
  console.log(
    `Contatti multicanale: ${channels.enabled ? "invii abilitati" : "invii disattivati"} · canali pronti: ${channels.readyChannels.length ? channels.readyChannels.join(", ") : "nessuno"} · limite ${channels.dailyLimit}/giorno UTC.`,
  );
  outreach.start();
});
function shutdown() {
  agent.shutdown();
  outreach.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
