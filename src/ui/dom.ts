export function getElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing interface element: ${id}`);
  }
  return element;
}

export function getInput(id: string): HTMLInputElement {
  const element = getElement(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Expected input: ${id}`);
  }
  return element;
}

export function getSelect(id: string): HTMLSelectElement {
  const element = getElement(id);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`Expected select: ${id}`);
  }
  return element;
}

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

let busy = false;
export function run(action: () => Promise<void>): void {
  if (busy) {
    return;
  }
  busy = true;
  const status = getElement('status');
  status.textContent = 'Working…';
  const buttons = [...document.querySelectorAll('button')].map(button => ({button, disabled: button.disabled}));
  buttons.forEach(({button}) => { button.disabled = true; });
  void action().catch((error: unknown) => {
    status.textContent = error instanceof Error ? error.message : 'Something went wrong. Please retry.';
  }).finally(() => {
    busy = false;
    buttons.forEach(({button, disabled}) => { button.disabled = disabled; });
  });
}
