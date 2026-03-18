## Summary

<!-- One or two sentences describing what this PR does and why. -->

---

## Type of Change

<!-- Check all that apply. -->

- [ ] `feat` — New feature
- [ ] `fix` — Bug fix
- [ ] `refactor` — Code change that is neither a fix nor a feature
- [ ] `ci` — CI/CD changes
- [ ] `infra` — Infrastructure / deployment changes
- [ ] `docs` — Documentation only
- [ ] `test` — Adding or updating tests
- [ ] `chore` — Dependency bumps, tooling, maintenance

---

## Context

<!-- What problem does this solve? Link any related issues or discussions. -->

Closes #

---

## Changes

<!-- List the key changes made. Be specific enough that a reviewer can follow along. -->

- 
- 
- 

---

## Risk Level

<!-- Choose one and remove the others. -->

🟢 **Low** — Isolated change, no data mutations, fully covered by tests  
🟡 **Medium** — Touches shared code or has minor data impact  
🔴 **High** — Database migrations, auth changes, breaking API surface, or infra changes

**Reasoning:** <!-- Why did you choose this risk level? -->

---

## Testing

- [ ] `npm run typecheck -w apps/api` passes
- [ ] `npm run test -w apps/api` passes
- [ ] `npm run type-check -w apps/web` passes (if frontend changed)
- [ ] `npm run build -w apps/web` passes (if frontend changed)
- [ ] Integration tests pass locally
- [ ] Manually tested the changed flows end-to-end

---

## Screenshots

<!-- Frontend changes only. Remove this section if not applicable. -->

| Before | After |
|--------|-------|
|        |       |

---

## Deployment Notes

<!-- Anything the deployer needs to know: env vars to add, migrations to run, cache to clear, feature flags. -->

- [ ] No special deployment steps required
- [ ] Requires new environment variable: `___`
- [ ] Requires Supabase migration: `supabase/migrations/___`
- [ ] Requires manual action on VPS: `___`

---

## Final Checklist

- [ ] PR title follows conventional commit format (`type(scope): description`)
- [ ] Branch name follows convention (`feat/*`, `fix/*`, `infra/*`, etc.)
- [ ] No debug logs, commented-out code, or `TODO` / `FIXME` left in diff
- [ ] No secrets or credentials committed
- [ ] Relevant documentation updated (if applicable)
- [ ] CHANGELOG updated (if applicable)
