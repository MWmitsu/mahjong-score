/* フェーズ6: 対局履歴・詳細（一覧・日付順・部屋/プレイヤー/種別フィルター・詳細表示）。
   編集・削除の本実装はフェーズ7。ここでは導線（ボタン）まで。 */
window.MJ = window.MJ || {};
MJ.screens = MJ.screens || {};
MJ.screens.history = function (screen) {
  "use strict";
  const S = MJ.store, D = MJ.domain, UI = MJ.ui;
  const el = UI.el;

  const filter = { roomId: "", playerId: "", type: "" };
  let listBox;

  function pname(id) { const p = S.byId("players", id); return p ? p.name : "(不明)"; }

  function allMatches() {
    return S.active("matches").slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (a.createdAt || "") < (b.createdAt || "") ? 1 : -1;
    });
  }

  // 一覧・フィルター用の選択肢（履歴に現れた部屋・プレイヤー）
  function distinctRooms() {
    const seen = {}, out = [];
    allMatches().forEach(function (m) { if (m.roomId && !seen[m.roomId]) { seen[m.roomId] = 1; out.push({ id: m.roomId, name: m.roomName || "(部屋)" }); } });
    return out;
  }
  function distinctPlayers() {
    const seen = {}, out = [];
    allMatches().forEach(function (m) { (m.results || []).forEach(function (r) { if (!seen[r.playerId]) { seen[r.playerId] = 1; out.push({ id: r.playerId, name: pname(r.playerId) }); } }); });
    return out.sort(function (a, b) { return a.name.localeCompare(b.name, "ja"); });
  }

  renderShell();

  function renderShell() {
    UI.clear(screen);
    if (allMatches().length === 0) {
      screen.appendChild(el("div", { class: "empty" }, [
        el("p", { text: "対局履歴がありません。" }),
        el("button", { class: "btn btn-primary", onclick: function () { MJ.navigate("entry"); } }, "対局を入力する"),
      ]));
      return;
    }
    screen.appendChild(filterCard());
    listBox = el("div");
    screen.appendChild(listBox);
    rebuildList();
  }

  function filterCard() {
    const roomSel = selectEl([{ value: "", label: "すべての部屋" }].concat(distinctRooms().map(function (r) { return { value: r.id, label: r.name }; })), filter.roomId, function (v) { filter.roomId = v; rebuildList(); });
    const playerSel = selectEl([{ value: "", label: "すべてのプレイヤー" }].concat(distinctPlayers().map(function (p) { return { value: p.id, label: p.name }; })), filter.playerId, function (v) { filter.playerId = v; rebuildList(); });
    const typeSel = selectEl([{ value: "", label: "3麻・4麻すべて" }, { value: D.MahjongType.four, label: "4人麻雀" }, { value: D.MahjongType.three, label: "3人麻雀" }], filter.type, function (v) { filter.type = v; rebuildList(); });
    return el("div", { class: "card" }, [
      el("h2", { text: "フィルター" }),
      el("div", { class: "filter-grid" }, [roomSel, playerSel, typeSel]),
    ]);
  }

  function rebuildList() {
    UI.clear(listBox);
    const matches = allMatches().filter(function (m) {
      if (filter.type && m.mahjongType !== filter.type) return false;
      if (filter.roomId && m.roomId !== filter.roomId) return false;
      if (filter.playerId && !(m.results || []).some(function (r) { return r.playerId === filter.playerId; })) return false;
      return true;
    });

    listBox.appendChild(el("div", { class: "menu-section-title", text: matches.length + "件" }));
    if (matches.length === 0) { listBox.appendChild(el("div", { class: "empty", text: "条件に合う対局がありません。" })); return; }

    const list = el("div", { class: "menu" });
    matches.forEach(function (m) {
      const ranked = (m.results || []).slice().sort(function (a, b) { return a.rank - b.rank; });
      const summary = el("div", { class: "result-summary small" });
      ranked.forEach(function (r) {
        summary.appendChild(el("span", { class: "rs " + UI.pointClass(r.totalPointWithoutChip) + (r.playerId === filter.playerId ? " hl" : "") },
          pname(r.playerId) + " " + UI.fmtPoint(r.totalPointWithoutChip)));
      });
      list.appendChild(el("button", { class: "tile", style: "align-items:flex-start", onclick: function () { openDetail(m); } }, [
        el("span", { style: "min-width:0; flex:1" }, [
          el("div", {}, [
            el("span", { text: UI.fmtDate(m.date) + " " + (m.roomName || "") }),
            el("span", { class: "badge " + (m.mahjongType === D.MahjongType.four ? "four" : "three"), style: "margin-left:6px", text: D.typeShort(m.mahjongType) }),
          ]),
          summary,
        ]),
        el("span", { class: "chev", text: "›" }),
      ]));
    });
    listBox.appendChild(list);
  }

  // ---- 詳細 ----
  function openDetail(m) {
    const ranked = (m.results || []).slice().sort(function (a, b) { return a.rank - b.rank; });
    const body = el("div", {});

    body.appendChild(el("div", { class: "small muted", style: "margin-bottom:8px" }, [
      el("span", { class: "badge " + (m.mahjongType === D.MahjongType.four ? "four" : "three"), text: D.typeName(m.mahjongType) }),
      el("span", { text: "　" + (m.roomName || "") + "　/　" + (m.ruleName || "") }),
    ]));

    ranked.forEach(function (r) {
      const bits = ["粗点" + r.rawScore.toLocaleString(), "素点" + UI.fmtPoint(r.basePoint), "ウマ" + UI.fmtPoint(r.umaPoint)];
      if (r.okaPoint) bits.push("オカ" + UI.fmtPoint(r.okaPoint));
      if (r.tobiBonusPoint) bits.push("飛賞" + UI.fmtPoint(r.tobiBonusPoint));
      if (r.chipCount) bits.push("チップ" + (r.chipCount > 0 ? "+" : "") + r.chipCount + "枚(" + UI.fmtYen(r.chipAmount) + ")");
      body.appendChild(el("div", { class: "detail-player" }, [
        el("span", { class: "rk", text: String(r.rank) }),
        el("span", { class: "dp-main" }, [
          el("div", { class: "dp-name", text: pname(r.playerId) + (r.isBusted ? " 💥" : "") }),
          el("div", { class: "detail-breakdown", text: bits.join(" ・ ") }),
        ]),
        el("span", { class: "dp-total num " + UI.pointClass(r.totalPointWithoutChip), text: UI.fmtPoint(r.totalPointWithoutChip) }),
      ]));
    });

    const sum = ranked.reduce(function (s, r) { return s + r.totalPointWithoutChip; }, 0);
    body.appendChild(el("div", { class: "small", style: "margin-top:8px;color:" + (Math.abs(sum) < 1e-9 ? "var(--muted)" : "var(--warn)"), text: "卓合計 " + UI.fmtPoint(sum) + (Math.abs(sum) < 1e-9 ? "（±0）" : "（箱下等）") }));

    if (m.pointToYenRate) {
      body.appendChild(el("div", { class: "small muted", style: "margin-top:4px", text: "レート " + m.pointToYenRate + "円/pt ・ チップ込み金額は各自 ポイント×レート＋チップ円" }));
    }
    if (m.memo) body.appendChild(el("div", { class: "card", style: "margin-top:12px;background:#fafafa" }, [el("div", { class: "small muted", text: "メモ" }), el("div", { text: m.memo })]));

    UI.sheet({
      title: UI.fmtDate(m.date),
      body: body,
      dismissible: true,
      actions: [
        { label: "削除", class: "btn-danger", onClick: function (c) { confirmDelete(m, c); } },
        { label: "編集", class: "btn-secondary", onClick: function (c) { c.close(); MJ._editMatchId = m.id; MJ.navigate("entry"); } },
        { label: "閉じる", class: "btn-primary", onClick: function (c) { c.close(); } },
      ],
    });
  }

  // 削除（仕様どおりの確認ダイアログ・論理削除）
  function confirmDelete(m, detailCtrl) {
    UI.confirm({
      title: "この対局結果を削除しますか？",
      message: "削除すると、この対局結果は履歴から削除され、プレイヤー成績・ランキングにも反映されなくなります。この操作は元に戻せません。",
      confirmText: "削除する",
      cancelText: "キャンセル",
      danger: true,
    }).then(function (ok) {
      if (!ok) return;
      S.softDelete("matches", m.id);
      detailCtrl.close();
      UI.toast("対局結果を削除しました");
      renderShell(); // 一覧・成績は都度計算なので自動で反映
    });
  }

  // ---- 小物 ----
  function selectEl(options, value, onChange) {
    const s = el("select");
    options.forEach(function (o) {
      const op = el("option", { value: o.value, text: o.label });
      if (o.value === value) op.selected = true;
      s.appendChild(op);
    });
    s.addEventListener("change", function () { onChange(s.value); });
    return s;
  }
};
