/* 共通UI部品: ボトムシート(モーダル)と確認ダイアログ。MJ.ui を拡張する。 */
(function () {
  "use strict";
  const UI = MJ.ui;
  const el = UI.el;

  /* ボトムシート。
     opts: { title, body(Node), actions:[{label,class,onClick(ctrl)}], dismissible }
     戻り値: { close() } */
  UI.sheet = function (opts) {
    opts = opts || {};
    const overlay = el("div", { class: "overlay" });
    const card = el("div", { class: "sheet" });

    if (opts.title) {
      card.appendChild(el("div", { class: "sheet-header" }, [el("h2", { text: opts.title })]));
    }
    if (opts.body) card.appendChild(opts.body);

    const ctrl = {
      close: function () {
        if (!overlay.parentNode) return;
        overlay.remove();
        document.removeEventListener("keydown", onKey);
        if (opts.onClose) opts.onClose();
      },
    };

    if (opts.actions && opts.actions.length) {
      const row = el("div", { class: "sheet-actions" });
      opts.actions.forEach(function (a) {
        row.appendChild(el("button", {
          class: "btn " + (a.class || "btn-secondary"),
          onclick: function () { a.onClick(ctrl); },
        }, a.label));
      });
      card.appendChild(row);
    }

    function onKey(e) { if (e.key === "Escape" && opts.dismissible) ctrl.close(); }
    if (opts.dismissible) {
      overlay.addEventListener("click", function (e) { if (e.target === overlay) ctrl.close(); });
      document.addEventListener("keydown", onKey);
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    return ctrl;
  };

  /* 確認ダイアログ。Promise<boolean> を返す。
     opts: { title, message, confirmText, cancelText, danger, dismissible } */
  UI.confirm = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      let settled = false;
      function done(v) { if (settled) return; settled = true; ctrl.close(); resolve(v); }

      const lines = (opts.message || "").split("\n").map(function (t) { return el("p", { text: t }); });
      const body = el("div", { class: "dialog-msg" }, lines);

      const actions = [
        { label: opts.cancelText || "キャンセル", class: "btn-secondary", onClick: function () { done(false); } },
        { label: opts.confirmText || "OK", class: opts.danger ? "btn-danger" : "btn-primary", onClick: function () { done(true); } },
      ];

      const ctrl = UI.sheet({
        title: opts.title || "",
        body: body,
        actions: actions,
        dismissible: opts.dismissible !== false,
        onClose: function () { if (!settled) { settled = true; resolve(false); } },
      });
    });
  };

  /* フォーム1項目（ラベル＋入力）を組む補助。 */
  UI.field = function (label, input, hint) {
    const children = [el("label", { text: label }), input];
    if (hint) children.push(el("div", { class: "small muted", style: "margin-top:4px", text: hint }));
    return el("div", { class: "field" }, children);
  };
})();
