# Pedigree Editor Tools - Comprehensive Survey

*Compiled 2026-04-11*

---

## Summary

This report surveys pedigree drawing/editing software across open-source projects, academic tools, commercial products, and JavaScript libraries. Tools range from 1990s-era desktop applications to modern web-based editors with drag-and-drop interfaces.

---

## 1. Open-Source Web-Based Editors (Interactive / Drag-and-Drop)

### pedigreejs
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/ccge-boadicea/pedigreejs |
| **Demo** | https://ccge-boadicea.github.io/pedigreejs/ |
| **Language** | JavaScript (ES2015 modules), HTML |
| **Type** | Web app / JS library |
| **Stars** | 73 |
| **Forks** | 50 |
| **License** | GPL-3.0 |
| **Last updated** | Active (904 commits, v2.1.0) |
| **Paper** | Carver et al., *Bioinformatics* 34(6):1069-1071, 2018 |
| **Key features** | Interactive graphical editor, standard pedigree nomenclature, D3.js hierarchical layout, SVG rendering, undo/redo, JSON/BOADICEA/PED import, SVG/PNG export, no backend required (local browser storage), React example available |
| **Drag & drop** | Yes (interactive node placement and editing) |
| **Notes** | Well-established, published, actively maintained. Used by BOADICEA cancer risk tool. Good candidate for building upon. |

### Open Pedigree (PhenoTips)
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/phenotips/open-pedigree |
| **Language** | JavaScript (98%), CSS |
| **Type** | Web app |
| **Stars** | 55 |
| **Forks** | 30 |
| **License** | LGPL-2.1 |
| **Last updated** | Feb 2019 (97 commits) - **appears abandoned** |
| **Key features** | Complex families with consanguinity, node shading for disorders, family templates, automatic consanguinity detection, import PED/LINKAGE/GEDCOM/BOADICEA/GA4GH formats |
| **Stack** | Prototype.js, Raphael (SVG), Webpack, Docker support |
| **Drag & drop** | Yes |
| **Notes** | Feature-rich but uses legacy JS framework (Prototype.js). Not maintained since 2019. Forked by AEHRC for REDCap integration. |

### REDCap Pedigree Editor (AEHRC)
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/aehrc/redcap_pedigree_editor |
| **Language** | PHP (backend), JavaScript (frontend) |
| **Type** | REDCap external module |
| **Stars** | 10 |
| **Forks** | 3 |
| **License** | Not specified |
| **Last updated** | Dec 2024 |
| **Key features** | Builds on Open Pedigree, outputs GA4GH FHIR / Legacy FHIR / PED / PEDX formats, SNOMED-CT/HPO/OMIM terminology bindings, OAuth2 auth, SVG diagrams, data compression |
| **Notes** | Specialized for clinical research via REDCap. Active fork of Open Pedigree with FHIR integration. |

### DrawPed
| Attribute | Detail |
|-----------|--------|
| **URL** | https://www.genecascade.org/DrawPed/ |
| **Source** | https://git-ext.charite.de/genecascade/drawped |
| **Language** | Perl (backend), plain JavaScript (frontend, no libraries) |
| **Type** | Web app (also runs locally without server) |
| **License** | Open source |
| **Last updated** | 2024 (active) |
| **Paper** | *Nucleic Acids Research* 52(W1):W61, 2024 |
| **Key features** | Auto-draws from PED files, interactive editing, create from scratch, SVG output (publication-ready), handles deceased/consanguinity, works offline |
| **Drag & drop** | Partial (interactive editing, click-to-add) |
| **Notes** | Very recent publication (2024). Lightweight, no JS framework dependencies. From Charite Berlin. |

### QuickPed
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/magnusdv/quickped |
| **Live app** | https://magnusdv.shinyapps.io/quickped |
| **Language** | R (96%), CSS, HTML |
| **Type** | Web app (R Shiny) |
| **Stars** | 31 |
| **Forks** | 3 |
| **License** | GPL-3.0 |
| **Last updated** | Apr 2024 (v3.2.0) |
| **Paper** | *BMC Bioinformatics* 2022 |
| **Key features** | Click-to-build pedigrees, relatedness coefficient calculations, .ped export, image export, R code generation, built-in templates (Habsburg, Tutankhamun, Queen Victoria), verbal relationship descriptions |
| **Stack** | R Shiny, pedsuite, kinship2, ribd |
| **Drag & drop** | No (click-based interface) |
| **Notes** | Research-oriented. Great for analysis (coefficients, IBD) but not a clinical pedigree editor. |

### genoDraw
| Attribute | Detail |
|-----------|--------|
| **URL** | Not publicly available (research prototype) |
| **Language** | Web-based (details not public) |
| **Type** | Web app |
| **Paper** | Garcia Giordano et al., AMIA 2019 Annual Symposium; PMC7153108 |
| **Key features** | Standardized NSGC nomenclature, biomedical vocabulary integration (HPO, OMIM, SNOMED-CT), graph-based 3-step diagram generation, interactive editing |
| **Notes** | Academic prototype emphasizing vocabulary integration. May not be publicly accessible. |

### HaploForge
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/mtekman/haploforge |
| **Language** | JavaScript (HTML5, KineticJS) |
| **Type** | Web app |
| **License** | GPL-3.0 |
| **Last updated** | 2017 (paper); KineticJS dependency frozen since 2014 — **likely unmaintained** |
| **Paper** | Tekman et al., *Bioinformatics* 33(24):3871, 2017 |
| **Key features** | Haplotype visualization on pedigrees, IBD coloring via A* search, drag-and-drop pedigree construction, handles >2000 individuals, LINKAGE format import/export, recombination point navigation, haplotype consistency scoring |
| **Drag & drop** | Yes (constrained — mated pairs move as a unit; construction-time only, not post-layout repositioning) |
| **Notes** | Primary purpose is haplotype visualization, not clinical pedigree editing. Pedigree drawing is a prerequisite step for loading haplotype data. Web-based successor to HaploPainter; correctly handles X-linked haplotypes where HaploPainter does not. Not a clinical pedigree editor. |

