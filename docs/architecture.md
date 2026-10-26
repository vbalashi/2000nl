# How it fits together

**The application** brings together your word library, collections, dictionary
lookup and practice sessions.

**The database** stores entries, accounts, access permissions and learning
progress. It also decides when a card should return for review. Supabase provides
account sign-in and live updates alongside PostgreSQL.

**Dictionary data is separate.** Open formats describe words, meanings, examples
and language-specific fields. You can supply compatible content without using
the maintainers' full dictionaries or private translation prompts.

**Optional services** provide AI translation and spoken audio. Their credentials
and private resources stay on the server.

**Connected applications** can offer other ways to encounter and save words.
AudioFilms focuses on listening and shadowing; Pontix focuses on browser
translation. 2000NL is intended to keep vocabulary and learning progress together
as these connections develop.
