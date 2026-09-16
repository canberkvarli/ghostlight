/**
 * Cold-start / offline fixture data. 16 monologues, hardcoded,
 * no network. Every one carries its full text (all public domain), so the
 * discover fallback and offline reads are always complete, never a fragment.
 *
 * Shapes deliberately match what `GET /api/monologues/search` returns so that
 * swapping this array for react-query in Step 3 touches the list and nothing else.
 *
 * Every excerpt here is public domain. Real search results will not be.
 */

export type SourceType = 'play' | 'film' | 'tv';
export type Gender = 'female' | 'male' | 'any';
export type Tone = 'dramatic' | 'comedic' | 'seriocomic';

export interface Monologue {
  id: string;
  title: string;
  source: string;
  author: string;
  character: string;
  ageRange: string;
  gender: Gender;
  tone: Tone;
  sourceType: SourceType;
  /**
   * The catalogue's raw `category` string, kept verbatim alongside the derived
   * `sourceType`. `sourceType` collapses it to play / film / tv, which throws
   * away the one thing the source tag needs: whether a play is classical or
   * contemporary. Absent on the fixtures below that predate it, and the tag
   * simply doesn't print when it's missing (see `sourceTag` in Marks.tsx).
   */
  category?: string;
  /**
   * Where the speech happens, in one sentence — the server's `scene_description`,
   * falling back to its `stage_directions`. The read screen sets it as a stage
   * direction above the first line, which is the one piece of context an actor
   * needs before the words and could not get anywhere in the app before.
   */
  sceneNote?: string;
  /** Seconds. The `max_duration` filter reads this. */
  duration: number;
  /** 0–100. Anything over 70 gets the badge; casting directors have heard it. */
  overdoneScore: number;
  /** The first two lines, in Courier. Actors judge a monologue by reading it. */
  excerpt: string;
  /**
   * The speech already broken into typed pieces by the backend — dialogue,
   * direction, interjection. Present on 8,201 of 14,418 rows. When it's here it
   * beats parsing `text`, because roughly a third of pieces carry stage
   * directions as plain unbracketed prose ("Bane folds the papers.") that no
   * amount of client-side pattern matching could reliably find.
   */
  segments?: { text: string; type: string }[];
  /**
   * The whole speech, for the Read screen. Optional in Step 0 — the list only
   * needs the excerpt, and the full text arrives from `GET /api/monologues/{id}`
   * in Step 3. Populated here only for the fixtures worth reading offline.
   */
  fullText?: string;
  /**
   * True when the server withheld the full text because the free reads are
   * spent (spec §7). `fullText` then holds only the teaser; the read screen
   * shows the wall. Server-authoritative — the client can't un-set it.
   */
  paywalled?: boolean;
  /**
   * Film & TV only (spec: the Screen house). The poster and screen metadata
   * come straight from Supabase's `film_tv_references` — see src/lib/screen.ts.
   * Absent for stage pieces, which have no poster.
   */
  posterUrl?: string;
  /** Release year of the film/series. */
  year?: number;
  /** IMDb rating, 0–10. */
  imdbRating?: number;
}

