-- Local multi-source dictionary fixtures for search/list UI development.
-- Safe to run repeatedly against local/test databases. Do not run as a production migration.

BEGIN;

INSERT INTO languages (code, name) VALUES
    ('nl', 'Nederlands'),
    ('en', 'English'),
    ('fr', 'Francais')
ON CONFLICT (code) DO UPDATE SET name = excluded.name;

INSERT INTO dictionary_schemas (schema_key, version, language_code, title, description, source_path, render_capabilities) VALUES
    ('nl-fixture-v1', 1, 'nl', 'Dutch local fixture entry schema', 'VanDale-shaped local fixture payload for multi-source UI testing.', 'packages/ingestion/nl', ARRAY['definitions','examples','morphology']::text[]),
    ('en-fixture-v1', 1, 'en', 'English local fixture entry schema', 'VanDale-shaped local fixture payload for multi-source UI testing.', 'packages/ingestion/en', ARRAY['definitions','examples','morphology']::text[]),
    ('fr-fixture-v1', 1, 'fr', 'French local fixture entry schema', 'VanDale-shaped local fixture payload for multi-source UI testing.', 'packages/ingestion/fr', ARRAY['definitions','examples','morphology']::text[])
ON CONFLICT (schema_key, version) DO UPDATE
SET language_code = excluded.language_code,
    title = excluded.title,
    description = excluded.description,
    source_path = excluded.source_path,
    render_capabilities = excluded.render_capabilities;

INSERT INTO dictionaries (language_code, slug, name, description, kind, visibility, is_editable, minimum_subscription_tier, schema_key, schema_version, source_provider, source_version) VALUES
    ('nl', 'nl-test-lexicon', 'NL Testlexicon', 'Local test fixture dictionary for multi-source UI development.', 'curated', 'system', false, 'free', 'nl-fixture-v1', 1, 'local-fixture', '2026-05-26'),
    ('en', 'en-test-core', 'EN Core Test', 'Local test fixture dictionary for multi-source UI development.', 'curated', 'system', false, 'free', 'en-fixture-v1', 1, 'local-fixture', '2026-05-26'),
    ('en', 'en-test-extra', 'EN Extra Test', 'Local test fixture dictionary for multi-source UI development.', 'curated', 'system', false, 'free', 'en-fixture-v1', 1, 'local-fixture', '2026-05-26'),
    ('fr', 'fr-test-core', 'FR Core Test', 'Local test fixture dictionary for multi-source UI development.', 'curated', 'system', false, 'free', 'fr-fixture-v1', 1, 'local-fixture', '2026-05-26'),
    ('fr', 'fr-test-extra', 'FR Extra Test', 'Local test fixture dictionary for multi-source UI development.', 'curated', 'system', false, 'free', 'fr-fixture-v1', 1, 'local-fixture', '2026-05-26')
ON CONFLICT (language_code, slug) DO UPDATE
SET name = excluded.name,
    description = excluded.description,
    kind = excluded.kind,
    visibility = excluded.visibility,
    is_editable = excluded.is_editable,
    minimum_subscription_tier = excluded.minimum_subscription_tier,
    schema_key = excluded.schema_key,
    schema_version = excluded.schema_version,
    source_provider = excluded.source_provider,
    source_version = excluded.source_version,
    updated_at = now();

