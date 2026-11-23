/*
 * 兩人軍棋(陸軍棋,布陣暗棋)引擎:棋盤、走法、勝負判定、電腦對手。
 * 純 JS、無相依,瀏覽器與 Node 皆可載入。
 *
 * 棋盤 12 列 × 5 行,位置 pos = r * 5 + c。
 *   side 0(玩家)在下方第 6~11 列,side 1(電腦)在上方第 0~5 列。
 * 棋子種類 type:1~9 = 工兵…司令(數字越大越大),10 = 炸彈,11 = 地雷,12 = 軍旗
 */
(function (root) {
  'use strict';

  var ROWS = 12, COLS = 5, N = 60;
  var BOMB = 10, MINE = 11, FLAG = 12;
  var NAMES = ['', '工兵', '排長', '連長', '營長', '團長', '旅長', '師長', '軍長', '司令', '炸彈', '地雷', '軍旗'];
  var COUNT = [0, 3, 3, 3, 2, 2, 2, 2, 1, 1, 2, 3, 1];
  var VALUE = [0, 13, 5, 8, 12, 18, 26, 36, 52, 75, 28, 14, 1000];

  var camp = new Uint8Array(N), hq = new Uint8Array(N), station = new Uint8Array(N);
  var roadAdj = [], railNext = [];
  var DR = [-1, 1, 0, 0], DC = [0, 0, -1, 1];

  (function build() {
    var r, c, d, p;
    [[2, 1], [2, 3], [3, 2], [4, 1], [4, 3], [7, 1], [7, 3], [8, 2], [9, 1], [9, 3]].forEach(function (x) { camp[x[0] * 5 + x[1]] = 1; });
    [[0, 1], [0, 3], [11, 1], [11, 3]].forEach(function (x) { hq[x[0] * 5 + x[1]] = 1; });
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      if (r === 1 || r === 5 || r === 6 || r === 10 || ((c === 0 || c === 4) && r >= 1 && r <= 10)) station[r * 5 + c] = 1;
    }
    function inside(rr, cc) { return rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS; }
    // 兩軍之間只有第 0、2、4 行相通
    function crossOK(r1, r2, cc) { return !((r1 === 5 && r2 === 6) || (r1 === 6 && r2 === 5)) || cc % 2 === 0; }
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      p = r * 5 + c;
      var list = [], rails = [-1, -1, -1, -1];
      for (d = 0; d < 4; d++) {
        var rr = r + DR[d], cc = c + DC[d];
        if (!inside(rr, cc) || !crossOK(r, rr, c)) continue;
        var q = rr * 5 + cc;
        list.push(q);
        if (station[p] && station[q]) {
          var horizontal = d >= 2;
          if (horizontal ? (r === 1 || r === 5 || r === 6 || r === 10)
                         : (c === 0 || c === 4 || (c === 2 && Math.min(r, rr) === 5))) rails[d] = q;
        }
      }
      roadAdj.push(list);
      railNext.push(rails);
    }
    // 行營和斜角的四個位置相通
    for (p = 0; p < N; p++) {
      if (!camp[p]) continue;
      r = Math.floor(p / 5); c = p % 5;
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (x) {
        var q = (r + x[0]) * 5 + c + x[1];
        if (roadAdj[p].indexOf(q) < 0) roadAdj[p].push(q);
        if (roadAdj[q].indexOf(p) < 0) roadAdj[q].push(p);
      });
    }
  })();

  function rowOf(p) { return Math.floor(p / 5); }
  function homeRow(p, side) { return side === 0 ? 11 - rowOf(p) : rowOf(p); }   // 0 = 最後一列

  /** 布陣規則:這種棋能不能放在這個位置 */
  function canPlace(type, pos, side) {
    var r = rowOf(pos);
    if (side === 0 ? r < 6 : r > 5) return false;
    if (camp[pos]) return false;
    var back = homeRow(pos, side);
    if (type === FLAG) return !!hq[pos];
    if (type === MINE) return back <= 1;
    if (type === BOMB) return back !== 5;
    return true;
  }

  function piece(side, type) {
    return { side: side, type: type, moved: false, lo: 0, hi: 10, survived: false, notMine: false, known: 0, revealed: false };
  }

  function shuffle(a, rng) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** 隨機產生一個合規、還算合理的陣形。回傳 { pos: type } */
  function randomLayout(side, rng) {
    rng = rng || Math.random;
    var P = function (back, c) { return (side === 0 ? 11 - back : back) * 5 + c; };   // back 0 = 最後一列
    var out = {}, pool = [];
    var t, i;
    for (t = 1; t <= 9; t++) for (i = 0; i < COUNT[t]; i++) pool.push(t);
    var fc = rng() < 0.5 ? 1 : 3;
    out[P(0, fc)] = FLAG;
    // 地雷:多半圍在軍旗旁邊
    var mineSpots = rng() < 0.7
      ? [P(1, fc), P(0, fc - 1), P(0, fc + 1)]
      : shuffle([P(1, 0), P(1, 1), P(1, 2), P(1, 3), P(1, 4), P(0, 0), P(0, 2), P(0, 4)], rng).slice(0, 3);
    mineSpots.forEach(function (p) { out[p] = MINE; });
    var free = [];
    for (var p = 0; p < N; p++) {
      var r = rowOf(p);
      if ((side === 0 ? r >= 6 : r <= 5) && !camp[p] && out[p] === undefined) free.push(p);
    }
    shuffle(free, rng);
    // 炸彈不能放第一線
    for (i = 0; i < 2; i++) {
      var k = free.findIndex(function (q) { return homeRow(q, side) !== 5 && !hq[q]; });
      out[free[k]] = BOMB; free.splice(k, 1);
    }
    // 另一個大本營放小棋(放進去就不能動了)
    var otherHQ = P(0, 4 - fc);
    var low = pool.indexOf(rng() < 0.5 ? 2 : 3);
    out[otherHQ] = pool[low]; pool.splice(low, 1);
    free.splice(free.indexOf(otherHQ), 1);
    shuffle(pool, rng);
    free.forEach(function (q, idx) { out[q] = pool[idx]; });
    return out;
  }

  function validLayout(side, layout) {
    var cnt = COUNT.map(function () { return 0; }), total = 0;
    for (var p in layout) {
      if (!canPlace(layout[p], +p, side)) return false;
      cnt[layout[p]]++; total++;
    }
    if (total !== 25) return false;
    for (var t = 1; t <= 12; t++) if (cnt[t] !== COUNT[t]) return false;
    return true;
  }

  function newGame(layout0, layout1, first) {
    var board = new Array(N).fill(null), p;
    for (p in layout0) board[+p] = piece(0, layout0[p]);
    for (p in layout1) board[+p] = piece(1, layout1[p]);
    return { board: board, turn: first || 0, plies: 0, quiet: 0, over: null, lastMove: [null, null] };
  }

  /** 位置 pos 上的棋可以走到哪些位置 */
  function legalMoves(board, pos, asType) {
    var p = board[pos];
    if (!p) return [];
    var type = asType || p.type;
    if (type === MINE || type === FLAG || hq[pos]) return [];
    var seen = new Uint8Array(N), out = [], i, d, q, nx;
    function add(x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }
    var adj = roadAdj[pos];
    for (i = 0; i < adj.length; i++) {
      q = board[adj[i]];
      if (!q) add(adj[i]);
      else if (q.side !== p.side && !camp[adj[i]]) add(adj[i]);
    }
    if (station[pos]) {
      if (type === 1) {
        // 工兵在鐵路上可以轉彎
        var visited = new Uint8Array(N), queue = [pos];
        visited[pos] = 1;
        while (queue.length) {
          var cur = queue.pop();
          for (d = 0; d < 4; d++) {
            nx = railNext[cur][d];
            if (nx < 0 || visited[nx]) continue;
            visited[nx] = 1;
            q = board[nx];
            if (!q) { add(nx); queue.push(nx); }
            else if (q.side !== p.side) add(nx);
          }
        }
      } else {
        for (d = 0; d < 4; d++) {
          for (nx = railNext[pos][d]; nx >= 0; nx = railNext[nx][d]) {
            q = board[nx];
            if (!q) { add(nx); continue; }
            if (q.side !== p.side) add(nx);
            break;
          }
        }
      }
    }
    return out;
  }

  /** 攻方 a 碰守方 d 的結果:'win' 攻方贏、'lose' 攻方輸、'tie' 同歸於盡、'flag' 奪旗 */
  function battle(a, d) {
    if (d === FLAG) return 'flag';
    if (a === BOMB || d === BOMB) return 'tie';
    if (d === MINE) return a === 1 ? 'win' : 'lose';
    return a > d ? 'win' : a < d ? 'lose' : 'tie';
  }

  function hasMoves(state, side) {
    for (var p = 0; p < N; p++) {
      if (state.board[p] && state.board[p].side === side && legalMoves(state.board, p).length) return true;
    }
    return false;
  }

  function revealFlag(board, side) {
    for (var p = 0; p < N; p++) {
      if (board[p] && board[p].side === side && board[p].type === FLAG) board[p].revealed = true;
    }
  }

  /** 執行一步棋(不檢查合法性,呼叫前先用 legalMoves 確認)。回傳事件。 */
  function move(state, from, to) {
    var board = state.board, a = board[from], d = board[to];
    var ev = { from: from, to: to, result: 'move', attacker: a, defender: d, commanderDied: [] };
    a.moved = true;
    state.lastMove[a.side] = { from: from, to: to };
    if (!d) {
      board[to] = a; board[from] = null;
      state.quiet++;
    } else {
      ev.result = battle(a.type, d.type);
      state.quiet = 0;
      board[from] = null;
      if (ev.result === 'win' || ev.result === 'flag') {
        board[to] = a;
        a.survived = true;
        if (d.type === MINE) a.known = 1;                       // 挖掉地雷的一定是工兵
        else if (d.type <= 9) a.lo = Math.max(a.lo, d.type);
        if (d.type === 9) ev.commanderDied.push(d.side);
      } else if (ev.result === 'lose') {
        d.survived = true;
        if (a.type === 1) d.notMine = true;                     // 工兵都輸,所以不是地雷
        if (a.type <= 9) d.lo = Math.max(d.lo, a.type);
        if (a.type === 9) ev.commanderDied.push(a.side);
      } else {
        board[to] = null;
        if (a.type === 9) ev.commanderDied.push(a.side);
        if (d.type === 9) ev.commanderDied.push(d.side);
      }
      // 司令陣亡,軍旗要亮出來
      ev.commanderDied.forEach(function (s) { revealFlag(board, s); });
    }
    state.plies++;
    state.turn = 1 - a.side;
    if (ev.result === 'flag') state.over = { winner: a.side, reason: 'flag' };
    else if (!hasMoves(state, state.turn)) state.over = { winner: a.side, reason: 'stuck' };
    else if (state.quiet >= 120) state.over = { winner: -1, reason: 'draw' };
    return ev;
  }

  /* ---------- 電腦對手 ---------- */
  // 電腦只使用自己看得到的資訊:對方棋子的位置、有沒有動過、以及交手結果推得的大小範圍。

  function belief(board, pos) {
    var e = board[pos];
    if (e.revealed) return [[FLAG, 1]];
    if (e.known) return [[e.known, 1]];
    var w = [], sum = 0, t;
    for (t = 1; t <= 9; t++) if (t > e.lo && t < e.hi) { w.push([t, COUNT[t]]); sum += COUNT[t]; }
    if (!e.survived) { w.push([BOMB, 2]); sum += 2; }
    if (!e.moved && !e.notMine && homeRow(pos, e.side) <= 1) { w.push([MINE, 4.5]); sum += 4.5; }
    var pf = 0;
    if (!e.moved && !e.survived && hq[pos]) {
      var flagElsewhere = false, otherUnmoved = false;
      for (var p = 0; p < N; p++) {
        var q = board[p];
        if (!q || q.side !== e.side || p === pos) continue;
        if (q.revealed) flagElsewhere = true;
        if (hq[p] && !q.moved && !q.survived) otherUnmoved = true;
      }
      pf = flagElsewhere ? 0 : otherUnmoved ? 0.5 : 1;
    }
    if (!w.length) return pf ? [[FLAG, 1]] : [[5, 1]];
    var out = w.map(function (x) { return [x[0], x[1] / sum * (1 - pf)]; });
    if (pf) out.push([FLAG, pf]);
    return out;
  }

  function chooseMove(state, side, rng) {
    rng = rng || Math.random;
    var board = state.board, p, i;
    var beliefs = {}, reach = {};
    for (p = 0; p < N; p++) {
      var e = board[p];
      if (!e || e.side === side) continue;
      beliefs[p] = belief(board, p);
      // 不知道對方是什麼棋,就當成一般棋子來估它打得到哪裡
      var mobile = beliefs[p].some(function (x) { return x[0] <= BOMB; });
      reach[p] = mobile ? legalMoves(board, p, 5) : [];
    }
    function pBeats(hpos, type) {
      var b = beliefs[hpos], s = 0;
      for (var k = 0; k < b.length; k++) {
        if (b[k][0] > BOMB) continue;
        var r = battle(b[k][0], type);
        if (r === 'win' || r === 'flag') s += b[k][1];
        else if (r === 'tie') s += b[k][1] * 0.5;
      }
      return s;
    }
    function danger(pos, me) {
      if (camp[pos]) return 0;
      var worst = 0;
      for (var h in reach) {
        if (reach[h].indexOf(pos) < 0) continue;
        var risk = pBeats(+h, me.type) * VALUE[me.type] * (board[h].moved ? 0.7 : 0.3);
        if (risk > worst) worst = risk;
      }
      return worst;
    }
    function attackEV(me, pos) {
      var b = beliefs[pos], ev = 0;
      for (var k = 0; k < b.length; k++) {
        var r = battle(me.type, b[k][0]), v;
        if (r === 'flag') v = 10000;
        else if (r === 'win') v = VALUE[b[k][0]];
        else if (r === 'lose') v = -VALUE[me.type];
        else v = VALUE[b[k][0]] - VALUE[me.type];
        ev += b[k][1] * v;
      }
      return ev;
    }

    var best = null, bestScore = -Infinity;
    var last = state.lastMove[side];
    for (p = 0; p < N; p++) {
      var me = board[p];
      if (!me || me.side !== side) continue;
      var dests = legalMoves(board, p);
      if (!dests.length) continue;
      var here = danger(p, me);
      for (i = 0; i < dests.length; i++) {
        var to = dests[i], s;
        if (board[to]) {
          // 久沒交手就積極一點,避免僵局
          s = attackEV(me, to) + 0.5 + state.quiet / 15 + here * 0.5;
        } else {
          var fwd = (rowOf(to) - rowOf(p)) * (side === 1 ? 1 : -1);
          var w = me.type === 1 ? 0.15 : me.type === BOMB ? 0.1 : me.type >= 8 ? 0.25 : 0.5;
          s = fwd * w + (camp[to] ? 2 : 0) - danger(to, me) + here;
        }
        if (last && last.from === to && last.to === p) s -= 4;   // 不要來回踱步
        s += rng() * 1.2;
        if (s > bestScore) { bestScore = s; best = { from: p, to: to }; }
      }
    }
    return best;
  }

  var api = {
    ROWS: ROWS, COLS: COLS, NAMES: NAMES, COUNT: COUNT, BOMB: BOMB, MINE: MINE, FLAG: FLAG,
    isCamp: function (p) { return !!camp[p]; },
    isHQ: function (p) { return !!hq[p]; },
    isStation: function (p) { return !!station[p]; },
    roadAdj: roadAdj, railNext: railNext,
    canPlace: canPlace, randomLayout: randomLayout, validLayout: validLayout,
    newGame: newGame, legalMoves: legalMoves, battle: battle, move: move, chooseMove: chooseMove
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Junqi = api;
})(typeof self !== 'undefined' ? self : this);
