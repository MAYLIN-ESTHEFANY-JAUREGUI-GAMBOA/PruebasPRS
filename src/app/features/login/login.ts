import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

type LoginMode = 'dni' | 'entidad' | 'municipalidad';
type CampoLogin = 'dni' | 'ruc' | 'password';

const REGEX_DNI = /^\d{8}$/;
const REGEX_RUC = /^[12]\d{10}$/;
const MIN_PASSWORD = 4;
const MAX_PASSWORD = 128;
const LONGITUD_DOC: Record<LoginMode, number> = { dni: 8, entidad: 11, municipalidad: 11 };

const HORA_LIMA = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

/**
 * Líneas nacionales de emergencia, en el orden de la ilustración del panel
 * (enfermera, bombero, policía, sereno). `img` es cada figura recortada sobre el mismo lienzo;
 * `alto` es su estatura relativa (todas comparten escala), `centro` el eje de su columna
 * (adonde se mueve el foco) y `color` tiñe el panel cuando está activa.
 */
const LINEAS = [
  { numero: '106', nombre: 'Salud', tarea: 'SAMU: urgencias médicas y traslados', img: 'assets/brand/login-crew-salud.webp', alto: '89.6%', centro: 9.1, color: 'oklch(0.56 0.1 175)' },
  { numero: '116', nombre: 'Bomberos', tarea: 'Incendios, rescates y materiales peligrosos', img: 'assets/brand/login-crew-bomberos.webp', alto: '97.8%', centro: 34, color: 'oklch(0.56 0.17 30)' },
  { numero: '105', nombre: 'Policía Nacional', tarea: 'Patrullaje, robos y alteraciones del orden', img: 'assets/brand/login-crew-policia.webp', alto: '96.1%', centro: 61.4, color: 'oklch(0.42 0.1 262)' },
  // shortcut: sin número de Serenazgo Cañete confirmado; reemplazar '—' cuando se tenga.
  { numero: '—', nombre: 'Serenazgo', tarea: 'Seguridad ciudadana: patrullaje municipal y vigilancia', img: 'assets/brand/login-crew-serenazgo.webp', alto: '94.2%', centro: 87.7, color: 'oklch(0.52 0.13 135)' }
] as const;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login implements OnInit {

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly modo = signal<LoginMode>('dni');
  readonly enviando = signal(false);
  readonly mostrarPassword = signal(false);
  readonly mensajeError = signal<string | null>(null);

  /** Documento del modo activo (DNI u RUC), solo dígitos. */
  readonly documento = signal('');
  readonly longitudDoc = computed(() => LONGITUD_DOC[this.modo()]);

  /** Hora local de Cañete; solo en el navegador. */
  readonly horaCanete = signal<string | null>(null);

  readonly lineas = LINEAS;
  readonly lineaActiva = signal(0);

  dni = '';
  ruc = '';
  password = '';

  private rotar = false;
  private rotacion?: ReturnType<typeof setInterval>;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.actualizarReloj();
      const intervalo = setInterval(() => this.actualizarReloj(), 30_000);
      // Rota la línea activa cada 7 s salvo con movimiento reducido.
      this.rotar = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.reiniciarRotacion();
      destroyRef.onDestroy(() => { clearInterval(intervalo); clearInterval(this.rotacion); });
    });
  }

  /** Errores por campo. Vacío = válido. */
  errores: Partial<Record<CampoLogin, string>> = {};
  /** Campos ya "tocados" (blur o submit) para no mostrar errores antes de tiempo. */
  tocados: Partial<Record<CampoLogin, boolean>> = {};

  private returnUrl = '/dashboard';

  ngOnInit(): void {
    const candidato = this.route.snapshot.queryParamMap.get('returnUrl');
    if (candidato && candidato.startsWith('/') && !candidato.startsWith('/login')) {
      this.returnUrl = candidato;
    }
  }

  seleccionarModo(modo: LoginMode): void {
    if (this.enviando()) {
      return;
    }
    this.modo.set(modo);
    this.documento.set(modo === 'dni' ? this.dni : this.ruc);
    this.mensajeError.set(null);
    // Limpiamos errores del campo no aplicable y reseteamos su estado tocado.
    this.errores = {};
    this.tocados = {};
  }

  alternarPassword(): void {
    this.mostrarPassword.update(actual => !actual);
  }

  /** Deja solo dígitos hasta la longitud del documento y sincroniza el input. */
  actualizarDocumento(input: HTMLInputElement): void {
    const limpio = input.value.replace(/\D/g, '').slice(0, LONGITUD_DOC[this.modo()]);
    if (input.value !== limpio) input.value = limpio;
    this.documento.set(limpio);
    const campo: CampoLogin = this.modo() === 'dni' ? 'dni' : 'ruc';
    if (campo === 'dni') this.dni = limpio;
    else this.ruc = limpio;
    this.validarCampo(campo);
  }

  salirDocumento(): void {
    this.validarCampo(this.modo() === 'dni' ? 'dni' : 'ruc');
  }

  /** Selección manual: reinicia el ciclo para que la línea elegida dure 7 s completos. */
  elegirLinea(i: number): void {
    this.lineaActiva.set(i);
    this.reiniciarRotacion();
  }

  private reiniciarRotacion(): void {
    clearInterval(this.rotacion);
    if (this.rotar) {
      this.rotacion = setInterval(() => this.lineaActiva.update(i => (i + 1) % LINEAS.length), 7_000);
    }
  }

  private actualizarReloj(): void {
    this.horaCanete.set(HORA_LIMA.format(new Date()));
  }

  /** Devuelve mensaje de error de un campo o '' si es válido. */
  private revisarCampo(campo: CampoLogin): string {
    switch (campo) {
      case 'dni': {
        const valor = (this.dni ?? '').trim();
        if (!valor) return 'Ingresa tu DNI.';
        if (!/^\d+$/.test(valor)) return 'El DNI solo puede contener dígitos.';
        if (valor.length !== 8) return 'El DNI debe tener exactamente 8 dígitos.';
        if (!REGEX_DNI.test(valor)) return 'DNI inválido.';
        return '';
      }
      case 'ruc': {
        const valor = (this.ruc ?? '').trim();
        if (!valor) return 'Ingresa el RUC de la entidad.';
        if (!/^\d+$/.test(valor)) return 'El RUC solo puede contener dígitos.';
        if (valor.length !== 11) return 'El RUC debe tener exactamente 11 dígitos.';
        if (!REGEX_RUC.test(valor)) return 'El RUC peruano debe iniciar con 1 o 2.';
        return '';
      }
      case 'password': {
        const valor = this.password ?? '';
        if (!valor) return 'Ingresa tu contraseña.';
        if (valor.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
        if (valor.length > MAX_PASSWORD) return `La contraseña es demasiado larga (máx ${MAX_PASSWORD}).`;
        return '';
      }
    }
  }

  validarCampo(campo: CampoLogin): void {
    this.tocados[campo] = true;
    const mensaje = this.revisarCampo(campo);
    if (mensaje) this.errores[campo] = mensaje;
    else delete this.errores[campo];
  }

  /** Solo muestra error si el campo ya fue tocado (mejor UX). */
  tieneError(campo: CampoLogin): boolean {
    return !!this.tocados[campo] && !!this.errores[campo];
  }

  /** Estado global del formulario, sin requerir "tocar" cada campo. */
  get formularioValido(): boolean {
    const camposRelevantes: CampoLogin[] =
      this.modo() === 'dni' ? ['dni', 'password'] : ['ruc', 'password'];
    return camposRelevantes.every(c => !this.revisarCampo(c));
  }

  enviar(): void {
    if (this.enviando()) {
      return;
    }

    const camposRelevantes: CampoLogin[] =
      this.modo() === 'dni' ? ['dni', 'password'] : ['ruc', 'password'];
    camposRelevantes.forEach(c => this.validarCampo(c));

    // El error ya se muestra bajo el campo; el banner queda para errores del servidor.
    const primerError = camposRelevantes.find(c => this.errores[c]);
    if (primerError) {
      this.mensajeError.set(null);
      const id = primerError === 'password' ? 'login-password' : 'login-documento';
      document.getElementById(id)?.focus();
      return;
    }

    this.mensajeError.set(null);
    this.enviando.set(true);

    // SUPER_ADMIN usa contexto APP; personal de entidad PANEL_ENTIDAD; personal municipal PANEL_MUNICIPALIDAD.
    // AuthService hace fallback automático si el contexto no coincide con el rol.
    const modo = this.modo();
    const observable = modo === 'dni'
      ? this.authService.loginConDni({
          dni: this.dni.trim(),
          password: this.password,
          context: 'APP'
        })
      : this.authService.loginConRuc({
          ruc: this.ruc.trim(),
          password: this.password
        }, modo);

    observable.subscribe({
      next: () => {
        this.enviando.set(false);
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        this.mensajeError.set(this.extraerMensajeError(err));
      }
    });
  }

  private extraerMensajeError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return 'No se pudo conectar con el servidor. Verifica que el API Gateway esté activo en :9000.';
      }

      const payload = err.error;
      if (payload && typeof payload === 'object') {
        const data = payload as Record<string, unknown>;
        if (typeof data['message'] === 'string') return data['message'];
        if (typeof data['error'] === 'string') return data['error'];
      }

      if (err.status === 401) {
        return 'Credenciales incorrectas. Revisa tus datos e intenta de nuevo.';
      }

      return `Error ${err.status}: no se pudo iniciar sesión.`;
    }

    return 'Ocurrió un error inesperado al iniciar sesión.';
  }
}
