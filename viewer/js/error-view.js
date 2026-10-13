// @ts-check
/** Readable pages for "no show given", "could not load" and "invalid show". */
import { h } from './dom.js';

/** @typedef {import('../../shared/schema-check.js').Issue} Issue */

const DEMO = '../shows/demo/show.json';

/**
 * @param {HTMLElement} app
 * @param {{
 *   onOpenFolder?: () => Promise<void>,
 *   onOpenZip?: () => Promise<void>,
 *   onDropZip?: (file: File) => Promise<void>,
 *   recentArchives?: import('../../shared/archive-handles.js').ArchiveRecord[]
 * }} [options]
 */
export function showHelp(app, { onOpenFolder, onOpenZip, onDropZip, recentArchives } = {}) {
  document.title = 'Slipr Viewer';
  const demoLink = `?show=${encodeURIComponent(DEMO)}`;

  const openButtons = [];
  if (onOpenZip) {
    const zipButton = h('button', { type: 'button', class: 'slipr-page-button' }, ['Open zip archive…']);
    zipButton.addEventListener('click', () => {
      onOpenZip().catch((err) => showLoadError(app, { title: 'The zip file could not be opened', message: err instanceof Error ? err.message : String(err) }));
    });
    openButtons.push(zipButton);
  }

  if (onOpenFolder) {
    const folderButton = h('button', { type: 'button', class: 'slipr-page-button slipr-page-button--secondary' }, ['Open a show folder…']);
    folderButton.addEventListener('click', () => {
      onOpenFolder().catch((err) => showLoadError(app, { title: 'The folder could not be opened', message: err instanceof Error ? err.message : String(err) }));
    });
    openButtons.push(folderButton);
  }

  let openSection = null;
  if (openButtons.length > 0) {
    const zone = h('div', { class: 'slipr-drop-zone' }, [
      h('div', { style: 'display: flex; gap: 0.75rem; justify-content: center; align-items: center; flex-wrap: wrap; margin-bottom: 0.6rem;' }, openButtons),
      h('p', { class: 'slipr-hint', style: 'margin: 0;' }, [
        onOpenFolder
          ? 'Open a show folder or .zip / .slipr archive from this computer, or drag & drop a zip file here'
          : 'Open a .zip or .slipr archive from this computer, or drag & drop it here',
      ]),
    ]);

    if (onDropZip) {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        zone.classList.add('is-dragover');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('is-dragover');
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('is-dragover');
        const file = e.dataTransfer?.files?.[0];
        if (file) {
          onDropZip(file).catch((err) => showLoadError(app, { title: 'The zip file could not be opened', message: err instanceof Error ? err.message : String(err) }));
        }
      });
    }

    openSection = zone;
  }

  let recentList = null;
  if (recentArchives && recentArchives.length > 0) {
    const items = recentArchives.slice(0, 5).map((rec) => {
      const title = rec.title ? `${rec.title} (${rec.name})` : rec.name;
      const link = h('a', { href: `?archive=${encodeURIComponent(rec.key)}` }, [title]);
      return h('li', {}, [link]);
    });
    recentList = h('div', {}, [
      h('h2', {}, ['Recent archives in this browser']),
      h('ul', { class: 'slipr-archive-list' }, items),
    ]);
  }

  app.replaceChildren(h('article', { class: 'slipr-page' }, [
    h('h1', {}, ['Slipr Viewer']),
    openSection,
    recentList,

    h('h2', {}, ['Open by URL parameter']),
    h('p', {}, ['Tell the viewer which show to open with the ', h('code', {}, ['show']), ' parameter:']),
    h('p', {}, [h('code', {}, [`viewer/?show=${DEMO}`])]),
    h('p', {}, ['Or open a presentation directly from a zip file URL with the ', h('code', {}, ['zip']), ' parameter:']),
    h('p', {}, [h('code', {}, [`viewer/?zip=https://example.com/show.zip`])]),
    h('h2', {}, ['Try it']),
    h('ul', {}, [
      h('li', {}, [h('a', { href: demoLink }, ['Demo show, audience mode']), ' (press S for speaker notes, P for phone remote, O for the overview)']),
      h('li', {}, [h('a', { href: `${demoLink}&mode=reader` }, ['Demo show, reader mode'])]),
      h('li', {}, [h('a', { href: `?show=${encodeURIComponent('../shows/fixtures/broken/show.json')}` }, ['An invalid show']), ' (shows the error page)']),
    ]),
    h('h2', {}, ['Documentation']),
    h('p', {}, [h('a', { href: 'help.html' }, ['User manual (help.html)']), ' — complete guide for Audience & Reader modes, phone remote setup, keyboard shortcuts, and troubleshooting.']),
  ]));
}

/**
 * Prompt user when multiple presentations are found in the archive.
 * @param {HTMLElement} app
 * @param {{ name: string, candidateShows: string[], onSelect: (path: string) => Promise<void> }} options
 */
