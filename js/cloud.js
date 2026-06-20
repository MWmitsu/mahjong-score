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

  // Firebase Auth は file:// では動かない（http/https/chrome-extension のみ対応）。
  function supportedEnv() { return /^(https?:|chrome-extension:)$/.test(location.protocol); }
  function isAvailable() { return !!(available && auth && supportedEnv()); }
  function status() { return { available: isAvailable(), signedIn: !!user, email: user ? user.email : null }; }
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  // 情報ダイアログ（1ボタン）。エラー内容をユーザーが読めるように表示。
  function infoDialog(title, message) {
    if (!MJ.ui || !MJ.ui.sheet) { alert(title + "\n\n" + message); return; }
    const lines = String(message).split("\n").map(function (t) { return MJ.ui.el("p", { text: t }); });
    MJ.ui.sheet({
      title: title,
      body: MJ.ui.el("div", { class: "dialog-msg" }, lines),
      dismissible: true,
      actions: [{ label: "閉じる", class: "btn-primary", onClick: function (c) { c.close(); } }],
    });
  }

  // ログインは全機種で signInWithPopup に統一。
  // （signInWithRedirect は iOS のホーム画面アプリ＝standalone で認証状態が戻らずループするため使わない）
  function signIn() {
    if (!isAvailable()) {
      if (location.protocol === "file:") {
        infoDialog("オンライン版を開いてください", "いまパソコン内のファイルを直接開いています（file://）。\nこの方式ではGoogleログインは使えません。\n\nブラウザで次のアドレスを開いてから、もう一度ログインしてください：\nhttps://mwmitsu.github.io/mahjong-score/");
      } else if (!supportedEnv()) {
        infoDialog("この環境では使えません", "ブラウザのデータ保存が無効か、対応していない環境で開いています（" + location.protocol + "）。");
      } else {
        infoDialog("オフラインです", "インターネットに接続した状態で、もう一度「Googleでログイン」を押してください。");
      }
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.signInWithPopup(provider).then(function () {
      MJ.ui.toast("ログインしました");
    }).catch(function (e) {
      const code = (e && e.code) || "";
      // ユーザー自身が小窓を閉じた／連続タップ → 何もしない
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/user-cancelled") return;
      if (code === "auth/popup-blocked") {
        infoDialog("ログイン用の小窓がブロックされました", "ブラウザがGoogleログインの小窓をブロックしました。\nこのサイトのポップアップを許可してから、もう一度「Googleでログイン」を押してください。");
        return;
      }
      if (code === "auth/unauthorized-domain") {
        infoDialog("このアドレスは未許可です", "今開いているアドレスがFirebaseに登録されていません。\n\n（エラーコード: " + code + "）\nこの画面を作者に伝えてください。");
        return;
      }
      console.error("signIn", e);
      infoDialog("ログインできませんでした", ((e && e.message) || "不明なエラー") + "\n\n（エラーコード: " + (code || "なし") + "）");
    });
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
