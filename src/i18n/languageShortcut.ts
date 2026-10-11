/** Shared keyboard guard for the app-wide language toggle (Ctrl/Cmd + Alt + L). */
export function isLanguageToggleShortcut(event: KeyboardEvent): boolean {
  if (
    event.repeat ||
    event.isComposing ||
    !(event.ctrlKey || event.metaKey) ||
    !event.altKey ||
    event.shiftKey ||
    (event.code !== 'KeyL' && event.key.toLowerCase() !== 'l')
  ) return false

  const target = event.target
  if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], [inert]')) return false

  const blockingDialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
    .some(dialog => !dialog.closest('.tm-panel, .experiments-layer'))
  return !blockingDialog
}
