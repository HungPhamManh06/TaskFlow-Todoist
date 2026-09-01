# TaskFlow Release Checklist

Pre-release verification before deploying to production.

## Pre-Release

- [ ] Latest main: `git pull origin main`
- [ ] Clean working tree: `git status` shows no uncommitted changes
- [ ] Build: `npm run build`
- [ ] Build check: `npm run build:check`
- [ ] Unit tests: `node --test tests/*.test.mjs`
- [ ] Sync tests: `node test-sync.js`
- [ ] Server security: `node test-server-security.js`
- [ ] Release assets: `python scripts/check-release-assets.py`

## E2E Verification

- [ ] Backup/restore: `python scripts/e2e-backup-restore.py`
- [ ] A11y: `python scripts/e2e-a11y.py`
- [ ] Task mutations: `python scripts/e2e-task-mutations.py`
- [ ] AI trust boundary: `python scripts/e2e-ai-trust-boundary.py`
- [ ] Chat: `python scripts/e2e-chat-e2e.py`
- [ ] Chat streaming: `python scripts/e2e-chat-streaming.py`
- [ ] Document chat: `python scripts/e2e-document-chat.py`
- [ ] Document daily plan: `python scripts/e2e-document-daily-plan.py`
- [ ] SW upgrade: `python scripts/e2e-sw-upgrade-ai.py`
- [ ] Offline PWA: `python scripts/e2e-offline.py`
- [ ] Smoke (all 3 browsers): `python scripts/e2e-smoke.py --all`

## Deploy

- [ ] Commit and push to main
- [ ] CI passes: all 16 jobs GREEN
- [ ] Vercel deployment: READY
- [ ] Exact SHA matches: `git log -1 --format=%H` == Vercel `githubCommitSha`

## Production Smoke

- [ ] Landing page: 200
- [ ] App: 200
- [ ] Privacy: 200
- [ ] Terms: 200
- [ ] Hashed assets load correctly
- [ ] No console errors on boot
- [ ] Security headers present
- [ ] Quick Add works
- [ ] Navigation works

## Rollback

- **Frontend**: Vercel dashboard → Deployments → Promote previous deployment
- **Backend**: Existing deployment process (separate from frontend)
- **Data**: Backup/restore via JSON export/import; no database migration needed

## Post-Release

- [ ] Monitor for error reports
- [ ] Production smoke: `python scripts/e2e-production-smoke.py`
- [ ] Verify offline functionality
- [ ] Check PWA installability
