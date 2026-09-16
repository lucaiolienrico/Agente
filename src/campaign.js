export const defaultCampaign = Object.freeze({
  name: "Veterinari & Pet shop · Italia",
  sector: "Veterinari, pet shop e negozi di animali",
  city: "Italia",
  limit: 40,
  offer: "",
});

// Upgrade only the untouched original template; never overwrite a custom campaign.
export function resolveCampaign(raw) {
  const saved = raw && typeof raw === "object" ? raw : {};
  const legacy =
    saved.name === "Nuovi clienti · Italia" &&
    saved.sector === "Servizi B2B" &&
    saved.city === "Italia" &&
    !saved.offer;
  const source = legacy ? { ...defaultCampaign, limit: saved.limit } : saved;
  const field = (key, max) =>
    typeof source[key] === "string" && source[key].trim()
      ? source[key].trim().slice(0, max)
      : defaultCampaign[key];
  return {
    name: field("name", 90),
    sector: field("sector", 80),
    city: field("city", 80),
    offer:
      typeof source.offer === "string" ? source.offer.trim().slice(0, 600) : "",
    limit:
      Number.isInteger(Number(source.limit)) &&
      Number(source.limit) >= 1 &&
      Number(source.limit) <= 200
        ? Number(source.limit)
        : 40,
  };
}

export function isPetTarget(campaign) {
  return (
    campaign.sector === defaultCampaign.sector &&
    campaign.city === defaultCampaign.city
  );
}

export function campaignContext(campaign) {
  const c = resolveCampaign(campaign);
  return `Target della campagna: ${c.sector}. Territorio: ${c.city}.\n${isPetTarget(c) ? "Considera veterinari e strutture veterinarie, pet shop e negozi di animali in tutte le regioni italiane. Pet shop e negozio di animali possono indicare la stessa attività: prevedi deduplicazione per sede, dominio e identificativo aziendale verificato. Non includere privati proprietari di animali.\n" : ""}Offerta dell’azienda: ${c.offer || "non ancora definita; non inventare prodotti, vantaggi, prezzi o proposte commerciali."}\nProfilo registrato per la simulazione: nessuna fonte dati collegata, nessuna ricerca reale eseguita.`;
}

export function campaignPanel(campaign, icon, esc) {
  const pet = isPetTarget(campaign);
  return `<section class="target-profile"><div class="target-profile-top"><span class="department-icon sage">${icon("search")}</span><div><div class="eyebrow">CLIENTE IDEALE CONFIGURATO</div><h2>${esc(campaign.sector)}</h2><p>${esc(campaign.city)} · Ricerca reale non collegata</p></div><button class="button" data-page="Impostazioni">${icon("settings")}Modifica profilo</button></div><details><summary>Ambito e criteri della campagna</summary><div class="target-profile-details">${pet ? "<p><strong>Attività:</strong> veterinari, ambulatori e cliniche veterinarie; pet shop e negozi di animali.</p><p><strong>Copertura:</strong> tutta Italia, senza restrizioni di regione o provincia.</p><p><strong>Deduplicazione prevista:</strong> pet shop e negozio di animali sono categorie sovrapposte. Una stessa attività non dovrà essere contattata due volte.</p>" : `<p><strong>Settore:</strong> ${esc(campaign.sector)}. <strong>Area:</strong> ${esc(campaign.city)}.</p>`}<p><strong>Offerta:</strong> ${campaign.offer ? esc(campaign.offer) : "da definire. Serve sapere quale prodotto o servizio proponi a queste attività."}</p><p>Questo è un profilo di ricerca, non un elenco di aziende già trovate. Le fonti, i modelli IA e i servizi di invio non sono collegati.</p></div></details></section>`;
}
