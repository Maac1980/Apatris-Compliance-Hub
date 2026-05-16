# Worker App Vision Master Prompt — Canonical Source-of-Truth

**Date captured:** 2026-05-16 (Day 30)
**Source:** Manish handed over this detailed feature spec earlier in the Day 30 session. The 12 AC stubs (AC-39 through AC-50) and the Day 30 Scoping audit (commit `ad8a78e`) + 9 Phase A audits committed Day 30 all derive from this document.

**Status:** source-of-truth. Every derived AC, every per-AC audit, every Phase B build session can reference this as the canonical feature spec.

**Captured caveat:** Manish's original paste ended mid-word at *"weekly worker reliability su"* — the full tail of "AI Differentiators" section may exist but wasn't fully sent. If completion provided later, append at end.

---

# APATRIS WORKER APP — FINAL GOAL PROMPT FOR CLAUDE CODE

You are a principal product architect, senior full-stack engineer, HR-tech workflow designer, and AI systems builder.

Build a production-grade mobile-first worker app and coordinator dashboard for blue-collar workforce operations. This app is part of Apatris, a compliance-first industrial labour operating system used by a recruitment and outsourcing company managing workers, coordinators, managers, office staff, and client-company communications.

The final product must be better than normal attendance or ESS apps. It must combine worker self-service, time and attendance, no-show prevention, leave control, communication, issue handling, document reminders, and AI-powered operational automation.

The goal is simple:
Build the worker app that keeps workers informed, keeps coordinators ahead of problems, keeps managers aware of operational risks, and keeps companies informed before absence causes site failure.

## PRODUCT GOAL
Build one connected system where:
- workers can check shifts, add hours, request leave, report same-day absence, upload documents, ask for help, and receive AI guidance;
- coordinators get real-time no-show alerts, worker messages, replacement suggestions, and escalation workflows;
- managers get dashboards for attendance risk, unresolved absences, reliability scores, document expiry, and coverage gaps;
- companies can receive controlled notifications about absences, ETA changes, and replacement status when enabled;
- AI communicates proactively with workers and internal teams instead of only waiting for manual actions.

## CORE POSITIONING
This is not a generic HR app.
This is a worker-readiness and absence-control operating system.
It should prove whether a worker is ready to work today, explain what is missing, automatically react when something goes wrong, and route the issue to the correct person.

## USERS AND ROLES
Support these roles:
- Worker
- Coordinator
- Manager
- Office Staff
- Owner/Admin
- Optional Client Company Contact

Use role-based access.
Workers only see their own data.
Coordinators see assigned workers and fast action tools.
Managers see team/site summaries and escalations.
Office staff see document and record workflows.
Owners see everything.
Client company contacts only see approved absence/coverage notifications related to their assigned site or team.

## PLATFORM REQUIREMENTS
- Mobile-first design that feels like a real app, not a website squeezed into a phone.
- Bottom navigation for worker mode.
- Fast loading and low-friction actions.
- Multilingual-ready UX.
- Offline-friendly attendance capture with sync recovery.
- Push notifications plus SMS/email integration hooks.
- Audit logs for important actions.
- Clean responsive dashboard for coordinators and managers.

## WORKER APP — FINAL FEATURE PACK
Build these worker tabs:
1. Home
2. Hours
3. Leave
4. Documents
5. Help

### 1. Home
Show:
- today's shift
- worksite/company/site address
- start time and end time
- coordinator contact
- attendance status
- today's worked hours
- urgent alerts
- missing documents alerts
- next payment date
- reliability points summary
- one large urgent button: "I cannot come today"
- one quick button: "I will be late"

### 2. Hours
Include:
- clock in / clock out
- break start / break end
- overtime indicator
- missed punch correction request
- attendance history
- site-tagged attendance
- GPS/geofence support hook
- optional selfie/liveness verification hook
- shift status timeline

### 3. Leave
Include:
- planned leave request
- sick leave / urgent absence report
- lateness reporting
- holiday balance
- request history
- status: pending / approved / rejected
- file upload for proof if required
- rule-driven cutoff checking
- notice timing score

### 4. Documents
Include:
- passport
- visa / permit
- TRC / residence documents
- PESEL
- contract copy
- medical certificate
- training/certificates
- requested docs list
- upload flow
- expiry alerts
- review status

### 5. Help
Include:
- chat with coordinator / office
- voice note support
- categorized issue reporting
- complaint submission
- payroll issue
- accommodation issue
- transport issue
- supervisor issue
- legal / document question
- track case status
- multilingual AI assistant

## CRITICAL MODULE 1 — NO-SHOW ALERT & PENALTY LOGIC
Build a full automated no-show engine.

### Business logic
- Every scheduled shift has an expected check-in window.
- If the worker has not clocked in within the configured grace period, mark status as "late check-in risk".
- Automatically send a worker message asking for a quick response:
  - Coming now
  - Late
  - Absent today
  - Transport problem
  - Other problem