WITH fixture_entries (language_code, dictionary_slug, headword, meaning_id, part_of_speech, gender, metadata_index, raw_payload) AS (
  VALUES
    ('nl', 'nl-test-lexicon', 'bank', 1, 'zn', 'de', 91001, '{"headword":"bank","pronunciation":"bank","pronunciation_with_stress":"bank","gender":"de","part_of_speech":"zn","plural":"banken","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Zitmeubel voor meerdere personen.","context":"","examples":["de bank staat in de kamer"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"bank","headword_raw":"bank","index":91001,"dictionaryId":"nl-test-lexicon","dictionary_name":"NL Testlexicon","fixture":true},"meaning_id":1}'::jsonb),
    ('nl', 'nl-test-lexicon', 'bank', 2, 'zn', 'de', 91002, '{"headword":"bank","pronunciation":"bank","pronunciation_with_stress":"bank","gender":"de","part_of_speech":"zn","plural":"banken","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Instelling waar mensen geld bewaren.","context":"","examples":["de testbank opent om negen uur"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"bank","headword_raw":"bank","index":91002,"dictionaryId":"nl-test-lexicon","dictionary_name":"NL Testlexicon","fixture":true},"meaning_id":2}'::jsonb),
    ('nl', 'nl-test-lexicon', 'dak', 1, 'zn', 'het', 91004, '{"headword":"dak","pronunciation":"dak","pronunciation_with_stress":"dak","gender":"het","part_of_speech":"zn","plural":"daken","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Bovenkant van een huis die regen tegenhoudt.","context":"","examples":["het dak van het huis is rood"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"dak","headword_raw":"dak","index":91004,"dictionaryId":"nl-test-lexicon","dictionary_name":"NL Testlexicon","fixture":true},"meaning_id":1}'::jsonb),
    ('nl', 'nl-test-lexicon', 'fiets', 1, 'zn', 'de', 91008, '{"headword":"fiets","pronunciation":"fiets","pronunciation_with_stress":"fiets","gender":"de","part_of_speech":"zn","plural":"fietsen","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Voertuig met twee wielen en trappers.","context":"","examples":["mijn fiets staat buiten"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"fiets","headword_raw":"fiets","index":91008,"dictionaryId":"nl-test-lexicon","dictionary_name":"NL Testlexicon","fixture":true},"meaning_id":1}'::jsonb),
    ('nl', 'nl-test-lexicon', 'huis', 1, 'zn', 'het', 91000, '{"headword":"huis","pronunciation":"huis","pronunciation_with_stress":"huis","gender":"het","part_of_speech":"zn","plural":"huizen","diminutive":"huisje","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Woning; gebouw om in te wonen.","context":"","examples":["dit testhuis staat naast het station"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"huis","headword_raw":"huis","index":91000,"dictionaryId":"nl-test-lexicon","dictionary_name":"NL Testlexicon","fixture":true},"meaning_id":1}'::jsonb),
    ('nl', 'nl-test-lexicon', 'kamer', 1, 'zn', 'de', 91007, '{"headword":"kamer","pronunciation":"kamer","pronunciation_with_stress":"kamer","gender":"de","part_of_speech":"zn","plural":"kamers","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Afgescheiden ruimte in een woning.","context":"","examples":["de kamer heeft een groot raam"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"kamer","headword_raw":"kamer","index":91007,"dictionaryId":"nl-test-lexicon","dictionary_name":"NL Testlexicon","fixture":true},"meaning_id":1}'::jsonb),
    ('nl', 'nl-test-lexicon', 'lopen', 1, 'ww', NULL, 91006, '{"headword":"lopen","pronunciation":"lopen","pronunciation_with_stress":"lopen","gender":"","part_of_speech":"ww","plural":"","diminutive":"","verb_forms":"liep, heeft gelopen","conjugation_table":{"present":{"ik":"loop","jij":"loopt","u":"loopt","hij_zij_het":"loopt","wij":"lopen","jullie":"lopen","zij":"lopen"},"past":{"ik":"liep","jij":"liep","u":"liep","hij_zij_het":"liep","wij":"liepen","jullie":"liepen","zij":"liepen"},"perfect":{"auxiliary":"heeft","participle":"gelopen"}},"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Met stappen vooruitgaan.","context":"iemand loopt","examples":["wij lopen elke ochtend naar school"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"lopen","headword_raw":"lopen","index":91006,"dictionaryId":"nl-test-lexicon","dictionary_name":"NL Testlexicon","fixture":true},"meaning_id":1}'::jsonb),
    ('nl', 'nl-test-lexicon', 'sleutel', 1, 'zn', 'de', 91005, '{"headword":"sleutel","pronunciation":"sleutel","pronunciation_with_stress":"sleutel","gender":"de","part_of_speech":"zn","plural":"sleutels","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Voorwerp waarmee je een deur opent.","context":"","examples":["de sleutel van het huis ligt op tafel"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"sleutel","headword_raw":"sleutel","index":91005,"dictionaryId":"nl-test-lexicon","dictionary_name":"NL Testlexicon","fixture":true},"meaning_id":1}'::jsonb),
    ('nl', 'nl-test-lexicon', 'thuishaven', 1, 'zn', 'de', 91003, '{"headword":"thuishaven","pronunciation":"thuishaven","pronunciation_with_stress":"thuishaven","gender":"de","part_of_speech":"zn","plural":"thuishavens","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Plaats die als vertrouwd huis voelt.","context":"","examples":["de club noemt deze zaal zijn thuishaven"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"thuishaven","headword_raw":"thuishaven","index":91003,"dictionaryId":"nl-test-lexicon","dictionary_name":"NL Testlexicon","fixture":true},"meaning_id":1}'::jsonb),
    ('nl', 'nl-test-lexicon', 'tuin', 1, 'zn', 'de', 91009, '{"headword":"tuin","pronunciation":"tuin","pronunciation_with_stress":"tuin","gender":"de","part_of_speech":"zn","plural":"tuinen","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Stuk grond bij een huis met planten.","context":"","examples":["in de tuin groeit munt"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"tuin","headword_raw":"tuin","index":91009,"dictionaryId":"nl-test-lexicon","dictionary_name":"NL Testlexicon","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-core', 'bank', 1, 'zn', NULL, 92002, '{"headword":"bank","pronunciation":"bank","pronunciation_with_stress":"bank","gender":"","part_of_speech":"zn","plural":"banks","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"A financial institution that keeps money.","context":"","examples":["the bank closes at five"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"bank","headword_raw":"bank","index":92002,"dictionaryId":"en-test-core","dictionary_name":"EN Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-core', 'bridge', 1, 'zn', NULL, 92009, '{"headword":"bridge","pronunciation":"bridge","pronunciation_with_stress":"bridge","gender":"","part_of_speech":"zn","plural":"bridges","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"A structure that crosses water or a road.","context":"","examples":["the bridge is old"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"bridge","headword_raw":"bridge","index":92009,"dictionaryId":"en-test-core","dictionary_name":"EN Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-core', 'door', 1, 'zn', NULL, 92006, '{"headword":"door","pronunciation":"door","pronunciation_with_stress":"door","gender":"","part_of_speech":"zn","plural":"doors","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"A panel that opens and closes an entrance.","context":"","examples":["close the door softly"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"door","headword_raw":"door","index":92006,"dictionaryId":"en-test-core","dictionary_name":"EN Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-core', 'home', 1, 'zn', NULL, 92001, '{"headword":"home","pronunciation":"home","pronunciation_with_stress":"home","gender":"","part_of_speech":"zn","plural":"homes","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"The place where one lives and feels settled.","context":"","examples":["after work she goes home"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"home","headword_raw":"home","index":92001,"dictionaryId":"en-test-core","dictionary_name":"EN Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-core', 'house', 1, 'zn', NULL, 92000, '{"headword":"house","pronunciation":"house","pronunciation_with_stress":"house","gender":"","part_of_speech":"zn","plural":"houses","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"A building for people to live in.","context":"","examples":["the house has a blue door"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"house","headword_raw":"house","index":92000,"dictionaryId":"en-test-core","dictionary_name":"EN Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-core', 'light', 1, 'zn', NULL, 92007, '{"headword":"light","pronunciation":"light","pronunciation_with_stress":"light","gender":"","part_of_speech":"zn","plural":"lights","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Brightness that lets people see.","context":"","examples":["the light is warm"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"light","headword_raw":"light","index":92007,"dictionaryId":"en-test-core","dictionary_name":"EN Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-core', 'roof', 1, 'zn', NULL, 92003, '{"headword":"roof","pronunciation":"roof","pronunciation_with_stress":"roof","gender":"","part_of_speech":"zn","plural":"roofs","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"The top cover of a house or building.","context":"","examples":["rain falls on the roof"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"roof","headword_raw":"roof","index":92003,"dictionaryId":"en-test-core","dictionary_name":"EN Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-core', 'room', 1, 'zn', NULL, 92005, '{"headword":"room","pronunciation":"room","pronunciation_with_stress":"room","gender":"","part_of_speech":"zn","plural":"rooms","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"A separate space inside a building.","context":"","examples":["this room is quiet"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"room","headword_raw":"room","index":92005,"dictionaryId":"en-test-core","dictionary_name":"EN Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-core', 'run', 1, 'ww', NULL, 92004, '{"headword":"run","pronunciation":"run","pronunciation_with_stress":"run","gender":"","part_of_speech":"ww","plural":"","diminutive":"","verb_forms":"ran, has run","conjugation_table":{"present":{"i":"run","you":"run","he_she_it":"runs","we":"run","they":"run"},"past":{"i":"ran","you":"ran","he_she_it":"ran","we":"ran","they":"ran"},"perfect":{"auxiliary":"has","participle":"run"}},"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"To move quickly on foot.","context":"someone runs","examples":["they run near the river"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"run","headword_raw":"run","index":92004,"dictionaryId":"en-test-core","dictionary_name":"EN Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-core', 'water', 1, 'zn', NULL, 92008, '{"headword":"water","pronunciation":"water","pronunciation_with_stress":"water","gender":"","part_of_speech":"zn","plural":"","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"A clear liquid people drink.","context":"","examples":["water fills the glass"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"water","headword_raw":"water","index":92008,"dictionaryId":"en-test-core","dictionary_name":"EN Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-extra', 'bank', 1, 'zn', NULL, 93001, '{"headword":"bank","pronunciation":"bank","pronunciation_with_stress":"bank","gender":"","part_of_speech":"zn","plural":"banks","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"The raised land along a river.","context":"","examples":["we sat on the river bank"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"bank","headword_raw":"bank","index":93001,"dictionaryId":"en-test-extra","dictionary_name":"EN Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-extra', 'bike', 1, 'zn', NULL, 93003, '{"headword":"bike","pronunciation":"bike","pronunciation_with_stress":"bike","gender":"","part_of_speech":"zn","plural":"bikes","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"A bicycle used for travel or exercise.","context":"","examples":["the bike has a bell"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"bike","headword_raw":"bike","index":93003,"dictionaryId":"en-test-extra","dictionary_name":"EN Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-extra', 'book', 1, 'zn', NULL, 93006, '{"headword":"book","pronunciation":"book","pronunciation_with_stress":"book","gender":"","part_of_speech":"zn","plural":"books","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Pages with words bound together.","context":"","examples":["the book is on the table"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"book","headword_raw":"book","index":93006,"dictionaryId":"en-test-extra","dictionary_name":"EN Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-extra', 'garden', 1, 'zn', NULL, 93004, '{"headword":"garden","pronunciation":"garden","pronunciation_with_stress":"garden","gender":"","part_of_speech":"zn","plural":"gardens","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"An outdoor area where plants are grown.","context":"","examples":["the garden is behind the house"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"garden","headword_raw":"garden","index":93004,"dictionaryId":"en-test-extra","dictionary_name":"EN Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-extra', 'house', 1, 'zn', NULL, 93000, '{"headword":"house","pronunciation":"house","pronunciation_with_stress":"house","gender":"","part_of_speech":"zn","plural":"houses","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"A private place where a family may live.","context":"","examples":["their small house is near the park"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"house","headword_raw":"house","index":93000,"dictionaryId":"en-test-extra","dictionary_name":"EN Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-extra', 'key', 1, 'zn', NULL, 93002, '{"headword":"key","pronunciation":"key","pronunciation_with_stress":"key","gender":"","part_of_speech":"zn","plural":"keys","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"A small object used to open a lock.","context":"","examples":["the house key is in my bag"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"key","headword_raw":"key","index":93002,"dictionaryId":"en-test-extra","dictionary_name":"EN Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-extra', 'market', 1, 'zn', NULL, 93009, '{"headword":"market","pronunciation":"market","pronunciation_with_stress":"market","gender":"","part_of_speech":"zn","plural":"markets","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"A place where people buy and sell goods.","context":"","examples":["the market opens early"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"market","headword_raw":"market","index":93009,"dictionaryId":"en-test-extra","dictionary_name":"EN Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-extra', 'street', 1, 'zn', NULL, 93008, '{"headword":"street","pronunciation":"street","pronunciation_with_stress":"street","gender":"","part_of_speech":"zn","plural":"streets","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"A public road in a town.","context":"","examples":["the street is busy"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"street","headword_raw":"street","index":93008,"dictionaryId":"en-test-extra","dictionary_name":"EN Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-extra', 'table', 1, 'zn', NULL, 93007, '{"headword":"table","pronunciation":"table","pronunciation_with_stress":"table","gender":"","part_of_speech":"zn","plural":"tables","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Furniture with a flat top and legs.","context":"","examples":["food is on the table"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"table","headword_raw":"table","index":93007,"dictionaryId":"en-test-extra","dictionary_name":"EN Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('en', 'en-test-extra', 'window', 1, 'zn', NULL, 93005, '{"headword":"window","pronunciation":"window","pronunciation_with_stress":"window","gender":"","part_of_speech":"zn","plural":"windows","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"An opening with glass in a wall.","context":"","examples":["open the window"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"window","headword_raw":"window","index":93005,"dictionaryId":"en-test-extra","dictionary_name":"EN Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-core', 'banque', 1, 'zn', 'la', 94001, '{"headword":"banque","pronunciation":"banque","pronunciation_with_stress":"banque","gender":"la","part_of_speech":"zn","plural":"banques","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Etablissement qui garde de l argent.","context":"","examples":["la banque ferme a cinq heures"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"banque","headword_raw":"banque","index":94001,"dictionaryId":"fr-test-core","dictionary_name":"FR Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-core', 'chambre', 1, 'zn', 'la', 94004, '{"headword":"chambre","pronunciation":"chambre","pronunciation_with_stress":"chambre","gender":"la","part_of_speech":"zn","plural":"chambres","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Piece ou l on dort.","context":"","examples":["la chambre est calme"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"chambre","headword_raw":"chambre","index":94004,"dictionaryId":"fr-test-core","dictionary_name":"FR Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-core', 'courir', 1, 'ww', NULL, 94003, '{"headword":"courir","pronunciation":"courir","pronunciation_with_stress":"courir","gender":"","part_of_speech":"ww","plural":"","diminutive":"","verb_forms":"a couru","conjugation_table":{"present":{"je":"cours","tu":"cours","il_elle":"court","nous":"courons","vous":"courez","ils_elles":"courent"},"past":{"participe":"couru"},"perfect":{"auxiliary":"a","participle":"couru"}},"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Se deplacer vite avec les jambes.","context":"quelqu un court","examples":["nous aimons courir le matin"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"courir","headword_raw":"courir","index":94003,"dictionaryId":"fr-test-core","dictionary_name":"FR Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-core', 'eau', 1, 'zn', 'l', 94007, '{"headword":"eau","pronunciation":"eau","pronunciation_with_stress":"eau","gender":"l","part_of_speech":"zn","plural":"eaux","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Liquide transparent que l on boit.","context":"","examples":["un verre d eau"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"eau","headword_raw":"eau","index":94007,"dictionaryId":"fr-test-core","dictionary_name":"FR Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-core', 'livre', 1, 'zn', 'le', 94009, '{"headword":"livre","pronunciation":"livre","pronunciation_with_stress":"livre","gender":"le","part_of_speech":"zn","plural":"livres","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Ensemble de pages imprimees.","context":"","examples":["le livre est sur la table"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"livre","headword_raw":"livre","index":94009,"dictionaryId":"fr-test-core","dictionary_name":"FR Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-core', 'lumiere', 1, 'zn', 'la', 94006, '{"headword":"lumiere","pronunciation":"lumiere","pronunciation_with_stress":"lumiere","gender":"la","part_of_speech":"zn","plural":"lumieres","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Clarte qui permet de voir.","context":"","examples":["la lumiere est douce"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"lumiere","headword_raw":"lumiere","index":94006,"dictionaryId":"fr-test-core","dictionary_name":"FR Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-core', 'maison', 1, 'zn', 'la', 94000, '{"headword":"maison","pronunciation":"maison","pronunciation_with_stress":"maison","gender":"la","part_of_speech":"zn","plural":"maisons","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Batiment ou l on habite.","context":"","examples":["la maison a une porte bleue"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"maison","headword_raw":"maison","index":94000,"dictionaryId":"fr-test-core","dictionary_name":"FR Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-core', 'pont', 1, 'zn', 'le', 94008, '{"headword":"pont","pronunciation":"pont","pronunciation_with_stress":"pont","gender":"le","part_of_speech":"zn","plural":"ponts","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Construction qui passe au dessus d une route ou d une riviere.","context":"","examples":["le pont est ancien"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"pont","headword_raw":"pont","index":94008,"dictionaryId":"fr-test-core","dictionary_name":"FR Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-core', 'porte', 1, 'zn', 'la', 94005, '{"headword":"porte","pronunciation":"porte","pronunciation_with_stress":"porte","gender":"la","part_of_speech":"zn","plural":"portes","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Panneau qui ferme une entree.","context":"","examples":["la porte est ouverte"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"porte","headword_raw":"porte","index":94005,"dictionaryId":"fr-test-core","dictionary_name":"FR Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-core', 'toit', 1, 'zn', 'le', 94002, '{"headword":"toit","pronunciation":"toit","pronunciation_with_stress":"toit","gender":"le","part_of_speech":"zn","plural":"toits","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Partie superieure d une maison.","context":"","examples":["le toit protege la maison"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"toit","headword_raw":"toit","index":94002,"dictionaryId":"fr-test-core","dictionary_name":"FR Core Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-extra', 'ami', 1, 'zn', 'l', 95009, '{"headword":"ami","pronunciation":"ami","pronunciation_with_stress":"ami","gender":"l","part_of_speech":"zn","plural":"amis","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Personne avec qui on a une relation proche.","context":"","examples":["mon ami habite pres de moi"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"ami","headword_raw":"ami","index":95009,"dictionaryId":"fr-test-extra","dictionary_name":"FR Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-extra', 'banc', 1, 'zn', 'le', 95001, '{"headword":"banc","pronunciation":"banc","pronunciation_with_stress":"banc","gender":"le","part_of_speech":"zn","plural":"bancs","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Siege long pour plusieurs personnes.","context":"","examples":["le banc est dans le parc"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"banc","headword_raw":"banc","index":95001,"dictionaryId":"fr-test-extra","dictionary_name":"FR Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-extra', 'cle', 1, 'zn', 'la', 95002, '{"headword":"cle","pronunciation":"cle","pronunciation_with_stress":"cle","gender":"la","part_of_speech":"zn","plural":"cles","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Petit objet qui ouvre une serrure.","context":"","examples":["la cle de la maison est ici"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"cle","headword_raw":"cle","index":95002,"dictionaryId":"fr-test-extra","dictionary_name":"FR Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-extra', 'fenetre', 1, 'zn', 'la', 95005, '{"headword":"fenetre","pronunciation":"fenetre","pronunciation_with_stress":"fenetre","gender":"la","part_of_speech":"zn","plural":"fenetres","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Ouverture vitree dans un mur.","context":"","examples":["la fenetre donne sur la rue"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"fenetre","headword_raw":"fenetre","index":95005,"dictionaryId":"fr-test-extra","dictionary_name":"FR Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-extra', 'jardin', 1, 'zn', 'le', 95004, '{"headword":"jardin","pronunciation":"jardin","pronunciation_with_stress":"jardin","gender":"le","part_of_speech":"zn","plural":"jardins","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Terrain avec des plantes pres d une maison.","context":"","examples":["le jardin est derriere la maison"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"jardin","headword_raw":"jardin","index":95004,"dictionaryId":"fr-test-extra","dictionary_name":"FR Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-extra', 'maison', 1, 'zn', 'la', 95000, '{"headword":"maison","pronunciation":"maison","pronunciation_with_stress":"maison","gender":"la","part_of_speech":"zn","plural":"maisons","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Lieu prive ou une famille peut vivre.","context":"","examples":["notre maison est pres du jardin"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"maison","headword_raw":"maison","index":95000,"dictionaryId":"fr-test-extra","dictionary_name":"FR Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-extra', 'marche', 1, 'zn', 'le', 95008, '{"headword":"marche","pronunciation":"marche","pronunciation_with_stress":"marche","gender":"le","part_of_speech":"zn","plural":"marches","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Lieu ou l on achete et vend des produits.","context":"","examples":["le marche ouvre tot"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"marche","headword_raw":"marche","index":95008,"dictionaryId":"fr-test-extra","dictionary_name":"FR Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-extra', 'rue', 1, 'zn', 'la', 95007, '{"headword":"rue","pronunciation":"rue","pronunciation_with_stress":"rue","gender":"la","part_of_speech":"zn","plural":"rues","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Voie publique dans une ville.","context":"","examples":["la rue est longue"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"rue","headword_raw":"rue","index":95007,"dictionaryId":"fr-test-extra","dictionary_name":"FR Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-extra', 'table', 1, 'zn', 'la', 95006, '{"headword":"table","pronunciation":"table","pronunciation_with_stress":"table","gender":"la","part_of_speech":"zn","plural":"tables","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Meuble avec un plateau plat.","context":"","examples":["le repas est sur la table"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"table","headword_raw":"table","index":95006,"dictionaryId":"fr-test-extra","dictionary_name":"FR Extra Test","fixture":true},"meaning_id":1}'::jsonb),
    ('fr', 'fr-test-extra', 'velo', 1, 'zn', 'le', 95003, '{"headword":"velo","pronunciation":"velo","pronunciation_with_stress":"velo","gender":"le","part_of_speech":"zn","plural":"velos","diminutive":"","verb_forms":"","conjugation_table":null,"inflected_form":"","comparative":"","superlative":"","derivations":"","alternate_headwords":[],"cross_reference":null,"is_nt2_2000":false,"meanings":[{"definition":"Vehicule a deux roues avec des pedales.","context":"","examples":["le velo est rouge"],"idioms":[]}],"audio_links":{},"images":[],"_metadata":{"search_term":"velo","headword_raw":"velo","index":95003,"dictionaryId":"fr-test-extra","dictionary_name":"FR Extra Test","fixture":true},"meaning_id":1}'::jsonb)
)
INSERT INTO word_entries (dictionary_id, language_code, headword, meaning_id, part_of_speech, gender, is_nt2_2000, vandale_id, raw)
SELECT
    d.id,
    f.language_code,
    f.headword,
    f.meaning_id,
    f.part_of_speech,
    f.gender,
    false,
    f.metadata_index,
    f.raw_payload
FROM fixture_entries f
JOIN dictionaries d
  ON d.language_code = f.language_code
 AND d.slug = f.dictionary_slug
ON CONFLICT (dictionary_id, language_code, headword, meaning_id)
WHERE dictionary_id IS NOT NULL
DO UPDATE
SET part_of_speech = excluded.part_of_speech,
    gender = excluded.gender,
    is_nt2_2000 = excluded.is_nt2_2000,
    vandale_id = excluded.vandale_id,
    raw = excluded.raw;

WITH fixture_forms (language_code, dictionary_slug, headword, meaning_id, form) AS (
  VALUES
    ('nl', 'nl-test-lexicon', 'huis', 1, 'huizen'),
    ('nl', 'nl-test-lexicon', 'huis', 1, 'huisje'),
    ('nl', 'nl-test-lexicon', 'lopen', 1, 'liep'),
    ('nl', 'nl-test-lexicon', 'lopen', 1, 'gelopen'),
    ('en', 'en-test-core', 'house', 1, 'houses'),
    ('en', 'en-test-extra', 'house', 1, 'houses'),
    ('en', 'en-test-core', 'run', 1, 'ran'),
    ('en', 'en-test-core', 'run', 1, 'running'),
    ('fr', 'fr-test-core', 'maison', 1, 'maisons'),
    ('fr', 'fr-test-extra', 'maison', 1, 'maisons'),
    ('fr', 'fr-test-core', 'courir', 1, 'couru'),
    ('fr', 'fr-test-core', 'courir', 1, 'courant')
)
INSERT INTO word_forms (language_code, dictionary_id, form, word_id, headword)
SELECT f.language_code, d.id, f.form, w.id, w.headword
FROM fixture_forms f
JOIN dictionaries d
  ON d.language_code = f.language_code
 AND d.slug = f.dictionary_slug
JOIN word_entries w
  ON w.dictionary_id = d.id
 AND w.language_code = f.language_code
 AND w.headword = f.headword
 AND w.meaning_id = f.meaning_id
ON CONFLICT (language_code, form, word_id) DO UPDATE
SET dictionary_id = excluded.dictionary_id,
    headword = excluded.headword;

INSERT INTO word_lists (language_code, primary_language_code, slug, name, description, is_primary, sort_order) VALUES
    ('nl', 'nl', 'nl-test-lexicon-all', 'NL Testlexicon', 'All entries from the local NL fixture dictionary.', false, 110),
    ('en', 'en', 'en-test-core-all', 'EN Core Test', 'All entries from the local EN core fixture dictionary.', false, 120),
    ('en', 'en', 'en-test-extra-all', 'EN Extra Test', 'All entries from the local EN extra fixture dictionary.', false, 121),
    ('fr', 'fr', 'fr-test-core-all', 'FR Core Test', 'All entries from the local FR core fixture dictionary.', false, 130),
    ('fr', 'fr', 'fr-test-extra-all', 'FR Extra Test', 'All entries from the local FR extra fixture dictionary.', false, 131),
    ('nl', 'nl', 'nl-mixed-source-test', 'NL mixed source test', 'Local fixture list for duplicate Dutch source rows.', false, 140),
    ('nl', 'nl', 'multilingual-fixture-test', 'Multilingual fixture test', 'Local fixture list with Dutch, English, and French entries.', false, 150),
    ('nl', 'nl', 'empty-fixture-list', 'Empty fixture list', 'Local fixture list with no entries.', false, 160)
ON CONFLICT (language_code, slug) DO UPDATE
SET name = excluded.name,
    description = excluded.description,
    is_primary = excluded.is_primary,
    sort_order = excluded.sort_order,
    primary_language_code = excluded.primary_language_code;

WITH fixture_list_members (list_language_code, list_slug, dictionary_slug, headword, meaning_id, rank) AS (
  VALUES
    ('nl', 'nl-test-lexicon-all', 'nl-test-lexicon', 'bank', 1, 1),
    ('nl', 'nl-test-lexicon-all', 'nl-test-lexicon', 'bank', 2, 2),
    ('nl', 'nl-test-lexicon-all', 'nl-test-lexicon', 'dak', 1, 3),
    ('nl', 'nl-test-lexicon-all', 'nl-test-lexicon', 'fiets', 1, 4),
    ('nl', 'nl-test-lexicon-all', 'nl-test-lexicon', 'huis', 1, 5),
    ('nl', 'nl-test-lexicon-all', 'nl-test-lexicon', 'kamer', 1, 6),
    ('nl', 'nl-test-lexicon-all', 'nl-test-lexicon', 'lopen', 1, 7),
    ('nl', 'nl-test-lexicon-all', 'nl-test-lexicon', 'sleutel', 1, 8),
    ('nl', 'nl-test-lexicon-all', 'nl-test-lexicon', 'thuishaven', 1, 9),
    ('nl', 'nl-test-lexicon-all', 'nl-test-lexicon', 'tuin', 1, 10),
    ('en', 'en-test-core-all', 'en-test-core', 'bank', 1, 1),
    ('en', 'en-test-core-all', 'en-test-core', 'bridge', 1, 2),
    ('en', 'en-test-core-all', 'en-test-core', 'door', 1, 3),
    ('en', 'en-test-core-all', 'en-test-core', 'home', 1, 4),
    ('en', 'en-test-core-all', 'en-test-core', 'house', 1, 5),
    ('en', 'en-test-core-all', 'en-test-core', 'light', 1, 6),
    ('en', 'en-test-core-all', 'en-test-core', 'roof', 1, 7),
    ('en', 'en-test-core-all', 'en-test-core', 'room', 1, 8),
    ('en', 'en-test-core-all', 'en-test-core', 'run', 1, 9),
    ('en', 'en-test-core-all', 'en-test-core', 'water', 1, 10),
    ('en', 'en-test-extra-all', 'en-test-extra', 'bank', 1, 1),
    ('en', 'en-test-extra-all', 'en-test-extra', 'bike', 1, 2),
    ('en', 'en-test-extra-all', 'en-test-extra', 'book', 1, 3),
    ('en', 'en-test-extra-all', 'en-test-extra', 'garden', 1, 4),
    ('en', 'en-test-extra-all', 'en-test-extra', 'house', 1, 5),
    ('en', 'en-test-extra-all', 'en-test-extra', 'key', 1, 6),
    ('en', 'en-test-extra-all', 'en-test-extra', 'market', 1, 7),
    ('en', 'en-test-extra-all', 'en-test-extra', 'street', 1, 8),
    ('en', 'en-test-extra-all', 'en-test-extra', 'table', 1, 9),
    ('en', 'en-test-extra-all', 'en-test-extra', 'window', 1, 10),
    ('fr', 'fr-test-core-all', 'fr-test-core', 'banque', 1, 1),
    ('fr', 'fr-test-core-all', 'fr-test-core', 'chambre', 1, 2),
    ('fr', 'fr-test-core-all', 'fr-test-core', 'courir', 1, 3),
    ('fr', 'fr-test-core-all', 'fr-test-core', 'eau', 1, 4),
    ('fr', 'fr-test-core-all', 'fr-test-core', 'livre', 1, 5),
    ('fr', 'fr-test-core-all', 'fr-test-core', 'lumiere', 1, 6),
    ('fr', 'fr-test-core-all', 'fr-test-core', 'maison', 1, 7),
    ('fr', 'fr-test-core-all', 'fr-test-core', 'pont', 1, 8),
    ('fr', 'fr-test-core-all', 'fr-test-core', 'porte', 1, 9),
    ('fr', 'fr-test-core-all', 'fr-test-core', 'toit', 1, 10),
    ('fr', 'fr-test-extra-all', 'fr-test-extra', 'ami', 1, 1),
    ('fr', 'fr-test-extra-all', 'fr-test-extra', 'banc', 1, 2),
    ('fr', 'fr-test-extra-all', 'fr-test-extra', 'cle', 1, 3),
    ('fr', 'fr-test-extra-all', 'fr-test-extra', 'fenetre', 1, 4),
    ('fr', 'fr-test-extra-all', 'fr-test-extra', 'jardin', 1, 5),
    ('fr', 'fr-test-extra-all', 'fr-test-extra', 'maison', 1, 6),
    ('fr', 'fr-test-extra-all', 'fr-test-extra', 'marche', 1, 7),
    ('fr', 'fr-test-extra-all', 'fr-test-extra', 'rue', 1, 8),
    ('fr', 'fr-test-extra-all', 'fr-test-extra', 'table', 1, 9),
    ('fr', 'fr-test-extra-all', 'fr-test-extra', 'velo', 1, 10),
    ('nl', 'nl-mixed-source-test', 'nl-test-lexicon', 'huis', 1, 1),
    ('nl', 'nl-mixed-source-test', 'nl-test-lexicon', 'dak', 1, 2),
    ('nl', 'nl-mixed-source-test', 'nl-test-lexicon', 'sleutel', 1, 3),
    ('nl', 'nl-mixed-source-test', 'nl-test-lexicon', 'kamer', 1, 4),
    ('nl', 'nl-mixed-source-test', 'nl-test-lexicon', 'bank', 1, 5),
    ('nl', 'multilingual-fixture-test', 'nl-test-lexicon', 'huis', 1, 1),
    ('nl', 'multilingual-fixture-test', 'en-test-core', 'house', 1, 2),
    ('nl', 'multilingual-fixture-test', 'en-test-extra', 'house', 1, 3),
    ('nl', 'multilingual-fixture-test', 'en-test-core', 'bank', 1, 4),
    ('nl', 'multilingual-fixture-test', 'fr-test-core', 'maison', 1, 5),
    ('nl', 'multilingual-fixture-test', 'fr-test-extra', 'maison', 1, 6)
)
INSERT INTO word_list_items (list_id, word_id, rank)
SELECT l.id, w.id, m.rank
FROM fixture_list_members m
JOIN word_lists l
  ON l.language_code = m.list_language_code
 AND l.slug = m.list_slug
JOIN dictionaries d
  ON d.slug = m.dictionary_slug
JOIN word_entries w
  ON w.dictionary_id = d.id
 AND w.headword = m.headword
 AND w.meaning_id = m.meaning_id
ON CONFLICT (list_id, word_id) DO UPDATE
SET rank = excluded.rank;

-- Optional bridge to the existing VanDale corpus when local data already has it.
WITH target_list AS (
    SELECT id FROM word_lists WHERE language_code = 'nl' AND slug = 'nl-mixed-source-test'
), optional_vandale_rows AS (
    SELECT w.id AS word_id, ROW_NUMBER() OVER (ORDER BY w.headword, w.meaning_id) + 100 AS rank
    FROM word_entries w
    JOIN dictionaries d ON d.id = w.dictionary_id
    WHERE d.language_code = 'nl'
      AND d.slug = 'nl-vandale'
      AND w.headword IN ('huis', 'kamer', 'bank', 'lopen')
)
INSERT INTO word_list_items (list_id, word_id, rank)
SELECT target_list.id, optional_vandale_rows.word_id, optional_vandale_rows.rank
FROM target_list
CROSS JOIN optional_vandale_rows
ON CONFLICT (list_id, word_id) DO UPDATE
SET rank = excluded.rank;

COMMIT;
