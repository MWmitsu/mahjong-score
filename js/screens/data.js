/* データ管理: バックアップ(JSON書き出し)・復元(読み込み)・CSV出力・全削除。 */
window.MJ = window.MJ || {};
MJ.screens = MJ.screens || {};
MJ.screens.data = function (screen) {
  "use strict";
  const S = MJ.store, D = MJ.domain, UI = MJ.ui;
  const el = UI.el;

  function pname(id) { const p = S.byId("players", id); return p ? p.name : "(不明)"; }
  function stamp() { const d = new Date(); function z(n) { return (n < 10 ? "0" : "") + n; } return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes()); }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  function csvCell(v) {
    const s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // ---- バックアップ（JSON） ----
  function exportJSON() {
    const doc = S.load();
    download("mahjong-backup-" + stamp() + ".json", JSON.stringify(doc, null, 2), "application/json");
    UI.toast("バックアップを書き出しました");
  }

  // ---- 復元（JSON読み込み） ----
  function importJSON() {
    const input = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    input.addEventListener("change", function () {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        let doc;
        try { doc = JSON.parse(reader.result); } catch (e) { UI.toast("ファイルを読み込めませんでした"); return; }
        if (!doc || (!doc.players && !doc.sessions && !doc.rules)) { UI.toast("バックアップ形式ではありません"); return; }
        UI.confirm({
          title: "データを復元しますか？",
          message: "現在のデータをこのバックアップで置き換えます。この操作は元に戻せません。",
          confirmText: "復元する", cancelText: "キャンセル", danger: true,
        }).then(function (ok) {
          if (!ok) return;
          S.replaceAll(doc);
          UI.toast("復元しました");
          MJ.rerender();
        });
      };
      reader.readAsText(f);
    });
    document.body.appendChild(input); input.click();
    setTimeout(function () { if (input.parentNode) document.body.removeChild(input); }, 60000);
  }

  // ---- CSV出力（半荘明細） ----
  function exportCSV() {
    const rows = [["日付", "成績表", "種別", "半荘", "プレイヤー", "順位", "粗点", "ポイント", "飛び", "役満"]];
    S.active("sessions").slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (s) {
      (s.hanchans || []).forEach(function (h, i) {
        const shugiVals = MJ.sheets.shugiValuesOf(h, s.playerIds) || {};
        (h.results || []).slice().sort(function (a, b) { return a.rank - b.rank; }).forEach(function (r) {
          rows.push([
            (s.date || "").slice(0, 10), s.name, D.typeShort(s.mahjongType), i + 1,
            pname(r.playerId), r.rank, r.rawScore, r.totalPointWithoutChip,
            r.isBusted ? 1 : 0, (shugiVals[r.playerId] || 0) > 0 ? 1 : 0,
          ]);
        });
      });
    });
    if (rows.length <= 1) { UI.toast("出力する対局がありません"); return; }
    const csv = "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
    download("mahjong-hanchan-" + stamp() + ".csv", csv, "text/csv");
    UI.toast("CSVを書き出しました");
  }

  // ---- 全データ削除 ----
  function clearAll() {
    UI.confirm({
      title: "すべてのデータを削除しますか？",
      message: "プレイヤー・ルール・成績表をすべて削除します。先にバックアップを取ることをおすすめします。元に戻せません。",
      confirmText: "全部削除する", cancelText: "キャンセル", danger: true,
    }).then(function (ok) {
      if (!ok) return;
      S.clearAll();
      MJ.sample.seedDefaultRulesIfNeeded();
      UI.toast("すべて削除しました");
      MJ.navigate("home");
    });
  }

  // ---- 画面 ----
  const counts = el("div", { class: "card" }, [
    el("h2", { text: "現在のデータ" }),
    row("プレイヤー", S.active("players").length + "人"),
    row("ルール", S.active("rules").length + "件"),
    row("成績表", S.active("sessions").length + "件"),
  ]);
  screen.appendChild(counts);

  const backup = el("div", { class: "card" }, [el("h2", { text: "バックアップ・復元" })]);
  backup.appendChild(el("button", { class: "btn btn-primary", style: "margin-bottom:8px", onclick: exportJSON }, "バックアップを書き出す（JSON）"));
  backup.appendChild(el("button", { class: "btn btn-secondary", style: "margin-bottom:8px", onclick: importJSON }, "バックアップから復元（JSON読み込み）"));
  backup.appendChild(el("div", { class: "small muted", text: "端末の機種変更・ブラウザ削除に備えて、ときどき書き出して保存してください。" }));
  screen.appendChild(backup);

  const csv = el("div", { class: "card" }, [el("h2", { text: "CSV出力" })]);
  csv.appendChild(el("button", { class: "btn btn-secondary", onclick: exportCSV }, "半荘明細をCSV出力"));
  csv.appendChild(el("div", { class: "small muted", style: "margin-top:8px", text: "Excel等で開けます（日付・成績表・順位・粗点・ポイント・飛び・役満）。" }));
  screen.appendChild(csv);

  const danger = el("div", { class: "card" }, [el("h2", { text: "危険な操作" })]);
  danger.appendChild(el("button", { class: "btn btn-danger", onclick: clearAll }, "すべてのデータを削除"));
  screen.appendChild(danger);

  function row(label, value) { return el("div", { class: "stat-row" }, [el("span", { text: label }), el("span", { class: "v num", text: value })]); }
};
