/*
 * 圍牆棋引擎:移動棋子、蓋牆圍地的多人棋。規則、勝負判定、電腦對手。
 * 純 JS、無相依,瀏覽器與 Node 皆可載入。
 *
 * 棋盤 n×n,格子編號 pos = r * n + c。
 * 牆在格子之間的邊上:
 *   hw[r * n + c]       = 第 r 列上緣的橫牆(r = 1..n-1 才是可蓋的,0 和 n 是棋盤外框)
 *   vw[r * (n+1) + c]   = 第 c 行左緣的直牆(c = 1..n-1 才是可蓋的)
 *   值:-1 = 沒有牆,0..3 = 蓋牆的玩家
 * 方向 dir:0 上、1 下、2 左、3 右
 *
 * 棋子有兩種(kind):
 *   0 = 方棋:直走 1 或 2 格,不能轉彎
 *   1 = 圓棋:走 1 格,之後可以向左或向右轉再走 1 格;不能直走 2 格
 * 每一手一定要移動,走完一定要在所在格的四邊蓋一道牆。
 * 破牆(可選,每人整局一次):移動時打掉擋在路上的一道牆,穿過去。
 *
 * 一個走法 move = { dest, brk },brk 是要打掉的牆 { pos, dir },不用破牆時是 null。
 */