---

## 2. Command-Line / Batch Processing Tools

### Madeline 2.0 PDE
| Attribute | Detail |
|-----------|--------|
| **URL** | https://madeline.med.umich.edu/madeline/ |
| **Source** | https://sourceforge.net/projects/madeline2/ |
| **Language** | C++ |
| **Type** | CLI tool |
| **License** | GPL |
| **Paper** | Trager et al., *Bioinformatics* 23(14):1854-1856, 2007 |
| **Key features** | Batch/automated pedigree drawing, SVG output, handles large complex pedigrees, emphasis on aesthetics/readability, no user interaction needed, consanguinity support |
| **Drag & drop** | No (batch processing) |
| **Notes** | Well-cited classic tool. Best for automated/batch processing of large datasets. Includes a comparison page of pedigree tools. Older but still referenced. |

### CraneFoot
| Attribute | Detail |
|-----------|--------|
| **Language** | C++ |
| **Type** | CLI tool |
| **Paper** | *High-throughput pedigree drawing* (ResearchGate) |
| **Key features** | Automated drawing using linear node positioning, designed for high-throughput classification of genetically interesting families from large datasets |
| **Drag & drop** | No |
| **Notes** | Designed for large-scale automated screening. Less focus on interactive editing. |

### HaploPainter
| Attribute | Detail |
|-----------|--------|
| **Language** | Perl |
| **Type** | Desktop app / CLI |
| **Paper** | Thiele & Nurnberg, *Bioinformatics* 2004 (PubMed: 15377505) |
| **Key features** | Haplotype visualization on pedigrees, works with linkage program output, haplotype compression, marker section cut-out |
| **Drag & drop** | No |
| **Notes** | Specialized for haplotype visualization in Mendelian disease gene mapping. Niche but well-cited. |

### ped_draw
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/mvelinder/ped_draw |
| **Web app** | https://peddraw.github.io |
| **Language** | Python (99%) |
| **Type** | CLI tool + web app |
| **Stars** | 24 |
| **Forks** | 3 |
| **License** | MIT |
| **Last updated** | Jan 2020 |
| **Paper** | Velinder et al., *BMC Bioinformatics* 2020 |
| **Key features** | Reads standard PED files, uses Graphviz for layout, outputs PNG/SVG/PDF, web interface for file upload, multi-generational support |
| **Limitations** | No single-parent support, no twins, no genotype embedding |
| **Drag & drop** | No |

### Pedigree (minorninth)
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/minorninth/pedigree |
| **Language** | JavaScript (61%), Python (34%) |
| **Type** | CLI + web demo |
| **Stars** | 5 |
| **Forks** | 5 |
| **License** | GPL-3.0 |
| **Last updated** | May 2017 - **abandoned** |
| **Key features** | Auto-generates pedigree PDFs, no manual layout needed |
| **Notes** | Requires old GhostScript (8.54) and matplotlib (1.5.1). Compatibility issues with modern environments. |

---

## 3. R / Bioconductor Packages

### kinship2
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/mayoverse/kinship2 |
| **CRAN** | https://cran.r-project.org/package=kinship2 |
| **Language** | R |
| **Stars** | 17 |
| **Forks** | 6 |
| **Last updated** | May 2023 |
| **Key features** | Pedigree S3 class, kinship matrix calculation, pedigree plotting (genetics counselor standards), handles inbreeding/MZ twins/X-linked, pedigree shrinking |
| **Notes** | Foundation package used by many other tools (QuickPed, Pedixplorer, ggped). Standard for R-based pedigree work. |

### Pedixplorer
| Attribute | Detail |
|-----------|--------|
| **URL** | https://bioconductor.org/packages/release/bioc/html/Pedixplorer.html |
| **Web app** | https://pedixplorer.univ-rennes.fr |
| **Language** | R (S4 classes) |
| **Paper** | *Bioinformatics* 41(6), 2025 |
| **Key features** | Builds on kinship2 with Bioconductor standards, Shiny web app, pedigree filtering/trimming, customizable visualization, proband selection, large complex pedigree support |
| **Notes** | Most modern R pedigree package (2025). Successor to kinship2 with S4 OOP and Bioconductor integration. |

### pedsuite
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/magnusdv/pedsuite |
| **Language** | R |
| **Key features** | Collection of R packages for pedigree analysis: pedtools, ribd, pedprobr, forrel, etc. Powers QuickPed. |

---

## 4. JavaScript / TypeScript Libraries (for building custom editors)

### family-chart (donatso)
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/donatso/family-chart |
| **Language** | TypeScript (83%), JavaScript, CSS |
| **Type** | JS library |
| **Stars** | 712 |
| **Forks** | 213 |
| **License** | MIT |
| **Last updated** | Nov 2024 |
| **Key features** | D3.js-based, interactive zoom/pan, customizable styling, framework-agnostic (React/Vue/Angular/Svelte/vanilla), TypeScript support, SVG+HTML card components, visual builder tool |
| **Premium** | Paid version with kinship engine, filtering, performance optimizations |
| **Notes** | Most popular JS family tree library by stars. General-purpose (not genetics-specific) but highly flexible. Could be adapted for genetic pedigrees. |

