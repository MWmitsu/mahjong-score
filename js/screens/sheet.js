/* 成績表シート（1部屋）。表＝行が半荘・列がプレイヤー。上部にレート、最終行にチップ、精算。
   半荘追加はシンプル入力（粗点だけ）。0点(飛び)・同点のときだけ確認ポップアップ。 */
window.MJ = window.MJ || {};
MJ.screens = MJ.screens || {};
MJ.screens.sheet = function (screen) {
  "use strict";
  const S = MJ.store, D = MJ.domain, UI = MJ.ui, SH = MJ.sheets;
  const el = UI.el;

  const session = MJ._sessionId ? S.byId("sessions", MJ._sessionId) : null;
  if (!session || session.isDeleted) {
    screen.appendChild(el("div", { class: "empty", text: "成績表が見つかりません。" }));
    return;
  }
  const rule = S.byId("rules", session.ruleSetId);
  const pids = session.playerIds || [];
  function pname(id) { const p = S.byId("players", id); return p ? p.name : "(不明)"; }
  // 飛びは事前に決めず、0点以下の入力時に「飛んだ？」と確認して手動で決める。
  function effectiveRule() { return Object.assign({}, rule, { bustRule: D.BustRule.manual }); }

  let settleCells = {};
  render();

  function render() {
    UI.clear(screen);
    const titleEl = document.getElementById("app-title");
    if (titleEl) titleEl.textContent = session.name || "成績表";

    // 上部バー（レート・種別・ルール・精算）
    const rateInput = el("input", { type: "number", inputmode: "numeric", class: "rate-input" });
    rateInput.value = session.rate != null ? session.rate : 0;
    rateInput.addEventListener("input", function () { session.rate = parseInt(rateInput.value, 10) || 0; S.upsert("sessions", session); updateSettle(); });
    const top = el("div", { class: "card sheet-top" }, [
      el("div", { class: "sheet-top-row" }, [
        el("span", { class: "small muted", text: "レート" }),
        rateInput,
        el("span", { class: "small muted", text: "円/pt" }),
        el("span", { class: "badge " + (session.mahjongType === D.MahjongType.four ? "four" : "three"), style: "margin-left:auto", text: D.typeShort(session.mahjongType) }),
        el("button", { class: "btn btn-secondary settle-btn", onclick: function () { showSettle(); } }, "精算"),
      ]),
      el("div", { class: "small muted", text: (session.ruleName || "") + " ・ " + UI.fmtDate(session.date) }),
    ]);
    screen.appendChild(top);

    // テーブル
    const table = el("table", { class: "sheet-table" });
    const head = el("tr", {}, [el("th", { class: "idx", text: "#" })]);
    pids.forEach(function (pid) { head.appendChild(el("th", { text: pname(pid) })); });
    table.appendChild(head);

    const hanchans = session.hanchans || [];
    if (hanchans.length === 0) {
      const tr = el("tr", {}, [el("td", { class: "muted", colspan: String(pids.length + 1), style: "text-align:center;padding:18px", text: "まだ半荘がありません。下の「＋ 半荘を追加」から記録してください。" })]);
      table.appendChild(tr);
    } else {
      hanchans.forEach(function (h, i) {
        const tr = el("tr", { class: "hanchan-row", onclick: function () { openHanchanEditor(h); } }, [el("td", { class: "idx", text: String(i + 1) + (h.shugi ? "👑" : "") })]);
        pids.forEach(function (pid) {
          const r = SH.resultOf(h, pid);
          const v = r ? r.totalPointWithoutChip : 0;
          tr.appendChild(el("td", { class: "num " + UI.pointClass(v), text: (r && r.isBusted ? "💥" : "") + UI.fmtPoint(v) }));
        });
        table.appendChild(tr);
      });
    }

    // 合計
    const totals = SH.playerTotals(session);
    const totalRow = el("tr", { class: "total-row" }, [el("td", { class: "idx", text: "合計" })]);
    pids.forEach(function (pid) { const v = totals[pid].points; totalRow.appendChild(el("td", { class: "num " + UI.pointClass(v), text: UI.fmtPoint(v) })); });
    table.appendChild(totalRow);

    // 役満祝儀（行）
    const shugiType = session.shugiType || "none";
    if (shugiType !== "none" && (session.hanchans || []).some(function (h) { return h.shugi; })) {
      const shugiRow = el("tr", { class: "shugi-row" }, [el("td", { class: "idx", text: "役満" })]);
      pids.forEach(function (pid) { const v = totals[pid].shugi; shugiRow.appendChild(el("td", { class: "num " + UI.pointClass(v), text: (v > 0 ? "+" : "") + v + D.shugiUnit(shugiType) })); });
      table.appendChild(shugiRow);
    }

    // チップ（入力）
    const chipRow = el("tr", { class: "chip-row" }, [el("td", { class: "idx", text: "チップ" })]);
    pids.forEach(function (pid) {
      const inp = el("input", { type: "number", inputmode: "numeric", class: "chip-input", placeholder: "0" });
      inp.value = (session.chips && session.chips[pid]) ? session.chips[pid] : "";
      inp.addEventListener("input", function () { session.chips = session.chips || {}; session.chips[pid] = parseInt(inp.value, 10) || 0; S.upsert("sessions", session); updateSettle(); });
      const td = el("td", {}, [inp]);
      chipRow.appendChild(td);
    });
    table.appendChild(chipRow);

    // 精算（円）
    settleCells = {};
    const settleRow = el("tr", { class: "settle-row" }, [el("td", { class: "idx", text: "精算" })]);
    pids.forEach(function (pid) { const td = el("td", { class: "num" }); settleCells[pid] = td; settleRow.appendChild(td); });
    table.appendChild(settleRow);

    screen.appendChild(el("div", { class: "card sheet-table-wrap" }, [table]));
    updateSettle();

    screen.appendChild(el("button", { class: "btn btn-primary", style: "margin-top:6px", onclick: function () { openHanchanEditor(null); } }, "＋ 半荘を追加"));

    // 部屋の操作
    screen.appendChild(el("div", { class: "btn-row", style: "margin-top:18px" }, [
      el("button", { class: "btn btn-secondary", onclick: function () { renameSession(); } }, "設定（名前・レート）"),
      el("button", { class: "btn btn-danger", onclick: function () { deleteSession(); } }, "成績表を削除"),
    ]));
  }

  function updateSettle() {
    const totals = SH.playerTotals(session);
    pids.forEach(function (pid) {
      const td = settleCells[pid];
      if (!td) return;
      const yen = totals[pid].settle;
      td.textContent = UI.fmtYen(yen);
      td.className = "num " + UI.pointClass(yen);
    });
  }

  // ---- 精算サマリ ----
  function showSettle() {
    const totals = SH.playerTotals(session);
    const body = el("div", {});
    pids.forEach(function (pid) {
      const t = totals[pid];
      body.appendChild(el("div", { class: "rate-row" }, [
        el("span", { text: pname(pid) }),
        el("span", {}, [
          el("span", { class: "small muted", text: UI.fmtPoint(t.points) + "pt" + (t.chipCount ? " ・ チップ" + (t.chipCount > 0 ? "+" : "") + t.chipCount + "枚" : "") + "　" }),
          el("span", { class: "num " + UI.pointClass(t.settle), style: "font-weight:700", text: UI.fmtYen(t.settle) }),
        ]),
      ]));
    });
    const sum = pids.reduce(function (a, pid) { return a + totals[pid].settle; }, 0);
    body.appendChild(el("div", { class: "small muted", style: "margin-top:8px", text: "合計 " + UI.fmtYen(sum) + "（レート " + (session.rate || 0) + "円/pt）" }));
    UI.sheet({ title: "精算", body: body, dismissible: true, actions: [{ label: "閉じる", class: "btn-primary", onClick: function (c) { c.close(); } }] });
  }

  // ---- 半荘 追加/編集 ----
  function openHanchanEditor(existing) {
    const raws = {};
    pids.forEach(function (pid) { raws[pid] = existing ? existing.raws[pid] : null; });

    const body = el("div", {});
    pids.forEach(function (pid) {
      const inp = el("input", { type: "number", inputmode: "numeric", placeholder: "例: 25000" });
      inp.value = raws[pid] != null ? raws[pid] : "";
      inp.addEventListener("input", function () { raws[pid] = inp.value === "" ? null : parseInt(inp.value, 10); });
      const sign = el("button", { class: "sign-btn", onclick: function () { const n = parseInt(inp.value, 10); if (!isNaN(n)) { inp.value = String(-n); raws[pid] = -n; } } }, "±");
      body.appendChild(el("div", { class: "score-row" }, [el("span", { class: "score-name", text: pname(pid) }), inp, sign]));
    });
    body.appendChild(el("div", { class: "small muted", text: "粗点を入力。0点以下や同点があるときだけ確認が出ます。" }));

    // 役満祝儀（任意）
    const shugiType = session.shugiType || "none";
    let readShugi = function () { return null; };
    if (shugiType !== "none") {
      const n = pids.length;
      const unit = D.shugiUnit(shugiType);
      const existShugi = existing && existing.shugi ? existing.shugi : null;
      const existVals = existShugi ? (SH.shugiValuesOf(existing, pids) || {}) : {};
      const cb = el("input", { type: "checkbox" }); cb.checked = !!existShugi;
      const detail = el("div", { style: "margin-top:6px" });

      if (shugiType === "chip") {
        // チップ: 和了者＋各他家が払う枚数
        const winnerSel = el("select");
        pids.forEach(function (pid) { winnerSel.appendChild(el("option", { value: pid, text: pname(pid) })); });
        const amountInp = el("input", { type: "number", inputmode: "numeric", placeholder: "各他家が払う枚数" });
        if (existShugi) {
          let mp = null, mv = -Infinity, mn = Infinity;
          pids.forEach(function (pid) { const v = existVals[pid] || 0; if (v > mv) { mv = v; mp = pid; } if (v < mn) mn = v; });
          if (mp) winnerSel.value = mp;
          amountInp.value = -mn;
        }
        detail.appendChild(UI.field("和了者", winnerSel));
        detail.appendChild(UI.field("祝儀（各他家→和了者の枚数）", amountInp));
        readShugi = function () {
          if (!cb.checked) return null;
          const amt = parseInt(amountInp.value, 10);
          if (!winnerSel.value || isNaN(amt) || amt === 0) return undefined;
          const values = {}; pids.forEach(function (pid) { values[pid] = (pid === winnerSel.value) ? amt * (n - 1) : -amt; });
          return { winnerId: winnerSel.value, amount: amt, values: values };
        };
      } else {
        // ポイント / 金額: 各自に直接入力（合計0必須）
        const valInputs = {};
        pids.forEach(function (pid) {
          const inp = el("input", { type: "number", inputmode: "numeric", placeholder: "0" });
          if (existVals[pid]) inp.value = existVals[pid];
          const sign = el("button", { class: "sign-btn", onclick: function () { const v = parseInt(inp.value, 10); if (!isNaN(v)) inp.value = String(-v); } }, "±");
          valInputs[pid] = inp;
          detail.appendChild(el("div", { class: "score-row" }, [el("span", { class: "score-name", text: pname(pid) }), inp, sign]));
        });
        detail.appendChild(el("div", { class: "small muted", text: "各自の役満祝儀（" + unit + "）。合計が0になるように入力（0以外はエラー）。" }));
        readShugi = function () {
          if (!cb.checked) return null;
          const values = {}; let sum = 0, any = false;
          pids.forEach(function (pid) { const v = parseInt(valInputs[pid].value, 10) || 0; values[pid] = v; sum += v; if (v !== 0) any = true; });
          if (!any) return null;
          if (sum !== 0) return "SUM_ERROR";
          return { values: values };
        };
      }

      detail.style.display = cb.checked ? "" : "none";
      cb.addEventListener("change", function () { detail.style.display = cb.checked ? "" : "none"; });
      body.appendChild(el("div", { class: "form-section-title", text: "役満祝儀（任意・" + D.shugiTypeName(shugiType) + "）" }));
      body.appendChild(el("label", { class: "switch-row" }, [el("span", { text: "役満が出た" }), cb]));
      body.appendChild(detail);
    }

    const actions = [];
    if (existing) actions.push({ label: "削除", class: "btn-danger", onClick: function (c) { deleteHanchan(existing, c); } });
    actions.push({ label: "キャンセル", class: "btn-secondary", onClick: function (c) { c.close(); } });
    actions.push({ label: existing ? "更新" : "確定", class: "btn-primary", onClick: function (c) {
      const shugi = readShugi();
      if (shugi === undefined) { UI.toast("役満の和了者と祝儀を入力してください"); return; }
      if (shugi === "SUM_ERROR") { UI.toast("役満祝儀の合計が0になりません（差を0にしてください）"); return; }
      onConfirm(raws, shugi, existing, c);
    } });
    UI.sheet({ title: existing ? "半荘を編集" : "半荘を追加（粗点）", body: body, actions: actions });
  }

  function detectTieGroups(raws) {
    const byScore = {};
    pids.forEach(function (pid) { const k = String(raws[pid]); (byScore[k] = byScore[k] || []).push(pid); });
    return Object.keys(byScore).filter(function (k) { return byScore[k].length > 1; }).map(function (k) { return { key: k, pids: byScore[k] }; });
  }

  function onConfirm(raws, shugi, existing, editorCtrl) {
    if (pids.some(function (pid) { return raws[pid] == null; })) { UI.toast("全員の粗点を入力してください"); return; }

    function proceed() {
      const pre = SH.computeResults(effectiveRule(), pids, raws);
      const tieGroups = detectTieGroups(raws);
      // 0点以下の人を「飛んだ？」と確認する候補に（飛び賞なしルールなら確認不要）
      const candidates = rule.hasTobiBonus ? pids.filter(function (pid) { return raws[pid] <= 0; }) : [];
      if (tieGroups.length > 0 || candidates.length > 0) {
        openResolution(raws, tieGroups, candidates, pre, shugi, existing, editorCtrl);
      } else {
        finalize(raws, null, null, {}, shugi, existing, editorCtrl);
      }
    }

    // 入力ミス検知: 粗点の合計が初期持ち点合計とズレていたら警告（確認後は保存可）
    const rawSum = pids.reduce(function (a, pid) { return a + raws[pid]; }, 0);
    const expected = pids.length * (rule.initialScore || 0);
    if (rule.initialScore && rawSum !== expected) {
      UI.confirm({
        title: "粗点合計を確認",
        message: "粗点の合計が " + rawSum.toLocaleString() + " で、想定の " + expected.toLocaleString() + " と一致しません。\n入力ミスがないか確認してください。",
        confirmText: "このまま進む", cancelText: "戻る",
      }).then(function (ok) { if (ok) proceed(); });
    } else {
      proceed();
    }
  }

  // 確認ポップアップ：同点の上位選択／0点以下の人の「飛んだ？」確認
  function openResolution(raws, tieGroups, candidates, pre, shugi, existing, editorCtrl) {
    const tieChoice = {};
    tieGroups.forEach(function (g) { tieChoice[g.key] = g.pids.slice(); });
    const top = pre.filter(function (r) { return r.rank === 1; })[0];
    const bustedFlags = {}, busters = {};
    candidates.forEach(function (pid) {
      bustedFlags[pid] = true; // 既定: 飛んだ
      busters[pid] = (top && top.playerId !== pid) ? top.playerId : pids.filter(function (p) { return p !== pid; })[0];
    });

    const box = el("div", {});
    function rebuild() {
      UI.clear(box);
      if (tieGroups.length > 0) {
        box.appendChild(el("div", { class: "form-section-title", text: "同点：上位から順に" }));
        tieGroups.forEach(function (g) {
          const ordered = tieChoice[g.key];
          box.appendChild(el("div", { class: "small muted", text: Number(g.key).toLocaleString() + "点で同点" }));
          ordered.forEach(function (pid, i) {
            box.appendChild(el("div", { class: "tie-row" }, [
              el("span", { class: "tie-pos", text: "上位" + (i + 1) }),
              el("span", { class: "tie-name", text: pname(pid) }),
              el("button", { class: "mini-btn", disabled: i === 0 ? "" : null, onclick: function () { swap(ordered, i, i - 1); } }, "▲"),
              el("button", { class: "mini-btn", disabled: i === ordered.length - 1 ? "" : null, onclick: function () { swap(ordered, i, i + 1); } }, "▼"),
            ]));
          });
        });
      }
      if (candidates.length > 0) {
        box.appendChild(el("div", { class: "form-section-title", text: "0点以下：飛びましたか？" }));
        candidates.forEach(function (pid) {
          const cb = el("input", { type: "checkbox" });
          cb.checked = !!bustedFlags[pid];
          cb.addEventListener("change", function () { bustedFlags[pid] = cb.checked; rebuild(); });
          const rowChildren = [
            el("label", { class: "switch-row", style: "padding:6px 0" }, [
              el("span", {}, [el("b", { text: pname(pid) }), el("span", { class: "small muted", text: "（" + raws[pid].toLocaleString() + "点）が飛んだ" })]),
              cb,
            ]),
          ];
          if (bustedFlags[pid]) {
            const sel = el("select");
            pids.filter(function (p) { return p !== pid; }).forEach(function (p) {
              const op = el("option", { value: p, text: pname(p) });
              if (busters[pid] === p) op.selected = true;
              sel.appendChild(op);
            });
            sel.addEventListener("change", function () { busters[pid] = sel.value; });
            rowChildren.push(el("div", { class: "tobi-row" }, [el("span", { class: "small muted", text: "飛ばした人:" }), sel]));
          }
          box.appendChild(el("div", { style: "border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:6px" }, rowChildren));
        });
      }
    }
    function swap(arr, i, j) { if (j < 0 || j >= arr.length) return; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; rebuild(); }
    rebuild();

    UI.sheet({
      title: "確認", body: box, dismissible: false,
      actions: [
        { label: "戻る", class: "btn-secondary", onClick: function (c) { c.close(); } },
        {
          label: existing ? "更新" : "追加", class: "btn-primary", onClick: function (c) {
            const tb = {};
            tieGroups.forEach(function (g) { tieChoice[g.key].forEach(function (pid, i) { tb[pid] = i; }); });
            const manualBusted = {}, finalBusters = {};
            candidates.forEach(function (pid) { manualBusted[pid] = !!bustedFlags[pid]; if (bustedFlags[pid]) finalBusters[pid] = busters[pid]; });
            c.close(); editorCtrl.close();
            finalize(raws, Object.keys(tb).length ? tb : null, finalBusters, manualBusted, shugi, existing, null);
          },
        },
      ],
    });
  }

  function finalize(raws, tieBreaks, busters, manualBusted, shugi, existing, ctrl) {
    const results = SH.computeResults(effectiveRule(), pids, raws, tieBreaks, busters, manualBusted);
    if (existing) { existing.raws = raws; existing.results = results; existing.shugi = shugi || null; }
    else { session.hanchans = session.hanchans || []; session.hanchans.push({ id: D.uuid(), raws: raws, results: results, shugi: shugi || null, createdAt: D.nowISO() }); }
    S.upsert("sessions", session);
    if (ctrl) ctrl.close();
    UI.toast(existing ? "更新しました" : "半荘を追加しました");
    render();
  }

  function deleteHanchan(h, modalCtrl) {
    UI.confirm({ title: "この半荘を削除しますか？", message: "この半荘の記録を削除します。元に戻せません。", confirmText: "削除する", cancelText: "キャンセル", danger: true }).then(function (ok) {
      if (!ok) return;
      session.hanchans = (session.hanchans || []).filter(function (x) { return x.id !== h.id; });
      S.upsert("sessions", session);
      modalCtrl.close();
      UI.toast("削除しました");
      render();
    });
  }

  // ---- 部屋の名前・レート変更／削除 ----
  function renameSession() {
    const nameInput = el("input", { type: "text", value: session.name || "" });
    const rateInput = el("input", { type: "number", inputmode: "numeric" });
    rateInput.value = session.rate != null ? session.rate : 0;
    UI.sheet({
      title: "設定",
      body: el("div", {}, [
        UI.field("名前", nameInput),
        UI.field("レート（円/pt）", rateInput),
      ]),
      actions: [
        { label: "キャンセル", class: "btn-secondary", onClick: function (c) { c.close(); } },
        { label: "保存", class: "btn-primary", onClick: function (c) { session.name = nameInput.value.trim() || session.name; session.rate = parseInt(rateInput.value, 10) || 0; S.upsert("sessions", session); c.close(); render(); } },
      ],
    });
  }

  function deleteSession() {
    UI.confirm({
      title: "この成績表を削除しますか？",
      message: "成績表（" + (session.hanchans || []).length + "半荘）を削除します。プレイヤー成績・ランキングにも反映されなくなります。この操作は元に戻せません。",
      confirmText: "削除する", cancelText: "キャンセル", danger: true,
    }).then(function (ok) {
      if (!ok) return;
      S.softDelete("sessions", session.id);
      UI.toast("成績表を削除しました");
      MJ.navigate("rooms");
    });
  }
};
