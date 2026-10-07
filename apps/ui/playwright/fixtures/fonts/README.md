# Browser test fonts

These are the exact Google Fonts variable families used by `app/layout.tsx`:
Inter 100–900 and Newsreader 200–800, with Newsreader normal and italic. They
are unmodified WOFF2 files from the Google Fonts CSS API, fetched on 2026-10-08.
The Latin subset covers the Dutch headword test corpus, including `ë` and the
pronunciation separator `·`. Inter also includes the Cyrillic subset because
`app/layout.tsx` requests both Latin and Cyrillic. The mocked Next font
responses reference these local files so browser geometry tests exercise the
intended faces without network access.

The files are licensed under the SIL Open Font License 1.1. The upstream
license texts are preserved beside the files as `Inter-OFL.txt` and
`Newsreader-OFL.txt`.

| Family / style | Google Fonts CSS request | Upstream WOFF2 | SHA-256 |
| --- | --- | --- | --- |
| Inter variable, normal, Latin | `https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap` | `https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2` | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` |
| Inter variable, normal, Cyrillic | `https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap` | `https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa0ZL7SUc.woff2` | `71d5ee93cc1e9f1d520a3a8b66456de18c7879d8df09d57fcd2eaff75fef0075` |
| Newsreader variable, normal, Latin | `https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,200..800;1,200..800&display=swap` | `https://fonts.gstatic.com/s/newsreader/v26/cY9VfjOCX1hbuyalUrK49dLac06G1ZGsZBtoBAbNJYQ.woff2` | `62981321d9a3cc7a61a73792729043703fd6112da86e8ec848bb57f088578757` |
| Newsreader variable, italic, Latin | `https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,200..800;1,200..800&display=swap` | `https://fonts.gstatic.com/s/newsreader/v26/cY9XfjOCX1hbuyalUrK439vogqC9yFZCYg7oRZaLFYYzbA.woff2` | `48bc8861b9b2ca9300747cad4fd6a3b4ac3028d364df00bd1b72097baa75e509` |

The font files were not subsetted or otherwise transformed after download.
