import { csvAFilas, desdeTabla, leerArchivoRoles } from './roles-import';

describe('roles-import', () => {
  it('lee CSV con ; comillas y encabezados en español', () => {
    const filas = csvAFilas('﻿rol;descripcion\r\nANALISTA;"Métricas; solo lectura"\r\n\r\nCIUDADANO;\n');
    expect(desdeTabla(filas)).toEqual([
      { roleName: 'ANALISTA', description: 'Métricas; solo lectura' },
      { roleName: 'CIUDADANO' }
    ]);
  });

  it('sin encabezado usa columna 1 como rol', () => {
    expect(desdeTabla(csvAFilas('OPERADOR_ENTIDAD,Atiende emergencias'))).toEqual([
      { roleName: 'OPERADOR_ENTIDAD', description: 'Atiende emergencias' }
    ]);
  });

  it('lee JSON como arreglo, { roles } o nombres sueltos', async () => {
    const json = (t: string) => leerArchivoRoles(new File([t], 'r.json'));
    expect(await json('[{"roleName":"ANALISTA","description":"x"}]')).toEqual([{ roleName: 'ANALISTA', description: 'x' }]);
    expect(await json('{"roles":[{"nombre_rol":"CIUDADANO"},"ENTIDAD_ADMIN"]}'))
      .toEqual([{ roleName: 'CIUDADANO' }, { roleName: 'ENTIDAD_ADMIN' }]);
  });

  it('rechaza formatos no soportados', async () => {
    await expectAsync(leerArchivoRoles(new File(['x'], 'r.pdf'))).toBeRejectedWithError(/Formato no soportado/);
  });
});
