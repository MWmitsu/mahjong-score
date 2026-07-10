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

    // 8. playerTotals: 端数が出る配点でも精算(円)の合計は0（チップ±0のとき）
    (function () {
      if (!MJ.sheets) return;
      const r = Object.assign({}, rule3(), { bustRule: D.BustRule.manual });
      const P = ["p0", "p1", "p2"];
      const raws = { p0: 50300, p1: 30300, p2: 24400 }; // 合計105000・端数の出る配点
      const res = MJ.sheets.computeResults(r, P, raws);
      const ses = { playerIds: P, mahjongType: "three", rate: 50, chipUnit: 100, shugiType: "none",
        hanchans: [{ playerIds: P, raws: raws, results: res, shugi: null }], chips: {} };
      const t = MJ.sheets.playerTotals(ses);
      const sum = P.reduce(function (a, p) { return a + t[p].settle; }, 0);
      check("playerTotals: 精算合計=0(端数もゼロサム)", sum === 0, "実=" + sum);
    })();

    // 9. validate: 正常は警告なし／粗点合計ずれ・100点単位ずれを検出
    (function () {
      const r = rule3();
      const ok = D.validate(r, [{ playerId: "a", rawScore: 50000 }, { playerId: "b", rawScore: 35000 }, { playerId: "c", rawScore: 20000 }]);
      check("validate: 正常は警告なし", ok.length === 0, "実=" + ok.length);
      const ng = D.validate(r, [{ playerId: "a", rawScore: 50050 }, { playerId: "b", rawScore: 35000 }, { playerId: "c", rawScore: 20000 }]);
      check("validate: 合計/100点ずれを検出", ng.length >= 2, "実=" + ng.length);
      const dup = D.validate(r, [{ playerId: "a", rawScore: 50000 }, { playerId: "a", rawScore: 35000 }, { playerId: "c", rawScore: 20000 }]);
      check("validate: プレイヤー重複を検出", dup.some(function (w) { return w.message.indexOf("重複") >= 0; }), "実=" + dup.length);
    })();

    // 10. 抜け番: 出場した半荘だけ集計・各半荘ゼロサム
    (function () {
      if (!MJ.sheets || !MJ.stats) return;
      const r = Object.assign({}, rule3(), { bustRule: D.BustRule.manual });
      function mk(parts, raws) { return { playerIds: parts.slice(), raws: raws, results: MJ.sheets.computeResults(r, parts, raws), shugi: null }; }
      const H1 = mk(["p1", "p2", "p3"], { p1: 50000, p2: 35000, p3: 20000 });
      const H2 = mk(["p1", "p2", "p4"], { p1: 45000, p2: 35000, p4: 25000 });
      const ses = { playerIds: ["p1", "p2", "p3", "p4"], mahjongType: "three", rate: 50, chipUnit: 0, shugiType: "none", hanchans: [H1, H2], chips: {} };
      const z1 = H1.results.reduce(function (a, x) { return a + x.totalPointWithoutChip; }, 0);
      const z2 = H2.results.reduce(function (a, x) { return a + x.totalPointWithoutChip; }, 0);
      check("抜け番: 各半荘ゼロサム", approx(z1, 0) && approx(z2, 0), "z1=" + z1 + " z2=" + z2);
      check("抜け番: p3は1戦のみ", MJ.stats.playerStats([ses], "p3").games === 1, "実=" + MJ.stats.playerStats([ses], "p3").games);
      check("抜け番: p4は1戦のみ", MJ.stats.playerStats([ses], "p4").games === 1);
      check("抜け番: p1は2戦", MJ.stats.playerStats([ses], "p1").games === 2);
    })();

    // 11. 役満祝儀: 旧形式は抜け番の非出場者に付かない／新形式は各自値そのまま
    (function () {
      if (!MJ.sheets) return;
      const r = Object.assign({}, rule3(), { bustRule: D.BustRule.manual });
      const parts = ["p1", "p2", "p3"];
      const raws = { p1: 50000, p2: 35000, p3: 20000 };
      const base = { playerIds: parts.slice(), raws: raws, results: MJ.sheets.computeResults(r, parts, raws) };
      const legacy = Object.assign({}, base, { shugi: { winnerId: "p1", amount: 2 } });
      const ses = { playerIds: ["p1", "p2", "p3", "p4"], mahjongType: "three", rate: 50, chipUnit: 100, shugiType: "chip", hanchans: [legacy], chips: {} };
      const t = MJ.sheets.playerTotals(ses);
      check("旧祝儀: 和了者p1=+4(出場3人基準)", t.p1.shugi === 4, "実=" + t.p1.shugi);
      check("旧祝儀: 抜け番p4=0", t.p4.shugi === 0, "実=" + t.p4.shugi);
      const nv = MJ.sheets.shugiValuesOf({ shugi: { values: { p1: 2, p2: -1, p3: -1 } } }, parts);
      check("新祝儀: valuesをそのまま返す", nv.p1 === 2 && nv.p3 === -1);
    })();

    // 12. stats: トップ率・最高連勝・トビ回数
    (function () {
      if (!MJ.sheets || !MJ.stats) return;
      const r = Object.assign({}, rule4(), { bustRule: D.BustRule.manual });
      const P = ["a", "b", "c", "d"];
      function mk(raws, busted) {
        const res = MJ.sheets.computeResults(r, P, raws, null, busted ? { d: "a" } : null, busted ? { d: true } : null);
        return { playerIds: P.slice(), raws: raws, results: res, shugi: null };
      }
      const H1 = mk({ a: 40000, b: 30000, c: 20000, d: 10000 });
      const H2 = mk({ a: 45000, b: 30000, c: 25000, d: 0 }, true);
      const ses = { playerIds: P, mahjongType: "four", rate: 50, chipUnit: 0, shugiType: "none", hanchans: [H1, H2], chips: {} };
      const sa = MJ.stats.playerStats([ses], "a");
      const sd = MJ.stats.playerStats([ses], "d");
      check("stats: aは2戦・トップ率1.0", sa.games === 2 && approx(sa.topRate, 1), "games=" + sa.games + " top=" + sa.topRate);
      check("stats: aの最高連勝=2", sa.maxTopStreak === 2, "実=" + sa.maxTopStreak);
      check("stats: dのトビ回数=1", sd.bustCount === 1, "実=" + sd.bustCount);
    })();

    // 13. cloud.computePush: 変更した部屋だけ書く・削除検出
    (function () {
      if (!MJ.cloud || !MJ.cloud._internal) return;
      const CP = MJ.cloud._internal.computePush;
      const doc = { players: [{ id: "p" }], rules: [], settings: {}, schemaVersion: 3, sessions: [{ id: "s1", x: 1 }, { id: "s2", x: 2 }] };
      const p1 = CP(doc, null, {});
      check("push初回: main変更あり", p1.mainChanged === true);
      check("push初回: s1,s2を書込", p1.writes.length === 2);
      const last = { s1: JSON.stringify({ id: "s1", x: 1 }), s2: JSON.stringify({ id: "s2", x: 2 }) };
      const p2 = CP(Object.assign({}, doc, { sessions: [{ id: "s1", x: 9 }, { id: "s2", x: 2 }] }), p1.mainHash, last);
      check("push差分: main不変", p2.mainChanged === false, "実=" + p2.mainChanged);
      check("push差分: s1のみ書込", p2.writes.length === 1 && p2.writes[0].id === "s1");
      const p3 = CP(Object.assign({}, doc, { sessions: [{ id: "s1", x: 1 }] }), p1.mainHash, last);
      check("push削除: s2の削除を検出", p3.deletes.length === 1 && p3.deletes[0] === "s2");
    })();

    // 14. cloud.assembleCloud: 新形式・旧形式移行・和集合・重複優先
    (function () {
      if (!MJ.cloud || !MJ.cloud._internal) return;
      const AC = MJ.cloud._internal.assembleCloud;
      const a = AC({ players: [{ id: "p" }], rules: [], settings: {} }, [{ id: "s1" }]);
      check("assemble新形式: sessions取込・移行不要", a.sessions.length === 1 && a.migrating === false);
      const b = AC({ players: [], rules: [], sessions: [{ id: "s1" }, { id: "s2" }] }, []);
      check("assemble旧形式: main.sessions採用・要移行", b.sessions.length === 2 && b.migrating === true);
      const c = AC({ sessions: [{ id: "s1" }] }, [{ id: "s2" }]);
      check("assemble和集合: 両方マージ", c.sessions.length === 2);
      const d = AC({ sessions: [{ id: "s1", from: "main" }] }, [{ id: "s1", from: "sub" }]);
      check("assemble重複: サブコレクション優先", d.sessions.length === 1 && d.sessions[0].from === "sub");
      check("assemble空: null", AC(null, []) === null);
    })();

    const passed = cases.filter(function (c) { return c.pass; }).length;
    return { passed: passed, total: cases.length, cases: cases };
  }

  return { run: run };
})();
