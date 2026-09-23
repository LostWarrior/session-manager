import {countTabs} from '../../domain/session.js';
import type {Session} from '../../domain/session.js';
import type {ActionHandler} from '../actions.js';
import {element} from '../dom.js';
import {actionButton, externalLink} from './controls.js';
import {quantity} from '../../shared/format.js';

function sessionActions(session: Session, onAction: ActionHandler): HTMLElement {
  const actions = element('div', '', 'actions');
  if (session.deleted) {
    actions.append(actionButton('Recover', () => { onAction('recover', session.id); }));
    actions.append(actionButton('Delete permanently', () => {
      if (confirm(`Permanently delete “${session.name}” and its saved URLs? This cannot be undone.`)) {
        onAction('delete-permanently', session.id);
      }
    }));
    return actions;
  }
  actions.append(actionButton('Restore', () => {
    if (confirm(`Open ${quantity(countTabs(session), 'tab')} in ${quantity(session.windows.length, 'new window')}? Existing tabs will stay open.`)) {
      onAction('restore', session.id);
    }
  }));
  actions.append(actionButton(session.favorite ? 'Unfavorite' : 'Favorite', () => { onAction('favorite', session.id); }));
  actions.append(actionButton('Rename', () => {
    const name = prompt('Session name', session.name);
    if (name !== null) {
      onAction('rename', session.id, name);
    }
  }));
  actions.append(actionButton('Move to Trash', () => { onAction('trash', session.id); }));
  return actions;
}

function tabPreview(session: Session): HTMLElement {
  const details = element('details');
  details.append(element('summary', 'View saved tabs'));
  // Links are built on first expansion; most previews are never opened.
  details.addEventListener('toggle', () => {
    if (!details.open || details.childElementCount > 1) {
      return;
    }
    session.windows.forEach((window, index) => {
      details.append(element('p', `Window ${index + 1}`));
      const list = element('ul');
      for (const tab of window.tabs) {
        const item = element('li');
        item.append(externalLink(`${tab.pinned ? 'Pinned · ' : ''}${tab.title}`, tab.url));
        list.append(item);
      }
      details.append(list);
    });
  });
  return details;
}

export function sessionRow(session: Session, onAction: ActionHandler): HTMLElement {
  const row = element('article', '', 'session');
  const top = element('div', '', 'session-top');
  const description = element('div');
  description.append(element('h2', `${session.favorite ? '★ ' : ''}${session.name}`));
  description.append(element('div', `${quantity(countTabs(session), 'tab')} · ${quantity(session.windows.length, 'window')} · ${new Date(session.createdAt).toLocaleString()}`, 'meta'));
  top.append(description, sessionActions(session, onAction));
  row.append(top, tabPreview(session));
  return row;
}
