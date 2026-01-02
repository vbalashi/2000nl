-- Add a curated list containing ALL VanDale dictionary entries (full dictionary)
-- This list should appear above VanDale 2k in the UI (sorted by sort_order or name)

-- 1) Add sort_order column to word_lists if not exists (for controlling display order)
alter table if exists word_lists
    add column if not exists sort_order int default 100;

-- 2) Insert the VanDale (full) list if it doesn't exist
insert into word_lists (language_code, slug, name, description, is_primary, sort_order)
values (
    'nl',
    'vandale-all',
    'VanDale',
    'Volledige VanDale woordenboek (alle woorden)',
    false,
    10  -- Lower number = appears first
)
on conflict (language_code, slug) do update
set name = 'VanDale',
    description = 'Volledige VanDale woordenboek (alle woorden)',
    sort_order = 10;

-- 3) Update sort_order for existing VanDale 2k list so it appears after VanDale (full)
update word_lists
set sort_order = 20
where slug = 'nt2-2000'
  and language_code = 'nl';

-- 4) Populate word_list_items with all NL word entries for the VanDale (full) list
-- Use a DO block to get the list_id first
do $$
declare
    v_list_id uuid;
    v_inserted int;
begin
    -- Get the list ID
    select id into v_list_id
    from word_lists
    where slug = 'vandale-all' and language_code = 'nl';
    
    if v_list_id is null then
        raise notice 'VanDale (full) list not found, skipping population';
        return;
    end if;
    
    -- Insert all NL word entries that aren't already in the list
    -- Use headword alphabetical order for rank (if rank is used)
    insert into word_list_items (list_id, word_id, rank)
    select 
        v_list_id,
        w.id,
        row_number() over (order by w.headword asc)
    from word_entries w
    where w.language_code = 'nl'
    on conflict (list_id, word_id) do nothing;
    
    get diagnostics v_inserted = row_count;
    raise notice 'Inserted % words into VanDale (full) list', v_inserted;
end $$;

comment on column word_lists.sort_order is 'Display order in UI (lower = higher priority). VanDale=10, VanDale 2k=20.';
