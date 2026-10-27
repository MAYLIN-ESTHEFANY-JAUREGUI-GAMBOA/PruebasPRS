/** Contrato de vg-ms-catalogo (JSON en inglés y compatibilidad con backend). */
export interface Catalogo {
  id?: string;

  group?: string | null;
  key?: string | null;

  displayLabel?: string | null;
  parentCategory?: string | null;
  resourceType?: string | null;

  mapIcon?: string | null;
  status?: string | null;

  createdAt?: string | null;

  // Campos de compatibilidad con respuesta directa del microservicio
  grupo?: string | null;
  clave?: string | null;
  etiquetaVisual?: string | null;
  categoriaPadre?: string | null;
  tipoRecurso?: string | null;
  iconoMapa?: string | null;
  estado?: string | null;
  creadoEn?: string | null;
}
