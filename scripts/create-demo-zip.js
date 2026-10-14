import { writeZip, readZip } from '../shared/zip.js';
import { validateShow } from '../shared/validate.js';
import { readFile, writeFile } from 'node:fs/promises';

async function main() {
  const templateJson = JSON.parse(await readFile('templates/default/template.json', 'utf8'));

  const show = {
    $schema: '../../shared/schema/show.schema.json',
    slipr: '0.1',
    id: 'quickstart-demo',
    meta: {
      title: 'Slipr Quickstart Demo',
      subtitle: 'Author once, deliver twice',
      author: 'Slipr Team',
      date: '2026-10-13',
      language: 'en',
      description: 'A compact demo show packaged as a zip archive to test import and export.'
    },
    template: {
      ref: '/templates/default'
    },
    settings: {
      aspectRatio: '16:9',
      transition: 'fade',
      slideNumbers: true,
      agenda: true
    },
    chapters: [
      { id: 'intro', title: 'Introduction' },
      { id: 'features', title: 'Key Features' }
    ],
    slides: [
      {
        id: 's-welcome',
        layout: 'title',
        chapter: 'intro',
        content: {
          title: 'Welcome to Slipr',
          subtitle: 'Author once, deliver twice',
          byline: 'Slipr Quickstart Guide'
        },
        notes: 'Welcome everyone! Today we demonstrate how Slipr bridges audience presentations and reader documents.',
        reader: {
          summary: 'An introduction to Slipr presentation concepts.',
          blocks: [
            {
              id: 'b-welcome-text',
              type: 'text',
              md: 'Slipr is designed for **modern browser-native presentations**. You write the show once, and it seamlessly serves two distinct needs:\n\n1. **Audience Mode**: Linear, visual, presenter-focused.\n2. **Reader Mode**: Interactive, self-paced, deep and personalized.'
            }
          ]
        }
      },
      {
        id: 's-two-modes',
        layout: 'two-column',
        chapter: 'intro',
        content: {
          title: 'Dual Experience',
          leftTitle: 'Audience Mode (Big Screen)',
          left: '- Focused on visual impact\n- Minimal text, maximum clarity\n- Animated transitions and steps\n- Speaker notes and timer (<kbd>S</kbd>)',
          rightTitle: 'Reader Mode (Self-Paced)',
          right: '- In-depth explanations\n- Interactive tabs and panels\n- Glossary definitions and popups\n- Custom reading depth and routes'
        },
        notes: 'Notice how the same slide carries clear points on screen, but gives the reader rich background context.',
        reader: {
          blocks: [
            {
              id: 'b-modes-callout',
              type: 'callout',
              variant: 'info',
              title: 'Why two modes?',
              md: 'Traditional decks often suffer from the *slideument* problem—trying to be both a live talk and a report at the same time. Slipr solves this by decoupling the audience view from the reader layer.'
            }
          ]
        }
      },
      {
        id: 's-bullets',
        layout: 'bullets',
        chapter: 'features',
        content: {
          title: 'Built for the Open Web',
          body: [
            'Pure ES modules and vanilla JS: zero runtime npm dependencies',
            'Works completely offline once loaded',
            'Full privacy: local reader notes, bookmarks, and drafts',
            'Zip archive portable format (.zip and .slipr)'
          ]
        },
        notes: 'Highlight our design principles: D-001, D-002, D-010.',
        reader: {
          blocks: [
            {
              id: 'b-features-details',
              type: 'details',
              title: 'Learn more about technical architecture',
              open: true,
              md: 'Slipr loads data directly in the browser using the File System Access API or zip archives in memory. All state flows unidirectionally through the editor store.'
            }
          ]
        }
      },
      {
        id: 's-image',
        layout: 'image-full',
        chapter: 'features',
        content: {
          title: 'Embedded Assets',
          image: {
            src: 'images/badge.svg',
            alt: 'Slipr verified badge',
            fit: 'contain'
          },
          caption: 'Shows package their images, charts, and documents inside the archive.'
        },
        notes: 'Show how easy it is to replace or add pictures in the editor.',
        reader: {
          blocks: [
            {
              id: 'b-img-note',
              type: 'text',
              md: 'When you export a show to zip, all referenced images in `images/` are packaged alongside `show.json`.'
            }
          ]
        }
      },
      {
        id: 's-conclusion',
        layout: 'section',
        content: {
          kicker: 'Next Steps',
          title: 'Try It Out!',
          subtitle: 'Edit slides, drop images, and export to zip or HTML.'
        },
        notes: 'Conclude the presentation and invite the audience to try Slipr.'
      }
    ]
  };

  // Validate the show structure against our schema and validator
  const validation = validateShow(show, { template: templateJson });
  if (!validation.ok) {
    console.error('Validation errors:', validation.errors);
    process.exit(1);
  }
  console.log('Validation passed successfully! Warnings:', validation.warnings);

  const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1f3a5f"/>
      <stop offset="100%" stop-color="#0969da"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" rx="32" fill="url(#grad)"/>
  <circle cx="300" cy="180" r="100" fill="#ffffff" opacity="0.1"/>
  <circle cx="300" cy="180" r="70" fill="#f2a900"/>
  <polygon points="280,145 340,180 280,215" fill="#1f3a5f"/>
  <text x="300" y="320" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="3">SLIPR ARCHIVE</text>
  <text x="300" y="355" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#e2e8f0" text-anchor="middle">Self-Contained Show Package</text>
</svg>
`;

  const files = {
    'show.json': JSON.stringify(show, null, 2) + '\n',
    'images/badge.svg': badgeSvg
  };

  const zipBytes = await writeZip(files, { deflate: true });
  await writeFile('quickstart-demo.zip', zipBytes);
  console.log(`Successfully created quickstart-demo.zip (${zipBytes.byteLength} bytes)`);

  const readBack = await readZip(zipBytes);
  console.log('Verified archive entries:', Array.from(readBack.keys()));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
