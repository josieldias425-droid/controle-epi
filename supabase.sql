-- Este arquivo é uma cópia da estrutura usada pelo aplicativo.
create extension if not exists pgcrypto;

create table if not exists public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  matricula text,
  funcao text,
  empresa text,
  setor text,
  data_admissao date,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.epis (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  ca text,
  unidade text default 'UN',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.entregas (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete restrict,
  encarregado_id uuid references public.profiles(id) on delete set null,
  data_entrega date not null default current_date,
  observacao text,
  assinatura text,
  created_at timestamptz not null default now()
);

create table if not exists public.entrega_itens (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.entregas(id) on delete cascade,
  epi_id uuid not null references public.epis(id) on delete restrict,
  quantidade integer not null default 1,
  tamanho text,
  ca text,
  data_recebimento date,
  data_devolucao date,
  observacao text,
  created_at timestamptz not null default now()
);

create index if not exists idx_funcionarios_nome on public.funcionarios(nome);
create index if not exists idx_funcionarios_matricula on public.funcionarios(matricula);
create index if not exists idx_entregas_funcionario on public.entregas(funcionario_id);
create index if not exists idx_entrega_itens_entrega on public.entrega_itens(entrega_id);

alter table public.funcionarios enable row level security;
alter table public.epis enable row level security;
alter table public.entregas enable row level security;
alter table public.entrega_itens enable row level security;

-- Políticas simples para usuários autenticados.
drop policy if exists funcionarios_select_authenticated on public.funcionarios;
create policy funcionarios_select_authenticated on public.funcionarios for select to authenticated using (true);
drop policy if exists funcionarios_insert_authenticated on public.funcionarios;
create policy funcionarios_insert_authenticated on public.funcionarios for insert to authenticated with check (true);
drop policy if exists funcionarios_update_authenticated on public.funcionarios;
create policy funcionarios_update_authenticated on public.funcionarios for update to authenticated using (true) with check (true);

drop policy if exists epis_select_authenticated on public.epis;
create policy epis_select_authenticated on public.epis for select to authenticated using (true);
drop policy if exists epis_insert_authenticated on public.epis;
create policy epis_insert_authenticated on public.epis for insert to authenticated with check (true);
drop policy if exists epis_update_authenticated on public.epis;
create policy epis_update_authenticated on public.epis for update to authenticated using (true) with check (true);

drop policy if exists entregas_select_authenticated on public.entregas;
create policy entregas_select_authenticated on public.entregas for select to authenticated using (true);
drop policy if exists entregas_insert_authenticated on public.entregas;
create policy entregas_insert_authenticated on public.entregas for insert to authenticated with check (true);
drop policy if exists entregas_update_authenticated on public.entregas;
create policy entregas_update_authenticated on public.entregas for update to authenticated using (true) with check (true);

drop policy if exists entrega_itens_select_authenticated on public.entrega_itens;
create policy entrega_itens_select_authenticated on public.entrega_itens for select to authenticated using (true);
drop policy if exists entrega_itens_insert_authenticated on public.entrega_itens;
create policy entrega_itens_insert_authenticated on public.entrega_itens for insert to authenticated with check (true);
drop policy if exists entrega_itens_update_authenticated on public.entrega_itens;
create policy entrega_itens_update_authenticated on public.entrega_itens for update to authenticated using (true) with check (true);
