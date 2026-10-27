import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { CivicToastService } from '../../services/civic-toast.service';

@Component({
  selector: 'app-civic-toast-host',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    @if (toast$ | async; as toast) {
      <div class="civic-toast"
           [class.civic-toast--success]="toast.tipo === 'success'"
           [class.civic-toast--error]="toast.tipo === 'error'"
           [class.civic-toast--info]="toast.tipo === 'info'"
           role="status"
           aria-live="polite">
        @if (toast.tipo === 'success') {
          <svg class="civic-toast__icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
          </svg>
        } @else if (toast.tipo === 'error') {
          <svg class="civic-toast__icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/>
          </svg>
        } @else {
          <svg class="civic-toast__icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/>
          </svg>
        }
        <span>{{ toast.mensaje }}</span>
        <button type="button" class="civic-toast__close" (click)="dismiss()" aria-label="Cerrar aviso">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    }
  `
})
export class CivicToastHost {

  private readonly toastService = inject(CivicToastService);
  readonly toast$ = this.toastService.toast$;

  dismiss(): void {
    this.toastService.dismiss();
  }
}
