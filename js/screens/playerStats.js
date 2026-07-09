/* プレイヤー別成績。成績表(Session)を期間/種別/成績表でフィルタし人物別に集計。
   メイン=チップ抜きポイント。チップ・精算額は参考。種別は必ず1つ選択。 */
window.MJ = window.MJ || {};
MJ.screens = MJ.screens || {};
MJ.screens.playerStats = function (screen) {
  "use strict";
  const S = MJ.store, D = MJ.domain, UI = MJ.ui, ST = MJ.stats;
  const el = UI.el;

  const pname = UI.pname;
  function pct(x) { return (x * 100).toFixed(1) + "%"; }

  function playersWithData() {
    const seen = {}, out = [];
    S.active("sessions").forEach(function (s) { (s.hanchans || []).forEach(function (h) { (h.results || []).forEach(function (r) { if (!seen[r.playerId]) { seen[r.playerId] = 1; out.push(r.playerId); } }); }); });
    return out;
  }
  function sessionsWithData() {
    return S.active("sessions").map(function (s) { return { id: s.id, name: s.name }; });
  }

  const pids = playersWithData();
  const filter = { playerId: pids[0] || "", type: D.MahjongType.four, period: "all", customFrom: "", customTo: "", sessionId: "" };

  if (pids.length === 0) {
    screen.appendChild(el("div", { class: "empty" }, [
      el("p", { text: "成績データがありません。部屋で半荘を入力してください。" }),
      el("button", { class: "btn btn-primary", onclick: function () { MJ.navigate("rooms"); } }, "部屋を開く"),
    ]));
    return;
  }

  const filterBox = el("div"), statsBox = el("div");
  screen.appendChild(filterBox); screen.appendChild(statsBox);
  renderFilters(); rebuildStats();

  function renderFilters() {
    UI.clear(filterBox);
    const card = el("div", { class: "card" }, [el("h2", { text: "条件" })]);

    card.appendChild(UI.field("プレイヤー", selectEl(playersWithData().map(function (id) { return { value: id, label: pname(id) }; }), filter.playerId, function (v) { filter.playerId = v; rebuildStats(); })));

    const seg = el("div", { class: "segmented" });
    [{ v: D.MahjongType.four, t: "4人麻雀" }, { v: D.MahjongType.three, t: "3人麻雀" }].forEach(function (o) {
      seg.appendChild(el("button", { class: "seg" + (filter.type === o.v ? " on" : ""), onclick: function () { filter.type = o.v; renderFilters(); rebuildStats(); } }, o.t));
    });
    card.appendChild(UI.field("種別", seg));

    card.appendChild(UI.field("期間", selectEl([
      { value: "all", label: "全期間" }, { value: "today", label: "今日" }, { value: "week", label: "今週" },
      { value: "month", label: "今月" }, { value: "year", label: "今年" }, { value: "custom", label: "任意期間" },
    ], filter.period, function (v) { filter.period = v; renderFilters(); rebuildStats(); })));

    if (filter.period === "custom") {
      const from = el("input", { type: "date", value: filter.customFrom });
      from.addEventListener("change", function () { filter.customFrom = from.value; rebuildStats(); });
      const to = el("input", { type: "date", value: filter.customTo });
      to.addEventListener("change", function () { filter.customTo = to.value; rebuildStats(); });
      card.appendChild(el("div", { class: "inline-fields" }, [UI.field("開始", from), UI.field("終了", to)]));
    }

    card.appendChild(UI.field("部屋", selectEl([{ value: "", label: "すべて" }].concat(sessionsWithData().map(function (s) { return { value: s.id, label: s.name }; })), filter.sessionId, function (v) { filter.sessionId = v; rebuildStats(); })));

    filterBox.appendChild(card);
  }

  function rebuildStats() {
    UI.clear(statsBox);
    const sessions = ST.filteredSessions(filter);
    const s = ST.playerStats(sessions, filter.playerId);
    const pc = D.playerCount(filter.type);

    if (s.games === 0) {
      statsBox.appendChild(el("div", { class: "empty", text: pname(filter.playerId) + " さんの該当データがありません。" }));
      return;
    }

    statsBox.appendChild(el("div", { class: "card" }, [
      el("h2", { text: pname(filter.playerId) + " ・ " + D.typeName(filter.type) + "（チップ抜き）" }),
      el("div", { class: "big-total num " + UI.pointClass(s.total), text: UI.fmtPoint(s.total) + " pt" }),
      el("div", { class: "stat-grid" }, [box("対局数", s.games + "戦"), box("平均", UI.fmtPoint(s.avg) + "pt"), box("最高", UI.fmtPoint(s.max) + "pt"), box("最低", UI.fmtPoint(s.min) + "pt")]),
    ]));

    // ポイント推移グラフ（累計）
    statsBox.appendChild(el("div", { class: "card" }, [el("h2", { text: "ポイント推移（累計）" }), lineChart(s.cumulative)]));

    const ranks = el("div", { class: "card" }, [el("h2", { text: "順位・率" })]);
    const rankGrid = el("div", { class: "stat-grid" });
    for (let r = 1; r <= pc; r++) rankGrid.appendChild(box(r + "位", (s.rankCounts[r] || 0) + "回"));
    ranks.appendChild(rankGrid);
    ranks.appendChild(rate("平均順位", s.avgRank.toFixed(2) + "位"));
    ranks.appendChild(rate("トップ率", pct(s.topRate)));
    ranks.appendChild(rate("ラス率", pct(s.lastRate)));
    ranks.appendChild(rate("ラス回避率", pct(s.lastAvoidRate)));
    ranks.appendChild(rate("連対率", pct(s.rentaiRate)));
    statsBox.appendChild(ranks);

    const achieve = el("div", { class: "card" }, [el("h2", { text: "実績" })]);
    achieve.appendChild(rate("最高連勝（連続トップ）", s.maxTopStreak + "連勝"));
    achieve.appendChild(rate("最高連敗（連続ラス）", s.maxLastStreak + "連敗"));
    achieve.appendChild(rate("トビ回数", s.bustCount + "回"));
    achieve.appendChild(rate("役満回数", (s.yakuman || 0) + "回"));
    statsBox.appendChild(achieve);

    const chip = el("div", { class: "card" }, [el("h2", { text: "チップ・精算（参考）" })]);
    chip.appendChild(rate("チップ合計", (s.chipCount > 0 ? "+" : "") + s.chipCount + "枚"));
    chip.appendChild(rate("チップ金額", UI.fmtYen(s.chipAmount)));
    chip.appendChild(rate("精算額（pt×レート＋チップ＋役満）", UI.fmtYen(s.moneyTotal)));
    statsBox.appendChild(chip);

    const recent = el("div", { class: "card" }, [el("h2", { text: "直近10戦" })]);
    s.recent.forEach(function (g) {
      recent.appendChild(el("div", { class: "recent-item" }, [
        el("span", { class: "recent-rank rk" + g.rank, text: g.rank + "位" }),
        el("span", { class: "small muted", style: "flex:1", text: UI.fmtDate(g.date) }),
        el("span", { class: "num " + UI.pointClass(g.pt), text: UI.fmtPoint(g.pt) }),
      ]));
    });
    statsBox.appendChild(recent);
  }

  function lineChart(data) {
    if (!data || data.length < 2) return el("div", { class: "small muted", style: "padding:8px 0", text: "対局が2戦以上でグラフを表示します。" });
    const W = 320, H = 120, pad = 10;
    const vals = data.concat([0]);
    const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    const range = (max - min) || 1;
    function X(i) { return pad + (W - 2 * pad) * (i / (data.length - 1)); }
    function Y(v) { return pad + (H - 2 * pad) * (1 - (v - min) / range); }
    const pts = data.map(function (v, i) { return X(i).toFixed(1) + "," + Y(v).toFixed(1); }).join(" ");
    const zeroY = Y(0).toFixed(1);
    const last = data[data.length - 1];
    const color = last >= 0 ? "#137a2b" : "#b91c1c";
    const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none">'
      + '<line x1="' + pad + '" y1="' + zeroY + '" x2="' + (W - pad) + '" y2="' + zeroY + '" stroke="#d1d5db" stroke-width="1"/>'
      + '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2"/>'
      + '<circle cx="' + X(data.length - 1).toFixed(1) + '" cy="' + Y(last).toFixed(1) + '" r="3" fill="' + color + '"/>'
      + '</svg>';
    return el("div", { html: svg });
  }
  function box(label, value) { return el("div", { class: "stat-box" }, [el("div", { class: "label", text: label }), el("div", { class: "value", text: value })]); }
  function rate(label, value) { return el("div", { class: "rate-row" }, [el("span", { text: label }), el("span", { class: "num", text: value })]); }
  function selectEl(options, value, onChange) { return UI.select(options, value, onChange); }
};
