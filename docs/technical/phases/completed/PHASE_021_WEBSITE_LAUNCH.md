# Phase 021: Website Launch (obsidianpalace.dev)

**Status**: Completed
**Start Date**: 2025-12-12
**Target Completion**: 2025-12-12
**Actual Completion**: 2025-12-12
**Owner**: Adam

## Objectives

- Build a professional landing page at `obsidianpalace.dev` for Paddle merchant verification
- Reorganize `/docs` folder to serve website via GitHub Pages while preserving technical documentation
- Establish product presence with clear pricing, features, and licensing information
- Update Phase 020 to reflect Paddle as payment processor (replacing LemonSqueezy)

## Prerequisites

- [x] Domain `obsidianpalace.dev` registered (Cloudflare)
- [x] GitHub repository live at `github.com/Probably-Computers/obsidian-palace-mcp`
- [ ] Cloudflare account access for DNS configuration
- [ ] Paddle account created (pending website for verification)

## Scope

### In Scope
- Documentation folder reorganization (`/docs` → website + `/docs/technical/`)
- Landing page (index.html) with hero, features, pricing, how-it-works sections
- Legal pages (privacy.html, terms.html) required for Paddle
- GitHub Pages configuration with custom domain
- Cloudflare DNS configuration
- Placeholder assets (logo, favicon, og-image)
- Update Phase 020 for Paddle migration
- Update CLAUDE.md and PHASE_GUIDE.md for new docs structure

### Out of Scope
- Analytics integration (deferred)
- Functional payment checkout (Paddle approval required first)
- Demo video/GIF (placeholder only)
- Custom logo design (placeholder for now)
- Marketing campaigns

## Business Context

Paddle (payment processor) requires reviewing a legitimate product website before approving merchant accounts. This website will:
1. Enable Paddle verification to unblock Phase 020 completion
2. Provide professional product presence
3. Host pricing and license information
4. Improve SEO and discoverability

## Tasks

### 021.1: Update Phase 020 (LemonSqueezy → Paddle) ✅

- [x] Replace all LemonSqueezy references with Paddle in Phase 020
- [x] Update pricing/fee structure (Paddle: 5% + $0.50 per transaction)
- [x] Update payment platform section with Paddle details
- [x] Note that Paddle requires website verification before activation

### 021.2: Documentation Reorganization ✅

**New Structure:**
```
docs/
├── index.html              # Landing page (website root)
├── privacy.html            # Privacy policy
├── terms.html              # Terms of service
├── pricing.html            # Explicit pricing page
├── CNAME                   # Custom domain config
├── favicon.ico             # Browser icon
├── robots.txt              # Search engine hints
├── sitemap.xml             # SEO sitemap
├── assets/                 # Website assets
│   ├── css/
│   │   └── styles.css      # Custom styles (if needed beyond Tailwind)
│   └── images/
│       ├── logo.svg        # Logo placeholder
│       └── og-image.png    # Social sharing image (1200x630)
└── technical/              # Technical documentation (moved)
    ├── AI-BEHAVIOR.md
    ├── API.md
    ├── CHANGELOG.md
    ├── CONFIGURATION.md
    ├── CONTRIBUTING.md
    ├── GIT_WORKFLOW_STANDARDS.md
    ├── PHASE_GUIDE.md
    ├── obsidian-palace-mcp-spec.md
    ├── obsidian-palace-mcp-spec-v2.md
    ├── templates/
    │   └── PHASE_TEMPLATE.md
    └── phases/
        ├── PHASE_020_MONETIZATION_LAUNCH.md
        ├── PHASE_021_WEBSITE_LAUNCH.md
        └── completed/
            └── (all completed phases)
```

**Tasks:**
- [x] Create `docs/technical/` directory
- [x] Move all `.md` files from `docs/` to `docs/technical/`
- [x] Move `docs/templates/` to `docs/technical/templates/`
- [x] Move `docs/phases/` to `docs/technical/phases/`
- [x] Create `docs/assets/` directory structure

### 021.3: Update Documentation References ✅

Files requiring path updates after reorganization:

- [x] `CLAUDE.md` - Update all `docs/` references to `docs/technical/`
- [x] `docs/technical/PHASE_GUIDE.md` - Update paths for phases location
- [x] `docs/technical/GIT_WORKFLOW_STANDARDS.md` - No changes needed (internal refs only)
- [x] `README.md` - Update documentation links
- [x] `.npmignore` - Update exclusion paths
- [x] Phase files with cross-references (020, 021)

