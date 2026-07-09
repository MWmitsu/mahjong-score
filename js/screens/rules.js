/* フェーズ3: ルール管理（3麻/4麻別の一覧・作成・編集・複製・削除）。
   設定項目が多いためセクション分けしたフォームにする。
   履歴または部屋から参照中のルールは物理削除せず「無効化」へ誘導。 */
window.MJ = window.MJ || {};
MJ.screens = MJ.screens || {};
MJ.screens.rules = function (screen) {
  "use strict";
  const S = MJ.store, D = MJ.domain, UI = MJ.ui;
  const el = UI.el;

  function usageCount(ruleId) {
    // 部屋は sessions に保存される（旧 matches/rooms コレクションは未使用）。
    const sess = S.active("sessions").filter(function (s) { return s.ruleSetId === ruleId; });
    const hanchans = sess.reduce(function (a, s) { return a + (s.hanchans || []).length; }, 0);
    return { matches: hanchans, rooms: sess.length };
  }

  // ---- 一覧 ----
  screen.appendChild(el("button", { class: "btn btn-primary", onclick: function () { chooseType(); } }, "＋ 新規ルール"));

  const rules = S.active("rules").slice().sort(function (a, b) {
    if (!!a.isActive !== !!b.isActive) return a.isActive ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "", "ja");
  });

  if (rules.length === 0) {
    screen.appendChild(el("div", { class: "empty", text: "ルールがありません。「＋ 新規ルール」から作成してください。" }));
    return;
  }

  [D.MahjongType.four, D.MahjongType.three].forEach(function (type) {
    const group = rules.filter(function (r) { return r.mahjongType === type; });
    if (group.length === 0) return;
    screen.appendChild(el("div", { class: "menu-section-title", text: D.typeName(type) }));
    const list = el("div", { class: "menu" });
    group.forEach(function (r) {
      const u = usageCount(r.id);
      const summary = r.initialScore + "/" + r.returnScore + " ・ ウマ" + r.umaPoints.join("/") + (r.hasOka ? " ・ オカ" + r.okaPoint : "");
      list.appendChild(el("button", { class: "tile", onclick: function () { openForm(r, false); } }, [
        el("span", { class: "emoji", text: "⚙️" }),
        el("span", { style: "min-width:0; flex:1" }, [
          el("div", { text: r.name || "(名称未設定)" }),
          el("div", { class: "small muted", text: summary }),
          el("div", { class: "small muted", text: u.matches + "戦で使用 ・ " + u.rooms + "部屋" }),
        ]),
        el("span", { class: "badge " + (r.isActive ? "four" : ""), text: r.isActive ? "有効" : "無効" }),
      ]));
    });
    screen.appendChild(list);
  });

  // ---- 種別選択（新規） ----
  function chooseType() {
    let ctrl;
    const b4 = el("button", { class: "btn btn-primary", style: "margin-bottom:10px", onclick: function () { ctrl.close(); const t = D.defaultFourPlayerRule(); t.name = ""; openForm(t, true); } }, "4人麻雀のルール");
    const b3 = el("button", { class: "btn btn-primary", onclick: function () { ctrl.close(); const t = D.defaultThreePlayerRule(); t.name = ""; openForm(t, true); } }, "3人麻雀のルール");
    const body = el("div", {}, [
      el("div", { class: "small muted", style: "margin-bottom:12px", text: "3人麻雀と4人麻雀でルールを分けて管理します。" }),
      b4, b3,
    ]);
    ctrl = UI.sheet({ title: "ルールの種類を選択", body: body, actions: [{ label: "キャンセル", class: "btn-secondary", onClick: function (c) { c.close(); } }], dismissible: true });
  }

  // ---- フォーム部品 ----
  function num(label, value, opts) {
    opts = opts || {};
    const i = el("input", { type: "number", inputmode: opts.decimal ? "decimal" : "numeric" });
    i.value = (value == null ? "" : value);
    if (opts.step) i.step = opts.step;
    if (opts.placeholder) i.placeholder = opts.placeholder;
    return { row: UI.field(label, i, opts.hint), input: i };
  }
  function sel(label, options, value) {
    const s = el("select");
    options.forEach(function (o) {
      const op = el("option", { value: o.value, text: o.label });
      if (o.value === value) op.selected = true;
      s.appendChild(op);
    });
    return { row: UI.field(label, s), input: s };
  }
  function toggle(label, checked, hint) { return UI.toggle(label, checked, { hint: hint }); }
  function sectionTitle(t) { return el("div", { class: "form-section-title", text: t }); }

  // ---- 追加／編集フォーム ----
  function openForm(rule, isNew) {
    const model = Object.assign({}, rule);
    model.umaPoints = (rule.umaPoints || []).slice();
    const pc = D.playerCount(model.mahjongType);

    const nameInput = el("input", { type: "text", value: model.name || "", placeholder: "例: 仲間内ルール" });
    const initial = num("初期持ち点", model.initialScore);
    const ret = num("返し点", model.returnScore);
    const pp1000 = num("1000点あたりのポイント", model.pointPer1000, { decimal: true, step: "0.1", hint: "通常は 1" });

    const hasOka = toggle("オカあり", model.hasOka);
    const okaPt = num("オカポイント(pt)", model.okaPoint, { decimal: true, hint: "推奨 " + D.suggestedOka(model) });
    hasOka.input.addEventListener("change", function () { okaPt.row.style.display = hasOka.input.checked ? "" : "none"; });
    okaPt.row.style.display = model.hasOka ? "" : "none";

    // 順位ウマ
    const umaInputs = [];
    const umaRow = el("div", { class: "uma-row" });
    for (let i = 0; i < pc; i++) {
      const inp = el("input", { type: "number", inputmode: "numeric" });
      inp.value = (model.umaPoints[i] != null ? model.umaPoints[i] : 0);
      umaInputs.push(inp);
      umaRow.appendChild(el("div", { class: "uma-cell" }, [el("label", { text: (i + 1) + "位" }), inp]));
    }

    const bust = sel("飛び判定", [
      { value: D.BustRule.zeroOrBelow, label: "0点以下で飛び" },
      { value: D.BustRule.belowZero, label: "0点未満で飛び" },
      { value: D.BustRule.manual, label: "手動判定" },
    ], model.bustRule);
    const noNeg = toggle("箱下なし", model.noNegativeSettlement, "精算で0点未満を0点扱いにする");

    const hasTobi = toggle("飛び賞あり", model.hasTobiBonus);
    const tobiPt = num("飛び賞ポイント(pt)", model.tobiBonusPoint, { decimal: true });
    const tobiPay = sel("支払い方式", [
      { value: D.TobiPaymentType.winnerPlusLoserMinus, label: "飛ばした人+/飛んだ人-" },
      { value: D.TobiPaymentType.bonusOnly, label: "飛ばした人のみ+" },
    ], model.tobiPaymentType);
    const tobiBox = el("div", {}, [tobiPt.row, tobiPay.row]);
    hasTobi.input.addEventListener("change", function () { tobiBox.style.display = hasTobi.input.checked ? "" : "none"; });
    tobiBox.style.display = model.hasTobiBonus ? "" : "none";

    const chipUnit = num("チップ単価(円/枚)", model.chipUnitAmount);
    const rate = num("ポイント→円レート(円/1pt)", model.pointToYenRate, { placeholder: "未設定", hint: "設定するとチップ込みを金額換算" });
    const shugiSel = sel("役満祝儀の処理", [
      { value: "none", label: "なし" }, { value: "chip", label: "チップ(枚)" },
      { value: "point", label: "ポイント(pt)" }, { value: "yen", label: "金額(円)" },
    ], model.yakumanShugiType || "chip");

    const rounding = sel("小数点処理", [
      { value: D.RoundingRule.none, label: "なし（小数保持）" },
      { value: D.RoundingRule.roundHalfUp, label: "四捨五入" },
      { value: D.RoundingRule.floor, label: "切り捨て" },
      { value: D.RoundingRule.ceil, label: "切り上げ" },
      { value: D.RoundingRule.goshaRokunyu, label: "五捨六入" },
    ], model.roundingRule);

    const memoInput = el("textarea", { placeholder: "メモ（任意）" });
    memoInput.value = model.memo || "";
    const active = toggle("有効", model.isActive, "無効にすると新規対局・部屋の選択肢から外れます");

    const dup = isNew ? null : el("button", { class: "btn btn-secondary", style: "margin-top:8px", onclick: function () { duplicate(rule); } }, "このルールを複製");

    const body = el("div", {}, [
      sectionTitle("基本"),
      UI.field("ルール名", nameInput),
      el("div", { class: "small muted", style: "margin-bottom:8px" }, [el("span", { class: "badge " + (model.mahjongType === D.MahjongType.four ? "four" : "three"), text: D.typeName(model.mahjongType) })]),

      sectionTitle("点数"),
      el("div", { class: "inline-fields" }, [initial.row, ret.row]),
      hasOka.row, okaPt.row,
      UI.field("順位ウマ(pt)", umaRow),
      pp1000.row,

      sectionTitle("飛び"),
      bust.row, noNeg.row, hasTobi.row, tobiBox,

      sectionTitle("チップ・役満祝儀"),
      chipUnit.row, rate.row, shugiSel.row,

      sectionTitle("その他"),
      rounding.row,
      el("div", { class: "small muted", style: "margin:2px 0 12px" }, "同点時の順位: 起家に近い方を上位"),
      UI.field("メモ", memoInput),
      active.row,
      dup,
    ]);

    const actions = [];
    if (!isNew) actions.push({ label: "削除", class: "btn-danger", onClick: function (ctrl) { tryDelete(rule, ctrl); } });
    actions.push({ label: "キャンセル", class: "btn-secondary", onClick: function (ctrl) { ctrl.close(); } });
    actions.push({
      label: "保存", class: "btn-primary", onClick: function (ctrl) {
        const name = nameInput.value.trim();
        if (!name) { UI.toast("ルール名を入力してください"); return; }
        model.name = name;
        model.initialScore = parseInt(initial.input.value, 10) || 0;
        model.returnScore = parseInt(ret.input.value, 10) || 0;
        model.pointPer1000 = parseFloat(pp1000.input.value) || 1;
        model.hasOka = hasOka.input.checked;
        model.okaPoint = parseFloat(okaPt.input.value) || 0;
        model.umaPoints = umaInputs.map(function (i) { return parseFloat(i.value) || 0; });
        model.bustRule = bust.input.value;
        model.noNegativeSettlement = noNeg.input.checked;
        model.hasTobiBonus = hasTobi.input.checked;
        model.tobiBonusPoint = parseFloat(tobiPt.input.value) || 0;
        model.tobiPaymentType = tobiPay.input.value;
        model.chipUnitAmount = parseInt(chipUnit.input.value, 10) || 0;
        const rv = String(rate.input.value).trim();
        model.pointToYenRate = rv === "" ? null : (parseInt(rv, 10) || null);
        model.yakumanShugiType = shugiSel.input.value;
        model.roundingRule = rounding.input.value;
        model.memo = memoInput.value.trim();
        model.isActive = active.input.checked;
        S.upsert("rules", model);
        ctrl.close();
        UI.toast(isNew ? "ルールを作成しました" : "保存しました");
        MJ.rerender();
      },
    });

    UI.sheet({ title: isNew ? "新規ルール" : "ルールを編集", body: body, actions: actions });
  }

  function duplicate(rule) {
    const copy = Object.assign({}, rule);
    copy.id = D.uuid();
    copy.name = (rule.name || "ルール") + " のコピー";
    copy.umaPoints = (rule.umaPoints || []).slice();
    copy.isSample = false;
    copy.isDeleted = false;
    copy.deletedAt = null;
    copy.createdAt = D.nowISO();
    copy.updatedAt = D.nowISO();
    S.upsert("rules", copy);
    UI.toast("複製しました");
    MJ.rerender();
  }

  function tryDelete(rule, formCtrl) {
    const u = usageCount(rule.id);
    if (u.matches > 0 || u.rooms > 0) {
      UI.confirm({
        title: "このルールは削除できません",
        message: "このルールは " + u.matches + " 戦・" + u.rooms + " 部屋で使用中です。\n履歴を守るため、削除ではなく「無効化」をおすすめします。無効にすると新規の選択肢から外れますが、既存の対局・部屋には影響しません。",
        confirmText: "無効にする",
        cancelText: "キャンセル",
      }).then(function (ok) {
        if (!ok) return;
        rule.isActive = false;
        S.upsert("rules", rule);
        formCtrl.close();
        UI.toast("無効にしました");
        MJ.rerender();
      });
    } else {
      UI.confirm({
        title: "このルールを削除しますか？",
        message: "この操作は元に戻せません。",
        confirmText: "削除する",
        cancelText: "キャンセル",
        danger: true,
      }).then(function (ok) {
        if (!ok) return;
        S.remove("rules", rule.id);
        formCtrl.close();
        UI.toast("削除しました");
        MJ.rerender();
      });
    }
  }
};
