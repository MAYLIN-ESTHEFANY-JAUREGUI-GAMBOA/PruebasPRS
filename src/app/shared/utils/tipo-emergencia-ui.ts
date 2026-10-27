import { TipoEmergencia } from '../../core/models/incident';

const ETIQUETAS: Record<TipoEmergencia, string> = {
  ACCIDENTE_TRANSITO: 'Accidente de tránsito',
  INCENDIO: 'Incendio',
  SALUD: 'Salud',
  EMERGENCIA_MEDICA: 'Emergencia médica',
  ROBO: 'Robo',
  VIOLENCIA: 'Violencia',
  SEGURIDAD: 'Seguridad',
  DESASTRE_NATURAL: 'Desastre natural',
  EXPLOSION: 'Explosión',
  OTRO: 'Otro'
};

export function etiquetaTipoEmergencia(tipo: TipoEmergencia): string {
  return ETIQUETAS[tipo] ?? tipo;
}

const ICONOS_EMOJI: Record<TipoEmergencia, string> = {
  ACCIDENTE_TRANSITO: '🚗',
  INCENDIO: '🔥',
  SALUD: '⚕️',
  EMERGENCIA_MEDICA: '🚑',
  ROBO: '🔒',
  VIOLENCIA: '⚠️',
  SEGURIDAD: '👮',
  DESASTRE_NATURAL: '🌊',
  EXPLOSION: '💥',
  OTRO: '📋'
};

const ICONOS_MATERIAL: Record<TipoEmergencia, string> = {
  ACCIDENTE_TRANSITO: 'car_crash',
  INCENDIO: 'local_fire_department',
  SALUD: 'medical_services',
  EMERGENCIA_MEDICA: 'emergency',
  ROBO: 'lock',
  VIOLENCIA: 'warning',
  SEGURIDAD: 'shield',
  DESASTRE_NATURAL: 'flood',
  EXPLOSION: 'explosion',
  OTRO: 'emergency'
};

export function iconoTipoEmergencia(tipo: TipoEmergencia): string {
  return ICONOS_EMOJI[tipo] ?? '⚠️';
}

export function iconoMaterialTipoEmergencia(tipo: TipoEmergencia): string {
  return ICONOS_MATERIAL[tipo] ?? 'warning';
}

export function claseTipoEmergencia(tipo: TipoEmergencia): string {
  switch (tipo) {
    case 'INCENDIO':
    case 'EXPLOSION':
      return 'civic-type-icon--fire';
    case 'EMERGENCIA_MEDICA':
    case 'SALUD':
      return 'civic-type-icon--health';
    case 'ROBO':
    case 'VIOLENCIA':
    case 'SEGURIDAD':
      return 'civic-type-icon--security';
    case 'DESASTRE_NATURAL':
      return 'civic-type-icon--nature';
    case 'ACCIDENTE_TRANSITO':
      return 'civic-type-icon--transit';
    default:
      return 'civic-type-icon--other';
  }
}
