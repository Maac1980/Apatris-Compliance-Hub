Run the ship pipeline to PROD. Stop and report if any step fails.

1. Build affected apps
2. Run all tests — report pass/fail counts
3. If tests fail, STOP and report. Do NOT proceed.

4. Stage changes carefully:
   - Stage only files I would actually want shipped to prod
   - INCLUDE: source code (src/, services/, routes/, lib/), CONTEXT.md, package.json, lock files, fly.toml configs
   - EXCLUDE: .claude/ directories, *.local.json, dist/ build artifacts, .DS_Store, node_modules
   - If any file is ambiguous (e.g. .mcp.json, deleted dist files, new untracked files), STOP and ask me before staging
   - Show the staged file list and wait for my "yes" before committing

5. Commit with a clear message describing what shipped (ask me for the message if it's not obvious from the diff)
6. Push to GitHub main: git push origin main
7. Deploy to Fly: fly deploy --remote-only -a apatris-api
8. Health check: curl -s https://apatris-api.fly.dev/api/healthz
9. Get release version: fly releases --app apatris-api | head -3

Final report:
- Commit SHA
- GitHub push status
- Fly release version
- Health check JSON
- One-line summary

Rules:
- Never push if tests fail
- Never deploy if push fails
- Never blanket-stage with git add -A
- Stop immediately on any error or ambiguity