### 021.4: Website Infrastructure ✅

**GitHub Pages Configuration:**
- [x] Enable GitHub Pages in repo Settings → Pages
- [x] Set source: Deploy from branch `main`, folder `/docs`
- [x] Set custom domain: `obsidianpalace.dev`
- [x] Enable "Enforce HTTPS"

**Cloudflare DNS Configuration:**
| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `@` | `Probably-Computers.github.io` | DNS only (grey cloud) |
| CNAME | `www` | `obsidianpalace.dev` | DNS only |

- [x] Add CNAME record for root domain
- [x] Add CNAME record for www subdomain
- [x] Set SSL/TLS mode to "Full"
- [x] Enable "Always Use HTTPS"
- [x] Disable Cloudflare proxy (grey cloud) for GitHub Pages compatibility

### 021.5: Landing Page (index.html) ✅

**Sections:**
- [x] Navigation bar (Logo, Features, Pricing, Docs, GitHub)
- [x] Hero section
  - Headline: "Turn Your Obsidian Vault Into an AI Memory Palace"
  - Subheadline: Value proposition (1-2 sentences)
  - Primary CTA: "Get Started" → GitHub README
  - Secondary CTA: "View Pricing" → pricing.html
- [x] Features section (6 key features with icons/descriptions)
  - Intent-based storage
  - Multi-vault support
  - Auto-linking
  - Full-text search + Dataview
  - Atomic notes (auto-split)
  - Works with Claude, ChatGPT, any MCP client
- [x] How It Works section (4 steps)
  - Install via npm
  - Configure your vault
  - Connect to Claude/ChatGPT
  - AI remembers everything
- [x] Screenshots/Demo placeholder section
  - Placeholder images with "Demo coming soon" or similar
  - Brief explanation of what the product does
- [x] CTA section (bottom)
- [x] Footer (GitHub, Docs, Privacy, Terms, Contact)

**Technical Implementation:**
- Pure HTML with Tailwind CSS via CDN
- Dark theme (Obsidian-inspired purple accent)
- Mobile responsive
- No build step required

### 021.6: Pricing Page (pricing.html) ✅

| Community | Personal Pro | Commercial |
|-----------|--------------|------------|
| Free | $29 once | $49/year |
| AGPL-3.0 | Lifetime license | Per organization |
| Full features | Full features | Full features |
| Community support | Email support | Priority support |
| [Get Started] | [Coming Soon] | [Coming Soon] |

- [x] Create dedicated pricing page
- [x] Clear tier comparison table
- [x] FAQ section (license questions, refunds, etc.)
- [x] "Payment processing coming soon" notice for paid tiers
- [x] Link to LICENSE-COMMERCIAL.md for commercial terms

### 021.7: Legal Pages ✅

**Privacy Policy (privacy.html):**
- [x] What data is collected (email for license delivery only)
- [x] Payment processing (handled by Paddle - coming soon)
- [x] No analytics/tracking statement
- [x] Contact information for data requests
- [x] POPIA compliance statement (South African data protection)

**Terms of Service (terms.html):**
- [x] License terms summary
- [x] Refund policy (14-day no-questions-asked)
- [x] Limitation of liability
- [x] AGPL-3.0 reference for free tier
- [x] Commercial license terms reference

### 021.8: Assets ✅

- [x] Create placeholder logo (SVG, text-based "Obsidian Palace" or simple icon)
- [x] Create favicon.svg (SVG favicon for modern browsers)
- [x] Create og-image.png (1200x630 for social sharing)
- [x] Create robots.txt
- [x] Create sitemap.xml
- [x] Create CNAME file with `obsidianpalace.dev`

### 021.9: Testing & Verification ✅

- [x] Verify HTTPS works at `https://obsidianpalace.dev`
- [x] Verify www subdomain works
- [x] Test all internal links
- [x] Test all external links (GitHub, etc.)
- [x] All pages load correctly (index, pricing, privacy, terms)
- [x] Mobile responsive (Tailwind CSS)
- [x] Cross-browser compatible (standard HTML + Tailwind CDN)

## Standards & References

- [CLAUDE.md](../../../CLAUDE.md) - Project guidelines
- [GIT_WORKFLOW_STANDARDS.md](../GIT_WORKFLOW_STANDARDS.md) - Git practices
- [PHASE_020_MONETIZATION_LAUNCH.md](./PHASE_020_MONETIZATION_LAUNCH.md) - Monetization context
- GitHub Pages docs: https://docs.github.com/en/pages
- Cloudflare DNS docs: https://developers.cloudflare.com/dns/

