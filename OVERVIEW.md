# Documentation overview

Slipr is documented in a fixed set of files. Each file has one job and one main reader. This page explains which file to read or update, and when.

## The files

| File | Answers the question | Main reader | Updated when |
|---|---|---|---|
| `README.md` | *What can it do and how do I use it?* | End user (the presenter) | A user-visible feature is added or changed |
| `ARCHITECTURE.md` | *How is it built and how do the parts fit together?* | Developers, human or AI | Structure, modules, data flow or technology changes |
| `CHANGELOG.md` | *What changed, and when?* | Everyone | With every meaningful change, newest entry on top |
| `CLAUDE.md` | *What does an AI coding agent need to start working here safely?* | AI coding agents (Claude Code and similar) | Conventions, commands or pitfalls change |
| `BACKLOG.md` | *What could or should we build next?* | Lucas and Claude, together | Ideas come up, priorities shift, work is finished |
| `ROADMAP.md` | *In what order do we build the big pieces?* | Lucas and Claude | A phase completes or the plan changes |
| `docs/decisions.md` | *Why is it built this way?* | Developers, human or AI | A significant technical choice is made or revised |
| `docs/show-format.md` | *What exactly is in a `show.json`?* | All components, plus anyone writing shows by hand | The show format changes (with a version bump) |
| `docs/template-format.md` | *What exactly is in a template?* | Template authors, all components | The template format changes (with a version bump) |
| `docs/specs/<ID>.md` | *What exactly are we building for this larger item, and what did Lucas decide?* | Lucas and Claude | Before a larger backlog item starts, and when its decisions or status change |
| `templates/<id>/README.md` | *Which layouts does this template have, and where do its assets come from?* | Template users and authors | A layout or asset is added or changed |

## Two levels: project and component

- The **root** files cover Slipr as a whole: the overall idea, the system architecture, the shared formats, and cross-cutting changes such as a new show-format version.
- Each **component** (`viewer/`, `editor/`, `converter/`) has its own `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md` and `CLAUDE.md`. These go deeper into that one application.

Claude Code reads the root `CLAUDE.md` automatically. It also picks up a component's `CLAUDE.md` when it works on files in that folder, so instructions that only apply to one component belong in that component's file.

## Where does it go? Rules of thumb

- It explains how to **use** something → `README.md`
- It explains how something **works inside** → `ARCHITECTURE.md`
- It records **what changed** → `CHANGELOG.md`
- It records **why** we chose an approach → `docs/decisions.md`
- It is a **rule, command or trap** an agent must know → `CLAUDE.md`
- It is **work that is not done yet** → `BACKLOG.md`

Avoid writing the same thing in two places. Link to the other file instead. For example, `CLAUDE.md` links to `ARCHITECTURE.md` rather than repeating it.

## Shared to-do list

**`BACKLOG.md`** is the shared work list for Lucas and Claude. It holds suggested features, known bugs and technical chores, each with an ID, a component and a status. Its header explains how both of us add, prioritize and close items.

`ROADMAP.md` is the coarse plan, made of phases. `BACKLOG.md` is the fine-grained list of items. A roadmap phase is usually carried out as a handful of backlog items.

## Naming

Files use the conventional upper-case names (`README.md`, `CLAUDE.md`, ...). Claude Code looks for `CLAUDE.md` by that exact name, and case matters on Linux and macOS, for example when Slipr is hosted or cloned elsewhere.
