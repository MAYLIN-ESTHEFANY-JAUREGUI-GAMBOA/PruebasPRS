import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, firstValueFrom, forkJoin } from 'rxjs';

import { ResultadoImportRol, RolSistema, UsuarioAdminService } from '../../../core/services/usuario-admin';
import { leerArchivoRoles } from './roles-import';
import { CivicToastService } from '../../../shared/services/civic-toast.service';

/** Roles que el sistema reconoce, en orden de alcance: nombre legible, alcance y descripción sugerida. */
const SISTEMA: Record<string, { nombre: string; sigla: string; alcance: string; descripcion: string }> = {
  SUPER_ADMIN: { nombre: 'Super administrador', sigla: 'SA', alcance: 'Plataforma', descripcion: 'Administración total de la plataforma' },
  MUNICIPALIDAD_ADMIN: { nombre: 'Administrador municipal', sigla: 'AM', alcance: 'Municipalidad', descripcion: 'Gestiona su municipalidad: entidades y personal municipal' },
  ENTIDAD_ADMIN: { nombre: 'Administrador de entidad', sigla: 'AE', alcance: 'Entidad', descripcion: 'Gestiona su entidad y su personal' },
  OPERADOR_ENTIDAD: { nombre: 'Operador', sigla: 'OP', alcance: 'Entidad', descripcion: 'Atiende emergencias de su entidad' },
  ANALISTA: { nombre: 'Analista', sigla: 'AN', alcance: 'Entidad o municipalidad', descripcion: 'Solo lectura de métricas de su entidad o municipalidad' },
  CIUDADANO: { nombre: 'Ciudadano', sigla: 'CI', alcance: 'App de alertas', descripcion: 'Usuario de la app de alertas' }
};
const ORDEN = Object.keys(SISTEMA);

/** Fila del catálogo: rol creado, o pendiente si el sistema lo reconoce pero aún no existe. */
interface FilaRol { codigo: string; rol?: RolSistema; }

interface FormRol { roleName: string; description: string; status: string; }

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './roles.html',
  styleUrls: ['../municipalidades/municipalidades.css', './roles.css']
})
export class Roles implements OnInit {
  private readonly api = inject(UsuarioAdminService);
  private readonly toast = inject(CivicToastService);

  readonly roles = signal<RolSistema[]>([]);
  readonly disponibles = signal<string[]>([]);
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  /** null = modal cerrado; con id = edición. */
  readonly modal = signal<{ id?: string } | null>(null);
  readonly resultadoImport = signal<ResultadoImportRol[] | null>(null);
  form: FormRol = { roleName: '', description: '', status: 'ACTIVO' };
  readonly estados = [
    { valor: 'ACTIVO', nombre: 'Activo', efecto: 'Se puede asignar a usuarios' },
    { valor: 'INACTIVO', nombre: 'Inactivo', efecto: 'No se asigna a usuarios nuevos' }
  ];

  /** Catálogo completo: creados y pendientes en orden de alcance; roles desconocidos al final. */
  readonly filas = computed<FilaRol[]>(() => {
    const creados = new Map(this.roles().map(r => [r.roleName, r]));
    const codigos = [...new Set([...ORDEN, ...creados.keys()])]
      .filter(c => creados.has(c) || this.disponibles().includes(c));
    return codigos.map(codigo => ({ codigo, rol: creados.get(codigo) }));
  });

  info = (codigo: string) => SISTEMA[codigo] ?? { nombre: codigo, sigla: codigo.slice(0, 2), alcance: 'Sin definir', descripcion: '' };
  descripcion = (rol: RolSistema) => rol.description || this.info(rol.roleName).descripcion;

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const { roles, disponibles } = await firstValueFrom(
        forkJoin({ roles: this.api.listarRoles(), disponibles: this.api.rolesDisponibles() }));
      this.roles.set(roles);
      this.disponibles.set(disponibles);
    } catch (err) {
      this.toast.error(mensaje(err, 'No se pudieron cargar los roles.'));
    } finally {
      this.cargando.set(false);
    }
  }

  abrirCrear(nombre = this.disponibles()[0] ?? ''): void {
    this.form = { roleName: nombre, description: this.info(nombre).descripcion, status: 'ACTIVO' };
    this.modal.set({});
  }

  abrirEditar(rol: RolSistema): void {
    this.form = { roleName: rol.roleName, description: this.descripcion(rol), status: rol.status ?? 'ACTIVO' };
    this.modal.set({ id: rol.id });
  }

  cambiarNombre(nombre: string): void {
    this.form.roleName = nombre;
    this.form.description = this.info(nombre).descripcion;
  }

  async guardar(): Promise<void> {
    const id = this.modal()?.id;
    const op = id
      ? this.api.actualizarRol(id, { description: this.form.description, status: this.form.status })
      : this.api.crearRol(this.form.roleName, this.form.description);
    if (await this.ejecutar(op, id ? `Rol ${this.form.roleName} actualizado.` : `Rol ${this.form.roleName} creado.`)) {
      this.modal.set(null);
    }
  }

  async importar(input: HTMLInputElement): Promise<void> {
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    let filas;
    try {
      filas = await leerArchivoRoles(archivo);
    } catch (err) {
      this.toast.error(err instanceof Error ? `No se pudo leer el archivo: ${err.message}` : 'No se pudo leer el archivo.');
      return;
    }
    if (!filas.length) {
      this.toast.error('El archivo no contiene roles.');
      return;
    }
    this.guardando.set(true);
    try {
      const resultado = await firstValueFrom(this.api.importarRoles(filas));
      this.resultadoImport.set(resultado);
      const creados = resultado.filter(r => r.result === 'CREADO').length;
      this.toast.success(`Importación: ${creados} creado(s), ${resultado.length - creados} omitido(s).`);
      await this.cargar();
    } catch (err) {
      this.toast.error(mensaje(err, 'No se pudo importar el archivo.'));
    } finally {
      this.guardando.set(false);
    }
  }

  async eliminar(rol: RolSistema): Promise<void> {
    if (!confirm(`¿Eliminar el rol ${rol.roleName}? Solo es posible si ningún usuario lo tiene asignado.`)) return;
    await this.ejecutar(this.api.eliminarRol(rol.id), `Rol ${rol.roleName} eliminado.`);
  }

  private async ejecutar(op: Observable<unknown>, ok: string): Promise<boolean> {
    this.guardando.set(true);
    try {
      await firstValueFrom(op, { defaultValue: undefined });
      this.toast.success(ok);
      await this.cargar();
      return true;
    } catch (err) {
      this.toast.error(mensaje(err, 'No se pudo completar la operación.'));
      return false;
    } finally {
      this.guardando.set(false);
    }
  }
}

function mensaje(err: unknown, porDefecto: string): string {
  const e = (err as { error?: { error?: string } })?.error?.error;
  return typeof e === 'string' && e ? e : porDefecto;
}
