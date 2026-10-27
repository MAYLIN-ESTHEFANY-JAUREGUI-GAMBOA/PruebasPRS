import { Component, Input } from '@angular/core';

import { etiquetaNivelCastigo } from '../../../core/models/usuario.model';

export type SancionChipSize = 'sm' | 'md';

@Component({
  selector: 'app-sancion-chip',
  standalone: true,
  templateUrl: './sancion-chip.html',
  styleUrl: './sancion-chip.css'
})
export class SancionChip {
  @Input({ required: true }) nivel = 0;
  @Input() etiqueta?: string | null;
  @Input() size: SancionChipSize = 'md';

  get nivelNorm(): number {
    const n = Number(this.nivel);
    if (Number.isNaN(n)) return 0;
    return Math.min(Math.max(n, 0), 3);
  }

  get texto(): string {
    const custom = this.etiqueta?.trim();
    return custom || etiquetaNivelCastigo(this.nivelNorm);
  }
}
