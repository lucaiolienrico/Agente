# Pubblicazione della console su GitHub Pages

## Stato e requisito

La build statica è disponibile in questa cartella. La configurazione di GitHub Pages deve essere abilitata da un amministratore del repository. Il tentativo dalla connessione Arena ha restituito **HTTP 403 — Resource not accessible by integration**: non equivale a una pubblicazione riuscita.

Non cambiare la visibilità del repository, il ramo predefinito o il nome di questo ramo. Il repository è già pubblico.

## Attivazione dal browser GitHub

1. Aprire [Settings → Pages](https://github.com/lucaiolienrico/Agente/settings/pages) con l'account che amministra il repository.
2. In **Build and deployment → Source**, selezionare **Deploy from a branch**.
3. Selezionare il ramo **arena/01a0aba2-agente**.
4. Selezionare la cartella **/docs**, quindi premere **Save**.
5. Attendere l'esito della pubblicazione nella sezione Pages o nel workflow **pages build and deployment** di GitHub Actions.
6. Usare **Visit site** da GitHub e aggiungere `#gestione-agenti` all'URL per aprire direttamente la console.

Se il ramo non compare, verificare prima che sia stato caricato su GitHub. Se la sezione Pages non è accessibile, servono i permessi dell'amministratore del repository.

L'indirizzo standard atteso, **solo dopo una pubblicazione riuscita e in assenza di dominio personalizzato**, è:

```text
https://lucaiolienrico.github.io/Agente/#gestione-agenti
```

Questo documento non certifica che l'indirizzo sia già attivo. L'URL definitivo e lo stato della pubblicazione vanno verificati in GitHub Pages.

## Aggiornamenti del sito

Dalla radice del progetto:

```bash
npm ci
npm test
npm run build:pages
```

La build usa la base `/Agente/`, scrive `docs/index.html`, rigenera `docs/assets/` e aggiunge `.nojekyll`, preservando i report Markdown. I file statici sono versionati perché Pages pubblica direttamente da `/docs`.

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

I due test dedicati verificano il caricamento degli asset sotto `/Agente/`, l'accesso diretto alla console, un ciclo demo, il layout mobile e la disponibilità del report. Questi sono test locali del pacchetto pubblicabile, non una verifica dell'URL pubblico di GitHub.

## Dati e limiti

- Il sito è una demo pubblica senza backend, autenticazione, invii email o chiamate a modelli IA.
- Non inserire dati personali reali, credenziali o informazioni riservate.
- Lo stato rimane nel localStorage del browser: non viene sincronizzato con GitHub o con altri utenti.
- Il dominio GitHub Pages ha uno spazio di archiviazione distinto dall'anteprima Arena. Le configurazioni dell'anteprima non vengono trasferite automaticamente.
- Gli indirizzi di esempio e i report di progetto non contengono risultati commerciali reali.
