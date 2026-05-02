# Changelog

## [0.0.2](https://github.com/tekumara/abctl/compare/v0.0.1...v0.0.2) (2026-05-02)


### Features

* **csv-import:** add category mapping to csv import ([e953489](https://github.com/tekumara/abctl/commit/e9534897b817c7ca662c90f01d0ac24a1dffdd11))
* **csv-import:** add CSV import command ([bbc6224](https://github.com/tekumara/abctl/commit/bbc62248fa08d316d3878cfed55f2d35ee36abdf))
* **csv-import:** flag to match ui importing of payee ([112ddc3](https://github.com/tekumara/abctl/commit/112ddc33e16a45ef76006d7a5e00f9478cc503b4))
* **csv-import:** switch to raw imported payee option ([ffd8b98](https://github.com/tekumara/abctl/commit/ffd8b98d1bafd8d3ce126442c34c1c48027d3982))
* **import-results:** show import updated preview table and summary stats ([6a66a12](https://github.com/tekumara/abctl/commit/6a66a123931dcfba755a9280eb1368e1a3c060b6))
* **st-george:** remove st-george import ([a0817a4](https://github.com/tekumara/abctl/commit/a0817a47f455efe311bffd36f295c549535ef82b))
* **transactions:** add --tsv output for transactions list ([708c395](https://github.com/tekumara/abctl/commit/708c3953dee5eee408b8241806320fea6e56fd70))
* **transactions:** add transactions list command ([26f598f](https://github.com/tekumara/abctl/commit/26f598f083510168a6b424f94c6c391b2a49ce87))
* **transactions:** add transactions listing and budget-format date parsing ([762bbdd](https://github.com/tekumara/abctl/commit/762bbdd6fa8c069090cca5e32f0dd86e466bea5d))


### Bug Fixes

* **csv-import:** keep unresolved csv categories for ui parity ([444cbe1](https://github.com/tekumara/abctl/commit/444cbe1fe4c5fece42418e7b72ac5dbc627993fc))
* **csv-import:** keep unresolved csv categories on final import, not just dry run ([82661e1](https://github.com/tekumara/abctl/commit/82661e1d5ff747d6a0940760b103d52402de8b40))
* **csv-import:** simplify CSV import and preview output ([5d74300](https://github.com/tekumara/abctl/commit/5d74300f4703d81aebf28b5ff68491cf19fd2158))
* handle \"Database is out of sync with migrations\" and null internal send errors ([00b24ee](https://github.com/tekumara/abctl/commit/00b24ee3812baeeef47da2567d05ad5518507404))
* **import:** show only non-ignored updated preview matches ([9c2926e](https://github.com/tekumara/abctl/commit/9c2926e1c28aa3809235ea2b6294a0a3424a0aea))

## [0.0.1](https://github.com/tekumara/abctl/compare/v0.0.0...v0.0.1) (2026-04-15)


### Features

* add make-transfer command with smoke tests ([19fe77f](https://github.com/tekumara/abctl/commit/19fe77f1c24c5939d3c236ce08f1946490c8a327))
* add QIF import command with smoke tests ([88cfe50](https://github.com/tekumara/abctl/commit/88cfe50dc9541564bfdf508c494129e3770a4b5a))
* add split flag for parent-category remainder ([571f6b7](https://github.com/tekumara/abctl/commit/571f6b7f68fcf511795c8a39f55de740dcf3bb23))
* add St.George transaction importer with tests ([dad3c6f](https://github.com/tekumara/abctl/commit/dad3c6f343ffaaa4d9e60c992503836ea4cef124))
* add uncategorized transactions command ([7ff7eba](https://github.com/tekumara/abctl/commit/7ff7eba66a72641ca11fcb824f38d82024a8b825))
* show last transaction date in account listings ([ad6b57b](https://github.com/tekumara/abctl/commit/ad6b57b4aeb4f96fcf5bcf07336edf7ee7bbeb90))
* support substring account matching for imports ([83d2f05](https://github.com/tekumara/abctl/commit/83d2f05f12fde5b8c23dbe8bb0156c1b0d5258f5))


### Bug Fixes

* correct split writes and add disposable-budget smoke test coverage ([e6897b6](https://github.com/tekumara/abctl/commit/e6897b6a95c617b9a0d22f6b8c27b873aac587fb))
* format budget dates in all CLI displays ([9e481d4](https://github.com/tekumara/abctl/commit/9e481d4ced52f42ba8db66e9fb9f8f2baeff765b))
* format transfer dry-run dates and output ([2c0e3b8](https://github.com/tekumara/abctl/commit/2c0e3b89d1bd64b765a2e369808dbb607397e119))
* resolve normalizeDateValue error in accounts command ([ef8ab4f](https://github.com/tekumara/abctl/commit/ef8ab4f371fc557d1ee1c48337324b0eb03c244e))


### Chores

* reimport St.George and NAB scripts ([37a5569](https://github.com/tekumara/abctl/commit/37a55699c2ce6394a0f21fb4aae72cbcbd557dba))


### Builds

* add release-please and publish workflows ([5e2b962](https://github.com/tekumara/abctl/commit/5e2b962bc03ef98fe949d34f09ffccd1334fb8ca))
