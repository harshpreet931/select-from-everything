# analytics

the site counts how the book gets used, so we know which chapters people finish, which figures they touch and which queries break. that's all it's for.

## how it works

- [posthog](https://posthog.com), eu cloud. the loader is in `src/lib/analytics.ts` and the root layout inlines it after hydration.
- it only starts on `sql.harshpreet.com` (from `site.url`). dev, previews and forks send nothing.
- requests go to `/ingest` on our own domain, which `vercel.json` rewrites to `eu.i.posthog.com` (and `/ingest/static/*` to `eu-assets.i.posthog.com`).
- `person_profiles: "identified_only"`, and we never call `identify`, so there are no person profiles. visitors are anonymous ids.
- the project key is shared with the java book (java.harshpreet.com). tell the two apart with `$host`.
- `track(event, props)` is the only way in. it does nothing on the server, during static export or when posthog isn't loaded, and it never throws.

## what is never sent

no names, emails or accounts (the site has none). no sql you typed or edited, no search text, no playground share links. props are small enums, counts and buckets.

## events

every event also carries `part` and `chapter` when it happens on a `/learn/<part>/<chapter>` page. posthog adds its usual `$pageview`, `$host` and `$current_url`.

| event | when | props |
| --- | --- | --- |
| `sql_run` | a runnable block in a chapter finishes | `result` (ok, error, timeout, stopped, setup_error, fatal), `golden` (same, differs, edited, volatile, none), `ms` (bucket), `sqlstate` (on error), `statements`, `db`, `edited`, `block` (1-based position on the page), `block_id` (content hash) |
| `playground_run` | a run in /play finishes | `result`, `ms`, `sqlstate`, `statements`, `db`, `how` (all, statement, peek), `example` (an unedited example), `keep` |
| `playground_shared` | the share button copies a link | `db` |
| `quiz_answered` | a quiz or predict gets an answer | `kind` (quiz, predict), `correct`, `attempt`, `quiz` (position on the page) |
| `figure_interacted` | the first click, drag or key inside a figure, once per figure per page view | `figure` (position on the page), `stepper`, `via` (click, key, input) |
| `search_used` | a search query settles for 1.2 s | `length`, `results` |
| `search_result_opened` | a search result is opened | `rank`, `kind` (chapter, term, text) |
| `theme_toggled` | the theme button or the `t` key | `to` (light, dark), `via` (button, key) |
| `chapter_finished` | a chapter is marked read for the first time | `part`, `chapter`, `finished` (how many chapters this browser has finished) |
| `code_copied` | a code block's copy button | `lang`, `block`, `edited` |
| `outbound_clicked` | a link off the site | `host`, `url` (origin and path, no query) |
| `not_found` | the 404 page renders | `path`, `from` (referrer host) |

`ms` buckets: `<100ms`, `100-500ms`, `0.5-2s`, `2-10s`, `>10s`.

## adding one

keep the list short. use a snake_case past-tense name, add it to the table above, and send only enums, counts and buckets. figures don't need their own events: `<Figure>` and `useStepper` both report `figure_interacted`.
