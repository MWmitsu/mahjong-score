/* データ管理: バックアップ(JSON書き出し)・復元(読み込み)・CSV出力・全削除。 */
window.MJ = window.MJ || {};
MJ.screens = MJ.screens || {};
MJ.screens.data = function (screen) {
  "use strict";
  const S = MJ.store, D = MJ.domain, UI = MJ.ui;
  const el = UI.el;

  const pname = UI.pname;
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
        if (!doc || typeof doc !== "object" || Array.isArray(doc) || (!doc.players && !doc.sessions && !doc.rules)) { UI.toast("バックアップ形式ではありません"); return; }
        if (["players", "rules", "sessions"].some(function (k) { return doc[k] != null && !Array.isArray(doc[k]); })) { UI.toast("バックアップが壊れています（形式が不正です）"); return; }
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
    const rows = [["日付", "部屋", "種別", "半荘", "プレイヤー", "順位", "粗点", "ポイント", "飛び", "役満"]];
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
      message: "プレイヤー・ルール・部屋をすべて削除します。先にバックアップを取ることをおすすめします。元に戻せません。",
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
  const cloud = MJ.cloud ? MJ.cloud.status() : { available: false };
  const cloudCard = el("div", { class: "card" }, [el("h2", { text: "クラウド同期（自動バックアップ）" })]);
  if (!cloud.available) {
    if (location.protocol === "file:") {
      cloudCard.appendChild(el("div", { class: "small", text: "いまパソコン内のファイルを直接開いています。クラウド同期は使えません。" }));
      cloudCard.appendChild(el("div", { class: "small muted", style: "margin:8px 0 4px", text: "ブラウザで次のアドレスを開いてご利用ください（ブックマーク推奨）：" }));
      cloudCard.appendChild(el("a", { href: "https://mwmitsu.github.io/mahjong-score/", target: "_blank", rel: "noopener", style: "word-break:break-all;color:var(--accent,#2e7d32)", text: "https://mwmitsu.github.io/mahjong-score/" }));
    } else {
      cloudCard.appendChild(el("div", { class: "small muted", text: "オンラインで開くと、Googleログインで自動バックアップ・複数端末同期が使えます。" }));
    }
  } else if (cloud.signedIn) {
    cloudCard.appendChild(el("div", { class: "small", style: "color:var(--pos);font-weight:600", text: "✓ 同期中：" + cloud.email }));
    cloudCard.appendChild(el("div", { class: "small muted", style: "margin:6px 0 10px", text: "入力すると自動でクラウドに保存され、別の端末でも同じデータが見られます。手動バックアップは不要です。" }));
    cloudCard.appendChild(el("button", { class: "btn btn-secondary", onclick: function () { MJ.cloud.signOut(); } }, "ログアウト"));
  } else {
    cloudCard.appendChild(el("div", { class: "small muted", style: "margin-bottom:10px", text: "Googleでログインすると、データが自動でクラウドに保存され、機種変更や複数端末でも消えません。" }));
    cloudCard.appendChild(el("button", { class: "btn btn-primary", onclick: function () { MJ.cloud.signIn(); } }, "Googleでログイン"));
  }
  screen.appendChild(cloudCard);

  const counts = el("div", { class: "card" }, [
    el("h2", { text: "現在のデータ" }),
    row("プレイヤー", S.active("players").length + "人"),
    row("ルール", S.active("rules").length + "件"),
    row("部屋", S.active("sessions").length + "件"),
  ]);
  screen.appendChild(counts);

  // ---- エラー表示（！マーク）の設定 ----
  const st = S.getSettings();
  function toggleRow(label, on, onChange) { return UI.toggle(label, on, { onChange: onChange }).row; }
  const errCard = el("div", { class: "card" }, [
    el("h2", { text: "エラー表示（！マーク）" }),
    el("div", { class: "small muted", style: "margin-bottom:8px", text: "成績表で合計が合わない行に赤い！を表示します。項目ごとにオン/オフできます。" }),
    toggleRow("ポイントの合計が0でないとき", st.showPtError !== false, function (v) { S.setSetting("showPtError", v); }),
    toggleRow("粗点の合計が合わないとき", st.showRawError !== false, function (v) { S.setSetting("showRawError", v); }),
    toggleRow("チップの合計が0でないとき", st.showChipError !== false, function (v) { S.setSetting("showChipError", v); }),
  ]);
  screen.appendChild(errCard);

  const backup = el("div", { class: "card" }, [el("h2", { text: "バックアップ・復元" })]);
  backup.appendChild(el("button", { class: "btn btn-primary", style: "margin-bottom:8px", onclick: exportJSON }, "バックアップを書き出す（JSON）"));
  backup.appendChild(el("button", { class: "btn btn-secondary", style: "margin-bottom:8px", onclick: importJSON }, "バックアップから復元（JSON読み込み）"));
  backup.appendChild(el("div", { class: "small muted", text: "端末の機種変更・ブラウザ削除に備えて、ときどき書き出して保存してください。" }));
  screen.appendChild(backup);

  const csv = el("div", { class: "card" }, [el("h2", { text: "CSV出力" })]);
  csv.appendChild(el("button", { class: "btn btn-secondary", onclick: exportCSV }, "半荘明細をCSV出力"));
  csv.appendChild(el("div", { class: "small muted", style: "margin-top:8px", text: "Excel等で開けます（日付・部屋・順位・粗点・ポイント・飛び・役満）。" }));
  screen.appendChild(csv);

  const sample = el("div", { class: "card" }, [el("h2", { text: "サンプルデータ" })]);
  sample.appendChild(el("button", { class: "btn btn-secondary", onclick: function () { MJ.sample.clearSample(); UI.toast("サンプルデータを削除しました"); MJ.rerender(); } }, "サンプルデータを削除"));
  sample.appendChild(el("div", { class: "small muted", style: "margin-top:8px", text: "お試しで入れたサンプル（プレイヤー・部屋）だけを削除します。あなたが作ったデータは消えません。" }));
  screen.appendChild(sample);

  const danger = el("div", { class: "card" }, [el("h2", { text: "危険な操作" })]);
  danger.appendChild(el("button", { class: "btn btn-danger", onclick: clearAll }, "すべてのデータを削除"));
  screen.appendChild(danger);

  function row(label, value) { return el("div", { class: "stat-row" }, [el("span", { text: label }), el("span", { class: "v num", text: value })]); }
};
