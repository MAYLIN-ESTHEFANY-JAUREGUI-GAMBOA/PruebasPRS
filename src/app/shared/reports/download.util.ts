/** Descarga compartida (§6.1): el binario nace y muere en el navegador, nunca viaja al servidor. */
export async function descargar(contenido: Blob | ArrayBuffer, nombreArchivo: string, tipo: string): Promise<void> {
  const { saveAs } = await import('file-saver');
  saveAs(contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo }), nombreArchivo);
}

export const MIME = {
  PDF: 'application/pdf',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
} as const;
