/* クラウド同期（Firebase Auth + Firestore）。
   サインインすると localStorage の内容を users/{uid} に自動保存・別端末と同期。
   Firebase SDK(compat) が読み込まれていない/オフライン時は何もしない（ローカルのみで動作）。 */
window.MJ = window.MJ || {};
MJ.cloud = (function () {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyA1FESENiPINRETzsSC9kx7IWwVz2cFMgE",
    authDomain: "mahjong-score-640be.firebaseapp.com",
    projectId: "mahjong-score-640be",
    storageBucket: "mahjong-score-640be.firebasestorage.app",
    messagingSenderId: "984052277684",
    appId: "1:984052277684:web:ecd17b70b7a0ff61a552e1",
  };

  let available = (typeof firebase !== "undefined" && firebase.initializeApp);
  let auth = null, db = null, user = null, unsub = null, pushTimer = null, applyingRemote = false;
  const listeners = [];

  function init() {
    if (!available) return;
    try {
      firebase.initializeApp(firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();
      db.enablePersistence({ synchronizeTabs: true }).catch(function () { /* 複数タブ等で無効でもOK */ });
      auth.getRedirectResult().catch(function (e) { console.warn("redirect result", e && e.code); });
      auth.onAuthStateChanged(function (u) { onAuth(u); });
    } catch (e) { console.error("cloud init", e); available = false; }
  }

  function isAvailable() { return !!(available && auth); }
  function status() { return { available: isAvailable(), signedIn: !!user, email: user ? user.email : null }; }
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  function signIn() {
    if (!isAvailable()) { MJ.ui.toast("オンラインで開いてください"); return; }
    const provider = new firebase.auth.GoogleAuthProvider();
    const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone;
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (standalone || mobile) {
      auth.signInWithRedirect(provider);
    } else {
      auth.signInWithPopup(provider).catch(function (e) {
        if (e && (e.code === "auth/popup-blocked" || e.code === "auth/cancelled-popup-request")) auth.signInWithRedirect(provider);
        else { console.error("signIn", e); MJ.ui.toast("ログインに失敗しました"); }
      });
    }
  }
  function signOutNow() { if (auth) auth.signOut(); }

  function docRef() { return db.collection("users").doc(user.uid); }
  function hasData(d) { return !!(d && ((d.players && d.players.length) || (d.sessions && d.sessions.length) || (d.rules && d.rules.length))); }

  function onAuth(u) {
    user = u;
    if (unsub) { unsub(); unsub = null; }
    if (!u) { emit(); return; }
    emit();
    docRef().get().then(function (snap) {
      return reconcile(snap.exists ? snap.data() : null);
    }).catch(function (e) { console.error("cloud get", e); }).then(function () {
      subscribe();
      emit();
    });
  }

  function reconcile(cloud) {
    const local = MJ.store.load();
    if (!hasData(cloud)) { pushNow(); return; }            // クラウドが空 → ローカルを上げる
    if (!hasData(local)) { applyRemote(cloud); return; }   // ローカルが空 → クラウドを取り込む
    // 両方にデータ → どちらを使うかユーザーに確認
    return MJ.ui.confirm({
      title: "データの同期",
      message: "この端末とクラウドの両方にデータがあります。どちらに統一しますか？",
      confirmText: "クラウドを使う", cancelText: "この端末を使う", dismissible: false,
    }).then(function (useCloud) {
      if (useCloud) applyRemote(cloud); else pushNow();
    });
  }

  function applyRemote(doc) {
    applyingRemote = true;
    MJ.store.replaceAll(doc);
    applyingRemote = false;
    if (MJ.rerender) MJ.rerender();
  }

  function subscribe() {
    unsub = docRef().onSnapshot(function (snap) {
      if (!snap.exists || snap.metadata.hasPendingWrites) return; // 自分の書き込みは無視
      applyRemote(snap.data());
    }, function (e) { console.error("snapshot", e); });
  }

  // localStorage が変わるたびに呼ばれる（store.persist からフック）
  function onLocalChange() {
    if (applyingRemote || !user || !db) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 800);
  }
  function pushNow() {
    if (!user || !db) return;
    const doc = MJ.store.load();
    doc._updatedAt = MJ.domain.nowISO();
    docRef().set(doc).catch(function (e) { console.error("cloud push", e); });
  }

  return { init: init, status: status, signIn: signIn, signOut: signOutNow, onChange: onChange, onLocalChange: onLocalChange, pushNow: pushNow };
})();