## Technical Details

### Design Specifications

**Color Palette:**
| Use | Color | Hex |
|-----|-------|-----|
| Background | Near-black | `#0a0a0b` |
| Surface | Dark grey | `#1a1a1d` |
| Border | Subtle grey | `#2a2a2d` |
| Primary text | White | `#fafafa` |
| Secondary text | Grey | `#888888` |
| Accent | Purple (Obsidian-inspired) | `#7c3aed` |
| Accent hover | Lighter purple | `#a78bfa` |

**Typography:**
- Font: Inter (Google Fonts) or system fonts
- Headings: Bold, generous size
- Body: Regular weight, comfortable line height

**Layout:**
- Max content width: 1200px
- Mobile-responsive (Tailwind breakpoints)
- Generous whitespace

### Technology Stack

- Pure HTML5
- Tailwind CSS via CDN (no build step)
- No JavaScript required (static content)
- GitHub Pages hosting
- Cloudflare DNS

### Files to Create

| File | Purpose |
|------|---------|
| `docs/index.html` | Landing page |
| `docs/pricing.html` | Pricing page |
| `docs/privacy.html` | Privacy policy |
| `docs/terms.html` | Terms of service |
| `docs/CNAME` | Custom domain |
| `docs/robots.txt` | Search engine hints |
| `docs/sitemap.xml` | SEO sitemap |
| `docs/favicon.ico` | Browser icon |
| `docs/assets/images/logo.svg` | Logo placeholder |
| `docs/assets/images/og-image.png` | Social sharing image |

## Testing & Quality Assurance

### Pre-Launch Checklist
- [ ] All pages render correctly
- [ ] All links functional
- [ ] Mobile responsive on various screen sizes
- [ ] HTTPS certificate valid
- [ ] Custom domain resolves correctly
- [ ] Social sharing preview works (og-image)
- [ ] Privacy policy covers Paddle requirements
- [ ] Terms of service covers refund policy

### Paddle Verification Requirements
Paddle reviewers will check for:
- [ ] Clear product description
- [ ] Visible pricing
- [ ] Contact information
- [ ] Privacy policy
- [ ] Terms of service
- [ ] Refund policy
- [ ] Professional appearance
- [ ] Working website (not under construction)

## Acceptance Criteria

- [ ] Website loads at `https://obsidianpalace.dev` with valid HTTPS
- [ ] All four pages complete (index, pricing, privacy, terms)
- [ ] Mobile responsive
- [ ] Documentation reorganized and all references updated
- [ ] Phase 020 updated to reference Paddle instead of LemonSqueezy
- [ ] "Get Started" links to GitHub correctly
- [ ] Professional appearance suitable for Paddle verification
- [ ] Technical docs accessible at `https://obsidianpalace.dev/technical/`

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| DNS propagation delays | Low | Medium | Use low TTL; test with DNS checker tools |
| GitHub Pages HTTPS issues | Medium | Low | Ensure Cloudflare proxy is disabled; wait for cert provisioning |
| Broken doc links after reorganization | Medium | Medium | Thorough grep for old paths; test all links |
| Paddle rejects website | High | Low | Follow their requirements checklist exactly |

## Notes & Decisions

### 2025-12-12 - Documentation Folder Approach
- **Context**: Need to serve website from GitHub Pages
- **Decision**: Use `/docs` folder with technical docs moved to `/docs/technical/`
- **Rationale**: GitHub Pages only supports `/docs` or root; keeps website and docs together
- **Alternatives considered**: Separate branch (`gh-pages`), separate repo, root deployment

### 2025-12-12 - Payment Platform Change
- **Context**: Originally planned LemonSqueezy, switching to Paddle
- **Decision**: Update Phase 020 to reflect Paddle
- **Rationale**: Paddle handles Merchant of Record, global tax compliance
- **Note**: Paddle requires website review before merchant account approval

### 2025-12-12 - Pricing Page Separation
- **Context**: Paddle needs clear pricing visibility
- **Decision**: Create dedicated pricing.html page (not just section on homepage)
- **Rationale**: More professional, easier to link to, meets Paddle requirements

## Success Criteria

Phase 021 is complete when:
1. Website is live at `https://obsidianpalace.dev`
2. All pages (index, pricing, privacy, terms) are complete and professional
3. Documentation reorganized with all references updated
4. Phase 020 updated for Paddle
5. Website ready for Paddle verification submission
