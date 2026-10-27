import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { UbigeoMapa, UbigeoService } from '../../services/ubigeo.service';

/**
 * Departamento → provincia → distrito (UBIGEO INEI). Emite el código de 6 dígitos, o '' si falta elegir.
 * `prefijo` fija los niveles de la jurisdicción de la municipalidad (4 dígitos = provincia, 6 = distrito).
 */
@Component({
  selector: 'app-ubigeo-select',
  standalone: true,
  template: `
    <div class="ubigeo-grid">
      @for (n of niveles(); track n.etiqueta) {
        <label class="ubigeo-nivel">
          <span>{{ n.etiqueta }}</span>
          <select [class]="selectClass()" [value]="n.valor" [disabled]="disabled() || n.fijo || !n.opciones.length"
                  (change)="elegir(n.largo, $any($event.target).value)" [attr.aria-invalid]="invalid()">
            <option value="">{{ n.opciones.length ? 'Seleccionar' : '—' }}</option>
            @for (o of n.opciones; track o.codigo) {
              <option [value]="o.codigo" [selected]="o.codigo === n.valor">{{ o.nombre }}</option>
            }
          </select>
        </label>
      }
    </div>
  `,
  styles: [`
    .ubigeo-grid { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); }
    .ubigeo-nivel { display: flex; flex-direction: column; gap: .25rem; font-size: .8rem; font-weight: 600; }
  `]
})
export class UbigeoSelect {
  readonly value = input<string | null | undefined>('');
  readonly prefijo = input<string>('');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly selectClass = input('');
  readonly valueChange = output<string>();

  private readonly mapa = toSignal(inject(UbigeoService).mapa$, { initialValue: {} as UbigeoMapa });
  /** Código elegido hasta ahora (2, 4 o 6 dígitos). */
  private readonly actual = signal('');

  constructor() {
    effect(() => {
      const pre = this.prefijo();
      const v = this.value() ?? '';
      const cur = untracked(this.actual);
      if (v && v.startsWith(pre)) this.actual.set(v);
      // '' con un distrito ya elegido = el padre limpió el form; si no, es una elección a medias y se conserva.
      else if (cur.length === 6 || !cur.startsWith(pre) || cur.length < pre.length) this.actual.set(pre);
      // Municipalidad distrital: el distrito ya está decidido. Fuera de jurisdicción: se descarta.
      if (pre.length === 6 && v !== pre) queueMicrotask(() => this.valueChange.emit(pre));
      else if (v && !v.startsWith(pre)) queueMicrotask(() => this.valueChange.emit(''));
    });
  }

  readonly niveles = computed(() => {
    const mapa = this.mapa(), actual = this.actual(), pre = this.prefijo();
    return ([['Departamento', 2], ['Provincia', 4], ['Distrito', 6]] as const).map(([etiqueta, largo]) => {
      const padre = actual.slice(0, largo - 2);
      return {
        etiqueta,
        largo,
        valor: actual.length >= largo ? actual.slice(0, largo) : '',
        fijo: pre.length >= largo,
        opciones: padre.length === largo - 2 ? UbigeoService.hijos(mapa, padre) : []
      };
    });
  });

  elegir(largo: number, codigo: string): void {
    this.actual.set(codigo || this.actual().slice(0, largo - 2));
    this.valueChange.emit(codigo.length === 6 ? codigo : '');
  }
}
