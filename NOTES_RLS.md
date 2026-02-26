# RLS tasks (verification + fix)

Utiliser le SQL Editor Supabase pour vérifier les policies existantes:

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'tasks'
order by policyname;
```

Configuration minimale recommandée pour autoriser `UPDATE` uniquement sur ses propres tâches:

```sql
alter table public.tasks enable row level security;

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own"
on public.tasks
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

Si la lecture ne fonctionne pas pour le widget, ajouter aussi:

```sql
drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own"
on public.tasks
for select
to authenticated
using (auth.uid() = user_id);
```
