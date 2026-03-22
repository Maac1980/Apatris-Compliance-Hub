# Apatris Compliance Hub

A comprehensive industrial compliance and workforce management platform for tracking 200+ welders across sites, managing certifications, payroll, and compliance documents.

## What It Does

- Tracks welder compliance certifications and expiry dates
- Manages payroll with verified ZUS calculations (11.26%)
- Mobile-first workforce app for field workers
- Role-based access for admin, manager, supervisor, worker
- Real-time compliance alerts and audit logging

## Apps

| App | Description |
|-----|-------------|
| `apatris-dashboard` | Desktop compliance dashboard |
| `workforce-app` | Mobile worker app |
| `api-server` | REST API backend |

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS v4, Radix UI
- **Backend:** Express 5, Node.js, TypeScript
- **Database:** PostgreSQL 16, Drizzle ORM
- **Auth:** JWT, Airtable integration
- **Notifications:** Email, WhatsApp

## Quick Start

\`\`\`bash
pnpm install
pnpm run dev
\`\`\`

## Tests

\`\`\`bash
cd artifacts/api-server && npx vitest run
\`\`\`
