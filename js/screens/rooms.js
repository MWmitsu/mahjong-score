/* 部屋一覧（成績表シートの一覧）。新規作成→シート画面へ。 */
window.MJ = window.MJ || {};
MJ.screens = MJ.screens || {};
MJ.screens.rooms = function (screen) {
  "use strict";
  const S = MJ.store, D = MJ.domain, UI = MJ.ui;
  const el = UI.el;

  const pname = UI.pname;

  screen.appendChild(el("button", { class: "btn btn-primary home-cta", onclick: function () { chooseType(); } }, "＋ 新規部屋"));

  const sessions = S.active("sessions").slice().sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });

  if (sessions.length === 0) {
    screen.appendChild(el("div", { class: "empty", text: "部屋がありません。「＋ 新規部屋」から作成してください。" }));
    return;
  }

  const list = el("div", { class: "menu", style: "margin-top:14px" });
  sessions.forEach(function (s) {
    const names = (s.playerIds || []).map(pname).join("・");
    list.appendChild(el("button", { class: "tile", onclick: function () { MJ.openSheet(s.id); } }, [
      el("span", { class: "emoji", text: "📋" }),
      el("span", { style: "min-width:0; flex:1" }, [
        el("div", {}, [
          el("span", { text: s.name || "(部屋)" }),
          el("span", { class: "badge " + (s.mahjongType === D.MahjongType.four ? "four" : "three"), style: "margin-left:6px", text: D.typeShort(s.mahjongType) }),
        ]),
        el("div", { class: "small muted", text: UI.fmtDate(s.date) + " ・ " + (s.hanchans || []).length + "半荘" }),
        el("div", { class: "small muted", text: names }),
      ]),
      el("span", { class: "chev", text: "›" }),
    ]));
  });
  screen.appendChild(list);

  // ---- 新規作成 ----
  function chooseType() {
    let ctrl;
    const b4 = el("button", { class: "btn btn-primary", style: "margin-bottom:10px", onclick: function () { ctrl.close(); openCreate(D.MahjongType.four); } }, "4人麻雀");
    const b3 = el("button", { class: "btn btn-primary", onclick: function () { ctrl.close(); openCreate(D.MahjongType.three); } }, "3人麻雀");
    ctrl = UI.sheet({ title: "種類を選択", body: el("div", {}, [el("div", { class: "small muted", style: "margin-bottom:12px", text: "3人麻雀・4人麻雀のどちらの部屋を作りますか？" }), b4, b3]), actions: [{ label: "キャンセル", class: "btn-secondary", onClick: function (c) { c.close(); } }], dismissible: true });
  }

  function openCreate(type) {
    const gs = D.playerCount(type);
    const rules = S.active("rules").filter(function (r) { return r.mahjongType === type && r.isActive; });
    const now = new Date();
    const defName = (now.getMonth() + 1) + "/" + now.getDate() + " の部屋";

    const nameInput = el("input", { type: "text", value: defName });
    const rateInput = el("input", { type: "number", inputmode: "numeric", value: (rules[0] && rules[0].pointToYenRate) || 50 });

    let ruleSel = null;
    if (rules.length > 0) {
      ruleSel = el("select");
      rules.forEach(function (r) { ruleSel.appendChild(el("option", { value: r.id, text: r.name })); });
    }

    // メンバー（席数以上：3麻でも4人以上で回す場合に全員登録できる）
    const activePlayers = S.active("players").filter(function (p) { return p.isActive; });
    const chosen = [];
    const counter = el("div", { class: "small", style: "margin-bottom:6px" });
    function updateCounter() { counter.textContent = "選択 " + chosen.length + "人（最低 " + gs + "人）"; counter.style.color = chosen.length >= gs ? "var(--pos)" : "var(--warn)"; }
    const checklist = el("div", { class: "check-list" });
    if (activePlayers.length === 0) {
      checklist.appendChild(el("div", { class: "small muted", style: "padding:12px", text: "有効なプレイヤーがいません。プレイヤー管理で追加してください。" }));
    } else {
      activePlayers.forEach(function (p) {
        const cb = el("input", { type: "checkbox" });
        cb.addEventListener("change", function () {
          if (cb.checked) chosen.push(p.id); else { const i = chosen.indexOf(p.id); if (i >= 0) chosen.splice(i, 1); }
          updateCounter();
        });
        checklist.appendChild(el("label", { class: "check-item" }, [el("span", { text: p.name }), cb]));
      });
    }
    updateCounter();

    const body = el("div", {}, [
      UI.field("名前", nameInput),
      el("div", { class: "small muted", style: "margin-bottom:8px" }, [el("span", { class: "badge " + (type === D.MahjongType.four ? "four" : "three"), text: D.typeName(type) })]),
      ruleSel ? UI.field("使用ルール", ruleSel) : UI.field("使用ルール", el("div", { class: "small", style: "color:var(--warn)", text: D.typeName(type) + "のルールがありません。先にルール管理で作成してください。" })),
      UI.field("レート（円 / 1ポイント）", rateInput),
      UI.field("メンバー（" + gs + "人以上）", el("div", {}, [
        el("div", { class: "small muted", style: "margin-bottom:6px", text: gs + "人麻雀でも、" + (gs + 1) + "人以上で交代しながら回す場合は全員を登録できます（半荘ごとに出た" + gs + "人を選びます）。" }),
        counter, checklist,
      ])),
    ]);

    UI.sheet({
      title: "新規部屋",
      body: body,
      actions: [
        { label: "キャンセル", class: "btn-secondary", onClick: function (c) { c.close(); } },
        {
          label: "作成", class: "btn-primary", onClick: function (c) {
            const name = nameInput.value.trim();
            if (!name) { UI.toast("名前を入力してください"); return; }
            if (!ruleSel) { UI.toast("先にルールを作成してください"); return; }
            if (chosen.length < gs) { UI.toast("メンバーを" + gs + "人以上選んでください"); return; }
            const rule = S.byId("rules", ruleSel.value);
            const session = {
              id: D.uuid(), name: name, date: new Date().toISOString(),
              mahjongType: type, ruleSetId: rule.id, ruleName: rule.name,
              rate: parseInt(rateInput.value, 10) || 0, chipUnit: rule.chipUnitAmount,
              shugiType: rule.yakumanShugiType || "chip",
              playerIds: chosen.slice(), hanchans: [], chips: {},
              isSample: false, isDeleted: false, deletedAt: null,
              createdAt: D.nowISO(), updatedAt: D.nowISO(),
            };
            S.upsert("sessions", session);
            c.close();
            MJ.openSheet(session.id);
          },
        },
      ],
    });
  }
};
