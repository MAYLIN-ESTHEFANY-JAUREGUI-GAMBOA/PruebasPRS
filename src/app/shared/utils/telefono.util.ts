/** Dígitos locales Perú: celular 9XXXXXXXX o fijo 7–8 dígitos (opcional prefijo +51). */
export function sanitizarTelefonoInput(valor: string): string {
  return (valor ?? '').replace(/[^\d+\s()-]/g, '').slice(0, 20);
}

export function extraerDigitosTelefono(valor: string): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** Formatea celular 9XX XXX XXX mientras se escribe. */
export function formatearTelefonoAlEscribir(valor: string): string {
  const digits = extraerDigitosTelefono(valor);
  if (!digits) return '';

  let local = digits;
  if (local.startsWith('51') && local.length > 9) {
    local = local.slice(2);
  }

  if (!local.startsWith('9')) {
    return local.slice(0, 9);
  }

  if (local.length <= 3) return local;
  if (local.length <= 6) return `${local.slice(0, 3)} ${local.slice(3)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 9)}`;
}

export function validarTelefonoPeru(valor: string): string {
  const limpio = (valor ?? '').trim();
  if (!limpio) return '';

  const digits = extraerDigitosTelefono(limpio);
  if (!digits) {
    return 'Ingrese solo números. Ejemplo: 987 654 321';
  }

  let local = digits;
  if (local.startsWith('51')) {
    local = local.slice(2);
  }

  if (local.length === 9 && local.startsWith('9')) {
    return '';
  }

  if (local.length >= 7 && local.length <= 8) {
    return '';
  }

  if (local.length === 9 && !local.startsWith('9')) {
    return 'El celular debe empezar con 9 (ej. 987 654 321).';
  }

  if (local.length < 7) {
    return 'El número es demasiado corto.';
  }

  return 'Use celular de 9 dígitos (9XX XXX XXX) o fijo de 7–8 dígitos.';
}
