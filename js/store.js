/* 保存層: localStorage に1つのJSONドキュメントとして保存。
   将来 IndexedDB やサーバー同期へ差し替えやすいよう、ここに入出力を集約する。 */
window.MJ = window.MJ || {};
MJ.store = (function () {
  "use strict";

  const KEY = "mahjong-score:v1";
  const KINDS = ["players", "rules", "sessions"];
  const empty = function () { return { schemaVersion: 3, players: [], rules: [], sessions: [] }; };

  // 各コレクションを配列として保証し、旧構造(rooms/matches＝未使用)を取り除く（移行）
  function normalize(c) {
    KINDS.forEach(function (k) { if (!Array.isArray(c[k])) c[k] = []; });
    delete c.rooms; delete c.matches;
    c.schemaVersion = 3;
    return c;
  }

  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      // オブジェクト(非配列)でなければ壊れているとみなし初期化
      cache = (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : empty();
    } catch (e) {
      console.error("読み込み失敗。初期化します。", e);
      cache = empty();
    }
    // 後方互換: 配列保証＋旧構造(rooms/matches)の除去
    normalize(cache);
    return cache;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch (e) {
      console.error("保存失敗", e);
      MJ.ui && MJ.ui.toast && MJ.ui.toast("保存に失敗しました（容量不足の可能性）");
    }
    if (window.MJ && MJ.cloud && MJ.cloud.onLocalChange) MJ.cloud.onLocalChange();
  }

  function all(kind) { return load()[kind].slice(); }

  // 有効（未削除）のみ
  function active(kind) {
    return load()[kind].filter(function (x) { return !x.isDeleted; });
  }

  function byId(kind, id) {
    return load()[kind].find(function (x) { return x.id === id; }) || null;
  }

  function upsert(kind, obj) {
    const list = load()[kind];
    const idx = list.findIndex(function (x) { return x.id === obj.id; });
    obj.updatedAt = MJ.domain.nowISO();
    if (idx >= 0) list[idx] = obj; else list.push(obj);
    persist();
    return obj;
  }

  function remove(kind, id) {
    const list = load()[kind];
    const idx = list.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) { list.splice(idx, 1); persist(); }
  }

  // 論理削除（将来の復元用）。
  function softDelete(kind, id) {
    const obj = byId(kind, id);
    if (!obj) return;
    obj.isDeleted = true;
    obj.deletedAt = MJ.domain.nowISO();
    persist();
  }

  function replaceAll(doc) {
    cache = normalize(Object.assign(empty(), doc || {}));
    persist();
  }

  function clearAll() { cache = empty(); persist(); }

  // 表示設定など、アプリ全体の設定（全端末で同期される）
  function getSettings() { const c = load(); return c.settings || {}; }
  function setSetting(key, val) { const c = load(); c.settings = c.settings || {}; c.settings[key] = val; persist(); }

  // ---- クラウド同期のリモート適用（部分マージ。sessions は残す/1件だけ差し替え） ----
  // メイン（players/rules/settings）だけをリモートで置き換え、sessions は保持する。
  function applyRemoteMain(main) {
    const c = load();
    if (main) {
      c.players = Array.isArray(main.players) ? main.players : [];
      c.rules = Array.isArray(main.rules) ? main.rules : [];
      c.settings = main.settings || {};
    }
    persist();
  }
  // 1部屋（session）だけをリモートで追加/更新する。
  function applyRemoteSession(session) {
    if (!session || !session.id) return;
    const c = load();
    const idx = c.sessions.findIndex(function (s) { return s.id === session.id; });
    if (idx >= 0) c.sessions[idx] = session; else c.sessions.push(session);
    persist();
  }
  // 1部屋（session）をリモート削除に合わせてローカルからも消す。
  function removeRemoteSession(id) {
    const c = load();
    const idx = c.sessions.findIndex(function (s) { return s.id === id; });
    if (idx >= 0) { c.sessions.splice(idx, 1); persist(); }
  }

  return {
    load: load, persist: persist,
    all: all, active: active, byId: byId,
    upsert: upsert, remove: remove, softDelete: softDelete,
    replaceAll: replaceAll, clearAll: clearAll,
    getSettings: getSettings, setSetting: setSetting,
    applyRemoteMain: applyRemoteMain, applyRemoteSession: applyRemoteSession, removeRemoteSession: removeRemoteSession,
  };
})();
