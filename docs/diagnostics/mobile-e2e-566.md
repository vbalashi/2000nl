# Mobile e2e investigation (#566)

## Reproduced report-sheet interception

GitHub run [37118885251](https://github.com/vbalashi/2000nl/actions/runs/37118885251)
ran five affected scenarios twenty times each with two workers and no retries.
It failed 26 of 100 cases. All 26 failures were the report-sheet scenarios at
390 or 402 pixels, on the pointer click of `Terug`.

The retained trace records a React hydration mismatch on RootLayout's `html`
class: the client expected the font classes, while the DOM already included
`dark`. The test added that class directly after `page.goto`, before hydration
necessarily finished. The screenshot shows the resulting Next.js `1 Issue`
badge covering the mobile `Terug` button; the click trace identifies
`nextjs-portal` as the interceptor. This is evidence for a test-induced hydration
race, rather than a report-sheet placement error or an unrelated runtime crash.

## Fix boundary

The report and secondary-action tests emulate the browser color scheme before
navigation, and await the class applied by the existing `SystemThemeEffect`.
They no longer mutate the SSR root. Theme readiness has a bounded 15-second
wait to allow dev-server hydration on cold runs. All existing pointer,
keyboard, focus, layout, and theme assertions remain. Next.js diagnostics stay
visible, and application code is unchanged.

## Reproduced Training header offset

The first local 100-case series after the theme fix passed 99 cases; all report
and secondary-action checks passed. One 412-pixel Training bootstrap case
reproduced the original 65-pixel offset. Its screenshot shows the asynchronous
`DevDatabaseWarning` above the frame, with exactly that height. The scenario
mocks auth and preferences but previously allowed a real `/api/health?deep=1`
request against the deliberately unconfigured synthetic dev server. That
warning can mount between the separate frame and header measurements.

The bootstrap fixture now supplies a deterministic healthy response for that
specific health request, alongside its existing mocked database boundary.
Application warning behavior stays intact. Absolute viewport and exact relative
header-position assertions remain unchanged. Both fixes require the full
100-case no-retry series plus normal CI before this issue can be closed.

An unrelated `DictionarySearchTab.grouping` unit-test failure occurred in PR
run 37118880352; the full UI job in run 37118885251 passed on the same commit.
It needs its own reproduction if it recurs.

## Combined-fix validation

Local focused run on `ac80baf190fd3a46d97d0e6df24e7198fc52f2b4`: **100 passed
in 1.7 minutes**, two workers, twenty repetitions of five scenarios, zero
retries. Typecheck and lint on all three modified specs passed. GitHub focused
run [37121974046](https://github.com/vbalashi/2000nl/actions/runs/37121974046)
and ordinary PR CI were dispatched to confirm the same fixes on Linux.

GitHub focused job `111199718601` in run 37121974046 confirmed **100 passed in
3.4 minutes**, without retries. Its parallel full-suite job reproduced the
separate search-pagination unit flake again. That test waited for a result row
but synchronously queried pagination, although the UI renders pagination only
after marking the search result current. It now awaits both the enabled source
option and the enabled pagination control before clicking; cursor/scope
assertions are preserved. The entire 31-test grouping suite passes locally.
