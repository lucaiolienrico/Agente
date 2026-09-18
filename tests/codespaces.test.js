import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  statSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import {
  codespacesOrigin,
  setupCodespaces,
} from "../scripts/setup-codespaces.js";
import { configFromEnv } from "../server/app.js";

function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), "petnote-codespaces-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const env = {
  CODESPACE_NAME: "fixture-codespace",
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
};

test("Codespaces prepara HTTPS, password casuale, produzione e IA non configurata", (t) => {
  const directory = workspace(t);
  const result = setupCodespaces({ directory, env });
  assert.equal(result.created, true);
  const file = parseEnv(readFileSync(join(directory, ".env"), "utf8"));
  assert.equal(
    file.APP_ORIGIN,
    "https://fixture-codespace-3000.app.github.dev",
  );
  assert.equal(file.ADMIN_PASSWORD.length, 32);
  assert.equal(file.OPENAI_API_KEY, "");
  const config = configFromEnv(file);
  assert.equal(config.production, true);
  assert.equal(config.provider, "groq");
  assert.equal(file.GROQ_API_KEY, "");
  assert.equal(config.searchEnabled, false);
  assert.equal(config.preview, false);
  assert.equal(file.OUTREACH_ENABLED, "false");
  assert.equal(config.outreach.enabled, false);
  assert.equal(file.RESEND_API_KEY, "");
  assert.equal(file.WA_ACCESS_TOKEN, "");
  assert.equal(statSync(join(directory, ".env")).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(result).includes(file.ADMIN_PASSWORD));
});
test("il setup non sovrascrive segreti o configurazioni esistenti", (t) => {
  const directory = workspace(t);
  setupCodespaces({ directory, env });
  const original = readFileSync(join(directory, ".env"), "utf8");
  assert.equal(setupCodespaces({ directory, env }).created, false);
  assert.equal(readFileSync(join(directory, ".env"), "utf8"), original);
});
test("fuori da Codespaces non crea file e valida i valori usati nell’origine", (t) => {
  const directory = workspace(t);
  assert.equal(setupCodespaces({ directory, env: {} }).codespaces, false);
  assert.equal(existsSync(join(directory, ".env")), false);
  assert.throws(() =>
    codespacesOrigin({ ...env, CODESPACE_NAME: "bad\nvalue" }),
  );
  assert.throws(() =>
    codespacesOrigin({
      ...env,
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "example.org/path",
    }),
  );
});
test("non copia token GitHub, chiavi IA o password già fornite nei secrets", (t) => {
  const directory = workspace(t);
  const result = setupCodespaces({
    directory,
    env: {
      ...env,
      GITHUB_TOKEN: "fixture-token",
      OPENAI_API_KEY: "fixture-ai-secret",
      ADMIN_PASSWORD: "fixture-admin-password",
    },
  });
  const file = readFileSync(join(directory, ".env"), "utf8");
  assert.equal(result.passwordFromEnvironment, true);
  for (const secret of [
    "fixture-token",
    "fixture-ai-secret",
    "fixture-admin-password",
  ])
    assert.ok(!file.includes(secret));
});
