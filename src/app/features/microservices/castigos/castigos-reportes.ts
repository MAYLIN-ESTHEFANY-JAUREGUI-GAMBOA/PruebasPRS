import { Component, HostListener, Input, ViewEncapsulation } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { UsuarioAdmin, CastigoHistorialEntry, CastigoResponse, etiquetaNivelCastigo } from '../../../core/models/usuario.model';
import { ReportBrandingService } from '../../../shared/reports/report-branding.service';
import { CastigoExcelService } from '../../../core/reports/castigo/castigo-excel.service';
import { CastigoPdfService } from '../../../core/reports/castigo/castigo-pdf.service';
import { AuditoriaReporteFila, SancionadoReporteFila } from '../../../core/reports/castigo/castigo-reporte.model';
import { ReportConstants } from '../../../shared/reports/report.constants';
import { codigoReporte, fechaHoraIso } from '../../../shared/reports/report-format';
import { distribucion, tonoEstado } from '../../../shared/reports/report-estilo';
import { Membrete } from '../../../shared/reports/report.model';

/** Todo dato del usuario va escapado: el HTML se escribe con document.write en una ventana del mismo origen. */
function esc(valor: unknown): string {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const RGB = (c: readonly number[]) => `rgb(${c.join(',')})`;

/** Etiqueta con el mismo color semántico que el PDF y el Excel. */
function pildora(texto: unknown): string {
  const t = tonoEstado(String(texto ?? ''));
  return `<span class="badge" style="background:${RGB(t.fondo)};color:${RGB(t.texto)}">${esc(String(texto ?? '—').replace(/_/g, ' '))}</span>`;
}

/** Fila de tarjetas: [etiqueta, valor, estado para el color ('' = color de marca)]. */
function tarjetas(items: [string, number, string][]): string {
  return `<div class="summary-grid">${items.map(([etiqueta, valor, estado]) => `
    <div class="summary-card"${estado ? ` style="--card:${RGB(tonoEstado(estado).texto)}"` : ''}>
      <div class="summary-val">${valor}</div><div class="summary-lbl">${esc(etiqueta.replace(/_/g, ' '))}</div>
    </div>`).join('')}</div>`;
}

type TipoReporte = 'sancionados' | 'niveles' | 'usuario' | 'auditoria' | 'resumen';

@Component({
  selector: 'app-castigos-reportes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './castigos-reportes.html',
  styleUrl: './castigos-reportes.css',
  encapsulation: ViewEncapsulation.None,
  providers: [DatePipe]
})
export class CastigosReportes {
  @Input() usuarios: UsuarioAdmin[] = [];
  @Input() sancionesActivas: UsuarioAdmin[] = [];
  @Input() historial: CastigoHistorialEntry[] = [];
  @Input() castigosPorUsuario: Record<string, CastigoResponse> = {};
  @Input() usuarioSeleccionadoParaReporte: UsuarioAdmin | null = null;
  @Input() hayFiltrosActivos: boolean = false;

  panelAbierto = false;
  tipoSeleccionado: TipoReporte | null = 'sancionados';
  generando = false;
  /** Ciudadano elegido dentro del modal; si no hay, se usa el que venga de la página. */
  ciudadanoReporteId: string | null = null;

  readonly tipos: { id: TipoReporte; titulo: string; desc: string }[] = [
    { id: 'sancionados', titulo: 'Sancionados', desc: 'Quiénes tienen una sanción vigente y hasta cuándo' },
    { id: 'niveles', titulo: 'Por nivel', desc: 'Casos agrupados en aviso, bloqueo temporal y permanente' },
    { id: 'usuario', titulo: 'Expediente individual', desc: 'Todo el historial de un ciudadano' },
    { id: 'auditoria', titulo: 'Auditoría', desc: 'Cada acción registrada, con fecha y motivo' },
    { id: 'resumen', titulo: 'Resumen ejecutivo', desc: 'Cifras clave para dirección' }
  ];

  get ciudadanoReporte(): UsuarioAdmin | null {
    return this.usuarios.find(u => u.id === this.ciudadanoReporteId) ?? this.usuarioSeleccionadoParaReporte;
  }

  get tipoActual() {
    return this.tipos.find(t => t.id === this.tipoSeleccionado) ?? null;
  }

  etiquetaNivel(n: number): string {
    return etiquetaNivelCastigo(n);
  }

  conteoNivel(n: number): number {
    return this.sancionesActivas.filter(u => this.nivelUsuario(u) === n).length;
  }

  /** Cifra que acompaña a cada tipo en la lista y en la vista previa. */
  conteoTipo(tipo: TipoReporte): string {
    switch (tipo) {
      case 'sancionados': return `${this.sancionesActivas.length} expedientes`;
      case 'niveles': return '3 niveles';
      case 'usuario': {
        const u = this.ciudadanoReporte;
        return u ? `${this.historial.filter(h => h.userId === u.id).length} movimientos` : 'Elegir ciudadano';
      }
      case 'auditoria': return `${this.historial.length} acciones`;
      default: return '1 página';
    }
  }

  fechaHoy(): string {
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date()).replace('.', '');
  }

  readonly puedeExportar: boolean;

  constructor(private datePipe: DatePipe, private branding: ReportBrandingService,
              private castigoPdf: CastigoPdfService, private castigoExcel: CastigoExcelService) {
    this.puedeExportar = branding.puedeExportar();
  }

  /** Sancionados y auditoría son tabulares: además de imprimirse, salen en PDF y Excel con la plantilla común. */
  get esTabular(): boolean {
    return this.tipoSeleccionado === 'sancionados' || this.tipoSeleccionado === 'auditoria';
  }

  /** Sin filas no se exporta (botón deshabilitado, §3.4). */
  get hayDatosTabular(): boolean {
    return this.tipoSeleccionado === 'sancionados' ? this.sancionesActivas.length > 0
      : this.tipoSeleccionado === 'auditoria' ? this.historial.length > 0 : false;
  }

  async exportar(formato: 'pdf' | 'xlsx'): Promise<void> {
    if (!this.esTabular || !this.hayDatosTabular || this.generando) return;
    const filtros = this.hayFiltrosActivos ? [{ etiqueta: 'Filtros', valor: 'Filtros de la tabla activos' }] : [];
    const motor = formato === 'pdf' ? this.castigoPdf : this.castigoExcel;
    this.generando = true;
    try {
      await (this.tipoSeleccionado === 'sancionados'
        ? motor.generarSancionados(this.filasSancionados(), filtros)
        : motor.generarAuditoria(this.filasAuditoria(), filtros));
    } finally {
      this.generando = false;
    }
  }

  private filasSancionados(): SancionadoReporteFila[] {
    return this.sancionesActivas.map(u => ({
      dni: u.dni, nombre: this.formatNombre(u.nombres, u.apellidos), nivel: this.nivelUsuario(u),
      motivo: this.motivoCastigo(u), acceso: this.accesoPermitido(u) ? 'Permitido' : 'Bloqueado'
    }));
  }

  private filasAuditoria(): AuditoriaReporteFila[] {
    return this.historial.map(h => ({
      fecha: h.recordedAt, ciudadano: h.fullName || 'Desconocido', dni: h.dni, accion: h.action,
      nivelAnterior: h.previousLevel, nivelNuevo: h.newLevel, motivo: h.reason
    }));
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.panelAbierto && !this.generando) {
      this.togglePanel();
    }
  }

  togglePanel() {
    this.panelAbierto = !this.panelAbierto;
    if (!this.panelAbierto) {
      this.tipoSeleccionado = 'sancionados'; this.ciudadanoReporteId = null;
    }
  }

  seleccionarTipo(tipo: TipoReporte) {
    this.tipoSeleccionado = tipo;
  }

  async generarReporte() {
    if (!this.tipoSeleccionado) return;

    this.generando = true;
    // La ventana se abre en el mismo gesto del clic (si se abre tras un await, el navegador la bloquea).
    const w = window.open('', '_blank');
    const membrete = await this.branding.membrete();

    setTimeout(() => {
      if (!w) {
        alert('Por favor permita las ventanas emergentes (pop-ups) para ver el reporte.');
        this.generando = false;
        return;
      }

      const html = this.construirHtmlReporte(membrete);
      w.document.open();
      w.document.write(html);
      w.document.close();

      setTimeout(() => {
        w.print();
        this.generando = false;
        this.panelAbierto = false;
      }, 500);
    }, 100);
  }

  private construirHtmlReporte(m: Membrete): string {
    const fecha = fechaHoraIso(new Date());
    const codigo = codigoReporte();

    let contenido = '';
    let titulo = '';

    switch (this.tipoSeleccionado) {
      case 'sancionados':
        titulo = 'Reporte de Ciudadanos Sancionados';
        contenido = this.generarTablaSancionados();
        break;
      case 'niveles':
        titulo = 'Reporte por Nivel de Sanción';
        contenido = this.generarTablaPorNiveles();
        break;
      case 'usuario':
        titulo = 'Reporte de Expediente Individual';
        contenido = this.generarExpedienteUsuario();
        break;
      case 'auditoria':
        titulo = 'Registro de Auditoría de Moderación';
        contenido = this.generarTablaAuditoria();
        break;
      case 'resumen':
        titulo = 'Resumen Ejecutivo de Sanciones';
        contenido = this.generarResumenEjecutivo();
        break;
    }

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>${titulo} — ${esc(m.institucion)}</title>
        <style>
          :root {
            --c-brand: ${RGB(ReportConstants.HEADER_RGB)};
            --c-ink: ${RGB(ReportConstants.TEXTO_RGB)};
            --c-ink-light: ${RGB(ReportConstants.TEXTO_SUAVE_RGB)};
            --c-border: ${RGB(ReportConstants.BORDE_RGB)};
            --c-zebra: ${RGB(ReportConstants.FILA_ALTERNA_RGB)};
            --font: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          }
          @page {
            size: A4;
            margin: 12mm 12mm 16mm;
            @bottom-left { content: '${codigo} · Emitido ${fecha}'; font-family: Helvetica, Arial, sans-serif; font-size: 7.5pt; color: ${RGB(ReportConstants.TEXTO_SUAVE_RGB)}; }
            @bottom-center { content: 'Documento de uso interno — información confidencial'; font-family: Helvetica, Arial, sans-serif; font-size: 7.5pt; color: ${RGB(ReportConstants.TEXTO_SUAVE_RGB)}; }
            @bottom-right { content: 'Página ' counter(page) ' de ' counter(pages); font-family: Helvetica, Arial, sans-serif; font-size: 7.5pt; font-weight: 700; color: ${RGB(ReportConstants.TEXTO_SUAVE_RGB)}; }
          }
          * { box-sizing: border-box; }
          body { font-family: var(--font); color: var(--c-ink); line-height: 1.45; margin: 0; font-size: 9.5pt; }
          .report-header {
            display: flex; align-items: center; gap: 14px;
            border-top: 6px solid var(--c-brand); padding: 14px 0 12px;
            border-bottom: 2.5px solid var(--c-brand); box-shadow: 0 3px 0 -2px var(--c-border);
          }
          .report-header .logo { width: 58px; height: 58px; flex: none; }
          .report-header .logo img { width: 100%; height: 100%; object-fit: contain; }
          .report-header .titulos { flex: 1; min-width: 0; }
          .report-header .institucion { font-size: 13pt; font-weight: 700; }
          .report-header .plataforma { font-size: 8pt; color: var(--c-ink-light); }
          .report-header .codigo { text-align: right; flex: none; }
          .report-header .codigo small { display: block; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.6px; color: var(--c-brand); }
          .report-header .codigo strong { font-size: 9.5pt; }
          h1.report-title { font-size: 17pt; font-weight: 700; margin: 16px 0 10px; letter-spacing: -0.2px; }
          .ficha-emision { display: grid; grid-template-columns: 1fr 1.3fr 2.4fr; background: var(--c-zebra); border: 1px solid var(--c-border); margin-bottom: 20px; }
          .ficha-emision > div { padding: 7px 12px; }
          .ficha-emision > div + div { border-left: 1px solid var(--c-border); }
          .ficha-emision small { display: block; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.6px; color: var(--c-ink-light); }
          .ficha-emision strong { font-size: 9pt; }
          .cierre { text-align: center; color: var(--c-ink-light); font-size: 7.5pt; margin-top: 14px; }
          .cierre strong { display: block; font-size: 8pt; }
          .filtros { background: var(--c-zebra); border-radius: 6px; padding: 8px 12px; margin-bottom: 16px; font-size: 9pt; }
          .filtros small { display: block; font-size: 7pt; font-weight: 700; letter-spacing: 0.6px; color: var(--c-brand); }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
          th {
            text-align: left; background: var(--c-brand); color: #fff; padding: 8px 9px;
            font-weight: 700; font-size: 7pt; letter-spacing: 0.5px; text-transform: uppercase;
          }
          table:not(.ficha) { border-bottom: 2px solid var(--c-brand); }
          td { padding: 8px 9px; border-bottom: 1px solid var(--c-border); vertical-align: middle; }
          tbody tr:nth-child(even) td { background: var(--c-zebra); }
          table.ficha td { border-bottom: 1px solid var(--c-border); background: none !important; }
          table.ficha td:first-child { color: var(--c-ink-light); font-weight: 600; }
          .badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 7.5pt; font-weight: 700; white-space: nowrap; }
          .text-right { text-align: right; }
          .font-mono { font-family: ui-monospace, monospace; font-size: 8.5pt; }
          .mb-4 { margin-bottom: 1rem; }
          .section-title {
            font-size: 11.5pt; font-weight: 700; margin: 22px 0 10px; padding: 0 0 6px 10px;
            border-left: 4px solid var(--c-brand); border-bottom: 1px solid var(--c-border); break-after: avoid;
          }
          .panel { border: 1px solid var(--c-border); border-radius: 8px; padding: 4px 16px 10px; margin-bottom: 18px; break-inside: avoid; }
          .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 20px; }
          .summary-card { border: 1px solid var(--c-border); border-top: 3px solid var(--card, var(--c-brand)); padding: 9px 14px; }
          .summary-val { font-size: 18pt; font-weight: 700; color: var(--c-ink); line-height: 1.1; }
          .summary-lbl { font-size: 7.5pt; color: var(--c-ink-light); text-transform: uppercase; letter-spacing: 0.4px; }
          @media print {
            .no-print { display: none; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          @media screen { body { max-width: 210mm; margin: 0 auto; padding: 16px; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="background:#fef3c7; color:#92400e; padding:10px; text-align:center; margin-bottom:20px; border:1px solid #fde68a; border-radius:4px;">
          Esta es la vista de impresión. Utilice el diálogo del navegador para imprimir o guardar como PDF.
          <button onclick="window.print()" style="margin-left:10px; padding:4px 12px; background:#d97706; color:white; border:none; border-radius:4px; cursor:pointer;">Imprimir ahora</button>
          <button onclick="window.close()" style="margin-left:10px; padding:4px 12px; background:white; border:1px solid #d97706; color:#d97706; border-radius:4px; cursor:pointer;">Cerrar</button>
        </div>

        <header class="report-header">
          <div class="logo"><img src="${m.logoDataUrl}" alt=""></div>
          <div class="titulos">
            <div class="institucion">${esc(m.institucion)}</div>
            <div class="plataforma">${ReportConstants.PLATAFORMA} · ${ReportConstants.PLATAFORMA_SUBTITULO}</div>
          </div>
          <div class="codigo"><small>REPORTE N.°</small><strong>${codigo}</strong></div>
        </header>
        <h1 class="report-title">${titulo}</h1>
        <div class="ficha-emision">
          <div><small>FECHA DE EMISIÓN</small><strong>${fecha}</strong></div>
          <div><small>EMITIDO POR</small><strong>${esc(m.generadoPor)}</strong></div>
          <div><small>CRITERIOS DE CONSULTA</small>${this.hayFiltrosActivos ? 'Filtros actuales de la tabla' : 'Sin filtros (todos los registros)'}</div>
        </div>

        <main>
          ${contenido}
        </main>
        <div class="cierre"><strong>— Fin del reporte —</strong>Documento generado automáticamente. Refleja la información registrada en el sistema a la fecha de emisión.</div>
      </body>
      </html>
    `;
    return html;
  }

  private formatNombre(nombres: string, apellidos: string): string {
    return [nombres, apellidos].filter(Boolean).join(' ') || 'Sin nombre';
  }

  nivelUsuario(u: UsuarioAdmin): number {
    return this.castigosPorUsuario[u.id]?.nivelCastigo ?? 0;
  }

  private motivoCastigo(u: UsuarioAdmin): string {
    return this.castigosPorUsuario[u.id]?.motivoUltimoCastigo ?? 'Sin motivo registrado';
  }

  private accesoPermitido(u: UsuarioAdmin): boolean {
    return this.castigosPorUsuario[u.id]?.accesoPermitido ?? true;
  }

  private fechaFin(u: UsuarioAdmin): string {
    const fin = this.castigosPorUsuario[u.id]?.fechaFinBloqueoTemporal;
    return fin ? (this.datePipe.transform(fin, 'dd/MM/yyyy HH:mm') || '—') : '—';
  }

  private generarTablaSancionados(): string {
    const filas = this.sancionesActivas.map(u => `
      <tr>
        <td class="font-mono">${esc(u.dni)}</td>
        <td>${esc(this.formatNombre(u.nombres, u.apellidos))}</td>
        <td>${pildora(etiquetaNivelCastigo(this.nivelUsuario(u)))}</td>
        <td>${esc(this.motivoCastigo(u))}</td>
        <td>${pildora(this.accesoPermitido(u) ? 'Permitido' : 'Bloqueado')}</td>
      </tr>
    `).join('');

    const bloqueados = this.sancionesActivas.filter(u => !this.accesoPermitido(u)).length;
    return tarjetas([['Sancionados', this.sancionesActivas.length, ''], ['Acceso bloqueado', bloqueados, 'Bloqueado'],
      ['Acceso permitido', this.sancionesActivas.length - bloqueados, 'Permitido']]) + `
      <table>
        <thead>
          <tr>
            <th>DNI</th>
            <th>Nombre Completo</th>
            <th>Nivel</th>
            <th>Último Motivo</th>
            <th>Acceso</th>
          </tr>
        </thead>
        <tbody>
          ${filas.length > 0 ? filas : '<tr><td colspan="5" style="text-align:center;padding:20px;">No hay registros para mostrar.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  private generarTablaPorNiveles(): string {
    const n1 = this.sancionesActivas.filter(u => this.nivelUsuario(u) === 1);
    const n2 = this.sancionesActivas.filter(u => this.nivelUsuario(u) === 2);
    const n3 = this.sancionesActivas.filter(u => this.nivelUsuario(u) === 3);

    const generadorTabla = (lista: UsuarioAdmin[], titulo: string) => {
      if (lista.length === 0) return '';
      return `
        <h2 class="section-title">${titulo} (${lista.length})</h2>
        <table>
          <thead>
            <tr>
              <th width="15%">DNI</th>
              <th width="40%">Nombre Completo</th>
              <th width="45%">Motivo</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(u => `
              <tr>
                <td class="font-mono">${esc(u.dni)}</td>
                <td>${esc(this.formatNombre(u.nombres, u.apellidos))}</td>
                <td>${esc(this.motivoCastigo(u))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    };

    let html = generadorTabla(n1, 'Nivel 1: Aviso');
    html += generadorTabla(n2, 'Nivel 2: Bloqueo Temporal');
    html += generadorTabla(n3, 'Nivel 3: Bloqueo Permanente');

    if (this.sancionesActivas.length === 0) {
      html = '<p>No hay ciudadanos sancionados en los filtros actuales.</p>';
    }

    return html;
  }

  private generarExpedienteUsuario(): string {
    const u = this.ciudadanoReporte;
    if (!u) {
      return '<p>Debe seleccionar un ciudadano en el directorio para generar su expediente individual.</p>';
    }

    const nivel = this.nivelUsuario(u);
    const c = this.castigosPorUsuario[u.id];

    const h = this.historial.filter(entry => entry.userId === u.id);

    const tablaHistorial = h.map(entry => `
      <tr>
        <td>${fechaHoraIso(entry.recordedAt)}</td>
        <td>${pildora(entry.action)}</td>
        <td>Nivel ${entry.previousLevel} &rarr; Nivel ${entry.newLevel}</td>
        <td>${esc(entry.reason || '—')}</td>
      </tr>
    `).join('');

    return `
      <div class="panel">
        <h2 class="section-title">Datos del Ciudadano</h2>
        <table class="ficha" style="margin-bottom:0;">
          <tr><td width="20%"><strong>DNI:</strong></td><td class="font-mono">${esc(u.dni)}</td></tr>
          <tr><td><strong>Nombre:</strong></td><td>${esc(this.formatNombre(u.nombres, u.apellidos))}</td></tr>
          <tr><td><strong>Teléfono:</strong></td><td>${esc(u.telefono || '—')}</td></tr>
          <tr><td><strong>Email:</strong></td><td>${esc(u.email || '—')}</td></tr>
          <tr><td><strong>Estado Cuenta:</strong></td><td>${pildora(u.estado)}</td></tr>
        </table>
      </div>

      <div class="panel">
        <h2 class="section-title">Estado de Sanción Actual</h2>
        <table class="ficha" style="margin-bottom:0;">
          <tr><td width="20%"><strong>Nivel Actual:</strong></td><td>${pildora(etiquetaNivelCastigo(nivel))}</td></tr>
          <tr><td><strong>Advertencias:</strong></td><td>${c?.advertenciasAcumuladas ?? 0}</td></tr>
          <tr><td><strong>Acceso App:</strong></td><td>${pildora(this.accesoPermitido(u) ? 'Permitido' : 'Bloqueado')}</td></tr>
          ${nivel === 2 ? `<tr><td><strong>Bloqueado hasta:</strong></td><td>${this.fechaFin(u)}</td></tr>` : ''}
          <tr><td><strong>Último Motivo:</strong></td><td>${esc(c?.motivoUltimoCastigo || '—')}</td></tr>
        </table>
      </div>

      <h2 class="section-title">Historial Disciplinario (${h.length})</h2>
      <table>
        <thead>
          <tr>
            <th width="20%">Fecha</th>
            <th width="15%">Acción</th>
            <th width="25%">Transición</th>
            <th width="40%">Motivo</th>
          </tr>
        </thead>
        <tbody>
          ${tablaHistorial.length > 0 ? tablaHistorial : '<tr><td colspan="4" style="text-align:center;">Sin historial disciplinario.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  private generarTablaAuditoria(): string {
    const filas = this.historial.map(h => `
      <tr>
        <td>${fechaHoraIso(h.recordedAt)}</td>
        <td>
          <div><strong>${esc(h.fullName || 'Desconocido')}</strong></div>
          <div class="font-mono" style="font-size:8pt;color:var(--c-ink-light);">${esc(h.dni)}</div>
        </td>
        <td>${pildora(h.action)}</td>
        <td>N${h.previousLevel} &rarr; N${h.newLevel}</td>
        <td>${esc(h.reason || '—')}</td>
      </tr>
    `).join('');

    const porAccion = distribucion(this.historial.map(h => [h.action]), 0).slice(0, 3);
    return tarjetas([['Acciones registradas', this.historial.length, ''], ...porAccion.map(([a, n]) => [a, n, a] as [string, number, string])]) + `
      <table>
        <thead>
          <tr>
            <th width="15%">Fecha</th>
            <th width="25%">Ciudadano</th>
            <th width="12%">Acción</th>
            <th width="15%">Cambio</th>
            <th width="33%">Motivo</th>
          </tr>
        </thead>
        <tbody>
          ${filas.length > 0 ? filas : '<tr><td colspan="5" style="text-align:center;padding:20px;">No hay registros de auditoría en este filtro.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  private generarResumenEjecutivo(): string {
    const total = this.sancionesActivas.length;
    const n1 = this.sancionesActivas.filter(u => this.nivelUsuario(u) === 1).length;
    const n2 = this.sancionesActivas.filter(u => this.nivelUsuario(u) === 2).length;
    const n3 = this.sancionesActivas.filter(u => this.nivelUsuario(u) === 3).length;

    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    let aplicadas30d = 0;
    let levantadas30d = 0;

    this.historial.forEach(h => {
      const fecha = new Date(h.recordedAt);
      if (fecha >= hace30Dias) {
        if (h.action === 'APLICAR') aplicadas30d++;
        if (h.action === 'LEVANTAR') levantadas30d++;
      }
    });

    return `
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-val">${total}</div>
          <div class="summary-lbl">Sanciones Activas</div>
        </div>
        <div class="summary-card" style="--card:${RGB(tonoEstado('Bloqueado').texto)}">
          <div class="summary-val">${aplicadas30d}</div>
          <div class="summary-lbl">Aplicadas (últimos 30d)</div>
        </div>
        <div class="summary-card" style="--card:${RGB(tonoEstado('Levantado').texto)}">
          <div class="summary-val">${levantadas30d}</div>
          <div class="summary-lbl">Levantadas (últimos 30d)</div>
        </div>
      </div>

      <h2 class="section-title">Distribución por Nivel de Gravedad</h2>
      <div style="display:flex; height:30px; margin-bottom:10px; border-radius:4px; overflow:hidden;">
        ${n1 > 0 ? `<div style="background:#fde68a; width:${(n1 / total) * 100}%;" title="Nivel 1"></div>` : ''}
        ${n2 > 0 ? `<div style="background:#fca5a5; width:${(n2 / total) * 100}%;" title="Nivel 2"></div>` : ''}
        ${n3 > 0 ? `<div style="background:#991b1b; width:${(n3 / total) * 100}%;" title="Nivel 3"></div>` : ''}
      </div>
      <table style="width:50%;">
        <tr>
          <td><span style="display:inline-block;width:10px;height:10px;background:#fde68a;margin-right:8px;"></span>Nivel 1 (Aviso)</td>
          <td class="text-right"><strong>${n1}</strong></td>
          <td class="text-right">${total > 0 ? Math.round((n1 / total) * 100) : 0}%</td>
        </tr>
        <tr>
          <td><span style="display:inline-block;width:10px;height:10px;background:#fca5a5;margin-right:8px;"></span>Nivel 2 (Bloqueo Temporal)</td>
          <td class="text-right"><strong>${n2}</strong></td>
          <td class="text-right">${total > 0 ? Math.round((n2 / total) * 100) : 0}%</td>
        </tr>
        <tr>
          <td><span style="display:inline-block;width:10px;height:10px;background:#991b1b;margin-right:8px;"></span>Nivel 3 (Bloqueo Permanente)</td>
          <td class="text-right"><strong>${n3}</strong></td>
          <td class="text-right">${total > 0 ? Math.round((n3 / total) * 100) : 0}%</td>
        </tr>
      </table>

      <p style="margin-top:30px;font-size:9pt;color:var(--c-ink-light);">* Métrica basada en los registros actualmente mostrados en el sistema, afectada por los filtros activos si los hubiere.</p>
    `;
  }
}
