# Dependency audit baseline — 2026-09-22
#411 baseline: 93a9530f5 (UI lock unchanged from eeb0e2b50).

Production audit: {'info': 0, 'low': 1, 'moderate': 1, 'high': 7, 'critical': 2, 'total': 11}

These are dependency findings, not demonstrated exploitability. Each URL is the upstream advisory; resolution is the patched lockfile, not an exception.

## @grpc/grpc-js — high
Resolved baseline: 1.14.3
- [@grpc/grpc-js: A malformed request can cause a server crash](https://github.com/advisories/GHSA-5375-pq7m-f5r2)
- [@grpc/grpc-js: An incoming malformed compressed message can cause a client or server crash](https://github.com/advisories/GHSA-99f4-grh7-6pcq)

## @protobufjs/utf8 — moderate
Resolved baseline: 1.1.0
- [protobufjs has overlong UTF-8 decoding](https://github.com/advisories/GHSA-q6x5-8v7m-xcrf)

## @tootallnate/once — low
Resolved baseline: 2.0.0
- [@tootallnate/once vulnerable to Incorrect Control Flow Scoping](https://github.com/advisories/GHSA-vpq2-c234-7xj6)

## brace-expansion — high
Resolved baseline: 2.0.2
- [brace-expansion: Zero-step sequence causes process hang and memory exhaustion](https://github.com/advisories/GHSA-f886-m6hf-6m8v)
- [brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp)
- [brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash](https://github.com/advisories/GHSA-mh99-v99m-4gvg)
- [brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation](https://github.com/advisories/GHSA-rgw5-rvv9-x895)

## glob — high
Resolved baseline: 10.3.10
- [glob CLI: Command injection via -c/--cmd executes matches with shell:true](https://github.com/advisories/GHSA-5j98-mcp5-4vw2)

## minimatch — high
Resolved baseline: 9.0.5
- [minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern](https://github.com/advisories/GHSA-3ppc-4f35-3m26)
- [minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments](https://github.com/advisories/GHSA-7r86-cg39-jmmj)
- [minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions](https://github.com/advisories/GHSA-23c5-xmqv-rm74)

## nanoid — high
Resolved baseline: 3.3.11
- [nanoid: non-secure generators can loop indefinitely with negative size](https://github.com/advisories/GHSA-28wg-ghj8-5hjv)
- [nanoid: custom generators can loop indefinitely when size is zero](https://github.com/advisories/GHSA-2v37-7h3g-55p8)
- [nanoid: Integer Overflow or Wraparound](https://github.com/advisories/GHSA-xwg4-73v4-xw9w)

## next — critical
Resolved baseline: 14.2.0
- [Next.js Cache Poisoning](https://github.com/advisories/GHSA-gp8f-8m3g-qvj9)
- [Denial of Service condition in Next.js image optimization](https://github.com/advisories/GHSA-g77x-44xx-532m)
- [Next.js Allows a Denial of Service (DoS) with Server Actions](https://github.com/advisories/GHSA-7m27-7ghc-44w9)
- [Information exposure in Next.js dev server due to lack of origin verification](https://github.com/advisories/GHSA-3h52-269p-cp9r)
- [Next.js Affected by Cache Key Confusion for Image Optimization API Routes](https://github.com/advisories/GHSA-g5qg-72qw-gw5v)
- [Next.js authorization bypass vulnerability](https://github.com/advisories/GHSA-7gfc-8cq8-jh5f)
- [Next.js Improper Middleware Redirect Handling Leads to SSRF](https://github.com/advisories/GHSA-4342-x723-ch2f)
- [Next.js Content Injection Vulnerability for Image Optimization](https://github.com/advisories/GHSA-xv57-4mr9-wg8v)
- [Next.js Race Condition to Cache Poisoning](https://github.com/advisories/GHSA-qpjv-v59x-3qc4)
- [Next Vulnerable to Denial of Service with Server Components](https://github.com/advisories/GHSA-mwv6-3258-q52c)
- [Next has a Denial of Service with Server Components - Incomplete Fix Follow-Up](https://github.com/advisories/GHSA-5j59-xgg2-r9c4)
- [Next.js self-hosted applications vulnerable to DoS via Image Optimizer remotePatterns configuration](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f)
- [Next.js HTTP request deserialization can lead to DoS when using insecure React Server Components](https://github.com/advisories/GHSA-h25m-26qc-wcjf)
- [Authorization Bypass in Next.js Middleware](https://github.com/advisories/GHSA-f82v-jwr5-mffw)
- [Next.js: HTTP request smuggling in rewrites](https://github.com/advisories/GHSA-ggv3-7p47-pfv8)
- [Next.js: Unbounded next/image disk cache growth can exhaust storage](https://github.com/advisories/GHSA-3x4c-7xq6-9pq8)
- [Next.js has a Denial of Service with Server Components](https://github.com/advisories/GHSA-q4gf-8mx6-v5v3)
- [Next.js Vulnerable to Denial of Service with Server Components](https://github.com/advisories/GHSA-8h8q-6873-q5fj)
- [Next.js's Middleware / Proxy redirects can be cache-poisoned](https://github.com/advisories/GHSA-3g8h-86w9-wvmq)
- [Next.js vulnerable to cross-site scripting in App Router applications using CSP nonces](https://github.com/advisories/GHSA-ffhc-5mcf-pf4q)
- [Next.js vulnerable to cache poisoning via collisions in React Server Component cache-busting](https://github.com/advisories/GHSA-vfv6-92ff-j949)
- [Next.js has cross-site scripting in beforeInteractive scripts with untrusted input](https://github.com/advisories/GHSA-gx5p-jg67-6x7h)
- [Next.js has a Denial of Service in the Image Optimization API](https://github.com/advisories/GHSA-h64f-5h5j-jqjh)
- [Next.js vulnerable to server-side request forgery in applications using WebSocket upgrades](https://github.com/advisories/GHSA-c4j6-fc7j-m34r)
- [Next.js vulnerable to cache poisoning in React Server Component responses](https://github.com/advisories/GHSA-wfc6-r584-vfw7)
- [Next.js has a Middleware / Proxy bypass in Pages Router applications using i18n](https://github.com/advisories/GHSA-36qx-fr4f-26g5)
- [Next.js: Denial of Service in App Router using Server Actions](https://github.com/advisories/GHSA-m99w-x7hq-7vfj)
- [Next.js: Server-Side Request Forgery in Server Actions on custom servers](https://github.com/advisories/GHSA-89xv-2m56-2m9x)
- [Next.js: Cache confusion of response bodies for requests with bodies](https://github.com/advisories/GHSA-68g3-v927-f742)
- [Next.js: Cache confusion of response bodies for requests with bodies containing invalid UTF-8 byte sequences](https://github.com/advisories/GHSA-4633-3j49-mh5q)
- [Next.js: Unbounded Server Action payload in Edge runtime](https://github.com/advisories/GHSA-4c39-4ccg-62r3)
- [Next.js: Server-Side Request Forgery in rewrites via attacker-controlled destination hostname](https://github.com/advisories/GHSA-p9j2-gv94-2wf4)
- [Next.js: Unauthenticated disclosure of internal Server Function endpoints](https://github.com/advisories/GHSA-955p-x3mx-jcvp)
- [Next.js: Unauthenticated Remote Code Execution on windows-hosted servers](https://github.com/advisories/GHSA-p293-qw3h-jr36)
- [Next.js: Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are used](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4)

## postcss — high
Resolved baseline: 8.4.31
- [PostCSS has XSS via Unescaped </style> in its CSS Stringify Output](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
- [PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments](https://github.com/advisories/GHSA-6g55-p6wh-862q)
- [PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)
- [PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure](https://github.com/advisories/GHSA-r28c-9q8g-f849)

## protobufjs — critical
Resolved baseline: 7.5.4
- [Arbitrary code execution in protobufjs](https://github.com/advisories/GHSA-xq3m-2v4x-88gg)
- [protobuf.js: Code injection through bytes field defaults in generated toObject code](https://github.com/advisories/GHSA-66ff-xgx4-vchm)
- [protobuf.js: Denial of service from crafted field names in generated code](https://github.com/advisories/GHSA-2pr8-phx7-x9h3)
- [protobuf.js: Prototype injection in generated message constructors](https://github.com/advisories/GHSA-fx83-v9x8-x52w)
- [protobuf.js: Code generation gadget after prototype pollution](https://github.com/advisories/GHSA-75px-5xx7-5xc7)
- [protobuf.js: Process-wide denial of service through unsafe option paths](https://github.com/advisories/GHSA-jvwf-75h9-cwgg)
- [protobuf.js: Denial of service through unbounded protobuf recursion](https://github.com/advisories/GHSA-685m-2w69-288q)
- [protobufjs has overlong UTF-8 decoding](https://github.com/advisories/GHSA-q6x5-8v7m-xcrf)
- [protobufjs: Denial of Service via unbounded recursive JSON descriptor expansion](https://github.com/advisories/GHSA-jggg-4jg4-v7c6)
- [protobufjs: Denial of service through unbounded Any expansion during JSON conversion](https://github.com/advisories/GHSA-wcpc-wj8m-hjx6)
- [protobufjs : Schema-derived names can shadow runtime-significant properties](https://github.com/advisories/GHSA-f38q-mgvj-vph7)
- [protobufjs: Denial of Service via infinite loop in .proto option parsing](https://github.com/advisories/GHSA-j3f2-48v5-ccww)

## ws — high
Resolved baseline: 8.18.3
- [ws: Uninitialized memory disclosure](https://github.com/advisories/GHSA-58qx-3vcg-4xpx)
- [ws: Memory exhaustion DoS from tiny fragments and data chunks](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)
