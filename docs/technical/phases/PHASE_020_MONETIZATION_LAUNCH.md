# Phase 020: Monetization & Public Launch

**Status**: In Progress
**Start Date**: 2025-12-11
**Target Completion**: TBD
**Actual Completion**: -
**Owner**: Adam

## Objectives

- Prepare obsidian-palace-mcp for public release with sustainable monetization
- Change license to AGPL-3.0 with dual-licensing for commercial use
- Migrate repository from GitLab to GitHub (Probably-Computers organization)
- Publish package to npm for easy installation
- Establish revenue streams via Paddle and GitHub Sponsors
- Target R1,700+/month (~$100 USD) in passive income

## Prerequisites

- [ ] All prior phases completed (001-019)
- [ ] Full test suite passing
- [ ] CLAUDE.md and README.md up to date
- [ ] npm account created (npmjs.com)
- [ ] Paddle account created
- [ ] GitHub organization access (Probably-Computers)
- [ ] Website live for Paddle verification (see Phase 021)

## Scope

### In Scope
- License change to AGPL-3.0
- Commercial license documentation
- GitHub repository migration
- npm package publication
- Paddle store setup
- GitHub Sponsors configuration
- Directory listings (Smithery.ai, mcp.so, awesome-mcp-servers)
- Launch announcements

### Out of Scope
- Premium features development
- Obsidian plugin submission (separate effort)
- Marketing campaigns beyond initial announcements
- Custom integrations or consulting services

## Business Model

### Pricing Structure

| Tier | Price | Target | License |
|------|-------|--------|---------|
| **Community** | Free | Individual users, hobbyists | AGPL-3.0 |
| **Personal Pro** | $29 once (lifetime) | Power users, indie devs | Commercial |
| **Commercial** | $49/year per organization | Businesses, teams | Commercial |

### Revenue Projections (Conservative)

| Source | Monthly Estimate |
|--------|------------------|
| Personal Pro (2-3 sales/month) | $58-87 |
| Commercial (1-2 sales/month avg) | $4-8 |
| GitHub Sponsors | $10-30 |
| **Total** | **$72-125/month** |

### Payment Platform

