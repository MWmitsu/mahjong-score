/* 成績表（Session）の計算補助。半荘の点数計算と、列合計・精算の集計。DOM非依存。 */
window.MJ = window.MJ || {};
MJ.sheets = (function () {
  "use strict";
  const D = MJ.domain;

  /* 1半荘の計算。raws: {playerId: rawScore}, tieBreaks/busters は任意。
     戻り値: 各プレイヤーの計算結果（ScoringPlayerResult） */
  function computeResults(rule, playerIds, raws, tieBreaks, busters, manualBusted) {
    const inputs = playerIds.map(function (pid, idx) {
      const raw = raws[pid];
      return {
        playerId: pid,
        rawScore: (raw == null ? 0 : raw),
        seatOrder: idx,
        isDealerStart: false,
        chipCount: 0,
        tieBreak: tieBreaks ? tieBreaks[pid] : undefined,
        bustedByPlayerId: busters ? (busters[pid] || null) : null,
        manualBusted: manualBusted ? manualBusted[pid] : undefined,
      };
    });
    return D.calculate(rule, inputs);
  }

  /* 列合計・チップ・精算（円）。
     settle = 合計ポイント × レート + チップ枚数 × チップ単価 */
  function playerTotals(session) {
    const out = {};
    const pids = session.playerIds || [];
    pids.forEach(function (pid) { out[pid] = { points: 0, chipCount: 0, chipAmount: 0, shugi: 0, shugiYen: 0, settle: 0 }; });
    (session.hanchans || []).forEach(function (h) {
      (h.results || []).forEach(function (r) { if (out[r.playerId]) out[r.playerId].points += r.totalPointWithoutChip; });
    });
    // 役満祝儀（半荘ごと: 和了者 +amount×(人数-1) / 他家 各 -amount）
    const shugiType = session.shugiType || "none";
    if (shugiType !== "none") {
      (session.hanchans || []).forEach(function (h) {
        const vals = shugiValuesOf(h, pids);
        if (vals) pids.forEach(function (pid) { if (out[pid]) out[pid].shugi += vals[pid] || 0; });
      });
    }
    const unit = session.chipUnit || 0;
    const rate = session.rate || 0;
    pids.forEach(function (pid) {
      const c = (session.chips || {})[pid] || 0;
      out[pid].chipCount = c;
      out[pid].chipAmount = c * unit;
      if (shugiType === "chip") out[pid].shugiYen = out[pid].shugi * unit;
      else if (shugiType === "point") out[pid].shugiYen = Math.round(out[pid].shugi * rate);
      else if (shugiType === "yen") out[pid].shugiYen = out[pid].shugi;
      out[pid].settle = Math.round(out[pid].points * rate) + out[pid].chipAmount + out[pid].shugiYen;
    });
    return out;
  }

  /* 1プレイヤーの、その半荘での結果を取得 */
  function resultOf(hanchan, playerId) {
    return (hanchan.results || []).filter(function (r) { return r.playerId === playerId; })[0] || null;
  }

  /* 半荘の役満祝儀を「各プレイヤーの増減マップ」に正規化（新形式 values / 旧形式 winnerId+amount 両対応） */
  function shugiValuesOf(hanchan, playerIds) {
    if (!hanchan || !hanchan.shugi) return null;
    if (hanchan.shugi.values) return hanchan.shugi.values;
    if (hanchan.shugi.winnerId && hanchan.shugi.amount) {
      const n = playerIds.length, m = {};
      playerIds.forEach(function (pid) { m[pid] = (pid === hanchan.shugi.winnerId) ? hanchan.shugi.amount * (n - 1) : -hanchan.shugi.amount; });
      return m;
    }
    return null;
  }

  return { computeResults: computeResults, playerTotals: playerTotals, resultOf: resultOf, shugiValuesOf: shugiValuesOf };
})();
