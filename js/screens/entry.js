/* フェーズ5: 対局入力（最重要・カード式）。
   1ゲーム終了後の最終粗点を入力 → 自動計算プレビュー → 同点解決(手動) → 飛び賞 → チップ → 確認 → 保存。
   起家・席順は任意。同点はユーザーが上位を選ぶ。 */
window.MJ = window.MJ || {};
MJ.screens = MJ.screens || {};
MJ.screens.entry = function (screen) {
  "use strict";
  const S = MJ.store, D = MJ.domain, UI = MJ.ui;
  const el = UI.el;

  // ---- 状態 ----
  const activeRooms = S.active("rooms").filter(function (r) { return r.isActive; });
  const state = {
    date: new Date().toISOString().slice(0, 10),
    roomId: activeRooms.length === 1 ? activeRooms[0].id : null,
    participantIds: [],
    seatsEnabled: false,
    seats: {},          // pid -> 0..3
    dealerId: null,
    scores: {},         // pid -> string
    chips: {},          // pid -> string
    tieChoice: {},      // scoreValue -> [pid ordered, 上位から]
    busters: {},        // bustedPid -> busterPid
    memo: "",
  };

  // 編集モード（履歴の「編集」から MJ._editMatchId 経由で渡される）
  let editing = false, editOriginal = null;
  (function loadEdit() {
    const id = MJ._editMatchId; MJ._editMatchId = null;
    if (!id) return;
    const m = S.byId("matches", id);
    if (!m || m.isDeleted) return;
    editing = true; editOriginal = Object.assign({}, m);
    state.date = (m.date || "").slice(0, 10) || state.date;
    state.roomId = m.roomId;
    const rs = (m.results || []).slice().sort(function (a, b) { return a.seatOrder - b.seatOrder; });
    state.participantIds = rs.map(function (r) { return r.playerId; });
    state.seatsEnabled = rs.some(function (r) { return r.isDealerStart; });
    rs.forEach(function (r) {
      state.scores[r.playerId] = String(r.rawScore);
      state.chips[r.playerId] = r.chipCount ? String(r.chipCount) : "";
      state.seats[r.playerId] = r.seatOrder;
      if (r.isDealerStart) state.dealerId = r.playerId;
      if (r.isBusted && r.bustedByPlayerId) state.busters[r.playerId] = r.bustedByPlayerId;
    });
    const byScore = {};
    rs.forEach(function (r) { const k = String(r.rawScore); (byScore[k] = byScore[k] || []).push(r); });
    Object.keys(byScore).forEach(function (k) {
      if (byScore[k].length > 1) state.tieChoice[k] = byScore[k].slice().sort(function (a, b) { return a.rank - b.rank; }).map(function (r) { return r.playerId; });
    });
    state.memo = m.memo || "";
  })();

  let dynTop, dynBottom; // 再計算で差し替える領域

  function room() { return state.roomId ? S.byId("rooms", state.roomId) : null; }
  function rule() { const rm = room(); return rm && rm.ruleSetId ? S.byId("rules", rm.ruleSetId) : null; }
  function gameSize() { const rm = room(); return rm ? D.playerCount(rm.mahjongType) : 4; }
  function pname(id) { const p = S.byId("players", id); return p ? p.name : "(不明)"; }
  function numScore(pid) { const v = state.scores[pid]; if (v === "" || v == null) return null; const n = parseInt(v, 10); return isNaN(n) ? null : n; }
  function numChip(pid) { const v = state.chips[pid]; if (v === "" || v == null) return 0; const n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

  renderShell();

  // ===== シェル（構造変化時に全再描画） =====
  function renderShell() {
    UI.clear(screen);

    if (editing) {
      screen.appendChild(el("div", { class: "card", style: "background:#fff7e6;border-color:var(--warn)" }, [
        el("div", { class: "small", style: "color:var(--warn)", text: "この対局を編集中です。保存すると上書きされ、成績・ランキングが再計算されます。" }),
      ]));
    }

    if (activeRooms.length === 0 && !editing) {
      screen.appendChild(el("div", { class: "empty" }, [
        el("p", { text: "有効な部屋がありません。" }),
        el("button", { class: "btn btn-primary", onclick: function () { MJ.navigate("rooms"); } }, "部屋を作成する"),
      ]));
      return;
    }

    // 1. 日付・部屋
    screen.appendChild(cardDateRoom());
    if (!state.roomId) return;

    if (!rule()) {
      screen.appendChild(el("div", { class: "card" }, [el("div", { class: "small", style: "color:var(--warn)", text: "この部屋にルールが設定されていません。部屋管理で使用ルールを設定してください。" })]));
      return;
    }

    // 2. 参加者
    screen.appendChild(cardParticipants());

    if (state.participantIds.length !== gameSize()) {
      screen.appendChild(el("div", { class: "card" }, [el("div", { class: "small muted", text: "参加者を" + gameSize() + "人ちょうど選ぶと、粗点入力に進めます。" })]));
      return;
    }

    // 3. 席順・起家（任意）
    screen.appendChild(cardSeats());
    // 4. 粗点入力（永続）
    screen.appendChild(cardScores());
    // 5-6. 動的領域（プレビュー・同点・飛び賞）
    dynTop = el("div");
    screen.appendChild(dynTop);
    // 7. チップ（永続）
    screen.appendChild(cardChips());
    // 8-9. 動的領域（結果・警告・保存）
    dynBottom = el("div");
    screen.appendChild(dynBottom);

    refreshDynamic();
  }

  // ===== カード: 日付・部屋 =====
  function cardDateRoom() {
    const dateInput = el("input", { type: "date", value: state.date });
    dateInput.addEventListener("change", function () { state.date = dateInput.value; });

    const roomSel = el("select");
    roomSel.appendChild(el("option", { value: "", text: "部屋を選択…" }));
    const roomList = activeRooms.slice();
    if (state.roomId && !roomList.some(function (rm) { return rm.id === state.roomId; })) {
      const cur = room(); if (cur) roomList.unshift(cur);
    }
    roomList.forEach(function (rm) {
      const op = el("option", { value: rm.id, text: rm.name + "（" + D.typeShort(rm.mahjongType) + "）" });
      if (rm.id === state.roomId) op.selected = true;
      roomSel.appendChild(op);
    });
    roomSel.addEventListener("change", function () {
      state.roomId = roomSel.value || null;
      state.participantIds = []; state.scores = {}; state.chips = {};
      state.seats = {}; state.dealerId = null; state.seatsEnabled = false;
      state.tieChoice = {}; state.busters = {};
      renderShell();
    });

    return el("div", { class: "card" }, [
      el("h2", { text: "対局" }),
      UI.field("日付", dateInput),
      UI.field("部屋", roomSel),
    ]);
  }

  // ===== カード: 参加者選択 =====
  function cardParticipants() {
    const rm = room();
    const gs = gameSize();
    const members = (rm.memberPlayerIds || []).map(function (id) { return S.byId("players", id); })
      .filter(function (p) { return p && (p.isActive || state.participantIds.indexOf(p.id) >= 0); });

    const counter = el("div", { class: "small", style: "margin-bottom:6px" });
    function updateCounter() {
      counter.textContent = "選択 " + state.participantIds.length + " / " + gs + "人";
      counter.style.color = state.participantIds.length === gs ? "var(--pos)" : "var(--warn)";
    }

    const listBox = el("div", { class: "check-list" });
    if (members.length === 0) {
      listBox.appendChild(el("div", { class: "small muted", style: "padding:12px" }, [
        "この部屋に有効なプレイヤーがいません。部屋管理で登録してください。",
      ]));
    } else {
      members.forEach(function (p) {
        const cb = el("input", { type: "checkbox" });
        cb.checked = state.participantIds.indexOf(p.id) >= 0;
        cb.addEventListener("change", function () {
          if (cb.checked) {
            if (state.participantIds.indexOf(p.id) < 0) state.participantIds.push(p.id);
          } else {
            state.participantIds = state.participantIds.filter(function (x) { return x !== p.id; });
            delete state.scores[p.id]; delete state.chips[p.id]; delete state.busters[p.id];
          }
          // ちょうど人数が揃った/崩れたら下部を作り直す
          renderShell();
        });
        listBox.appendChild(el("label", { class: "check-item" }, [
          el("span", { text: p.name || "(名称未設定)" }), cb,
        ]));
      });
    }
    updateCounter();

    return el("div", { class: "card" }, [el("h2", { text: "参加者（" + gs + "人）" }), counter, listBox]);
  }

  // ===== カード: 席順・起家（任意・折りたたみ） =====
  function cardSeats() {
    const head = el("label", { class: "switch-row" }, [
      el("span", {}, [el("div", { text: "席順・起家を設定（任意）" }), el("div", { class: "small muted", text: "同点時の初期並びに使えます。未設定でもOK" })]),
      (function () { const c = el("input", { type: "checkbox" }); c.checked = state.seatsEnabled; c.addEventListener("change", function () { state.seatsEnabled = c.checked; renderShell(); }); return c; })(),
    ]);
    const card = el("div", { class: "card" }, [head]);
    if (!state.seatsEnabled) return card;

    state.participantIds.forEach(function (pid, idx) {
      if (state.seats[pid] == null) state.seats[pid] = idx;
      const seatSel = el("select");
      [0, 1, 2, 3].slice(0, gameSize()).forEach(function (s) {
        const op = el("option", { value: s, text: D.seatName(s) });
        if (state.seats[pid] === s) op.selected = true;
        seatSel.appendChild(op);
      });
      seatSel.addEventListener("change", function () { state.seats[pid] = parseInt(seatSel.value, 10); refreshDynamic(); });

      const dealer = el("input", { type: "radio", name: "dealer" });
      dealer.checked = state.dealerId === pid;
      dealer.addEventListener("change", function () { state.dealerId = pid; refreshDynamic(); });

      card.appendChild(el("div", { class: "seat-row" }, [
        el("span", { class: "seat-name", text: pname(pid) }),
        seatSel,
        el("label", { class: "dealer-pick" }, [dealer, el("span", { text: "起家" })]),
      ]));
    });
    return card;
  }

  // ===== カード: 粗点入力（永続） =====
  function cardScores() {
    const card = el("div", { class: "card" }, [el("h2", { text: "最終粗点（カンマなし・半角／マイナス可）" })]);
    state.participantIds.forEach(function (pid) {
      const inp = el("input", { type: "number", inputmode: "numeric", placeholder: "例: 25000" });
      inp.value = state.scores[pid] != null ? state.scores[pid] : "";
      inp.addEventListener("input", function () { state.scores[pid] = inp.value; refreshDynamic(); });
      const sign = el("button", { class: "sign-btn", title: "符号反転", onclick: function () {
        const n = parseInt(inp.value, 10);
        if (!isNaN(n)) { inp.value = String(-n); state.scores[pid] = inp.value; refreshDynamic(); }
      } }, "±");
      card.appendChild(el("div", { class: "score-row" }, [
        el("span", { class: "score-name", text: pname(pid) }),
        inp, sign,
      ]));
    });
    return card;
  }

  // ===== カード: チップ入力（永続） =====
  function cardChips() {
    const card = el("div", { class: "card" }, [el("h2", { text: "チップ枚数（±可・任意）" })]);
    state.participantIds.forEach(function (pid) {
      const inp = el("input", { type: "number", inputmode: "numeric", placeholder: "0" });
      inp.value = state.chips[pid] != null ? state.chips[pid] : "";
      inp.addEventListener("input", function () { state.chips[pid] = inp.value; refreshDynamic(); });
      card.appendChild(el("div", { class: "score-row" }, [
        el("span", { class: "score-name", text: pname(pid) }),
        inp, el("span", { class: "unit", text: "枚" }),
      ]));
    });
    return card;
  }

  // ===== 同点グループの順序 =====
  function orderedTieGroup(scoreKey, group) {
    const choice = state.tieChoice[scoreKey];
    if (choice && choice.length === group.length && choice.every(function (id) { return group.indexOf(id) >= 0; })) {
      return choice.slice();
    }
    const gs = gameSize();
    const dealerSeat = state.dealerId != null && state.seats[state.dealerId] != null ? state.seats[state.dealerId] : 0;
    return group.slice().sort(function (a, b) {
      if (state.seatsEnabled) {
        const da = (((state.seats[a] || 0) - dealerSeat) % gs + gs) % gs;
        const db = (((state.seats[b] || 0) - dealerSeat) % gs + gs) % gs;
        if (da !== db) return da - db;
      }
      return state.participantIds.indexOf(a) - state.participantIds.indexOf(b);
    });
  }

  function computeTieBreaks() {
    const byScore = {};
    state.participantIds.forEach(function (pid) {
      const s = numScore(pid); const key = String(s == null ? "_" : s);
      (byScore[key] = byScore[key] || []).push(pid);
    });
    const tb = {};
    Object.keys(byScore).forEach(function (key) {
      const group = byScore[key];
      if (group.length === 1) { tb[group[0]] = 0; return; }
      orderedTieGroup(key, group).forEach(function (pid, i) { tb[pid] = i; });
    });
    return { tb: tb, groups: byScore };
  }

  function buildInputs(tb, withBusters) {
    return state.participantIds.map(function (pid, idx) {
      const s = numScore(pid);
      return {
        playerId: pid,
        rawScore: s == null ? 0 : s,
        seatOrder: state.seatsEnabled && state.seats[pid] != null ? state.seats[pid] : idx,
        isDealerStart: state.seatsEnabled && state.dealerId === pid,
        chipCount: numChip(pid),
        tieBreak: tb[pid],
        bustedByPlayerId: withBusters ? (state.busters[pid] || null) : null,
      };
    });
  }

  // ===== 動的領域の再描画 =====
  function refreshDynamic() {
    if (!dynTop || !dynBottom) return;
    UI.clear(dynTop); UI.clear(dynBottom);
    const r = rule();
    const gs = gameSize();

    const tie = computeTieBreaks();
    const pass1 = D.calculate(r, buildInputs(tie.tb, false));
    const topPid = (pass1.filter(function (x) { return x.rank === 1; })[0] || {}).playerId;

    // 飛び賞の初期候補＝1位（未設定/無効なら）
    pass1.forEach(function (x) {
      if (x.isBusted) {
        const cur = state.busters[x.playerId];
        const valid = cur && cur !== x.playerId && state.participantIds.indexOf(cur) >= 0;
        if (!valid) state.busters[x.playerId] = topPid;
      }
    });

    const results = D.calculate(r, buildInputs(tie.tb, true));
    const byRank = results.slice().sort(function (a, b) { return a.rank - b.rank; });

    // --- 同点解決カード ---
    const tieGroups = Object.keys(tie.groups).filter(function (k) { return k !== "_" && tie.groups[k].length > 1; });
    if (tieGroups.length > 0) {
      const tcard = el("div", { class: "card", style: "border-color:var(--warn)" }, [el("h2", { text: "同点：上位から順に並べてください" })]);
      tieGroups.forEach(function (key) {
        const ordered = orderedTieGroup(key, tie.groups[key]);
        tcard.appendChild(el("div", { class: "small muted", style: "margin:4px 0", text: Number(key).toLocaleString() + "点で同点" }));
        ordered.forEach(function (pid, i) {
          tcard.appendChild(el("div", { class: "tie-row" }, [
            el("span", { class: "tie-pos", text: "上位" + (i + 1) }),
            el("span", { class: "tie-name", text: pname(pid) }),
            el("button", { class: "mini-btn", disabled: i === 0 ? "" : null, onclick: function () { moveTie(key, ordered, i, -1); } }, "▲"),
            el("button", { class: "mini-btn", disabled: i === ordered.length - 1 ? "" : null, onclick: function () { moveTie(key, ordered, i, 1); } }, "▼"),
          ]));
        });
      });
      dynTop.appendChild(tcard);
    }

    // --- プレビュー ---
    const table = el("table", { class: "grid" });
    table.appendChild(el("tr", {}, [th("順"), th("名前"), th("粗点"), th("素点"), th("ウマ"), th("オカ"), th("飛賞"), th("合計")]));
    byRank.forEach(function (x) {
      table.appendChild(el("tr", {}, [
        td(String(x.rank)), td(pname(x.playerId), true),
        td(x.rawScore.toLocaleString()), td(UI.fmtPoint(x.basePoint)),
        td(UI.fmtPoint(x.umaPoint)), td(x.okaPoint ? UI.fmtPoint(x.okaPoint) : "-"),
        td(x.tobiBonusPoint ? UI.fmtPoint(x.tobiBonusPoint) : "-"),
        tdPoint(x.totalPointWithoutChip),
      ]));
    });
    dynTop.appendChild(el("div", { class: "card" }, [el("h2", { text: "自動計算プレビュー" }), table]));

    // --- 飛び賞 ---
    const busted = results.filter(function (x) { return x.isBusted; });
    if (r.hasTobiBonus && busted.length > 0) {
      const bcard = el("div", { class: "card" }, [el("h2", { text: "飛び賞（飛ばした人を選択）" })]);
      busted.forEach(function (x) {
        const sel = el("select");
        state.participantIds.filter(function (pid) { return pid !== x.playerId; }).forEach(function (pid) {
          const op = el("option", { value: pid, text: pname(pid) });
          if (state.busters[x.playerId] === pid) op.selected = true;
          sel.appendChild(op);
        });
        sel.addEventListener("change", function () { state.busters[x.playerId] = sel.value; refreshDynamic(); });
        bcard.appendChild(el("div", { class: "tobi-row" }, [
          el("span", {}, [el("b", { text: pname(x.playerId) }), el("span", { class: "small muted", text: " が飛び（" + x.rawScore.toLocaleString() + "点）" })]),
          el("span", { class: "small muted", text: "飛ばした人:" }), sel,
        ]));
      });
      dynTop.appendChild(bcard);
    }

    // --- 結果確認 ---
    const rcard = el("div", { class: "card" }, [el("h2", { text: "最終結果" })]);
    const rtable = el("table", { class: "grid" });
    const rate = r.pointToYenRate;
    const head = [th("名前"), th("チップ抜き"), th("チップ"), th("枚")];
    if (rate) head.push(th("込み(円)"));
    rtable.appendChild(el("tr", {}, head));
    byRank.forEach(function (x) {
      const row = [td(pname(x.playerId), true), tdPoint(x.totalPointWithoutChip),
        td(x.chipCount ? (x.chipCount > 0 ? "+" : "") + x.chipCount + "枚" : "-"), td(x.chipAmount ? UI.fmtYen(x.chipAmount) : "-")];
      if (rate) {
        const yen = Math.round(x.totalPointWithoutChip * rate) + x.chipAmount;
        row.push(tdYen(yen));
      }
      rtable.appendChild(el("tr", {}, row));
    });
    rcard.appendChild(rtable);

    const sum = results.reduce(function (s, x) { return s + x.totalPointWithoutChip; }, 0);
    const sumNote = Math.abs(sum) < 1e-9 ? "卓合計 ±0（健全）" : "卓合計 " + UI.fmtPoint(sum) + "（" + (r.noNegativeSettlement ? "箱下のため0になりません" : "入力を確認してください") + "）";
    rcard.appendChild(el("div", { class: "small " + (Math.abs(sum) < 1e-9 ? "muted" : ""), style: "margin-top:8px;" + (Math.abs(sum) < 1e-9 ? "" : "color:var(--warn)"), text: sumNote }));
    dynBottom.appendChild(rcard);

    // --- メモ ---
    const memoInput = el("textarea", { placeholder: "メモ（任意）" });
    memoInput.value = state.memo;
    memoInput.addEventListener("input", function () { state.memo = memoInput.value; });
    dynBottom.appendChild(el("div", { class: "card" }, [el("h2", { text: "メモ" }), memoInput]));

    // --- 警告 ---
    const warnings = collectWarnings(r, tie);
    if (warnings.length > 0) {
      const wcard = el("div", { class: "card", style: "border-color:var(--warn)" }, [el("h2", { style: "color:var(--warn)", text: "確認（保存はできます）" })]);
      warnings.forEach(function (w) { wcard.appendChild(el("div", { class: "small", style: "margin:3px 0;color:" + (w.severity === "warning" ? "var(--warn)" : "var(--muted)"), text: "• " + w.message })); });
      dynBottom.appendChild(wcard);
    }

    // --- 保存 ---
    dynBottom.appendChild(el("button", { class: "btn btn-primary", style: "margin-top:4px", onclick: function () { trySave(r, results, warnings); } }, editing ? "対局を更新" : "この対局を保存"));
  }

  function collectWarnings(r, tie) {
    const inputs = buildInputs(tie.tb, true);
    const w = MJ.domain.validate(r, inputs);
    // 未入力の粗点
    const missing = state.participantIds.some(function (pid) { return numScore(pid) == null; });
    if (missing) w.unshift({ severity: "warning", message: "粗点が未入力のプレイヤーがいます。" });
    return w;
  }

  function moveTie(key, ordered, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    const arr = ordered.slice();
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    state.tieChoice[key] = arr;
    refreshDynamic();
  }

  function trySave(r, results, warnings) {
    function doSave() {
      const rm = room();
      const base = editing && editOriginal
        ? Object.assign({}, editOriginal)
        : { id: D.uuid(), isSample: false, createdAt: D.nowISO() };
      const match = Object.assign(base, {
        date: new Date(state.date + "T12:00:00").toISOString(),
        roomId: rm.id, roomName: rm.name,
        ruleSetId: r.id, ruleName: r.name,
        mahjongType: rm.mahjongType, playerCount: gameSize(),
        pointToYenRate: r.pointToYenRate,
        memo: state.memo, isDeleted: false, deletedAt: null,
        updatedAt: D.nowISO(),
        results: results.map(function (x) { return Object.assign({}, x); }),
      });
      S.upsert("matches", match);
      UI.toast(editing ? "対局を更新しました" : "対局を保存しました");
      MJ.navigate(editing ? "history" : "home");
    }
    const blocking = warnings.filter(function (w) { return w.severity === "warning"; });
    if (blocking.length > 0) {
      UI.confirm({
        title: "確認して保存",
        message: "次の点を確認してください:\n" + blocking.map(function (w) { return "• " + w.message; }).join("\n"),
        confirmText: "保存する", cancelText: "戻る",
      }).then(function (ok) { if (ok) doSave(); });
    } else {
      doSave();
    }
  }

  // ---- 小物 ----
  function th(t) { return el("th", { text: t }); }
  function td(t, left) { return el("td", left ? { text: t, style: "text-align:left" } : { text: t }); }
  function tdPoint(n) { return el("td", { class: "num " + UI.pointClass(n), text: UI.fmtPoint(n) }); }
  function tdYen(n) { return el("td", { class: "num " + UI.pointClass(n), text: UI.fmtYen(n) }); }
};