**Paddle** (https://paddle.com)
- 5% + $0.50 per transaction
- Handles global VAT/tax compliance (Merchant of Record)
- Multiple payout methods supported
- No monthly fees
- **Note**: Requires website verification before merchant account approval (see Phase 021)

## Tasks

### 020.1: License Change (AGPL-3.0) ✅

**Why AGPL over MIT:**
- Remains OSI-approved open source
- Copyleft for network use - anyone offering as SaaS must open-source modifications
- Creates dual-licensing opportunity - businesses wanting to embed without open-sourcing pay for commercial license
- Cannot be "embrace and extended" by larger players

**Tasks:**
- [x] Replace `LICENSE` file with AGPL-3.0 text
- [x] Update `package.json` license field to `"AGPL-3.0"`
- [x] Create `LICENSE-COMMERCIAL.md` explaining commercial terms
- [x] Update README with license section
- [x] Commit license changes

### 020.2: GitHub Migration

- [x] Create repo at `github.com/Probably-Computers/obsidian-palace-mcp`
- [x] Push codebase to GitHub
- [x] Set GitHub as primary remote
- [x] Remove GitLab-specific files (.gitlab-ci.yml, sonar-project.properties)
- [x] Update all GitLab URLs to GitHub URLs
- [ ] Enable GitHub Sponsors for Probably-Computers org
- [ ] Configure sponsor tiers:
  - $3/month - Supporter (name in README)
  - $9/month - Backer (name in README + early access to features)
  - $29/month - Sponsor (above + listed as sponsor in repo)
- [x] Add `.github/FUNDING.yml`

### 020.3: Paddle Store Setup

- [ ] Create Paddle account (https://paddle.com)
- [ ] Submit website for merchant verification (requires Phase 021 complete)
- [ ] Configure payout method
- [ ] Create products:
  - Personal Pro License ($29, one-time)
  - Commercial License ($49, yearly subscription)
- [ ] Configure checkout with license key generation
- [ ] Create product pages with descriptions
- [ ] Test checkout flow with sandbox mode

### 020.4: npm Publication

**Pre-publish Checklist:**
- [x] Ensure `package.json` has correct metadata (repository, homepage, bugs, funding)
- [x] Verify README installation instructions work
- [x] Run full test suite: `npm test`
- [x] Build: `npm run build`
- [x] Test local install: `npm pack && npm install -g obsidian-palace-mcp-*.tgz`
- [x] Create `.npmignore` to exclude unnecessary files

**Publishing:**
- [x] Login to npm: `npm login`
- [x] Publish: `npm publish --access public`
- [x] Verify: `npm view obsidian-palace-mcp`

**Note:** npm requires 2FA for publishing. Since biometric-only 2FA doesn't work with CLI, use a granular access token with "Bypass 2FA for automation" enabled. See `docs/technical/CONTRIBUTING.md` for detailed instructions. Tokens expire after 7 days by default.

### 020.5: Documentation Polish

- [x] Add badges (npm version, license, GitHub Sponsors)
- [x] Add "Support the Project" section
- [x] Add "Commercial Licensing" section (already in README)
- [x] Verify all installation instructions work with npm
- [x] Add troubleshooting section for common issues

### 020.6: Directory Listings

**MCP Directories:**
- [ ] Submit to Smithery.ai (https://smithery.ai)
- [ ] Verify listing on mcp.so (https://mcp.so)
- [ ] Submit PR to awesome-mcp-servers (https://github.com/punkpeye/awesome-mcp-servers)

**Obsidian Community:**
- [ ] Post announcement on r/ObsidianMD
- [ ] Post in Obsidian Discord #plugins channel

### 020.7: Launch Announcement

- [ ] Prepare announcement post for each platform
- [ ] Schedule/post announcements
- [ ] Monitor and respond to initial feedback

## Standards & References

- [CLAUDE.md](../../../CLAUDE.md) - Project guidelines
- [GIT_WORKFLOW_STANDARDS.md](../GIT_WORKFLOW_STANDARDS.md) - Git practices
- [obsidian-palace-mcp-spec.md](../obsidian-palace-mcp-spec.md) - Full specification
- AGPL-3.0 License: https://www.gnu.org/licenses/agpl-3.0.en.html

## Technical Details

### Environment Configuration

Post-migration, update all references:
- Repository URL: `https://github.com/Probably-Computers/obsidian-palace-mcp`
- Issues URL: `https://github.com/Probably-Computers/obsidian-palace-mcp/issues`
- npm package: `obsidian-palace-mcp`

### Files to Create/Modify

| File | Action |
|------|--------|
| `LICENSE` | Replace with AGPL-3.0 |
| `LICENSE-COMMERCIAL.md` | Create |
| `package.json` | Update license, repository, funding fields |
| `README.md` | Add badges, support section, update repo URLs |
| `.github/FUNDING.yml` | Create |

## Testing & Quality Assurance

### Pre-Launch Verification
- [x] Full test suite passes: `npm test`
- [x] Build succeeds: `npm run build`
- [x] TypeScript compiles: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [x] Local npm install works
- [x] MCP Inspector test: `npm run inspect`

### Quality Checks
- [x] All links in README are valid
- [x] License files are correctly formatted
- [x] package.json metadata is complete
- [x] Installation instructions tested on clean environment (npm published 2025-12-15)

## Acceptance Criteria

- [x] AGPL-3.0 license in place with LICENSE-COMMERCIAL.md
- [x] Repository live at github.com/Probably-Computers/obsidian-palace-mcp
- [x] Package published and installable via `npm install -g obsidian-palace-mcp` (published 2025-12-15)
- [ ] Paddle store live with both products purchasable (awaiting merchant verification)
- [ ] GitHub Sponsors enabled and accepting contributions
- [ ] Listed in at least 2 MCP directories
- [ ] At least one public announcement posted

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| npm name taken | High | Low | Check availability early; have alternatives ready |
| Paddle verification delays | Medium | Medium | Ensure website meets all requirements (Phase 021) |
| Paddle payout issues | Medium | Low | Test with small transaction first |
| Low initial adoption | Medium | Medium | Focus on quality over marketing; let organic growth happen |
| License confusion | Medium | Low | Clear LICENSE-COMMERCIAL.md with FAQ |
| Negative community response to monetization | Medium | Low | Emphasize AGPL is still fully open source |

## Post-Launch

### Ongoing (Minimal Effort)
- Monitor GitHub issues (aim for <1 week response time)
- Merge reasonable PRs
- Periodic dependency updates
- Respond to license purchase questions via email

### Metrics to Track
- npm weekly downloads
- GitHub stars
- Paddle revenue
- GitHub Sponsors revenue

### Future Monetization Options (If Traction Warrants)
- Premium features (if community requests emerge)
- Consulting/setup services
- "Powered by" integrations with other tools

## Notes & Decisions

### License Choice: AGPL-3.0
- **Context**: Need to monetize while remaining open source
- **Decision**: AGPL-3.0 with commercial dual-licensing
- **Rationale**: AGPL copyleft prevents SaaS exploitation while remaining OSI-approved; creates natural commercial license demand
- **Alternatives considered**: MIT (too permissive), GPL (doesn't cover network use), BSL (not OSI-approved)

### 2025-12-12 - Payment Platform: LemonSqueezy → Paddle
- **Context**: Originally planned LemonSqueezy, but Paddle better fits requirements
- **Decision**: Use Paddle as payment processor
- **Rationale**: Both are Merchant of Record with similar fees; Paddle has broader recognition
- **Note**: Paddle requires website verification before merchant account approval, hence Phase 021 dependency

### 2025-12-15 - npm Package Published
- **Context**: Needed to secure package name while awaiting Paddle merchant verification
- **Decision**: Published v2.0.0 to npm with AGPL-3.0 license (Community/free tier available)
- **Note**: npm requires 2FA for publishing; used granular access token with "Bypass 2FA" since biometric-only 2FA doesn't work with CLI. Tokens expire after 7 days. See `docs/technical/CONTRIBUTING.md` for publishing instructions.

## Checklist Summary

### Must Have (Before Launch)
- [x] AGPL-3.0 license in place
- [x] LICENSE-COMMERCIAL.md created
- [x] GitHub repo created and code pushed
- [x] npm package published (2025-12-15, v2.0.0)
- [x] Website live at obsidianpalace.dev (Phase 021 complete)
- [ ] Paddle store with products (awaiting merchant verification)
- [x] README updated with license info and support links

### Should Have (Within 1 Week of Launch)
- [ ] GitHub Sponsors enabled
- [ ] Listed on mcp.so and Smithery.ai
- [ ] Announcement post on r/ObsidianMD

### Nice to Have (When Time Permits)
- [ ] Demo video
- [ ] Obsidian community outreach

## Success Criteria

Phase 020 is complete when:
1. Package is live on npm and installable via `npm install -g obsidian-palace-mcp`
2. Website live at obsidianpalace.dev (Phase 021 dependency)
3. Commercial licenses are purchasable via Paddle
4. GitHub Sponsors is accepting contributions
5. Project is listed in at least 2 MCP directories
6. At least one public announcement has been made

Revenue goal: First license sale or sponsor within 30 days of launch.

## Dependencies

- **Phase 021 (Website Launch)**: Must be completed before Paddle can verify merchant account
