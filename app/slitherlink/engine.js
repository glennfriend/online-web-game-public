/*
 * 數迴 (Slitherlink) 引擎:出題、解題、對答案。
 * 純 JS、無相依,瀏覽器與 Node 皆可載入。
 *
 * 邊的狀態:0 = 未定, 1 = 有線, 2 = 沒有線
 * 提示數字:-1 = 空格, 0..3 = 該格周圍的線數
 */
(function (root) {
  'use strict';

  var topoCache = {};

  /** 建立 n×n 盤面的格、點、邊對應表 */
  function topo(n) {
    if (topoCache[n]) return topoCache[n];
    var HN = (n + 1) * n;
    var E = 2 * HN;
    var W = n + 1;
    var H = function (r, c) { return r * n + c; };
    var V = function (r, c) { return HN + r * W + c; };
    var cellEdges = [], vertEdges = [], edgeVerts = new Array(E), edgeInfo = new Array(E);
    var edgeCells = new Array(E);
    var r, c, e;
    for (e = 0; e < E; e++) edgeCells[e] = [];
    for (r = 0; r < n; r++) {
      for (c = 0; c < n; c++) {
        var ce = [H(r, c), H(r + 1, c), V(r, c), V(r, c + 1)];
        cellEdges.push(ce);
        for (var k = 0; k < 4; k++) edgeCells[ce[k]].push(r * n + c);
      }
    }
    for (r = 0; r <= n; r++) {
      for (c = 0; c <= n; c++) {
        var list = [];
        if (c > 0) list.push(H(r, c - 1));
        if (c < n) list.push(H(r, c));
        if (r > 0) list.push(V(r - 1, c));
        if (r < n) list.push(V(r, c));
        vertEdges.push(list);
      }
    }
    for (r = 0; r <= n; r++) {
      for (c = 0; c < n; c++) {
        edgeVerts[H(r, c)] = [r * W + c, r * W + c + 1];
        edgeInfo[H(r, c)] = { h: true, r: r, c: c };
      }
    }
    for (r = 0; r < n; r++) {
      for (c = 0; c <= n; c++) {
        edgeVerts[V(r, c)] = [r * W + c, (r + 1) * W + c];
        edgeInfo[V(r, c)] = { h: false, r: r, c: c };
      }
    }
    var t = {
      n: n, E: E, HN: HN, VN: W * W, H: H, V: V,
      cellEdges: cellEdges, vertEdges: vertEdges, edgeVerts: edgeVerts,
      edgeCells: edgeCells, edgeInfo: edgeInfo
    };
    topoCache[n] = t;
    return t;
  }

  /** 所有的線是否剛好構成一個封閉迴圈 */
  function isSingleLoop(t, s) {
    var total = 0, start = -1, e, v;
    for (e = 0; e < t.E; e++) if (s[e] === 1) { total++; if (start < 0) start = e; }
    if (total === 0) return false;
    for (v = 0; v < t.VN; v++) {
      var d = 0, ve = t.vertEdges[v];
      for (var i = 0; i < ve.length; i++) if (s[ve[i]] === 1) d++;
      if (d !== 0 && d !== 2) return false;
    }
    return cycleLength(t, s, start) === total;
  }

  /** 從某條線出發繞一圈的長度(前提:每個點的度數皆為 0 或 2) */
  function cycleLength(t, s, start) {
    var cur = t.edgeVerts[start][1], prev = start, len = 1;
    var origin = t.edgeVerts[start][0];
    while (cur !== origin) {
      var ve = t.vertEdges[cur], next = -1;
      for (var i = 0; i < ve.length; i++) {
        if (ve[i] !== prev && s[ve[i]] === 1) { next = ve[i]; break; }
      }
      if (next < 0) return -1;
      var ev = t.edgeVerts[next];
      cur = ev[0] === cur ? ev[1] : ev[0];
      prev = next;
      len++;
      if (len > t.E) return -1;
    }
    return len;
  }

  function cellCount(t, s, cell) {
    var ce = t.cellEdges[cell];
    return (s[ce[0]] === 1) + (s[ce[1]] === 1) + (s[ce[2]] === 1) + (s[ce[3]] === 1);
  }

  /** 對答案:所有數字都符合,且線構成單一迴圈 */
  function checkAnswer(n, clues, s) {
    var t = topo(n);
    for (var i = 0; i < clues.length; i++) {
      if (clues[i] >= 0 && cellCount(t, s, i) !== clues[i]) return false;
    }
    return isSingleLoop(t, s);
  }

  /* ---------- 邏輯推理 ---------- */

  // 迴圈規則。回傳 -1 = 矛盾, 0 = 無變化, 1 = 有變化
  function loopRule(t, clues, s) {
    var VN = t.VN, E = t.E;
    var deg = new Uint8Array(VN);
    var total = 0, unknown = 0, e, v, i;
    for (e = 0; e < E; e++) {
      if (s[e] === 1) { total++; deg[t.edgeVerts[e][0]]++; deg[t.edgeVerts[e][1]]++; }
      else if (s[e] === 0) unknown++;
    }
    if (total === 0) return unknown === 0 ? -1 : 0;

    var changed = 0, pathSum = 0;
    var done = new Uint8Array(VN);
    for (v = 0; v < VN; v++) {
      if (deg[v] !== 1 || done[v]) continue;
      // 沿著線走到這段路徑的另一端
      var cur = v, prev = -1, len = 0;
      for (;;) {
        var ve = t.vertEdges[cur], next = -1;
        for (i = 0; i < ve.length; i++) {
          if (ve[i] !== prev && s[ve[i]] === 1) { next = ve[i]; break; }
        }
        if (next < 0) break;
        var ev = t.edgeVerts[next];
        cur = ev[0] === cur ? ev[1] : ev[0];
        prev = next;
        len++;
      }
      done[v] = 1; done[cur] = 1;
      pathSum += len;
      // 若兩端相鄰,接起來會形成迴圈;除非那就是完整答案,否則不能接
      var vv = t.vertEdges[v];
      for (i = 0; i < vv.length; i++) {
        e = vv[i];
        if (s[e] !== 0) continue;
        var o = t.edgeVerts[e];
        if ((o[0] === v ? o[1] : o[0]) !== cur) continue;
        var valid = len === total;
        if (valid) {
          for (var cell = 0; cell < clues.length; cell++) {
            if (clues[cell] < 0) continue;
            var cnt = cellCount(t, s, cell);
            var ec = t.edgeCells[e];
            if (ec[0] === cell || ec[1] === cell) cnt++;
            if (cnt !== clues[cell]) { valid = false; break; }
          }
        }
        if (!valid) { s[e] = 2; changed = 1; }
      }
    }

    if (pathSum < total) {
      // 已經存在封閉迴圈:它必須就是完整答案
      if (pathSum > 0) return -1;
      var start = 0;
      while (s[start] !== 1) start++;
      if (cycleLength(t, s, start) !== total) return -1;
      for (var c2 = 0; c2 < clues.length; c2++) {
        if (clues[c2] >= 0 && cellCount(t, s, c2) !== clues[c2]) return -1;
      }
      for (e = 0; e < E; e++) if (s[e] === 0) { s[e] = 2; changed = 1; }
    }
    return changed;
  }

  /** 反覆套用基本規則直到沒有新進展。回傳 false 表示矛盾。 */
  function propagate(t, clues, s) {
    var cellEdges = t.cellEdges, vertEdges = t.vertEdges, VN = t.VN;
    var changed = true, i, j, l, u, x;
    while (changed) {
      changed = false;
      for (i = 0; i < clues.length; i++) {
        var k = clues[i];
        if (k < 0) continue;
        var ce = cellEdges[i];
        l = 0; u = 0;
        for (j = 0; j < 4; j++) { x = s[ce[j]]; if (x === 1) l++; else if (x === 0) u++; }
        if (l > k || l + u < k) return false;
        if (u > 0) {
          if (l === k) { for (j = 0; j < 4; j++) if (s[ce[j]] === 0) s[ce[j]] = 2; changed = true; }
          else if (l + u === k) { for (j = 0; j < 4; j++) if (s[ce[j]] === 0) s[ce[j]] = 1; changed = true; }
        }
      }
      for (i = 0; i < VN; i++) {
        var ve = vertEdges[i], m = ve.length;
        l = 0; u = 0;
        for (j = 0; j < m; j++) { x = s[ve[j]]; if (x === 1) l++; else if (x === 0) u++; }
        if (l > 2) return false;
        if (l === 1 && u === 0) return false;
        if (u > 0) {
          if (l === 2 || (l === 0 && u === 1)) { for (j = 0; j < m; j++) if (s[ve[j]] === 0) s[ve[j]] = 2; changed = true; }
          else if (l === 1 && u === 1) { for (j = 0; j < m; j++) if (s[ve[j]] === 0) s[ve[j]] = 1; changed = true; }
        }
      }
      if (changed) continue;
      var r = loopRule(t, clues, s);
      if (r < 0) return false;
      if (r > 0) changed = true;
    }
    return true;
  }

  function hasUnknown(s) {
    for (var e = 0; e < s.length; e++) if (s[e] === 0) return true;
    return false;
  }

  /** 等級 1:只靠基本規則能否完全解開 */
  function solvesByLogic(t, clues) {
    var s = new Uint8Array(t.E);
    return propagate(t, clues, s) && !hasUnknown(s);
  }

  /** 等級 2:基本規則 + 「假設一條線,若矛盾則排除」能否解開 */
  function solvesByProbing(t, clues) {
    var s = new Uint8Array(t.E);
    if (!propagate(t, clues, s)) return false;
    var progress = true;
    while (progress) {
      progress = false;
      for (var e = 0; e < t.E; e++) {
        if (s[e] !== 0) continue;
        var a = s.slice(); a[e] = 1;
        if (!propagate(t, clues, a)) {
          s[e] = 2;
          if (!propagate(t, clues, s)) return false;
          progress = true;
          continue;
        }
        var b = s.slice(); b[e] = 2;
        if (!propagate(t, clues, b)) {
          s.set(a);
          progress = true;
        }
      }
    }
    return !hasUnknown(s);
  }

  /** 等級 3:完整搜尋,數解的個數(最多數到 limit)。超出 budget 則 aborted。 */
  function countSolutions(t, clues, limit, budget) {
    var res = { count: 0, solution: null, aborted: false };
    var nodes = budget;
    function pick(s) {
      var first = -1, e;
      for (e = 0; e < t.E; e++) {
        if (s[e] !== 0) continue;
        if (first < 0) first = e;
        var ev = t.edgeVerts[e];
        for (var q = 0; q < 2; q++) {
          var ve = t.vertEdges[ev[q]], d = 0;
          for (var i = 0; i < ve.length; i++) if (s[ve[i]] === 1) d++;
          if (d === 1) return e;
        }
      }
      return first;
    }
    function rec(s) {
      if (--nodes < 0) { res.aborted = true; return; }
      if (!propagate(t, clues, s)) return;
      var e = pick(s);
      if (e < 0) { res.count++; res.solution = s; return; }
      for (var val = 1; val <= 2; val++) {
        var c = s.slice(); c[e] = val;
        rec(c);
        if (res.aborted || res.count >= limit) return;
      }
    }
    rec(new Uint8Array(t.E));
    return res;
  }

  function isUnique(t, clues, budget) {
    var r = countSolutions(t, clues, 2, budget);
    return !r.aborted && r.count === 1;
  }

  /* ---------- 出題 ---------- */

  function shuffle(a, rng) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  function edgesFromInside(t, inside) {
    var n = t.n, s = new Uint8Array(t.E), r, c;
    var at = function (rr, cc) { return rr < 0 || cc < 0 || rr >= n || cc >= n ? 0 : inside[rr * n + cc]; };
    for (r = 0; r <= n; r++) for (c = 0; c < n; c++) s[t.H(r, c)] = at(r - 1, c) !== at(r, c) ? 1 : 2;
    for (r = 0; r < n; r++) for (c = 0; c <= n; c++) s[t.V(r, c)] = at(r, c - 1) !== at(r, c) ? 1 : 2;
    return s;
  }

  /** 隨機長出一塊區域,其邊界就是答案迴圈 */
  function randomLoop(t, rng) {
    var n = t.n, N = n * n;
    var inside = new Uint8Array(N);
    inside[Math.floor(rng() * N)] = 1;
    var size = 1;
    var target = Math.max(2, Math.round(N * (0.45 + rng() * 0.2)));
    var fails = 0;
    var best = edgesFromInside(t, inside);
    while (size < target && fails < 60) {
      var cand = [];
      for (var i = 0; i < N; i++) {
        if (inside[i]) continue;
        var r = Math.floor(i / n), c = i % n, nb = 0;
        if (r > 0 && inside[i - n]) nb++;
        if (r < n - 1 && inside[i + n]) nb++;
        if (c > 0 && inside[i - 1]) nb++;
        if (c < n - 1 && inside[i + 1]) nb++;
        if (nb === 0) continue;
        // 只有一個鄰居的格子比較容易長出彎彎曲曲的形狀
        cand.push(i);
        if (nb === 1) { cand.push(i); cand.push(i); }
      }
      if (!cand.length) break;
      var pickCell = cand[Math.floor(rng() * cand.length)];
      inside[pickCell] = 1;
      var s = edgesFromInside(t, inside);
      if (isSingleLoop(t, s)) { size++; fails = 0; best = s; }
      else { inside[pickCell] = 0; fails++; }
    }
    return best;
  }

  var LEVELS = { easy: 1, medium: 2, hard: 3 };

  /**
   * 產生一題。level: 'easy' | 'medium' | 'hard'
   * 回傳 { n, clues: Int8Array, solution: Uint8Array, level }
   * 每一題都保證只有唯一解。
   */
  function generate(n, level, rng) {
    rng = rng || Math.random;
    var t = topo(n), N = n * n;
    var lv = LEVELS[level] || 1;
    var budget = 400 + n * n * 30;
    var test = function (clues) {
      if (lv === 1) return solvesByLogic(t, clues);
      if (lv === 2) return solvesByProbing(t, clues);
      return isUnique(t, clues, budget);
    };
    var fallback = null;
    for (var attempt = 0; attempt < 40; attempt++) {
      var solution = randomLoop(t, rng);
      var clues = new Int8Array(N), i;
      for (i = 0; i < N; i++) clues[i] = cellCount(t, solution, i);
      if (!test(clues)) continue;
      var order = [];
      for (i = 0; i < N; i++) order.push(i);
      shuffle(order, rng);
      var left = N;
      // 簡單:保留較多數字;中等/困難:能拿掉的都拿掉
      var keep = lv === 1 ? Math.ceil(N * 0.62) : 0;
      for (i = 0; i < N && left > keep; i++) {
        var cell = order[i], saved = clues[cell];
        clues[cell] = -1;
        if (test(clues)) left--; else clues[cell] = saved;
      }
      var puzzle = { n: n, clues: clues, solution: solution, level: level };
      // 中等要真的比簡單難、困難要真的比中等難(盤面夠大時)
      if (n >= 5 && attempt < 12) {
        if (lv === 2 && solvesByLogic(t, clues)) { fallback = fallback || puzzle; continue; }
        if (lv === 3 && solvesByProbing(t, clues)) { fallback = fallback || puzzle; continue; }
      }
      return puzzle;
    }
    if (fallback) return fallback;
    throw new Error('generate failed');
  }

  var api = {
    topo: topo,
    generate: generate,
    checkAnswer: checkAnswer,
    cellCount: cellCount,
    isSingleLoop: isSingleLoop,
    solvesByLogic: solvesByLogic,
    solvesByProbing: solvesByProbing,
    countSolutions: countSolutions
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Slitherlink = api;
})(typeof self !== 'undefined' ? self : this);
