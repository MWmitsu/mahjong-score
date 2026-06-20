/* 集計ロジック（DOM非依存）。成績表(Session)の全半荘から人物別成績を計算。
   確定判断③: 3麻/4麻は合算しない（type を必ず指定）。週の開始は月曜。 */
window.MJ = window.MJ || {};
MJ.stats = (function () {
  "use strict";
  const D = MJ.domain;

  function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function periodRange(period, customFrom, customTo) {
    const now = new Date();
    switch (period) {
      case "today": return { from: dayStart(now), to: now };
      case "week": { const s = dayStart(now); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return { from: s, to: now }; }
      case "month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
      case "year": return { from: new Date(now.getFullYear(), 0, 1), to: now };
      case "custom": return { from: customFrom ? new Date(customFrom + "T00:00:00") : null, to: customTo ? new Date(customTo + "T23:59:59") : null };
      case "all":
      default: return { from: null, to: null };
    }
  }

  function inRange(iso, range) {
    const d = new Date(iso);
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  }

  // opts: { type, period, customFrom, customTo, sessionId }
  function filteredSessions(opts) {
    const range = periodRange(opts.period, opts.customFrom, opts.customTo);
    return MJ.store.active("sessions").filter(function (s) {
      if (opts.type && s.mahjongType !== opts.type) return false;
      if (opts.sessionId && s.id !== opts.sessionId) return false;
      if (!inRange(s.date, range)) return false;
      return true;
    });
  }

  function playerStats(sessions, playerId) {
    const games = [];
    let chipCount = 0, chipAmount = 0, moneyTotal = 0, yakuman = 0;
    sessions.forEach(function (s) {
      if ((s.playerIds || []).indexOf(playerId) < 0) return; // 参加した成績表のみ
      const c = (s.chips || {})[playerId] || 0;
      chipCount += c;
      chipAmount += c * (s.chipUnit || 0);
      let sessionPts = 0;
      let shugiDelta = 0;
      (s.hanchans || []).forEach(function (h) {
        const r = (h.results || []).filter(function (x) { return x.playerId === playerId; })[0];
        if (r) { games.push({ r: r, pc: D.playerCount(s.mahjongType), date: s.date }); sessionPts += r.totalPointWithoutChip; }
        const vals = MJ.sheets.shugiValuesOf(h, s.playerIds);
        if (vals) { const d = vals[playerId] || 0; shugiDelta += d; if (d > 0) yakuman++; }
      });
      const st = s.shugiType || "none";
      let shugiYen = 0;
      if (st === "chip") shugiYen = shugiDelta * (s.chipUnit || 0);
      else if (st === "point") shugiYen = Math.round(shugiDelta * (s.rate || 0));
      else if (st === "yen") shugiYen = shugiDelta;
      moneyTotal += Math.round(sessionPts * (s.rate || 0)) + c * (s.chipUnit || 0) + shugiYen;
    });

    const n = games.length;
    const stat = {
      games: n, total: 0, avg: 0, max: null, min: null,
      rankCounts: {}, avgRank: 0, topRate: 0, lastRate: 0, lastAvoidRate: 0, rentaiRate: 0,
      chipCount: chipCount, chipAmount: chipAmount, moneyTotal: moneyTotal, yakuman: yakuman, recent: [],
      bustCount: 0, maxTopStreak: 0, maxLastStreak: 0, cumulative: [],
    };
    if (n === 0) return stat;

    let rankSum = 0, topCount = 0, lastCount = 0, rentaiCount = 0;
    games.forEach(function (g) {
      const pt = g.r.totalPointWithoutChip;
      stat.total += pt;
      stat.max = stat.max == null ? pt : Math.max(stat.max, pt);
      stat.min = stat.min == null ? pt : Math.min(stat.min, pt);
      stat.rankCounts[g.r.rank] = (stat.rankCounts[g.r.rank] || 0) + 1;
      rankSum += g.r.rank;
      if (g.r.rank === 1) topCount++;
      if (g.r.rank <= 2) rentaiCount++;
      if (g.r.rank === g.pc) lastCount++;
    });
    stat.avg = stat.total / n;
    stat.avgRank = rankSum / n;
    stat.topRate = topCount / n;
    stat.lastRate = lastCount / n;
    stat.lastAvoidRate = 1 - stat.lastRate;
    stat.rentaiRate = rentaiCount / n;
    stat.recent = games.slice()
      .sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); })
      .slice(0, 10)
      .map(function (g) { return { date: g.date, rank: g.r.rank, pt: g.r.totalPointWithoutChip, playerCount: g.pc }; });

    // 実績・累計（古い順）
    const chrono = games.slice().sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    let bustCount = 0, curTop = 0, maxTop = 0, curLast = 0, maxLast = 0, run = 0;
    const cumulative = [];
    chrono.forEach(function (g) {
      if (g.r.isBusted) bustCount++;
      if (g.r.rank === 1) { curTop++; if (curTop > maxTop) maxTop = curTop; } else curTop = 0;
      if (g.r.rank === g.pc) { curLast++; if (curLast > maxLast) maxLast = curLast; } else curLast = 0;
      run += g.r.totalPointWithoutChip; cumulative.push(run);
    });
    stat.bustCount = bustCount; stat.maxTopStreak = maxTop; stat.maxLastStreak = maxLast; stat.cumulative = cumulative;
    return stat;
  }

  return { periodRange: periodRange, filteredSessions: filteredSessions, playerStats: playerStats };
})();
