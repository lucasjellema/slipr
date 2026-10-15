# Prompt kit results (I-080)

How well chatbots write a valid `show.json` from the prompt kit (`docs/ai/prompts/`, made by `npm run prompt`; spec `docs/specs/I-080-prompt-kit.md`). Add a row for every try, and tune the generator (`shared/prompt-kit.js`) when a mistake repeats.

**How to try:** open `viewer/create-with-ai.html`, choose the template and length, fill in the brief below, copy the instruction into a **new** chat, save the answer as `show.json` in an empty folder and open it with the viewer's **Open a show folder…**. Count a show as *valid* when the viewer shows it (missing-image warnings are expected: images are placeholders). When it has errors, send **Copy fix-up prompt** once and record whether the second answer is valid.

## Briefs

1. **Solar panels at home** (Slipr Default, full). Topic: an introduction to rooftop solar panels: how they work, whether a roof is suitable, costs and yield, using the power yourself, installation, next steps. Audience: homeowners at an energy co-op evening. Slides: 7. Reader layer: yes. Profiles: Homeowner, Installer. Language: en.
2. **Je eerste 30 dagen** (Conclusion, full). Topic: onboarding for new consultants: week 1, weeks 2 to 4, buddy and manager. Audience: new hires on their first day. Slides: 7. Reader layer: yes. Profiles: none. Language: nl.
3. **Team update Q3 2026** (Slipr Default, compact). Topic: a quarterly update: highlights, a table of numbers (deploys per week 12 → 31, build time 18 → 9 min, incidents 4 → 2), the topics of the quarter, plans for Q4. Audience: the department. Slides: 6. Reader layer: no. Profiles: none. Language: en.

## Results

| Date | Chatbot | Brief | Variant | Valid first time? | Errors | Other warnings | Missing images | After fix-up | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-15 | Claude (Opus 5.5, the session that built the kit) | 1 | full | yes | 0 | 0 | 1 | — | Used `diagram`, `table`, `two-column`, `image-full` layouts; glossary aliases, profiles, a path |
| 2026-10-15 | Claude (Opus 5.5, the session that built the kit) | 2 | full | yes | 0 | 0 | 3 | — | Rendered in reader mode; used `agenda`, `boxes-9`, `people-2`, `quote-box`; Dutch text within the slot limits |
| 2026-10-15 | Claude (Opus 5.5, the session that built the kit) | 3 | compact | yes | 0 | 0 | 0 | — | `table` and `tag-cloud` slides; summaries only, as asked |
| | ChatGPT | 1 | full | | | | | | *Lucas* |
| | ChatGPT | 2 | full | | | | | | *Lucas* |
| | ChatGPT | 3 | compact | | | | | | *Lucas* |
| | Copilot | 1 | full | | | | | | *Lucas* |
| | Copilot | 2 | full | | | | | | *Lucas* |
| | Copilot | 3 | compact | | | | | | *Lucas* |

The Claude rows are a weak test: they were written by the same model, in the same session that wrote the prompt, and it knows the format beyond what the prompt says. A fresh chat in Claude.ai belongs in the table too.
