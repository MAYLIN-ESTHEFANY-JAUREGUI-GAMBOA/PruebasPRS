import { UbigeoService } from './ubigeo.service';

describe('UbigeoService', () => {
  const mapa = { '15': 'LIMA', '1505': 'CAÑETE', '1501': 'LIMA', '150501': 'SAN VICENTE DE CAÑETE', '150502': 'ASIA', '04': 'AREQUIPA' };

  it('hijos: solo el nivel siguiente del padre, ordenado', () => {
    expect(UbigeoService.hijos(mapa, '').map(o => o.codigo)).toEqual(['04', '15']);
    expect(UbigeoService.hijos(mapa, '1505').map(o => o.nombre)).toEqual(['ASIA', 'SAN VICENTE DE CAÑETE']);
  });

  it('jurisdiccion: igual que Municipality.jurisdiction() del backend', () => {
    expect(UbigeoService.jurisdiccion({ ubigeo: '150501', type: 'PROVINCIAL' })).toBe('1505');
    expect(UbigeoService.jurisdiccion({ ubigeo: '150502', type: 'DISTRITAL' })).toBe('150502');
    expect(UbigeoService.jurisdiccion(null)).toBe('');
  });
});
