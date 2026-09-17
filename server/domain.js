import { z } from "zod";
import { isIP } from "node:net";

export const regions = [
  "Tutta Italia",
  "Abruzzo",
  "Basilicata",
  "Calabria",
  "Campania",
  "Emilia-Romagna",
  "Friuli-Venezia Giulia",
  "Lazio",
  "Liguria",
  "Lombardia",
  "Marche",
  "Molise",
  "Piemonte",
  "Puglia",
  "Sardegna",
  "Sicilia",
  "Toscana",
  "Trentino-Alto Adige",
  "Umbria",
  "Valle d’Aosta",
  "Veneto",
];
export const defaultKnowledge = {
  offer:
    "PetNote è un’app web per i proprietari di animali: organizza vaccinazioni, visite, trattamenti e peso. Il programma partner pubblico propone a veterinari e pet shop una collaborazione gratuita con QR, link e materiali informativi. Esiste un piano Free per un animale e un piano Premium opzionale. Non è un gestionale per cliniche e non sostituisce il veterinario.",
  rules:
    "Non promettere risultati clinici o economici, commissioni, integrazioni, valore legale dei documenti o limiti Premium non verificati. Non affermare che ogni funzione sia gratuita. Per i pet shop chiarire la politica sui prodotti consigliati e sui link Amazon prima di proporre vantaggi commerciali. Il partner non riceve dati sanitari o nominativi dei proprietari.",
  approved: false,
  sources: [
    "https://www.petnote.it/",
    "https://www.petnote.it/partner",
    "https://www.petnote.it/termini",
  ],
  version: 1,
};
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function safeURL(value) {
  try {
    const u = new URL(value);
    const h = u.hostname.toLowerCase();
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.port ||
      isIP(h) ||
      h.includes(":") ||
      !h.includes(".") ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(h)
    )
      return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()])
      if (/^(utm_|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
    return u.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}
const publicURL = z
  .string()
  .max(1500)
  .refine(
    (v) => !!safeURL(v),
    "Inserisci un URL pubblico http/https, senza credenziali o porte.",
  )
  .transform(safeURL);
const short = (max) => z.string().trim().min(1).max(max);
export const partnerSchema = z
  .object({
    company: short(140),
    segment: z.enum(["veterinario", "pet_shop"]),
    city: short(80),
    region: z.enum(regions.slice(1)),
    sourceUrl: publicURL,
    evidence: short(1200),
    contactEmail: z
      .union([z.literal(""), z.string().email().max(200)])
      .default(""),
    contactBasis: z
      .enum(["unknown", "inbound", "consent", "opt_out"])
      .default("unknown"),
    contactEvidence: z.string().trim().max(1200).default(""),
    status: z
      .enum(["da_verificare", "qualificato", "escluso"])
      .default("da_verificare"),
    notes: z.string().trim().max(1600).default(""),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      ["inbound", "consent"].includes(p.contactBasis) &&
      p.contactEvidence.length < 10
    )
      ctx.addIssue({
        code: "custom",
        path: ["contactEvidence"],
        message:
          "Documenta origine, data e ambito della richiesta o del consenso (almeno 10 caratteri).",
      });
  });
export const researchSchema = z
  .object({
    segment: z.enum(["entrambi", "veterinario", "pet_shop"]),
    region: z.enum(regions),
    city: z.string().trim().max(80).default(""),
    limit: z.number().int().min(1).max(5).default(5),
  })
  .strict();
export const knowledgeSchema = z
  .object({ offer: short(3000), rules: short(3000), approved: z.boolean() })
  .strict();
export const draftEditSchema = z
  .object({ subject: short(140), body: short(4000) })
  .strict();
export function normalize(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
export function duplicateKey(p) {
  return `${normalize(p.company)}|${normalize(p.city)}`;
}
export function canApprove(partner, knowledge) {
  if (!knowledge.approved) return "Approva prima la scheda prodotto PetNote.";
  if (partner.status !== "qualificato")
    return "La struttura deve essere verificata e qualificata da una persona.";
  if (
    !["inbound", "consent"].includes(partner.contactBasis) ||
    partner.contactEvidence.length < 10
  )
    return "Manca una richiesta pertinente o un consenso documentato. Una fonte pubblica non autorizza il contatto.";
  if (!partner.contactEmail)
    return "Indica il recapito professionale autorizzato.";
  return null;
}
export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError(
      400,
      result.error.issues.map((i) => i.message).join(" "),
    );
  return result.data;
}
