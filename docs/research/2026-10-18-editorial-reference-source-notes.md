# Editorial references: primary-source notes

Date: 2026-10-18. Status: evidence for design exploration, not an accepted implementation plan.

## Scope and method

Opened all 13 supplied URLs (12 sites/examples plus The Pudding's implementation article) through the web reader. Twelve pages returned extractable text; Astro Lipi returned an internal fetch error twice. These notes record page structure and first-party statements. They do not establish exact fonts, dimensions, animation, hover behavior, sticky positioning, responsive behavior, contrast, or accessibility conformance. Nikolai's visual observations and browser inspection must remain separate evidence. Web extraction may show hidden or duplicated navigation alongside visible content.

## 1. Maggie Appleton — Garden History

[Source](https://maggieappleton.com/garden-history). Extracted page contains an essay title/subtitle, thematic tags, maturity status, created/updated wording, hierarchical table of contents, section headings, illustrations, captions, quotations, contextual links and inline explanatory notes. This supports studying layered reading: main narrative with optional context. The article itself advocates multiple thematic entry points and revisable writing; that philosophy is a reference, not a requirement to convert the studio into a digital garden. Text extraction cannot verify whether the contents collapses during scrolling or how notes/previews appear on hover.

## 2. The Pudding — homepage

[Source](https://pudding.cool/). The extracted homepage includes story search; Our Faves, Popular, Updating, Your Input, Video and Audio labels; numbered dated stories with short descriptions; RSS and social links. This supports a curated archive with several ways to discover material beyond chronological order. Sticky filters and a disappearing masthead require browser evidence. These labels describe The Pudding's editorial needs: they should not automatically become Dilum's categories or imply popularity data that does not yet exist.

## 3. The Pudding — scrollytelling implementation

[Source](https://pudding.cool/process/how-to-implement-scrollytelling/). The article explicitly distinguishes text blocks triggering visual state changes from keeping the graphic fixed within the relevant story segment. It compares six libraries and records a November 2017 update introducing Scrollama using IntersectionObserver. It explicitly excludes responsive solutions from its original demonstration. Keep as a historical explanation of the interaction pattern, not current library-selection advice or a ready mobile implementation. A future comparison should revisit current supported implementations before choosing tooling.

## 4. The Public Domain Review — Veronese's Dogs

[Source](https://publicdomainreview.org/essay/veroneses-dogs/). Page structure combines long prose, repeated artwork images, captions with source links, numbered notes and author biography/attribution. This supports a conventional illustrated essay with clear provenance. The extraction also includes donation/subscription material; adopting the reading layout does not imply adopting those interruptions. Exact image width and typography require visual inspection.

## 5. Works in Progress — The Housing Theory of Everything

[Source](https://worksinprogress.co/issue/the-housing-theory-of-everything/). The article exposes issue identity, three linked authors, publication date, substantial standfirst, section headings, inline evidence links, images and closing author biographies. It also contains subscription promotion, including an early newsletter insertion. This supports examining hierarchy, author attribution and a long essay broken into sections. It does not prove the article template lacks callouts merely because this example uses none. Font pairings, strict rules and mobile readability remain visual questions.

## 6. Distill — Activation Atlas

[Source](https://distill.pub/2019/activation-atlas/). The page contains a research title/summary, named authors and affiliations, publication date and DOI, sections, linked interactive examples, a full-screen atlas link, references and scholarly attribution. This supports rich explanatory publishing with optional deeper exploration. Relative figure widths and readability at each breakpoint require browser evidence. Its research apparatus is useful when warranted by an article; it need not burden every personal or product story.

## 7. Bartosz Ciechanowski — Bicycle

[Source](https://ciechanow.ski/bicycle/). The author's prose explicitly invites using sliders, restarting simulations, dragging elements, scrubbing time and comparing controlled variables. Sections build intuition incrementally and tie colored elements to their meaning in the explanation. This is strong evidence for purposeful exploratory components. The text does not establish that a side contents menu exists or is absent from every viewport/state; it only exposes section headings. The value is the explanation supported by an interaction, not mandatory animation in all posts.

## 8. Thinkmill — Blog

[Source](https://www.thinkmill.com.au/blog). The current extracted navigation is Services, Work, Open Source, Method, Blog, About, with service subgroups. The archive interleaves articles, newsletters, case studies, news, talks, screencasts and external work; entries expose type/date and sometimes reading time. The root agent's current browser inspection independently confirmed AI Solutions, Software teams, Client impact, Writing and Contact, matching Nikolai's description. The extractor and rendered page differ; do not conclude that the author's recollection is outdated. A first-party archive item describes this website as built with Astro, Markdoc and Content Collections, integrating Keystatic. This is a dated self-description, not a fresh audit of its complete present stack. Consistent transitions, breadcrumbs and shrinking header need visual evidence. Its service-led hierarchy should be adapted to Dilum's product focus.

## 9. Sanity — homepage

[Source](https://www.sanity.io/). Sanity presents a content platform: configurable Studio, structured content backend, media, releases, APIs and content operations. Extracted navigation groups Products, Solutions and Resources alongside Docs/Pricing; the body includes demonstrative editing/code interfaces and numbered feature sections. This clarifies what the company offers, while Nikolai's difficulty recognizing that offer remains valid usability feedback. Text alone cannot establish split-screen scrolling, sticky panels or transition consistency. This is a visual reference, not evidence to switch Dilum's CMS to Sanity.

## 10. Astro Lipi — Colour Schemes

[Requested source](https://astro-lipi.pages.dev/posts/colour-schemes/). The web reader returned an internal error on two attempts. No claim about current content, implementation or appearance is verified here. Preserve Nikolai's supplied assessment as author observation; do not call the entire site unavailable based on this tool failure. Browser inspection may provide the missing evidence.

## 11. Monograph — Writing Richer Tutorials with MDX Components

[Source](https://monograph.xocoweb.workers.dev/post/writing-richer-tutorials-with-mdx-components/). This page explicitly demonstrates Note/Tip/Important/custom callouts, tabbed code variants and syntax highlighting, and shows an abstract gradient hero with a credit. It states that posts can use MDX, components are Astro files, and code variants remain readable without JavaScript. This supports identifying its documentation-oriented block vocabulary. The user's dislike of its presentation is preference evidence, not a finding that MDX itself necessarily produces that appearance. Component capability and chosen visual styling are independent decisions.

## 12. AstroPaper — Dynamic OG Images

[Source](https://astro-paper.pages.dev/posts/dynamic-og-image-generation-in-astropaper-blog-posts/). The page contains update metadata, edit link, expandable contents label, technical headings/code, Caution and Caveats, sharing links, and previous/next posts. Its own subject is a developer feature, which contributes to the technical impression alongside presentation. Those mechanics can be evaluated separately: useful contents and social previews do not require reproducing its aesthetic. The existence of image-generation discussion is not evidence that this theme is the best platform for Dilum.

## 13. Gwern — Design of This Website

[Source](https://gwern.net/design). Gwern explicitly describes Markdown/static publishing, grayscale, sidenotes on wide screens, collapsible sections, link annotations/previews and Wikipedia-style icons/infoboxes. It acknowledges substantial implementation complexity and frames optional JavaScript as enhancements to core reading. This corroborates the feature vocabulary relevant to Nikolai's comparison with Wikipedia. The useful separable principle is optional context near the text; adopting the complete visual language or dense metadata is unnecessary. Exact interaction, responsiveness and current implementation details still require direct inspection rather than assuming this self-description is a complete live audit.

## Cross-source implications for the design brief

These are synthesis proposals, not new author preferences:

- Separate site navigation, archive discovery, article reading and optional explanatory components before choosing examples.
- Distinguish an editorial pull quote from a documentation warning/callout; a shared technical capability need not imply the same visual treatment.
- Treat contents, sidenotes and link previews as distinct controls. Keep core reading available when optional interactions are unavailable.
- Preserve narrative and meaningful images before adding scroll choreography. Scrollytelling belongs to a specific explanatory section with a clear purpose.
- Do not infer CMS requirements or a platform migration from a site's appearance. Thinkmill's first-party stack description demonstrates that Astro can host a richer editorial experience, but does not choose Dilum's editing workflow for us.
- Validate actual mobile behavior and light/dark rendering in the future prototype; these text sources do not supply that validation.