- If the worker replies, classify the event and update status.
- If no reply after second threshold, alert the coordinator.
- If still unresolved after third threshold, alert manager.
- If company notifications are enabled, send a controlled status update to the client company contact.
- Suggest replacement workers if needed.
- Open a case for repeated no-shows or suspicious patterns.

### Event states
- Scheduled
- Checked in
- Late risk
- Late confirmed
- Absence reported on time
- Absence reported late
- No-call no-show
- Escalated
- Resolved
- Replacement assigned

### Penalty / points logic
Create configurable scoring rules:
- planned leave requested on time = positive points
- urgent absence reported before shift start = neutral or low penalty
- late-notified absence = penalty
- no-call no-show = major penalty
- repeated late arrivals = escalating penalty
- full attendance week = reward points
- on-time streak = reward points
- proper document upload when requested = reward points
- repeated no-show in rolling 30/60/90-day window = escalation and review

The system must be configurable by company policy. Do not hardcode one policy.

## CRITICAL MODULE 2 — UNUSED HOLIDAY / RELIABILITY BONUS SYSTEM
Do not create a dangerous system that rewards workers for never resting.
Instead build a reliability and planning points engine.

Reward workers for:
- requesting leave in advance
- informing absences on time
- low no-show rate
- good punctuality
- completing full assigned weeks
- covering urgent shifts voluntarily
- attending required meetings / document submissions

Allow optional business rules:
- convert good planning behavior into points
- convert attendance streaks into rewards
- convert selected unused flexible leave windows into bonus points only if policy allows

Make this visible but fair.
Show workers:
- current points
- why points changed
- upcoming opportunity to gain points
- warnings before penalties

## CRITICAL MODULE 3 — AI COMMUNICATION LAYER
This is a major differentiator.
AI must proactively communicate.

### Worker-facing communication
AI can send:
- shift reminders
- missing check-in alerts
- lateness reminders
- document expiry reminders
- leave approval/rejection messages
- payroll clarification prompts
- reminders to upload missing proof
- attendance points updates
- next action guidance in the worker's language

### Internal communication
AI can send to coordinators/managers:
- no-show alert
- high-risk worker absence summary
- repeated lateness pattern
- unresolved complaint alert
- document expiry risk
- replacement needed alert
- daily attendance risk digest
- site coverage risk warning

### Client-company communication
When enabled and approved, AI can send:
- worker absent notice
- worker running late notice
- replacement search status
- replacement confirmed notice
- ETA update
- staffing risk alert

### Communication channels
Design integration-ready hooks for:
- in-app push notification
- SMS
- email
- WhatsApp-like provider integration abstraction

### Messaging rules
- messages must be templated and editable by admin
- sensitive legal or disciplinary messages must require approval if configured
- all messages must be logged in communication history
- multilingual translation must be supported
- tone must be clear, professional, and operational

## CRITICAL MODULE 4 — WORKER ISSUE & COMPLAINT ENGINE
Build a worker issue system that is easier than calling office manually.

Issue categories:
- payroll
- attendance correction
- leave issue
- housing/accommodation
- transport
- supervisor behavior
- safety
- legal status / permit / TRC
- document upload problem
- other

Features:
- choose category
- write message or record voice note
- upload image/pdf proof
- choose urgency
- anonymous option for sensitive complaints if policy allows
- create case ID
- track status
- receive updates
- internal assignment
- escalation rules

Use AI to classify issue type, urgency, and route recommendation.

## CRITICAL MODULE 5 — TIME & SITE INTELLIGENCE
Build a time-and-site intelligence engine.

Features:
- geofence-ready attendance support
- wrong-site detection hook
- no-punch detection
- early leave detection
- overtime spike detection
- shift coverage gap detection
- suspicious attendance pattern detection
- site-level attendance heatmap data model
- worker reliability score
- attendance risk score
- transport-issue tagging

## CRITICAL MODULE 6 — COORDINATOR AND MANAGER DASHBOARDS
### Coordinator dashboard
Show:
- live today attendance board
- absent / late / unresolved list
- incoming worker messages
- missing response queue
- replacement suggestions
- urgent documents expiring
- open complaints
- quick contact buttons
- site coverage status

### Manager dashboard
Show:
- no-show rate trend
- lateness trend
- unresolved absence cases
- top risk workers
- site risk score
- replacement fill success
- holiday planning health
- points/penalty distribution
- complaint categories and volumes
- document expiry exposure

## IMPORTANT AI DIFFERENTIATORS OTHER APPS MISS
Include these features too:
- AI reason classifier for absence and complaint messages
- transport problem quick-report mode
- one-tap "I cannot come today" flow
- one-tap "I will be late" flow
- dynamic reminder timing based on worker history
- replacement recommendation engine
- worker-friendly explanation of rules and penalties
- multilingual translation of worker messages to coordinator language
- weekly worker reliability su
