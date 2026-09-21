/**
 * Store-exclusive fake winner names for landing toasts, leaderboards,
 * live-win banners, and recent-win tickers.
 *
 * Each store gets a disjoint first-name slice, so full names, 4-letter
 * prefixes (Anni****), and 3-letter handles (NVC*****) never match
 * across stores. Pools are shuffled on every page load.
 */

const STORE_LANES = [
  'dragonfury',
  'myvepower',
  'winners4',
  'goodwork',
  'betgamezone',
  'sweepstakebet',
  'goodgdragon',
  'grandsweeps',
  'casinoslots',
];

const LANE_COUNT = 16;

/** First names with unique 4-letter prefixes (verified at module load). */
const FEMALE_FIRST = [
  'Aria', 'Brielle', 'Celine', 'Dahlia', 'Elodie', 'Fallon', 'Gianna', 'Hadley',
  'Isolde', 'Jovie', 'Kinsley', 'Liora', 'Magnolia', 'Noelle', 'Ophelia', 'Paisley',
  'Ramona', 'Sienna', 'Tatum', 'Unity', 'Vesper', 'Willa', 'Ximena', 'Yvonne',
  'Zora', 'Adelaide', 'Beatrice', 'Camille', 'Delilah', 'Estelle', 'Fiona', 'Greta',
  'Harlow', 'Imogen', 'Juniper', 'Keira', 'Luna', 'Mabel', 'Nadine', 'Odette',
  'Penelope', 'Quincy', 'Reese', 'Sabine', 'Tessa', 'Ursula', 'Violet', 'Wren',
  'Yasmin', 'Zelda', 'Amber', 'Brooke', 'Clara', 'Daisy', 'Elena', 'Faith',
  'Gemma', 'Hazel', 'Iris', 'Jade', 'Kate', 'Lila', 'Maya', 'Nina',
  'Olive', 'Piper', 'Rose', 'Sage', 'Tara', 'Uma', 'Vera', 'Wendy',
  'Yara', 'Zoey', 'April', 'Blythe', 'Corinne', 'Daphne', 'Eden', 'Freya',
  'Gwen', 'Holly', 'Ivy', 'Josie', 'Kira', 'Leah', 'Mira', 'Nora',
  'Orla', 'Pearl', 'Ruby', 'Stella', 'Thea', 'Valentina', 'Wynn', 'Xandra',
  'Yvette', 'Zara', 'Alina', 'Blair', 'Drew', 'Esme', 'Flora', 'Gaia',
  'Hope', 'Ida', 'Jill', 'Koa', 'Lane', 'Mae', 'Nia', 'Ona',
  'Rae', 'Skye', 'Una', 'Veda', 'Xia', 'Yumi', 'Zia', 'Anya',
  'Dina', 'Eva', 'Faye', 'Hana', 'Ina', 'Joy', 'Kim', 'Liv',
];

const MALE_FIRST = [
  'Aiden', 'Bryson', 'Cedric', 'Darius', 'Ellis', 'Felix', 'Gideon', 'Hugo',
  'Ivan', 'Jasper', 'Kellan', 'Malcolm', 'Nolan', 'Oscar', 'Parker', 'Quentin',
  'Ronan', 'Silas', 'Tristan', 'Ulrich', 'Victor', 'Wesley', 'Yale', 'Zane',
  'Andre', 'Bennett', 'Colton', 'Declan', 'Ethan', 'Finn', 'Graham', 'Isaac',
  'Julian', 'Kai', 'Leo', 'Miles', 'Nash', 'Owen', 'Philip', 'Reid',
  'Sean', 'Upton', 'Vince', 'Wade', 'York', 'Zion', 'Aaron', 'Craig',
  'Dean', 'Earl', 'Frank', 'Iker', 'Joel', 'Kurt', 'Mark', 'Neil',
  'Omar', 'Paul', 'Russ', 'Scott', 'Todd', 'Vaughn', 'Zack', 'Amos',
  'Boris', 'Duke', 'Edwin', 'Glen', 'Heath', 'Igor', 'Jack', 'Kent',
  'Lloyd', 'Mitch', 'Nate', 'Otto', 'Pete', 'Ralph', 'Stan', 'Troy',
  'Uri', 'Walt', 'Xavi', 'Yuri', 'Zeb', 'Arlo', 'Cody', 'Eli',
  'Ford', 'Gage', 'Ian', 'Jed', 'Kobe', 'Max', 'Ned', 'Otis',
  'Sam', 'Van', 'Zeke', 'Axel', 'Cade', 'Dale', 'Emmet', 'Fritz',
  'Gus', 'Ives', 'Jett', 'Knox', 'Lars', 'Moss', 'Nico', 'Orin',
  'Pax', 'Rhys', 'Shea', 'Trey', 'Vito', 'Wyatt', 'Zaid', 'Asher',
  'Bodhi', 'Cruz', 'Dorian', 'Emilio', 'Fabian', 'Gordon', 'Hector', 'Ismael',
];

