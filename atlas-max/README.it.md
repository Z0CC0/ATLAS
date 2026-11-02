# ATLAS

> Versione italiana, generata da `README.md`. La verità è il file inglese.

Quattro manopole indipendenti per come lavora l'assistente.

| manopola | valori | decide |
|---|---|---|
| compressione | `low` · `high` | quanto scrivo |
| rigore | `off` · `ask` | quanto chiedo prima di iniziare |
| verifica | `off` · `on` | quanto controllo prima di affermare |
| silenzio | `off` · `on` | se il lavoro arriva con un resoconto o senza |

Restano tutte e quattro finché non le cambi, e si muovono in modo indipendente: cambiarne una lascia
le altre dov'erano. Nessun comando supera due parole e non esistono nomi di modi combinati.

```
atlas high       compressione al minimo di parole
atlas ask        in più: chiarisce l'obiettivo prima di costruire
atlas check      in più: cerca invece di rispondere a memoria
atlas silent     in più: consegna il risultato, niente racconto e niente resoconto finale
atlas ask off    rigore spento, compressione e verifica invariate
atlas off        tutto spento
```

Funzionano entrambe le forme: `atlas high` scritto come intero messaggio, oppure
`/atlas-max:atlas high`. La forma semplice funziona anche dove il client non ha caricato il menu.

## Comandi

| comando | cosa fa |
|---|---|
| `/atlas-max:atlas` | imposta le manopole |
| `/atlas-max:atlas-help` | la scheda di riferimento |
| `/atlas-max:atlas-recap` | scrive un file di consegna della conversazione |
| `/atlas-max:atlas-search` | risponde solo da una ricerca web; con "dammi fonti", dove leggere invece della risposta |
| `/atlas-max:atlas-organize` | riordina una cartella locale, con annullamento |
| `/atlas-max:atlas-silent` | fa il lavoro e consegna il risultato, nient'altro |

## Installazione

```bash
/plugin marketplace add Z0CC0/ATLAS
/plugin install atlas-max@atlas
```

Nessuna dipendenza, nessuna compilazione, nessuna telemetria.

## Parte spento

Appena installato non cambia niente. Alla prima sessione stampa una riga che dice che c'e' e come
accenderlo; dopo di quella tace finche' non lo fai tu.

```
atlas low      risposte piu corte
atlas high     meta delle parole
atlas status   cosa e acceso
atlas off      si torna a niente
```

**L'impostazione e' per progetto e persiste** — fra i turni e fra i riavvii, finche' non la cambi.
Non e' una modalita' per conversazione: lo accendi una volta in un repository e ogni chat nuova
aperta li' parte cosi'. Un altro repository e' un'altra impostazione, spenta finche' non dici tu,
quindi `atlas high` acceso per un lavoro non ti segue nel successivo. Anche `atlas off` persiste
allo stesso modo. Il progetto e' la cartella in cui gira la sessione, risalita fino al primo
`.git` o `.atlas.json`: una chat aperta in una sottocartella condivide le manopole del repository.

**Disinstallarlo non lo azzera.** Gli stati delle manopole stanno in `~/.claude/atlas-state/`,
un file piccolo per progetto, fuori dal plugin, quindi togliendolo e rimettendolo torna quello che
avevi impostato prima. Scrivi `atlas off` nel progetto prima di disinstallare, oppure cancella
quella cartella — non dipende da lei nient'altro. Dentro i tuoi repository non viene scritto nulla
nient'altro.

## Compagni consigliati

ATLAS funziona da solo. Funziona meglio con questi tre collegati — nessuno e' obbligatorio, e
nessuna regola dice mai che una risposta non si puo' avere perche' ne manca uno.

| server | cosa ci fa ATLAS | installazione |
|---|---|---|
| **Context7** | `atlas-research` e `check` lo interrogano per primo sulle API di una libreria: una chiamata per la versione giusta, dove una ricerca ne prende quattro e puo' finire su una pagina che parla di un'altra | `claude mcp add --transport http --scope user context7 https://mcp.context7.com/mcp` |
| **Chrome DevTools MCP** | le due cose che `atlas-browser` non puo' fare — pagine dietro un login e tracce di prestazioni. Quelle le restituisce invece di riferire cosa vede un visitatore anonimo | `claude mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@latest` |
| **Composio** | un gateway verso Gmail, Notion, Slack, GitHub e il resto, cosi' i subagenti arrivano ai dati veri e non solo al web | `claude mcp add --transport http --scope user composio https://connect.composio.dev/mcp` poi `claude mcp login composio` |

`--scope user` conta: senza, il server esiste solo nel progetto dove hai lanciato il comando.
Dopo, riavvia Claude Code — gli MCP si leggono all'avvio.

