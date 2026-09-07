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
| `/atlas:atlas-optimize` | legge le tue sessioni e dice quali manopole ti convengono |
| `/atlas:atlas-search` | risponde solo da una ricerca web |
| `/atlas:atlas-sources` | cerca sul web e consegna dove leggere, non la risposta |
| `/atlas:atlas-review` | rivede il diff corrente |
| `/atlas:atlas-commit` | messaggio di commit per quello che hai in stage |
| `/atlas:atlas-compress` | accorcia un file markdown |
| `/atlas:atlas-skill` | costruisce una skill per Claude Code |
| `/atlas:atlas-init` | scrive la regola nei file di configurazione degli altri agenti |
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

**L'impostazione e' globale e persiste** — fra i turni, fra i riavvii, in ogni progetto, finche'
non la cambi. Non e' una modalita' per conversazione: lo accendi una volta e ogni chat nuova parte
da li'. Anche `atlas off` persiste allo stesso modo.

**Disinstallarlo non lo azzera.** Lo stato delle manopole sta in `~/.claude/.atlas-state`, fuori
dal plugin, quindi togliendolo e rimettendolo torna quello che avevi impostato prima. Scrivi
`atlas off` prima di disinstallare, oppure cancella quel file — e' una riga e non dipende da lui
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
| `~/.claude/.atlas-state` | le quattro manopole, es. `high:ask:on:off` |
| `~/.claude/atlas-terms.txt` | i tuoi termini intoccabili, uno per riga. Arriva vuoto |
| `<progetto>/.atlas.json` | impostazione predefinita per un singolo progetto |

## Misurato

| | token a sessione |
|---|---|
| regole iniettate a `low` (predefinito) | 2.165 |
| regole iniettate a `high` | 2.357 |
| descrizioni di skill, comandi e subagenti, sempre presenti | 2.634 |
| promemoria per turno | 42-47 |
| **totale al livello predefinito** | **4.799** |

La build `atlas-min` porta le descrizioni a 153 e le regole a 1.838, perche' contiene solo le
sezioni sulla compressione. `atlas-solo` tiene tutte le regole e toglie i dieci subagenti: 1.270 di
descrizioni invece di 2.634. Toglie anche `atlas-search` e `atlas-sources`, che sono la maniglia
di un subagente che li non c'e' — la disciplina di ricerca sta comunque nella manopola `check`,
dove vale per ogni risposta invece che per un comando solo.

**Il promemoria per turno conta piu' del costo iniziale su una sessione lunga.** A 42 token per
turno, su una sessione da 295 turni — la media misurata su sessioni vere — sono 12.390 token,
piu' del doppio di tutto il resto messo insieme.

Ogni comando installato costa circa 100 token a sessione per sempre, che tu lo usi o no:
le descrizioni stanno nell'elenco che si carica sempre, i contenuti no. È il motivo per cui
le regole dei livelli sono filtrate: si inietta solo il livello attivo, mai tutti e tre.

## Cosa NON fa

- Non comprime l'input, i tuoi file, né l'output dei tool. Accorcia **l'output**
- Misurata contro il plugin assente su 24 domande inglesi e 24 italiane, ognuna con la sua scheda di fatti cosi' che cambi solo la forma, 2 giri a testa in sessioni nuove, token contati dall'API sul testo visibile: **`low` -47% in italiano e -51% in inglese, `high` -47% e -54%**. Dettagli persi, mediana: `low` 1 e 4 su 264, `high` 4 e 4. Rumore fra giri 4.1 punti: una differenza piu' piccola non e' un effetto
- **`low` e `high` escono vicini.** `high` e' il regolamento piu' duro e si legge piu' telegrafico; la differenza in token e' di pochi punti
- `atlas-min` e' misurata a parte, con le sue regole ridotte; `atlas-solo` ha le stesse regole di `atlas` byte per byte e non e' stata rimisurata
- Non conviene su tutti gli usi. Le regole costano 1.838-2.357 token a sessione e il promemoria 42-47 a turno. Se le tue risposte sono corte, misura prima di fidarti
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
anche dopo un riavvio. Disinstallare il plugin non lo tocca: cancella `~/.claude/.atlas-state`
a mano se non vuoi lasciare traccia.

## Prove

```bash
npm test
```

`tests/prompts.json` contiene venticinque prove di comportamento, scritte prima delle regole che
verificano. Quelle hanno bisogno di un modello per girare; `npm test` copre quello che una
macchina può giudicare da sola.

## Licenza

MIT.
