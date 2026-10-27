/** Bloquea scroll y eleva civic-main sobre el sidebar mientras hay modal abierto. */
export function lockPageScroll(doc: Document): void {
  doc.body.classList.add('civic-modal-open');
}

export function unlockPageScroll(doc: Document): void {
  doc.body.classList.remove('civic-modal-open');
}