export function showArchiveChoice(app, { name, candidateShows, onSelect }) {
  document.title = `Slipr: choose show in ${name}`;
  const buttons = candidateShows.map((path) => {
    const display = path ? path.replace(/\/$/, '') : '(root)';
    const btn = h('button', {
      type: 'button',
      class: 'slipr-page-button slipr-page-button--secondary',
      style: 'margin-bottom: 0.5rem; display: block; width: 100%; text-align: left; padding: 0.6rem 0.8rem;',
    }, [display]);
    btn.addEventListener('click', () => {
      onSelect(path).catch((err) => showLoadError(app, { title: 'Could not open show', message: err instanceof Error ? err.message : String(err) }));
    });
    return btn;
  });

  app.replaceChildren(h('article', { class: 'slipr-page' }, [
    h('h1', {}, [`Choose presentation in “${name}”`]),
    h('p', {}, [`The archive contains multiple presentations. Choose which one to open:`]),
    h('div', { style: 'margin-top: 1rem;' }, buttons),
    h('p', { class: 'slipr-hint', style: 'margin-top: 1.5rem;' }, [
      h('a', { href: location.pathname }, ['← Back to start']),
    ]),
  ]));
}


/**
 * Display download or extraction progress.
 * @param {HTMLElement} app
 * @param {{ title: string, percent: number | null, detail?: string }} progress
 */
export function showProgress(app, { title, percent, detail }) {
  document.title = 'Slipr: Loading…';
  const bar = percent !== null
    ? h('div', { class: 'slipr-progress-bar', role: 'progressbar', 'aria-valuenow': String(percent), 'aria-valuemin': '0', 'aria-valuemax': '100' }, [
        h('div', { class: 'slipr-progress-fill', style: `width: ${percent}%` }),
      ])
    : h('div', { class: 'slipr-progress-bar slipr-progress-bar--indeterminate' }, [
        h('div', { class: 'slipr-progress-fill' }),
      ]);

  app.replaceChildren(h('article', { class: 'slipr-page', role: 'status' }, [
    h('h1', {}, [title]),
    bar,
    detail ? h('p', { class: 'slipr-hint', style: 'margin-top: 0.75rem;' }, [detail]) : null,
  ]));
}

/**
 * Reading a remembered show folder needs permission again: ask from a click.
 * @param {HTMLElement} app
 * @param {{ name: string, onGrant: () => Promise<void> }} options
 */
export function showAccessPage(app, { name, onGrant }) {
  document.title = `Slipr: open ${name}`;
  const button = h('button', { type: 'button', class: 'slipr-page-button' }, ['Allow access']);
  const status = h('p', { class: 'slipr-hint', role: 'status' });
  button.addEventListener('click', () => {
    status.textContent = '';
    onGrant()
      .then(() => {
        if (button.isConnected) status.textContent = 'Access was not granted.';
      })
      .catch((err) => showLoadError(app, { title: 'This show could not be loaded', message: err instanceof Error ? err.message : String(err) }));
  });
  app.replaceChildren(h('article', { class: 'slipr-page' }, [
    h('h1', {}, [`Open “${name}”`]),
    h('p', {}, ['Your browser asks you to allow Slipr to read this show folder again.']),
    h('p', {}, [button]),
    status,
  ]));
  button.focus();
}

/**
 * @param {HTMLElement} app
 * @param {{ title: string, message: string, url?: string, serverHint?: boolean }} problem
 *   serverHint: the server could not be reached at all, so explain how to start it.
 */
export function showLoadError(app, problem) {
  document.title = 'Slipr: show could not be loaded';
  const paragraphs = problem.message.split('\n\n').filter(Boolean);
  const elements = paragraphs.map((p) => {
    if (p.includes('\n  - ') || p.includes('\n• ')) {
      const lines = p.split('\n');
      const intro = lines[0];
      const items = lines.slice(1).filter((l) => l.trim().length > 0);
      return h('div', {}, [
        h('p', {}, [intro]),
        h('ul', {}, items.map((it) => h('li', {}, [it.replace(/^(\s*[-•]\s*)/, '')]))),
      ]);
    }
    return h('p', {}, [p]);
  });

  app.replaceChildren(h('article', { class: 'slipr-page slipr-page--error', role: 'alert' }, [
    h('h1', {}, [problem.title]),
    ...elements,
    problem.serverHint ? h('p', { class: 'slipr-hint' }, ['Start the dev server from the Slipr folder with ', h('code', {}, ['npm run serve']), ' and open the viewer via ', h('code', {}, ['http://localhost:8080/viewer/']), '.']) : null,
  ]));
}

/**
 * @param {HTMLElement} app
 * @param {{ showUrl: URL, errors: Issue[], warnings: Issue[], title?: string }} report
 */
export function showValidationErrors(app, report) {
  document.title = 'Slipr: show has errors';
  const n = report.errors.length;
  app.replaceChildren(h('article', { class: 'slipr-page slipr-page--error', role: 'alert' }, [
    h('h1', {}, [`This show can't be shown yet`]),
    h('p', {}, [
      report.title ? `“${report.title}” has ` : 'The show has ',
      `${n} error${n === 1 ? '' : 's'} that must be fixed first.`,
    ]),
    h('p', {}, [h('code', {}, [report.showUrl.pathname])]),
    issueList(report.errors, 'slipr-issues'),
    report.warnings.length > 0 && h('h2', {}, [`Also ${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'}`]),
    report.warnings.length > 0 && issueList(report.warnings, 'slipr-issues slipr-issues--warnings'),
    h('p', { class: 'slipr-hint' }, [
      'Tip: open show.json in VS Code inside the Slipr folder: the schema gives autocomplete and underlines most mistakes as you type.',
    ]),
  ]));
}

/** @param {Issue[]} issues @param {string} cls */
function issueList(issues, cls) {
  return h('ul', { class: cls }, issues.map((i) => h('li', {}, [h('code', {}, [i.path || '(root)']), i.message])));
}
