// One presentation-only header shared by the app and standalone information pages.
const labels = {
    en: { mode:'Mode', quick:'Quick Timer', session:'Session Timer', planner:'Session Editor', editorSubtitle:'Create & manage rundowns', exportRundown:'Export Rundown', language:'Language', theme:'Appearance', de:'German', en:'English', light:'Light', dark:'Dark', system:'System', about:'About', faq:'FAQ', imprint:'Imprint', privacy:'Privacy', information:'Information', openMenu:'Open preferences', closeMenu:'Close preferences' },
    de: { mode:'Modus', quick:'Quick-Timer', session:'Session-Timer', planner:'Session-Editor', editorSubtitle:'Rundowns erstellen & verwalten', exportRundown:'Rundown exportieren', language:'Sprache', theme:'Darstellung', de:'Deutsch', en:'Englisch', light:'Hell', dark:'Dunkel', system:'System', about:'Über easyTimer', faq:'FAQ', imprint:'Impressum', privacy:'Datenschutz', information:'Informationen', openMenu:'Einstellungen öffnen', closeMenu:'Einstellungen schließen' },
};
let instance;
export function mountApplicationHeader() {
    if (instance) return instance;
    const template = document.createElement('template'); template.innerHTML = headerMarkup;
    document.getElementById('application-header').replaceWith(template.content);
    const menu = document.getElementById('preferences');
    const trigger = document.getElementById('menu-toggle');
    const container = document.getElementById('preferences-menu');
    let open = false, language = 'en';
    const setOpen = (next, restoreFocus = false) => {
        const focusWasInside = menu.contains(document.activeElement);
        open = Boolean(next); menu.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
        const label = labels[language][open ? 'closeMenu' : 'openMenu'];
        trigger.setAttribute('aria-label', label); trigger.title = label;
        if (restoreFocus || (!open && focusWasInside)) trigger.focus({ preventScroll:true });
    };
    trigger.addEventListener('click', () => setOpen(!open));
    document.addEventListener('click', event => { if (open && !container.contains(event.target)) setOpen(false); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && open) {
            event.preventDefault(); event.stopImmediatePropagation(); setOpen(false, true);
        }
    });
    instance = {
        get open() { return open; }, setOpen,
        bindPreferences(onLanguage, onTheme) {
            menu.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => onLanguage(button.dataset.language)));
            menu.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => onTheme(button.dataset.theme)));
        },
        renderPreferences(nextLanguage, theme) {
            language = nextLanguage;
            const copy = labels[language];
            menu.querySelectorAll('[data-copy]').forEach(el => { el.textContent = copy[el.dataset.copy]; });
            menu.querySelectorAll('[data-label]').forEach(el => el.setAttribute('aria-label', copy[el.dataset.label]));
            for (const kind of ['language', 'theme']) menu.querySelectorAll(`[data-${kind}]`).forEach(button => {
                const value = button.dataset[kind];
                button.setAttribute('aria-pressed', String(value === (kind === 'language' ? language : theme)));
                button.setAttribute('aria-label', copy[value]); button.title = copy[value];
            });
            const label = copy[open ? 'closeMenu' : 'openMenu'];
            trigger.setAttribute('aria-label', label); trigger.title = label;
        },
    };
    return instance;
}
const headerMarkup = `
  <header>
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">
        <img class="brand-logo brand-logo-standard" src="assets/branding/stopwatch-header-standard-96.png" width="32" height="32" alt="">
        <img class="brand-logo brand-logo-dark" src="assets/branding/stopwatch-header-dark-96.png" width="32" height="32" alt="">
      </span>
      easyTimer
    </div>
  </header>
  <div id="preferences-menu" class="preferences-menu">
    <button id="menu-toggle" class="menu-toggle" type="button" aria-expanded="false" aria-controls="preferences" aria-label="Open preferences" title="Open preferences">
      <svg class="menu-icon menu-icon-open" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 7h16M4 12h16M4 17h16"/>
      </svg>
      <svg class="menu-icon menu-icon-close" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m6 6 12 12M18 6 6 18"/>
      </svg>
    </button>
    <div id="preferences" class="preferences" hidden>
      <span id="mode-heading" class="preference-heading" data-copy="mode">Mode</span>
      <div class="mode-choices" role="group" aria-labelledby="mode-heading">
        <button id="open-quick" class="mode-choice" type="button" aria-pressed="true">
          <svg class="navigation-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="14" r="8"/><path d="M12 6V3m-3-1h6m3 5 2-2m-8 5v4"/></svg>
          <span data-copy="quick">Quick Timer</span>
        </button>
        <button id="open-session" class="mode-choice" type="button" aria-pressed="false">
          <svg class="navigation-icon session-stopwatch" viewBox="0 0 32 26" aria-hidden="true" focusable="false">
            <g class="stopwatch-echo stopwatch-echo-far"><circle cx="24" cy="16" r="6.5"/><path d="M24 9.5V7m-2-1h4m3 5 1.5-1.5"/></g>
            <g class="stopwatch-echo stopwatch-echo-near"><circle cx="17" cy="16" r="7.25"/><path d="M17 8.75V6m-2-1h4m3 5 1.5-1.5"/></g>
            <circle class="stopwatch-face" cx="9" cy="16" r="8"/><path d="M9 8V4m-2-1h4m4 6 1.5-1.5M9 12v4"/>
          </svg>
          <span data-copy="session">Session Timer</span>
        </button>
      </div>
      <div class="planner-navigation">
        <button id="open-planner" type="button">
          <svg class="navigation-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h10M4 8h5M4 12v8h16v-5m-12 1 1-4L19 2l3 3-10 10-4 1Zm9-12 3 3"/></svg>
          <span class="editor-copy"><span data-copy="planner">Session Editor</span><span class="editor-subtitle" data-copy="editorSubtitle">Create &amp; manage rundowns</span></span>
          <svg class="planner-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6"/></svg>
        </button>
      </div>
      <button id="export-rundown" class="menu-export" type="button" hidden>
        <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></svg>
        <span data-copy="exportRundown">Export Rundown</span>
      </button>
      <p id="export-feedback" class="menu-export-note" role="status" hidden></p>
      <div class="menu-settings">
      <div class="switch" role="group" data-label="language">
        <button type="button" data-language="de">DE</button>
        <button type="button" data-language="en">EN</button>
      </div>
      <div class="switch" role="group" data-label="theme">
        <button type="button" data-theme="light" aria-label="Light" title="Light">
          <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
          </svg>
        </button>
        <button type="button" data-theme="dark" aria-label="Dark" title="Dark">
          <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20.5 15.1A8.5 8.5 0 0 1 8.9 3.5 8.5 8.5 0 1 0 20.5 15.1Z"/>
          </svg>
        </button>
        <button type="button" data-theme="system" aria-label="System" title="System">
          <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>
          </svg>
        </button>
      </div>
      </div>
      <nav class="menu-information" aria-label="Information" data-label="information">
        <a href="about.html" data-information="about" data-copy="about">About</a>
        <a href="faq.html" data-information="faq" data-copy="faq">FAQ</a>
        <a href="imprint.html" data-information="imprint" data-copy="imprint">Imprint</a>
        <a href="privacy.html" data-information="privacy" data-copy="privacy">Privacy</a>
      </nav>
    </div>
  </div>
`;
