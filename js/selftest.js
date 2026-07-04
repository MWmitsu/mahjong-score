/* 点数計算の自己テスト。期待値は手計算で検証済み（Swift版テストと同一ケース）。
   アプリ内「開発ツール」から実行し、結果を画面表示する。 */
window.MJ = window.MJ || {};
MJ.selftest = (function () {
  "use strict";
  const D = MJ.domain;

  function rule4() {
    return D.makeRule({ name: "t4", mahjongType: D.MahjongType.four, initialScore: 25000, returnScore: 30000, okaPoint: 20, umaPoints: [20, 10, -10, -20] });
  }
  function rule3() {
    return D.makeRule({ name: "t3", mahjongType: D.MahjongType.three, initialScore: 35000, returnScore: 40000, okaPoint: 15, umaPoints: [40, 0, -40] });
  }
  function inputs(scores) {
    return scores.map(function (s, i) { return { playerId: "p" + i, rawScore: s, seatOrder: i, isDealerStart: i === 0, chipCount: 0 }; });
  }
  function bySeat(res, seat) { return res.find(function (r) { return r.seatOrder === seat; }); }
  function approx(a, b) { return Math.abs(a - b) < 1e-6; }

  function run() {
    const cases = [];
    function check(name, cond, detail) { cases.push({ name: name, pass: !!cond, detail: detail || "" }); }

    // 1. 4麻 飛びなし → ゼロサム
    (function () {
      const r = D.calculate(rule4(), inputs([42000, 31000, 18000, 9000]));
      const sum = r.reduce(function (s, x) { return s + x.totalPointWithoutChip; }, 0);
      check("4麻 飛びなし: 1位=52", approx(bySeat(r, 0).totalPointWithoutChip, 52), "実=" + bySeat(r, 0).totalPointWithoutChip);
      check("4麻 飛びなし: 4位=-41", approx(bySeat(r, 3).totalPointWithoutChip, -41));
      check("4麻 飛びなし: 卓合計=0", approx(sum, 0), "実=" + sum);
    })();

    // 2. 4麻 飛びあり → 箱下フロアで +1 の非ゼロサム
    (function () {
      const ins = inputs([55000, 30000, 16000, -1000]);
      ins[3].bustedByPlayerId = ins[0].playerId;
      const r = D.calculate(rule4(), ins);
      const sum = r.reduce(function (s, x) { return s + x.totalPointWithoutChip; }, 0);
      check("4麻 飛び: 4位の精算粗点=0", bySeat(r, 3).settlementScore === 0);
      check("4麻 飛び: 1位=75", approx(bySeat(r, 0).totalPointWithoutChip, 75), "実=" + bySeat(r, 0).totalPointWithoutChip);
      check("4麻 飛び: 4位=-60", approx(bySeat(r, 3).totalPointWithoutChip, -60));
      check("4麻 飛び: 卓合計=+1(箱下)", approx(sum, 1), "実=" + sum);
    })();

    // 3. 4麻 同点 → 起家に近い席が上位
    (function () {
      const r = D.calculate(rule4(), inputs([30000, 30000, 25000, 15000]));
      check("4麻 同点: seat0が1位", bySeat(r, 0).rank === 1);
      check("4麻 同点: seat1が2位", bySeat(r, 1).rank === 2);
      check("4麻 同点: オカは1位のみ", bySeat(r, 0).okaPoint === 20 && bySeat(r, 1).okaPoint === 0);
    })();

    // 3b. 同点: tieBreak で手動指定（席順と逆でも反映）
    (function () {
      const ins = inputs([30000, 30000, 25000, 15000]);
      ins[0].tieBreak = 1; ins[1].tieBreak = 0; // seat1 を上位に手動指定
      const r = D.calculate(rule4(), ins);
      check("同点手動: seat1が1位", bySeat(r, 1).rank === 1);
      check("同点手動: seat0が2位", bySeat(r, 0).rank === 2);
      check("同点手動: 1位(seat1)がオカ取得", bySeat(r, 1).okaPoint === 20 && bySeat(r, 0).okaPoint === 0);
    })();

    // 4. 3麻 飛びなし → ゼロサム
    (function () {
      const r = D.calculate(rule3(), inputs([50000, 35000, 20000]));
      const sum = r.reduce(function (s, x) { return s + x.totalPointWithoutChip; }, 0);
      check("3麻: 1位=65", approx(bySeat(r, 0).totalPointWithoutChip, 65), "実=" + bySeat(r, 0).totalPointWithoutChip);
      check("3麻: 3位=-60", approx(bySeat(r, 2).totalPointWithoutChip, -60));
      check("3麻: 卓合計=0", approx(sum, 0), "実=" + sum);
    })();

    // 5. 飛び賞: 1人が2人を飛ばすと人数分加算
    (function () {
      const r = D.makeRule({ name: "t", mahjongType: D.MahjongType.four, initialScore: 25000, returnScore: 30000, okaPoint: 20, umaPoints: [20, 10, -10, -20], noNegativeSettlement: false });
      const ins = inputs([60000, 41000, -500, -500]);
      ins[2].bustedByPlayerId = ins[0].playerId;
      ins[3].bustedByPlayerId = ins[0].playerId;
      const res = D.calculate(r, ins);
      check("飛び賞: 1位 +20(2人分)", approx(bySeat(res, 0).tobiBonusPoint, 20), "実=" + bySeat(res, 0).tobiBonusPoint);
      check("飛び賞: 飛んだ人 各-10", approx(bySeat(res, 2).tobiBonusPoint, -10) && approx(bySeat(res, 3).tobiBonusPoint, -10));
    })();

    // 6. チップ: レート設定時の pt 換算
    (function () {
      const r = D.makeRule({ name: "t", mahjongType: D.MahjongType.four, initialScore: 25000, returnScore: 30000, okaPoint: 20, umaPoints: [20, 10, -10, -20], pointToYenRate: 50 });
      const ins = inputs([42000, 31000, 18000, 9000]);
      ins[0].chipCount = 2; // 400円 = 8pt
      const res = D.calculate(r, ins);
      const p1 = bySeat(res, 0);
      check("チップ: 金額=400", p1.chipAmount === 400);
      check("チップ: 込みpt差=+8", approx(p1.totalPointWithChip - p1.totalPointWithoutChip, 8), "実=" + (p1.totalPointWithChip - p1.totalPointWithoutChip));
    })();

    // 7. computeResults: トップ＝残り（下位合計の符号反転）で卓合計は箱下でも必ず0
    (function () {
      if (!MJ.sheets) return;
      const r = Object.assign({}, rule3(), { bustRule: D.BustRule.manual });
      const P = ["p0", "p1", "p2"];
      const raws = { p0: 70000, p1: 40000, p2: -5000 }; // 合計105000・p2が箱下
      const res = MJ.sheets.computeResults(r, P, raws);
      const sum = res.reduce(function (s, x) { return s + x.totalPointWithoutChip; }, 0);
      const top = res.filter(function (x) { return x.rank === 1; })[0];
      check("computeResults: 卓合計=0(箱下でもトップが残りを負う)", approx(sum, 0), "実=" + sum);
      check("computeResults: トップ=+80(箱下の残りを負う)", top && approx(top.totalPointWithoutChip, 80), "実=" + (top && top.totalPointWithoutChip));
    })();

    const passed = cases.filter(function (c) { return c.pass; }).length;
    return { passed: passed, total: cases.length, cases: cases };
  }

  return { run: run };
})();
