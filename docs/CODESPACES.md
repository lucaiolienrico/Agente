# Usare l’agente direttamente dalla repository Agente

Non serve un’altra repository e non serve installare Node sul tuo computer. **GitHub Codespaces** esegue il backend in un ambiente collegato a `lucaiolienrico/Agente`, accessibile dal browser. Il normale sito della repository e GitHub Pages, da soli, non eseguono l’app.

## 1. Apri il ramo con il nuovo agente

Apri **[Agente — ramo dell’agente PetNote](https://github.com/lucaiolienrico/Agente/tree/arena/01a0aba2-agente)**. Il ramo da usare è `arena/01a0aba2-agente`; la PR #1 è ancora il punto di revisione verso `main`.

Nel pulsante verde **Code** scegli **Codespaces → Create codespace on arena/01a0aba2-agente**. Le etichette possono variare con la lingua dell’interfaccia GitHub. Non creare il Codespace dal vecchio `main` se la PR non è ancora stata integrata.

La disponibilità dipende dal tuo account, dalle quote e dalle eventuali policy GitHub. Controlla costi e limiti prima di creare l’ambiente: questa configurazione non acquista né avvia automaticamente un Codespace per te. **Non serve incollare un token GitHub.**

## 2. Aspetta la preparazione, poi avvia

La configurazione `.devcontainer` installa Node 22, le dipendenze e compila il frontend. Lo script di setup crea un file `.env` privato e ignorato da Git, con:

- password amministrativa casuale;
- origine HTTPS del Codespace;
- accesso protetto, senza bypass;
- ricerca e bozze IA non configurate per impostazione iniziale.

Al termine, nel terminale integrato esegui:

```bash
npm start
```

Lascia quel terminale aperto. Nella scheda **Ports / Porte**, sulla **porta 3000**, scegli **Open in Browser / Apri nel browser**. Mantieni la visibilità della porta **Private / Privata**: non è necessario pubblicarla per usarla dal tuo account. Apri una scheda browser normale, non una preview incorporata, perché il backend protetto blocca gli iframe.

## 3. Accedi all’agente

Nell’esplora-file del Codespace apri `.env`. Copia **solo il valore** di `ADMIN_PASSWORD` e incollalo nella schermata di accesso dell’agente. Non è la password GitHub.

**Non condividere quel file, non caricarlo in repository e non inviare password o chiavi in chat.** Se hai già configurato `ADMIN_PASSWORD` come secret Codespaces, usa quella password: le variabili dell’ambiente prevalgono sul file `.env`.

Ora puoi approvare la **Scheda PetNote**, aggiungere strutture manualmente e gestire l’archivio. Non appariranno risultati IA inventati.

## 4. Abilita Groq quando vuoi usarlo

Il provider iniziale è **Groq**. Nel `.env` privato aggiungi `AI_PROVIDER=groq`, la tua `GROQ_API_KEY` e `GROQ_MODEL=openai/gpt-oss-20b`. Quel modello è eseguito da Groq, non da ChatGPT. Lascia `GROQ_SEARCH_ENABLED=false` per cominciare solo dalle bozze; la ricerca web con Compound Mini si abilita separatamente dopo averne verificato quote e costi.

**[Segui la guida Groq, anche per aggiornare un Codespace già aperto](GROQ.md)**. Lo script iniziale non sovrascrive il tuo `.env`, quindi non sostituisce la password né configura una chiave al posto tuo.

**Un token GitHub non è una chiave Groq e non può attivare l’IA.** Non inviare chiavi in chat o nei commit. Puoi anche usare i secrets Codespaces limitati a questa repository.

Dopo le modifiche, ferma il processo con **Ctrl+C** e riavvia con `npm start`. Le chiamate consumano la quota del tuo account e possono avere costi: partono soltanto quando le richiedi. Nessun test a pagamento all’avvio e nessun passaggio automatico a OpenAI.

Percorso operativo: **Scheda PetNote → Ricerca → Verifica della fonte e qualifica → Bozza → Revisione umana**. L’approvazione/esportazione richiede anche una richiesta pertinente o un consenso documentato e il recapito professionale autorizzato. Il sistema non invia messaggi.

## Fermare, riprendere e proteggere i dati

- Per interrompere il server usa **Ctrl+C**. Per fermare anche l’ambiente, usa **Stop codespace** in GitHub; chiudere soltanto la scheda del browser non equivale necessariamente a fermarlo.
- Alla riapertura dello stesso Codespace, esegui nuovamente `npm start`.
- Il database è in `data/petnote.sqlite`, **non in Git**. Rimane nel disco del medesimo Codespace finché questo viene conservato. Non è condiviso con altri Codespaces né con PetNote.
- Se elimini il Codespace, o questo viene eliminato per le regole di conservazione/inattività, puoi perdere database e configurazione. Prima di eliminarlo, ferma il server e scarica una copia privata dell’intera cartella `data`, seguendo [le indicazioni di backup](DEPLOYMENT.md). Non committare database o segreti.
- Codespaces non è un servizio 24/7: può sospendersi e richiede attenzione a quote, consumi e conservazione. Prima di affidargli dati reali, valuta tali limiti e definisci una procedura di backup.

## Se qualcosa non parte

- **Setup interrotto:** nel terminale esegui `npm ci`, `npm run build`, `node scripts/setup-codespaces.js`, poi `npm start`.
- **Codice vecchio:** controlla di avere aperto il ramo `arena/01a0aba2-agente`.
- **Errore 403 “Origine non autorizzata”:** confronta `APP_ORIGIN` in `.env` con l’origine HTTPS mostrata per la porta 3000. Deve essere identica e senza slash finale. Lo script non sovrascrive un `.env` già esistente: una configurazione precedente va aggiornata manualmente e il server riavviato.
- **Login non funziona:** usa la password amministrativa dell’ambiente, non token o password GitHub. Controlla se un secret Codespaces prevale sul file.
- **Ricerca disattivata:** controlla GROQ_API_KEY, GROQ_MODEL e, per la ricerca, GROQ_SEARCH_ENABLED; poi riavvia. La presenza della configurazione non garantisce compatibilità del modello o quota disponibile.

La configurazione e lo script sono coperti da test locali. La creazione di un Codespace nel tuo account e la prima chiamata Groq richiedono una tua azione; non sono state eseguite al posto tuo.
