// @ts-check
/**
 * Viewer entry: read URL parameters, load + validate the show, start a mode.
 *   ?show=<path to show.json>  (required)
 *   &mode=audience|reader      (default audience)
 */
import { loadShow, LoadError } from '../../shared/load.js';
import { addStylesheet, h } from './dom.js';
import { showHelp, showLoadError, showValidationErrors } from './error-view.js';

const app = /** @type {HTMLElement} */ (document.getElementById('app'));
const params = new URLSearchParams(location.search);
const showParam = params.get('show');
const mode = params.get('mode') === 'reader' ? 'reader' : 'audience';

main().catch((err) => {
  console.error(err);
  showLoadError(app, { title: 'Something went wrong', message: err instanceof Error ? err.message : String(err) });
});

async function main() {
  if (!showParam) {
    showHelp(app);
    return;
  }

  let ctx;
  try {
    ctx = await loadShow(showParam);
  } catch (err) {
    if (err instanceof LoadError) {
      const unreachable = err.kind === 'fetch' && err.status === undefined;
      showLoadError(app, { title: 'This show could not be loaded', message: err.message, url: err.url, serverHint: unreachable });
      return;
    }
    throw err;
  }

  const { validation, show } = ctx;
  if (validation.warnings.length) {
    console.groupCollapsed(`Slipr: ${validation.warnings.length} warning(s) in ${ctx.showUrl.pathname}`);
    for (const w of validation.warnings) console.warn(`${w.path}: ${w.message}`);
    console.groupEnd();
  }
  if (!validation.ok) {
    showValidationErrors(app, { showUrl: ctx.showUrl, errors: validation.errors, warnings: validation.warnings, title: show?.meta?.title });
    return;
  }

  document.title = `${show.meta.title} · Slipr`;
  document.documentElement.lang = show.meta.language ?? 'en';
  await addStylesheet(ctx.resolveTemplateAsset(ctx.template.theme));

  if (mode === 'audience') {
    const { startAudience } = await import('../audience/audience.js');
    await startAudience(app, ctx);
  } else {
    showReaderPlaceholder();
  }
}

/** Reader mode arrives in roadmap Phase 2. */
function showReaderPlaceholder() {
  const audienceUrl = new URL(location.href);
  audienceUrl.searchParams.delete('mode');
  app.replaceChildren(h('article', { class: 'slipr-page' }, [
    h('h1', {}, ['Reader mode is on its way']),
    h('p', {}, ['The interactive reader mode is built in the next phase of the Slipr roadmap.']),
    h('p', {}, [h('a', { href: audienceUrl.href }, ['Open this show in audience mode'])]),
  ]));
}
