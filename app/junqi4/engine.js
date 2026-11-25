/*
 * 四人軍棋(四國軍棋,布陣暗棋,2 對 2)引擎:棋盤、走法、勝負判定、電腦對手。
 * 純 JS、無相依,瀏覽器與 Node 皆可載入。
 *
 * 棋盤是十字形,畫在 17×17 的格線上,共 129 個位置:
 *   四家各有 5 行 × 6 列 = 30 個位置,中間九宮有 9 個位置。
 *   玩家 0 在下、1 在右、2 在上、3 在左,照這個順序輪流(逆時針)。
 *   0 和 2 一隊,1 和 3 一隊。
 * 每個位置 cells[pos] = { R, C, owner, lr, lc }:
 *   R、C 是 17×17 格線上的列、行;owner 是這塊陣地的主人(九宮是 -1);
 *   lr、lc 是從主人自己的方向看的列(0 = 最前線,5 = 最後一列)和行(0 = 他的左手邊)。
 * 棋子種類 type:1~9 = 工兵…司令(數字越大越大),10 = 炸彈,11 = 地雷,12 = 軍旗
 */
(function (root) {
  'use strict';

  var G = 17;
  var BOMB = 10, MINE = 11, FLAG = 12;
  var NAMES = ['', '工兵', '排長', '連長', '營長', '團長', '旅長', '師長', '軍長', '司令', '炸彈', '地雷', '軍旗'];
  var COUNT = [0, 3, 3, 3, 2, 2, 2, 2, 1, 1, 2, 3, 1];
  var VALUE = [0, 13, 5, 8, 12, 18, 26, 36, 52, 75, 28, 14, 1000];

  var cells = [], at = new Int16Array(G * G).fill(-1);
  var camp = [], hq = [], station = [];
  var roadAdj = [], lines = [], onLines = [], railAdj = [];
  var N = 0;

  /** 玩家 k 的陣地裡,(lr, lc) 在格線上的位置 */
  function gridOf(k, lr, lc) {
    if (k === 0) return [11 + lr, 6 + lc];
    if (k === 2) return [5 - lr, 10 - lc];
    if (k === 1) return [10 - lc, 11 + lr];
    return [6 + lc, 5 - lr];
  }
  function P(k, lr, lc) { var g = gridOf(k, lr, lc); return at[g[0] * G + g[1]]; }

  (function build() {
    var k, lr, lc, r, c, p, g;
    function addCell(R, C, owner, a, b) {
      at[R * G + C] = cells.length;
      cells.push({ R: R, C: C, owner: owner, lr: a, lc: b });
    }
    for (k = 0; k < 4; k++) for (lr = 0; lr < 6; lr++) for (lc = 0; lc < 5; lc++) {
      g = gridOf(k, lr, lc);
      addCell(g[0], g[1], k, lr, lc);
    }
    for (r = 6; r <= 10; r += 2) for (c = 6; c <= 10; c += 2) addCell(r, c, -1, -1, -1);
    N = cells.length;
    for (p = 0; p < N; p++) { camp.push(0); hq.push(0); station.push(0); roadAdj.push([]); onLines.push([]); railAdj.push([]); }

    function link(a, b) {
      if (a < 0 || b < 0) return;
      if (roadAdj[a].indexOf(b) < 0) roadAdj[a].push(b);
      if (roadAdj[b].indexOf(a) < 0) roadAdj[b].push(a);
    }
    for (k = 0; k < 4; k++) {
      [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]].forEach(function (x) { camp[P(k, x[0], x[1])] = 1; });
      hq[P(k, 5, 1)] = 1; hq[P(k, 5, 3)] = 1;
      for (lr = 0; lr < 6; lr++) for (lc = 0; lc < 5; lc++) {
        if (lr < 5) link(P(k, lr, lc), P(k, lr + 1, lc));
        if (lc < 4) link(P(k, lr, lc), P(k, lr, lc + 1));
      }
      // 行營和斜角的四個位置相通
      [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]].forEach(function (x) {
        [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (d) { link(P(k, x[0], x[1]), P(k, x[0] + d[0], x[1] + d[1])); });
      });
    }
    // 九宮彼此相通;各家前線的第 0、2、4 行接到九宮
    for (r = 6; r <= 10; r += 2) for (c = 6; c <= 10; c += 2) {
      if (r < 10) link(at[r * G + c], at[(r + 2) * G + c]);
      if (c < 10) link(at[r * G + c], at[r * G + c + 2]);
    }
    for (c = 6; c <= 10; c += 2) {
      link(at[11 * G + c], at[10 * G + c]); link(at[5 * G + c], at[6 * G + c]);
      link(at[c * G + 11], at[c * G + 10]); link(at[c * G + 5], at[c * G + 6]);
    }

    // 鐵路:每一條「線」是一串位置,一般棋子只能沿著同一條線走(線可以包含彎道)
    function line(list) {
      var ids = list.map(function (x) { return at[x[0] * G + x[1]]; });
      var idx = lines.length;
      lines.push(ids);
      ids.forEach(function (id, i) {
        station[id] = 1;
        onLines[id].push([idx, i]);
        if (i > 0) {
          if (railAdj[id].indexOf(ids[i - 1]) < 0) railAdj[id].push(ids[i - 1]);
          if (railAdj[ids[i - 1]].indexOf(id) < 0) railAdj[ids[i - 1]].push(id);
        }
      });
    }
    function seq(fixed, from, to, vertical) {
      var out = [], s = from <= to ? 1 : -1;
      for (var v = from; v !== to + s; v += s) out.push(vertical ? [v, fixed] : [fixed, v]);
      return out;
    }
    for (k = 0; k < 4; k++) {
      line([0, 1, 2, 3, 4].map(function (x) { return gridOf(k, 0, x); }));    // 前線
      line([0, 1, 2, 3, 4].map(function (x) { return gridOf(k, 4, x); }));    // 後方那一條
    }
    var mid = [10, 8, 6];
    [6, 10].forEach(function (x) {
      line(seq(x, 15, 11, true).concat(mid.map(function (m) { return [m, x]; }), seq(x, 5, 1, true)));
      line(seq(x, 15, 11, false).concat(mid.map(function (m) { return [x, m]; }), seq(x, 5, 1, false)));
    });
    line([[11, 8], [10, 8], [8, 8], [6, 8], [5, 8]]);
    line([[8, 11], [8, 10], [8, 8], [8, 6], [8, 5]]);
    // 四個彎道:相鄰兩家的側邊鐵路接在一起
    line(seq(10, 15, 11, true).concat(seq(10, 11, 15, false)));   // 下 ↔ 右
    line(seq(6, 15, 11, true).concat(seq(10, 5, 1, false)));      // 下 ↔ 左
    line(seq(10, 1, 5, true).concat(seq(6, 11, 15, false)));      // 上 ↔ 右
    line(seq(6, 1, 5, true).concat(seq(6, 5, 1, false)));         // 上 ↔ 左
  })();

  function team(k) { return k % 2; }

  /** 布陣規則:這種棋能不能放在這個位置 */
  function canPlace(type, pos, side) {
    var cell = cells[pos];
    if (cell.owner !== side || camp[pos]) return false;
    if (type === FLAG) return !!hq[pos];
    if (type === MINE) return cell.lr >= 4;
    if (type === BOMB) return cell.lr !== 0;
    return true;
  }

  var nextId = 1;
  function piece(side, type) {
    return { id: nextId++, side: side, type: type, moved: false, lo: 0, hi: 10, survived: false, notMine: false, known: 0, revealed: false };
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
    var B = function (back, c) { return P(side, 5 - back, c); };    // back 0 = 最後一列
    var out = {}, pool = [], t, i;
    for (t = 1; t <= 9; t++) for (i = 0; i < COUNT[t]; i++) pool.push(t);
    var fc = rng() < 0.5 ? 1 : 3;
    out[B(0, fc)] = FLAG;
    var mineSpots = rng() < 0.7
      ? [B(1, fc), B(0, fc - 1), B(0, fc + 1)]
      : shuffle([B(1, 0), B(1, 1), B(1, 2), B(1, 3), B(1, 4), B(0, 0), B(0, 2), B(0, 4)], rng).slice(0, 3);
    mineSpots.forEach(function (p) { out[p] = MINE; });
    var free = [];
    for (var p = 0; p < N; p++) if (cells[p].owner === side && !camp[p] && out[p] === undefined) free.push(p);
    shuffle(free, rng);
    for (i = 0; i < 2; i++) {
      var k = free.findIndex(function (q) { return cells[q].lr !== 0 && !hq[q]; });
      out[free[k]] = BOMB; free.splice(k, 1);
    }
    // 另一個大本營放小棋(放進去就不能動了)
    var otherHQ = B(0, 4 - fc);
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

  /** layouts:四家的陣形 [{ pos: type }, …] */
  function newGame(layouts, first, personas) {
    var board = new Array(N).fill(null);
    layouts.forEach(function (layout, side) {
      for (var p in layout) board[+p] = piece(side, layout[p]);
    });
    return {
      board: board, turn: first || 0, plies: 0, quiet: 0, over: null,
      alive: [true, true, true, true], lastMove: [null, null, null, null],
      minesGone: [0, 0, 0, 0], personas: personas || null
    };
  }

  /** 位置 pos 上的棋可以走到哪些位置(不能吃隊友,不能打進行營) */
  function legalMoves(board, pos, asType) {
    var p = board[pos];
    if (!p) return [];
    var type = asType || p.type;
    if (type === MINE || type === FLAG || hq[pos]) return [];
    var seen = new Uint8Array(N), out = [], i, q, nx, mine = team(p.side);
    function add(x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }
    function enemy(x) { return team(x.side) !== mine; }
    var adj = roadAdj[pos];
    for (i = 0; i < adj.length; i++) {
      q = board[adj[i]];
      if (!q) add(adj[i]);
      else if (enemy(q) && !camp[adj[i]]) add(adj[i]);
    }
    if (station[pos]) {
      if (type === 1) {
        // 工兵在鐵路上可以任意轉彎
        var visited = new Uint8Array(N), queue = [pos];
        visited[pos] = 1;
        while (queue.length) {
          var cur = queue.pop();
          for (i = 0; i < railAdj[cur].length; i++) {
            nx = railAdj[cur][i];
            if (visited[nx]) continue;
            visited[nx] = 1;
            q = board[nx];
            if (!q) { add(nx); queue.push(nx); }
            else if (enemy(q)) add(nx);
          }
        }
      } else {
        // 其他棋只能沿著同一條線(含彎道)一直走,碰到棋就停
        onLines[pos].forEach(function (ref) {
          var ids = lines[ref[0]];
          [-1, 1].forEach(function (dir) {
            for (var j = ref[1] + dir; j >= 0 && j < ids.length; j += dir) {
              var x = board[ids[j]];
              if (!x) { add(ids[j]); continue; }
              if (enemy(x)) add(ids[j]);
              break;
            }
          });
        });
      }
    }
    return out;
  }

  /** 從 from 走到 to 實際經過的位置(含頭尾),給畫面做移動動畫用。要在棋還沒動之前呼叫。 */
  function path(board, from, to) {
    if (roadAdj[from].indexOf(to) >= 0) return [from, to];
    if (board[from].type !== 1) {
      // 一般棋:找出同時包含兩端、中間沒有棋的那條線(可能含彎道)
      for (var r = 0; r < onLines[from].length; r++) {
        var ids = lines[onLines[from][r][0]], a = onLines[from][r][1], b = ids.indexOf(to);
        if (b < 0) continue;
        var seg = a < b ? ids.slice(a, b + 1) : ids.slice(b, a + 1).reverse(), clear = true;
        for (var k = 1; k < seg.length - 1; k++) if (board[seg[k]]) clear = false;
        if (clear) return seg;
      }
    }
    // 沿著鐵路找最短的路(工兵會轉彎)
    var prev = {}, queue = [from], h, i, cur, nx;
    prev[from] = -1;
    for (h = 0; h < queue.length; h++) {
      cur = queue[h];
      var list = railAdj[cur];
      for (i = 0; i < list.length; i++) {
        nx = list[i];
        if (nx < 0 || prev[nx] !== undefined) continue;
        prev[nx] = cur;
        if (nx === to) {
          var out = [];
          for (; nx >= 0; nx = prev[nx]) out.unshift(nx);
          return out;
        }
        if (!board[nx]) queue.push(nx);
      }
    }
    return [from, to];
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

  /** 這一家出局:棋子全部拿掉 */
  function eliminate(state, side, ev) {
    if (!state.alive[side]) return;
    state.alive[side] = false;
    for (var p = 0; p < N; p++) if (state.board[p] && state.board[p].side === side) state.board[p] = null;
    ev.eliminated.push(side);
  }

  function teamDead(state, t) { return !state.alive[t] && !state.alive[t + 2]; }

  /** 執行一步棋(不檢查合法性,呼叫前先用 legalMoves 確認)。回傳事件。 */
  function move(state, from, to) {
    var board = state.board, a = board[from], d = board[to];
    var ev = { from: from, to: to, result: 'move', attacker: a, defender: d, commanderDied: [], eliminated: [], path: path(board, from, to) };
    a.moved = true;
    state.lastMove[a.side] = { from: from, to: to };
    if (!d) {
      board[to] = a; board[from] = null;
      state.quiet++;
    } else {
      ev.result = battle(a.type, d.type);
      state.quiet = 0;
      if (d.type === MINE && ev.result !== 'lose') state.minesGone[d.side]++;
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
      ev.commanderDied.forEach(function (s) { revealFlag(board, s); });   // 司令陣亡,軍旗要亮出來
      if (ev.result === 'flag') eliminate(state, d.side, ev);            // 軍旗被奪,這一家出局
    }
    state.plies++;

    // 換下一家;輪到的人沒有棋能動,也算出局
    var t = a.side;
    for (var guard = 0; guard < 8 && !state.over; guard++) {
      if (teamDead(state, 0)) { state.over = { winner: 1, reason: 'flag' }; break; }
      if (teamDead(state, 1)) { state.over = { winner: 0, reason: 'flag' }; break; }
      t = (t + 1) % 4;
      if (!state.alive[t]) continue;
      if (hasMoves(state, t)) { state.turn = t; break; }
      eliminate(state, t, ev);
    }
    if (!state.over && state.quiet >= 240) state.over = { winner: -1, reason: 'draw' };
    return ev;
  }

  /* ---------- 電腦對手 ---------- */
  // 電腦只使用自己看得到的資訊:別人棋子的位置、有沒有動過、以及交手結果推得的大小範圍。
  //
  // 性格:同一套判斷,換不同的設定。
  //   memory 記不記得交手的結果          count  會不會記牌(用排除法推算哪些是地雷)
  //   plan   工兵會不會主動去挖地雷      deep   會不會多想一步(吃完之後自己安不安全)
  //   bluff  會不會虛張聲勢、隱藏大棋
  //   aggr   攻擊性(越大越愛往前、越愛打)  fear  多怕危險   loss  多在乎自己的損失
  //   noise  走棋有多隨興                guard 多重視保護軍旗   home  多想待在家裡
  var PERSONAS = {
    kid:     { name: '小朋友', memory: false, count: false, plan: false, deep: false, bluff: false, aggr: 1.0, fear: 0.4, loss: 0.7, noise: 9,   guard: 0.004, home: 0 },
    warrior: { name: '戰士',   memory: true,  count: false, plan: false, deep: false, bluff: false, aggr: 2.5, fear: 0.3, loss: 0.5, noise: 1.2, guard: 1,     home: 0 },
    keeper:  { name: '守門員', memory: true,  count: true,  plan: false, deep: false, bluff: false, aggr: 0.4, fear: 1.5, loss: 1.2, noise: 1.0, guard: 1.5,   home: 0.25 },
    math:    { name: '數學家', memory: true,  count: true,  plan: true,  deep: false, bluff: false, aggr: 1.0, fear: 1.0, loss: 1.0, noise: 0.6, guard: 1,     home: 0 },
    fox:     { name: '老狐狸', memory: true,  count: true,  plan: true,  deep: false, bluff: true,  aggr: 1.1, fear: 0.9, loss: 1.0, noise: 0.8, guard: 1,     home: 0 },
    master:  { name: '大師',   memory: true,  count: true,  plan: true,  deep: true,  bluff: true,  aggr: 1.8, fear: 0.75, loss: 0.9, noise: 0.2, guard: 1.2,  home: 0 }
  };
  var PERSONA_IDS = ['kid', 'warrior', 'keeper', 'math', 'fox', 'master'];

  // 每個位置到各家大本營的距離(走路的步數),用來判斷「往敵人那邊前進」
  var hqDist = [];
  (function () {
    for (var k = 0; k < 4; k++) {
      var d = new Int16Array(N).fill(99), queue = [P(k, 5, 1), P(k, 5, 3)];
      d[queue[0]] = 0; d[queue[1]] = 0;
      for (var h = 0; h < queue.length; h++) {
        var cur = queue[h], adj = roadAdj[cur];
        for (var i = 0; i < adj.length; i++) if (d[adj[i]] > d[cur] + 1) { d[adj[i]] = d[cur] + 1; queue.push(adj[i]); }
      }
      hqDist.push(d);
    }
  })();

  /** 到一組目標位置的距離(公路、鐵路都算一步,不管中間有沒有棋) */
  function distanceTo(targets) {
    var d = new Int16Array(N).fill(99), queue = targets.slice(), h, i, cur, list;
    queue.forEach(function (t) { d[t] = 0; });
    for (h = 0; h < queue.length; h++) {
      cur = queue[h];
      list = roadAdj[cur].concat(railAdj[cur]);
      for (i = 0; i < list.length; i++) if (d[list[i]] > d[cur] + 1) { d[list[i]] = d[cur] + 1; queue.push(list[i]); }
    }
    return d;
  }

  /**
   * 記牌:每一家還有幾顆「可能是地雷」的棋(在自己後兩排、從沒動過、也沒被證明不是地雷)。
   * 其他棋都動過之後,剩下這幾顆幾乎一定就是地雷和軍旗。
   */
  function countCandidates(state, per) {
    var cand = [0, 0, 0, 0], flagShown = [false, false, false, false], p, e;
    for (p = 0; p < N; p++) {
      e = state.board[p];
      if (!e) continue;
      if (e.revealed) { flagShown[e.side] = true; continue; }
      if (cells[p].owner === e.side && cells[p].lr >= 4 && !e.moved && !(per.memory && (e.notMine || e.survived || e.known))) cand[e.side]++;
    }
    return { cand: cand, flagShown: flagShown };
  }

  function belief(state, pos, per, ctx) {
    var board = state.board, e = board[pos], cell = cells[pos], home = cell.owner === e.side;
    if (e.revealed) return [[FLAG, 1]];
    if (per.memory && e.known) return [[e.known, 1]];
    var lo = per.memory ? e.lo : 0, survived = per.memory && e.survived, notMine = per.memory && e.notMine;
    var w = [], sum = 0, t;
    for (t = 1; t <= 9; t++) if (t > lo && t < e.hi) { w.push([t, COUNT[t]]); sum += COUNT[t]; }
    if (!survived) { w.push([BOMB, 2]); sum += 2; }
    if (!e.moved && !notMine && home && cell.lr >= 4) {
      var mw = 4.5;
      if (per.count) {
        // 剩下的地雷數 ÷ 可能是地雷的棋數(其中一顆是軍旗)
        var n = ctx.cand[e.side] - (ctx.flagShown[e.side] ? 0 : 1);
        var pm = Math.min(0.95, (3 - state.minesGone[e.side]) / Math.max(1, n));
        mw = pm <= 0 ? 0 : pm / (1 - pm) * sum;
      }
      if (mw > 0) { w.push([MINE, mw]); sum += mw; }
    }
    var pf = 0;
    if (!e.moved && !survived && home && hq[pos]) {
      var flagElsewhere = false, otherUnmoved = false;
      for (var p = 0; p < N; p++) {
        var q = board[p];
        if (!q || q.side !== e.side || p === pos) continue;
        if (q.revealed) flagElsewhere = true;
        if (hq[p] && cells[p].owner === e.side && !q.moved && !(per.memory && q.survived)) otherUnmoved = true;
      }
      pf = flagElsewhere ? 0 : otherUnmoved ? 0.5 : 1;
    }
    if (!w.length) return pf ? [[FLAG, 1]] : [[5, 1]];
    var out = w.map(function (x) { return [x[0], x[1] / sum * (1 - pf)]; });
    if (pf) out.push([FLAG, pf]);
    return out;
  }

  function chooseMove(state, side, rng, persona) {
    rng = rng || Math.random;
    var per = PERSONAS[persona || (state.personas && state.personas[side]) || 'math'];
    var board = state.board, p, i, mine = team(side);
    var ctx = countCandidates(state, per);
    var beliefs = {}, reach = {}, mineSpots = [];
    function prob(pos, type) {
      var b = beliefs[pos];
      for (var k = 0; k < b.length; k++) if (b[k][0] === type) return b[k][1];
      return 0;
    }
    for (p = 0; p < N; p++) {
      var e = board[p];
      if (!e || team(e.side) === mine) continue;
      beliefs[p] = belief(state, p, per, ctx);
      // 不知道對方是什麼棋,就當成一般棋子來估它打得到哪裡
      var mobile = beliefs[p].some(function (x) { return x[0] <= BOMB; });
      reach[p] = mobile ? legalMoves(board, p, 5) : [];
      if (per.plan && prob(p, MINE) >= 0.5) mineSpots.push(p);
    }
    var mineDist = mineSpots.length ? distanceTo(mineSpots) : null;

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
    function danger(pos, me, skip) {
      if (camp[pos]) return 0;
      var worst = 0;
      for (var h in reach) {
        if (+h === skip || reach[h].indexOf(pos) < 0) continue;
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
        else if (r === 'lose') v = -VALUE[me.type] * per.loss;
        else v = VALUE[b[k][0]] - VALUE[me.type] * per.loss;
        ev += b[k][1] * v;
      }
      return ev;
    }
    function pWin(me, pos) {
      var b = beliefs[pos], sum = 0;
      for (var k = 0; k < b.length; k++) {
        var r = battle(me.type, b[k][0]);
        if (r === 'win' || r === 'flag') sum += b[k][1];
      }
      return sum;
    }
    // 離還活著的敵人大本營有多遠
    function far(pos) {
      var best = 99;
      for (var k = 0; k < 4; k++) if (state.alive[k] && team(k) !== mine && hqDist[k][pos] < best) best = hqDist[k][pos];
      return best;
    }

    // 保護軍旗:敵人貼到軍旗旁邊,或下一步就能貼上來,都要處理
    var flagPos = -1, near1 = {}, near2 = {}, gaps = {};
    for (p = 0; p < N; p++) if (board[p] && board[p].side === side && board[p].type === FLAG) flagPos = p;
    if (flagPos >= 0) roadAdj[flagPos].forEach(function (n) {
      var q = board[n];
      if (q && team(q.side) !== mine) near1[n] = 1;                       // 已經貼在軍旗旁邊
      else if (!q) {
        for (var h in reach) if (reach[h].indexOf(n) >= 0) { near2[h] = 1; gaps[n] = 1; }   // 下一步能貼上來
      }
    });
    function pRemove(me, pos) {
      var b = beliefs[pos], sum = 0;
      for (var k = 0; k < b.length; k++) {
        var r = battle(me.type, b[k][0]);
        if (r === 'win' || r === 'tie') sum += b[k][1];
      }
      return sum;
    }
    function guard(me, to) {
      if (near1[to]) return 3000 * pRemove(me, to);     // 吃掉貼著軍旗的棋,比什麼都重要
      if (near2[to]) return 60 * pRemove(me, to);       // 先解決快要貼上來的
      if (gaps[to]) return 40;                          // 或把軍旗旁邊的空位堵起來
      return 0;
    }

    var best = null, bestScore = -Infinity;
    var last = state.lastMove[side];
    // 太久沒交手:不再躲行營、少怕一點、多往前壓,免得大家互相繞圈
    var bold = Math.min(1, state.quiet / 80 * Math.max(0.5, per.aggr));
    for (p = 0; p < N; p++) {
      var me = board[p];
      if (!me || me.side !== side) continue;
      var dests = legalMoves(board, p);
      if (!dests.length) continue;
      var here = danger(p, me) * per.fear, farHere = far(p);
      var small = me.type === 2 || me.type === 3;
      for (i = 0; i < dests.length; i++) {
        var to = dests[i], s;
        if (board[to]) {
          var ev = attackEV(me, to);
          s = ev + (0.5 + state.quiet / 4) * per.aggr + here * 0.5;
          // 工兵:認定是地雷就去挖
          if (per.plan && me.type === 1) s += prob(to, MINE) * 120;
          // 多想一步:吃完站在那裡,會不會馬上被別的棋吃回去
          if (per.deep) s -= danger(to, me, to) * pWin(me, to) * 0.6;
          // 隱藏大棋:好處不大就不出手,免得被認出來
          if (per.bluff && me.type >= 8 && !me.survived && ev < 25) s -= 8;
        } else {
          var fwd = Math.max(-3, Math.min(3, farHere - far(to)));
          var w = me.type === 1 ? 0.15 : me.type === BOMB ? 0.1 : me.type >= 8 ? 0.25 : 0.5;
          var fear = per.fear * (per.bluff && small ? 0.4 : 1);
          s = fwd * w * per.aggr * (1 + bold * 6) + (camp[to] ? 2 * (1 - bold) : 0) - danger(to, me) * fear * (1 - bold * 0.8) + here * (1 - bold);
          // 守在家裡
          if (per.home) s -= per.home * (hqDist[side][to] - hqDist[side][p]) * (1 - bold);
          // 工兵有目標:往認定的地雷走
          if (mineDist && me.type === 1) s += Math.max(-4, Math.min(4, mineDist[p] - mineDist[to])) * 1.5;
          // 虛張聲勢:小棋大搖大擺貼到對方動過的棋旁邊,假裝自己很大
          if (per.bluff && small && !camp[to]) {
            var adj = roadAdj[to];
            for (var a = 0; a < adj.length; a++) {
              var x = board[adj[a]];
              if (x && team(x.side) !== mine && x.moved && !camp[adj[a]]) { s += 1.5; break; }
            }
          }
        }
        if (last && last.from === to && last.to === p) s -= 4;   // 不要來回踱步
        s += guard(me, to) * per.guard;
        s += rng() * per.noise;
        if (s > bestScore) { bestScore = s; best = { from: p, to: to }; }
      }
    }
    return best;
  }

  var api = {
    G: G, N: N, NAMES: NAMES, COUNT: COUNT, BOMB: BOMB, MINE: MINE, FLAG: FLAG,
    cells: cells, lines: lines, roadAdj: roadAdj, railAdj: railAdj,
    pos: P, team: team,
    isCamp: function (p) { return !!camp[p]; },
    isHQ: function (p) { return !!hq[p]; },
    isStation: function (p) { return !!station[p]; },
    PERSONAS: PERSONAS, PERSONA_IDS: PERSONA_IDS,
    canPlace: canPlace, randomLayout: randomLayout, validLayout: validLayout,
    newGame: newGame, legalMoves: legalMoves, battle: battle, move: move, chooseMove: chooseMove
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Junqi4 = api;
})(typeof self !== 'undefined' ? self : this);