### d3-pedigree-examples
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/justincy/d3-pedigree-examples |
| **Language** | HTML (97%), JavaScript |
| **Type** | Example code / reference |
| **Stars** | 231 |
| **Forks** | 63 |
| **License** | MIT |
| **Key features** | D3 v3 pedigree examples: static, expandable/collapsible, animated, bidirectional ancestor/descendant, text wrapping |
| **Notes** | Reference implementations, not a library. Good starting point for D3-based pedigree development. Uses D3 v3 (outdated). |

### react-pedigree
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/Shaun2D2/react-pedigree |
| **Language** | JavaScript (90%), CSS |
| **Type** | React component |
| **Stars** | 1 |
| **License** | MIT |
| **Last updated** | Apr 2019 - **abandoned** |
| **Notes** | Minimal React wrapper. Not production-ready. |

### webtrees-pedigree-chart
| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/magicsunday/webtrees-pedigree-chart |
| **Language** | JavaScript |
| **Stars** | 56 |
| **Last updated** | Apr 2026 (active) |
| **Key features** | SVG pedigree chart module for webtrees genealogy app, D3.js, multiple layouts, up to 25 generations |
| **Notes** | Genealogy-focused (not genetics/clinical). |

---

## 5. Commercial / Proprietary Tools

### Progeny
| Attribute | Detail |
|-----------|--------|
| **URL** | https://progenygenetics.com/ |
| **Type** | Web app (SaaS) |
| **Est.** | 1996 |
| **Users** | 800+ genetics institutions |
| **Key features** | Manual draw or auto-generate pedigrees, patient questionnaires, import Excel/XML/Cyrillic FAM, risk assessments, EHR integration, HIPAA compliant, secure collaboration |
| **Drag & drop** | Yes |
| **Cost** | Commercial subscription |
| **Notes** | Industry leader for clinical genetics. Most widely used commercial pedigree tool. |

### TrakGene
| Attribute | Detail |
|-----------|--------|
| **URL** | https://www.trakgene.com/ |
| **Type** | Web app (SaaS) |
| **Key features** | Drag-and-drop pedigree builder, auto-generate from family history, HPO phenotyping integration, genomic health records, variant management |
| **Drag & drop** | Yes |
| **Cost** | Commercial |
| **Notes** | Modern clinical platform with integrated genomic tools. |

### FamGenix
| Attribute | Detail |
|-----------|--------|
| **URL** | https://famgenix.com/ |
| **Type** | Web app (SaaS, cloud or on-premise) |
| **Key features** | Comprehensive pedigree module, risk assessment (BOADICEA v6, Tyrer-Cuzick v8, BayesMendel, Gail, Claus, QRISK3), NCCN/ACMG guideline integration, patient questionnaire, consanguinity/same-sex/donor support, free tier for clinicians |
| **Drag & drop** | Yes |
| **Cost** | Commercial (free tier available) |
| **Notes** | Strong risk assessment integration. Free pedigree tools available for genetic counseling programs. |

### Cyrillic (CJC Pedigree Software)
| Attribute | Detail |
|-----------|--------|
| **URL** | https://clinicalpedigree.com/ / https://www.apbenson.com/about-cyrillic |
| **Type** | Desktop (Windows) |
| **Est.** | 1990s |
| **Versions** | v2.1.3 (research/haplotyping), v3.0.400 (clinical) |
| **Key features** | Pedigree drawing, haplotyping, linkage work support |
| **Cost** | Commercial |
| **Notes** | Historic - once the most widely used genetics pedigree program. Largely superseded by web-based tools. |

### PedigreeTool
| Attribute | Detail |
|-----------|--------|
| **URL** | https://pedigreetool.com/ |
| **Type** | Web app |
| **Status** | Research version available; Clinical License launching later 2026 |
| **Key features** | NSGC 2022 nomenclature (sex/gender inclusive), drag-and-drop canvas, color-coded disease status, carriers, annotations, consanguinity, twins, multiplets, export PDF/SVG/PNG/JSON/PED/CSV |
| **Drag & drop** | Yes |
| **Cost** | Free (research); Commercial (clinical, coming 2026) |
| **Notes** | New entrant with modern NSGC standards. Not fully launched yet. |

### FastFamilyTree
| Attribute | Detail |
|-----------|--------|
| **URL** | https://fastfamilytree.com/ |
| **Type** | Web app |
| **Key features** | NSGC 2022 standards, browser-based, no PHI stored, free and secure |
| **Drag & drop** | Unknown |
| **Cost** | Free |
| **Notes** | Built by a genetic counsellor. Focused on simplicity and privacy. |

### f-tree / f-treeGC
| Attribute | Detail |
|-----------|--------|
| **URL** | https://holonic-systems.com/f-tree/en/ |
| **Type** | Desktop (Windows/macOS) + iOS app |
| **Paper** | *BMC Medical Genetics* 2017 |
| **Key features** | Questionnaire-based auto-generation, up to 3 generations (GC version), suitable for genome cohort studies, developed with Iwate Medical University |
| **Cost** | Commercial |
| **Notes** | Japanese origin. Designed for genetic counseling workflows and large cohort studies. iOS app available. |

### Genial Pedigree Draw
| Attribute | Detail |
|-----------|--------|
| **URL** | https://www.pedigreedraw.com/ |
| **Type** | Desktop / Web |
| **Key features** | Click-and-drag building, automatic layout optimization |
| **Cost** | Commercial |

---

## 6. Historic / Legacy Tools

### Pelican
| Attribute | Detail |
|-----------|--------|
| **Paper** | Dudbridge et al., *Bioinformatics* 20(14):2327, 2004 |
| **Language** | Java |
| **Type** | Desktop app (Java Web Start) |
| **Key features** | Graphical pedigree editor for linkage analysis file creation, runs on any Java-enabled machine |
| **Status** | Legacy - Java Web Start deprecated |

