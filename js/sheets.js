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
    const results = D.calculate(rule, inputs);
    applyTopRemainder(results);
    return results;
  }

  /* トップ（1位）のポイントを「他家の合計の符号反転」にして、卓のポイント合計を必ず0にする。
     箱下やオカのあまりはトップが負う。全員0点以上でゼロサムのときは値は変わらない。 */
  function applyTopRemainder(results) {
    if (!results || results.length < 2) return;
    let top = null;
    results.forEach(function (r) { if (r.rank === 1 && !top) top = r; });
    if (!top) return;
    let others = 0;
    results.forEach(function (r) { if (r !== top) others += r.totalPointWithoutChip; });
    top.totalPointWithoutChip = -others;
    top.totalPointWithChip = -others; // この画面では半荘単位のチップは無いため両者は一致
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
    // レート換算yen（ポイント＋point型祝儀）は各自を対称丸めし、丸め残差をトップ（合計pt最大）が負う。
    // これでチップが±0のときは精算(円)の合計が必ず0になる（端数で合計がずれない）。
    const rateExact = {};
    pids.forEach(function (pid) {
      let v = out[pid].points * rate;
      if (shugiType === "point") v += out[pid].shugi * rate;
      rateExact[pid] = v;
    });
    const rateYen = zeroSumRoundYen(rateExact, out, pids);
    pids.forEach(function (pid) {
      const c = (session.chips || {})[pid] || 0;
      out[pid].chipCount = c;
      out[pid].chipAmount = c * unit;
      // 内訳表示用の祝儀yen
      if (shugiType === "chip") out[pid].shugiYen = out[pid].shugi * unit;
      else if (shugiType === "point") out[pid].shugiYen = roundSym(out[pid].shugi * rate);
      else if (shugiType === "yen") out[pid].shugiYen = out[pid].shugi;
      // 精算 = ゼロサム化したレート換算yen ＋ チップ金額 ＋（チップ/円型の）祝儀yen
      let s = rateYen[pid] + out[pid].chipAmount;
      if (shugiType === "chip" || shugiType === "yen") s += out[pid].shugiYen;
      out[pid].settle = s;
    });
    return out;
  }

  // 0から離れる方向の対称丸め（負の .5 でも対称＝JS Math.round の非対称を回避）
  function roundSym(v) { return (v < 0 ? -1 : 1) * Math.round(Math.abs(v)); }

  // 各自を対称丸めし、丸め残差を「合計ポイント最大（＝トップ）」が負って合計を round(Σ実値) に一致させる
  function zeroSumRoundYen(exactByPid, out, pids) {
    const rounded = {}; let sum = 0, exactSum = 0;
    pids.forEach(function (pid) { const r = roundSym(exactByPid[pid]); rounded[pid] = r; sum += r; exactSum += exactByPid[pid]; });
    const residual = Math.round(exactSum) - sum;
    if (residual !== 0 && pids.length) {
      let tp = pids[0];
      pids.forEach(function (pid) { if (out[pid].points > out[tp].points) tp = pid; });
      rounded[tp] += residual;
    }
    return rounded;
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
      // 旧形式は「その半荘の出場者」だけに配分する（抜け番＝非出場者に祝儀が付かないように）
      const parts = (hanchan.playerIds && hanchan.playerIds.length)
        ? hanchan.playerIds
        : (playerIds || []).filter(function (p) { return hanchan.raws && hanchan.raws[p] != null; });
      const n = parts.length, m = {};
      parts.forEach(function (pid) { m[pid] = (pid === hanchan.shugi.winnerId) ? hanchan.shugi.amount * (n - 1) : -hanchan.shugi.amount; });
      return m;
    }
    return null;
  }

  return { computeResults: computeResults, playerTotals: playerTotals, resultOf: resultOf, shugiValuesOf: shugiValuesOf };
})();
