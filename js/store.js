/* 保存層: localStorage に1つのJSONドキュメントとして保存。
   将来 IndexedDB やサーバー同期へ差し替えやすいよう、ここに入出力を集約する。 */
window.MJ = window.MJ || {};
MJ.store = (function () {
  "use strict";

  const KEY = "mahjong-score:v1";
  const empty = function () { return { schemaVersion: 2, players: [], rules: [], rooms: [], matches: [], sessions: [] }; };

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
    // 後方互換: 各コレクションを配列として保証（壊れた値は []）
    ["players", "rules", "rooms", "matches", "sessions"].forEach(function (k) { if (!Array.isArray(cache[k])) cache[k] = []; });
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
    cache = Object.assign(empty(), doc || {});
    ["players", "rules", "rooms", "matches", "sessions"].forEach(function (k) { if (!Array.isArray(cache[k])) cache[k] = []; });
    persist();
  }

  function clearAll() { cache = empty(); persist(); }

  return {
    load: load, persist: persist,
    all: all, active: active, byId: byId,
    upsert: upsert, remove: remove, softDelete: softDelete,
    replaceAll: replaceAll, clearAll: clearAll,
  };
})();