### PediDraw
| Attribute | Detail |
|-----------|--------|
| **Paper** | *ResearchGate* publication |
| **Type** | Web tool |
| **Key features** | Web-based pedigree drawing for genetic counseling |
| **Status** | Legacy |

---

## 7. Comparison Matrix

| Tool | Type | Language | Drag & Drop | Open Source | Active | Stars | Paper | Clinical Use |
|------|------|----------|-------------|-------------|--------|-------|-------|-------------|
| **pedigreejs** | Web lib | JS/D3 | Yes | GPL-3 | Yes | 73 | 2018 | Yes |
| **Open Pedigree** | Web app | JS | Yes | LGPL-2.1 | No (2019) | 55 | - | Yes |
| **DrawPed** | Web app | Perl/JS | Partial | Yes | Yes | - | 2024 | Yes |
| **QuickPed** | Web app | R/Shiny | No | GPL-3 | Yes | 31 | 2022 | Research |
| **family-chart** | JS lib | TS/D3 | Yes | MIT | Yes | 712 | - | No (general) |
| **Madeline 2.0** | CLI | C++ | No | GPL | No | - | 2007 | Research |
| **ped_draw** | CLI+web | Python | No | MIT | No (2020) | 24 | 2020 | Research |
| **Pedixplorer** | R pkg | R | No | Yes | Yes | - | 2025 | Research |
| **kinship2** | R pkg | R | No | Yes | Partial | 17 | - | Research |
| **Progeny** | SaaS | Proprietary | Yes | No | Yes | - | - | Yes |
| **TrakGene** | SaaS | Proprietary | Yes | No | Yes | - | - | Yes |
| **FamGenix** | SaaS | Proprietary | Yes | No | Yes | - | - | Yes |
| **PedigreeTool** | Web app | Proprietary | Yes | No | Yes | - | - | Coming 2026 |
| **FastFamilyTree** | Web app | Proprietary | ? | No | Yes | - | - | Yes |
| **f-tree** | Desktop+iOS | Proprietary | ? | No | Yes | - | 2017 | Yes |
| **Cyrillic** | Desktop | Proprietary | Yes | No | Legacy | - | - | Yes |
| **HaploForge** | Web app | JS/HTML5 | Yes (constrained) | GPL-3 | No (2017) | - | 2017 | Research |
| **HaploPainter** | CLI | Perl | No | Yes | No | - | 2004 | Research |
| **Pelican** | Desktop | Java | Yes | Yes | No | - | 2004 | Research |

---

## 8. Commercial Deep Dive: Why People Pay

### Progeny (est. 1996, acquired by Ambry Genetics 2015)

**Pricing:** $2,500 flat rate (one-time) for clinical; free cloud tier available with limited features.
**Users:** 800+ genetics institutions worldwide. **Rating:** 5.0/5 on Capterra (3 reviews).

**What you get for paying:**
- One-click pedigree drawing + auto-generation from patient questionnaires
- Patient-entered data auto-populates pedigrees (mobile-friendly intake forms)
- NSGC-compliant symbol set with auto-updating legend
- Import from Excel, XML, delimited text, Cyrillic FAM files
- Saved format templates for switching between display views
- SmartDraw auto-formatting for dimensional consistency
- Integrated risk assessment models (real-time, updated as family history evolves)
- Direct Ambry genetic test ordering with pre-populated requisitions + result tracking
- VUS reclassification alerts and reanalysis notifications
- Specialty-specific letter templates (auto-populated from questionnaire data)
- EHR integration, SSO, HIPAA/GDPR compliant
- Role-based permissions, encrypted storage

**User complaints (from Capterra reviews):**
- "This software does not have everything. It doesn't let us enter everything as we would like"
- "There is also no way to make small changes that involve moving family members around"
- Complex features lack intuitiveness for advanced relationship mapping
- Technical support friction

**Key insight:** Even at $2,500, users complain about inflexible layout and inability to manually reposition individuals - the same core complaint as open-source tools.

### TrakGene

**Pricing:** Per-user per-year subscription (specific pricing not public; requires consultation).
**Users:** NIH, University Hospital Southampton NHS, Helsinki University Hospital, NSW Health, Geisinger.

**What you get for paying:**
- Intuitive drag-and-drop pedigree builder ("developed with clinicians for clinicians")
- Automated pedigree generation from family history data
- HPO (Human Phenotype Ontology) integration for phenotyping
- Integrated cancer risk assessment tools
- Genomic health record platform (pedigree is one module of a larger clinical system)
- Patient engagement portal for pre-visit data collection
- Variant management capabilities
- Cloud-based, HIPAA-compliant
- Inclusive pedigree design (gender/sex representation)

**Key insight:** TrakGene's moat is the broader clinical platform - pedigree is just one component of a genomic health record system. You're buying an ecosystem, not just a drawing tool.

### FamGenix

**Pricing:** Free tier (50 pedigrees, Gail+Claus risk only), Individual $500/year (unlimited pedigrees), Premium tiered pricing (advanced risk models + multi-user). EHR integration, custom branding, API access are additional fees.
**Notable:** Leadership includes former co-founders/CEOs of Progeny with 25 years experience.

