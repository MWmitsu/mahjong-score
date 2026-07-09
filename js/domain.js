/* ドメイン層: 列挙・既定ルール・点数計算・検証（DOM非依存・純粋ロジック）。
   Swift版 ScoreCalculator / MatchValidator を忠実に移植。 */
window.MJ = window.MJ || {};
MJ.domain = (function () {
  "use strict";

  // ---- 列挙 ----
  const MahjongType = { three: "three", four: "four" };
  const TobiPaymentType = { winnerPlusLoserMinus: "winnerPlusLoserMinus", bonusOnly: "bonusOnly" };
  const BustRule = { belowZero: "belowZero", zeroOrBelow: "zeroOrBelow", manual: "manual" };
  const RoundingRule = { none: "none", roundHalfUp: "roundHalfUp", floor: "floor", ceil: "ceil", goshaRokunyu: "goshaRokunyu" };

  function playerCount(type) { return type === MahjongType.three ? 3 : 4; }
  function typeName(type) { return type === MahjongType.three ? "3人麻雀" : "4人麻雀"; }
  function typeShort(type) { return type === MahjongType.three ? "3麻" : "4麻"; }
  function seatName(order) { return ["東", "南", "西", "北"][order] || ("席" + (order + 1)); }

  // ---- ユーティリティ ----
  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      try { return crypto.randomUUID(); } catch (e) { /* fallthrough */ }
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  function nowISO() { return new Date().toISOString(); }

  // ---- 既定ルール ----
  function makeRule(overrides) {
    const base = {
      id: uuid(),
      name: "",
      mahjongType: MahjongType.four,
      initialScore: 25000,
      returnScore: 30000,
      hasOka: true,
      okaPoint: 20,
      umaPoints: [20, 10, -10, -20],
      pointPer1000: 1.0,
      hasTobiBonus: true,
      tobiBonusPoint: 10,
      tobiPaymentType: TobiPaymentType.winnerPlusLoserMinus,
      bustRule: BustRule.zeroOrBelow,
      noNegativeSettlement: true,
      chipUnitAmount: 200,
      chipPointIncludedInMainRanking: false,
      pointToYenRate: null,
      yakumanShugiType: "chip", // none | chip | point | yen（役満祝儀の処理方法）
      roundingRule: RoundingRule.none,
      sameScoreRankRule: "seatOrderFromDealer",
      memo: "",
      isActive: true,
      isSample: false,
      isDeleted: false,
      deletedAt: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    return Object.assign(base, overrides || {});
  }

  function defaultFourPlayerRule() {
    return makeRule({
      name: "4人麻雀 標準", mahjongType: MahjongType.four,
      initialScore: 25000, returnScore: 30000, okaPoint: 20,
      umaPoints: [20, 10, -10, -20], memo: "初期ルール（25000持ち / 30000返し）",
      isDefault: true, // 自動シードされた既定ルール（クラウド同期のデータ有無判定で除外する）
    });
  }
  function defaultThreePlayerRule() {
    return makeRule({
      name: "3人麻雀 標準", mahjongType: MahjongType.three,
      initialScore: 35000, returnScore: 40000, okaPoint: 15,
      umaPoints: [40, 0, -40], memo: "初期ルール（35000持ち / 40000返し）",
      isDefault: true,
    });
  }

  function suggestedOka(rule) {
    return playerCount(rule.mahjongType) * (rule.returnScore - rule.initialScore) / 1000 * rule.pointPer1000;
  }

  // ---- 丸め ----
  function applyRounding(value, rule) {
    switch (rule) {
      case RoundingRule.none: return value;
      // 0から離れる方向に丸める（負の.5でも対称＝卓の非対称ズレを防ぐ）
      case RoundingRule.roundHalfUp: return (value < 0 ? -1 : 1) * Math.round(Math.abs(value));
      case RoundingRule.floor: return Math.floor(value);
      case RoundingRule.ceil: return Math.ceil(value);
      case RoundingRule.goshaRokunyu: return (value < 0 ? -1 : 1) * Math.floor(Math.abs(value) + 0.4); // 五捨六入（絶対値が.6以上で繰上げ・符号対称）
      default: return value;
    }
  }

  // ---- 飛び判定 ----
  function detectBusted(rule, rawScore, manual) {
    switch (rule.bustRule) {
      case BustRule.belowZero: return manual != null ? manual : rawScore < 0;
      case BustRule.zeroOrBelow: return manual != null ? manual : rawScore <= 0;
      case BustRule.manual: return manual != null ? manual : false;
      default: return false;
    }
  }

  /* 点数計算本体。
     inputs: [{ playerId, rawScore, seatOrder, isDealerStart, chipCount, manualBusted?, bustedByPlayerId? }]
     戻り値: 各プレイヤーの確定結果 [] */
  function calculate(rule, inputs) {
    const n = Math.max(inputs.length, 1);
    const dealer = inputs.find(function (i) { return i.isDealerStart; });
    const dealerSeat = dealer ? dealer.seatOrder : 0;
    function dist(seat) { return ((seat - dealerSeat) % n + n) % n; }

    // 1. 順位（rawScore 降順、同点は tieBreak 昇順＝手動指定優先、無ければ起家に近い席）
    const ordered = inputs.slice().sort(function (a, b) {
      if (a.rawScore !== b.rawScore) return b.rawScore - a.rawScore;
      const ta = (a.tieBreak != null) ? a.tieBreak : dist(a.seatOrder);
      const tb = (b.tieBreak != null) ? b.tieBreak : dist(b.seatOrder);
      return ta - tb;
    });
    const rankByPlayer = {};
    ordered.forEach(function (it, idx) { rankByPlayer[it.playerId] = idx + 1; });

    // 7. 飛び賞集計
    const tobiByPlayer = {};
    if (rule.hasTobiBonus) {
      const t = rule.tobiBonusPoint;
      inputs.forEach(function (inp) {
        if (!detectBusted(rule, inp.rawScore, inp.manualBusted)) return;
        if (rule.tobiPaymentType === TobiPaymentType.winnerPlusLoserMinus) {
          tobiByPlayer[inp.playerId] = (tobiByPlayer[inp.playerId] || 0) - t;
          if (inp.bustedByPlayerId) tobiByPlayer[inp.bustedByPlayerId] = (tobiByPlayer[inp.bustedByPlayerId] || 0) + t;
        } else if (rule.tobiPaymentType === TobiPaymentType.bonusOnly) {
          if (inp.bustedByPlayerId) tobiByPlayer[inp.bustedByPlayerId] = (tobiByPlayer[inp.bustedByPlayerId] || 0) + t;
        }
      });
    }

    return inputs.map(function (inp) {
      const rank = rankByPlayer[inp.playerId] || n;
      const settlement = rule.noNegativeSettlement ? Math.max(inp.rawScore, 0) : inp.rawScore;
      let base = (settlement - rule.returnScore) / 1000 * rule.pointPer1000;
      base = applyRounding(base, rule.roundingRule);
      const uma = (rank - 1) < rule.umaPoints.length ? rule.umaPoints[rank - 1] : 0;
      const oka = (rule.hasOka && rank === 1) ? rule.okaPoint : 0;
      const tobi = tobiByPlayer[inp.playerId] || 0;
      const busted = detectBusted(rule, inp.rawScore, inp.manualBusted);
      const chipCount = inp.chipCount || 0;
      const chipAmount = chipCount * rule.chipUnitAmount;
      const withoutChip = base + uma + oka + tobi;
      const chipPtEquiv = (rule.pointToYenRate && rule.pointToYenRate > 0) ? (chipAmount / rule.pointToYenRate) : 0;
      const withChip = withoutChip + chipPtEquiv;
      return {
        playerId: inp.playerId,
        rawScore: inp.rawScore,
        settlementScore: settlement,
        rank: rank,
        seatOrder: inp.seatOrder,
        isDealerStart: !!inp.isDealerStart,
        basePoint: base,
        umaPoint: uma,
        okaPoint: oka,
        tobiBonusPoint: tobi,
        isBusted: busted,
        bustedByPlayerId: busted ? (inp.bustedByPlayerId || null) : null,
        chipCount: chipCount,
        chipAmount: chipAmount,
        totalPointWithoutChip: withoutChip,
        totalPointWithChip: withChip,
      };
    });
  }

  /* 保存前の入力チェック（警告のみ・ブロックしない）。
     現行フローで実際に意味のある検査に限定:
       - 参加人数（通常は出場者ピッカーで担保・保険）
       - プレイヤー重複
       - 粗点が100点単位でない（入力ミスの目安）
       - 粗点合計 ≠ 人数×初期持ち点
     ※飛び/飛ばした人は確認ポップアップ、チップは部屋単位、卓合計はトップ=残りで別途処理。 */
  function validate(rule, inputs) {
    const w = [];
    const expected = playerCount(rule.mahjongType);

    if (inputs.length !== expected) {
      w.push({ severity: "warning", message: "参加人数が " + inputs.length + " 人です。" + typeName(rule.mahjongType) + "は " + expected + " 人で入力してください。" });
    }
    const ids = inputs.map(function (i) { return i.playerId; });
    if (new Set(ids).size !== ids.length) w.push({ severity: "warning", message: "同じプレイヤーが重複しています。" });

    inputs.forEach(function (i) {
      if (typeof i.rawScore === "number" && i.rawScore % 100 !== 0) {
        w.push({ severity: "info", message: "粗点 " + i.rawScore.toLocaleString() + " は100点単位ではありません（入力ミスの可能性）。" });
      }
    });

    if (inputs.length === expected && rule.initialScore) {
      const rawSum = inputs.reduce(function (s, i) { return s + i.rawScore; }, 0);
      const expectedSum = expected * rule.initialScore;
      if (rawSum !== expectedSum) {
        w.push({ severity: "warning", message: "粗点の合計が " + rawSum.toLocaleString() + " で、想定の " + expectedSum.toLocaleString() + " と一致しません（差 " + (rawSum - expectedSum).toLocaleString() + "）。" });
      }
    }

    return w;
  }

  // ---- 表示名 ----
  function bustRuleName(v) { return { belowZero: "0点未満で飛び", zeroOrBelow: "0点以下で飛び", manual: "手動判定" }[v] || v; }
  function tobiPaymentName(v) { return { winnerPlusLoserMinus: "飛ばした人+/飛んだ人-", bonusOnly: "飛ばした人のみ+" }[v] || v; }
  function roundingName(v) { return { none: "なし", roundHalfUp: "四捨五入", floor: "切り捨て", ceil: "切り上げ", goshaRokunyu: "五捨六入" }[v] || v; }
  function shugiTypeName(v) { return { none: "なし", chip: "チップ(枚)", point: "ポイント(pt)", yen: "金額(円)" }[v] || "なし"; }
  function shugiUnit(v) { return { chip: "枚", point: "pt", yen: "円" }[v] || ""; }

  return {
    MahjongType: MahjongType, TobiPaymentType: TobiPaymentType, BustRule: BustRule, RoundingRule: RoundingRule,
    playerCount: playerCount, typeName: typeName, typeShort: typeShort, seatName: seatName,
    uuid: uuid, nowISO: nowISO,
    makeRule: makeRule, defaultFourPlayerRule: defaultFourPlayerRule, defaultThreePlayerRule: defaultThreePlayerRule,
    suggestedOka: suggestedOka,
    detectBusted: detectBusted, calculate: calculate, validate: validate,
    bustRuleName: bustRuleName, tobiPaymentName: tobiPaymentName, roundingName: roundingName,
    shugiTypeName: shugiTypeName, shugiUnit: shugiUnit,
  };
})();
