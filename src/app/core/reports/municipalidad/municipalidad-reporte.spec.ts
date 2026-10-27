import { hojaEntidades, reporteFichaMunicipalidad, reportePadronMunicipalidades } from './municipalidad-reporte.model';

const MUNI = {
  nombre: 'Municipalidad Provincial de Cañete', ruc: '20145676112', tipo: 'Provincial',
  jurisdiccion: 'Lima / Cañete / San Vicente de Cañete', telefono: '(01) 581-2015', email: null,
  direccion: 'Jr. Bolognesi 250', entidades: 1, estado: 'Activa'
};
const ENT = { municipalidad: MUNI.nombre, nombre: 'Serenazgo', ruc: '20111111111', tipo: 'Serenazgo', distrito: 'Imperial', estado: 'Activa' };

describe('municipalidad-reporte', () => {
  it('padrón: una fila por municipalidad, columna de estado marcada', () => {
    const r = reportePadronMunicipalidades([MUNI], { estado: 'Todas', busqueda: '' });
    expect(r.filas).toEqual([[MUNI.nombre, MUNI.ruc, 'Provincial', MUNI.jurisdiccion, MUNI.telefono, null, 1, 'Activa']]);
    expect(r.columnas.filter(c => c.estado).map(c => c.titulo)).toEqual(['Estado']);
  });

  it('ficha: datos de registro en la cabecera y entidades en el detalle', () => {
    const r = reporteFichaMunicipalidad(MUNI, [ENT]);
    expect(r.filtros?.find(f => f.etiqueta === 'RUC')?.valor).toBe(MUNI.ruc);
    expect(r.placeholder).toBe(MUNI.ruc);
    expect(r.filas).toEqual([['Serenazgo', '20111111111', 'Serenazgo', 'Imperial', 'Activa']]);
  });

  it('hoja de entidades del Excel incluye la municipalidad y marca el estado', () => {
    const h = hojaEntidades([ENT]);
    expect(h.filas[0][0]).toBe(MUNI.nombre);
    expect(h.columnas[h.estados![0]]).toBe('Estado');
  });
});