const LAST_NAMES = [
  'Ashford', 'Barrett', 'Caldwell', 'Dalton', 'Ellison', 'Farrow', 'Gaines', 'Hale',
  'Ingram', 'Jensen', 'Keaton', 'Langley', 'Monroe', 'Oakley', 'Prescott', 'Ramsey',
  'Sutton', 'Tucker', 'Underwood', 'Vaughn', 'Whitaker', 'Xavier', 'Yates', 'Zimmerman',
  'Abbott', 'Brennan', 'Carson', 'Donovan', 'Everett', 'Foster', 'Griffin', 'Harrington',
  'Iverson', 'Jacobson', 'Kendall', 'Lawson', 'Maddox', 'Nielsen', 'Patterson', 'Quigley',
  'Reynolds', 'Sullivan', 'Thompson', 'Ulrich', 'Vickers', 'Wallace', 'Yamamoto', 'Zeller',
  'Atwood', 'Bishop', 'Crawford', 'Daniels', 'Edwards', 'Franklin', 'Gibson', 'Hawkins',
  'Irving', 'Jenkins', 'Keller', 'Lambert', 'Mitchell', 'Norman', 'Owens', 'Parker',
  'Roberts', 'Sanders', 'Turner', 'Upton', 'Vincent', 'Walker', 'Young', 'Archer',
  'Brooks', 'Cooper', 'Dixon', 'Ford', 'Greene', 'Hayes', 'Ives', 'Jones',
  'Knight', 'Lewis', 'Moore', 'Nelson', 'Ortiz', 'Price', 'Reed', 'Stone',
  'Townsend', 'Usher', 'Vargas', 'Wells', 'York', 'Adams', 'Baker', 'Cole',
  'Dunn', 'Evans', 'Frost', 'Grant', 'Hart', 'Ivory', 'James', 'King',
  'Lane', 'Morgan', 'Norris', 'Oliver', 'Perez', 'Ross', 'Scott', 'Tate',
  'Unger', 'Vega', 'West', 'Yu', 'Zuniga', 'Allen', 'Bell', 'Chen',
  'Diaz', 'Eaton', 'Flynn', 'Gould', 'Hunt', 'Ito', 'Jung', 'Kim',
];

function lettersOnly(value) {
  return String(value || '').replace(/[^A-Za-z]/g, '');
}

export function winnerNamePrefix(name) {
  const letters = lettersOnly(name);
  return letters.slice(0, 4) || 'Play';
}

export function winnerHandle(name) {
  const letters = lettersOnly(name).toUpperCase();
  return `${(letters.slice(0, 3) || 'WIN').padEnd(3, 'X')}*****`;
}

