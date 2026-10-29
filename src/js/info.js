import { mountApplicationHeader } from './header.mjs?v=59';
// Information pages do not initialize timers, recovery or development services.
const applicationHeader = mountApplicationHeader();
const labels = {
    en: { about: 'About', faq: 'FAQ', imprint: 'Imprint', privacy: 'Privacy Policy', back: { quick:'Back to Timer', session:'Back to Session', editor:'Back to Session Editor', stopwatch:'Back to Stopwatch', default:'Go to Timer' }, navigation: 'Information' },
    de: { about: 'Über easyTimer', faq: 'FAQ', imprint: 'Impressum', privacy: 'Datenschutz', back: { quick:'Zurück zum Timer', session:'Zurück zur Session', editor:'Zurück zum Session-Editor', stopwatch:'Zurück zur Stoppuhr', default:'Zum Timer' }, navigation: 'Informationen' },
};
const preference = (key, fallback, allowed) => {
    try { const value = localStorage.getItem(key); return allowed.includes(value) ? value : fallback; }
    catch { return fallback; }
};
const requested = new URL(location.href).searchParams.get('lang');
let language = ['de', 'en'].includes(requested) ? requested
    : preference('easyTimerLanguage', navigator.language?.startsWith('de') ? 'de' : 'en', ['de', 'en']);
let theme = preference('easyTimerTheme', 'system', ['light', 'dark', 'system']);
// All information documents read the same origin; none replaces or consumes it.
let returnToOrigin = false;
let originatingView;
try {
    const origin = JSON.parse(sessionStorage.getItem('easyTimerInformationOrigin.v1'));
    returnToOrigin = ['quick', 'session', 'editor'].includes(origin?.view);
    if (returnToOrigin) originatingView = origin.view;
} catch { /* Direct visits and unavailable storage use the normal app entry. */ }
function render() {
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
    applicationHeader.renderPreferences(language, theme);
    document.querySelectorAll('.mode-choice').forEach(button => button.setAttribute('aria-pressed', 'false'));
    document.querySelectorAll('[data-info-language]').forEach(article => { article.hidden = article.lang !== language; });
    document.title = `${document.querySelector(`[data-info-language="${language}"] h1`).textContent} · easyTimer`;
    document.querySelectorAll('[data-info-page]').forEach(link => {
        link.textContent = labels[language][link.dataset.infoPage];
        link.href = `${link.dataset.infoPage}.html?lang=${language}`;
    });
    document.querySelectorAll('[data-information]').forEach(link => {
        link.href = `${link.dataset.information}.html?lang=${language}`;
        if (location.pathname.endsWith('/' + link.dataset.information + '.html')) link.setAttribute('aria-current', 'page');
    });
    document.querySelectorAll('[data-info-back]').forEach(link => {
        const label = link.querySelector('span') || link;
        // The label map can grow with future views; navigation validation is unchanged.
        label.textContent = labels[language].back[originatingView] || labels[language].back.default;
        link.href = returnToOrigin ? './?from=information' : './';
    });
    document.querySelector('.info-navigation').setAttribute('aria-label', labels[language].navigation);
    document.querySelectorAll('[data-info-switch]').forEach(link => {
        if (link.dataset.infoSwitch === language) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
    });
}
applicationHeader.bindPreferences(next => {
    language = next;
    try { localStorage.setItem('easyTimerLanguage', language); } catch { /* Switching remains available without storage. */ }
    const url = new URL(location.href); url.searchParams.set('lang', language);
    history.replaceState(null, '', url);
    render();
}, next => {
    theme = next;
    try { localStorage.setItem('easyTimerTheme', theme); } catch { /* Keep this page usable without storage. */ }
    render();
});
for (const [id, view] of [['open-quick', 'quick'], ['open-session', 'session'], ['open-planner', 'editor']]) {
    document.getElementById(id).addEventListener('click', () => {
        // Only a navigation request; protected application actions run after recovery.
        location.assign(`./?from=information&open=${view}`);
    });
}
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
