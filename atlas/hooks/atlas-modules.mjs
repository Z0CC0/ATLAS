// The one hooks module Claude Code loads for this plugin (hooks/hooks.json names one path).
// Each part registers its own hooks and stands alone: a failure in one is that hook skipped.
import { register as prune } from './atlas-prune.mjs';
import { register as status } from './atlas-status.mjs';

export const register = (on, options) => {
  prune(on, options);
  status(on, options);
};
