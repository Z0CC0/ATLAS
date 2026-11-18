// The one hooks module Claude Code loads for this plugin (hooks/hooks.json names one path).
// Every registration is here, one event to a line, so what ATLAS hooks is read in one place:
//
//   session.compact   with `atlas prune on`, a compaction keeps the conversation word for word
//                     and drops only tool results the conversation made useless (atlas-prune.mjs);
//                     off, or when anything fails, Claude Code's own summary runs untouched
//   the other three   redraw the line of the dials that are on, under the prompt, after the rest
//                     of the chain has answered; they change nothing of what passes
//
// A failure in one hook is that hook skipped: each catches its own errors.
import { compact } from './atlas-prune.mjs';
import { redraw } from './atlas-status.mjs';

export const register = (on) => {
  on('session.compact', compact);
  on('session.start', redraw);
  // The command hooks change the state while the prompt is submitted: read it after they ran.
  on('prompt.submit', redraw);
  on('turn.complete', redraw);
};
