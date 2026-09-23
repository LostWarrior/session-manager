import {buildExports} from '../domain/export.js';
import {parseImportFile} from '../domain/import-file.js';
import {countTabs, parseSessions} from '../domain/session.js';
import {MAX_IMPORT_FILE_BYTES} from '../shared/limits.js';
import {sendCommand} from '../platform/browser.js';
import type {ActionHandler} from './actions.js';
import {element, getElement, getInput, run} from './dom.js';

function download(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
  const link = element('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => { URL.revokeObjectURL(url); }, 60000);
}

async function exportSessions(): Promise<void> {
  const reply = await sendCommand({type: 'list', id: '', value: ''});
  const data = parseSessions(reply.data).filter(session => !session.deleted);
  // Large libraries are split so every file stays within import limits.
  const files = buildExports(data);
  const date = new Date().toISOString().slice(0, 10);
  files.forEach((text, index) => {
    download(text, files.length === 1 ? `sessions-${date}.json` : `sessions-${date}-part-${index + 1}-of-${files.length}.json`);
  });
  getElement('status').textContent = files.length === 1 ?
    'Export prepared. Keep the file private; URLs can contain sensitive information.' :
    `Export prepared as ${files.length} files; import each one to restore everything. Your browser may ask to allow multiple downloads. Keep the files private; URLs can contain sensitive information.`;
}

/** Shows import progress on the Import control; `undefined` restores it. */
function setImportProgress(label: string | undefined): void {
  const button = getElement('import-button');
  button.classList.toggle('busy', label !== undefined);
  button.setAttribute('aria-busy', String(label !== undefined));
  getInput('import').disabled = label !== undefined;
  getElement('import-label').textContent = label ?? 'Import';
}

async function importSessions(file: File, update: ActionHandler<Promise<void>>): Promise<void> {
  setImportProgress('Reading…');
  try {
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw new Error('Choose an export smaller than 50 MB.');
    }
    const {sessions: imported, skipped} = parseImportFile(await file.text());
    if (imported.length === 0) {
      throw new Error('No sessions with HTTP or HTTPS tabs were found in this file. Private tabs are excluded.');
    }
    const tabCount = imported.reduce((count, session) => count + countTabs(session), 0);
    const skippedNote = skipped ? ` ${skipped} sessions without importable tabs will be skipped.` : '';
    if (!confirm(`Import ${imported.length} sessions with ${tabCount} tabs as new copies? Existing sessions will be kept.${skippedNote}`)) {
      getElement('status').textContent = 'Import cancelled.';
      return;
    }
    // Large files are sent in batches that each fit the background's per-message limits.
    const batches = buildExports(imported);
    for (const [index, batch] of batches.entries()) {
      setImportProgress(batches.length === 1 ? 'Importing…' : `Importing ${index + 1} of ${batches.length}…`);
      try {
        await update('import', '', batch);
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : 'Something went wrong.';
        throw new Error(index === 0 ? reason : `Imported ${index} of ${batches.length} batches; the rest failed. ${reason} Re-importing will duplicate sessions already added.`, {cause: error});
      }
    }
    if (batches.length > 1 || skipped) {
      getElement('status').textContent = `Imported ${imported.length} sessions as new copies.${skipped ? ` Skipped ${skipped} without importable tabs.` : ''}`;
    }
  } finally {
    setImportProgress(undefined);
    getInput('import').value = '';
  }
}

export function setupTransfer(update: ActionHandler<Promise<void>>): void {
  getElement('export').addEventListener('click', () => { run(exportSessions); });
  getInput('import').addEventListener('change', () => {
    const file = getInput('import').files?.[0];
    if (file) {
      run(() => importSessions(file, update));
    }
  });
}
