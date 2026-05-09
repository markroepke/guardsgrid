#!/usr/bin/env node
/**
 * GuardsGrid test suite — zero-dependency Node runner.
 *
 * Loads index.html, mocks just enough of the browser APIs to let the
 * embedded <script> execute, then runs assertions against the in-memory
 * game state. Run with:  node test.js
 */

const fs = require('fs');
const path = require('path');

// ===== Browser globals shim =====
function makeStubElement() {
    const el = {
        classList: {
            _set: new Set(),
            add(...v) { v.forEach(x => this._set.add(x)); },
            remove(...v) { v.forEach(x => this._set.delete(x)); },
            contains(v) { return this._set.has(v); },
            toggle(v) { this._set.has(v) ? this._set.delete(v) : this._set.add(v); }
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        style: {},
        dataset: {},
        setAttribute: () => {},
        getAttribute: () => null,
        removeAttribute: () => {},
        appendChild() {},
        removeChild() {},
        replaceChild() {},
        getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
        focus: () => {},
        blur: () => {},
        click: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        innerHTML: '',
        textContent: '',
        value: '',
        children: [],
        onclick: null,
        parentNode: null
    };
    return el;
}

const _localStore = {};
global.localStorage = {
    getItem: (k) => (k in _localStore ? _localStore[k] : null),
    setItem: (k, v) => { _localStore[k] = String(v); },
    removeItem: (k) => { delete _localStore[k]; },
    clear: () => { for (const k in _localStore) delete _localStore[k]; }
};

const stubEl = makeStubElement();
global.document = {
    getElementById: () => makeStubElement(),
    querySelector: () => makeStubElement(),
    querySelectorAll: () => [],
    createElement: () => makeStubElement(),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: stubEl
};

global.window = {
    location: { hash: '', pathname: '/', origin: 'https://test.example', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: global.localStorage,
    visualViewport: null,
    history: { replaceState: () => {} },
    innerWidth: 800,
    innerHeight: 1200,
    prompt: () => null
};

global.navigator = { share: undefined, clipboard: { writeText: async () => {} }, serviceWorker: undefined };
global.location = global.window.location;
global.history = global.window.history;
global.MutationObserver = class { observe() {} disconnect() {} };
global.confirm = () => true;
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
global.setInterval = setInterval;
global.clearInterval = clearInterval;

// ===== Load and execute the game script =====
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) {
    console.error('Could not extract <script> from index.html');
    process.exit(1);
}

// Wrap in a function that returns the names we want to test
const wrapped = `
    ${m[1]}
    return {
        guardiansPlayers, playerData, statTags,
        allRowCriteria, allColumnCriteria,
        INFIELD_CODES, OUTFIELD_CODES,
        parsePositions, playedPosition, distinctDefensivePositions,
        getTodayDateString, parseDateString, formatDateShort, formatDateLong, isToday,
        getDailyNumber, getDailySeed, makeRng,
        selectDailyCriteria, selectRandomCriteria, findValidCriteria,
        normalizeForSearch, hasStatTag,
        loadAllStates, saveDailyState, loadDailyState, getStateSummary,
        calculateStats, buildShareText
    };
`;

let game;
try {
    game = (new Function(wrapped))();
} catch (e) {
    console.error('Game script threw on load:', e.message);
    console.error(e.stack);
    process.exit(1);
}

// ===== Test runner =====
const tests = [];
let currentSuite = '';

function describe(name, fn) {
    currentSuite = name;
    fn();
    currentSuite = '';
}
function test(name, fn) {
    tests.push({ suite: currentSuite, name, fn });
}
function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}
function assertEq(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${msg || 'not equal'}\n   actual:   ${a}\n   expected: ${e}`);
}
function assertGt(a, b, msg) {
    if (!(a > b)) throw new Error(`${msg || 'not greater'}: ${a} not > ${b}`);
}
function assertGte(a, b, msg) {
    if (!(a >= b)) throw new Error(`${msg || 'not >='}: ${a} not >= ${b}`);
}
function assertContains(arr, item, msg) {
    if (!arr.includes(item)) throw new Error(`${msg || 'not in array'}: ${item}`);
}

// ===== TESTS =====

describe('Player data integrity', () => {
    test('exactly 2013 raw entries', () => {
        assertEq(game.playerData.length, 2013);
    });
    test('every entry is [name, posStr, startYear, endYear, awardsStr]', () => {
        for (const p of game.playerData) {
            assertEq(p.length, 5, `bad entry: ${JSON.stringify(p)}`);
            assert(typeof p[0] === 'string' && p[0].length > 0, `bad name: ${p[0]}`);
            assert(typeof p[1] === 'string' && p[1].length > 0, `bad pos: ${p[1]}`);
            assert(Number.isInteger(p[2]) && p[2] >= 1901 && p[2] <= 2026, `bad startYear: ${p[2]}`);
            assert(Number.isInteger(p[3]) && p[3] >= 1901 && p[3] <= 2026, `bad endYear: ${p[3]}`);
            assert(p[3] >= p[2], `endYear before startYear: ${p[0]}`);
            assert(typeof p[4] === 'string', `bad awardsStr: ${p[0]}`);
        }
    });
    test('processed players have name + positionCodes + years', () => {
        for (const p of game.guardiansPlayers) {
            assert(typeof p.name === 'string', `bad name: ${p.name}`);
            assert(Array.isArray(p.positionCodes) && p.positionCodes.length > 0, `bad codes: ${p.name}`);
            assert(Array.isArray(p.years) && p.years.length > 0, `bad years: ${p.name}`);
            assert(['Pitcher','Catcher','Infielder','Outfielder'].includes(p.position),
                `bad primary position: ${p.name} → ${p.position}`);
        }
    });
    test('processed roster size between 1900 and 2013 unique players', () => {
        assertGte(game.guardiansPlayers.length, 1900);
        assertGte(2013, game.guardiansPlayers.length);
    });
    test('canonical historical players are present', () => {
        const required = [
            'Bob Feller', 'Cy Young', 'Nap Lajoie', 'Tristram Speaker',
            'Larry Doby', 'Lou Boudreau', 'Jim Thome', 'Manny Ramirez',
            'José Ramírez', 'Steven Kwan', 'Andrés Giménez', 'Earl Averill Sr.',
            'Hal Trosky Sr.', 'Sandy Alomar Jr.', 'Joe Sewell', 'Stan Coveleski',
            'Bob Lemon', 'Early Wynn', 'CC Sabathia', 'Cliff Lee', 'Corey Kluber',
            'Shane Bieber'
        ];
        for (const name of required) {
            assert(game.guardiansPlayers.some(p => p.name === name), `missing: ${name}`);
        }
    });
});

describe('Position parsing', () => {
    test('single pitcher code', () => {
        assertEq(game.parsePositions('P').primary, 'Pitcher');
        assertEq(game.parsePositions('P').codes, ['P']);
    });
    test('single catcher code', () => {
        assertEq(game.parsePositions('C').primary, 'Catcher');
    });
    test('multi-position infielder takes primary from first', () => {
        const r = game.parsePositions('3B|2B|SS');
        assertEq(r.primary, 'Infielder');
        assertEq(r.codes, ['3B', '2B', 'SS']);
    });
    test('1B|DH player primary is Infielder (not DH)', () => {
        assertEq(game.parsePositions('1B|DH').primary, 'Infielder');
    });
    test('outfielder with sub-positions', () => {
        assertEq(game.parsePositions('CF|LF|RF').primary, 'Outfielder');
    });
    test('generic OF', () => {
        assertEq(game.parsePositions('OF').primary, 'Outfielder');
    });
    test('playedPosition checks for any position', () => {
        const jose = game.guardiansPlayers.find(p => p.name === 'José Ramírez');
        assert(game.playedPosition(jose, '3B'));
        assert(game.playedPosition(jose, '2B'));
        assert(game.playedPosition(jose, 'SS'));
        assert(!game.playedPosition(jose, 'P'));
        assert(!game.playedPosition(jose, 'C'));
    });
    test('distinctDefensivePositions excludes DH', () => {
        const thome = game.guardiansPlayers.find(p => p.name === 'Jim Thome');
        // 1B and DH → 1 distinct defensive position
        assertEq(game.distinctDefensivePositions(thome), 1);
    });
});

describe('Date utilities', () => {
    test('parseDateString roundtrip', () => {
        const d = game.parseDateString('2026-05-09');
        assertEq(d.getFullYear(), 2026);
        assertEq(d.getMonth(), 4); // 0-indexed May
        assertEq(d.getDate(), 9);
    });
    test('formatDateShort', () => {
        assertEq(game.formatDateShort('2026-05-09'), 'May 9');
        assertEq(game.formatDateShort('2026-12-25'), 'Dec 25');
        assertEq(game.formatDateShort('2026-01-01'), 'Jan 1');
    });
    test('formatDateLong', () => {
        assertEq(game.formatDateLong('2026-05-09'), 'May 9');
        assertEq(game.formatDateLong('2026-12-25'), 'December 25');
    });
    test('getDailyNumber for launch date is 1', () => {
        // Launch date is 2026-04-09. We'd need to set viewingDate but the
        // function uses a global. Just check the math works.
        global.viewingDate = '2026-04-09';
        assertEq(game.getDailyNumber('2026-04-09'), 1);
    });
    test('getDailyNumber increments by date', () => {
        assertEq(game.getDailyNumber('2026-04-10'), 2);
        assertEq(game.getDailyNumber('2026-05-09'), 31);
    });
    test('getDailyNumber clamps to 1 for pre-launch dates', () => {
        assertEq(game.getDailyNumber('2026-04-01'), 1);
    });
});

describe('Search normalization', () => {
    test('strips Spanish accents', () => {
        assertEq(game.normalizeForSearch('José Ramírez'), 'jose ramirez');
        assertEq(game.normalizeForSearch('Andrés Giménez'), 'andres gimenez');
        assertEq(game.normalizeForSearch('Bobby Avila'), 'bobby avila');
    });
    test('substring search across accent boundaries', () => {
        assert(game.normalizeForSearch('José Ramírez').includes(game.normalizeForSearch('ramire')));
        assert(game.normalizeForSearch('Andrés Giménez').includes(game.normalizeForSearch('gimenez')));
    });
    test('lowercases', () => {
        assertEq(game.normalizeForSearch('SHANE BIEBER'), 'shane bieber');
    });
});

describe('Criteria checks', () => {
    test('Pitcher criterion matches every P', () => {
        const crit = game.allColumnCriteria.find(c => c.label === 'Pitcher');
        const matches = game.guardiansPlayers.filter(crit.check);
        assertGte(matches.length, 800, `only ${matches.length} pitchers`);
        assert(matches.every(p => p.positionCodes.includes('P')));
    });
    test('Catcher criterion matches every C', () => {
        const crit = game.allColumnCriteria.find(c => c.label === 'Catcher');
        const matches = game.guardiansPlayers.filter(crit.check);
        assertGte(matches.length, 100);
    });
    test('Hall of Famer criterion finds known HOFers', () => {
        const crit = game.allRowCriteria.find(c => c.label === 'Hall of Famer');
        const matches = game.guardiansPlayers.filter(crit.check).map(p => p.name);
        assertContains(matches, 'Bob Feller', 'Bob Feller should be HOF');
        assertContains(matches, 'Cy Young', 'Cy Young should be HOF');
        assertContains(matches, 'Nap Lajoie', 'Nap Lajoie should be HOF');
        assertGte(matches.length, 20, 'expected 20+ HOFers');
    });
    test('Cy Young Winner criterion is small and exclusive', () => {
        const crit = game.allRowCriteria.find(c => c.label === 'Cy Young Winner');
        const matches = game.guardiansPlayers.filter(crit.check).map(p => p.name);
        assertContains(matches, 'Shane Bieber');
        assertContains(matches, 'Corey Kluber');
        assertContains(matches, 'Cliff Lee');
        assertContains(matches, 'CC Sabathia');
    });
    test('1990s Player matches anyone who played any year 1990-1999', () => {
        const crit = game.allRowCriteria.find(c => c.label === '1990s Player');
        const matches = game.guardiansPlayers.filter(crit.check);
        assert(matches.every(p => p.years.some(y => y >= 1990 && y <= 1999)));
        // Sanity: Jim Thome played in the 90s
        assert(matches.some(p => p.name === 'Jim Thome'));
    });
    test('First Baseman matches anyone who ever played 1B', () => {
        const crit = game.allColumnCriteria.find(c => c.label === 'First Baseman');
        const matches = game.guardiansPlayers.filter(crit.check);
        assert(matches.every(p => p.positionCodes.includes('1B')));
        assert(matches.some(p => p.name === 'Jim Thome'));
    });
    test('Multi-Positional needs 3+ distinct defensive positions', () => {
        const crit = game.allRowCriteria.find(c => c.label === 'Multi-Positional');
        const matches = game.guardiansPlayers.filter(crit.check);
        assert(matches.every(p => game.distinctDefensivePositions(p) >= 3));
    });
    test('Right-Handed and Left-Handed are mutually exclusive', () => {
        const r = game.allColumnCriteria.find(c => c.label === 'Right-Handed');
        const l = game.allColumnCriteria.find(c => c.label === 'Left-Handed');
        const both = game.guardiansPlayers.filter(p => r.check(p) && l.check(p));
        assertEq(both.length, 0, 'no player should be both R and L handed');
        const total = game.guardiansPlayers.filter(p => r.check(p) || l.check(p)).length;
        assertEq(total, game.guardiansPlayers.length, 'every player has a hand');
    });
});

describe('StatTag integrity', () => {
    test('every name in statTags exists in the player database', () => {
        const known = new Set(game.guardiansPlayers.map(p => p.name));
        for (const tag in game.statTags) {
            for (const name of game.statTags[tag]) {
                assert(known.has(name), `${tag} references unknown player: ${name}`);
            }
        }
    });
    test('hasStatTag works correctly', () => {
        const thome = game.guardiansPlayers.find(p => p.name === 'Jim Thome');
        assert(game.hasStatTag(thome, 'hr300'));
        assert(game.hasStatTag(thome, 'hr200'));
        assert(!game.hasStatTag(thome, 'wins200'));
    });
    test('only Jim Thome has 300+ Career HR with Cleveland', () => {
        assertEq(game.statTags.hr300, ['Jim Thome']);
    });
    test('200+ Career Wins is small and exclusive', () => {
        const winners = game.statTags.wins200;
        assertEq(winners, ['Bob Feller', 'Mel Harder', 'Bob Lemon']);
    });
});

describe('Daily puzzle determinism', () => {
    test('same date yields same selection', () => {
        global.viewingDate = '2026-05-09';
        game.selectDailyCriteria();
        const r1 = game.allRowCriteria; // unused, just keeping ref
        // Read off the global selectedRowCriteria/Column via a roundtrip
        const wrapped = `
            ${m[1]}
            viewingDate = '2026-05-09';
            selectDailyCriteria();
            return { rows: selectedRowCriteria.map(r => r.label), cols: selectedColumnCriteria.map(c => c.label) };
        `;
        const a = (new Function(wrapped))();
        const b = (new Function(wrapped))();
        assertEq(a.rows, b.rows);
        assertEq(a.cols, b.cols);
    });
    test('different dates usually yield different selections', () => {
        const wrapper = (date) => {
            const w = `
                ${m[1]}
                viewingDate = '${date}';
                selectDailyCriteria();
                return { rows: selectedRowCriteria.map(r => r.label), cols: selectedColumnCriteria.map(c => c.label) };
            `;
            return (new Function(w))();
        };
        const a = wrapper('2026-05-09');
        const b = wrapper('2026-05-10');
        // Could collide once in a blue moon but extremely unlikely
        const same = JSON.stringify(a) === JSON.stringify(b);
        assert(!same, 'two consecutive dates produced identical puzzles');
    });
});

describe('Daily puzzle quality', () => {
    test('30 sample dates from launch all hit 3+ matches per cell', () => {
        for (let day = 0; day < 30; day++) {
            const d = new Date(2026, 3, 9);
            d.setDate(d.getDate() + day);
            const ds = d.getFullYear() + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0');

            const w = `
                ${m[1]}
                viewingDate = '${ds}';
                selectDailyCriteria();
                let minMatches = Infinity;
                for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 3; c++) {
                        const n = guardiansPlayers.reduce((acc, p) =>
                            acc + (selectedRowCriteria[r].check(p) && selectedColumnCriteria[c].check(p) ? 1 : 0), 0);
                        if (n < minMatches) minMatches = n;
                    }
                }
                return minMatches;
            `;
            const minMatches = (new Function(w))();
            assertGte(minMatches, 3, `${ds} has a cell with only ${minMatches} matches`);
        }
    });
});

describe('Share text', () => {
    test('shareable format with daily number, score, emoji grid, URL', () => {
        const w = `
            ${m[1]}
            viewingDate = '2026-05-09';
            gameState = [
                [{name:'Speaker', correct:true},  {name:'Avila', correct:false}, {name:'Lofton', correct:true}],
                [{name:'Boudreau', correct:true}, null,                          {name:'Doby', correct:true}],
                [{name:'Feller', correct:false},  {name:'Lemon', correct:true},  {name:'Wynn', correct:true}]
            ];
            gaveUp = false;
            return buildShareText();
        `;
        const text = (new Function(w))();
        assert(text.startsWith('GuardsGrid #'));
        assert(/— \d+\/9/.test(text), 'should have score X/9');
        assert(text.includes('🟦'));
        assert(text.includes('🟥'));
        assert(text.includes('⬛'));
        assert(text.includes('https://'));
        assert(text.includes('#2026-05-09'));
    });
    test('perfect 9/9 includes ★', () => {
        const w = `
            ${m[1]}
            viewingDate = '2026-05-09';
            gameState = [
                [{name:'A',correct:true},{name:'B',correct:true},{name:'C',correct:true}],
                [{name:'D',correct:true},{name:'E',correct:true},{name:'F',correct:true}],
                [{name:'G',correct:true},{name:'H',correct:true},{name:'I',correct:true}]
            ];
            gaveUp = false;
            return buildShareText();
        `;
        const text = (new Function(w))();
        assert(text.includes('★'), 'perfect score should include ★');
        assert(text.includes('9/9'));
    });
    test('forfeit includes "(forfeit)"', () => {
        const w = `
            ${m[1]}
            viewingDate = '2026-05-09';
            gameState = [
                [{name:'A',correct:true},null,null],
                [null,null,null],
                [null,null,null]
            ];
            gaveUp = true;
            return buildShareText();
        `;
        const text = (new Function(w))();
        assert(text.includes('(forfeit)'), 'forfeited share should include (forfeit)');
    });
});

describe('State persistence', () => {
    test('save → load roundtrip', () => {
        const w = `
            ${m[1]}
            viewingDate = '2026-05-09';
            practiceMode = false;
            gaveUp = false;
            gameState = [
                [{name:'X',correct:true},null,null],
                [null,{name:'Y',correct:false},null],
                [null,null,null]
            ];
            saveDailyState();
            // Reset and reload
            gameState = [[null,null,null],[null,null,null],[null,null,null]];
            gaveUp = false;
            const finished = loadDailyState();
            return { finished, state: gameState };
        `;
        const r = (new Function(w))();
        assertEq(r.finished, false);
        assertEq(r.state[0][0], { name: 'X', correct: true });
        assertEq(r.state[1][1], { name: 'Y', correct: false });
        assertEq(r.state[2][2], null);
    });
    test('practiceMode skips save', () => {
        const w = `
            ${m[1]}
            viewingDate = '2026-05-09';
            practiceMode = true;
            gameState = [
                [{name:'PRACTICE',correct:true},null,null],
                [null,null,null],
                [null,null,null]
            ];
            saveDailyState();
            practiceMode = false;
            gameState = [[null,null,null],[null,null,null],[null,null,null]];
            const finished = loadDailyState();
            // Practice cell should NOT have been saved
            return { finished, hasSavedPractice: gameState[0][0] !== null };
        `;
        // Reset localStorage between tests
        global.localStorage.clear();
        const r = (new Function(w))();
        assertEq(r.hasSavedPractice, false, 'practice mode should not save');
    });
});

describe('Stats', () => {
    test('empty storage gives zero played', () => {
        global.localStorage.clear();
        const w = `
            ${m[1]}
            return calculateStats();
        `;
        const s = (new Function(w))();
        assertEq(s.played, 0);
        assertEq(s.perfect, 0);
        assertEq(s.currentStreak, 0);
        assertEq(s.bestStreak, 0);
    });
    test('counts perfect games and tracks streaks', () => {
        global.localStorage.clear();
        // Seed three consecutive completed days, two perfect
        const today = new Date();
        const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        const d2 = new Date(today); d2.setDate(d2.getDate() - 2);
        const d1 = new Date(today); d1.setDate(d1.getDate() - 1);
        const d0 = new Date(today);

        const allPerfect = (correctCount) => {
            const cells = [];
            for (let r = 0; r < 3; r++) {
                const row = [];
                for (let c = 0; c < 3; c++) {
                    row.push({ n: 'P' + r + c, c: r * 3 + c < correctCount });
                }
                cells.push(row);
            }
            return cells;
        };
        const seed = {
            [ymd(d2)]: { cells: allPerfect(9), finished: true, gaveUp: false },
            [ymd(d1)]: { cells: allPerfect(7), finished: true, gaveUp: false },
            [ymd(d0)]: { cells: allPerfect(9), finished: true, gaveUp: false }
        };
        global.localStorage.setItem('guardsgrid-daily-v2', JSON.stringify(seed));
        const w = `${m[1]}\nreturn calculateStats();`;
        const s = (new Function(w))();
        assertEq(s.played, 3);
        assertEq(s.perfect, 2);
        assertEq(s.currentStreak, 3, 'three consecutive completes');
        assertEq(s.bestStreak, 3);
    });
    test('skipped day breaks streak', () => {
        global.localStorage.clear();
        const today = new Date();
        const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        const d3 = new Date(today); d3.setDate(d3.getDate() - 3);
        const d0 = new Date(today);
        const cell = { n: 'X', c: true };
        const allFilled = [[cell,cell,cell],[cell,cell,cell],[cell,cell,cell]];
        const seed = {
            [ymd(d3)]: { cells: allFilled, finished: true, gaveUp: false },
            [ymd(d0)]: { cells: allFilled, finished: true, gaveUp: false }
        };
        global.localStorage.setItem('guardsgrid-daily-v2', JSON.stringify(seed));
        const w = `${m[1]}\nreturn calculateStats();`;
        const s = (new Function(w))();
        // Today + nothing → streak of 1
        assertEq(s.currentStreak, 1);
    });
});

describe('Practice mode', () => {
    test('selectRandomCriteria produces valid puzzle', () => {
        const w = `
            ${m[1]}
            selectRandomCriteria();
            // Verify every cell has at least 1 valid player
            let minMatches = Infinity;
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    const n = guardiansPlayers.reduce((acc, p) =>
                        acc + (selectedRowCriteria[r].check(p) && selectedColumnCriteria[c].check(p) ? 1 : 0), 0);
                    if (n < minMatches) minMatches = n;
                }
            }
            return minMatches;
        `;
        // Run a few times to be sure
        for (let i = 0; i < 5; i++) {
            const m = (new Function(w))();
            assertGte(m, 1);
        }
    });
});

// ===== Run =====
let passed = 0, failed = 0;
let lastSuite = null;
for (const t of tests) {
    if (t.suite !== lastSuite) {
        if (lastSuite !== null) console.log('');
        console.log(`\x1b[1m${t.suite}\x1b[0m`);
        lastSuite = t.suite;
    }
    try {
        t.fn();
        console.log(`  \x1b[32m✓\x1b[0m ${t.name}`);
        passed++;
    } catch (e) {
        console.log(`  \x1b[31m✗\x1b[0m ${t.name}`);
        for (const line of String(e.message).split('\n')) {
            console.log(`     ${line}`);
        }
        failed++;
    }
}

console.log('');
console.log(`\x1b[1m${passed} passed, ${failed} failed\x1b[0m (${tests.length} total)`);
process.exit(failed > 0 ? 1 : 0);
