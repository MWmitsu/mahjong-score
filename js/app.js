/* アプリ本体: 簡易ハッシュルーター＋ホーム画面。
   各機能画面はフェーズ2以降で js/screens/*.js に追加していく。 */
(function () {
  "use strict";
  const UI = MJ.ui, S = MJ.store, D = MJ.domain;
  MJ.screens = MJ.screens || {};

  const titles = {
    home: "麻雀スコア",
    rooms: "部屋",
    sheet: "部屋",
    playerStats: "プレイヤー別成績",
    ranking: "ランキング",
    rules: "ルール管理",
    players: "プレイヤー管理",
    data: "データ管理",
  };

  function navigate(route) { location.hash = "#" + route; }
  MJ.navigate = navigate;
  MJ.rerender = function () { render(); };
  MJ.openSheet = function (id) { MJ._sessionId = id; try { localStorage.setItem("mahjong:lastSheet", id); } catch (e) {} navigate("sheet"); };

  function currentRoute() {
    const h = (location.hash || "#home").replace(/^#/, "");
    return h || "home";
  }

  function render() {
    const route = currentRoute();
    const screen = document.getElementById("screen");
    const title = document.getElementById("app-title");
    const back = document.getElementById("back-btn");
    UI.clear(screen);

    title.textContent = titles[route] || "麻雀スコア";
    back.hidden = (route === "home");

    const renderer = (route === "home") ? renderHome : MJ.screens[route];
    if (renderer) {
      try { renderer(screen); }
      catch (e) { console.error(e); screen.appendChild(UI.el("div", { class: "empty", text: "画面の表示でエラー: " + e.message })); }
    } else {
      renderPlaceholder(screen, titles[route] || route);
    }
    window.scrollTo(0, 0);
  }

  function renderPlaceholder(screen, name) {
    screen.appendChild(UI.el("div", { class: "empty" }, [
      UI.el("div", { html: "🛠️", class: "emoji" }),
      UI.el("p", { text: name + " は次のフェーズで実装します。" }),
    ]));
  }

  // ---- ホーム ----
  function renderHome(screen) {
    // 主アクション：部屋（成績をつける）を開く
    screen.appendChild(UI.el("button", { class: "btn btn-primary home-cta", onclick: function () { navigate("rooms"); } }, "📋 成績をつける（部屋）"));

    const menu = [
      { section: "成績" },
      { route: "playerStats", emoji: "👤", label: "プレイヤー別成績" },
      { route: "ranking", emoji: "🏆", label: "ランキング" },
      { section: "管理" },
      { route: "rules", emoji: "⚙️", label: "ルール管理" },
      { route: "players", emoji: "🧑‍🤝‍🧑", label: "プレイヤー管理" },
      { route: "data", emoji: "💾", label: "データ管理（バックアップ）" },
    ];
    const list = UI.el("div", { class: "menu" });
    menu.forEach(function (m) {
      if (m.section) { list.appendChild(UI.el("div", { class: "menu-section-title", text: m.section })); return; }
      list.appendChild(UI.el("button", { class: "tile", onclick: function () { navigate(m.route); } }, [
        UI.el("span", { class: "emoji", text: m.emoji }),
        UI.el("span", { text: m.label }),
        UI.el("span", { class: "chev", text: "›" }),
      ]));
    });
    screen.appendChild(list);

    // データ概要
    const counts = UI.el("div", { class: "card" }, [UI.el("h2", { text: "データ" })]);
    const totalHanchans = S.active("sessions").reduce(function (a, s) { return a + (s.hanchans || []).length; }, 0);
    [["プレイヤー", S.active("players").length], ["ルール", S.active("rules").length],
     ["部屋", S.active("sessions").length], ["半荘", totalHanchans]].forEach(function (row) {
      counts.appendChild(UI.el("div", { class: "stat-row" }, [
        UI.el("span", { text: row[0] }), UI.el("span", { class: "v num", text: String(row[1]) }),
      ]));
    });
    screen.appendChild(counts);

  }

  window.addEventListener("hashchange", render);
  document.getElementById("back-btn").addEventListener("click", function () {
    const rt = currentRoute();
    if (rt === "sheet") navigate("rooms");
    else if (rt !== "home") navigate("home");
  });

  // 起動時: 初期ルールが無ければ作成・クラウド同期を初期化
  MJ.sample.seedDefaultRulesIfNeeded();
  if (MJ.cloud && MJ.cloud.init) { MJ.cloud.init(); MJ.cloud.onChange(function () { render(); }); }
  render();
})();
