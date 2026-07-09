/* フェーズ2: プレイヤー管理（一覧／追加／編集／有効・無効／削除）。
   履歴ありのプレイヤーは物理削除せず「無効化」へ誘導（過去成績を残す）。 */
window.MJ = window.MJ || {};
MJ.screens = MJ.screens || {};
MJ.screens.players = function (screen) {
  "use strict";
  const S = MJ.store, D = MJ.domain, UI = MJ.ui;
  const el = UI.el;

  // 実際に出場した半荘数（成績表=sessions から集計。旧 matches コレクションは未使用）
  function gamesPlayed(playerId) {
    let n = 0;
    S.active("sessions").forEach(function (s) {
      (s.hanchans || []).forEach(function (h) {
        if ((h.results || []).some(function (r) { return r.playerId === playerId; })) n++;
      });
    });
    return n;
  }
  // 部屋メンバー登録 or 対局結果で参照されているか（物理削除すると(不明)化するため無効化へ誘導）
  function isReferenced(playerId) {
    return S.active("sessions").some(function (s) {
      return (s.playerIds || []).indexOf(playerId) >= 0 ||
        (s.hanchans || []).some(function (h) { return (h.results || []).some(function (r) { return r.playerId === playerId; }); });
    });
  }

  // 新規追加ボタン
  screen.appendChild(el("button", {
    class: "btn btn-primary",
    onclick: function () { openForm(null); },
  }, "＋ 新規プレイヤー"));

  const players = S.active("players").slice().sort(function (a, b) {
    if (!!a.isActive !== !!b.isActive) return a.isActive ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "", "ja");
  });

  if (players.length === 0) {
    screen.appendChild(el("div", { class: "empty", text: "プレイヤーがいません。「＋ 新規プレイヤー」から追加してください。" }));
    return;
  }

  const activeCount = players.filter(function (p) { return p.isActive; }).length;
  screen.appendChild(el("div", { class: "menu-section-title", text: "登録 " + players.length + "人（有効 " + activeCount + "人）" }));

  const list = el("div", { class: "menu" });
  players.forEach(function (p) {
    const mc = gamesPlayed(p.id);
    const sub = mc + "戦" + (p.memo ? " ・ " + p.memo : "");
    list.appendChild(el("button", { class: "tile", onclick: function () { openForm(p); } }, [
      el("span", { class: "emoji", text: p.isActive ? "🧑" : "💤" }),
      el("span", { style: "min-width:0; flex:1" }, [
        el("div", { text: p.name || "(名称未設定)" }),
        el("div", { class: "small muted", text: sub }),
      ]),
      el("span", { class: "badge " + (p.isActive ? "four" : ""), text: p.isActive ? "有効" : "無効" }),
    ]));
  });
  screen.appendChild(list);

  // ---- 追加／編集フォーム ----
  function openForm(player) {
    const isNew = !player;
    const model = isNew
      ? { id: D.uuid(), name: "", memo: "", isActive: true, isSample: false, createdAt: D.nowISO(), updatedAt: D.nowISO() }
      : Object.assign({}, player);

    const nameInput = el("input", { type: "text", value: model.name || "", placeholder: "例: 山田", autocomplete: "off" });
    const memoInput = el("textarea", { placeholder: "メモ（任意）" });
    memoInput.value = model.memo || "";
    const active = UI.toggle("有効", model.isActive, { hint: "無効にすると新規対局の選択肢から外れます" });

    const body = el("div", {}, [
      UI.field("名前", nameInput),
      UI.field("メモ", memoInput),
      active.row,
      isNew ? null : el("div", { class: "small muted", style: "margin-top:8px", text: "登録日: " + UI.fmtDate(model.createdAt) }),
    ]);

    const actions = [];
    if (!isNew) actions.push({ label: "削除", class: "btn-danger", onClick: function (ctrl) { tryDelete(player, ctrl); } });
    actions.push({ label: "キャンセル", class: "btn-secondary", onClick: function (ctrl) { ctrl.close(); } });
    actions.push({
      label: "保存", class: "btn-primary", onClick: function (ctrl) {
        const name = nameInput.value.trim();
        if (!name) { UI.toast("名前を入力してください"); return; }
        model.name = name;
        model.memo = memoInput.value.trim();
        model.isActive = active.input.checked;
        S.upsert("players", model);
        ctrl.close();
        UI.toast(isNew ? "追加しました" : "保存しました");
        MJ.rerender();
      },
    });

    UI.sheet({ title: isNew ? "新規プレイヤー" : "プレイヤーを編集", body: body, actions: actions });
  }

  // ---- 削除（履歴があれば無効化へ誘導） ----
  function tryDelete(player, formCtrl) {
    if (isReferenced(player.id)) {
      const mc = gamesPlayed(player.id);
      UI.confirm({
        title: "このプレイヤーは削除できません",
        message: "このプレイヤーは部屋・対局（" + mc + "戦）で使用されています。\n成績を残すため、削除ではなく「無効化」をおすすめします。無効にすると新規対局の選択肢から外れますが、過去成績は残ります。",
        confirmText: "無効にする",
        cancelText: "キャンセル",
      }).then(function (ok) {
        if (!ok) return;
        player.isActive = false;
        S.upsert("players", player);
        formCtrl.close();
        UI.toast("無効にしました");
        MJ.rerender();
      });
    } else {
      UI.confirm({
        title: "このプレイヤーを削除しますか？",
        message: "この操作は元に戻せません。",
        confirmText: "削除する",
        cancelText: "キャンセル",
        danger: true,
      }).then(function (ok) {
        if (!ok) return;
        S.remove("players", player.id);
        formCtrl.close();
        UI.toast("削除しました");
        MJ.rerender();
      });
    }
  }
};
