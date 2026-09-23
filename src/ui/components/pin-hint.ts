import {element} from '../dom.js';
import {actionButton} from './controls.js';

export function pinHint(onDismiss: () => void): HTMLElement {
  const hint = element('div', '', 'pin-hint');
  hint.setAttribute('role', 'note');
  hint.append(element('p', 'Keep Session Manager one click away: open the Extensions (puzzle) menu in your toolbar and pin it.'));
  const dismiss = actionButton('Got it', onDismiss);
  dismiss.setAttribute('aria-label', 'Dismiss toolbar tip');
  hint.append(dismiss);
  return hint;
}
