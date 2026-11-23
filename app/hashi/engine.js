/*
 * 造橋 (Hashiwokakero) 引擎:出題、解題、對答案。
 * 純 JS、無相依,瀏覽器與 Node 皆可載入。
 *
 * 題目:{ n, islands: [{r, c, need}], edges: [{a, b, h, cells, cross}], solution: Uint8Array }
 *   edges 是「相鄰可連」的島嶼配對;每條邊的值是橋數 0..2
 */
(function (root) {
  'use strict';

  /** 由島嶼位置算出所有可能的橋(相鄰配對)與交叉關係 */
  function buildEdges(n, islands) {
    var at = new Int16Array(n * n).fill(-1), i, e;
    for (i = 0; i < islands.length; i++) at[islands[i].r * n + islands[i].c] = i;
    var edges = [];
    var owner = new Int16Array(n * n).fill(-1); // 水平橋經過的格子
    for (i = 0; i < islands.length; i++) {
      var r = islands[i].r, c = islands[i].c, k, cells;
      for (k = c + 1, cells = []; k < n; k++) {
        if (at[r * n + k] >= 0) { edges.push({ a: i, b: at[r * n + k], h: true, cells: cells, cross: [] }); break; }
        cells.push(r * n + k);
      }
      for (k = r + 1, cells = []; k < n; k++) {
        if (at[k * n + c] >= 0) { edges.push({ a: i, b: at[k * n + c], h: false, cells: cells, cross: [] }); break; }
        cells.push(k * n + c);
      }
    }
    for (e = 0; e < edges.length; e++) {
      if (!edges[e].h) continue;
      for (i = 0; i < edges[e].cells.length; i++) owner[edges[e].cells[i]] = e;
    }
    for (e = 0; e < edges.length; e++) {
      if (edges[e].h) continue;
      for (i = 0; i < edges[e].cells.length; i++) {
        var o = owner[edges[e].cells[i]];
        if (o >= 0) { edges[e].cross.push(o); edges[o].cross.push(e); }
      }
    }
    var inc = islands.map(function () { return []; });
    for (e = 0; e < edges.length; e++) { inc[edges[e].a].push(e); inc[edges[e].b].push(e); }
    return { edges: edges, inc: inc };
  }

  function connected(p, usable) {
    var m = p.islands.length, seen = new Uint8Array(m), stack = [0], cnt = 1;
    seen[0] = 1;
    while (stack.length) {
      var v = stack.pop(), list = p.inc[v];
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!usable[e]) continue;
        var w = p.edges[e].a === v ? p.edges[e].b : p.edges[e].a;
        if (!seen[w]) { seen[w] = 1; cnt++; stack.push(w); }
      }
    }
    return cnt === m;
  }

  /** 對答案:每座島的橋數正確、橋不交叉、全部連通 */
  function checkAnswer(p, val) {
    var i, e;
    for (i = 0; i < p.islands.length; i++) {
      var s = 0;
      for (e = 0; e < p.inc[i].length; e++) s += val[p.inc[i][e]];
      if (s !== p.islands[i].need) return false;
    }
    for (e = 0; e < p.edges.length; e++) {
      if (!val[e]) continue;
      for (i = 0; i < p.edges[e].cross.length; i++) if (val[p.edges[e].cross[i]]) return false;
    }
    return connected(p, val);
  }

  /* ---------- 邏輯推理:每條邊維護 [lo, hi] ---------- */

  function propagate(p, lo, hi) {
    var changed = true, i, j, e;
    while (changed) {
      changed = false;
      for (i = 0; i < p.islands.length; i++) {
        var need = p.islands[i].need, list = p.inc[i], sLo = 0, sHi = 0;
        for (j = 0; j < list.length; j++) { sLo += lo[list[j]]; sHi += hi[list[j]]; }
        if (sLo > need || sHi < need) return false;
        for (j = 0; j < list.length; j++) {
          e = list[j];
          var nl = need - (sHi - hi[e]), nh = need - (sLo - lo[e]);
          if (nl > lo[e]) { sLo += nl - lo[e]; lo[e] = nl; changed = true; }
          if (nh < hi[e]) { sHi -= hi[e] - nh; hi[e] = nh; changed = true; }
          if (lo[e] > hi[e]) return false;
        }
      }
      for (e = 0; e < p.edges.length; e++) {
        if (!lo[e]) continue;
        var cr = p.edges[e].cross;
        for (j = 0; j < cr.length; j++) {
          if (lo[cr[j]]) return false;
          if (hi[cr[j]]) { hi[cr[j]] = 0; changed = true; }
        }
      }
    }
    return connected(p, hi);
  }

  function decided(lo, hi) {
    for (var e = 0; e < lo.length; e++) if (lo[e] !== hi[e]) return false;
    return true;
  }

  function fresh(p) {
    var m = p.edges.length;
    return { lo: new Uint8Array(m), hi: new Uint8Array(m).fill(2) };
  }

  /** 等級 1:只靠「數字夠不夠」與「不能交叉」能否解開 */
  function solvesByLogic(p) {
    var s = fresh(p);
    return propagate(p, s.lo, s.hi) && decided(s.lo, s.hi);
  }

  /**
   * 等級 2:再加上「假設某條橋的數量,若矛盾(例如孤立成一小群)則排除」。
   * 回傳需要用到幾次這種假設(越多越難);解不開回傳 -1。
   */
  function probeScore(p) {
    var s = fresh(p), lo = s.lo, hi = s.hi, score = 0;
    if (!propagate(p, lo, hi)) return -1;
    var progress = true;
    while (progress) {
      progress = false;
      for (var e = 0; e < lo.length; e++) {
        if (lo[e] === hi[e]) continue;
        var a = lo.slice(), b = hi.slice();
        b[e] = a[e];
        if (!propagate(p, a, b)) { lo[e]++; score++; if (!propagate(p, lo, hi)) return -1; progress = true; continue; }
        a = lo.slice(); b = hi.slice();
        a[e] = b[e];
        if (!propagate(p, a, b)) { hi[e]--; score++; if (!propagate(p, lo, hi)) return -1; progress = true; }
      }
    }
    return decided(lo, hi) ? score : -1;
  }

  /** 等級 3:完整搜尋,數解的個數(最多 limit) */
  function countSolutions(p, limit, budget) {
    var res = { count: 0, solution: null, aborted: false }, nodes = budget;
    function rec(lo, hi) {
      if (--nodes < 0) { res.aborted = true; return; }
      if (!propagate(p, lo, hi)) return;
      var e = -1;
      for (var i = 0; i < lo.length; i++) if (lo[i] !== hi[i]) { e = i; break; }
      if (e < 0) { res.count++; res.solution = lo; return; }
      for (var v = lo[e]; v <= hi[e]; v++) {
        var a = lo.slice(), b = hi.slice();
        a[e] = v; b[e] = v;
        rec(a, b);
        if (res.aborted || res.count >= limit) return;
      }
    }
    var s = fresh(p);
    rec(s.lo, s.hi);
    return res;
  }

  /* ---------- 出題 ---------- */

  function randomLayout(n, target, rng) {
    var N = n * n;
    var used = new Uint8Array(N);   // 1 = 島, 2 = 橋經過
    var islands = [], bridges = [];
    var DR = [0, 0, 1, -1], DC = [1, -1, 0, 0];
    function free(r, c) { return r >= 0 && c >= 0 && r < n && c < n && used[r * n + c] === 0; }
    function lonely(r, c) {
      for (var d = 0; d < 4; d++) {
        var rr = r + DR[d], cc = c + DC[d];
        if (rr >= 0 && cc >= 0 && rr < n && cc < n && used[rr * n + cc] === 1) return false;
      }
      return true;
    }
    var r0 = Math.floor(rng() * n), c0 = Math.floor(rng() * n);
    islands.push({ r: r0, c: c0 }); used[r0 * n + c0] = 1;
    var fails = 0;
    while (islands.length < target && fails < 80) {
      var src = Math.floor(rng() * islands.length), d = Math.floor(rng() * 4);
      var r = islands[src].r, c = islands[src].c;
      var maxLen = 0;
      while (free(r + DR[d] * (maxLen + 1), c + DC[d] * (maxLen + 1))) maxLen++;
      if (maxLen < 2) { fails++; continue; }
      // 偏好短一點的橋,盤面比較緊湊
      var len = 2 + Math.floor(Math.pow(rng(), 1.6) * (maxLen - 1));
      var tr = r + DR[d] * len, tc = c + DC[d] * len;
      // 新島不能緊貼著其他島(來源島本身距離 >= 2,不會被算到)
      if (!lonely(tr, tc)) { fails++; continue; }
      for (var k = 1; k < len; k++) used[(r + DR[d] * k) * n + (c + DC[d] * k)] = 2;
      used[tr * n + tc] = 1;
      islands.push({ r: tr, c: tc });
      bridges.push({ a: src, b: islands.length - 1, v: rng() < 0.4 ? 2 : 1 });
      fails = 0;
    }
    return { islands: islands, bridges: bridges };
  }

  var LEVELS = { easy: 1, medium: 2, hard: 3 };
  var DENSITY = { 1: 0.22, 2: 0.27, 3: 0.31 };

  /**
   * 產生一題。level: 'easy' | 'medium' | 'hard'。每一題都保證只有唯一解。
   */
  function generate(n, level, rng) {
    rng = rng || Math.random;
    var lv = LEVELS[level] || 1;
    var target = Math.max(4, Math.round(n * n * DENSITY[lv]));
    var hardGoal = n <= 5 ? 2 : 3;
    var want = lv === 1 ? 0 : lv === 2 ? 1 : hardGoal;
    var fallback = null, fallbackDist = Infinity;
    for (var attempt = 0; attempt < 1500; attempt++) {
      var lay = randomLayout(n, target, rng);
      if (lay.islands.length < Math.max(4, target * 0.7)) continue;
      // 依列、行排序,畫面與編號較穩定
      var order = lay.islands.map(function (_, i) { return i; });
      order.sort(function (x, y) {
        return lay.islands[x].r - lay.islands[y].r || lay.islands[x].c - lay.islands[y].c;
      });
      var pos = []; order.forEach(function (o, i) { pos[o] = i; });
      var islands = order.map(function (o) { return { r: lay.islands[o].r, c: lay.islands[o].c, need: 0 }; });
      var be = buildEdges(n, islands);
      var p = { n: n, islands: islands, edges: be.edges, inc: be.inc };
      var sol = new Uint8Array(p.edges.length), e, i;
      var key = {};
      for (e = 0; e < p.edges.length; e++) key[p.edges[e].a + ',' + p.edges[e].b] = e;
      for (i = 0; i < lay.bridges.length; i++) {
        var a = pos[lay.bridges[i].a], b = pos[lay.bridges[i].b];
        sol[key[Math.min(a, b) + ',' + Math.max(a, b)]] = lay.bridges[i].v;
      }
      // 額外加幾座橋形成環,不然每題都是樹狀
      for (e = 0; e < p.edges.length; e++) {
        if (sol[e] || rng() > 0.3) continue;
        var blocked = false;
        for (i = 0; i < p.edges[e].cross.length; i++) if (sol[p.edges[e].cross[i]]) { blocked = true; break; }
        if (!blocked) sol[e] = rng() < 0.3 ? 2 : 1;
      }
      for (e = 0; e < p.edges.length; e++) { islands[p.edges[e].a].need += sol[e]; islands[p.edges[e].b].need += sol[e]; }
      p.solution = sol;
      p.level = level;

      // 難度分數:0 = 只靠基本規則;k = 需要 k 次「假設後發現矛盾」的推理
      var score = solvesByLogic(p) ? 0 : probeScore(p);
      if (score < 0) {
        var res = countSolutions(p, 2, 3000);
        if (res.aborted || res.count !== 1) continue;
        score = 99;
      }
      if (lv === 1 && score === 0) return p;
      if (lv === 2 && score === 1) return p;
      if (lv === 3 && score >= hardGoal) return p;
      // 找不到剛好的難度時,取最接近的
      var dist = Math.abs(score - want);
      if (dist < fallbackDist) { fallback = p; fallbackDist = dist; }
    }
    return fallback;
  }

  var api = {
    generate: generate,
    checkAnswer: checkAnswer,
    solvesByLogic: solvesByLogic,
    probeScore: probeScore,
    countSolutions: countSolutions
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Hashi = api;
})(typeof self !== 'undefined' ? self : this);
