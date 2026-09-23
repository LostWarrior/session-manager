import {openLibrary, sendCommand} from '../platform/browser.js';
import {MAX_NAME_LENGTH} from '../shared/limits.js';
import {getElement, getInput, getSelect, run} from './dom.js';
import {setupPinHint} from './pin.js';

getInput('name').value = `Session · ${new Date().toLocaleDateString()}`;
getInput('name').maxLength = MAX_NAME_LENGTH;
getElement('save-form').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const reply = await sendCommand({type: 'save', id: getSelect('scope').value, value: getInput('name').value});
    getElement('status').textContent = reply.message;
  });
});
void setupPinHint('pin-hint');
getElement('library').addEventListener('click', () => {
  run(async () => { await openLibrary(); });
});
