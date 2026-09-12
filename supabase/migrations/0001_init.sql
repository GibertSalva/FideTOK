-- FideTOK: esquema inicial.
-- Todo el acceso pasa por el servidor de Next.js con la service role: RLS activado sin
-- politicas = nadie mas puede leer ni escribir (los datos KYC son datos personales).

create type rol as enum ('inversor', 'originador');
create type kyc_status as enum ('pendiente', 'aprobado', 'rechazado');
create type solicitud_status as enum ('pendiente_auditoria', 'aprobada', 'emitida', 'rechazada');
create type asset_type as enum ('inmueble', 'rural', 'creditos', 'otro');

create table profiles (
  wallet text primary key,
  rol rol not null,
  created_at timestamptz not null default now()
);

-- Flujo 2: KYC. El commitment sha256(dni|cuit|nonce) es lo unico que va on-chain.
create table kyc (
  wallet text primary key references profiles (wallet) on delete cascade,
  nombre text not null,
  apellido text not null,
  dni text not null,
  cuit text not null,
  nacionalidad text not null,
  residente_ar boolean not null,
  origen_fondos text not null,
  dni_frente_path text,
  dni_dorso_path text,
  selfie_path text,
  risk_flags jsonb not null default '[]'::jsonb,
  status kyc_status not null default 'pendiente',
  commitment text,
  nonce text,
  whitelist_tx text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Flujo 1: solicitudes de tokenizacion del originador.
create table solicitudes (
  id uuid primary key default gen_random_uuid(),
  originador_wallet text not null references profiles (wallet),
  asset_type asset_type not null,
  nombre text not null,
  simbolo text not null,
  descripcion text,
  detalle_activo jsonb not null default '{}'::jsonb,
  valuacion_usd bigint not null,
  cuit_fideicomiso text not null,
  registro text not null default '',
  precio_usdc numeric(20, 6) not null,
  cantidad bigint not null,
  contrato_path text not null,
  contrato_sha256 text not null,
  status solicitud_status not null default 'pendiente_auditoria',
  mint text unique,
  emision_tx text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Historial del valor cuotaparte publicado por el fiduciario.
create table navs (
  id bigserial primary key,
  mint text not null,
  nav_usdc numeric(20, 6) not null,
  tx text not null,
  created_at timestamptz not null default now()
);

-- Flujo 5: distribuciones y pagos (base del reporte fiscal para AFIP).
create table distribuciones (
  id uuid primary key default gen_random_uuid(),
  mint text not null,
  indice int not null,
  distribution_address text not null unique,
  total_usdc numeric(20, 6) not null,
  ars_por_usd numeric(20, 4) not null,
  fx_source text not null,
  fx_timestamp timestamptz not null,
  start_tx text,
  close_tx text,
  created_at timestamptz not null default now(),
  unique (mint, indice)
);

create table pagos (
  id bigserial primary key,
  distribucion_id uuid not null references distribuciones (id) on delete cascade,
  wallet text not null,
  tokens bigint not null,
  porcentaje numeric(9, 6) not null,
  usdc numeric(20, 6) not null,
  ars numeric(20, 2) not null,
  tx text not null,
  created_at timestamptz not null default now(),
  unique (distribucion_id, wallet)
);

alter table profiles enable row level security;
alter table kyc enable row level security;
alter table solicitudes enable row level security;
alter table navs enable row level security;
alter table distribuciones enable row level security;
alter table pagos enable row level security;

-- Buckets privados: contratos firmados y documentacion KYC (solo URLs firmadas del servidor).
insert into storage.buckets (id, name, public)
values ('contratos', 'contratos', false), ('kyc', 'kyc', false)
on conflict (id) do nothing;
