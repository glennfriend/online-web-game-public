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

  /* ---------- 電腦對手的性格 ---------- */
  // 同一套判斷,換不同的設定:
  //   tight  多挑牌(正 = 只玩好牌,負 = 什麼都玩)   aggr   多愛下注、加注
  //   bluff  沒牌也下注的機率                       sticky 多不願意棄牌
  //   scared 面對大注時多容易縮手                   sims   估勝率時模擬幾次(越多越準)
  //   multi  會不會把「還有幾個對手」算進去         noise  估勝率的誤差
  //   size   下注大小(底池的幾倍,[最小, 最大])    shove  直接全下的機率
  //   slow   拿到大牌時裝弱、先不加注的機率         cbet   翻牌前加注過,翻牌後繼續下注的機率
  // 分類照撲克界慣用的兩條軸:玩多少牌(緊 / 鬆)和怎麼玩(弱 = 被動 / 兇 = 主動)。
  var PERSONAS = [
    { name: '鯊魚',   type: '緊兇', desc: '挑牌,進來就下注加注。最穩、最難對付的打法',         tight: 0.03,  aggr: 1.5, bluff: 0.08, sticky: 0,    scared: 0,    sims: 300, multi: true,  noise: 0, size: [0.6, 0.9],  shove: 0,    slow: 0.1,  cbet: 0.7 },
    { name: '老狐狸', type: '鬆兇', desc: '玩很多牌而且打得兇,有時裝弱、有時唬人,難捉摸',     tight: -0.08, aggr: 1.6, bluff: 0.18, sticky: 0.02, scared: 0,    sims: 200, multi: false, noise: 0, size: [0.5, 1.0],  shove: 0,    slow: 0.3,  cbet: 0.75 },
    { name: '老石頭', type: '緊弱', desc: '只玩最好的牌,很少唬人,太容易棄牌。他一下注你就該小心', tight: 0.10,  aggr: 0.6, bluff: 0,    sticky: 0,    scared: 0.05, sims: 160, multi: false, noise: 0, size: [0.5, 0.7],  shove: 0,    slow: 0,    cbet: 0.3 },
    { name: '跟注王', type: '鬆弱', desc: '什麼牌都想看,很少加注,也很難把他嚇跑',             tight: -0.12, aggr: 0.3, bluff: 0.01, sticky: 0.14, scared: 0,    sims: 160, multi: false, noise: 0, size: [0.3, 0.5],  shove: 0,    slow: 0,    cbet: 0.2 },
    { name: '瘋子',   type: '瘋子', desc: '什麼牌都加注,注又大又頻繁',                         tight: -0.20, aggr: 2.5, bluff: 0.35, sticky: 0.08, scared: 0,    sims: 160, multi: false, noise: 0, size: [0.7, 1.3],  shove: 0.10, slow: 0,    cbet: 0.9 },
    { name: '數學家', type: '均衡', desc: '算勝率和底池賠率,好牌壞牌照比例混著打,很難看穿',   tight: 0,     aggr: 1.3, bluff: 0.10, sticky: 0,    scared: 0,    sims: 500, multi: true,  noise: 0, size: [0.5, 1.0],  shove: 0,    slow: 0.15, cbet: 0.65 }
  ];

  /**
   * 電腦決定這一手要做什麼。
   * c = { persona, hole, board, street, toCall, currentBet, minRaise, raises, pot, bet, chips,
   *       others(還在局裡的其他人數), raisedPre(自己翻牌前加注過) }
   * 回傳 { type: 'fold' | 'call' | 'raise', to: 加注到多少 }
   */
  function decide(c, rng) {
    rng = rng || Math.random;
    var S = c.persona, r = rng();
    var opp = S.multi ? Math.max(1, c.others) : 1;
    var e = equity(c.hole, c.board, opp, S.sims, rng);
    if (S.noise) e = Math.max(0, Math.min(1, e + (rng() - 0.5) * S.noise * 2));
    var crowd = S.multi ? 0 : 0.04 * (c.others - 1);
    // rel:把勝率換算成「一對一時的強度」,門檻才能共用
    var rel = S.multi ? e * (opp + 1) / 2 : e - crowd;

    var tight = S.tight, aggr = S.aggr, bluff = S.bluff, sticky = S.sticky;
    var strong = 0.66 + tight - 0.05 * (aggr - 1), monster = 0.80 + tight * 0.5;
    var stack = c.bet + c.chips;
    var mayRaise = c.raises < 3 && stack > c.currentBet + c.minRaise;
    function raiseTo(bluffing) {
      if (rng() < S.shove && !bluffing) return stack;
      var frac = S.size[0] + rng() * (S.size[1] - S.size[0]);
      var size = Math.max(c.minRaise, Math.round(c.pot * frac / 10) * 10);
      return Math.min(stack, c.currentBet + size);
    }
    var call = { type: 'call' }, fold = { type: 'fold' };

    // 陷阱:拿到大牌先裝弱(到河牌才出手)
    var trap = rel > monster && c.street < 3 && rng() < S.slow;

    if (c.toCall <= 0) {
      if (trap || !mayRaise) return call;
      if (rel > strong) return { type: 'raise', to: raiseTo(false) };
      if (rel > 0.5 && r < 0.3 * aggr) return { type: 'raise', to: raiseTo(false) };
      if (c.raisedPre && c.street === 1 && rng() < S.cbet) return { type: 'raise', to: raiseTo(true) };
      if (rng() < bluff) return { type: 'raise', to: raiseTo(true) };
      return call;
    }

    if (mayRaise && !trap) {
      // 翻牌前還沒人加注時,好牌就主動加注
      var open = c.street === 0 && c.raises === 0 ? 0.12 : 0;
      if (rel > monster || (rel > strong - open && r < 0.4 * aggr)) return { type: 'raise', to: raiseTo(false) };
      if (c.toCall < c.pot * 0.5 && rng() < bluff * 0.5) return { type: 'raise', to: raiseTo(true) };
    }
    // 跟不跟:勝率要比底池賠率高。會算的人只留一點保險,其他人留得比較多。
    var odds = c.toCall / (c.pot + c.toCall);
    var need = odds + (S.multi ? 0.03 : 0.12) + tight * 0.6 - sticky;
    // 翻牌前還沒表態的人有些會棄牌,會算的人把門檻放寬一點
    if (S.multi && c.street === 0) need = odds * 0.9 + tight * 0.6;
    var mine = S.multi ? e : rel;
    if (c.toCall > c.pot * 0.5) need += S.scared;                       // 面對大注
    if (c.toCall > c.chips * 0.4) need = Math.max(need, (S.multi ? odds + 0.08 : 0.6) - sticky + S.scared);   // 要押上大半籌碼
    return mine > need ? call : fold;
  }

  var api = {
    PERSONAS: PERSONAS,
    decide: decide,
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
