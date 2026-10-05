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
`/atlas:atlas high`. La forma semplice funziona anche dove il client non ha caricato il menu.

## Comandi

| comando | cosa fa |
|---|---|
| `/atlas:atlas` | imposta le manopole |
| `/atlas:atlas-help` | la scheda di riferimento |
| `/atlas:atlas-recap` | scrive un file di consegna della conversazione |
| `/atlas:atlas-search` | risponde solo da una ricerca web; con "dammi fonti", dove leggere invece della risposta |
| `/atlas:atlas-review` | rivede un diff, un ramo, un file o una pull request, con una lista di controllo per i linguaggi che contiene |
| `/atlas:atlas-fix` | riporta al verde una build, un controllo dei tipi o un linter che fallisce |
| `/atlas:atlas-commit` | messaggio di commit per quello che hai in stage |
| `/atlas:atlas-organize` | riordina una cartella locale, con annullamento |
| `/atlas:atlas-silent` | fa il lavoro e consegna il risultato, nient'altro |

## Installazione

```bash
/plugin marketplace add <questo-repo>
/plugin install atlas
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
| **Composio** | un gateway solo verso Gmail, Notion, Slack, GitHub e il resto, cosi' i subagenti arrivano ai dati veri e non solo al web | `claude mcp add --transport http --scope user composio https://connect.composio.dev/mcp` poi `claude mcp login composio` |

`--scope user` conta: senza, il server esiste solo nel progetto dove hai lanciato il comando.
Dopo, riavvia Claude Code — gli MCP si leggono all'avvio.

**Ordine, per il browser**: prima `atlas-browser`, quello esterno solo per cio' che ti restituisce.
Il subagente tiene le schermate fuori dalla conversazione, guidare Chrome di persona no.

**Composio tiene i token OAuth degli account che colleghi.** Collega solo quelli che usi.

## Cosa esce dalla tua macchina

**Niente che tu non abbia chiesto.** Le regole, le manopole e gli hook sono tutti locali: leggono
due file e ne scrivono uno, e delle tue sessioni non esce mai niente.

Tre subagenti la rete la toccano, perche' andare a prendere roba e' il loro mestiere, e solo
quando li deleghi tu: `atlas-research` cerca e apre pagine, `atlas-catalog` scarica i cataloghi
pubblici, `atlas-browser` guida una pagina che gli hai indicato. Mandano la tua domanda e nient'altro.
`atlas-solo` e `atlas-min` non ne hanno nessuno e non fanno nessuna chiamata di rete.

| file | a cosa serve |
|---|---|
| `~/.claude/atlas-state/<progetto>.state` | le quattro manopole di un progetto, es. `high:ask:on:off` |
| `~/.claude/atlas-terms.txt` | i tuoi termini intoccabili, uno per riga. Arriva vuoto |
| `<progetto>/.atlas.json` | impostazione predefinita per un singolo progetto |

## Misurato

| | token a sessione |
|---|---|
| regole iniettate a `low` (predefinito) | 1.409 |
| regole iniettate a `high` | 1.531 |
| descrizioni di skill, comandi e subagenti, sempre presenti | 1.973 |
| promemoria per turno | 27-32 |
| **totale al livello predefinito** | **3.382** |

La build `atlas-min` porta le descrizioni a 153 e le regole a 1.082, perche' contiene solo le
sezioni sulla compressione. `atlas-solo` tiene tutte le regole e toglie i sette subagenti: 922 di
descrizioni invece di 1.973. Toglie anche `atlas-search`, che e' la maniglia di un subagente
che li non c'e' — la disciplina di ricerca sta comunque nella manopola `check`,
dove vale per ogni risposta invece che per un comando solo.

**Il promemoria per turno conta piu' del costo iniziale su una sessione lunga.** A 27 token per
turno, su una sessione da 295 turni — la media misurata su sessioni vere — sono 7.965 token,
piu' del doppio di tutto il resto messo insieme.

Ogni comando installato costa circa 100 token a sessione per sempre, che tu lo usi o no:
le descrizioni stanno nell'elenco che si carica sempre, i contenuti no. È il motivo per cui
le regole dei livelli sono filtrate: si inietta solo il livello attivo, mai tutti e tre.

## Cosa NON fa

- Non comprime l'input, i tuoi file, né l'output dei tool. Accorcia **l'output**
- Misurata il 26/09/2026 con `claude-opus-5-5` contro il plugin assente su 24 domande inglesi e 24 italiane, ognuna con la sua scheda di fatti cosi' che cambi solo la forma, 2 giri a testa in sessioni nuove, token contati dall'API sul testo visibile: **`low` -37% in italiano e -37% in inglese, `high` -43% e -46%**. Dettagli persi, mediana: `low` 0 e 1 su 264, `high` 1 e 0. Rumore fra giri 0.6 punti: una differenza piu' piccola non e' un effetto. Un altro modello comprime di un altro tanto: Sonnet 5, l'8 settembre, risparmiava di piu' con ogni plugin
- **`low` e `high` distano 9 e 7 punti.** `high` e' il regolamento piu' duro e si legge piu' telegrafico: il risparmio e' vero, e lo e' anche il costo in leggibilita'
- `atlas-min` e' misurata a parte, con le sue regole ridotte; `atlas-solo` ha le stesse regole di `atlas` byte per byte e non e' stata rimisurata
- `atlas-code`, la quarta build, e' `atlas` piu' una sezione per il codice (test, verifica, piano, pubblicazione e altro: quattordici comandi in piu' e un hook di guardia opzionale). Carica circa il doppio delle descrizioni e in gran parte non e' ancora stata provata su progetti veri: il suo README dice cosa aggiunge, cosa costa e cosa e' stato provato
- Non conviene su tutti gli usi. Le regole costano 1.082-1.531 token a sessione e il promemoria 27-32 a turno. Se le tue risposte sono corte, misura prima di fidarti
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

## Licenza

MIT.
