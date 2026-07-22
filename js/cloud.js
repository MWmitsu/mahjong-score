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

  /* アカウント削除（App Store 5.1.1(v) / Google Play のアカウント削除要件で必須）。
     クラウド上の全データ（部屋のサブコレクション → メイン）を消してから、ログイン用アカウント自体を削除する。
     ローカル(localStorage)のデータは消さない（呼び出し側で選択できるようにする）。 */
  function deleteAccount() {
    if (!isAvailable() || !user || !db) return Promise.reject(new Error("ログインしていません"));
    const u = user;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; } // 削除中に再アップロードしない
    if (unsub) { unsub(); unsub = null; }                          // 受信も止める
    applyingRemote = true;                                         // 以降のローカル変更を送信しない
    return sessionsCol().get()
      .then(function (snap) { return Promise.all(snap.docs.map(function (d) { return d.ref.delete(); })); })
      .then(function () { return docRef().delete(); })
      .then(function () {
        return u.delete().catch(function (e) {
          // 前回ログインから時間が経つと再認証を求められる
          if (e && e.code === "auth/requires-recent-login") {
            const provider = new firebase.auth.GoogleAuthProvider();
            return u.reauthenticateWithPopup(provider).then(function () { return u.delete(); });
          }
          throw e;
        });
      })
      .then(function () { lastMain = null; lastSession = {}; applyingRemote = false; })
      .catch(function (e) { applyingRemote = false; throw e; });
  }

  function docRef() { return db.collection("users").doc(user.uid); }
  function sessionsCol() { return docRef().collection("sessions"); }

  // 「実データあり」の判定。自動シードされる既定ルール(isDefault)・サンプルは除外する。
  // （新端末で既定ルール2件だけのローカルが、クラウドの全成績を上書き消去する事故を防ぐ）
  function hasData(d) {
    if (!d) return false;
    if ((d.players && d.players.length) || (d.sessions && d.sessions.length)) return true;
    return !!(d.rules && d.rules.some(function (r) { return r && !r.isDefault && !r.isSample; }));
  }

  // ---- 純粋ヘルパー（Firestore非依存・テスト可能） ----
  // メイン部（players/rules/settings）のハッシュ。変更検知に使う。
  function mainHash(doc) {
    return JSON.stringify(doc.players || []) + "|" + JSON.stringify(doc.rules || []) + "|" + JSON.stringify(doc.settings || {});
  }
  // 読み込み: メインdoc と sessions サブコレクションから完全な doc を組み立てる。
  // sessions = サブコレクション ∪ main.sessions（旧形式のフォールバック。id重複はサブコレクション優先）。
  function assembleCloud(main, sessionDocs) {
    if (!main && (!sessionDocs || !sessionDocs.length)) return null;
    main = main || {};
    const sessions = (sessionDocs || []).slice();
    const ids = {}; sessions.forEach(function (s) { if (s && s.id) ids[s.id] = true; });
    const legacy = Array.isArray(main.sessions) ? main.sessions : [];
    legacy.forEach(function (s) { if (s && s.id && !ids[s.id]) sessions.push(s); });
    return {
      players: Array.isArray(main.players) ? main.players : [],
      rules: Array.isArray(main.rules) ? main.rules : [],
      settings: main.settings || {},
      sessions: sessions,
      migrating: legacy.length > 0, // メインがまだ旧 sessions[] を持つ → 移行（サブコレクション書き出し＆メイン掃除）が必要
    };
  }
  // push差分: 変更したメイン/部屋だけ書き、ローカルから消えた部屋は削除。
  function computePush(doc, lastMain, lastSession) {
    const out = { mainChanged: false, main: null, mainHash: mainHash(doc), writes: [], deletes: [] };
    if (out.mainHash !== lastMain) {
      out.mainChanged = true;
      out.main = { players: doc.players || [], rules: doc.rules || [], settings: doc.settings || {}, schemaVersion: doc.schemaVersion || 3 };
    }
    const localIds = {};
    (doc.sessions || []).forEach(function (s) {
      if (!s || !s.id) return;
      localIds[s.id] = true;
      const h = JSON.stringify(s);
      if (h !== lastSession[s.id]) out.writes.push({ id: s.id, data: s, hash: h });
    });
    Object.keys(lastSession).forEach(function (id) { if (!localIds[id]) out.deletes.push(id); });
    return out;
  }

  // 直近クラウドと一致している内容（再pushしないための基準）
  let lastMain = null;      // メイン部の hash
  let lastSession = {};     // id -> session の hash

  function onAuth(u) {
    user = u;
    if (unsub) { unsub(); unsub = null; }
    lastMain = null; lastSession = {};
    if (!u) { emit(); return; }
    emit();
    Promise.all([docRef().get(), sessionsCol().get()]).then(function (res) {
      const mainSnap = res[0], sessSnap = res[1];
      const main = mainSnap.exists ? mainSnap.data() : null;
      const sessionDocs = sessSnap.docs.map(function (d) { return d.data(); });
      return reconcile(assembleCloud(main, sessionDocs));
    }).catch(function (e) { console.error("cloud load", e); }).then(function () {
      subscribe();
      emit();
    });
  }

  function reconcile(cloud) {
    const local = MJ.store.load();
    const migrating = !!(cloud && cloud.migrating);
    if (!hasData(cloud)) { return pushNow(); }                 // クラウド空 → ローカルを新形式で上げる
    if (!hasData(local)) { applyFull(cloud, !migrating); return migrating ? pushNow() : null; } // ローカル空 → 取り込み
    // 両方にデータ → どちらを使うかユーザーに確認
    return MJ.ui.confirm({
      title: "データの同期",
      message: "この端末とクラウドの両方にデータがあります。どちらに統一しますか？",
      confirmText: "クラウドを使う", cancelText: "この端末を使う", dismissible: false,
    }).then(function (useCloud) {
      if (useCloud) { applyFull(cloud, !migrating); return migrating ? pushNow() : null; }
      return pushNow();
    });
  }

  // 初回の全置換（クラウド→ローカル）。inSync=true（クラウドは既に新形式）なら再pushしないよう last を一致させる。
  function applyFull(cloud, inSync) {
    applyingRemote = true;
    MJ.store.replaceAll({ players: cloud.players, rules: cloud.rules, settings: cloud.settings, sessions: cloud.sessions });
    applyingRemote = false;
    if (inSync) {
      lastMain = mainHash(MJ.store.load());
      lastSession = {};
      (cloud.sessions || []).forEach(function (s) { if (s && s.id) lastSession[s.id] = JSON.stringify(s); });
    } else {
      lastMain = null; lastSession = {}; // 移行: pushNow で新形式（サブコレクション＋掃除したメイン）に書き出す
    }
    if (MJ.rerender) MJ.rerender();
  }

  function subscribe() {
    const mainUnsub = docRef().onSnapshot(function (snap) {
      if (!snap.exists || snap.metadata.hasPendingWrites) return; // 自分の書き込みは無視
      if (pushTimer) return; // ローカルに未送信の編集がある間は見送り（編集の消失を防ぐ）
      applyingRemote = true;
      MJ.store.applyRemoteMain(snap.data());
      applyingRemote = false;
      lastMain = mainHash(MJ.store.load());
      if (MJ.rerender) MJ.rerender();
      emit();
    }, function (e) { console.error("snapshot main", e); });
    const sessUnsub = sessionsCol().onSnapshot(function (snap) {
      if (snap.metadata.hasPendingWrites) return;
      if (pushTimer) return;
      applyingRemote = true;
      snap.docChanges().forEach(function (ch) {
        if (ch.type === "removed") { MJ.store.removeRemoteSession(ch.doc.id); delete lastSession[ch.doc.id]; }
        else { const s = ch.doc.data(); MJ.store.applyRemoteSession(s); lastSession[s.id] = JSON.stringify(s); }
      });
      applyingRemote = false;
      if (MJ.rerender) MJ.rerender();
      emit();
    }, function (e) { console.error("snapshot sessions", e); });
    unsub = function () { mainUnsub(); sessUnsub(); };
  }

  // localStorage が変わるたびに呼ばれる（store.persist からフック）
  function onLocalChange() {
    if (applyingRemote || !user || !db) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 800);
  }

  // 差分だけ送信。部屋を書き切ってからメインを書く（移行時に旧sessions[]を消してもデータが宙に浮かないように）。
  function pushNow() {
    pushTimer = null;
    if (!user || !db) return null;
    const doc = MJ.store.load();
    const plan = computePush(doc, lastMain, lastSession);
    const writes = [];
    plan.writes.forEach(function (w) {
      writes.push(sessionsCol().doc(w.id).set(w.data).then(function () { lastSession[w.id] = w.hash; }));
    });
    plan.deletes.forEach(function (id) {
      writes.push(sessionsCol().doc(id).delete().then(function () { delete lastSession[id]; }));
    });
    return Promise.all(writes).then(function () {
      if (plan.mainChanged) {
        lastMain = plan.mainHash;
        return docRef().set(Object.assign({}, plan.main, { _updatedAt: MJ.domain.nowISO() }));
      }
    }).catch(function (e) { console.error("cloud push", e); });
  }

  return {
    init: init, status: status, signIn: signIn, signOut: signOutNow, deleteAccount: deleteAccount,
    onChange: onChange, onLocalChange: onLocalChange, pushNow: pushNow,
    _internal: { mainHash: mainHash, assembleCloud: assembleCloud, computePush: computePush },
  };
})();
