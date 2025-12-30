-- Rename the canonical curated NT2-2000 list to the new display name.
-- This keeps the slug stable (nt2-2000) but updates what the UI shows.

update word_lists
set name = 'VanDale 2k'
where language_code = 'nl'
  and slug = 'nt2-2000'
  and name in (
    'NT2 – 2000 woorden',
    'NT2 - 2000 woorden',
    'NT2 – 2000 WOORDEN',
    'NT2 - 2000 WOORDEN',
    'NT2 – 2000 words',
    'NT2 - 2000 words'
  );