**What you get for paying:**
- Fast pedigree creation with **manual repositioning** ("move individuals freely and customize the pedigree as desired")
- Complex relationships: consanguinity, same-sex partnerships, donor/surrogate
- Toggle display options: B&W symbols, hide partners/unaffected, show/hide diseases, notes, genetic testing data, names, ancestry
- Built-in medical ontology (HPO, OMIM, CHV, NCI, HGNC gene designations)
- **Run ALL cancer risk models simultaneously** with single click: BOADICEA v6, Tyrer-Cuzick v8, BayesMendel (BRCAPRO, MMRpro, MelaPRO, PancPRO), Gail, Claus, QRISK3
- Automated NCCN/ACMG guideline criteria detection with reasons displayed
- Import pedigrees from other software (including Progeny)
- Patient-facing mobile app for family history self-reporting
- Cloud or on-premise deployment; regional hosting (US/Canada/UK-EU/Australia)
- Custom questionnaires (pre-appointment or clinician-only)
- Query/filter patients, export to multiple formats

**Key insight:** FamGenix is the most feature-complete for the pedigree drawing itself (manual repositioning, toggle visibility), and the most aggressive on risk model breadth. The free tier at 50 pedigrees is genuinely useful for small practices.

### Why People Pay - Summary

| Reason | Progeny | TrakGene | FamGenix |
|--------|---------|----------|----------|
| Auto-generate from patient questionnaire | Yes | Yes | Yes |
| Integrated risk assessment | Yes | Yes | Yes (most models) |
| EHR integration | Yes | Yes | Add-on |
| Genetic test ordering/tracking | Yes (Ambry) | Partial | No |
| HIPAA/GDPR compliance | Yes | Yes | Yes |
| Patient-facing app/portal | Yes | Yes | Yes |
| Manual node repositioning | **No** | Unknown | **Yes** |
| NSGC nomenclature | Yes | Yes | Yes |
| Ontology integration (HPO/OMIM) | Partial | Yes (HPO) | Yes (HPO+OMIM+NCI+CHV) |
| Letter/report templates | Yes | Unknown | Partial |
| Multi-user / role-based access | Yes | Yes | Premium |
| VUS reclassification alerts | Yes | Unknown | No |
| Import from legacy tools | Yes (Cyrillic) | Unknown | Yes (Progeny) |

**The real reasons people pay are not about pedigree drawing.** They pay for:
1. **Patient intake automation** - questionnaires that auto-populate pedigrees
2. **Risk assessment integration** - BOADICEA, Tyrer-Cuzick etc. right next to the pedigree
3. **Clinical workflow** - test ordering, result tracking, letter generation, EHR integration
4. **Compliance** - HIPAA, GDPR, encrypted storage, audit trails
5. **Institutional support** - SSO, role-based access, enterprise deployment

The pedigree drawing itself is table stakes. Even Progeny users complain it can't reposition nodes.

---

## 9. Requirements by Availability: What Exists, What You Pay For, What's Missing

For each requirement, we note where people asked for it (source) and who can do it today.

Legend: **OS** = open-source tool, **$$** = commercial only, **--** = nobody does this.

---

### TIER 1: Available in Open Source (free, today)

These requirements are met by at least one open-source tool. A new solution needs to match these as table stakes.

#### Drawing & Editing Basics

| # | Requirement | Who does it (OS) | Notes |
|---|------------|-----------------|-------|
| 1 | **Basic pedigree drawing** (add individuals, define relationships, affected status) | pedigreejs, Open Pedigree, DrawPed, QuickPed | All handle standard 3-generation clinical pedigrees |
| 2 | **Standard NSGC pedigree symbols** (squares, circles, diamonds, shading, proband arrow, deceased slash) | pedigreejs, Open Pedigree, DrawPed | pedigreejs explicitly uses "standard pedigree nomenclature" |
| 3 | **Interactive graphical editing** (click to add/edit individuals and relationships in browser) | pedigreejs, Open Pedigree | DrawPed has partial interactive editing (click-to-add, not drag) |
| 4 | **SVG export** for publication / hand-editing in Inkscape/Illustrator | pedigreejs, Open Pedigree, DrawPed, Madeline 2.0, ped_draw, QuickPed | Almost universal. SVG is the standard output format |
| 5 | **PNG export** | pedigreejs, DrawPed, ped_draw, QuickPed | Common alongside SVG |
| 6 | **Undo / redo** | pedigreejs, Open Pedigree | Source: pedigreejs paper |
| 7 | **Consanguinity** (double lines between related parents) | pedigreejs, Open Pedigree, DrawPed, Madeline 2.0 | All support basic consanguinity. Complex nested loops remain problematic (see Tier 3) |
| 8 | **Twins** (monozygotic and dizygotic notation) | Open Pedigree, pedigreejs | PhenoTips docs confirm twin support |
| 9 | **Multiple spouses** | Open Pedigree, pedigreejs | Source: PhenoTips docs, pedigreejs paper |
| 10 | **PED file import** | DrawPed, pedigreejs, ped_draw, QuickPed | DrawPed is "the only free web-based tool with working PED file import AND export" |
| 11 | **PED file export** | DrawPed, QuickPed | ped_draw and pedigreejs import only, cannot export. Source: QuickPed paper |
| 12 | **JSON data format** | pedigreejs, Open Pedigree | Native storage format for both |
| 13 | **BOADICEA format import** | pedigreejs | Used by the BOADICEA cancer risk tool. Source: pedigreejs paper |
| 14 | **Automated batch layout** (CLI, no user interaction needed) | Madeline 2.0, ped_draw, CraneFoot | Best for high-throughput / large datasets. Source: Madeline paper |
| 15 | **Large pedigree support** (hundreds of individuals) | Madeline 2.0, Pedigraph | Madeline explicitly designed for this; hybrid cyclic/acyclic algorithm. Source: Madeline paper |
| 16 | **Web-based** (no install required, works in browser) | pedigreejs, DrawPed, QuickPed, Open Pedigree | Key for healthcare environments with installation restrictions. Source: DrawPed paper |
| 17 | **Works offline / locally** | DrawPed (can run without web server), Madeline (CLI) | DrawPed "does not require a web server to create pedigree charts from pedigree files" |
| 18 | **Grouped sibling nodes** (single symbol with "n" for n siblings of same sex/status) | Open Pedigree | PhenoTips: "create a group of siblings of the same gender with the same clinical description." Only confirmed open-source tool with this |
| 19 | **Adoption, donor, pregnancy, pregnancy loss notation** | Open Pedigree | PhenoTips: "captures adoption, donors, childfree couples, fertility status, pregnancy, pregnancy loss and termination" |
| 20 | **Pedigree shrinking** (programmatically remove uninformative individuals) | Pedixplorer, kinship2 (R) | `shrink()` function removes subjects by priority order. Source: kinship2 docs, Pedixplorer paper |
| 21 | **Relatedness coefficients** (kinship, IBD, inbreeding) | QuickPed, kinship2, Pedixplorer | QuickPed: only online tool offering relatedness analysis. Source: QuickPed paper |
| 22 | **GA4GH FHIR pedigree format** | Open Pedigree (AEHRC fork) | REDCap pedigree editor exports GA4GH FHIR. Source: AEHRC GitHub |
| 23 | **R code generation** (reproducible pedigree for analysis) | QuickPed | Unique feature: generates R code to reproduce pedigree in pedsuite. Source: QuickPed docs |
| 24 | **Haplotype visualization** | HaploPainter | Niche but well-cited. Haplotype compression, marker section cut-out. Source: HaploPainter paper |