**Ordine, per il browser**: prima `atlas-browser`, quello esterno solo per cio' che ti restituisce.
Il subagente tiene le schermate fuori dalla conversazione, guidare Chrome di persona no.

**Composio tiene i token OAuth degli account che colleghi.** Collega solo quelli che usi.

## Cosa esce dalla tua macchina

**Niente che tu non abbia chiesto.** Le regole, le manopole e gli hook sono tutti locali: leggono
solo i file della tabella qui sotto e scrivono solo il file di stato, piu' `~/.claude/atlas.json`
quando scrivi uno switch del guard, e in questa build, prima di una compattazione, il file di raccolta del vault, e in questa build un piccolo file per sessione nella cartella temporanea di sistema mentre `gate` e' acceso. Delle tue sessioni non esce mai niente.

Due subagenti la rete la toccano, perche' andare a prendere roba e' il loro mestiere, e solo
quando li deleghi tu: `atlas-research` cerca e apre pagine (e, in modalità cataloghi, i cataloghi pubblici),
`atlas-browser` guida una pagina che gli hai indicato. Mandano la tua domanda e nient'altro.
`atlas-min` non ne ha nessuno e non fa nessuna chiamata di rete.

Se chiedi cosa dice la gente, `atlas-search` lancia `tools/social.mjs`, che manda le parole cercate a `hn.algolia.com`, `lemmy.world`, `api.stackexchange.com` e `api.github.com`, nient'altro.

| file | a cosa serve |
|---|---|
| `~/.claude/atlas-state/<progetto>.state` | le quattro manopole di un progetto, es. `high:ask:on:off` |
| `~/.claude/atlas-terms.txt` | i tuoi termini intoccabili, uno per riga. Arriva vuoto |
| `<progetto>/.atlas.json` | impostazione predefinita per un singolo progetto |
| `~/.claude/atlas.json` | impostazione predefinita per tutti i progetti, e gli switch del guard di `atlas-code` |
| `<vault>/.atlas/harvest/<sessione>.md` | scritto prima di una compattazione: le righe di quella sessione che sembrano una decisione |
| `<vault>/.atlas/labels.json`, la trascrizione della sessione | letti dall'hook delle etichette e da quello dei segnali |
| `<temp>/atlas-gate-<sessione>.json` | i file che il gate ha gia' respinto in questa sessione (`gate` acceso) |

`~/.claude` e' `$CLAUDE_CONFIG_DIR` quando e' impostata, per ogni file qui sopra.

## Misurato

Contati alla 0.1.0 da `atlas-test/fixed-costs.mjs` con tiktoken `o200k_base`.

| | token a sessione |
|---|---|
| regole iniettate a `low` (predefinito) | 1.408 |
| regole iniettate a `high` | 1.530 |
| nomi e descrizioni di skill, comandi e subagenti, sempre presenti | 824 |
| promemoria per turno | 27-32 |
| **totale al livello predefinito** | **2.232** |

Fatturato da `claude-opus-5-5`, un turno meno lo stesso turno senza plugin. Installane una sola: due build insieme iniettano le regole due volte.

| build | comandi | subagenti | installata e spenta | primo turno a `low` | primo turno a `high` | 40 turni a `low` | 295 turni a `low` |
|---|---|---|---|---|---|---|---|
| `atlas` | 6 | 2 | 1.247 | 3.357 | 3.537 | -15% | -29% |
| `atlas-min` | 1 | 0 | circa 0 | 1.538 | 1.723 | -26% | -33% |
| `atlas-code` | 29 | 10 | 6.391 | 8.898 | 9.113 | +13% | -25% |
| `atlas-mem` | 11 | 5 | 2.571 | 4.694 | 4.874 | -8% | -28% |
| `atlas-max` | 31 | 10 | 6.826 | 9.332 | 9.548 | +15% | -25% |

Le ultime due colonne sono il costo di una sessione contro nessun plugin: negativo costa meno. Solo `atlas` e `atlas-min` hanno l'output misurato; per le altre e' un'ipotesi che risparmino quanto `atlas`.

- **`atlas`**: la scelta normale. Regole, manopole, ricerca e browser. Niente review, fix e commit.
- **`atlas-min`**: solo compressione, un comando. La piu' economica. Niente `ask`, `check`, `silent`, niente ricerca.
- **`atlas-code`**: `atlas` piu' ventitre' comandi e otto subagenti per review, fix, piano, test, verifica, spedizione, audit e documenti (`atlas spec`, `atlas changelog`, `atlas brief`, `atlas explain`), con un guard opzionale. Sotto i 57 turni circa costa piu' di nessun plugin.
- **`atlas-mem`**: `atlas` piu' review, fix e commit, e una memoria che segnala le note diventate false, grafo del codice, etichette e `atlas-artifact`. Pesa 23 MB e aggiunge tre hook. Le note si scrivono a mano.
- **`atlas-max`**: tutto insieme, 31 comandi e 10 subagenti. La piu' cara, e l'unico modo di avere codice e memoria insieme. Sotto i 60 turni circa costa piu' di nessun plugin.
- **`atlas-test`**: il banco che ha prodotto i numeri, non un plugin. Vedi `atlas-test/README.md`.

