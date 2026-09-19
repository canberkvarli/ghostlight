# Outreach

The App Store will not find you an audience at 169 impressions a quarter. You have to go
where actors already are. The advantage you have over every competitor is that you are one —
these are written to be sent by an actor, because they will be.

**The one rule: never post as "the founder of Ghost Light".** Actors have a finely tuned
detector for being marketed to, and r/acting bans app promo on sight. You are a working actor
who got sick of a problem and built something. That is true, so say it.

---

## 1. Reddit

r/acting (~700k), r/Theatre, r/actingclass, r/CommunityTheatre. Read each one's self-promo
rule before posting — r/acting requires you to be an established participant, so **comment
genuinely for two weeks first**. A new account dropping a link gets removed in minutes and
burns the subreddit permanently.

### The post that works

> **Title:** I got tired of hearing the same 6 monologues at every audition, so I built a
> searchable database of 19,000 of them
>
> I've been acting in the Bay Area for a few years — four shows with Inferno Theatre, a couple
> of leads around Berkeley. The thing that kept getting me was sitting in a hallway hearing
> the person before me start the exact monologue I'd prepared.
>
> So I spent the last while building a thing that tags every monologue by how *overdone* it
> is. You set a threshold and the warhorses disappear. Under that it's the normal stuff —
> filter by age, gender, length, comic or dramatic, stage or screen.
>
> It's 19,000+ pieces from 2,000+ plays. Free to search, three full reads free, paid after
> that — I'm not going to pretend otherwise, but you can find your piece without paying.
>
> Genuinely want feedback on the overdone scoring, because that's the part I'm least sure
> about. What pieces are you sick of hearing? I'll get them weighted properly.
>
> [link]

**Why it works:** it opens with a shared grievance, the credential is specific and checkable,
the paywall is disclosed before anyone finds it themselves, and the ask is for *help* — which
gives people a reason to comment, which is what the algorithm rewards.

**Then answer every single reply for 48 hours.** The comments are the post.

---

## 2. The overdone-list play

This is your best organic idea and it costs nothing. **Post the list, not the app.**

> "I scored 19,000 monologues by how often they're performed. Here are the 25 most overdone
> pieces in the American audition circuit."

Put it on Reddit, on Instagram as a carousel, as a TikTok. It is inherently argument-provoking
— every actor has an opinion about whether Saint Joan belongs on it — and arguments are reach.
The app is the footnote, not the pitch.

Generate the list straight from the data:

```sql
select p.title, p.author, m.character_name, m.overdone_score
from monologues m join plays p on p.id = m.play_id
where m.overdone_score >= 0.7
order by m.overdone_score desc, m.view_count desc nulls last
limit 25;
```

---

## 3. Instagram / TikTok

Run `scripts/cards.mjs` weekly (see `docs/growth/README.md`). Post one card a day. Captions
are generated alongside each card.

The format that outperforms a static card: **film yourself doing the monologue**, 30–45
seconds, card as the end frame. You are an actor; this is free content you are uniquely able
to make, and a face outperforms a graphic every time on both platforms.

Hashtags are in each generated `.txt`. Do not add more than ~15.

---

## 4. Drama teachers and acting coaches

The highest-leverage channel and the slowest. One teacher who likes this puts it in front of
thirty students a year, every year.

Target: Bay Area first (you can offer to come in person, which nobody else can), then
university BFA/MFA programmes, then private coaches.

### Email

> **Subject:** A monologue database for your students — free access if it's useful
>
> Hi [name],
>
> I'm Canberk, an actor in Berkeley — four productions with Inferno Theatre and a couple of
> leads around town.
>
> I built an app that came out of my own auditioning problem: I kept preparing pieces that
> everyone else was also preparing. It's a searchable library of 19,000+ monologues from
> 2,000+ plays, filterable by age, gender, length and tone — and every piece is scored by how
> overdone it is, so students can deliberately avoid what the panel has heard four times that
> morning.
>
> I'd like to give your students free access. No catch and nothing to sign — I'd rather it
> get used by people learning than sit at a price nobody pays. If it's useful I'd love to
> know what's missing from it.
>
> Happy to come talk to a class about audition prep if that's ever useful — I'm local.
>
> [link]
>
> Canberk Varli

**The free-access offer is the whole email.** Teachers are pitched constantly and almost never
given anything. Honour it — a promo code batch in App Store Connect costs you nothing and buys
you the only channel here that compounds.

---

## 5. Where not to bother

- **Product Hunt / Hacker News.** Wrong audience entirely. They are not auditioning.
- **Paid influencer posts.** Not at this budget, and actor-influencer rates are absurd.
- **Facebook groups**, unless you are already a member. Same ban dynamics as Reddit, less reach.
- **Apple Search Ads** — not *never*, but not until the funnel is instrumented. See the README.

---

## Tracking what worked

Every link you post should carry a campaign token so App Store Connect can attribute it:

```
https://apps.apple.com/app/id6804278673?pt=<provider>&ct=reddit-acting-overdone&mt=8
```

Change `ct=` per post. It shows up under Analytics → Acquisition → Campaigns, which is
currently empty — meaning right now you cannot tell a Reddit install from a search install.
That is a one-character-per-link fix and it is the difference between knowing and guessing.
