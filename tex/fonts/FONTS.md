# Fonts

The fonts the teacher chooses from in Settings, as listed in `py/fonts.json`.
`scripts/vendor.mjs` downloads each one unmodified, checks it against its
sha256 and copies it, with this folder, into the app's `texbundle`. The
copyright lines are those of the fonts' name tables or, where these are
incomplete, of the fonts' own licence files. The fonts marked `"system"` in
`py/fonts.json` (Ku Mincho and Prison Gothic) are commercial and are not shipped:
the app uses the copy the teacher installed.

| Font | File, version | Copyright | Licence | Source |
| --- | --- | --- | --- | --- |
| I.Ming (明體) | `I.Ming-8.10.ttf`, Version 8.100 | Copyright © 2003-2024 I.Font Project; Information-technology Promotion Agency, Japan (IPA), 2011-2018. You must accept "http://ipafont.ipa.go.jp/ipa_font_license_v1.html" to use this product. | [IPA Font License Agreement 1.0](IPA-Font-License-1.0.md) | https://github.com/ichitenfont/I.Ming/releases/download/8.10/I.Ming-8.10.ttf |
| Noto Serif CJK HK (宋體) | `NotoSerifCJKhk-Regular.otf`, Version 2.003 | © 2017-2024 Adobe (http://www.adobe.com/). | [OFL 1.1](OFL-1.1.txt) | https://github.com/notofonts/noto-cjk/releases/download/Serif2.003/11_NotoSerifCJKhk.zip |
| Chiron Hei HK (黑體) | `ChironHeiHK-R.otf`, Version 2.609 | Copyright 2023-2026 Tamcy (https://github.com/chiron-fonts/chiron-hei-hk); based on Source Han Sans, Copyright 2014-2025 Adobe (http://www.adobe.com/) | [OFL 1.1](OFL-1.1.txt) | https://raw.githubusercontent.com/chiron-fonts/chiron-hei-hk/106b59c99e6164b26a11d46214a98dd68386b31a/STATIC_OTF/ChironHeiHK-R.otf |
| GenSenRounded TW (圓體) | `GenSenRounded2TW-R.otf`, Version 2.100 | Copyright 2014-2019 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'; rounded by But Ko (https://github.com/ButTaiwan/gensen-font) | [OFL 1.1](OFL-1.1.txt) | https://github.com/ButTaiwan/gensen-font/releases/download/v2.100/GenSenRounded2TW-otf.zip |
| JyunsaiKaai (楷書) | `JyunsaiKaai-Regular.ttf`, Version 0.031 | ItMarki (https://github.com/ItMarki/jyunsaikaai), from Klee One by Fontworks, Iansui by But Ko and LXGW WenKai TC by LXGW | [OFL 1.1](OFL-1.1.txt) | https://github.com/ItMarki/jyunsaikaai/releases/download/v0.3.1/JyunsaiKaai-Regular.ttf |
| Latin Modern Roman (serif) | `lmroman10-regular.otf`, Version 2.004 | Copyright 2003, 2009 B. Jackowski and J. M. Nowacki (on behalf of TeX users groups). This work is released under the GUST Font License -- see http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt for details. | GUST Font License | TeX Live 2024 (tex/tl2024/, see tex/NOTICE.md) |
| Andika (sans for beginning readers) | `Andika-Regular.ttf`, Version 7.000 | Copyright (c) 2004-2025 SIL Global | [OFL 1.1](OFL-1.1.txt) | https://github.com/silnrsi/font-andika/releases/download/v7.000/Andika-7.000.zip |
| Atkinson Hyperlegible (high-legibility sans) | `AtkinsonHyperlegible-Regular.ttf`, Version 1.006 | Copyright 2020 Braille Institute of America, Inc. | [OFL 1.1](OFL-1.1.txt) | https://raw.githubusercontent.com/google/fonts/66928797f271fed5ee428544e7229685e2d90127/ofl/atkinsonhyperlegible/AtkinsonHyperlegible-Regular.ttf |
| Source Sans 3 (sans) | `SourceSans3-Regular.otf`, Version 3.052 | © 2023 Adobe (http://www.adobe.com/), with Reserved Font Name ‘Source’ | [OFL 1.1](OFL-1.1.txt) | https://github.com/adobe-fonts/source-sans/releases/download/3.052R/OTF-source-sans-3.052R.zip |
| Source Serif 4 (serif) | `SourceSerif4-Regular.otf`, Version 4.005 | © 2014 - 2023 Adobe (http://www.adobe.com/), with Reserved Font Name ‘Source’. | [OFL 1.1](OFL-1.1.txt) | https://github.com/adobe-fonts/source-serif/releases/download/4.005R/source-serif-4.005_Desktop.zip |
