# INFO-001 — Public Pages: Editorial Draft and Release Prerequisites

**Status:** Copy outline only; legal/privacy specifics need owner verification before publication. No pages/routes deployed.

## Proposed page navigation

Four quiet links at the bottom of the universal menu: **About · FAQ · Imprint/Disclosure · Privacy Policy**, separate stable and directly addressable URLs, normal browser navigation and DE/EN copy. These pages should not become modals or clutter the two-mode timer interface.

## About — headline and opening copy

**Proposed headline and subtitle (keep approved English phrasing):**

> easyTimer — Plan less. Time better.  
> Create your rundown. Run your session. Stay focused.

**English draft:** easyTimer is a simple, free timer for quick timeboxes and reusable multi-phase rundowns. Create your rundown in the Session Editor, load it into the Session Timer and run it with a large, readable countdown. Manual and automatic phase transitions help you stay focused on your participants rather than settings. Saved rundowns can be backed up and shared as JSON files, without creating an account. Optional Google Drive sync is being evaluated and is not a public feature yet.

**Deutscher Entwurf:** easyTimer ist ein schlanker, kostenloser Timer für kurze Timeboxes und wiederverwendbare Rundowns mit mehreren Phasen. Erstelle einen Rundown im Session-Editor, lade ihn in den Session-Timer und führe ihn mit einer großen, gut lesbaren Zeitanzeige durch. Manuelle und automatische Phasenwechsel lassen dich bei den Menschen bleiben statt bei den Einstellungen. Rundowns lassen sich auch ohne Konto als JSON sichern und weitergeben. Eine optionale Google-Drive-Synchronisierung wird noch geprüft.

Future philosophy tagline (not approved for public attribution): **“The complexity is ours. The simplicity is yours.”** Check existing use/attribution before publishing as an original slogan.

## FAQ — proposed short questions

- Brauche ich ein Konto? / Do I need an account? **No.** The timer, editor and JSON features work locally.
- Was ist ein Rundown? / What is a rundown? An ordered set of named phases, durations and manual/automatic transitions.
- Startet die Zeit beim Laden? / Does loading start the timer? **No.** First phase is READY; Start is separate.
- Wo liegen die Daten? / Where are my data? Currently in this browser's local storage; clearing data/switching browser/profile/domain can lose access.
- Wie sichere oder teile ich einen Rundown? / How do I back up/share? Export one/all as JSON, and review imports before saving.
- Überschreibt ein Import meine Daten? / Does import overwrite? No. Single import opens a draft; bulk import creates new IDs/copies.
- Funktioniert easyTimer offline? / Does it work offline? Cached app shell and local Rundowns can function offline subject to browser/PWA storage limits.
- Gibt es Google-Synchronisierung? / Is Google sync available? Not publicly yet; optional support remains a separate unreleased project.

## Imprint / Austrian disclosure: owner input required

Do not invent an address or assume that non-commercial/hobby status automatically removes legal obligations. The specific duties depend on operator status, content and potentially commercial circumstances. Owner/legal review checklist:

- Legal owner/media proprietor; suitable address or registered seat as required.
- Actual required contact details; company/trade/UID/chamber/authority information where relevant.
- Applicable Mediengesetz disclosure: purpose/editorial direction and other required information.
- Applicable ECG/UGB/GewO obligations for this operator, if any.
- Appropriate stable public route, DE/EN presentation and owner approval before exposing personal details.

Austrian guidance: https://www.wko.at/internetrecht/website-impressum and https://www.oesterreich.gv.at/de/themen/onlinesicherheit_internet_und_neue_medien/internet_und_handy___sicher_durch_die_digitale_welt/Seite.1720902

## Privacy policy: verify actual implementation first

This is not ready-to-publish legal text. Verify hosting service and logs; analytics, cookies, external fonts/scripts, app caching, `localStorage`, backups, JSON import/export and every network request. For *future released Google sync*, explain voluntary GIS OAuth, minimum `drive.appdata` scope, Rundown data in the user's Google app-data space, distinction between disconnect / revoke / delete, retention, data categories, security limitations and Google as an external provider. Verify GDPR responsible party, legal basis, contact, user rights and transfers as applicable. Do not claim end-to-end encryption or absolute zero data processing without proof.

Before public Google sign-in: verify domain ownership and OAuth branding/homepage/privacy pages. Google production policy: https://developers.google.com/identity/verification/authentication-policy-compliance

## Approval gates

1. Owner supplies verified operator/hosting/privacy facts and approves draft pages.
2. Publish four normal pages with stable URLs, accessible navigation and DE/EN.
3. Verify actual production network/data behavior and applicable Austrian/EU obligations.
4. Review Google OAuth requirements before switching from Testing to production.
5. No public Google deployment solely on the basis of this brief.
