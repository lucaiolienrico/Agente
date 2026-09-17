# Profilo clienti — Veterinari e settore pet, Italia

## Obiettivo configurato

- **Campagna predefinita:** Veterinari & Pet shop · Italia.
- **Attività target:** veterinari, ambulatori e cliniche veterinarie; pet shop e negozi di animali.
- **Territorio:** tutta Italia, senza restrizioni di regione o provincia.
- **Prodotto o servizio da proporre:** non ancora indicato. Non sono presunti prodotti, prezzi, vantaggi o problemi del cliente.

Questo documento è una specifica del profilo, non un elenco di aziende trovate. La demo non effettua ricerche reali, invii o prenotazioni.

## Criteri previsti per la ricerca reale

1. Distinguere i professionisti e le strutture veterinarie dalle attività commerciali del settore pet.
2. Trattare “pet shop” e “negozio di animali” come categorie sovrapposte: non generare due contatti per la stessa attività solo perché compare sotto entrambi i termini.
3. Coprire tutte le regioni e province; non concentrare la lista su una sola città.
4. Non includere privati proprietari di animali, attività estranee al target o sedi fuori Italia.
5. Verificare ragione sociale o denominazione, sede, sito, fonte e data di verifica prima della qualifica.
6. Deduplicare con identificativo aziendale verificato, dominio e sede, distinguendo filiali da duplicati.
7. Verificare ruolo professionale, fonte autorizzata, base giuridica e opt-out prima di qualsiasi contatto reale.

**Query indicative da implementare in un connettore autorizzato:** “veterinario + comune”, “ambulatorio veterinario + provincia”, “clinica veterinaria + comune”, “pet shop + comune”, “negozio di animali + provincia”. Queste query non sono state eseguite dalla demo.

## Come il profilo viene utilizzato nella console

- Un riquadro nella Panoramica, nella Gestione agenti e nelle Impostazioni mostra settore, territorio, stato della ricerca e offerta mancante.
- Ogni scheda agente mostra il contesto ereditato dalla campagna.
- I nuovi esiti simulati includono una copia del contesto al momento dell’esecuzione, sia per il singolo agente sia per i cicli di gruppo.
- Il report operativo esportato riporta target e offerta.
- Senza un prodotto o servizio configurato, la bozza commerciale dei contatti non viene inventata e il pulsante “Copia bozza” rimane disabilitato.
- Compilare **Impostazioni → Prodotto o servizio offerto → Salva preferenze** per aggiungere l’offerta.

Il contesto è registrato, non eseguito da un modello IA. Le regole di copertura, deduplicazione e selezione sono istruzioni per la futura ricerca reale, non controlli già applicati a un database di attività.

## Dati esistenti e migrazione

Il vecchio profilo predefinito “Nuovi clienti · Italia / Servizi B2B / Italia”, se non personalizzato e senza offerta, viene aggiornato a questo target conservando il limite di invio. Le campagne personalizzate non vengono sovrascritte.

Contatti, pause, incarichi modificati, contatori e registro non vengono cancellati. I sei contatti originari restano un **campione didattico generico**, esplicitamente distinto dai risultati della campagna attuale. Non sono nuovi contatti del settore pet.

Cambiare il profilo non riapre automaticamente gli incarichi completati e non altera gli esiti precedenti. Per ottenere un nuovo esito con il contesto aggiornato, riaprire esplicitamente l’incarico e rieseguire il ciclo demo.

## Verifiche

Sono stati aggiunti cinque test unitari e tre test browser per default, migrazione conservativa, contesto negli esiti, offerta mancante e persistenza. Suite complessiva verificata: **22 unitari, 18 browser applicativi e 3 test della build GitHub Pages (43 test)**.

## Informazione ancora necessaria

**Che cosa offre la tua azienda a veterinari e negozi di animali?** Questo dato serve per definire la qualifica commerciale e preparare messaggi pertinenti. Collegare fonti dati e provider IA resta un passaggio separato, necessario per iniziare una ricerca reale.
