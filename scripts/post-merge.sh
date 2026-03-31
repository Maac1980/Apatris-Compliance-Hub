#!/bin/bash
set -e
pnpm install --frozen-lockfile
# SAFETY: Do NOT run drizzle-kit push here.
# drizzle-kit push drops tables not in the Drizzle schema,
# destroying production data (regulatory_updates, trc_cases, etc.).
# All tables are created safely via CREATE TABLE IF NOT EXISTS
# in the route files on server startup.
echo "[post-merge] Install complete. Skipping drizzle-kit push (tables created on startup)."