#### What open source does NOT do well (even when technically present)

- Layout quality drops sharply with complex/large pedigrees
- No drag-and-drop repositioning of individual nodes in most tools
- Very few tools combine interactive editing + standard nomenclature + good export
- pedigreejs is the closest to "good enough" but requires JS expertise to deploy and customize
- Open Pedigree is feature-rich but abandoned (2019) and built on legacy Prototype.js

---

### TIER 2: Commercial Only (you pay for these)

These are the features that push clinical genetics teams to Progeny ($2,500), TrakGene (per-user/year), or FamGenix ($500/year+). Open-source tools don't offer them.

| # | Requirement | Who does it | Why people pay | Source |
|---|------------|------------|---------------|--------|
| 25 | **Patient-facing intake questionnaires** that auto-populate pedigrees | Progeny, TrakGene, FamGenix | "Patient-entered data auto-populates pedigrees." Reduces counselor time by up to 93%. Patients complete family history on mobile before visit. | Progeny docs, PhenoTips blog, PediDraw paper |
| 26 | **Integrated cancer risk assessment** (BOADICEA v6, Tyrer-Cuzick v8, BayesMendel, Gail, Claus, QRISK3) | FamGenix (all models, single click), Progeny, TrakGene | Risk models run directly against pedigree data in real-time. FamGenix: "run ALL cancer risk assessment models simultaneously." | FamGenix provider portal |
| 27 | **Automated clinical guideline detection** (NCCN, ACMG/NSGC) | FamGenix, Progeny | "Auto-identifies high risk patients that meet criteria for further genetic counseling or testing" with reasons displayed. | FamGenix docs |
| 28 | **EHR / EMR integration** | Progeny, TrakGene, FamGenix (add-on) | Pedigree accessible within electronic health record. SSO, role-based access. | Progeny clinical docs, genetic counselor HIT survey (PMC8290863) |
| 29 | **Genetic test ordering & tracking** | Progeny (direct Ambry ordering) | Pre-populated requisitions, trio testing, order tracking, automated result delivery. | Progeny clinical docs |
| 30 | **VUS reclassification alerts** | Progeny | Automatic notifications when variant classifications change. | Progeny clinical docs |
| 31 | **Clinical letter/report templates** | Progeny, FamGenix (partial) | Specialty-specific templates auto-populated from questionnaire data. | Progeny docs |
| 32 | **Manual node repositioning** (drag individuals to custom positions) | FamGenix ("move individuals freely") | Progeny users specifically complain: "there is no way to make small changes that involve moving family members around." FamGenix is the only confirmed tool with this. | Capterra review, FamGenix provider portal |
| 33 | **Toggle display filters** (hide/show: partners, unaffected, specific diseases, names, genetic testing, ancestry) | FamGenix | Selective visibility without modifying underlying data. | FamGenix provider portal |
| 34 | **HPO phenotyping** integrated into pedigree | TrakGene, FamGenix (HPO + OMIM + NCI + CHV) | Standardized phenotype terms attached to individuals. genoDraw paper: "none of the [open-source] systems support annotation of diseases as terms from biomedical vocabularies." | TrakGene docs, genoDraw paper (AMIA 2019) |
| 35 | **Import from legacy commercial tools** (Cyrillic FAM, Progeny format) | Progeny (Cyrillic), FamGenix (Progeny) | Migration path from legacy systems. | Progeny docs, FamGenix docs |
| 36 | **HIPAA/GDPR compliance with encrypted storage** | Progeny, TrakGene, FamGenix | Required for clinical environments. Open-source tools store data locally (browser storage) with no compliance guarantees. | All three commercial platforms |
| 37 | **Multi-user access with role-based permissions** | Progeny, TrakGene, FamGenix (premium) | Institutional deployment with audit trails. | Progeny docs |
| 38 | **Saved pedigree views / format templates** | Progeny | Multiple views of the same pedigree with different display settings. Switch between views with saved templates. | Progeny docs |
| 39 | **Auto-updating legend** | Progeny | Legend automatically shows only the symbols used in current pedigree. | Progeny pedigree docs |
| 40 | **Variant management** | TrakGene | Part of broader genomic health record platform. | TrakGene docs |
| 41 | **Regional data hosting** (US, Canada, EU/UK, Australia) | FamGenix | Data sovereignty compliance for different jurisdictions. | FamGenix licensing page |
| 42 | **White-label / embeddable modules** | FamGenix | "Plug-and-play modules" for embedding into existing clinical systems. | FamGenix docs |
| 43 | **Custom questionnaires** (cancer risk, lifestyle, custom data) | FamGenix, Progeny | Pre-appointment or clinician-only surveys. | FamGenix provider portal |

