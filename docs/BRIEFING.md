# RBS' easyTimer — BRIEFING

This document captures the shared baseline for the project, the local working environment, our collaboration workflow, and the testing strategy. It’s meant to be stable, concise, and actionable.

"I", "we" oder "dev" in this document refers to me, the person
"You" oder "AI" refers to the AI coding partner

---

## 0) Purpose (short)

Lightweight online timer app, simple UX. tech stack to be defined.

**Prod URL**  
https://easytimer.noxvobiscum.at/

---

## 1) Current Working Environment (Dev box)

> Keep this section accurate. When versions change, update here.

- **OS:** Windows (terminal: Git Bash)  
- **Editor:** VS Code  
- **VCS:** Git (remote origin)  
- **Build:** to be defined  
- **Runtime:** to be defined
- **Backend:** to be defined  
- **Frontend:** vanilla JavaScript, global stylesheet: `src/main/resources/static/styles.css`  
- **Tests:**  
  - Unit/Component: JUnit 5, Mockito  
  - E2E/UI: Playwright (run separately)  
- **Deployment:** to be defined
- **Configuration:** to be defined

---

## 2) Tech Stack (overview)

- **Language:** HTML/CSS/JS (frontend)  
- **Frameworks:** to be defined
- **Realtime:** to be defined
- **Testing:** JUnit 5, Mockito, Playwright (E2E)  
- **Build:** to be defined
- **Static assets:** `src/main/resources/static/**`  
- **Templates:** `src/main/resources/templates/**`  
- **Config files:** `src/main/resources/application*.properties`  
- **Feature flags:** `features.*` keys (see §3)

---

## 3) Configuration & Feature Flags

- **Base config:** `application.properties`  
- **Profiles:** currently minimal; to be defined


---

## 4) Coding & Style Rules

- **English everywhere in code:** class names, method names, variables, inline comments, messages.  
- **Frontend styling:** all CSS centralized in `static/styles.css`. Avoid inline styles; consolidate into `styles.css`.  
- **Small, focused changes:** avoid mixing refactors with feature work.  
- **Reuse first:** prefer extending existing files over creating new ones.

---

## 5) Collaboration Workflow (Dev ↔ AI)

These rules keep iterations safe, quick, and easy to review.

### 5.0 Golden rule — Ask before you act
When in doubt, ask a clarifying question. Never guess. No “best-effort” patches without either the current file content or an explicit “unchanged” confirmation.

### 5.1 Kickoff checklist for every new chat/session
- Share the **current repo shape** to prevent guessing:  
  - Windows: `tree /F > tree.txt`  
  - Git Bash/WSL: `find . -type f | sort > tree.txt`  
  Attach/paste the relevant sections.
- State **what you want to change** (file path + goal).  
- State **constraints** (no new deps, CSS centralization, etc.).

### 5.2 Change workflow = small, reviewable steps
1. Confirm target file(s) and **exact block(s)**.  
2. Provide a **minimal patch/snippet** only for that block.  
3. dev run/tests → report back → next small step.  

_No batching of unrelated edits. Prefer one change per step/commit._

### 5.3 State & assumptions policy
- **Ask-first rule.** If anything is ambiguous or I'm not 100% sure, stop and ask a clarifying question. Do not guess or provide “best-effort” patches without confirmation.
- **No assumptions.** If current code may differ from memory, you first request the **actual “as-is”** (file tree, file content, or relevant fragment).
- **After pauses, re-confirm state** before proposing edits.

### 5.4 Snippet & diff policy
- Drop-in snippets only when the replaceable block is **uniquely identifiable**.  
- If not unique, either request the exact surrounding lines, or add one-time **BEGIN/END markers** to ease future patches.

### 5.5 Reuse before creating new files
- Check whether existing structures can host the change.  
- New files/folders/dependencies only when clearly beneficial.

### 5.6 Styling policy
- **All styles live in `styles.css`.**  
- Reuse existing tokens/classes; if adding a token, define it in `styles.css` and reference it.

### 5.7 Testing policy
- New logic → new/updated tests. Target: **~90% coverage** for core modules.  

### 5.8 Config & feature flags
- Behavioral changes behind flags must include:  
  the property keys + defaults **and** an entry in **this** BRIEFING when introducing new flags.

### 5.9 Backlog & docs hygiene
- “Do later” items go to `docs/BACKLOG.md`.  
- Rules and conventions live here (`BRIEFING.md`) and, for UI rules, `STYLE.md`.  
- New collaboration rules agreed during chats are **added here** as part of the same step.

### 5.10 Dependencies
- Keep the footprint small. Before adding a dependency: verify necessity, check alignment with the stack, and ensure no existing solution already fits.

---

## 8) Deploy & Ops (short)

- **Deploy target:** to be defined
- **Proxy/CDN:** to be defined
- **Health:** to be defined
- **Profiles:** to be defined
- **Logs:** to be defined

---

## 9) Security & Privacy (short list)

- Avoid leaking secrets in logs.
- Passwords: BCrypt + optional pepper (see properties).

---

## 10) Frontend Notes

---

## 11) How to start the next session (TL;DR)

1) Paste **file tree** (or relevant excerpt).  
2) Paste **active `application.properties`** (+ current profile file, if used).  
3) I Tell you **which file/block** I to change.  
4) Mention **constraints** (no new deps, styling rules, etc.).  
5) you’ll respond with **one small patch**; you apply/run/tests; we iterate.

---

## 12) Known warnings & tooling notes

---

## 13) WebSocket/Realtime policy

---

## 14) Accessibility & i18n

- **i18n**: messages in `messages*.properties`; avoid hardcoded strings in templates/JS where a key exists.  
- **A11y**: icon buttons get aria‑labels; keyboard access maintained; contrast respected.

---

## 15) Backlog (pointer)

Backlog items are maintained in `docs/BACKLOG.md`. Current examples include:  


## ###########################################
## ##########+++++ Appendices +++++###########
## ###########################################