/* 初期ルール・サンプルデータ。サンプルは isSample:true を付け一括削除可能。
   成績表(Session)方式。 */
window.MJ = window.MJ || {};
MJ.sample = (function () {
  "use strict";
  const D = MJ.domain, S = MJ.store;

  function seedDefaultRulesIfNeeded() {
    const hasReal = S.all("rules").some(function (r) { return !r.isSample && !r.isDeleted; });
    if (hasReal) return false;
    S.upsert("rules", D.defaultFourPlayerRule());
    S.upsert("rules", D.defaultThreePlayerRule());
    return true;
  }

  function makeHanchan(rule, playerIds, rawArray, bustedByTop) {
    const raws = {};
    playerIds.forEach(function (pid, i) { raws[pid] = rawArray[i]; });
    let busters = null;
    if (bustedByTop) {
      const pre = MJ.sheets.computeResults(rule, playerIds, raws);
      const top = pre.filter(function (r) { return r.rank === 1; })[0];
      busters = {};
      pre.forEach(function (r) { if (D.detectBusted(rule, r.rawScore) && r.playerId !== top.playerId) busters[r.playerId] = top.playerId; });
    }
    const results = MJ.sheets.computeResults(rule, playerIds, raws, null, busters);
    return { id: D.uuid(), raws: raws, results: results, createdAt: D.nowISO() };
  }

  function seedSample() {
    seedDefaultRulesIfNeeded();
    let rule4 = S.all("rules").find(function (r) { return r.mahjongType === D.MahjongType.four && !r.isDeleted; });
    if (!rule4) { rule4 = D.defaultFourPlayerRule(); S.upsert("rules", rule4); }

    const names = ["佐藤", "鈴木", "高橋", "田中"];
    const players = names.map(function (nm) {
      return { id: D.uuid(), name: nm, memo: "サンプル", isActive: true, isSample: true, createdAt: D.nowISO(), updatedAt: D.nowISO() };
    });
    players.forEach(function (p) { S.upsert("players", p); });
    const pids = players.map(function (p) { return p.id; });

    const session = {
      id: D.uuid(),
      name: "サンプル部屋（4麻）",
      date: new Date().toISOString(),
      mahjongType: D.MahjongType.four,
      ruleSetId: rule4.id, ruleName: rule4.name,
      rate: 50,
      chipUnit: rule4.chipUnitAmount,
      shugiType: rule4.yakumanShugiType || "chip",
      playerIds: pids,
      hanchans: [
        makeHanchan(rule4, pids, [42000, 31000, 18000, 9000]),
        makeHanchan(rule4, pids, [55000, 30000, 16000, -1000], true),
        makeHanchan(rule4, pids, [38000, 33000, 21000, 8000]),
      ],
      chips: {},
      isSample: true, isDeleted: false, deletedAt: null,
      createdAt: D.nowISO(), updatedAt: D.nowISO(),
    };
    session.chips[pids[0]] = 2;
    session.chips[pids[2]] = -1;
    session.chips[pids[3]] = -1;
    // 2局目に役満（佐藤）のサンプル: 各他家5枚
    session.hanchans[1].shugi = { winnerId: pids[0], amount: 5 };
    S.upsert("sessions", session);
  }

  function clearSample() {
    ["sessions", "matches", "rooms", "players", "rules"].forEach(function (kind) {
      const keep = S.all(kind).filter(function (x) { return !x.isSample; });
      const doc = S.load();
      doc[kind] = keep;
    });
    S.persist();
  }

  return { seedDefaultRulesIfNeeded: seedDefaultRulesIfNeeded, seedSample: seedSample, clearSample: clearSample };
})();