**Il promemoria per turno conta piu' del costo iniziale su una sessione lunga.** A 27 token per
turno, su una sessione da 295 turni — la media misurata su sessioni vere — sono 7.965 token,
piu' del doppio di tutto il resto messo insieme.

Le descrizioni di skill, comandi e subagenti costano 1.247 token fatturati a sessione per sempre, che
tu li usi o no: stanno nell'elenco che si carica sempre, i contenuti no. È il motivo per cui
le regole dei livelli sono filtrate: si inietta solo il livello attivo, mai entrambi.

## Cosa NON fa

- Non comprime l'input, i tuoi file, né l'output dei tool. Accorcia **l'output**
- Misurata il 26/09/2026 con `claude-opus-5-5` contro il plugin assente su 24 domande inglesi e 24 italiane, ognuna con la sua scheda di fatti cosi' che cambi solo la forma, 2 giri a testa in sessioni nuove, token contati dall'API sul testo visibile, una revisione precedente delle regole: **`low` -37% in italiano e -37% in inglese, `high` -43% e -46%**. L'output fatturato conta anche il pensiero: contro il plugin assente `low` +4,7% in italiano e +2,0% in inglese, `high` -18,3% e -24,6% (stesse risposte, `atlas-test/generated/opus.*`): `low` fa risparmiare lettura, non fattura. Note perse, mediana, con il giudice nuovo (`atlas-test/judge-notes.mjs`): 0 su 176 in italiano e in inglese, sia a `low` sia a `high`; la sola riga diversa e' `high` + `ask` in inglese, 0,5 su 176. Lo zero vuol dire "molto poche": con note cancellate apposta dalle risposte il giudice se ne accorge 109 volte su 120. Rumore fra giri 0,6 punti in italiano e 0,4 in inglese: una differenza piu' piccola non e' un effetto. Un altro modello comprime di un altro tanto: Sonnet 5, l'8 settembre 2026, risparmiava di piu' con ogni plugin
- **`low` e `high` distano 9 e 7 punti.** `high` e' il regolamento piu' duro e si legge piu' telegrafico: il risparmio e' vero, e lo e' anche il costo in leggibilita'
- `atlas-min` e' misurata a parte, con le sue regole ridotte.
- Non cerca ovunque. Se chiedi cosa dice la gente, `atlas-search` legge Hacker News, Lemmy, Stack Overflow e GitHub, che rispondono senza account. Di Reddit, X, Bluesky, LinkedIn, Instagram, TikTok, Facebook, Threads e Mastodon vede solo cio' che mostrano i motori di ricerca, e ogni risposta lo dice. Niente login, niente cookie, nessun modo di aggirare un rifiuto.
- Non conviene su tutti gli usi. Le regole costano 1.051-1.530 token a sessione e il promemoria 27-32 a turno. Se le tue risposte sono corte, misura prima di fidarti
- I comandi sono parole inglesi. Le richieste in qualsiasi lingua vengono riconosciute; le frasi che l'hook intercetta da solo ("stop atlas", "normal mode") sono solo inglesi, e `atlas off` funziona ovunque
- `ask` non può sapere quello che non hai detto. Riduce le assunzioni sbagliate, non le elimina

## Termini intoccabili

Uno per riga in `~/.claude/atlas-terms.txt`. Mai compressi, mai tradotti, mai abbreviati.
Arriva vuoto di proposito: un plugin pubblicato non deve portarsi dietro i nomi dei progetti di qualcuno.

```
# le righe che iniziano con # vengono ignorate
PelicanDB
retry_budget
```

## Spegnerlo

`atlas off`, oppure "stop atlas". Il file di stato viene scritto come spento e resta cosi'
anche dopo un riavvio, per il progetto in cui l'hai scritto. Disinstallare il plugin non lo tocca:
cancella la cartella `~/.claude/atlas-state/` a mano se non vuoi lasciare traccia.

## Prove

```bash
npm test
```

`tests/prompts.json` contiene venticinque prove di comportamento, scritte prima delle regole che
verificano. Quelle hanno bisogno di un modello per girare; `npm test` copre quello che una
macchina può giudicare da sola.

Lo stesso a mano, da questa cartella (Node 22, niente da installare):

```bash
node --test "tests/*.test.mjs"
```

## Licenza

MIT.
