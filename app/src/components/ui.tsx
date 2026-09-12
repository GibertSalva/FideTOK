import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- tipografia */

const displaySizes = {
  xs: "text-[22px] leading-[1.1] tracking-[-0.02em]",
  sm: "text-[26px] leading-[1.08] tracking-[-0.02em]",
  md: "text-[clamp(26px,3.4vw,44px)] leading-[1.02] tracking-[-0.03em]",
  lg: "text-[clamp(30px,4.4vw,52px)] leading-[0.98] tracking-[-0.035em]",
  xl: "text-[clamp(34px,5vw,64px)] leading-[0.98] tracking-[-0.035em]",
  hero: "text-[clamp(38px,6.4vw,80px)] leading-[0.95] tracking-[-0.04em]",
} as const;

/** Cifras: van en la mono a peso medio, no en el Archivo Black de los titulos. */
const numSizes = "text-[clamp(24px,2.4vw,38px)] leading-[1.1] tracking-[-0.01em]";

/** Titular Archivo Black. */
export function Display({
  size = "lg",
  as: Tag = "h2",
  className,
  children,
}: {
  size?: keyof typeof displaySizes;
  as?: "h1" | "h2" | "h3" | "div";
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={cn("font-display", displaySizes[size], className)}>{children}</Tag>;
}

/** Volanta: etiqueta chica y espaciada para cada dato del tablero. */
export function Kicker({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("text-[11px] uppercase leading-none tracking-[0.1em] text-mute", className)}>{children}</div>
  );
}

/* ------------------------------------------------------------------ botones */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-acid text-ink hover:brightness-110 disabled:bg-acid/30 disabled:text-ink/50",
  secondary: "bg-surface-2 text-bone hover:bg-surface-3 disabled:opacity-50",
  ghost: "text-mute hover:bg-surface-2 hover:text-bone disabled:opacity-50",
  danger: "bg-down/15 text-down hover:bg-down/25 disabled:opacity-50",
};

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-pill px-5 text-[12px] font-semibold uppercase tracking-[0.14em] transition-all disabled:cursor-not-allowed disabled:shadow-none",
        buttonVariants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- superficies */

/** Tarjeta: superficie elevada, sin filete. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-card bg-surface p-6 shadow-card", className)}>{children}</div>;
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneFill: Record<Tone, string> = {
  neutral: "bg-surface-2 text-mute",
  success: "bg-up/12 text-up",
  warning: "bg-acid/12 text-acid",
  danger: "bg-down/12 text-down",
  info: "bg-surface-2 text-bone",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[10.5px] uppercase tracking-[0.14em]",
        toneFill[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className={cn("rounded-card px-4 py-3 text-sm", toneFill[tone])}>{children}</div>
  );
}

/* ------------------------------------------------------------------ formulario */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col justify-end">
      <span className="text-[11.5px] uppercase tracking-[0.08em] text-mute">{label}</span>
      <span className="mt-2 flex flex-col">{children}</span>
      {hint && <span className="mt-2 text-[11.5px] leading-relaxed text-dim">{hint}</span>}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-pill bg-field px-4 text-[15px] text-bone outline-none ring-1 ring-line transition-all placeholder:text-dim focus:ring-2 focus:ring-acid/60";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, "appearance-none pr-8", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "h-auto min-h-24 rounded-card py-3 leading-relaxed", props.className)} />;
}

/** Casilla redondeada. */
export function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 py-1 text-left"
      aria-pressed={checked}
    >
      <span
        className={cn(
          "grid size-5 flex-[0_0_20px] place-items-center rounded-md text-[12px] transition-colors",
          checked ? "bg-acid text-ink" : "bg-field text-transparent ring-1 ring-line",
        )}
      >
        ✓
      </span>
      <span className="text-[12.5px] leading-relaxed tracking-[0.02em] text-bone">{children}</span>
    </button>
  );
}

/* --------------------------------------------------------------------- datos */

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Kicker>{label}</Kicker>
      <span className="text-[26px] font-medium leading-none tabular-nums">{value}</span>
      {sub && <span className="text-[11.5px] tracking-[0.1em] text-mute">{sub}</span>}
    </div>
  );
}

/** Celda de tablero: la cifra manda, sin cajas alrededor. */
export function StatCell({
  label,
  value,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "acid" | "up" | "down";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-6 py-5", className)}>
      <Kicker>{label}</Kicker>
      <div
        className={cn(
          "mt-2.5 font-medium tabular-nums",
          numSizes,
          tone === "acid" && "text-acid",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** Fila clave/valor. Divisor apenas insinuado, no filete. */
export function DataRow({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-3 last:border-b-0">
      <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-mute">{k}</span>
      <span className="min-w-0 break-words text-right text-sm font-semibold">{v}</span>
    </div>
  );
}

/** Variacion contra el precio de emision. */
export function Delta({ value, className }: { value: number; className?: string }) {
  const up = value >= 0;
  return (
    <span className={cn("tabular-nums", up ? "text-up" : "text-down", className)}>
      {up ? "▲" : "▼"} ${Math.abs(value).toFixed(2).replace(".", ",")}
    </span>
  );
}

/** Barra de suscripcion redondeada. */
export function Meter({ pct, className }: { pct: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={cn("h-2 overflow-hidden rounded-full bg-surface-3", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-acid" style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** Histograma del valor cuotaparte. La ultima barra va en el acento. */
export function Bars({ series, className }: { series: number[]; className?: string }) {
  if (series.length === 0) return null;
  const low = Math.min(...series);
  const high = Math.max(...series);
  const span = high - low || 1;
  return (
    <div className={cn("flex h-[96px] items-end gap-1.5", className)}>
      {series.map((value, i) => (
        <div key={i} className="flex h-full flex-1 flex-col justify-end">
          <div
            className={cn("rounded-t-sm", i === series.length - 1 ? "bg-acid" : "bg-surface-3")}
            style={{ height: `${18 + (82 * (value - low)) / span}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ cabeceras */

export function PageHeader({
  title,
  subtitle,
  action,
  kicker,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  kicker?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 pb-6 pt-8">
      <div className="min-w-0">
        {kicker && <Kicker className="mb-3">{kicker}</Kicker>}
        <Display size="lg" as="h1">
          {title}
        </Display>
        {subtitle && (
          <p className="mt-3 max-w-2xl text-[12.5px] leading-relaxed tracking-[0.02em] text-mute">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function LegalTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-pill bg-surface-2 px-2.5 py-1 text-[10.5px] uppercase tracking-[0.14em] text-mute">
      {children}
    </span>
  );
}

/** Franja de pagina con el padding estandar. */
export function Section({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("py-6", className)}>{children}</div>;
}
