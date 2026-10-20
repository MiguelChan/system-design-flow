export type DeleteShortcut = Pick<
  KeyboardEvent,
  | 'key'
  | 'repeat'
  | 'altKey'
  | 'ctrlKey'
  | 'metaKey'
  | 'shiftKey'
  | 'isComposing'
  | 'defaultPrevented'
>;

export function shouldDeleteSelection(
  event: DeleteShortcut,
  editing: boolean,
  modalOpen: boolean,
): boolean {
  return (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    !editing &&
    !modalOpen &&
    !event.repeat &&
    !event.isComposing &&
    !event.defaultPrevented &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}
export function isEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    ) !== null
  );
}
