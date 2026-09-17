# Pubblicazione della console su GitHub Pages

## Stato e requisito

GitHub Pages è stato attivato dall’amministratore sul ramo `arena/01a0aba2-agente`, cartella `/ (root)`. La build compilata è disponibile nella sottocartella `docs/`. L’API della connessione Arena non consente di cambiare le impostazioni Pages (HTTP 403), ma consente di caricare gli aggiornamenti del codice.

Con questa configurazione, il collegamento diretto è `https://lucaiolienrico.github.io/Agente/docs/#gestione-agenti`. La pagina principale reindirizza a questo percorso. Verificare sempre l’esito del deployment prima di distribuire un aggiornamento.

Non cambiare la visibilità del repository, il ramo predefinito o il nome di questo ramo. Il repository è già pubblico.

## Attivazione dal browser GitHub

1. Aprire [Settings → Pages](https://github.com/lucaiolienrico/Agente/settings/pages) con l'account che amministra il repository.
2. In **Build and deployment → Source**, selezionare **Deploy from a branch**.
3. Selezionare il ramo **arena/01a0aba2-agente**.
4. Lasciare la cartella **/ (root)** nella configurazione corrente, quindi premere **Save**. In alternativa, `/docs` pubblica la stessa app direttamente sotto `/Agente/`.
5. Attendere l'esito della pubblicazione nella sezione Pages o nel workflow **pages build and deployment** di GitHub Actions.
6. Usare **Visit site** da GitHub: con la radice selezionata, il browser viene reindirizzato a `docs/#gestione-agenti`.

Se il ramo non compare, verificare prima che sia stato caricato su GitHub. Se la sezione Pages non è accessibile, servono i permessi dell'amministratore del repository.

Gli indirizzi, **solo dopo una pubblicazione riuscita e in assenza di dominio personalizzato**, sono:

```text
Sorgente / (root): https://lucaiolienrico.github.io/Agente/docs/#gestione-agenti
Sorgente /docs:    https://lucaiolienrico.github.io/Agente/#gestione-agenti
```

Questo documento non certifica che l'indirizzo sia già attivo. L'URL definitivo e lo stato della pubblicazione vanno verificati in GitHub Pages.

## Aggiornamenti del sito

Dalla radice del progetto:

```bash
npm ci
npm test
npm run build:pages
```

La build usa percorsi relativi per gli asset (`./`), scrive `docs/index.html`, rigenera `docs/assets/` e aggiunge `.nojekyll`, preservando i report Markdown. I file statici sono versionati perché Pages pubblica direttamente da `/docs`.

Dopo aver verificato le modifiche, aggiungerle a un commit sul ramo della sessione e inviarle esclusivamente con:

```bash
git push origin arena/01a0aba2-agente
```

Non è necessaria una modifica a `main` né la creazione di un ramo `gh-pages`. Ogni aggiornamento del sito richiede la rigenerazione della build; modificare solo `src/` non aggiorna i file pubblicati.

## Verifiche della build statica

```bash
npx playwright install chromium
npm run test:pages
```

I tre test dedicati verificano il caricamento degli asset sotto `/Agente/`, l'accesso diretto alla console, un ciclo demo, il layout mobile la disponibilità del report e il reindirizzamento dalla radice del repository. Questi sono test locali del pacchetto pubblicabile, non una verifica dell'URL pubblico di GitHub.

## Dati e limiti

- Il sito è una demo pubblica senza backend, autenticazione, invii email o chiamate a modelli IA.
- Non inserire dati personali reali, credenziali o informazioni riservate.
- Lo stato rimane nel localStorage del browser: non viene sincronizzato con GitHub o con altri utenti.
- Il dominio GitHub Pages ha uno spazio di archiviazione distinto dall'anteprima Arena. Le configurazioni dell'anteprima non vengono trasferite automaticamente.
- Gli indirizzi di esempio e i report di progetto non contengono risultati commerciali reali.
