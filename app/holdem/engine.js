/*
 * 德州撲克引擎:牌型判定、勝率估算、分池。
 * 純 JS、無相依,瀏覽器與 Node 皆可載入。
 *
 * 牌:0..51 的整數。rank = c >> 2(0..12 代表 2..A),suit = c & 3。
 */
(function (root) {
  'use strict';

  var CATEGORY = ['高牌', '一對', '兩對', '三條', '順子', '同花', '葫蘆', '四條', '同花順'];

  function straightHigh(mask) {
    for (var hi = 12; hi >= 4; hi--) {
      if (((mask >> (hi - 4)) & 31) === 31) return hi;
    }
    return (mask & 0x100F) === 0x100F ? 3 : -1;   // A-2-3-4-5
  }

  /** 從 5~7 張牌中取最佳五張,回傳可直接比大小的分數(越大越好) */
  function evaluate(cards) {
    var rc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var sc = [0, 0, 0, 0], sm = [0, 0, 0, 0], mask = 0, i, r;
    for (i = 0; i < cards.length; i++) {
      r = cards[i] >> 2;
      var s = cards[i] & 3;
      rc[r]++; sc[s]++; sm[s] |= 1 << r; mask |= 1 << r;
    }
    var flush = -1;
    for (i = 0; i < 4; i++) if (sc[i] >= 5) flush = i;

    var cat, k = [];
    var quads = -1, trips = [], pairs = [], singles = [];
    for (r = 12; r >= 0; r--) {
      if (rc[r] === 4) quads = r;
      else if (rc[r] === 3) trips.push(r);
      else if (rc[r] === 2) pairs.push(r);
      else if (rc[r] === 1) singles.push(r);
    }
    function tops(count, skip) {
      var out = [];
      for (var x = 12; x >= 0 && out.length < count; x--) {
        if (rc[x] > 0 && skip.indexOf(x) < 0) out.push(x);
      }
      return out;
    }

    var sf = flush >= 0 ? straightHigh(sm[flush]) : -1;
    var st = straightHigh(mask);
    if (sf >= 0) { cat = 8; k = [sf]; }
    else if (quads >= 0) { cat = 7; k = [quads].concat(tops(1, [quads])); }
    else if (trips.length && (trips.length > 1 || pairs.length)) {
      cat = 6;
      k = [trips[0], Math.max(trips.length > 1 ? trips[1] : -1, pairs.length ? pairs[0] : -1)];
    }
    else if (flush >= 0) {
      cat = 5;
      for (r = 12; r >= 0 && k.length < 5; r--) if (sm[flush] & (1 << r)) k.push(r);
    }
    else if (st >= 0) { cat = 4; k = [st]; }
    else if (trips.length) { cat = 3; k = [trips[0]].concat(tops(2, [trips[0]])); }
    else if (pairs.length >= 2) { cat = 2; k = [pairs[0], pairs[1]].concat(tops(1, [pairs[0], pairs[1]])); }
    else if (pairs.length === 1) { cat = 1; k = [pairs[0]].concat(tops(3, [pairs[0]])); }
    else { cat = 0; k = tops(5, []); }

    var score = cat;
    for (i = 0; i < 5; i++) score = score * 16 + (i < k.length ? k[i] : 0);
    return score;
  }

  function category(score) { return Math.floor(score / 1048576); }

  function handName(score) {
    var cat = category(score);
    if (cat === 8 && (Math.floor(score / 65536) % 16) === 12) return '皇家同花順';
    return CATEGORY[cat];
  }

  function shuffledDeck(rng) {
    var d = [], i;
    for (i = 0; i < 52; i++) d.push(i);
    for (i = 51; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)), t = d[i];
      d[i] = d[j]; d[j] = t;
    }
    return d;
  }

  /** 用隨機模擬估算:這兩張底牌對上 opponents 個隨機對手的勝率(平手算一半) */
  function equity(hole, board, opponents, sims, rng) {
    rng = rng || Math.random;
    var used = {}, rest = [], i, s, o;
    for (i = 0; i < hole.length; i++) used[hole[i]] = 1;
    for (i = 0; i < board.length; i++) used[board[i]] = 1;
    for (i = 0; i < 52; i++) if (!used[i]) rest.push(i);
    var need = 5 - board.length, win = 0;
    for (s = 0; s < sims; s++) {
      // 只需要洗前面用得到的幾張
      var take = need + opponents * 2;
      for (i = 0; i < take; i++) {
        var j = i + Math.floor(rng() * (rest.length - i)), t = rest[i];
        rest[i] = rest[j]; rest[j] = t;
      }
      var full = board.concat(rest.slice(0, need));
      var mine = evaluate(hole.concat(full)), best = true, tie = false;
      for (o = 0; o < opponents; o++) {
        var theirs = evaluate([rest[need + o * 2], rest[need + o * 2 + 1]].concat(full));
        if (theirs > mine) { best = false; break; }
        if (theirs === mine) tie = true;
      }
      if (best) win += tie ? 0.5 : 1;
    }
    return win / sims;
  }

  /**
   * 分池。players: [{ total, folded, score }](total = 這一局投入的籌碼)
   * 回傳每位玩家贏得的籌碼陣列;多投入而沒人跟的部分會原數退回。
   */
  function payouts(players) {
    var left = players.map(function (p) { return p.total; });
    var won = players.map(function () { return 0; });
    for (;;) {
      var m = Infinity, i;
      for (i = 0; i < players.length; i++) if (!players[i].folded && left[i] > 0 && left[i] < m) m = left[i];
      if (m === Infinity) break;
      var pot = 0, elig = [];
      for (i = 0; i < players.length; i++) {
        if (left[i] <= 0) continue;
        var take = Math.min(left[i], m);
        pot += take;
        left[i] -= take;
        if (!players[i].folded) elig.push(i);
      }
      var best = -1, winners = [];
      for (i = 0; i < elig.length; i++) {
        var sc = players[elig[i]].score;
        if (sc > best) { best = sc; winners = [elig[i]]; }
        else if (sc === best) winners.push(elig[i]);
      }
      var share = Math.floor(pot / winners.length), extra = pot - share * winners.length;
      for (i = 0; i < winners.length; i++) won[winners[i]] += share + (i < extra ? 1 : 0);
    }
    // 棄牌者多出來、沒有對手可分的零頭(理論上不會發生)歸給贏最多的人
    var stray = left.reduce(function (a, b) { return a + b; }, 0);
    if (stray > 0) {
      var top = 0;
      for (var q = 1; q < won.length; q++) if (won[q] > won[top]) top = q;
      won[top] += stray;
    }
    return won;
  }

  var api = {
    evaluate: evaluate,
    category: category,
    handName: handName,
    shuffledDeck: shuffledDeck,
    equity: equity,
    payouts: payouts
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Holdem = api;
})(typeof self !== 'undefined' ? self : this);
