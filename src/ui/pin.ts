import {isActionPinned, onActionPinned} from '../platform/browser.js';
import {pinHint} from './components/pin-hint.js';
import {getElement} from './dom.js';

// A UI preference only; session data stays in the background's IndexedDB.
const DISMISSED_KEY = 'pin-hint-dismissed';

export async function setupPinHint(containerId: string): Promise<void> {
  if (localStorage.getItem(DISMISSED_KEY) !== null || await isActionPinned() !== false) {
    return;
  }
  const container = getElement(containerId);
  const hide = (): void => { container.replaceChildren(); };
  container.append(pinHint(() => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    hide();
  }));
  onActionPinned(hide);
}