---

### TIER 3: Nobody Does This (manual workaround territory)

These are requirements where people are forced to draw by hand, use PowerPoint/Illustrator/Inkscape, or simply give up. **This is where a new tool can differentiate.**

Each item cites where people complained about it.

#### Layout Problems

| # | Requirement | What people do instead | Source |
|---|------------|----------------------|--------|
| 44 | **Non-linear layout** (U-shape, horseshoe, wrapped, radial) to fit large families on one page | Export SVG, manually rearrange in Inkscape/Illustrator. Or compress/crop and accept information loss. | Your colleague's workflow; journal figure size constraints (Nature max 18x24cm, Cell max 6.5x8in) |
| 45 | **Drag-and-drop repositioning in open-source tools** | FamGenix does this commercially. Open-source: export SVG, edit in vector tool. Progeny users complain: "no way to make small changes that involve moving family members around." | Capterra Progeny reviews, DrawPed FAQs ("no ability to manually move individuals") |
| 46 | **Deterministic, stable layout** | DrawPed renders same pedigree at different widths on refresh. Users re-render until they get an acceptable result. | DrawPed FAQs |
| 47 | **Fit-to-page with intelligent layout** (not just scaling/shrinking, but actually reorganizing the layout to fit a target page size) | Progeny has "Fit to Page" but it just scales. Users manually split across pages or accept tiny text. | Progeny docs, Capterra reviews |

#### Complex Structure Problems

| # | Requirement | What people do instead | Source |
|---|------------|----------------------|--------|
| 48 | **Nested consanguinity loops** without overlapping lines | Tools "resort to acyclic graphs" which misrepresent the structure. Users draw manually or accept crossed lines. | DrawPed paper, Madeline 2.0 paper, DrawPed FAQs |
| 49 | **Cross-generational matings** (e.g. uncle-niece) with correct alignment | All open-source tools "struggle with cross-generational matings and their alignment is disrupted." Manual drawing in vector editors. | QuickPed paper, Madeline comparison page |
| 50 | **Backcrossing / recurrent parents** | DrawPed: "cannot (yet) draw backcrossing." Not supported anywhere else either. Users draw manually. Common need in animal breeding. | DrawPed FAQs |
| 51 | **Half-sibling positioning** across multiple partnerships | Tools produce tangled layouts. Users manually adjust in vector editors. | ResearchGate forum threads, DrawPed FAQs |

#### Collapsing & De-identification

| # | Requirement | What people do instead | Source |
|---|------------|----------------------|--------|
| 52 | **Arbitrary branch collapsing** (collapse any subtree into a single "n individuals" node, not just same-sex siblings) | Draw the collapsed node manually in Illustrator/Inkscape. No tool supports collapsing non-sibling groups or entire branches. | Your colleague's workflow |
| 53 | **De-identification for publication** while preserving genetic structure | Remove identifying info manually. kinship2 `shrink()` removes people entirely rather than anonymizing them. Some papers omit sex of unaffected members. | Pedixplorer paper, ethical guidelines for pedigree research |
| 54 | **Expand/collapse interaction** (click to expand a collapsed group, click to collapse a branch) | Not available in any tool. This is a UI pattern from tree views but not applied to pedigrees. | -- |

#### Annotation & Display

| # | Requirement | What people do instead | Source |
|---|------------|----------------------|--------|
| 55 | **Multiple traits/conditions in one pedigree** with distinct shading | DrawPed: "cannot display two different traits simultaneously." Users create separate diagrams or add shading manually. | DrawPed FAQs |
| 56 | **Carrier indication** (dot in symbol for heterozygous carriers) in all tools | DrawPed doesn't support it. Users add carrier dots manually in vector editors. | DrawPed FAQs |
| 57 | **Age-based sibling ordering** | DrawPed sorts children by ID only, not by age. Users manually reorder. | DrawPed FAQs |

#### Biological Sex Edge Cases

| # | Requirement | What people do instead | Source |
|---|------------|----------------------|--------|
| 58 | **Disorders of sex development (DSD) / intersex representation** | Diamond symbol (sex unknown) is the only option. No tool supports nuanced DSD notation (e.g. 46,XY DSD with female phenotype). Users annotate manually. Matters for inheritance because karyotype determines X-linked risk, not presentation. | PhenoTips blog, NSGC nomenclature |

*Note: Gender identity is irrelevant to pedigree structure. Pedigree symbols (square/circle/diamond) represent biological sex because that determines inheritance patterns, X-linkage, and sex-specific risk models. A trans man who is 46,XX still needs a circle on the pedigree. Gender is patient-facing clinical metadata, not a pedigree requirement. The NSGC 2022 "gender inclusivity" update conflates clinical communication with genetic notation.*

#### Interoperability Gaps

| # | Requirement | What people do instead | Source |
|---|------------|----------------------|--------|
| 60 | **Round-trip editing** (export SVG, edit, import back as structured data) | Once you edit SVG in Illustrator, the structured data is lost. No tool can re-import a hand-edited SVG back to a data model. | Universal pain point across all tools |
| 61 | **Universal format import/export** (PED + JSON + GEDCOM + BOADICEA + GA4GH FHIR + Progeny + Cyrillic) | No single tool supports all formats. Users manually re-enter data when switching tools. | QuickPed paper, DrawPed paper |
| 62 | **Collaborative editing** (multiple users editing the same pedigree simultaneously) | Not supported by any tool. Users export/share files manually. | -- |

