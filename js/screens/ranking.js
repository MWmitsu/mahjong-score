/* ランキング。成績表(Session)の全半荘を集計し、プレイヤー横断で順位付け。
   メイン=チップ抜き、参考=精算額。種別は必ず1つ選択。 */
window.MJ = window.MJ || {};
MJ.screens = MJ.screens || {};
MJ.screens.ranking = function (screen) {
  "use strict";
  const S = MJ.store, D = MJ.domain, UI = MJ.ui, ST = MJ.stats;
  const el = UI.el;

  function pname(id) { const p = S.byId("players", id); return p ? p.name : "(不明)"; }
  function pct(x) { return (x * 100).toFixed(1) + "%"; }

  const METRICS = [
    { key: "total", label: "合計pt", get: function (s) { return s.total; }, fmt: UI.fmtPoint, dir: "desc", rate: false },
    { key: "avg", label: "平均pt", get: function (s) { return s.avg; }, fmt: UI.fmtPoint, dir: "desc", rate: false },
    { key: "topRate", label: "トップ率", get: function (s) { return s.topRate; }, fmt: pct, dir: "desc", rate: true },
    { key: "avgRank", label: "平均順位", get: function (s) { return s.avgRank; }, fmt: function (v) { return v.toFixed(2) + "位"; }, dir: "asc", rate: true },
    { key: "lastAvoid", label: "ラス回避率", get: function (s) { return s.lastAvoidRate; }, fmt: pct, dir: "desc", rate: true },
    { key: "money", label: "精算額(参考)", get: function (s) { return s.moneyTotal; }, fmt: UI.fmtYen, dir: "desc", rate: false },
  ];

  const filter = { type: D.MahjongType.four, period: "all", customFrom: "", customTo: "", sessionId: "", metric: "total" };

  function sessionsWithData() { return S.active("sessions").map(function (s) { return { id: s.id, name: s.name }; }); }

  if (S.active("sessions").length === 0) {
    screen.appendChild(el("div", { class: "empty" }, [
      el("p", { text: "対局データがありません。" }),
      el("button", { class: "btn btn-primary", onclick: function () { MJ.navigate("rooms"); } }, "部屋を開く"),
    ]));
    return;
  }

  const filterBox = el("div"), listBox = el("div");
  screen.appendChild(filterBox); screen.appendChild(listBox);
  renderFilters(); rebuildList();

  function renderFilters() {
    UI.clear(filterBox);
    const card = el("div", { class: "card" }, [el("h2", { text: "条件" })]);

    const seg = el("div", { class: "segmented" });
    [{ v: D.MahjongType.four, t: "4人麻雀" }, { v: D.MahjongType.three, t: "3人麻雀" }].forEach(function (o) {
      seg.appendChild(el("button", { class: "seg" + (filter.type === o.v ? " on" : ""), onclick: function () { filter.type = o.v; renderFilters(); rebuildList(); } }, o.t));
    });
    card.appendChild(UI.field("種別", seg));

    card.appendChild(UI.field("期間", selectEl([{ value: "all", label: "全期間" }, { value: "month", label: "今月" }, { value: "custom", label: "任意期間" }], filter.period, function (v) { filter.period = v; renderFilters(); rebuildList(); })));
    if (filter.period === "custom") {
      const from = el("input", { type: "date", value: filter.customFrom });
      from.addEventListener("change", function () { filter.customFrom = from.value; rebuildList(); });
      const to = el("input", { type: "date", value: filter.customTo });
      to.addEventListener("change", function () { filter.customTo = to.value; rebuildList(); });
      card.appendChild(el("div", { class: "inline-fields" }, [UI.field("開始", from), UI.field("終了", to)]));
    }
    card.appendChild(UI.field("部屋", selectEl([{ value: "", label: "すべて" }].concat(sessionsWithData().map(function (s) { return { value: s.id, label: s.name }; })), filter.sessionId, function (v) { filter.sessionId = v; rebuildList(); })));

    const chips = el("div", { class: "metric-chips" });
    METRICS.forEach(function (m) { chips.appendChild(el("button", { class: "metric-chip" + (filter.metric === m.key ? " on" : ""), onclick: function () { filter.metric = m.key; renderFilters(); rebuildList(); } }, m.label)); });
    card.appendChild(UI.field("ランキング", chips));

    filterBox.appendChild(card);
  }

  function rebuildList() {
    UI.clear(listBox);
    const metric = METRICS.filter(function (m) { return m.key === filter.metric; })[0];
    const sessions = ST.filteredSessions(filter);

    const pidSet = {};
    sessions.forEach(function (s) { (s.hanchans || []).forEach(function (h) { (h.results || []).forEach(function (r) { pidSet[r.playerId] = 1; }); }); });
    const rows = Object.keys(pidSet).map(function (pid) { return { pid: pid, s: ST.playerStats(sessions, pid) }; }).filter(function (r) { return r.s.games > 0; });

    rows.sort(function (a, b) {
      const va = metric.get(a.s), vb = metric.get(b.s);
      if (va === vb) return b.s.games - a.s.games;
      return metric.dir === "asc" ? va - vb : vb - va;
    });

    const header = metric.label + (metric.key === "money" ? "（参考ランキング）" : "（メイン・チップ抜き）");
    const card = el("div", { class: "card" }, [el("h2", { text: header })]);
    if (rows.length === 0) { card.appendChild(el("div", { class: "empty", text: "該当データがありません。" })); listBox.appendChild(card); return; }

    rows.forEach(function (row, i) {
      const pos = i + 1;
      const v = metric.get(row.s);
      card.appendChild(el("div", { class: "rank-row" }, [
        el("span", { class: "rank-pos p" + pos, text: String(pos) }),
        el("span", { class: "rank-name", text: pname(row.pid) }),
        el("span", { class: "rank-games", text: row.s.games + "戦" }),
        el("span", { class: "rank-val num " + (metric.rate ? "" : UI.pointClass(v)), text: metric.fmt(v) }),
      ]));
    });
    listBox.appendChild(card);
  }

  function selectEl(options, value, onChange) {
    const sel = el("select");
    options.forEach(function (o) { const op = el("option", { value: o.value, text: o.label }); if (o.value === value) op.selected = true; sel.appendChild(op); });
    sel.addEventListener("change", function () { onChange(sel.value); });
    return sel;
  }
};
