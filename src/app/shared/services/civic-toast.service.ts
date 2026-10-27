import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type CivicToastTipo = 'success' | 'error' | 'info';

export interface CivicToast {
  id: number;
  mensaje: string;
  tipo: CivicToastTipo;
}

@Injectable({ providedIn: 'root' })
export class CivicToastService {

  private counter = 0;
  private readonly subject = new BehaviorSubject<CivicToast | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly toast$ = this.subject.asObservable();

  success(mensaje: string): void {
    this.show(mensaje, 'success');
  }

  error(mensaje: string): void {
    this.show(mensaje, 'error');
  }

  info(mensaje: string): void {
    this.show(mensaje, 'info');
  }

  dismiss(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.subject.next(null);
  }

  private show(mensaje: string, tipo: CivicToastTipo): void {
    if (this.timer) clearTimeout(this.timer);
    const id = ++this.counter;
    this.subject.next({ id, mensaje, tipo });
    this.timer = setTimeout(() => this.dismiss(), 4000);
  }
}
