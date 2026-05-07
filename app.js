// ============================ BLACKJACK TRAINER ============================
// Single-file app. Three phases: basic strategy drill, counting drills,
// integrated game. State persisted in localStorage.

// ============================ STATE ============================
const STORAGE_KEY = 'bj_trainer_v1';
const state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    p1: { correct: 0, total: 0, streak: 0, cellMisses: {} },
    dd: { bestTime: null, correct: 0, total: 0 },
    tc: { correct: 0, total: 0, totalTime: 0 },
    pc: { correct: 0, total: 0, streak: 0 },
    game: { hands: 0, playCorrect: 0, betCorrect: 0, bankroll: 2000 }
  };
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

// ============================ CARD UTILS ============================
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUITS = ['♠','♥','♦','♣'];
const RED_SUITS = new Set(['♥','♦']);

function cardValue(rank) {
  if (rank === 'A') return 11;
  if (['10','J','Q','K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}
function hiLoValue(rank) {
  if (['2','3','4','5','6'].includes(rank)) return 1;
  if (['10','J','Q','K','A'].includes(rank)) return -1;
  return 0;
}
function koValue(rank) {
  if (['2','3','4','5','6','7'].includes(rank)) return 1;
  if (['10','J','Q','K','A'].includes(rank)) return -1;
  return 0;
}
function randomRank() {
  // 4x weight on 10-value cards (10,J,Q,K) to match deck composition (16/52)
  const weighted = ['2','3','4','5','6','7','8','9','10','10','10','10','A'];
  return weighted[Math.floor(Math.random() * weighted.length)];
}
function randomCard() {
  return { rank: randomRank(), suit: SUITS[Math.floor(Math.random() * 4)] };
}
function buildShoe(decks = 6) {
  const shoe = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) for (const r of RANKS) shoe.push({ rank: r, suit: s });
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function handTotal(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') { aces++; total += 11; }
    else total += cardValue(c.rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  const isSoft = aces > 0 && total <= 21;
  return { total, isSoft };
}
function isPair(cards) {
  if (cards.length !== 2) return false;
  return cardValue(cards[0].rank) === cardValue(cards[1].rank);
}

// ============================ CARD RENDERING ============================
function renderCard(card, opts = {}) {
  const div = document.createElement('div');
  div.className = 'card' + (RED_SUITS.has(card.suit) ? ' red' : '') + (opts.facedown ? ' facedown' : '');
  if (!opts.facedown) {
    div.innerHTML = `<span>${card.rank}${card.suit}</span><span class="rank-bottom">${card.rank}${card.suit}</span>`;
  }
  return div;
}
function renderHand(cards, container, hideFirst = false) {
  container.innerHTML = '';
  cards.forEach((c, i) => {
    container.appendChild(renderCard(c, { facedown: hideFirst && i === 0 }));
  });
}

// ============================ BASIC STRATEGY ============================
// Lookup tables for 6D, indexed by [hand-key][dealer-upcard-1..10]
// dealer index: 0=2, 1=3, ..., 7=9, 8=10, 9=A
function dealerIndex(rank) {
  if (rank === 'A') return 9;
  if (['10','J','Q','K'].includes(rank)) return 8;
  return parseInt(rank, 10) - 2;
}

// Action codes:
// H = hit
// S = stand
// Dh = double if allowed else hit
// Ds = double if allowed else stand
// P = always split
// Ph = split if DAS else hit
// Rh = surrender if allowed else hit
// Rs = surrender if allowed else stand
// Rp = surrender if allowed else split

const HARD = {
  // total -> array of 10 actions [vs 2..A]
  5: ['H','H','H','H','H','H','H','H','H','H'],
  6: ['H','H','H','H','H','H','H','H','H','H'],
  7: ['H','H','H','H','H','H','H','H','H','H'],
  8: ['H','H','H','H','H','H','H','H','H','H'],
  9: ['H','Dh','Dh','Dh','Dh','H','H','H','H','H'],
  10:['Dh','Dh','Dh','Dh','Dh','Dh','Dh','Dh','H','H'],
  11:['Dh','Dh','Dh','Dh','Dh','Dh','Dh','Dh','Dh','Dh'],
  12:['H','H','S','S','S','H','H','H','H','H'],
  13:['S','S','S','S','S','H','H','H','H','H'],
  14:['S','S','S','S','S','H','H','H','H','H'],
  15:['S','S','S','S','S','H','H','H','Rh','Rh'],
  16:['S','S','S','S','S','H','H','Rh','Rh','Rh'],
  17:['S','S','S','S','S','S','S','S','S','Rs'], // Rs only in H17, S17 = S
  18:['S','S','S','S','S','S','S','S','S','S'],
  19:['S','S','S','S','S','S','S','S','S','S'],
  20:['S','S','S','S','S','S','S','S','S','S'],
  21:['S','S','S','S','S','S','S','S','S','S']
};

const SOFT = {
  // soft total -> actions
  13:['H','H','H','Dh','Dh','H','H','H','H','H'], // A,2
  14:['H','H','H','Dh','Dh','H','H','H','H','H'], // A,3
  15:['H','H','Dh','Dh','Dh','H','H','H','H','H'], // A,4
  16:['H','H','Dh','Dh','Dh','H','H','H','H','H'], // A,5
  17:['H','Dh','Dh','Dh','Dh','H','H','H','H','H'], // A,6
  18:['Ds','Ds','Ds','Ds','Ds','S','S','H','H','H'], // A,7 (S17: S vs 2)
  19:['S','S','S','S','Ds','S','S','S','S','S'], // A,8 (Ds vs 6 H17 only)
  20:['S','S','S','S','S','S','S','S','S','S'],
  21:['S','S','S','S','S','S','S','S','S','S']
};

const PAIR = {
  // pair-rank -> actions
  '2':['Ph','Ph','P','P','P','P','H','H','H','H'],
  '3':['Ph','Ph','P','P','P','P','H','H','H','H'],
  '4':['H','H','H','Ph','Ph','H','H','H','H','H'],
  '5':['Dh','Dh','Dh','Dh','Dh','Dh','Dh','Dh','H','H'],
  '6':['Ph','P','P','P','P','H','H','H','H','H'],
  '7':['P','P','P','P','P','P','H','H','Rh','H'],
  '8':['P','P','P','P','P','P','P','P','Rp','Rp'],
  '9':['P','P','P','P','P','S','P','P','S','S'],
  '10':['S','S','S','S','S','S','S','S','S','S'],
  'A':['P','P','P','P','P','P','P','P','P','P']
};

function pairKey(rank) {
  if (['10','J','Q','K'].includes(rank)) return '10';
  return rank;
}

// Resolve raw action against rules
function resolveAction(raw, rules, hasTwoCards) {
  // Surrender forms
  if (raw === 'Rh') return rules.surrender ? 'R' : 'H';
  if (raw === 'Rs') {
    if (!rules.surrender) return 'S';
    // Rs only triggers in H17 for 17 vs A; in S17 fall back to stand
    return rules.h17 ? 'R' : 'S';
  }
  if (raw === 'Rp') return rules.surrender ? 'R' : 'P';
  // Split-or-hit (DAS dependent)
  if (raw === 'Ph') return rules.das ? 'P' : 'H';
  // Double forms (only doubleable on first 2 cards)
  if (raw === 'Dh') return hasTwoCards ? 'D' : 'H';
  if (raw === 'Ds') return hasTwoCards ? 'D' : 'S';
  return raw; // H, S, P
}

function basicStrategy(playerCards, dealerUp, rules) {
  const di = dealerIndex(dealerUp.rank);
  const hasTwoCards = playerCards.length === 2;
  // Pairs (only on first two cards)
  if (hasTwoCards && isPair(playerCards)) {
    const key = pairKey(playerCards[0].rank);
    let raw = PAIR[key][di];
    // Special: 2,2 vs 5,6 in S17 chart small differences ignored (negligible)
    return resolveAction(raw, rules, hasTwoCards);
  }
  const { total, isSoft } = handTotal(playerCards);
  let raw;
  if (isSoft && total >= 13 && total <= 21) {
    raw = SOFT[total][di];
    // S17 adjustment for soft 18 vs 2 (becomes S instead of Ds)
    if (!rules.h17 && total === 18 && di === 0) raw = 'S';
    // S17: soft 19 vs 6 not Ds (becomes S)
    if (!rules.h17 && total === 19 && di === 4) raw = 'S';
  } else {
    const t = Math.min(total, 21);
    raw = HARD[t][di];
    // S17 adjustment for 11 vs A (becomes H instead of Dh)
    if (!rules.h17 && t === 11 && di === 9) raw = 'H';
    // S17 adjustment for 17 vs A (already handled by Rs->S)
  }
  return resolveAction(raw, rules, hasTwoCards);
}

// ============================ STRATEGY EXPLANATIONS ============================
const EXPLANATIONS = {
  // key: "totalOrPair_vs_dealer" — explanations for the most common confusions
  'soft18_5': "Soft 18 vs dealer 5: dealer is weak (~42% bust rate) and a soft hand cannot bust on a single card. Doubling extracts more EV than standing.",
  'soft18_6': "Soft 18 vs 6: same as vs 5, dealer's bust rate is high. Double when allowed.",
  'soft18_9': "Soft 18 vs 9: dealer's most likely outcome is 19, beating your 18. Hit to improve.",
  'soft18_10':"Soft 18 vs 10: dealer's likely 20 beats your 18. Hit to try for 19+.",
  'soft18_A': "Soft 18 vs A: dealer often makes 19+. Hit.",
  'hard12_2': "12 vs 2: dealer's bust rate with a 2 is only ~35%, lower than your 31% bust risk on a single hit. Hit.",
  'hard12_3': "12 vs 3: same logic as vs 2, dealer's bust rate is too low to wait for. Hit.",
  'hard16_10':"16 vs 10: standing wins ~23%, hitting wins ~24%. Hit if no surrender, surrender if available.",
  'hard16_9': "16 vs 9: hit (or surrender if available). Standing on 16 only works against dealer 2-6.",
  'hard16_7': "16 vs 7: dealer makes 17+ ~74% of the time with a 7 upcard. Standing loses to all of them. Hit.",
  'hard11_A': "11 vs A: in H17 games, double. The high ace-and-ten count means a likely 21 from the double.",
  'hard9_2':  "9 vs 2: standing on 9 is too passive, but hitting alone leaves money on the table. In H17, this is a hit (in some charts a deviation).",
  'pair88':   "Always split 8s. 16 is the worst hand in the game; two hands of 8 give two chances at 18+.",
  'pairAA':   "Always split aces. A,A as 12 is terrible; two hands starting with A average 19+.",
  'pair1010': "Never split 10s. 20 wins ~85% of the time. Splitting destroys EV.",
  'pair55':   "Never split 5s. A 10 is the second-best double-down hand; split into two 5s and you get two terrible starts.",
  'pair99vs9':"Split 9s vs 9: dealer's likely 19 ties or beats your 18 (standing). Splitting gives two 9s with high upside.",
  'pair99vs7':"Stand on 9,9 vs 7: dealer's likely 17 loses to your 18. Don't split a winning hand.",
  'insurance':"Insurance is a side bet on dealer blackjack. Without counting, it's −7.4% EV. Decline always.",
  'soft17':   "Soft 17 (A,6) is weak; treat it as a hand to hit or double, not stand on. Even basic strategy hits A,6 vs anything but 3-6 (where double).",
};

function explanationFor(playerCards, dealerUp, correctAction) {
  const dRank = dealerUp.rank;
  const dKey = ['10','J','Q','K'].includes(dRank) ? '10' : dRank;
  if (isPair(playerCards) && playerCards.length === 2) {
    const key = pairKey(playerCards[0].rank);
    if (key === '8') return EXPLANATIONS.pair88;
    if (key === 'A') return EXPLANATIONS.pairAA;
    if (key === '10') return EXPLANATIONS.pair1010;
    if (key === '5') return EXPLANATIONS.pair55;
    if (key === '9' && dKey === '9') return EXPLANATIONS.pair99vs9;
    if (key === '9' && dKey === '7') return EXPLANATIONS.pair99vs7;
  }
  const { total, isSoft } = handTotal(playerCards);
  if (isSoft && total === 18) return EXPLANATIONS['soft18_' + dKey] || null;
  if (!isSoft && total === 12 && (dKey === '2' || dKey === '3')) return EXPLANATIONS['hard12_' + dKey];
  if (!isSoft && total === 16 && (dKey === '7' || dKey === '9' || dKey === '10')) return EXPLANATIONS['hard16_' + dKey];
  if (!isSoft && total === 11 && dKey === 'A') return EXPLANATIONS.hard11_A;
  if (!isSoft && total === 9 && dKey === '2') return EXPLANATIONS.hard9_2;
  return null;
}

// ============================ PHASE 1: BASIC STRATEGY DRILL ============================
let p1 = { player: [], dealer: [], correctAction: null };

function p1GenerateHand() {
  // Mix of hand types: 40% hard non-trivial, 25% soft, 25% pair, 10% surrender-able
  const r = Math.random();
  let player, dealer;
  if (r < 0.25) {
    // Pair
    const rank = randomRank();
    player = [{ rank, suit: SUITS[0] }, { rank, suit: SUITS[1] }];
  } else if (r < 0.50) {
    // Soft hand
    const otherRank = ['2','3','4','5','6','7','8','9'][Math.floor(Math.random() * 8)];
    player = [{ rank: 'A', suit: SUITS[0] }, { rank: otherRank, suit: SUITS[1] }];
  } else {
    // Hard hand: build a 2-card hand totaling 8-19
    let p1c, p2c, total;
    do {
      p1c = randomRank();
      p2c = randomRank();
      if (p1c === 'A' || p2c === 'A') continue;
      total = cardValue(p1c) + cardValue(p2c);
    } while (cardValue(p1c) === cardValue(p2c) || p1c === 'A' || p2c === 'A' || total < 5 || total > 19);
    player = [{ rank: p1c, suit: SUITS[0] }, { rank: p2c, suit: SUITS[1] }];
  }
  dealer = [{ rank: randomRank(), suit: SUITS[0] }, { rank: '?', suit: '?' }];
  return { player, dealer };
}

function p1NewHand() {
  const { player, dealer } = p1GenerateHand();
  p1.player = player;
  p1.dealer = dealer;
  p1.correctAction = basicStrategy(player, dealer[0], getRules());
  document.getElementById('feedback').classList.add('hidden');
  document.getElementById('actions').style.display = '';
  renderHand(player, document.getElementById('player-cards'));
  renderHand(dealer, document.getElementById('dealer-cards'), true);
  // Disable buttons that don't apply
  const isFirstTwo = player.length === 2;
  document.querySelector('[data-action="D"]').disabled = !isFirstTwo;
  document.querySelector('[data-action="P"]').disabled = !(isFirstTwo && isPair(player));
  document.querySelector('[data-action="R"]').disabled = !(isFirstTwo && getRules().surrender);
}

function getRules() {
  return {
    h17: document.getElementById('rule-h17').checked,
    das: document.getElementById('rule-das').checked,
    surrender: document.getElementById('rule-surr').checked,
    decks: 6
  };
}

function actionLabel(code) {
  return ({ H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' })[code] || code;
}

function p1Submit(action) {
  const correct = p1.correctAction;
  const isCorrect = action === correct;
  state.p1.total++;
  if (isCorrect) {
    state.p1.correct++;
    state.p1.streak++;
  } else {
    state.p1.streak = 0;
    const cellKey = handDescription(p1.player) + ' vs ' + p1.dealer[0].rank;
    state.p1.cellMisses[cellKey] = (state.p1.cellMisses[cellKey] || 0) + 1;
  }
  save();
  p1RenderStats();
  // Show feedback
  const fb = document.getElementById('feedback');
  fb.classList.remove('hidden', 'correct', 'wrong');
  fb.classList.add(isCorrect ? 'correct' : 'wrong');
  fb.querySelector('.verdict').textContent = isCorrect
    ? '✓ Correct: ' + actionLabel(correct)
    : '✗ Wrong. You played ' + actionLabel(action) + ', correct was ' + actionLabel(correct) + '.';
  const expl = explanationFor(p1.player, p1.dealer[0], correct);
  fb.querySelector('.explanation').textContent = expl || handDescription(p1.player) + ' vs dealer ' + p1.dealer[0].rank + ': basic strategy says ' + actionLabel(correct) + '.';
  // Reveal dealer hole card
  renderHand(p1.dealer, document.getElementById('dealer-cards'), false);
  document.getElementById('actions').style.display = 'none';
}

function handDescription(cards) {
  if (isPair(cards) && cards.length === 2) return cards[0].rank + ',' + cards[1].rank + ' (pair)';
  const { total, isSoft } = handTotal(cards);
  return (isSoft ? 'Soft ' : 'Hard ') + total;
}

function p1RenderStats() {
  document.getElementById('p1-correct').textContent = state.p1.correct;
  document.getElementById('p1-total').textContent = state.p1.total;
  const pct = state.p1.total ? Math.round(100 * state.p1.correct / state.p1.total) : 0;
  document.getElementById('p1-pct').textContent = pct;
  document.getElementById('p1-streak').textContent = state.p1.streak;
}

// ============================ PHASE 2A: DECK-DOWN ============================
let dd = { interval: null, cards: [], idx: 0, rc: 0, system: 'hilo', startTime: 0 };

function ddStart() {
  dd.cards = buildShoe(1);
  dd.idx = 0;
  dd.rc = 0;
  dd.system = document.getElementById('dd-system').value;
  const speed = parseInt(document.getElementById('dd-speed').value, 10);
  document.getElementById('dd-start').classList.add('hidden');
  document.getElementById('dd-result').classList.add('hidden');
  document.getElementById('dd-final-prompt').classList.add('hidden');
  dd.startTime = Date.now();
  dd.interval = setInterval(() => {
    if (dd.idx >= dd.cards.length) {
      clearInterval(dd.interval);
      ddFinish();
      return;
    }
    const c = dd.cards[dd.idx++];
    const cardEl = document.getElementById('dd-card');
    cardEl.textContent = c.rank + c.suit;
    cardEl.className = 'big-card' + (RED_SUITS.has(c.suit) ? ' red' : '');
    document.getElementById('dd-cards-shown').textContent = dd.idx;
    dd.rc += dd.system === 'hilo' ? hiLoValue(c.rank) : koValue(c.rank);
  }, speed);
}

function ddFinish() {
  const elapsed = (Date.now() - dd.startTime) / 1000;
  document.getElementById('dd-card').textContent = '✓';
  document.getElementById('dd-card').className = 'big-card';
  document.getElementById('dd-final-prompt').classList.remove('hidden');
  document.getElementById('dd-final-prompt').dataset.elapsed = elapsed.toFixed(1);
  document.getElementById('dd-answer').value = '';
  document.getElementById('dd-answer').focus();
}

function ddSubmit() {
  const userAnswer = parseInt(document.getElementById('dd-answer').value, 10);
  const expected = dd.system === 'hilo' ? 0 : (dd.cards.length === 52 ? -4 : 0);
  // For Hi-Lo single deck, expected = 0 (balanced).
  // For KO single deck, balanced minus the extra +4 (since 7s now count): expected end = +4 from IRC=0. We use 0 for IRC; KO single deck final = +4.
  const isCorrect = userAnswer === expected;
  state.dd.total++;
  const elapsed = parseFloat(document.getElementById('dd-final-prompt').dataset.elapsed);
  if (isCorrect) {
    state.dd.correct++;
    if (state.dd.bestTime === null || elapsed < state.dd.bestTime) state.dd.bestTime = elapsed;
  }
  save();
  ddRenderStats();
  const result = document.getElementById('dd-result');
  result.classList.remove('hidden', 'correct', 'wrong');
  result.classList.add(isCorrect ? 'correct' : 'wrong');
  result.innerHTML = isCorrect
    ? `✓ Correct! Final RC: ${expected}. Time: ${elapsed.toFixed(1)}s${state.dd.bestTime === elapsed ? ' (new best!)' : ''}`
    : `✗ Wrong. Your answer: ${userAnswer}. Correct: ${expected}. Off by ${Math.abs(userAnswer - expected)}. Time: ${elapsed.toFixed(1)}s`;
  document.getElementById('dd-final-prompt').classList.add('hidden');
  document.getElementById('dd-start').classList.remove('hidden');
  document.getElementById('dd-start').textContent = 'Start again';
  document.getElementById('dd-cards-shown').textContent = 0;
}

function ddRenderStats() {
  document.getElementById('dd-best').textContent = state.dd.bestTime ? state.dd.bestTime.toFixed(1) + 's' : '—';
  document.getElementById('dd-correct').textContent = state.dd.correct;
  document.getElementById('dd-total').textContent = state.dd.total;
}

// ============================ PHASE 2B: TC CONVERSION ============================
let tc = { rc: 0, decks: 0, expected: 0, startTime: 0 };

function tcStart() {
  // Generate plausible RC and decks-remaining
  const decks = (Math.floor(Math.random() * 11) + 2) / 2; // 1.0 to 6.0 in 0.5 steps
  const rc = Math.floor(Math.random() * 31) - 15; // -15 to +15
  tc.rc = rc;
  tc.decks = decks;
  // Round toward zero (truncate)
  const raw = rc / decks;
  tc.expected = raw >= 0 ? Math.floor(raw) : Math.ceil(raw);
  document.getElementById('tc-rc').textContent = (rc >= 0 ? '+' : '') + rc;
  document.getElementById('tc-decks').textContent = decks.toFixed(1);
  document.getElementById('tc-input-prompt').classList.remove('hidden');
  document.getElementById('tc-start').classList.add('hidden');
  document.getElementById('tc-result').classList.add('hidden');
  document.getElementById('tc-answer').value = '';
  document.getElementById('tc-answer').focus();
  tc.startTime = Date.now();
}

function tcSubmit() {
  const userAnswer = parseInt(document.getElementById('tc-answer').value, 10);
  const elapsed = (Date.now() - tc.startTime) / 1000;
  const isCorrect = userAnswer === tc.expected;
  state.tc.total++;
  state.tc.totalTime += elapsed;
  if (isCorrect) state.tc.correct++;
  save();
  tcRenderStats();
  const result = document.getElementById('tc-result');
  result.classList.remove('hidden', 'correct', 'wrong');
  result.classList.add(isCorrect ? 'correct' : 'wrong');
  result.innerHTML = isCorrect
    ? `✓ Correct! TC = ${tc.expected}. Time: ${elapsed.toFixed(1)}s`
    : `✗ Wrong. Correct TC: ${tc.expected} (RC ${tc.rc} / ${tc.decks} decks = ${(tc.rc/tc.decks).toFixed(2)}). Your answer: ${userAnswer}. Time: ${elapsed.toFixed(1)}s`;
  document.getElementById('tc-input-prompt').classList.add('hidden');
  document.getElementById('tc-start').classList.remove('hidden');
  document.getElementById('tc-start').textContent = 'Next';
}

function tcRenderStats() {
  document.getElementById('tc-correct').textContent = state.tc.correct;
  document.getElementById('tc-total').textContent = state.tc.total;
  const avg = state.tc.total ? (state.tc.totalTime / state.tc.total).toFixed(1) : '—';
  document.getElementById('tc-avg-time').textContent = avg;
}

// ============================ PHASE 2C: PAIR CANCELLATION ============================
let pc = { c1: null, c2: null, expected: 0 };

function pcStart() {
  pc.c1 = randomCard();
  pc.c2 = randomCard();
  pc.expected = hiLoValue(pc.c1.rank) + hiLoValue(pc.c2.rank);
  document.getElementById('pc-card1').textContent = pc.c1.rank + pc.c1.suit;
  document.getElementById('pc-card1').className = 'big-card small' + (RED_SUITS.has(pc.c1.suit) ? ' red' : '');
  document.getElementById('pc-card2').textContent = pc.c2.rank + pc.c2.suit;
  document.getElementById('pc-card2').className = 'big-card small' + (RED_SUITS.has(pc.c2.suit) ? ' red' : '');
  document.getElementById('pc-input-prompt').classList.remove('hidden');
  document.getElementById('pc-start').classList.add('hidden');
  document.getElementById('pc-result').classList.add('hidden');
}

function pcSubmit(value) {
  const isCorrect = value === pc.expected;
  state.pc.total++;
  if (isCorrect) {
    state.pc.correct++;
    state.pc.streak++;
  } else {
    state.pc.streak = 0;
  }
  save();
  pcRenderStats();
  const result = document.getElementById('pc-result');
  result.classList.remove('hidden', 'correct', 'wrong');
  result.classList.add(isCorrect ? 'correct' : 'wrong');
  result.textContent = isCorrect ? `✓ Correct: ${pc.expected >= 0 ? '+' : ''}${pc.expected}` : `✗ Wrong. Correct: ${pc.expected >= 0 ? '+' : ''}${pc.expected}. You said ${value >= 0 ? '+' : ''}${value}.`;
  // Auto-advance after 1s
  setTimeout(pcStart, 1000);
}

function pcRenderStats() {
  document.getElementById('pc-correct').textContent = state.pc.correct;
  document.getElementById('pc-total').textContent = state.pc.total;
  document.getElementById('pc-streak').textContent = state.pc.streak;
}

// ============================ PHASE 3: FULL GAME ============================
let game = {
  shoe: [],
  decksOriginal: 6,
  rc: 0,
  player: [],
  dealer: [],
  otherCards: [],
  bet: 0,
  inHand: false,
  cutCardPos: 0,
  // For tracking: we count player+dealer+others all visible cards
};

function gameInit() {
  game.shoe = buildShoe(6);
  game.decksOriginal = 6;
  game.rc = 0;
  game.cutCardPos = Math.floor(game.shoe.length * 0.83); // 83% pen
  game.otherCards = [];
  gameUpdateCount();
  gameRender();
}

function gameDecksRemaining() {
  return Math.max(0.5, (game.shoe.length / 52)); // approximate
}

function gameSuggestedBet(tcVal) {
  // 1-12 spread: bet = max(1, TC - 1) units, capped at 12
  let units = Math.max(1, Math.min(12, tcVal - 1));
  if (tcVal < 1) units = 1;
  return units * 10; // $10 unit
}

function gameUpdateCount() {
  const decksLeft = gameDecksRemaining();
  const tcVal = decksLeft > 0 ? Math.trunc(game.rc / decksLeft) : 0;
  document.getElementById('g-rc').textContent = (game.rc >= 0 ? '+' : '') + game.rc;
  document.getElementById('g-decks').textContent = decksLeft.toFixed(1);
  document.getElementById('g-tc').textContent = (tcVal >= 0 ? '+' : '') + tcVal;
  document.getElementById('g-suggest-tc').textContent = (tcVal >= 0 ? '+' : '') + tcVal;
  document.getElementById('g-suggest-bet').textContent = gameSuggestedBet(tcVal);
}

function gameDraw() {
  if (game.shoe.length <= (52 * 6 - game.cutCardPos)) {
    // Past cut card: reshuffle
    gameInit();
  }
  const c = game.shoe.pop();
  game.rc += hiLoValue(c.rank);
  return c;
}

function gameSelectBet(amount) {
  game.bet = amount;
  document.querySelectorAll('.bet-buttons button').forEach(b => {
    b.classList.toggle('selected', parseInt(b.dataset.bet, 10) === amount);
  });
  document.getElementById('g-deal').disabled = false;
}

function gameDeal() {
  if (game.bet === 0) return;
  // Deduct bet from bankroll
  state.game.bankroll -= game.bet;
  // Evaluate bet correctness BEFORE dealing (count is before this hand)
  const decksLeft = gameDecksRemaining();
  const tcVal = decksLeft > 0 ? Math.trunc(game.rc / decksLeft) : 0;
  const suggested = gameSuggestedBet(tcVal);
  const betCorrect = Math.abs(game.bet - suggested) <= suggested * 0.5; // within 50% of suggested
  if (betCorrect) state.game.betCorrect++;

  game.player = [gameDraw(), gameDraw()];
  game.dealer = [gameDraw(), gameDraw()];
  game.inHand = true;
  gameUpdateCount();
  gameRender(true); // hide dealer hole card
  document.getElementById('g-bet-area').classList.add('hidden');
  document.getElementById('g-actions').classList.remove('hidden');
  document.getElementById('g-feedback').classList.add('hidden');
  // Disable buttons that don't apply
  const isFirst = game.player.length === 2;
  document.querySelector('#g-actions [data-action="D"]').disabled = !isFirst;
  document.querySelector('#g-actions [data-action="P"]').disabled = !(isFirst && isPair(game.player));
  document.querySelector('#g-actions [data-action="R"]').disabled = !isFirst;
  // Store bet correctness for end-of-hand display
  game.betWasCorrect = betCorrect;
  game.betSuggested = suggested;
  game.tcAtDeal = tcVal;
}

function gameRender(hideDealer = false) {
  renderHand(game.player, document.getElementById('g-player'));
  renderHand(game.dealer, document.getElementById('g-dealer'), hideDealer && game.inHand);
  document.getElementById('g-bankroll').textContent = '$' + state.game.bankroll;
  document.getElementById('g-lastbet').textContent = '$' + game.bet;
}

function gameAction(action) {
  if (!game.inHand) return;
  const correctAction = basicStrategy(game.player, game.dealer[0], { h17: true, das: true, surrender: true, decks: 6 });
  // For now, simple deviation: insurance not implemented as separate; 16vT and Fab 4 etc. checked via TC
  // We're scoring against pure basic strategy for simplicity in this MVP.
  const isCorrect = action === correctAction;
  state.game.hands++;
  if (isCorrect) state.game.playCorrect++;

  // Resolve the hand based on player action
  if (action === 'H') {
    game.player.push(gameDraw());
    gameUpdateCount();
    gameRender(true);
    const total = handTotal(game.player).total;
    if (total > 21) {
      gameEndHand(action, correctAction, isCorrect, 'bust');
      return;
    }
    if (total === 21) {
      gameEndHand(action, correctAction, isCorrect, 'twentyone');
      return;
    }
    // Disable double/split/surrender now
    document.querySelector('#g-actions [data-action="D"]').disabled = true;
    document.querySelector('#g-actions [data-action="P"]').disabled = true;
    document.querySelector('#g-actions [data-action="R"]').disabled = true;
    return;
  }
  if (action === 'S' || action === 'D' || action === 'R' || action === 'P') {
    // For MVP simplicity, double/split/surrender end the player's turn directly
    if (action === 'D') {
      game.player.push(gameDraw());
      state.game.bankroll -= game.bet; // additional bet
      game.bet *= 2;
    }
    gameEndHand(action, correctAction, isCorrect, action);
  }
}

function gameEndHand(playerAction, correctAction, isCorrect, mode) {
  // Reveal dealer
  game.rc += hiLoValue(game.dealer[1].rank); // count hole card
  // If player surrendered, no dealer play needed
  let outcome = '';
  let payout = 0;
  if (mode === 'R') {
    payout = game.bet / 2; // get half back
    outcome = 'Surrender (lost half)';
  } else if (mode === 'bust') {
    outcome = 'Bust, lose';
  } else {
    // Dealer plays
    while (handTotal(game.dealer).total < 17 || (handTotal(game.dealer).total === 17 && handTotal(game.dealer).isSoft)) {
      const c = gameDraw();
      game.dealer.push(c);
    }
    const playerTotal = handTotal(game.player).total;
    const dealerTotal = handTotal(game.dealer).total;
    const playerBJ = game.player.length === 2 && playerTotal === 21;
    const dealerBJ = game.dealer.length === 2 && dealerTotal === 21;
    if (playerBJ && !dealerBJ) {
      payout = game.bet * 2.5; // 3:2 + original
      outcome = 'Blackjack! Win 3:2.';
    } else if (dealerTotal > 21) {
      payout = game.bet * 2;
      outcome = 'Dealer busts. Win.';
    } else if (playerTotal > dealerTotal) {
      payout = game.bet * 2;
      outcome = `Win (${playerTotal} vs ${dealerTotal})`;
    } else if (playerTotal === dealerTotal) {
      payout = game.bet;
      outcome = `Push (${playerTotal})`;
    } else {
      payout = 0;
      outcome = `Lose (${playerTotal} vs ${dealerTotal})`;
    }
  }
  state.game.bankroll += payout;
  save();

  gameRender(false);
  // Show feedback
  const fb = document.getElementById('g-feedback');
  fb.classList.remove('hidden', 'correct', 'wrong');
  fb.classList.add(isCorrect && game.betWasCorrect ? 'correct' : 'wrong');
  let html = `<div class="verdict">${outcome}</div>`;
  html += `<div class="explanation">`;
  html += `<strong>Play:</strong> ${isCorrect ? '✓' : '✗'} You played ${actionLabel(playerAction)}, basic strategy says ${actionLabel(correctAction)}.<br>`;
  html += `<strong>Bet:</strong> ${game.betWasCorrect ? '✓' : '✗'} You bet $${game.bet/(playerAction === 'D' ? 2 : 1)} at TC ${game.tcAtDeal >= 0 ? '+' : ''}${game.tcAtDeal} (suggested $${game.betSuggested}).<br>`;
  html += `<strong>Payout:</strong> ${payout > 0 ? '+' : ''}$${payout - game.bet} net.`;
  html += `</div>`;
  html += `<button id="g-next" class="primary-btn">Next hand →</button>`;
  fb.innerHTML = html;
  document.getElementById('g-actions').classList.add('hidden');
  document.getElementById('g-next').addEventListener('click', () => {
    document.getElementById('g-feedback').classList.add('hidden');
    document.getElementById('g-bet-area').classList.remove('hidden');
    document.getElementById('g-deal').disabled = true;
    game.bet = 0;
    document.querySelectorAll('.bet-buttons button').forEach(b => b.classList.remove('selected'));
    game.inHand = false;
    gameUpdateCount();
    gameRenderStats();
  });
  game.inHand = false;
  gameRenderStats();
}

function gameRenderStats() {
  document.getElementById('g-hands').textContent = state.game.hands;
  const playAcc = state.game.hands ? Math.round(100 * state.game.playCorrect / state.game.hands) : 100;
  const betAcc = state.game.hands ? Math.round(100 * state.game.betCorrect / state.game.hands) : 100;
  document.getElementById('g-play-acc').textContent = playAcc;
  document.getElementById('g-bet-acc').textContent = betAcc;
}

// ============================ STATS PAGE ============================
function statsRender() {
  // Phase 1
  const p1Acc = state.p1.total ? Math.round(100 * state.p1.correct / state.p1.total) : null;
  document.getElementById('s-p1-acc').textContent = p1Acc !== null ? p1Acc + '%' : '—';
  document.getElementById('s-p1-detail').textContent = state.p1.total ? `${state.p1.correct}/${state.p1.total} hands` : 'No sessions yet';
  // Deck-down
  document.getElementById('s-dd-time').textContent = state.dd.bestTime ? state.dd.bestTime.toFixed(1) + 's' : '—';
  document.getElementById('s-dd-detail').textContent = state.dd.total ? `${state.dd.correct}/${state.dd.total} correct` : 'No sessions yet';
  // TC
  const tcAcc = state.tc.total ? Math.round(100 * state.tc.correct / state.tc.total) : null;
  document.getElementById('s-tc-acc').textContent = tcAcc !== null ? tcAcc + '%' : '—';
  const tcAvg = state.tc.total ? (state.tc.totalTime / state.tc.total).toFixed(1) : '—';
  document.getElementById('s-tc-detail').textContent = state.tc.total ? `Avg ${tcAvg}s/answer` : 'No sessions yet';
  // Game
  const gAcc = state.game.hands ? Math.round(100 * state.game.playCorrect / state.game.hands) : null;
  document.getElementById('s-g-acc').textContent = gAcc !== null ? gAcc + '%' : '—';
  document.getElementById('s-g-detail').textContent = state.game.hands ? `${state.game.hands} hands · BR $${state.game.bankroll}` : 'No sessions yet';

  // Worst cells
  const cells = Object.entries(state.p1.cellMisses).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const wc = document.getElementById('s-worst-cells');
  if (cells.length === 0) {
    wc.textContent = 'No data yet. Drill some hands.';
  } else {
    wc.innerHTML = cells.map(([k, v]) => `<span class="cell">${k} (${v}×)</span>`).join('');
  }
}

// ============================ NAVIGATION & EVENT WIRING ============================
function showPhase(n) {
  document.querySelectorAll('.phase').forEach(p => p.classList.remove('active'));
  document.getElementById('phase' + n).classList.add('active');
  document.querySelectorAll('#phase-nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.phase === String(n));
  });
  if (n === '0') statsRender();
  if (n === '3' && game.shoe.length === 0) gameInit();
}

function showDrill(name) {
  document.querySelectorAll('.drill').forEach(d => d.classList.remove('active'));
  document.getElementById('drill-' + name).classList.add('active');
  document.querySelectorAll('.drill-tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.drill === name);
  });
}

document.querySelectorAll('#phase-nav button').forEach(b => {
  b.addEventListener('click', () => showPhase(b.dataset.phase));
});
document.querySelectorAll('.drill-tabs button').forEach(b => {
  b.addEventListener('click', () => showDrill(b.dataset.drill));
});

// Phase 1 wiring
document.querySelectorAll('#actions .action-btn').forEach(b => {
  b.addEventListener('click', () => {
    if (b.disabled) return;
    p1Submit(b.dataset.action);
  });
});
document.getElementById('next-hand').addEventListener('click', p1NewHand);
document.getElementById('reset-stats').addEventListener('click', () => {
  if (confirm('Reset Phase 1 stats?')) {
    state.p1 = { correct: 0, total: 0, streak: 0, cellMisses: {} };
    save();
    p1RenderStats();
    p1NewHand();
  }
});

// Phase 2 wiring
document.getElementById('dd-start').addEventListener('click', ddStart);
document.getElementById('dd-submit').addEventListener('click', ddSubmit);
document.getElementById('dd-answer').addEventListener('keydown', e => { if (e.key === 'Enter') ddSubmit(); });
document.getElementById('tc-start').addEventListener('click', tcStart);
document.getElementById('tc-submit').addEventListener('click', tcSubmit);
document.getElementById('tc-answer').addEventListener('keydown', e => { if (e.key === 'Enter') tcSubmit(); });
document.getElementById('pc-start').addEventListener('click', pcStart);
document.querySelectorAll('#drill-pairs .quick-buttons button').forEach(b => {
  b.addEventListener('click', () => pcSubmit(parseInt(b.dataset.val, 10)));
});

// Phase 3 wiring
document.querySelectorAll('.bet-buttons button').forEach(b => {
  b.addEventListener('click', () => gameSelectBet(parseInt(b.dataset.bet, 10)));
});
document.getElementById('g-deal').addEventListener('click', gameDeal);
document.querySelectorAll('#g-actions .action-btn').forEach(b => {
  b.addEventListener('click', () => {
    if (b.disabled) return;
    gameAction(b.dataset.action);
  });
});

// Stats reset
document.getElementById('reset-all').addEventListener('click', () => {
  if (confirm('Reset ALL stats? This cannot be undone.')) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
});

// Initial render
p1RenderStats();
ddRenderStats();
tcRenderStats();
pcRenderStats();
gameRenderStats();
p1NewHand();
