-- Plant Care Assistant — Supabase schema v0.1 (run in the SQL editor)
-- One user; the browser reads and writes through RLS with the anon key,
-- the Vercel functions use the service-role key and bypass RLS.

create extension if not exists pgcrypto;

create type site_t         as enum ('backyard', 'farm');
create type plant_source_t as enum ('nursery', 'seed', 'cutting', 'graft', 'existing');
create type photo_kind_t   as enum ('identify', 'journal', 'problem');
create type task_type_t    as enum ('water', 'prune', 'feed', 'mulch', 'harvest', 'scout', 'propagate', 'protect');
create type task_status_t  as enum ('pending', 'done', 'skipped', 'snoozed');

-- Species profile: written by the profile call, reviewed by the user, shared by every plant of the species.
create table species (
  id                 uuid primary key default gen_random_uuid(),
  scientific_name    text not null,
  cultivar           text not null default '',
  common_names       jsonb not null,            -- {en, fr, ar, ar_latin}
  plant_type         text not null,
  lifecycle          text not null,
  foliage            text not null,
  layer              text not null,
  site_fit           jsonb not null,            -- {rating, note}
  water              jsonb not null,            -- {need, drought_tolerance, stress_signs, overwatering_signs, summary}
  sun                jsonb not null,            -- {exposure, heat_tolerance, summer_shade_needed, note}
  salinity_tolerance jsonb not null,            -- {level, note}
  climate_note       text not null default '',
  care_calendar      jsonb not null default '[]'::jsonb,  -- [{type, months[], every_days, litres, age, lead_days, title, instruction}]
  pests              jsonb not null default '[]'::jsonb,  -- [{name_en, name_fr, months[], symptoms, organic_treatment, prevention}]
  companions         jsonb not null,            -- {good[], bad[], root_warnings[]}
  uses               jsonb not null,            -- {edible_parts, preparation, storage, harvest_cues}
  toxicity           jsonb not null,            -- {humans, chickens, goats, dogs_cats, note}
  generated_by       text,
  generated_at       timestamptz,
  confirmed          boolean not null default false,
  user_edits         jsonb not null default '{}'::jsonb,  -- {field: value} kept on regeneration
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index species_name_uidx on species (lower(scientific_name), lower(cultivar));

-- One row per individual plant or per group ("artichokes bed 2 x12").
create table plants (
  id          uuid primary key default gen_random_uuid(),
  species_id  uuid not null references species(id),
  tag         text not null,
  quantity    integer not null default 1,
  site        site_t not null,
  zone        text not null default '',
  lat         double precision,
  lng         double precision,
  planted_on  date,
  source      plant_source_t not null default 'existing',
  rootstock   text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index plants_site_idx on plants (site, zone);
create index plants_species_idx on plants (species_id);

-- Photos live in the private Storage bucket "photos" at {plant_id}/{timestamp}.jpg.
create table photos (
  id           uuid primary key default gen_random_uuid(),
  plant_id     uuid not null references plants(id) on delete cascade,
  taken_at     timestamptz not null default now(),
  storage_path text not null,
  kind         photo_kind_t not null,
  ai_result    jsonb,                             -- candidates JSON (identify) or diagnosis JSON (problem)
  note         text not null default ''
);
create index photos_plant_idx on photos (plant_id, taken_at desc);

-- Tasks are expanded by /api/daily from species.care_calendar. The app writes two kinds of row itself
-- (Phase 4): the re-photograph reminder of a diagnosis (rule_key 'diagnosis:<photo_id>') and each
-- treatment logged ('diagnosis:<photo_id>:treated'); the expansion never removes those.
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  plant_id    uuid not null references plants(id) on delete cascade,
  type        task_type_t not null,
  rule_key    text not null,                      -- "${type}:${months}:${age}"
  due_on      date not null,
  window_end  date,
  title       text not null,
  instruction text not null default '',
  status      task_status_t not null default 'pending',
  acted_at    timestamptz,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  unique (plant_id, rule_key, due_on)
);
create index tasks_due_idx on tasks (status, due_on);

-- Web Push subscriptions (one per browser/device).
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,
  keys       jsonb not null,                      -- {p256dh, auth}
  created_at timestamptz not null default now()
);

-- App settings as key/value rows (Phase 5). 'zones' holds {"backyard": [...], "farm": [...]}: the
-- zone lists the record form offers first. The browser reads and writes it under RLS like the rest.
create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- updated_at maintenance
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger species_updated before update on species for each row execute function set_updated_at();
create trigger plants_updated  before update on plants  for each row execute function set_updated_at();
create trigger settings_updated before update on settings for each row execute function set_updated_at();

-- Journal: photos, task actions and diagnoses in one dated stream per plant.
create view journal as
  select plant_id, taken_at as at, 'photo'::text as kind, kind::text as subtype, note as text, storage_path as ref
    from photos
  union all
  select plant_id, acted_at as at, 'task', type::text, coalesce(nullif(note, ''), title), status::text
    from tasks where acted_at is not null;

-- Row level security: the single authenticated user owns everything.
alter table species            enable row level security;
alter table plants             enable row level security;
alter table photos             enable row level security;
alter table tasks              enable row level security;
alter table push_subscriptions enable row level security;
alter table settings           enable row level security;

create policy owner_all on species            for all to authenticated using (true) with check (true);
create policy owner_all on plants             for all to authenticated using (true) with check (true);
create policy owner_all on photos             for all to authenticated using (true) with check (true);
create policy owner_all on tasks              for all to authenticated using (true) with check (true);
create policy owner_all on push_subscriptions for all to authenticated using (true) with check (true);
create policy owner_all on settings           for all to authenticated using (true) with check (true);

-- Storage: the private bucket "photos" and the policy that lets the signed-in user upload,
-- read through signed URLs and delete in it. Both are safe to re-run, and the policy never
-- aborts the script: if the editor may not write storage policies, a notice says to add the
-- same policy from Storage -> Policies (bucket_id = 'photos', all operations).
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;
do $$ begin
  create policy "owner photos" on storage.objects for all to authenticated
    using (bucket_id = 'photos') with check (bucket_id = 'photos');
exception
  when duplicate_object then null;
  when insufficient_privilege then raise notice 'Add the "owner photos" policy from Storage -> Policies';
end $$;
