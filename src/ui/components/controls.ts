import {isWebUrl} from '../../domain/session.js';
import {element} from '../dom.js';

export function actionButton(label: string, action: () => void): HTMLButtonElement {
  const button = element('button', label);
  button.type = 'button';
  button.addEventListener('click', action);
  return button;
}

export function externalLink(label: string, url: string): HTMLAnchorElement {
  if (!isWebUrl(url)) {
    throw new Error('Only HTTP and HTTPS links can be opened.');
  }
  const link = element('a', label);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}