#### Scale & Performance

| # | Requirement | What people do instead | Source |
|---|------------|----------------------|--------|
| 63 | **Interactive editing of very large pedigrees** (hundreds of individuals) with good performance | Madeline handles large pedigrees but is batch-only (no interaction). Interactive tools (pedigreejs, Open Pedigree) struggle with scale. Users break pedigrees into sub-pedigrees. | Madeline paper, Nature 2023 Neolithic pedigree paper (64 individuals over 7 generations) |
| 64 | **Animal breeding scale** (thousands of individuals, dozens of generations) | Pedigraph handles this but is not interactive. kinship2/Pedixplorer handle data but plotting fails at scale. | Pedixplorer paper, Pedigraph docs, ResearchGate forum |

#### Clinical Workflow Gaps (not in any tool, including commercial)

| # | Requirement | What people do instead | Source |
|---|------------|----------------------|--------|
| 65 | **Structured family history in EHR** with proper maternal/paternal distinction and specific condition types | EHR family history fields "lack sensible options such as a distinction between maternal versus paternal aunt" and only allow "cancer" not specific types. Counselors document in free text. | Genetic counselor HIT survey (PMC8290863), Greenberg 2025 |
| 66 | **Pedigree as queryable data** (not just an image embedded in a record) | "Aspects of clinical genetic counseling such as the pedigree are not easy to query or abstract." Pedigrees stored as images lose their structured data. | PMC8290863, PMC12104490 |

---

### Summary: The Opportunity

| Tier | Count | What it means |
|------|-------|--------------|
| **Open source** | 24 features | Table stakes. Must match these. |
| **Commercial only** | 19 features | The "why people pay $500-$2,500" features. A new tool could offer many of these for free, especially if not doing full clinical workflow (EHR, test ordering, compliance). |
| **Nobody** | 22 features | **This is the blue ocean.** Non-linear layouts, arbitrary collapsing, drag-and-drop in open source, round-trip SVG editing, cross-generational mating layout, collaborative editing, expand/collapse interaction, interactive editing at scale. |

**The strongest differentiators for a new tool would be:**
1. Drag-and-drop repositioning (only FamGenix does this, at $500+/year)
2. Non-linear / U-shape layout (nobody does this)
3. Arbitrary branch collapsing with expand/collapse (nobody does this)
4. Round-trip SVG editing (nobody does this)
5. Interactive editing at scale (hundreds of individuals) (nobody does this interactively)
6. Modern web tech (React/Svelte + TypeScript + D3.js) with zero-install deployment (nobody has this in open source)

---

## Sources

- [pedigreejs - GitHub](https://github.com/ccge-boadicea/pedigreejs)
- [pedigreejs paper - Bioinformatics 2018](https://academic.oup.com/bioinformatics/article/34/6/1069/4583632)
- [Open Pedigree - GitHub](https://github.com/phenotips/open-pedigree)
- [REDCap Pedigree Editor - GitHub](https://github.com/aehrc/redcap_pedigree_editor)
- [DrawPed - GeneCascade](https://www.genecascade.org/DrawPed/)
- [DrawPed paper - NAR 2024](https://academic.oup.com/nar/article/52/W1/W61/7668056)
- [QuickPed - GitHub](https://github.com/magnusdv/quickped)
- [genoDraw - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7153108/)
- [Madeline 2.0 - SourceForge](https://sourceforge.net/projects/madeline2/)
- [Madeline 2.0 paper - Bioinformatics 2007](https://academic.oup.com/bioinformatics/article/23/14/1854/189087)
- [Madeline comparison page](https://madeline.med.umich.edu/madeline/comparisons/)
- [HaploPainter - PubMed](https://pubmed.ncbi.nlm.nih.gov/15377505/)
- [ped_draw - GitHub](https://github.com/mvelinder/ped_draw)
- [ped_draw paper - BMC Bioinformatics 2020](https://link.springer.com/article/10.1186/s12859-020-03917-4)
- [family-chart - GitHub](https://github.com/donatso/family-chart)
- [d3-pedigree-examples - GitHub](https://github.com/justincy/d3-pedigree-examples)
- [kinship2 - GitHub](https://github.com/mayoverse/kinship2)
- [Pedixplorer - Bioconductor](https://bioconductor.org/packages/release/bioc/html/Pedixplorer.html)
- [Pedixplorer paper - Bioinformatics 2025](https://academic.oup.com/bioinformatics/article/41/6/btaf329/8155841)
- [Progeny Genetics](https://progenygenetics.com/)
- [TrakGene](https://www.trakgene.com/)
- [FamGenix](https://famgenix.com/)
- [PedigreeTool](https://pedigreetool.com/)
- [FastFamilyTree](https://fastfamilytree.com/)
- [f-tree - Holonic Systems](https://holonic-systems.com/f-tree/en/)
- [Cyrillic / CJC Pedigree Software](https://clinicalpedigree.com/)
- [Genial Pedigree Draw](https://www.pedigreedraw.com/)
- [Pelican paper - Bioinformatics 2004](https://academic.oup.com/bioinformatics/article/20/14/2327/214055)
- [GEDKeeper - GitHub](https://github.com/Serg-Norseman/GEDKeeper)
- [NSGC 2022 Pedigree Standards](https://onlinelibrary.wiley.com/doi/10.1002/jgc4.1621)
