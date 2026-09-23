import type {Command} from '../shared/messages.js';

export type ActionHandler<Result = void> = (type: Command['type'], id?: string, value?: string) => Result;
