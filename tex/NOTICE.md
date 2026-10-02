# TeX Live 2024 files in tl2024/

The folder `tl2024/` holds the files of TeX Live 2024 that the vocabulary-list
template of `py/app.py` needs, taken from Tectonic's official TeX Live 2024
bundle (`texlive2024-0312`, sha256 of the bundle
`8fae742a1d9453fc3abfe7c6971363696f611ade1266c17788ccb5c18ffd1312`) by
`scripts/harvest_bundle.py`. They are redistributed unchanged under the free
licences of the TeX Live packages they come from, which are mainly,

- the LaTeX Project Public License 1.3c: the LaTeX kernel and its base classes
  and packages (`latex.ltx`, `article.cls`, `fontenc`, the encodings and font
  definitions), the LaTeX3 kernel (`expl3`, `l3backend-xetex`, `xparse`,
  `xtemplate`), the tools bundle (`array`, `longtable`), `fontspec`, `xeCJK`,
  `ctexhook`, `geometry`, `parskip`, `setspace`, `etoolbox`, `iftex`,
  `ifvtex`, `keyval`, `kvoptions`, `kvsetkeys`, `ltxcmds`, `atbegshi` and
  `atveryend`,
- the GUST Font License: the Latin Modern fonts (`lmroman*.otf`) and their
  font definitions,
- the Knuth licence: the Computer Modern metrics (`cm*.tfm`) and the LaTeX
  picture fonts (`line10`, `lcircle10`),
- the licences of the hyph-utf8 project (MIT and LPPL): the hyphenation
  patterns (`hyph-*`, `loadhyph-*`, `language.dat`),
- the Unicode License v3: `UnicodeData.txt`, `CaseFolding.txt`,
  `SpecialCasing.txt` and `GraphemeBreakProperty.txt`,
- the licences of xdvipdfmx and TeX Live's font maps (GPL and public
  domain): `pdftex.map`, `glyphlist.txt`, `pdfglyphlist.txt`,
  `texglyphlist.txt` and `ckx.map`.

The Tectonic format file (`tectonic-format-latex.tex`) is under the MIT
licence of Tectonic. The license of each package is listed in its CTAN entry
(https://ctan.org) and in the TeX Live sources
(https://tug.org/texlive/copying.html).