(function (root) {
  'use strict';

  var DR = [-1, 1, 0, 0], DC = [0, 0, -1, 1];
  var SQUARE = 0, ROUND = 1;

  // 依人數決定每人的棋子。2 人局的圓棋開局就固定在斜對角的位置。
  var SETUPS = {
    2: { n: 7, square: 2, round: 2, fixed: [[8, 40], [12, 36]] },
    3: { n: 7, square: 1, round: 1 },
    4: { n: 7, square: 1, round: 1 }
  };

  function newGame(players, hammer) {
    var cfg = SETUPS[players], n = cfg.n, i, k;
    var s = {
      n: n, players: players, each: cfg.square + cfg.round,
      occ: new Int8Array(n * n).fill(-1),
      pieces: [],
      hw: new Int8Array((n + 1) * n).fill(-1),
      vw: new Int8Array(n * (n + 1)).fill(-1),
      phase: 'place', turn: 0, placeOrder: [], placeKind: [], placed: 0,
      hammers: [], over: null
    };
    for (i = 0; i < players; i++) s.hammers.push(hammer ? 1 : 0);

    var kinds = [];
    if (cfg.fixed) {
      for (i = 0; i < players; i++) for (k = 0; k < cfg.fixed[i].length; k++) {
        s.occ[cfg.fixed[i][k]] = i;
        s.pieces.push({ player: i, pos: cfg.fixed[i][k], kind: ROUND });
      }
    } else {
      for (k = 0; k < cfg.round; k++) kinds.push(ROUND);
    }
    for (k = 0; k < cfg.square; k++) kinds.unshift(SQUARE);     // 先擺方棋,再擺圓棋
    // 擺棋順序:蛇形(1 2 3 3 2 1 …),2 人就是 先 後 後 先
    for (var round = 0; round < kinds.length; round++) {
      for (i = 0; i < players; i++) {
        s.placeOrder.push(round % 2 === 0 ? i : players - 1 - i);
        s.placeKind.push(kinds[round]);
      }
    }
    s.turn = s.placeOrder[0];
    return s;
  }

  /** pos 往 dir 方向的那條邊:{ border, arr, idx } */
  function edge(s, pos, dir) {
    var n = s.n, r = Math.floor(pos / n), c = pos % n;
    if (dir === 0) return { border: r === 0, arr: s.hw, idx: r * n + c };
    if (dir === 1) return { border: r === n - 1, arr: s.hw, idx: (r + 1) * n + c };
    if (dir === 2) return { border: c === 0, arr: s.vw, idx: r * (n + 1) + c };
    return { border: c === n - 1, arr: s.vw, idx: r * (n + 1) + c + 1 };
  }
  function blocked(s, pos, dir) {
    var e = edge(s, pos, dir);
    return e.border || e.arr[e.idx] >= 0;
  }
  function step(s, pos, dir) { return pos + DR[dir] * s.n + DC[dir]; }

  /** 這一格可以蓋牆的方向 */
  function wallOptions(s, pos) {
    var out = [];
    for (var d = 0; d < 4; d++) {
      var e = edge(s, pos, d);
      if (!e.border && e.arr[e.idx] < 0) out.push(d);
    }
    return out;
  }

  /** 暫時把 brk 那道牆拿掉,執行 fn,再放回去 */
  function withBreak(s, brk, fn) {
    if (!brk) return fn();
    var e = edge(s, brk.pos, brk.dir), old = e.arr[e.idx];
    e.arr[e.idx] = -1;
    var result = fn();
    e.arr[e.idx] = old;
    return result;
  }

  /** 照這個走法走過去之後,可以蓋牆的方向 */
  function wallChoices(s, move) {
    return withBreak(s, move.brk, function () { return wallOptions(s, move.dest); });
  }

  /** 把棋盤分成被牆隔開的區域。回傳 { id: 每格的區域編號, list: [{ size, owners, owner, contested }] } */
  function regions(s) {
    var n = s.n, N = n * n, id = new Int16Array(N).fill(-1), list = [];
    for (var start = 0; start < N; start++) {
      if (id[start] >= 0) continue;
      var k = list.length, reg = { size: 0, owners: [] }, stack = [start], p;
      for (p = 0; p < s.players; p++) reg.owners.push(0);
      id[start] = k;
      while (stack.length) {
        var cur = stack.pop();
        reg.size++;
        if (s.occ[cur] >= 0) reg.owners[s.occ[cur]]++;
        for (var d = 0; d < 4; d++) {
          if (blocked(s, cur, d)) continue;
          var nx = step(s, cur, d);
          if (id[nx] < 0) { id[nx] = k; stack.push(nx); }
        }
      }
      list.push(reg);
    }
    list.forEach(function (reg) {
      var who = -1, count = 0;
      for (var q = 0; q < reg.owners.length; q++) if (reg.owners[q] > 0) { who = q; count++; }
      reg.owner = count === 1 ? who : -1;       // 只有一位玩家的棋 → 是他的領地
      reg.contested = count > 1;                // 還有兩位以上 → 還沒分出來
    });
    return { id: id, list: list };
  }

  /**
   * 第 idx 顆棋所有合法的走法:[{ dest, brk }]。
   * 不能穿過別的棋、不能留在原地,到了之後要有地方蓋牆。
   * 還有破牆可用時,路上可以打掉一道牆(brk);同一格有不用破牆的走法就優先用那個。
   */
  function moves(s, idx) {
    var pc = s.pieces[idx], canBreak = s.hammers[pc.player] > 0, found = {}, out = [];
    function add(dest, brk) {
      if (brk && !canBreak) return;
      var cur = found[dest];
      if (cur && (!cur.brk || brk)) return;
      var m = { dest: dest, brk: brk };
      if (!wallChoices(s, m).length) return;
      if (cur) out[out.indexOf(cur)] = m; else out.push(m);
      found[dest] = m;
    }
    function hop(pos, dir) {
      var e = edge(s, pos, dir);
      if (e.border) return null;
      var to = step(s, pos, dir);
      if (s.occ[to] >= 0) return null;
      return { to: to, brk: e.arr[e.idx] >= 0 ? { pos: pos, dir: dir } : null };
    }
    for (var d1 = 0; d1 < 4; d1++) {
      var a = hop(pc.pos, d1);
      if (!a) continue;
      add(a.to, a.brk);
      var seconds = pc.kind === SQUARE ? [d1] : (d1 < 2 ? [2, 3] : [0, 1]);
      for (var k = 0; k < seconds.length; k++) {
        var b = hop(a.to, seconds[k]);
        if (!b || (a.brk && b.brk)) continue;       // 只能打掉一道牆
        add(b.to, a.brk || b.brk);
      }
    }
    return out;
  }

  /** 這位玩家現在可以動的棋 */
  function movablePieces(s, player) {
    var out = [];
    for (var i = 0; i < s.pieces.length; i++) {
      if (s.pieces[i].player === player && moves(s, i).length) out.push(i);
    }
    return out;
  }

  function scores(s, reg) {
    reg = reg || regions(s);
    var total = [], best = [], p;
    for (p = 0; p < s.players; p++) { total.push(0); best.push(0); }
    reg.list.forEach(function (r) {
      if (r.owner < 0) return;
      total[r.owner] += r.size;
      if (r.size > best[r.owner]) best[r.owner] = r.size;
    });
    return { total: total, best: best };
  }

  function finish(s, reg) {
    var sc = scores(s, reg), winners = [], top = -1, p;
    // 比總格數;一樣多就比最大的一塊
    for (p = 0; p < s.players; p++) {
      var key = sc.total[p] * 1000 + sc.best[p];
      if (key > top) { top = key; winners = [p]; }
      else if (key === top) winners.push(p);
    }
    s.phase = 'over';
    s.over = { scores: sc.total, winners: winners };
  }

  /** 換下一位能動的玩家(沒有棋能動的人跳過);所有棋都被隔開,或沒有人能動,就結束 */
  function advance(s) {
    var reg = regions(s);
    var anyContested = reg.list.some(function (r) { return r.contested; });
    if (anyContested) {
      for (var k = 1; k <= s.players; k++) {
        var p = (s.turn + k) % s.players;
        if (movablePieces(s, p).length) { s.turn = p; return; }
      }
    }
    finish(s, reg);
  }

  /** 擺棋階段:把棋放在空格上 */
  function place(s, pos) {
    if (s.phase !== 'place' || s.occ[pos] >= 0) return false;
    s.occ[pos] = s.turn;
    s.pieces.push({ player: s.turn, pos: pos, kind: s.placeKind[s.placed] });
    s.placed++;
    if (s.placed < s.placeOrder.length) { s.turn = s.placeOrder[s.placed]; return true; }
    s.phase = 'play';
    s.turn = s.players - 1;     // advance 會從下一位(第一位玩家)開始找
    advance(s);
    return true;
  }

  /**
   * 對戰階段的一手:第 pieceIdx 顆棋照 move 走(必要時打掉一道牆),然後在 dir 方向蓋牆。
   * 不檢查是否合法,呼叫前先用 moves / wallChoices 確認。
   */
  function act(s, pieceIdx, move, dir) {
    var pc = s.pieces[pieceIdx], e;
    if (move.brk) {
      e = edge(s, move.brk.pos, move.brk.dir);
      e.arr[e.idx] = -1;
      s.hammers[pc.player]--;
    }
    s.occ[pc.pos] = -1;
    pc.pos = move.dest;
    s.occ[move.dest] = pc.player;
    e = edge(s, move.dest, dir);
    e.arr[e.idx] = pc.player;
    advance(s);
  }

  /* ---------- 電腦對手 ---------- */

  // 估計勢力範圍:每一格算給「最快走得到」的玩家(只看牆,不看棋子擋路)
  function influence(s) {
    var n = s.n, N = n * n, dist = [], p, i;
    for (p = 0; p < s.players; p++) {
      var d = new Int16Array(N).fill(999), queue = [];
      for (i = 0; i < s.pieces.length; i++) if (s.pieces[i].player === p) { d[s.pieces[i].pos] = 0; queue.push(s.pieces[i].pos); }
      for (var h = 0; h < queue.length; h++) {
        var cur = queue[h];
        for (var dir = 0; dir < 4; dir++) {
          if (blocked(s, cur, dir)) continue;
          var nx = step(s, cur, dir);
          if (d[nx] > d[cur] + 1) { d[nx] = d[cur] + 1; queue.push(nx); }
        }
      }
      dist.push(d);
    }
    var score = [];
    for (p = 0; p < s.players; p++) score.push(0);
    for (i = 0; i < N; i++) {
      var best = 999, who = -1;
      for (p = 0; p < s.players; p++) {
        if (dist[p][i] < best) { best = dist[p][i]; who = p; }
        else if (dist[p][i] === best) who = -1;
      }
      if (who >= 0) score[who]++;
    }
    return score;
  }
  function evaluate(s, player) {
    var sc = influence(s), rival = 0;
    for (var p = 0; p < s.players; p++) if (p !== player && sc[p] > rival) rival = sc[p];
    return sc[player] - rival;
  }

  /** 擺棋階段電腦選哪一格 */
  function choosePlacement(s, rng) {
    rng = rng || Math.random;
    var best = -1, bestScore = -Infinity, me = s.turn;
    for (var pos = 0; pos < s.n * s.n; pos++) {
      if (s.occ[pos] >= 0) continue;
      s.occ[pos] = me; s.pieces.push({ player: me, pos: pos, kind: SQUARE });
      var v = evaluate(s, me) + rng() * 2.5;
      s.pieces.pop(); s.occ[pos] = -1;
      if (v > bestScore) { bestScore = v; best = pos; }
    }
    return best;
  }

  /** 對戰階段電腦選哪一手:{ piece, move, dir } */
  function chooseAction(s, rng) {
    rng = rng || Math.random;
    var me = s.turn, best = null, bestScore = -Infinity;
    movablePieces(s, me).forEach(function (idx) {
      var pc = s.pieces[idx], from = pc.pos;
      moves(s, idx).forEach(function (m) {
        withBreak(s, m.brk, function () {
          s.occ[from] = -1; pc.pos = m.dest; s.occ[m.dest] = me;
          wallOptions(s, m.dest).forEach(function (dir) {
            var e = edge(s, m.dest, dir);
            e.arr[e.idx] = me;
            // 破牆只有一次,沒有明顯好處就留著
            var v = evaluate(s, me) - (m.brk ? 2.5 : 0) + rng() * 0.6;
            e.arr[e.idx] = -1;
            if (v > bestScore) { bestScore = v; best = { piece: idx, move: m, dir: dir }; }
          });
          s.occ[m.dest] = -1; pc.pos = from; s.occ[from] = me;
        });
      });
    });
    return best;
  }

  var api = {
    SETUPS: SETUPS, SQUARE: SQUARE, ROUND: ROUND,
    newGame: newGame, edge: edge, blocked: blocked,
    wallOptions: wallOptions, wallChoices: wallChoices, regions: regions,
    moves: moves, movablePieces: movablePieces, scores: scores,
    place: place, act: act, choosePlacement: choosePlacement, chooseAction: chooseAction
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Walls = api;
})(typeof self !== 'undefined' ? self : this);
