/* 成績表シート（1部屋）。表＝行が半荘・列がプレイヤー。上部にレート、最終行にチップ、精算。
   半荘追加はシンプル入力（粗点だけ）。0点(飛び)・同点のときだけ確認ポップアップ。 */
window.MJ = window.MJ || {};
MJ.screens = MJ.screens || {};
MJ.screens.sheet = function (screen) {
  "use strict";
  const S = MJ.store, D = MJ.domain, UI = MJ.ui, SH = MJ.sheets;
  const el = UI.el;

  // リロード/PWA再起動で _sessionId が消えても、最後に開いた部屋を復元する
  if (!MJ._sessionId) { try { MJ._sessionId = localStorage.getItem("mahjong:lastSheet") || null; } catch (e) { } }
  const session = MJ._sessionId ? S.byId("sessions", MJ._sessionId) : null;
  if (!session || session.isDeleted) {
    screen.appendChild(el("div", { class: "empty" }, [
      el("p", { text: "部屋が見つかりません。" }),
      el("button", { class: "btn btn-primary", onclick: function () { MJ.navigate("rooms"); } }, "部屋一覧へ"),
    ]));
    return;
  }
  const rule = S.byId("rules", session.ruleSetId);
  const pids = session.playerIds || [];
  const seats = D.playerCount(session.mahjongType); // 1半荘の人数（3麻=3, 4麻=4）
  function pname(id) { const p = S.byId("players", id); return p ? p.name : "(不明)"; }
  // 飛びは事前に決めず、0点以下の入力時に「飛んだ？」と確認して手動で決める。
  function effectiveRule() { return Object.assign({}, rule, { bustRule: D.BustRule.manual }); }

  let settleCells = {};
  render();

  function render() {
    UI.clear(screen);
    const titleEl = document.getElementById("app-title");
    if (titleEl) titleEl.textContent = session.name || "部屋";

    // エラー表示（！）の設定（未設定は既定オン）
    const prefs = S.getSettings();
    const showPt = prefs.showPtError !== false, showRaw = prefs.showRawError !== false, showChip = prefs.showChipError !== false;

    // 上部バー（レート・種別・ルール・精算）
    const rateInput = el("input", { type: "number", inputmode: "numeric", class: "rate-input" });
    rateInput.value = session.rate != null ? session.rate : 0;
    rateInput.addEventListener("input", function () { session.rate = parseInt(rateInput.value, 10) || 0; S.upsert("sessions", session); updateSettle(); });
    const cs = (MJ.cloud && MJ.cloud.status) ? MJ.cloud.status() : { signedIn: false };
    const saveBadge = el("span", { class: "save-badge" + (cs.signedIn ? " on" : ""), style: "margin-left:auto", text: cs.signedIn ? "☁︎ 自動保存（クラウド）" : "✓ 自動保存（この端末）" });
    const top = el("div", { class: "card sheet-top" }, [
      el("div", { class: "sheet-top-row" }, [
        el("span", { class: "small muted", text: "レート" }),
        rateInput,
        el("span", { class: "small muted", text: "円/pt" }),
        el("span", { class: "badge " + (session.mahjongType === D.MahjongType.four ? "four" : "three"), style: "margin-left:auto", text: D.typeShort(session.mahjongType) }),
        el("button", { class: "btn btn-secondary settle-btn", onclick: function () { showSettle(); } }, "精算"),
      ]),
      el("div", { class: "sheet-top-row", style: "margin-top:4px" }, [
        el("span", { class: "small muted", text: (session.ruleName || "") + " ・ " + UI.fmtDate(session.date) + " ・ メンバー" + pids.length + "人" }),
        saveBadge,
      ]),
    ]);
    screen.appendChild(top);

    if (!rule) {
      screen.appendChild(el("div", { class: "card", style: "border:1px solid var(--warn)" }, [
        el("div", { class: "small", style: "color:var(--warn);font-weight:700", text: "⚠ この部屋のルールが見つかりません" }),
        el("div", { class: "small muted", text: "新しい半荘は入力できません（既存の記録は表示できます）。ルール管理で同じ種別のルールを作成してください。" }),
      ]));
    }

    // テーブル
    const table = el("table", { class: "sheet-table" });
    const head = el("tr", {}, [el("th", { class: "idx", text: "#" })]);
    pids.forEach(function (pid) { head.appendChild(el("th", { text: pname(pid) })); });
    table.appendChild(head);

    const hanchans = session.hanchans || [];
    if (hanchans.length === 0) {
      const tr = el("tr", {}, [el("td", { class: "muted", colspan: String(pids.length + 1), style: "text-align:center;padding:18px", text: "まだ半荘がありません。下の「＋ 半荘を入力」から記録してください。" })]);
      table.appendChild(tr);
    } else {
      hanchans.forEach(function (h, i) {
        const hp = (h.playerIds && h.playerIds.length) ? h.playerIds : pids.filter(function (pid) { return h.raws && h.raws[pid] != null; });
        let title = "";
        // 粗点の合計が想定（人数×初期持ち点）と一致しない
        if (showRaw && rule && rule.initialScore) {
          const rs = hp.reduce(function (a, pid) { const v = h.raws ? h.raws[pid] : null; return a + (typeof v === "number" && !isNaN(v) ? v : 0); }, 0);
          if (rs !== hp.length * rule.initialScore) title += "粗点の合計が想定（人数×持ち点）と一致しません。";
        }
        // ポイントの合計が0でない
        if (showPt) {
          const ps = (h.results || []).reduce(function (a, r) { return a + (r.totalPointWithoutChip || 0); }, 0);
          if (Math.round(ps * 10) / 10 !== 0) title += "ポイントの合計が0になっていません。";
        }
        const hasErr = title !== "";
        const idxCell = el("td", { class: "idx", text: String(i + 1) + (h.shugi ? "👑" : "") });
        if (hasErr) idxCell.appendChild(el("span", { class: "row-err", title: title + "行をタップして確認してください。", text: "！" }));
        const tr = el("tr", { class: "hanchan-row" + (hasErr ? " has-err" : ""), onclick: function () { openHanchanEditor(h); } }, [idxCell]);
        pids.forEach(function (pid) {
          const r = SH.resultOf(h, pid);
          if (!r) { tr.appendChild(el("td", { class: "num rest-cell", text: "—" })); return; } // 抜け番
          const v = r.totalPointWithoutChip;
          tr.appendChild(el("td", { class: "num " + UI.pointClass(v), text: (r.isBusted ? "💥" : "") + UI.fmtPoint(v) }));
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

    // チップ（入力）— 最後の1人ぶんを自動計算し、合計が0でなければエラー表示
    const chipInputs = {};
    const chipIdxCell = el("td", { class: "idx", text: "チップ" });
    const chipRow = el("tr", { class: "chip-row" }, [chipIdxCell]);
    function chipTotal() { return pids.reduce(function (a, pid) { const n = parseInt(chipInputs[pid] ? chipInputs[pid].value : "", 10); return a + (isNaN(n) ? 0 : n); }, 0); }
    function updateChipError() {
      const bad = showChip && chipTotal() !== 0;
      const badge = chipIdxCell.querySelector(".row-err");
      if (bad && !badge) chipIdxCell.appendChild(el("span", { class: "row-err", title: "チップの合計が0になっていません（受け取り＋／支払い−で合計0に）", text: "！" }));
      else if (!bad && badge) badge.parentNode.removeChild(badge);
    }
    function autoFillChip(editedPid) {
      const empties = pids.filter(function (pid) { return chipInputs[pid] && chipInputs[pid].value === ""; });
      if (empties.length !== 1) return;
      const target = empties[0];
      if (target === editedPid) return;
      let sum = 0;
      pids.forEach(function (pid) { if (pid !== target) { const n = parseInt(chipInputs[pid].value, 10); sum += isNaN(n) ? 0 : n; } });
      const val = -sum;
      chipInputs[target].value = String(val);
      session.chips = session.chips || {};
      session.chips[target] = val;
    }
    pids.forEach(function (pid) {
      const inp = el("input", { type: "number", inputmode: "numeric", class: "chip-input", placeholder: "0" });
      inp.value = (session.chips && session.chips[pid]) ? session.chips[pid] : "";
      chipInputs[pid] = inp;
      inp.addEventListener("input", function () {
        session.chips = session.chips || {};
        const n = parseInt(inp.value, 10);
        session.chips[pid] = (inp.value === "" || isNaN(n)) ? 0 : n;
        S.upsert("sessions", session);
        updateSettle();
        updateChipError();
      });
      // 自動計算は欄を離れた（入力完了）ときに走らせる
      inp.addEventListener("blur", function () {
        autoFillChip(pid);
        S.upsert("sessions", session);
        updateSettle();
        updateChipError();
      });
      chipRow.appendChild(el("td", {}, [inp]));
    });
    table.appendChild(chipRow);
    updateChipError();

    // 精算（円）
    settleCells = {};
    const settleRow = el("tr", { class: "settle-row" }, [el("td", { class: "idx", text: "精算" })]);
    pids.forEach(function (pid) { const td = el("td", { class: "num" }); settleCells[pid] = td; settleRow.appendChild(td); });
    table.appendChild(settleRow);

    screen.appendChild(el("div", { class: "card sheet-table-wrap" }, [table]));
    updateSettle();

    screen.appendChild(el("button", { class: "btn btn-primary", style: "margin-top:6px", onclick: function () { openHanchanEditor(null); } }, "＋ 半荘を入力"));

    // 部屋の操作
    screen.appendChild(el("div", { class: "btn-row", style: "margin-top:18px" }, [
      el("button", { class: "btn btn-secondary", onclick: function () { renameSession(); } }, "設定（名前・レート）"),
      el("button", { class: "btn btn-danger", onclick: function () { deleteSession(); } }, "部屋を削除"),
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
    const shugiType = session.shugiType || "none";
    const sUnit = D.shugiUnit(shugiType);
    const body = el("div", {});
    pids.forEach(function (pid) {
      const t = totals[pid];
      const parts = [UI.fmtPoint(t.points) + "pt"];
      if (t.chipCount) parts.push("チップ" + (t.chipCount > 0 ? "+" : "") + t.chipCount + "枚");
      if (shugiType !== "none" && t.shugi) parts.push("祝儀" + (t.shugi > 0 ? "+" : "") + t.shugi + sUnit);
      body.appendChild(el("div", { class: "rate-row" }, [
        el("span", { text: pname(pid) }),
        el("span", {}, [
          el("span", { class: "small muted", text: parts.join(" ・ ") + "　" }),
          el("span", { class: "num " + UI.pointClass(t.settle), style: "font-weight:700", text: UI.fmtYen(t.settle) }),
        ]),
      ]));
    });
    const sum = pids.reduce(function (a, pid) { return a + totals[pid].settle; }, 0);
    body.appendChild(el("div", { class: "small muted", style: "margin-top:8px", text: "精算＝ポイント×レート＋チップ＋祝儀。合計 " + UI.fmtYen(sum) + "（レート " + (session.rate || 0) + "円/pt）" }));
    UI.sheet({ title: "精算", body: body, dismissible: true, actions: [{ label: "閉じる", class: "btn-primary", onClick: function (c) { c.close(); } }] });
  }

  // ---- 半荘 追加/編集 ----
  // 登録メンバーが席数より多い部屋では、半荘ごとに「出場した seats 人」を選ぶ（抜け番対応）。
  function openHanchanEditor(existing) {
    if (!rule) { UI.toast("この部屋のルールが見つかりません。ルール管理で同じ種別のルールを作成してください。"); return; }
    const canPick = pids.length > seats;

    // この半荘の参加者（ちょうど seats 人）
    let participants;
    if (existing) {
      participants = (existing.playerIds && existing.playerIds.slice()) ||
        pids.filter(function (pid) { return existing.raws && existing.raws[pid] != null; });
      // playerIds が壊れている場合は raws の実体キーを優先し、最後の手段でのみ先頭 seats 人
      if (participants.length !== seats) participants = pids.filter(function (pid) { return existing.raws && existing.raws[pid] != null; });
      if (participants.length !== seats) participants = pids.slice(0, seats);
    } else if (canPick) {
      const last = (session.hanchans || []).slice(-1)[0]; // 前回と同じ人を初期選択
      participants = (last && last.playerIds && last.playerIds.length === seats) ? last.playerIds.slice() : pids.slice(0, seats);
    } else {
      participants = pids.slice();
    }

    const raws = {};
    participants.forEach(function (pid) { raws[pid] = existing && existing.raws ? existing.raws[pid] : null; });

    const body = el("div", {});
    const scoreBox = el("div", {});
    const shugiHost = el("div", {});
    const shugiState = { read: function () { return null; } };
    const rawInputs = {};

    // 残り1人ぶんの粗点を自動計算（合計＝人数×初期持ち点）。編集中の欄は補完しない。
    function autoFillLast(editedPid) {
      if (!rule || !rule.initialScore) return;
      const empties = participants.filter(function (pid) { return raws[pid] == null || isNaN(raws[pid]); });
      if (empties.length !== 1) return;
      const target = empties[0];
      if (target === editedPid) return;
      let sum = 0;
      participants.forEach(function (pid) { if (pid !== target) sum += raws[pid]; });
      const val = participants.length * rule.initialScore - sum;
      raws[target] = val;
      if (rawInputs[target]) rawInputs[target].value = String(val);
    }

    // 役満祝儀（任意）— 全種類「各自に直接入力（合計0）」に統一
    function buildShugi() {
      UI.clear(shugiHost);
      shugiState.read = function () { return null; };
      const shugiType = session.shugiType || "none";
      if (shugiType === "none") return;
      const unit = D.shugiUnit(shugiType);
      const existShugi = existing && existing.shugi ? existing.shugi : null;
      const existVals = existShugi ? (SH.shugiValuesOf(existing, participants) || {}) : {};
      const cb = el("input", { type: "checkbox" }); cb.checked = !!existShugi;
      const detail = el("div", { style: "margin-top:6px" });
      const valInputs = {};
      participants.forEach(function (pid) {
        const inp = el("input", { type: "number", inputmode: "numeric", placeholder: "0" });
        if (existVals[pid] != null) inp.value = existVals[pid];
        const sign = el("button", { class: "sign-btn", onclick: function () { const v = parseInt(inp.value, 10); if (!isNaN(v)) inp.value = String(-v); } }, "±");
        valInputs[pid] = inp;
        detail.appendChild(el("div", { class: "score-row" }, [el("span", { class: "score-name", text: pname(pid) }), inp, sign]));
      });
      detail.appendChild(el("div", { class: "small muted", text: "各自の役満祝儀（" + unit + "）。合計が0になるように入力（例: 和了者 +2、他 −1 ずつ）。" }));
      detail.style.display = cb.checked ? "" : "none";
      cb.addEventListener("change", function () { detail.style.display = cb.checked ? "" : "none"; });
      shugiHost.appendChild(el("div", { class: "form-section-title", text: "役満祝儀（任意・" + D.shugiTypeName(shugiType) + "）" }));
      shugiHost.appendChild(el("label", { class: "switch-row" }, [el("span", { text: "役満が出た" }), cb]));
      shugiHost.appendChild(detail);
      shugiState.read = function () {
        if (!cb.checked) return null;
        const values = {}; let sum = 0, any = false;
        participants.forEach(function (pid) { const v = parseInt(valInputs[pid].value, 10) || 0; values[pid] = v; sum += v; if (v !== 0) any = true; });
        if (!any) return null;
        if (sum !== 0) return "SUM_ERROR";
        return { values: values };
      };
    }

    function rebuildScores() {
      UI.clear(scoreBox);
      participants.forEach(function (pid) {
        const inp = el("input", { type: "number", inputmode: "numeric", placeholder: "例: 25000" });
        inp.value = raws[pid] != null ? raws[pid] : "";
        rawInputs[pid] = inp;
        // 入力中は値を反映するだけ。自動計算は欄を離れた（入力完了）ときに走らせる。
        inp.addEventListener("input", function () { const n = parseInt(inp.value, 10); raws[pid] = (inp.value === "" || isNaN(n)) ? null : n; });
        inp.addEventListener("blur", function () { autoFillLast(pid); });
        const sign = el("button", { class: "sign-btn", onclick: function () { const n = parseInt(inp.value, 10); if (!isNaN(n)) { inp.value = String(-n); raws[pid] = -n; autoFillLast(pid); } } }, "±");
        scoreBox.appendChild(el("div", { class: "score-row" }, [el("span", { class: "score-name", text: pname(pid) }), inp, sign]));
      });
      buildShugi();
    }

    // 参加者ピッカー（登録 > 席数 のときだけ）
    if (canPick) {
      const counter = el("div", { class: "small", style: "margin-bottom:6px" });
      const chips = el("div", { class: "pick-chips" });
      function updateCounter() {
        const n = participants.length;
        counter.textContent = "出場 " + n + " / " + seats + "人" + (n < seats ? "（あと" + (seats - n) + "人）" : (n > seats ? "（多すぎます）" : ""));
        counter.style.color = (n === seats) ? "var(--pos)" : "var(--warn)";
      }
      function refreshChips() {
        [].slice.call(chips.children).forEach(function (c, idx) {
          c.className = "pick-chip" + (participants.indexOf(pids[idx]) >= 0 ? " on" : "");
        });
      }
      pids.forEach(function (pid) {
        const chip = el("button", { class: "pick-chip" + (participants.indexOf(pid) >= 0 ? " on" : ""), onclick: function () {
          const i = participants.indexOf(pid);
          if (i >= 0) { participants.splice(i, 1); delete raws[pid]; }
          else { participants.push(pid); if (raws[pid] == null) raws[pid] = null; }
          refreshChips(); updateCounter(); rebuildScores();
        } }, pname(pid));
        chips.appendChild(chip);
      });
      updateCounter();
      body.appendChild(el("div", { class: "form-section-title", text: "この半荘に出た人（" + seats + "人を選択）" }));
      body.appendChild(counter);
      body.appendChild(chips);
    }

    body.appendChild(scoreBox);
    body.appendChild(el("div", { class: "small muted", text: "粗点＝終了時の持ち点（例: 25000）。最後の1人は自動計算されます（他を入力して次の欄へ移ると反映）。0点以下や同点があるときだけ確認が出ます。" }));
    body.appendChild(shugiHost);
    rebuildScores();

    const actions = [];
    if (existing) actions.push({ label: "削除", class: "btn-danger", onClick: function (c) { deleteHanchan(existing, c); } });
    actions.push({ label: "キャンセル", class: "btn-secondary", onClick: function (c) { c.close(); } });
    actions.push({ label: existing ? "更新" : "確定", class: "btn-primary", onClick: function (c) {
      if (participants.length !== seats) { UI.toast("出場した人を" + seats + "人選んでください"); return; }
      autoFillLast(); // 最後の1人が空欄のままなら、確定時に自動計算してから進む
      const shugi = shugiState.read();
      if (shugi === "SUM_ERROR") { UI.toast("役満祝儀の合計が0になりません（差を0にしてください）"); return; }
      onConfirm(participants.slice(), raws, shugi, existing, c);
    } });
    UI.sheet({ title: existing ? "半荘を編集" : "半荘を入力（粗点）", body: body, actions: actions });
  }

  function detectTieGroups(parts, raws) {
    const byScore = {};
    parts.forEach(function (pid) { const k = String(raws[pid]); (byScore[k] = byScore[k] || []).push(pid); });
    return Object.keys(byScore).filter(function (k) { return byScore[k].length > 1; }).map(function (k) { return { key: k, pids: byScore[k] }; });
  }

  function onConfirm(parts, raws, shugi, existing, editorCtrl) {
    if (parts.some(function (pid) { return raws[pid] == null || isNaN(raws[pid]); })) { UI.toast("全員の粗点を正しく入力してください"); return; }

    function proceed() {
      const pre = SH.computeResults(effectiveRule(), parts, raws);
      const tieGroups = detectTieGroups(parts, raws);
      // 0点以下の人を「飛んだ？」と確認する候補に（飛び賞の有無に関わらず飛びは記録する）
      const candidates = parts.filter(function (pid) { return raws[pid] <= 0; });
      if (tieGroups.length > 0 || candidates.length > 0) {
        openResolution(parts, raws, tieGroups, candidates, pre, shugi, existing, editorCtrl);
      } else {
        finalize(parts, raws, null, null, {}, shugi, existing, editorCtrl);
      }
    }

    // 入力ミス検知: 粗点の合計が初期持ち点合計とズレていたら警告（確認後は保存可）
    const rawSum = parts.reduce(function (a, pid) { return a + raws[pid]; }, 0);
    const expected = parts.length * (rule.initialScore || 0);
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
  function openResolution(parts, raws, tieGroups, candidates, pre, shugi, existing, editorCtrl) {
    const tieChoice = {};
    tieGroups.forEach(function (g) { tieChoice[g.key] = g.pids.slice(); });
    const top = pre.filter(function (r) { return r.rank === 1; })[0];
    const bustedFlags = {}, busters = {};
    candidates.forEach(function (pid) {
      bustedFlags[pid] = true; // 既定: 飛んだ
      if (rule.hasTobiBonus) busters[pid] = (top && top.playerId !== pid) ? top.playerId : parts.filter(function (p) { return p !== pid; })[0];
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
          if (bustedFlags[pid] && rule.hasTobiBonus) {
            const sel = el("select");
            parts.filter(function (p) { return p !== pid; }).forEach(function (p) {
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
            candidates.forEach(function (pid) { manualBusted[pid] = !!bustedFlags[pid]; if (bustedFlags[pid] && rule.hasTobiBonus) finalBusters[pid] = busters[pid]; });
            c.close(); editorCtrl.close();
            finalize(parts, raws, Object.keys(tb).length ? tb : null, finalBusters, manualBusted, shugi, existing, null);
          },
        },
      ],
    });
  }

  function finalize(parts, raws, tieBreaks, busters, manualBusted, shugi, existing, ctrl) {
    // 念のため参加者以外の粗点は持たせない
    const cleanRaws = {};
    parts.forEach(function (pid) { cleanRaws[pid] = raws[pid]; });
    const results = SH.computeResults(effectiveRule(), parts, cleanRaws, tieBreaks, busters, manualBusted);
    if (existing) { existing.playerIds = parts.slice(); existing.raws = cleanRaws; existing.results = results; existing.shugi = shugi || null; }
    else { session.hanchans = session.hanchans || []; session.hanchans.push({ id: D.uuid(), playerIds: parts.slice(), raws: cleanRaws, results: results, shugi: shugi || null, createdAt: D.nowISO() }); }
    S.upsert("sessions", session);
    if (ctrl) ctrl.close();
    UI.toast(existing ? "更新しました" : "半荘を入力しました");
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
      title: "この部屋を削除しますか？",
      message: "部屋（" + (session.hanchans || []).length + "半荘）を削除します。プレイヤー成績・ランキングにも反映されなくなります。この操作は元に戻せません。",
      confirmText: "削除する", cancelText: "キャンセル", danger: true,
    }).then(function (ok) {
      if (!ok) return;
      S.softDelete("sessions", session.id);
      UI.toast("部屋を削除しました");
      MJ.navigate("rooms");
    });
  }
};