function normalizeStoreCode(storeCode) {
  return String(storeCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function hashStore(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getWinnerNameLane(storeCode) {
  const key = normalizeStoreCode(storeCode);
  const known = STORE_LANES.indexOf(key);
  if (known >= 0) return known;
  return 9 + (hashStore(key || 'store') % 7);
}

function sliceForLane(list, lane) {
  const size = Math.floor(list.length / LANE_COUNT);
  const start = lane * size;
  return list.slice(start, start + size);
}

export function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function zipFullNames(firstNames, lastNames) {
  const lasts = lastNames.length ? lastNames : ['Player'];
  return firstNames.map((first, index) => `${first} ${lasts[index % lasts.length]}`);
}

export function getStoreWinnerNamePool(storeCode) {
  const lane = getWinnerNameLane(storeCode);
  const femaleFirst = sliceForLane(FEMALE_FIRST, lane);
  const maleFirst = sliceForLane(MALE_FIRST, lane);
  const lastNames = sliceForLane(LAST_NAMES, lane);
  const female = zipFullNames(femaleFirst, lastNames);
  const male = zipFullNames(maleFirst, lastNames);
  const prefixes = [...femaleFirst, ...maleFirst].map(winnerNamePrefix);
  const handles = [...femaleFirst, ...maleFirst].map(winnerHandle);

  return {
    lane,
    female,
    male,
    prefixes,
    handles,
    allFullNames: [...female, ...male],
  };
}

export function getShuffledStoreWinnerNames(storeCode) {
  const pool = getStoreWinnerNamePool(storeCode);
  return {
    ...pool,
    female: shuffleArray(pool.female),
    male: shuffleArray(pool.male),
    prefixes: shuffleArray(pool.prefixes),
    handles: shuffleArray(pool.handles),
    allFullNames: shuffleArray(pool.allFullNames),
  };
}

const FEMALE_AVATARS = [
  '/MF1.png',
  '/MF2.png',
  '/MF3.png',
  '/MF4.png',
  '/P1.png',
  '/P2.png',
  '/P3.png',
  '/N1.png',
  '/1.png',
];

const MALE_AVATARS = [
  '/MM1.png',
  '/MM2.png',
  '/MM3.png',
  '/m1.png',
  '/m2.png',
  '/m3.png',
  '/m4.png',
  '/N1-M.png',
  '/2.png',
];

const WINNER_EMOJI_POOL = [
  '👑', '🎰', '💎', '🌟', '🎲', '🃏', '🔥', '💰',
  '🏆', '⚡', '🚀', '🎯', '🐉', '☁️', '💫', '⭐',
  '🦊', '🐺', '🦁', '🐯', '🦄', '🐲', '🦅', '🦈',
  '🌹', '🍀', '🌙', '☀️', '❄️', '🌊', '🌈', '🎀',
  '🎸', '🎹', '🎺', '🥁', '🎤', '🎧', '🎬', '🎮',
  '🧁', '🍩', '🍓', '🍒', '🍉', '🍍', '🥝', '🍑',
  '🧿', '🪬', '🪩', '🪐', '☄️', '🌌', '🔮', '💠',
  '🛡️', '⚔️', '🏹', '🪃', '🪄', '🧸', '🪂', '🪁',
  '🦚', '🦩', '🦜', '🦢', '🦭', '🦋', '🐝', '🌸',
];

/**
 * Each store gets 8 unique portraits (4 female + 4 male). IDs are partitioned
 * by store so the same face never appears on two stores.
 */
export function getStoreToastProfiles(storeCode) {
  const lane = getWinnerNameLane(storeCode);
  const perGender = 4;
  const profiles = [];

  for (let i = 0; i < perGender; i += 1) {
    const id = lane * perGender + i;
    profiles.push({
      avatar: `https://randomuser.me/api/portraits/women/${id}.jpg`,
      gender: 'female',
    });
    profiles.push({
      avatar: `https://randomuser.me/api/portraits/men/${id}.jpg`,
      gender: 'male',
    });
  }

  return profiles;
}

export function getStoreWinnerEmojis(storeCode) {
  const lane = getWinnerNameLane(storeCode);
  const size = 8;
  const start = (lane * size) % WINNER_EMOJI_POOL.length;
  return Array.from({ length: size }, (_, index) => (
    WINNER_EMOJI_POOL[(start + index) % WINNER_EMOJI_POOL.length]
  ));
}

export function createPrefixDeck(storeCode) {
  let deck = shuffleArray(getStoreWinnerNamePool(storeCode).prefixes);
  let index = 0;
  const seen = new Set();

  return {
    next(excludePrefix) {
      const maxAttempts = Math.max(deck.length, 1);
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (index >= deck.length) {
          deck = shuffleArray(getStoreWinnerNamePool(storeCode).prefixes);
          index = 0;
        }
        const prefix = deck[index];
        index += 1;
        if (prefix !== excludePrefix) return prefix;
      }
      return deck[0] || 'Play';
    },
    nextUniqueInBatch() {
      if (seen.size >= deck.length) seen.clear();
      let prefix = this.next();
      let guard = 0;
      while (seen.has(prefix) && guard < deck.length) {
        prefix = this.next();
        guard += 1;
      }
      seen.add(prefix);
      return prefix;
    },
  };
}

export function applyStoreWinnerHandles(storeCode, boards) {
  const handles = shuffleArray(getStoreWinnerNamePool(storeCode).handles);
  const emojis = getStoreWinnerEmojis(storeCode);
  let cursor = 0;
  const take = () => {
    const handle = handles[cursor % handles.length] || 'WIN*****';
    const avatar = emojis[cursor % emojis.length];
    cursor += 1;
    return { handle, avatar };
  };

  const mapped = {};
  for (const [key, rows] of Object.entries(boards || {})) {
    mapped[key] = (rows || []).map((row) => {
      const next = take();
      return {
        ...row,
        player: next.handle,
        avatar: next.avatar,
      };
    });
  }
  return mapped;
}
