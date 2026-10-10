// @ts-check
/** Readable pages for "no show given", "could not load" and "invalid show". */
import { h } from './dom.js';

/** @typedef {import('../../shared/schema-check.js').Issue} Issue */

const DEMO = '../shows/demo/show.json';

/** @param {HTMLElement} app */
export function showHelp(app) {
  document.title = 'Slipr Viewer';
  const demoLink = `?show=${encodeURIComponent(DEMO)}`;
  app.replaceChildren(h('article', { class: 'slipr-page' }, [
    h('h1', {}, ['Slipr Viewer']),
    h('p', {}, ['Tell the viewer which show to open with the ', h('code', {}, ['show']), ' parameter:']),
    h('p', {}, [h('code', {}, [`viewer/?show=${DEMO}`])]),
    h('h2', {}, ['Try it']),
    h('ul', {}, [
      h('li', {}, [h('a', { href: demoLink }, ['Demo show, audience mode']), ' (press S for speaker notes, O for the overview)']),
      h('li', {}, [h('a', { href: `${demoLink}&mode=reader` }, ['Demo show, reader mode'])]),
      h('li', {}, [h('a', { href: `?show=${encodeURIComponent('../shows/fixtures/broken/show.json')}` }, ['An invalid show']), ' (shows the error page)']),
    ]),
  ]));
}

/**
 * @param {HTMLElement} app
 * @param {{ title: string, message: string, url?: string, serverHint?: boolean }} problem
 *   serverHint: the server could not be reached at all, so explain how to start it.
 */
export function showLoadError(app, problem) {
  document.title = 'Slipr: show could not be loaded';
  app.replaceChildren(h('article', { class: 'slipr-page slipr-page--error', role: 'alert' }, [
    h('h1', {}, [problem.title]),
    h('p', {}, [problem.message]),
    problem.serverHint && h('p', { class: 'slipr-hint' }, ['Start the dev server from the Slipr folder with ', h('code', {}, ['npm run serve']), ' and open the viewer via ', h('code', {}, ['http://localhost:8080/viewer/']), '.']),
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
