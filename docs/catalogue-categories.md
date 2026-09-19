# Classical or contemporary

`plays.category` has two values and only two: **`classical`** and **`contemporary`**.

## What the words mean to an actor

The dividing line is roughly **1900**, and it is the one drama schools use. Auditions ask for
"one classical, one contemporary" — classical meaning Shakespeare, the Greeks, verse, the
Restoration; contemporary meaning everything modern. Some breakdowns tighten it to post-1950.

**It does not mean "the last twenty years."** When a notice wants genuinely recent work it says
so — "written in the last 10 years", "21st century", "a play from the last decade". Nobody
writes "contemporary" and means 2006.

The argued band is about **1890–1950**: Chekhov, Shaw, O'Neill, Coward, Strindberg. No two
panels agree on those, so no filter can be right for everyone. We put them with `classical`,
because our `contemporary` shelf is otherwise cleanly post-1941 and diluting it with pre-war
period work would make the filter answer the question worse.

## The `modern` bucket, and why it is gone

There used to be a third value, `modern`: 77 plays, 551 monologues. It was never an editorial
category. It was **an ingest artifact** — a scrape of what looks like a single ~1920 anthology
of one-act plays, where every play inherited the volume's publication year instead of its own.
Hence 60-odd plays all stamped `1920`, including Chekhov's *The Boor*, which is 1888.

Two other things that batch reveals, both still unfixed:

- **Duplicate authors under variant spellings.** Chekhov is in there as "Anton Tchekoff", and
  Shaw appears as both "Bernard Shaw" and "George Bernard Shaw". Any author-facing feature
  (filter, browse, the card generator's per-author dedupe) sees them as different people.
- **`year_written` is unreliable for that batch**, so anything keyed on year — including the
  card generator's pre-1900 rights cutoff — treats those plays as later than they are. That
  direction is safe for rights (it excludes rather than includes), but it is still wrong.

Folded into `classical` on 2026-09-19:

```sql
update plays set category='classical', updated_at=now() where category='modern';
-- 77 rows
```

`sourceTag()` in `src/components/Marks.tsx` used to map `modern` → the "contemporary" mark. That
branch is removed; it would now contradict the data. An unrecognised category still prints no
mark at all, which stays the right default.

## Where it is today

| category | plays | monologues |
|---|---|---|
| classical | 789 | 18,416 |
| contemporary | 1,804 | 5,547 |

No nulls — every play is categorised.

**Read the second column, not the first.** More contemporary *plays*, but 77% of the monologue
volume is classical: Shakespeare and the Greeks get mined for dozens of pieces each, a
contemporary play yields a handful. So an actor asked for a contemporary piece is served by
~5,500 monologues, not 19,000. That is a real library and a real gap at the same time, and it
is where catalogue work earns the most.

## The filter

`category` is a free filter, in the "(more filters.)" sheet under `(what era.)`. Free on
purpose: it is a requirement printed on the breakdown, not a craft preference, and charging for
the ability to answer the question the audition notice asked would be charging for the app's one
job.

It is `theatreOnly`. The Screen house has no plays in it, so the chips are hidden there,
`results.tsx` drops the param when the medium is `screen`, and crossing to Film & TV clears a
stale selection — a filter you can still feel but can no longer see is the worst of both.

The search API has accepted `category` all along (`search_monologues_api_monologues_search_get`
in `src/api/schema.d.ts`). Nothing on the backend needed to change.