export const MONOLOGUES: Monologue[] = [
  {
    id: 'm-001',
    title: 'To be, or not to be',
    source: 'Hamlet',
    author: 'William Shakespeare',
    character: 'Hamlet',
    ageRange: '20s–30s',
    gender: 'male',
    tone: 'dramatic',
    sourceType: 'play',
    duration: 210,
    overdoneScore: 99,
    excerpt:
      'To be, or not to be, that is the question:\nWhether ’tis nobler in the mind to suffer',
    fullText: `To be, or not to be, that is the question:
Whether ’tis nobler in the mind to suffer
The slings and arrows of outrageous fortune,
Or to take arms against a sea of troubles
And by opposing end them. To die—to sleep,
No more; and by a sleep to say we end
The heart-ache and the thousand natural shocks
That flesh is heir to: ’tis a consummation
Devoutly to be wish’d. To die, to sleep;
To sleep, perchance to dream—ay, there’s the rub:
For in that sleep of death what dreams may come,
When we have shuffled off this mortal coil,
Must give us pause—there’s the respect
That makes calamity of so long life.

For who would bear the whips and scorns of time,
Th’oppressor’s wrong, the proud man’s contumely,
The pangs of dispriz’d love, the law’s delay,
The insolence of office, and the spurns
That patient merit of th’unworthy takes,
When he himself might his quietus make
With a bare bodkin? Who would fardels bear,
To grunt and sweat under a weary life,
But that the dread of something after death,
The undiscover’d country, from whose bourn
No traveller returns, puzzles the will,
And makes us rather bear those ills we have
Than fly to others that we know not of?

Thus conscience does make cowards of us all,
And thus the native hue of resolution
Is sicklied o’er with the pale cast of thought,
And enterprises of great pith and moment
With this regard their currents turn awry
And lose the name of action.`,
  },
  {
    id: "m-002",
    title: "We shall find peace",
    source: "Uncle Vanya",
    author: "Anton Chekhov",
    character: "Sonya",
    ageRange: "20s–30s",
    gender: "female",
    tone: "dramatic",
    sourceType: "play",
    duration: 119,
    overdoneScore: 20,
    excerpt: "What can we do?\nWe must live our lives.",
    fullText: "What can we do? We must live our lives. Yes, we shall live, Uncle Vanya. We shall live through the long procession of days before us, and through the long evenings; we shall patiently bear the trials that fate imposes on us; we shall work for others without rest, both now and when we are old; and when our last hour comes we shall meet it humbly, and there, beyond the grave, we shall say that we have suffered and wept, that our life was bitter, and God will have pity on us. Ah, then, dear, dear Uncle, we shall see that bright and beautiful life; we shall rejoice and look back upon our sorrow here; a tender smile–and–we shall rest. I have faith, Uncle, fervent, passionate faith. We shall rest. We shall rest. We shall hear the angels. We shall see heaven shining like a jewel. We shall see all evil and all our pain sink away in the great compassion that shall enfold the world. Our life will be as peaceful and tender and sweet as a caress. I have faith; I have faith. My poor, poor Uncle Vanya, you are cry ing! You have never known what happiness was, but wait, Uncle Vanya, wait! We shall rest. We shall rest.",
  },
  {
    id: "m-003",
    title: "Was this the face",
    source: "Doctor Faustus",
    author: "Christopher Marlowe",
    character: "Faustus",
    ageRange: "30s–40s",
    gender: "male",
    tone: "dramatic",
    sourceType: "play",
    duration: 79,
    overdoneScore: 0,
    excerpt: "Was this the face that launch'd a thousand ships, And burnt the topless towers of Ilium-- Sweet Helen, make me immort…",
    fullText: "Was this the face that launch'd a thousand ships, And burnt the topless towers of Ilium-- Sweet Helen, make me immortal with a kiss.-- Her lips suck forth my soul: see, where it flies!-- Come, Helen, come, give me my soul again. Here will I dwell, for heaven is in these lips, And all is dross that is not Helena. I will be Paris, and for love of thee, Instead of Troy, shall Wertenberg be sack'd; And I will combat with weak Menelaus, And wear thy colours on my plumed crest; Yea, I will wound Achilles in the heel, And then return to Helen for a kiss. O, thou art fairer than the evening air Clad in the beauty of a thousand stars; Brighter art thou than flaming Jupiter When he appear'd to hapless Semele; More lovely than the monarch of the sky In wanton Arethusa's azur'd arms; And none but thou shalt be my paramour!",
  },
  {
    id: "m-004",
    title: "A moment, Mr. Worthing",
    source: "The Importance of Being Earnest",
    author: "Oscar Wilde",
    character: "Lady Bracknell",
    ageRange: "50s",
    gender: "female",
    tone: "comedic",
    sourceType: "play",
    duration: 74,
    overdoneScore: 60,
    excerpt: "Come here.\nSit down.",
    fullText: "Come here. Sit down. Sit down immediately. Hesitation of any kind is a sign of mental decay in the young, of physical weakness in the old. Apprised, sir, of my daughter’s sudden flight by her trusty maid, whose confidence I purchased by means of a small coin, I followed her at once by a luggage train. Her unhappy father is, I am glad to say, under the impression that she is attending a more than usually lengthy lecture by the University Extension Scheme on the Influence of a permanent income on Thought. I do not propose to undeceive him. Indeed I have never undeceived him on any question. I would consider it wrong. But of course, you will clearly understand that all communication between yourself and my daughter must cease immediately from this moment. On this point, as indeed on all points, I am firm.",
  },
  {
    id: "m-005",
    title: "The forests of Russia",
    source: "Uncle Vanya",
    author: "Anton Chekhov",
    character: "Astroff",
    ageRange: "30s–40s",
    gender: "male",
    tone: "dramatic",
    sourceType: "play",
    duration: 155,
    overdoneScore: 30,
    excerpt: "You can burn peat in your stoves and build your sheds of stone.\nOh, I don't object, of course, to cutting wood from necessity, but why destroy the forests?",
    fullText: "You can burn peat in your stoves and build your sheds of stone. Oh, I don't object, of course, to cutting wood from necessity, but why destroy the forests? The woods of Russia are trembling under the blows of the axe. Millions of trees have perished. The homes of the wild animals and birds have been desolated; the rivers are shrinking, and many beautiful landscapes are gone forever. And why? Because men are too lazy and stupid to stoop down and pick up their fuel from the ground. Am I not right, Madame? Who but a stupid barbarian could burn so much beauty in his stove and destroy that which he cannot make? Man is endowed with reason and the power to create, so that he may increase that which has been given him, but until now he has not created, but demolished. The forests are disappearing, the rivers are running dry, the game is exterminated, the climate is spoiled, and the earth becomes poorer and uglier every day. I read irony in your eye; you do not take what I am saying seriously, and--and--after all, it may very well be nonsense. But when I pass peasant-forests that I have preserved from the axe, or hear the rustling of the young plantations set out with my own hands, I feel as if I had had some small share in improving the climate, and that if mankind is happy a thousand years from now I will have been a little bit responsible for their happiness. When I plant a little birch tree and then see it budding into young green and swaying in the wind, my heart swells with pride and I-- however-- I must be off. Probably it is all nonsense, anyway. Good-bye.",
  },
  {
    id: "m-006",
    title: "Men, lions, eagles",
    source: "The Sea-Gull",
    author: "Anton Chekhov",
    character: "Nina",
    ageRange: "20s–30s",
    gender: "female",
    tone: "dramatic",
    sourceType: "play",
    duration: 99,
    overdoneScore: 0,
    excerpt: "All men and beasts, lions, eagles, and quails, horned stags, geese, spiders, silent fish that inhabit the waves, star…",
    fullText: "All men and beasts, lions, eagles, and quails, horned stags, geese, spiders, silent fish that inhabit the waves, starfish from the sea, and creatures invisible to the eye--in one word, life--all, all life, completing the dreary round imposed upon it, has died out at last. A thousand years have passed since the earth last bore a living creature on her breast, and the unhappy moon now lights her lamp in vain. No longer are the cries of storks heard in the meadows, or the drone of beetles in the groves of limes. All is cold, cold. All is void, void, void. All is terrible, terrible-- The bodies of all living creatures have dropped to dust, and eternal matter has transformed them into stones and water and clouds; but their spirits have flowed together into one, and that great world-soul am I! In me is the spirit of the great Alexander, the spirit of Napoleon, of Caesar, of Shakespeare, and of the tiniest leech that swims. In me the consciousness of man has joined hands with the instinct of the animal; I understand all, all, all, and each life lives again in me.",
  },
  {
    id: "m-007",
    title: "How I got on",
    source: "Mrs. Warren's Profession",
    author: "George Bernard Shaw",
    character: "Mrs Warren",
    ageRange: "40s",
    gender: "female",
    tone: "dramatic",
    sourceType: "play",
    duration: 138,
    overdoneScore: 0,
    excerpt: "I mean that youre throwing away all your chances for nothing.\nYou think that people are what they pretend to be: that the way you were taught at school and college to thin…",
    fullText: "I mean that youre throwing away all your chances for nothing. You think that people are what they pretend to be: that the way you were taught at school and college to think right and proper is the way things really are. But it’s not: it’s all only a pretence, to keep the cowardly slavish common run of people quiet. Do you want to find that out, like other women, at forty, when you’ve thrown yourself away and lost your chances; or won’t you take it in good time now from your own mother, that loves you and swears to you that it’s truth: gospel truth? Vivie: the big people, the clever people, the managing people, all know it. They do as I do, and think what I think. I know plenty of them. I know them to speak to, to introduce you to, to make friends of for you. I don’t mean anything wrong: thats what you don’t understand: your head is full of ignorant ideas about me. What do the people that taught you know about life or about people like me? When did they ever meet me, or speak to me, or let anyone tell them about me? the fools! Would they ever have done anything for you if I hadn’t paid them? Havn’t I told you that I want you to be respectable? Havn’t I brought you up to be respectable? And how can you keep it up without my money and my influence and Lizzie’s friends? Can’t you see that youre cutting your own throat as well as breaking my heart in turning your back on me?",
  },
  {
    id: "m-008",
    title: "The old actor",
    source: "Swan Song",
    author: "Anton Chekhov",
    character: "Svietlovidoff",
    ageRange: "40s",
    gender: "male",
    tone: "dramatic",
    sourceType: "play",
    duration: 149,
    overdoneScore: 20,
    excerpt: "When I first went on the stage, in the first glow of passionate youth, I remember a woman loved me for my acting.\nShe was beautiful, graceful as a poplar, young, innocent,…",
    fullText: "When I first went on the stage, in the first glow of passionate youth, I remember a woman loved me for my acting. She was beautiful, graceful as a poplar, young, innocent, pure, and radiant as a summer dawn. Her smile could charm away the darkest night. I remember, I stood before her once, as I am now standing before you. She had never seemed so lovely to me as she did then, and she spoke to me so with her eyes--such a look! I shall never forget it, no, not even in the grave; so tender, so soft, so deep, so bright and young! Enraptured, intoxicated, I fell on my knees before her, I begged for my happiness, and she said: “Give up the stage!” Give up the stage! Do you understand? She could love an actor, but marry him--never! I was acting that day, I remember--I had a foolish, clown’s part, and as I acted, I felt my eyes being opened; I saw that the worship of the art I had held so sacred was a delusion and an empty dream; that I was a slave, a fool, the plaything of the idleness of strangers. I understood my audience at last, and since that day I have not believed in their applause, or in their wreathes, or in their enthusiasm. Yes, Nikitushka! The people applaud me, they buy my photograph, but I am a stranger to them. They don’t know me, I am as the dirt beneath their feet. They are willing enough to meet me . . . but allow a daughter or a sister to marry me, an outcast, never! I have no faith in them, no faith in them.",
  },
  {
    id: "m-009",
    title: "Tommy proposed again",
    source: "An Ideal Husband",
    author: "Oscar Wilde",
    character: "Mabel Chiltern",
    ageRange: "20s",
    gender: "female",
    tone: "comedic",
    sourceType: "play",
    duration: 151,
    overdoneScore: 30,
    excerpt: "Well, Tommy has proposed to me again.\nTommy really does nothing but propose to me.",
    fullText: "Well, Tommy has proposed to me again. Tommy really does nothing but propose to me. He proposed to me last night in the music-room, when I was quite unprotected, as there was an elaborate trio going on. I didn’t dare to make the smallest repartee, I need hardly tell you. If I had, it would have stopped the music at once. Musical people are so absurdly unreasonable. They always want one to be perfectly dumb at the very moment when one is longing to be absolutely deaf. Then he proposed to me in broad daylight this morning, in front of that dreadful statue of Achilles. Really, the things that go on in front of that work of art are quite appalling. The police should interfere. At luncheon I saw by the glare in his eye that he was going to propose again, and I just managed to check him in time by assuring him that I was a bimetallist. Fortunately I don’t know what bimetallism means. And I don’t believe anybody else does either. But the observation crushed Tommy for ten minutes. He looked quite shocked. And then Tommy is so annoying in the way he proposes. If he proposed at the top of his voice, I should not mind so much. That might produce some effect on the public. But he does it in a horrid confidential way. When Tommy wants to be romantic he talks to one just like a doctor. I am very fond of Tommy, but his methods of proposing are quite out of date. I wish, Gertrude, you would speak to him, and tell him that once a week is quite often enough to propose to any one, and that it should always be done in a manner that attracts some attention.",
  },
  {
    id: "m-010",
    title: "A writer's life",
    source: "The Sea-Gull",
    author: "Anton Chekhov",
    character: "Trigorin",
    ageRange: "30s–40s",
    gender: "male",
    tone: "dramatic",
    sourceType: "play",
    duration: 109,
    overdoneScore: 0,
    excerpt: "What success have I had?\nI have never pleased myself; as a writer, I do not like myself at all.",
    fullText: "What success have I had? I have never pleased myself; as a writer, I do not like myself at all. The trouble is that I am made giddy, as it were, by the fumes of my brain, and often hardly know what I am writing. I love this lake, these trees, the blue heaven; nature’s voice speaks to me and wakes a feeling of passion in my heart, and I am overcome by an uncontrollable desire to write. But I am not only a painter of landscapes, I am a man of the city besides. I love my country, too, and her people; I feel that, as a writer, it is my duty to speak of their sorrows, of their future, also of science, of the rights of man, and so forth. So I write on every subject, and the public hounds me on all sides, sometimes in anger, and I race and dodge like a fox with a pack of hounds on his trail. I see life and knowledge flitting away before me. I am left behind them like a peasant who has missed his train at a station, and finally I come back to the conclusion that all I am fit for is to describe landscapes, and that whatever else I attempt rings abominably false.",
  },
  {
    id: "m-011",
    title: "What I am",
    source: "Mrs. Warren's Profession",
    author: "George Bernard Shaw",
    character: "Vivie",
    ageRange: "20s",
    gender: "female",
    tone: "dramatic",
    sourceType: "play",
    duration: 68,
    overdoneScore: 0,
    excerpt: "Then where are our relatives?\nmy father?",
    fullText: "Then where are our relatives? my father? our family friends? You claim the rights of a mother: the right to call me fool and child; to speak to me as no woman in authority over me at college dare speak to me; to dictate my way of life; and to force on me the acquaintance of a brute whom anyone can see to be the most vicious sort of London man about town. Before I give myself the trouble to resist such claims, I may as well find out whether they have any real existence.",
  },
  {
    id: "m-012",
    title: "The professor",
    source: "Uncle Vanya",
    author: "Anton Chekhov",
    character: "Voitski",
    ageRange: "40s",
    gender: "male",
    tone: "seriocomic",
    sourceType: "play",
    duration: 134,
    overdoneScore: 20,
    excerpt: "The Professor sits in his library from morning till night, as usual-- \"Straining the mind, wrinkling the brow, We wri…",
    fullText: "The Professor sits in his library from morning till night, as usual-- \"Straining the mind, wrinkling the brow, We write, write, write, Without respite Or hope of praise in the future or now.\" Poor paper! He ought to write his autobiography; he would make a really splendid subject for a book! Imagine it, the life of a retired professor, as stale as a piece of hardtack, tortured by gout, headaches, and rheumatism, his liver bursting with jealousy and envy, living on the estate of his first wife, although he hates it, because he can't afford to live in town. He is everlastingly whining about his hard lot, though, as a matter of fact, he is extraordinarily lucky. He is the son of a common deacon and has attained the professor's chair, become the son-in-law of a senator, is called \"your Excellency,\" and so on. But I'll tell you something; the man has been writing on art for twenty-five years, and he doesn't know the very first thing about it. For twenty-five years he has been chewing on other men's thoughts about realism, naturalism, and all such foolishness; for twenty-five years he has been reading and writing things that clever men have long known and stupid ones are not interested in; for twenty-five years he has been making his imaginary mountains out of molehills. And just think of the man's self-conceit and presumption all this time! For twenty-five years he has been masquerading in false clothes and has now retired absolutely unknown to any living soul; and yet see him! stalking across the earth like a demi-god!",
  },
  {
    id: "m-013",
    title: "The ideal man",
    source: "A Woman of No Importance",
    author: "Oscar Wilde",
    character: "Mrs Allonby",
    ageRange: "30s",
    gender: "female",
    tone: "seriocomic",
    sourceType: "play",
    duration: 129,
    overdoneScore: 20,
    excerpt: "He should persistently compromise us in public, and treat us with absolute respect when we are alone.\nAnd yet he should be always ready to have a perfectly terrible scene,…",
    fullText: "He should persistently compromise us in public, and treat us with absolute respect when we are alone. And yet he should be always ready to have a perfectly terrible scene, whenever we want one, and to become miserable, absolutely miserable, at a moment’s notice, and to overwhelm us with just reproaches in less than twenty minutes, and to be positively violent at the end of half an hour, and to leave us for ever at a quarter to eight, when we have to go and dress for dinner. And when, after that, one has seen him for really the last time, and he has refused to take back the little things he has given one, and promised never to communicate with one again, or to write one any foolish letters, he should be perfectly broken-hearted, and telegraph to one all day long, and send one little notes every half-hour by a private hansom, and dine quite alone at the club, so that every one should know how unhappy he was. And after a whole dreadful week, during which one has gone about everywhere with one’s husband, just to show how absolutely lonely one was, he may be given a third last parting, in the evening, and then, if his conduct has been quite irreproachable, and one has behaved really badly to him, he should be allowed to admit that he has been entirely in the wrong, and when he has admitted that, it becomes a woman’s duty to forgive, and one can do it all over again from the beginning, with variations.",
  },
  {
    id: "m-014",
    title: "New forms",
    source: "The Sea-Gull",
    author: "Anton Chekhov",
    character: "Treplieff",
    ageRange: "20s",
    gender: "male",
    tone: "dramatic",
    sourceType: "play",
    duration: 114,
    overdoneScore: 0,
    excerpt: "No, but we must have it under a new form.\nIf we can’t do that, let us rather not have it at all.",
    fullText: "No, but we must have it under a new form. If we can’t do that, let us rather not have it at all. I love my mother, I love her devotedly, but I think she leads a stupid life. She always has this man of letters of hers on her mind, and the newspapers are always frightening her to death, and I am tired of it. Plain, human egoism sometimes speaks in my heart, and I regret that my mother is a famous actress. If she were an ordinary woman I think I should be a happier man. What could be more intolerable and foolish than my position, Uncle, when I find myself the only nonentity among a crowd of her guests, all celebrated authors and artists? I feel that they only endure me because I am her son. Personally I am nothing, nobody. I pulled through my third year at college by the skin of my teeth, as they say. I have neither money nor brains, and on my passport you may read that I am simply a citizen of Kiev. So was my father, but he was a well-known actor. When the celebrities that frequent my mother’s drawing-room deign to notice me at all, I know they only look at me to measure my insignificance; I read their thoughts, and suffer from humiliation.",
  },
  {
    id: "m-015",
    title: "How secretive of him",
    source: "The Importance of Being Earnest",
    author: "Oscar Wilde",
    character: "Gwendolen Fairfax",
    ageRange: "20s–30s",
    gender: "female",
    tone: "comedic",
    sourceType: "play",
    duration: 102,
    overdoneScore: 30,
    excerpt: "Oh!\nIt is strange he never mentioned to me that he had a ward.",
    fullText: "Oh! It is strange he never mentioned to me that he had a ward. How secretive of him! He grows more interesting hourly. I am not sure, however, that the news inspires me with feelings of unmixed delight. I am very fond of you, Cecily; I have liked you ever since I met you! But I am bound to state that now that I know that you are Mr. Worthing’s ward, I cannot help expressing a wish you were—well, just a little older than you seem to be—and not quite so very alluring in appearance. In fact, if I may speak candidly— Well, to speak with perfect candour, Cecily, I wish that you were fully forty-two, and more than usually plain for your age. Ernest has a strong upright nature. He is the very soul of truth and honour. Disloyalty would be as impossible to him as deception. But even men of the noblest possible moral character are extremely susceptible to the influence of the physical charms of others. Modern, no less than Ancient History, supplies us with many most painful examples of what I refer to. If it were not so, indeed, History would be quite unreadable.",
  },
  {
    id: "m-016",
    title: "Machiavel's prologue",
    source: "The Jew of Malta",
    author: "Christopher Marlowe",
    character: "Machiavel",
    ageRange: "30s–40s",
    gender: "male",
    tone: "dramatic",
    sourceType: "play",
    duration: 146,
    overdoneScore: 0,
    excerpt: "Albeit the world think Machiavel is dead, Yet was his soul but flown beyond the Alps; And, now the Guise is dead, is…",
    fullText: "Albeit the world think Machiavel is dead, Yet was his soul but flown beyond the Alps; And, now the Guise is dead, is come from France, To view this land, and frolic with his friends. To some perhaps my name is odious; But such as love me, guard me from their tongues, And let them know that I am Machiavel, And weigh not men, and therefore not men's words. Admir'd I am of those that hate me most: Though some speak openly against my books, Yet will they read me, and thereby attain To Peter's chair; and, when they cast me off, Are poison'd by my climbing followers. I count religion but a childish toy, And hold there is no sin but ignorance. Birds of the air will tell of murders past! I am asham'd to hear such fooleries. Many will talk of title to a crown: What right had Caesar to the empery? Might first made kings, and laws were then most sure When, like the Draco's, they were writ in blood. Hence comes it that a strong-built citadel Commands much more than letters can import: Which maxim had Phalaris observ'd, H'ad never bellow'd, in a brazen bull, Of great ones' envy: o' the poor petty wights Let me be envied and not pitied. But whither am I bound? I come not, I, To read a lecture here in Britain, But to present the tragedy of a Jew, Who smiles to see how full his bags are cramm'd; Which money was not got without my means. I crave but this,--grace him as he deserves, And let him not be entertain'd the worse Because he favours me.",
  },
];

/** Overdone badge threshold. Above this, casting has heard it today already. */
export const OVERDONE_THRESHOLD = 70;

export function getMonologueById(id: string): Monologue | undefined {
  return MONOLOGUES.find((m) => m.id === id);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
}
