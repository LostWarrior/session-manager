import {listen} from '../platform/browser.js';
import {execute} from '../services/commands.js';

// Serialize mutations from multiple extension views. Durable data lives in IDB.
let queue: Promise<unknown> = Promise.resolve();
listen(command => {
  const operation = queue.then(() => execute(command));
  // Keep the queue usable after an operation rejects; listen owns reply conversion.
  queue = operation.then(() => undefined, () => undefined);
  return operation;
});
