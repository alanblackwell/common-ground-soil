// View 4: cross-disciplinary notes attached to places on the map.
import { THREADS, ROLES } from '../notes.js';
import { t, lang } from '../i18n.js';
import { setState } from '../state.js';
import { countryName, esc } from '../ui.js';

export function render(app, D, state) {
  const L = lang();
  const current = THREADS.find((th) => th.id === state.thread) || THREADS[0];
  app.innerHTML = `
  <section>
    <div class="view-head"><div>
      <h2>${t('dlg.title')}</h2>
      <p>${t('dlg.intro')}</p>
    </div></div>
    <p class="note-synthetic">${t('dlg.note')}</p>
    <div class="threads">
      <ul class="thread-list">
        ${THREADS.map((th) => `<li><button data-thread="${th.id}" aria-current="${th.id === current.id}">
          <span class="t">${esc(th.title[L])}</span>
          <span class="state-tag ${th.state}">${t(`dlg.state.${th.state}`)}</span>
          <span class="small muted"> · ${esc(placeName(D, th.sel))} · ${th.msgs.length} ${t('dlg.messages')}</span>
        </button></li>`).join('')}
      </ul>
      <article class="card">
        <div class="crumbs small muted">${esc(placeName(D, current.sel))}</div>
        <h3 style="font-size:18px">${esc(current.title[L])}</h3>
        <span class="state-tag ${current.state}">${t(`dlg.state.${current.state}`)}</span>
        ${current.msgs.map((m) => `<div class="msg ${m.role}">
          <div class="who"><span class="pill ${m.role}">${ROLES[m.role][L]}</span>
            ${m.who ? `<span>${esc(countryName(D, m.who))}</span>` : ''}<span>${formatDate(m.date)}</span></div>
          <p>${esc(m[L])}</p></div>`).join('')}
        <div class="toolbar" style="margin-top:12px">
          <button class="tour-btn" id="dlg-show">${t('dlg.showMap')}</button>
        </div>
        <div class="composer">${t('dlg.composer')}</div>
      </article>
    </div>
  </section>`;

  app.querySelectorAll('[data-thread]').forEach((b) => b.addEventListener('click', () => setState({ thread: b.dataset.thread })));
  app.querySelector('#dlg-show').addEventListener('click', () => {
    const a = D.admins.find((x) => x.iso === current.sel.iso && x.name === current.sel.name);
    setState({ view: 'map', ...current.show, sel: a ? { type: 'admin', id: a.i } : null });
  });
}

function placeName(D, sel) {
  return `${sel.name}, ${countryName(D, sel.iso)}`;
}

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(lang() === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
