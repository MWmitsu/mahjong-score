/* テトリス練習ツール 本体
   - モード: フリー / テンプレ練習 / 掘り(Dig)
   - 機能: SRS操作・ホールド・ゴースト・ハード/ソフトドロップ・ライン消去
           ヒント(目標位置表示)・一手戻す(Undo)・反復(リセット/オートリピート)
   依存: engine.js (TT), templates.js (TT_TEMPLATES) */
(function () {
  "use strict";

  const E = window.TT;
  const TPL = window.TT_TEMPLATES;
  const CAT = window.TT_CATALOG;
  const COLS = E.COLS, ROWS = E.ROWS;
  const CELL = 30;       // メイン盤のセルピクセル
  const MINI = 18;       // ホールド/ネクストのセルピクセル

  // ---- DOM ----
  const boardCv = document.getElementById("board");
  const holdCv = document.getElementById("hold");
  const nextCv = document.getElementById("next");
  const bctx = boardCv.getContext("2d");
  const hctx = holdCv.getContext("2d");
  const nctx = nextCv.getContext("2d");
  boardCv.width = COLS * CELL; boardCv.height = ROWS * CELL;

  const $ = function (id) { return document.getElementById(id); };
  const statLines = $("stat-lines"), statPieces = $("stat-pieces"), statPc = $("stat-pc");
  const statTspin = $("stat-tspin");
  const hintBox = $("hint-text"), modeLabel = $("mode-label");

  // ---- 設定 ----
  const settings = {
    ghost: true,
    showHint: true,
    gravity: false,    // 練習向けに既定OFF（自由に置く）
    gravityMs: 800,
    autoRepeat: true,  // テンプレ完了時に自動で最初から
    das: 130,          // ms
    arr: 25,           // ms
  };

  // ---- ゲーム状態 ----
  const G = {
    mode: "free",          // free | template | dig
    grid: E.emptyGrid(),
    active: null,          // {piece,rot,px,py}
    hold: null,
    canHold: true,
    bag: [],
    queue: [],             // 表示用ネクスト（letterの配列）
    history: [],           // Undo用スナップショット
    // 集計
    lines: 0, pieces: 0, pcs: 0, tspins: 0,
    over: false,
    // 直前操作の追跡（T-spin判定用）
    lastRotation: false, lastKick: 0,
    lastClearLabel: "",
    // テンプレ
    template: null,
    buildSlot: null,       // 盤面エディタで保存先となるテンプレid
    stepIndex: 0,
    targetCells: null,     // 現在ステップの目標セル [[r,c]...]
    targetPlacement: null, // {rot, px, py}
    mistake: false,
    // gravity
    lastGravity: 0,
  };

  // ===== テンプレ・レジストリ & 保存（localStorage） =====
  const LS_KEY = "tt_user_templates_v1";
  let userStore = loadUserStore();
  function loadUserStore() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function saveUserStore() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(userStore)); }
    catch (e) { flashHint("保存に失敗しました（localStorage不可の環境かも）。", true); }
  }
  // id から実体テンプレを取得（手順型built-in / カタログ+保存 / カスタム）
  function findTemplate(id) {
    const s = TPL.byId(id);
    if (s) return s; // col手順型 built-in（type未指定→steps扱い）
    const c = CAT.byId(id);
    if (c) {
      const u = userStore[id] || {};
      if (u.fsteps) return Object.assign({}, c, { type: "fsteps", fsteps: u.fsteps, finalField: u.finalField });
      return Object.assign({}, c, { type: "field", field: u.field || c.field || null, queue: u.queue || c.queue || null });
    }
    const u = userStore[id];
    if (u && u.custom) {
      if (u.fsteps) return { id: id, name: u.name || id, group: "カスタム", desc: u.desc || "", type: "fsteps", fsteps: u.fsteps, finalField: u.finalField };
      return { id: id, name: u.name || id, group: "カスタム", desc: u.desc || "", type: "field", field: u.field || null, queue: u.queue || null };
    }
    return null;
  }
  function fieldSet(id) {
    const u = userStore[id];
    if (u && (u.field || u.fsteps)) return true;
    const c = CAT.byId(id);
    return !!(c && c.field);
  }
  function customIds() {
    return Object.keys(userStore).filter(function (k) { return userStore[k] && userStore[k].custom; });
  }
  // 現在の盤面 → field配列（色を保持。20x10）
  function gridToField(g) { return g.map(function (row) { return row.map(function (c) { return c || null; }); }); }
  function saveCurrentTo(id) {
    if (!id) { saveAsNew(); return; }
    const field = gridToField(G.grid);
    if (!field.some(function (row) { return row.some(function (c) { return c; }); })) {
      flashHint("盤面が空です。形を組んでから保存してください。", true); return;
    }
    userStore[id] = Object.assign({}, userStore[id], { field: field });
    saveUserStore();
    const t = findTemplate(id);
    flashHint("保存しました：「" + (t ? t.name : id) + "」が練習可能になりました。", false);
    buildMenu();
  }
  function saveAsNew() {
    const field = gridToField(G.grid);
    if (!field.some(function (row) { return row.some(function (c) { return c; }); })) {
      flashHint("盤面が空です。形を組んでから保存してください。", true); return;
    }
    const name = window.prompt("新規テンプレ名を入力", "マイテンプレ");
    if (!name) return;
    const id = "cust" + Date.now();
    userStore[id] = { custom: true, name: name, desc: "自作テンプレ", field: field };
    saveUserStore();
    flashHint("新規テンプレ「" + name + "」を保存しました。", false);
    buildMenu();
  }
  function deleteUserTemplate(id) {
    if (!userStore[id]) return;
    if (!window.confirm("このテンプレの保存データを削除しますか？")) return;
    delete userStore[id]; saveUserStore(); buildMenu();
    flashHint("削除しました。", false);
  }
  // テト譜(fumen) から完成形(field) を取り込んで登録
  function importFumen() { importFumenInner("field"); }
  // テト譜(fumen) から手順(1手ずつ)を取り込んで登録
  function importFumenSteps() { importFumenInner("fsteps"); }
  function importFumenInner(kind) {
    const str = ($("fumen-text").value || "").trim();
    if (!str) { flashHint("テト譜コード（v115@…）を貼り付けてください。", true); return; }
    if (!window.TT_FUMEN) { flashHint("fumenデコーダが読み込まれていません。", true); return; }
    let payload, pages;
    if (kind === "fsteps") {
      const res = window.TT_FUMEN.toSteps(str);
      if (res.error) { flashHint("手順の取込に失敗: " + res.error, true); return; }
      payload = { fsteps: res.steps, finalField: res.finalField }; pages = res.pages;
      if (res.steps.length < 2) flashHint("注意: 手数が少ないテト譜です（完成形のみかも）。", false);
    } else {
      const res = window.TT_FUMEN.toTargetField(str);
      if (res.error) { flashHint("テト譜の取込に失敗: " + res.error, true); return; }
      payload = { field: res.field }; pages = res.pages;
    }
    const label = (kind === "fsteps") ? "手順" : "完成形";
    if (G.buildSlot) {
      const slot = G.buildSlot;
      // 同じ枠の旧データ種別が混ざらないよう field/fsteps を入れ替え
      const base = Object.assign({}, userStore[slot]); delete base.field; delete base.fsteps; delete base.finalField;
      userStore[slot] = Object.assign(base, payload);
      saveUserStore(); buildMenu();
      const t = findTemplate(slot);
      flashHint("テト譜(" + label + ")を「" + (t ? t.name : slot) + "」に登録（" + pages + "ページ）。", false);
      startTemplate(slot);
    } else {
      const name = window.prompt("テンプレ名を入力", "テト譜" + label);
      if (!name) return;
      const id = "cust" + Date.now();
      userStore[id] = Object.assign({ custom: true, name: name, desc: "テト譜取込(" + label + ")" }, payload);
      saveUserStore(); buildMenu();
      flashHint("テト譜から「" + name + "」を登録（" + label + "・" + pages + "ページ）。", false);
      startTemplate(id);
    }
  }

  // ===== ミノ列(ネクスト)補充 =====
  function refillBag() {
    while (G.bag.length < 7) G.bag = G.bag.concat(E.newBag());
  }
  function nextFromBag() {
    refillBag();
    return G.bag.shift();
  }
  function ensureQueue(n) {
    if (G.mode === "template" && tplType() === "steps") return; // 手順型は固定列
    if (G.mode === "template" && G.template && G.template.queue) return; // field型でミノ順指定あり
    refillBag();
    while (G.queue.length < n) G.queue.push(nextFromBag());
  }

  // ===== スナップショット(Undo) =====
  function snapshot() {
    return {
      grid: E.cloneGrid(G.grid),
      active: G.active ? Object.assign({}, G.active) : null,
      hold: G.hold, canHold: G.canHold,
      bag: G.bag.slice(), queue: G.queue.slice(),
      lines: G.lines, pieces: G.pieces, pcs: G.pcs, tspins: G.tspins,
      lastRotation: G.lastRotation, lastKick: G.lastKick, lastClearLabel: G.lastClearLabel,
      stepIndex: G.stepIndex, mistake: G.mistake, over: G.over,
    };
  }
  function pushHistory() {
    G.history.push(snapshot());
    if (G.history.length > 200) G.history.shift();
  }
  function undo() {
    if (G.history.length === 0) return;
    const s = G.history.pop();
    G.grid = s.grid; G.active = s.active; G.hold = s.hold; G.canHold = s.canHold;
    G.bag = s.bag; G.queue = s.queue;
    G.lines = s.lines; G.pieces = s.pieces; G.pcs = s.pcs; G.tspins = s.tspins;
    G.lastRotation = s.lastRotation; G.lastKick = s.lastKick; G.lastClearLabel = s.lastClearLabel;
    G.stepIndex = s.stepIndex; G.mistake = s.mistake; G.over = s.over;
    if (G.mode === "template") computeTarget();
    render();
  }

  // テンプレ種別: 'steps'(col手順) / 'field'(完成形) / 'fsteps'(テト譜由来の1手ずつ手順)
  function tplType() {
    if (!G.template) return null;
    if (G.template.type === "field") return "field";
    if (G.template.type === "fsteps") return "fsteps";
    return "steps";
  }

  // ===== テンプレ: col(最左列)→px 変換 & 目標算出 =====
  function minLocalCol(piece, rot) {
    const cells = E.PIECES[piece].states[rot];
    let m = 99;
    for (let i = 0; i < cells.length; i++) m = Math.min(m, cells[i][1]);
    return m;
  }
  function stepPlacement(grid, step) {
    const px = step.col - minLocalCol(step.piece, step.rot);
    const py = E.dropY(grid, step.piece, step.rot, px, -2);
    return { rot: step.rot, px: px, py: py };
  }
  function computeTarget() {
    G.targetCells = null; G.targetPlacement = null;
    if (G.mode !== "template" || !G.template) return;
    if (tplType() === "field") return; // field型は computeTarget 不要（盤面全体が目標）
    if (tplType() === "fsteps") {
      const fs = G.template.fsteps;
      if (G.stepIndex < fs.length) G.targetCells = fs[G.stepIndex].cells;
      return;
    }
    if (G.stepIndex >= G.template.steps.length) return;
    const step = G.template.steps[G.stepIndex];
    const pl = stepPlacement(G.grid, step);
    G.targetPlacement = pl;
    G.targetCells = E.absCells(step.piece, step.rot, pl.px, pl.py);
  }

  // fsteps: ステップ i に入る（盤面はテト譜準拠でセットし、その手のミノを出現）
  function setFStep(i) {
    const fs = G.template.fsteps;
    G.stepIndex = i;
    G.grid = fs[i].ctx.map(function (row) { return row.slice(); });
    G.targetCells = fs[i].cells;
    G.mistake = false;
    const st = E.spawnState(fs[i].piece);
    if (E.collide(G.grid, st.piece, st.rot, st.px, st.py)) { G.over = true; G.active = null; render(); return; }
    G.active = st; G.canHold = true; G.lastRotation = false;
    render();
  }

  // field型: 現在の盤面が目標の完成形と一致したか（消去前で比較）
  function fieldMatches() {
    const f = G.template.field;
    if (!f) return false;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const want = !!(f[r] && f[r][c]);
        const got = !!G.grid[r][c];
        if (want !== got) return false;
      }
    }
    return true;
  }
  // field型: 目標外のセルを埋めてしまった＝発散（やり直し推奨）
  function fieldOverflow() {
    const f = G.template.field;
    if (!f) return false;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (G.grid[r][c] && !(f[r] && f[r][c])) return true;
      }
    }
    return false;
  }

  // ===== スポーン =====
  function spawnFromQueue() {
    let piece;
    if (G.mode === "template" && tplType() === "steps") {
      if (G.stepIndex >= G.template.steps.length) { onTemplateComplete(); return; }
      piece = G.template.steps[G.stepIndex].piece;
    } else if (G.mode === "template" && G.template && G.template.queue) {
      // field型・ミノ順指定あり：順に供給し、尽きたらbagへ
      const q = G.template.queue;
      if (G.stepIndex < q.length) piece = q[G.stepIndex];
      else { ensureQueue(6); piece = G.queue.shift(); ensureQueue(6); }
    } else {
      ensureQueue(6);
      piece = G.queue.shift();
      ensureQueue(6);
    }
    const st = E.spawnState(piece);
    if (E.collide(G.grid, st.piece, st.rot, st.px, st.py)) {
      // 出現位置で衝突 → トップアウト
      G.over = true; G.active = null; render(); return;
    }
    G.active = st;
    G.canHold = true;
    G.lastRotation = false; // 出現直後はまだ回転していない
    if (G.mode === "template") computeTarget();
    render();
  }

  // ===== 操作 =====
  function tryMove(dx, dy) {
    if (!G.active || G.over) return false;
    const a = G.active;
    if (!E.collide(G.grid, a.piece, a.rot, a.px + dx, a.py + dy)) {
      a.px += dx; a.py += dy;
      G.lastRotation = false; // 平行移動したので「直前=回転」を解除（T-spin判定用）
      render(); return true;
    }
    return false;
  }
  function tryRotate(dir) {
    if (!G.active || G.over) return;
    const res = E.rotate(G.grid, G.active, dir);
    if (res) {
      G.active.rot = res.rot; G.active.px = res.px; G.active.py = res.py;
      G.lastRotation = true; G.lastKick = res.kick;
      render();
    }
  }
  function softDrop() { if (!tryMove(0, 1) && settings.gravity) {/*lock handled by gravity*/} }
  function hardDrop() {
    if (!G.active || G.over) return;
    const a = G.active;
    const target = E.dropY(G.grid, a.piece, a.rot, a.px, a.py);
    if (target > a.py) G.lastRotation = false; // 落下した＝回転直後ではない（イモビリティ・ルール）
    a.py = target;
    lockPiece();
  }
  function holdPiece() {
    // 手順型(steps/fsteps)・ミノ順固定field型ではホールド無効（決め打ちのため）
    const lockedOrder = (G.mode === "template") &&
      (tplType() === "steps" || tplType() === "fsteps" || (G.template && G.template.queue));
    if (!G.active || G.over || !G.canHold || lockedOrder) return;
    pushHistory();
    const cur = G.active.piece;
    if (G.hold == null) {
      G.hold = cur;
      spawnFromQueue();      // ネクストから次を出す（canHold=true に戻る）
    } else {
      const swap = G.hold; G.hold = cur;
      const st = E.spawnState(swap);
      if (E.collide(G.grid, st.piece, st.rot, st.px, st.py)) { G.over = true; G.active = null; }
      else G.active = st;
    }
    G.canHold = false;       // 次に固定するまでホールド不可
    render();
  }

  // T-spin種別＋消去ライン数 → 表示ラベル
  function clearLabel(spin, lines) {
    const nm = ["", "シングル", "ダブル", "トリプル", "テトリス"][lines] || "";
    if (spin === "full") {
      return "T-Spin" + (lines ? " " + nm : "");
    }
    if (spin === "mini") {
      return "T-Spin Mini" + (lines ? " " + nm : "");
    }
    if (lines === 4) return "テトリス";
    if (lines > 0) return nm; // 通常消去
    return "";
  }

  function lockPiece() {
    const a = G.active;
    pushHistory();
    // T-spin 判定（固定前の盤面で。Tの隅セルはT自身が占めないため pre-lock で正しい）
    let spin = "none";
    if (a.piece === "T" && G.lastRotation) {
      spin = E.tSpinType(G.grid, a, G.lastKick);
    }
    G._pendingSpin = spin;

    // fsteps型: 1手ずつ目標位置に置く（盤面はテト譜準拠で進む）
    if (G.mode === "template" && tplType() === "fsteps") {
      const got = E.cellKey(E.absCells(a.piece, a.rot, a.px, a.py));
      const want = E.cellKey(G.targetCells);
      if (got !== want) {
        G.history.pop(); // この試行のスナップショットは破棄
        G.mistake = true;
        flashHint("手順と違う位置です。回転/移動/スピンで黄色の目標に合わせて置こう。", true);
        setFStep(G.stepIndex); // 盤面と現ミノをリセットして再挑戦
        return;
      }
      G.mistake = false;
      G.pieces++;
      if (spin !== "none") G.tspins++;
      G.lastClearLabel = clearLabel(spin, 0);
      if (G.lastClearLabel) flashHint(G.lastClearLabel + "！", false);
      const fs = G.template.fsteps;
      if (G.stepIndex + 1 >= fs.length) {
        G.grid = G.template.finalField.map(function (row) { return row.slice(); });
        G.active = null; G.targetCells = null;
        onTemplateComplete();
        return;
      }
      setFStep(G.stepIndex + 1);
      return;
    }

    // field型: 自由に組ませ、完成形と一致したら成功
    if (G.mode === "template" && tplType() === "field") {
      E.lock(G.grid, a.piece, a.rot, a.px, a.py);
      G.stepIndex++; G.pieces++;
      if (spin !== "none") { G.tspins++; }
      G.lastClearLabel = clearLabel(spin, 0);
      if (G.lastClearLabel) flashHint(G.lastClearLabel + "！", false);
      G.active = null;
      if (fieldMatches()) { onFieldComplete(); return; }
      if (fieldOverflow()) flashHint("目標の形からはみ出しました。↩Undoでやり直すか、リセットを。", true);
      spawnFromQueue();
      render();
      return;
    }

    // テンプレ正誤判定（手順型）
    if (G.mode === "template" && G.targetCells) {
      const got = E.cellKey(E.absCells(a.piece, a.rot, a.px, a.py));
      const want = E.cellKey(G.targetCells);
      if (got !== want) {
        G.mistake = true;
        flashHint("置き方が目標と違います。Undo(↩) で戻してやり直しましょう。", true);
        // それでも固定はする（自由に試せるように）。stepIndexは進めない。
        E.lock(G.grid, a.piece, a.rot, a.px, a.py);
        afterLockCommon(false);
        return;
      }
      G.mistake = false;
    }
    E.lock(G.grid, a.piece, a.rot, a.px, a.py);
    if (G.mode === "template") G.stepIndex++;
    afterLockCommon(true);
  }

  function afterLockCommon(advanced) {
    G.pieces++;
    const spin = G._pendingSpin || "none";
    // 盤面エディタ中（保存先指定あり）はライン消去しない＝組んだ形をそのまま保存できる
    const cl = G.buildSlot ? { grid: G.grid, cleared: 0 } : E.clearLines(G.grid);
    G.grid = cl.grid;
    // クリア種別ラベル（T-spin / 通常）
    G.lastClearLabel = clearLabel(spin, cl.cleared);
    if (spin !== "none") { G.tspins++; }
    if (G.lastClearLabel) flashHint(G.lastClearLabel + "！", false);
    if (cl.cleared > 0) {
      G.lines += cl.cleared;
      const empty = G.grid.every(function (row) { return row.every(function (c) { return !c; }); });
      if (empty) { G.pcs++; flashHint("パーフェクトクリア！🎉", false); }
    }
    G.active = null;
    // 次へ
    if (G.mode === "template") {
      if (G.stepIndex >= G.template.steps.length) { onTemplateComplete(); return; }
      if (advanced || !G.mistake) spawnFromQueue();
      else spawnFromQueue();
    } else {
      spawnFromQueue();
    }
  }

  function onTemplateComplete() {
    G.active = null;
    flashHint("テンプレ完了！" + (settings.autoRepeat ? " 反復します…" : " リセットで再挑戦できます。"), false);
    render();
    if (settings.autoRepeat) {
      setTimeout(function () { resetTemplate(); }, 900);
    }
  }
  function onFieldComplete() {
    flashHint("完成！🎉 目標の形ができました。" + (settings.autoRepeat ? " 反復します…" : " リセットで再挑戦。"), false);
    render();
    if (settings.autoRepeat) setTimeout(function () { resetTemplate(); }, 900);
  }

  // ===== モード初期化 =====
  function resetCommon() {
    G.grid = E.emptyGrid(); G.active = null; G.hold = null; G.canHold = true;
    G.bag = []; G.queue = []; G.history = [];
    G.lines = 0; G.pieces = 0; G.pcs = 0; G.tspins = 0; G.over = false;
    G.lastRotation = false; G.lastKick = 0; G.lastClearLabel = ""; G._pendingSpin = "none";
    G.stepIndex = 0; G.mistake = false; G.targetCells = null;
    G.buildSlot = null;
  }
  function startFree() {
    G.mode = "free"; resetCommon();
    ensureQueue(6); spawnFromQueue();
    modeLabel.textContent = "フリー";
    flashHint("自由に積めます。←→移動 / ↑(X)右回転 Z左回転 / Space=ハードドロップ / Shift(C)=ホールド / ↩Undo", false);
    render();
  }
  function startTemplate(id) {
    const t = findTemplate(id);
    if (!t) return;
    if (t.info) { // 知識ノート（盤面なし）
      G.mode = "free"; G.buildSlot = null;
      flashHint("【" + t.name + "】" + t.desc + "（知識ノート：盤面データなし）", false);
      return;
    }
    G.buildSlot = null;
    if ((t.type === "field") && !t.field) { enterBuildMode(t); return; } // 未設定 → 盤面エディタ
    G.mode = "template"; G.template = t; resetCommon();
    if (t.type === "fsteps") {
      modeLabel.textContent = "手順: " + t.name;
      flashHint(t.desc + "　黄色の目標位置に1手ずつ置こう（スピン/ tuck もOK・盤面はテト譜準拠）。", false);
      setFStep(0);
      return;
    }
    spawnFromQueue();
    modeLabel.textContent = "テンプレ: " + t.name;
    flashHint(t.desc + ((t.type === "field") ? "　うすい色の目標形を組み上げよう（スピン・ホールドOK）。" : ""), false);
    render();
  }
  // 未登録テンプレ枠を埋めるための盤面エディタ（フリー操作で組んで保存）
  function enterBuildMode(t) {
    G.mode = "free"; G.template = null; resetCommon();
    G.buildSlot = t.id; // resetCommon の後に設定（resetCommonでクリアされるため）
    ensureQueue(6); spawnFromQueue();
    modeLabel.textContent = "盤面エディタ: " + t.name + "（未設定）";
    flashHint("「" + t.name + "」は未登録です。フリー操作で形を組み、右の『現在の盤面を保存』でこの枠に登録できます。", false);
    render();
  }
  function resetTemplate() {
    if (G.mode !== "template" || !G.template) return;
    resetCommon();
    if (tplType() === "fsteps") { setFStep(0); return; }
    if ((tplType() === "field") && !G.template.field) return;
    spawnFromQueue();
    render();
  }
  function startDig(rowsN) {
    G.mode = "dig"; resetCommon();
    rowsN = rowsN || 8;
    for (let r = ROWS - rowsN; r < ROWS; r++) {
      const hole = Math.floor(Math.random() * COLS);
      for (let c = 0; c < COLS; c++) {
        if (c !== hole) G.grid[r][c] = "#7a8290";
      }
    }
    ensureQueue(6); spawnFromQueue();
    modeLabel.textContent = "掘り(Dig) " + rowsN + "段";
    flashHint("お邪魔(灰)を消して盤面を空にしよう。穴の位置を読んで効率よく掘る練習。", false);
    render();
  }

  // ===== ヒント文 =====
  let hintTimer = null;
  function flashHint(msg, isErr) {
    hintBox.textContent = msg;
    hintBox.className = "hint" + (isErr ? " err" : "");
    if (hintTimer) clearTimeout(hintTimer);
  }

  // ===== 描画 =====
  function roundedCell(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
    // ハイライト
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x + 1, y + 1, size - 2, 3);
  }
  function drawGridLines() {
    bctx.strokeStyle = "rgba(255,255,255,0.05)";
    bctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      bctx.beginPath(); bctx.moveTo(c * CELL, 0); bctx.lineTo(c * CELL, ROWS * CELL); bctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      bctx.beginPath(); bctx.moveTo(0, r * CELL); bctx.lineTo(COLS * CELL, r * CELL); bctx.stroke();
    }
  }
  function render() {
    // 集計
    statLines.textContent = G.lines;
    statPieces.textContent = G.pieces;
    statPc.textContent = G.pcs;
    if (statTspin) statTspin.textContent = G.tspins;

    // 盤面背景
    bctx.fillStyle = "#0d1117";
    bctx.fillRect(0, 0, boardCv.width, boardCv.height);
    drawGridLines();

    // 確定ブロック
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (G.grid[r][c]) roundedCell(bctx, c * CELL, r * CELL, CELL, G.grid[r][c]);
      }
    }

    // 手順型テンプレの目標(ヒント): 次の1手の置き場所
    if (settings.showHint && G.mode === "template" && G.targetCells) {
      bctx.save();
      bctx.strokeStyle = "rgba(255,255,80,0.95)";
      bctx.lineWidth = 2;
      bctx.fillStyle = "rgba(255,255,80,0.12)";
      for (let i = 0; i < G.targetCells.length; i++) {
        const r = G.targetCells[i][0], c = G.targetCells[i][1];
        if (r < 0) continue;
        bctx.fillRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4);
        bctx.strokeRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4);
      }
      bctx.restore();
    }
    // 完成形テンプレ(field型)の目標: 全体のうすい色オーバーレイ
    if (settings.showHint && G.mode === "template" && tplType() === "field" && G.template && G.template.field) {
      const f = G.template.field;
      bctx.save();
      bctx.globalAlpha = 0.28;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (f[r] && f[r][c] && !G.grid[r][c]) {
            bctx.fillStyle = (typeof f[r][c] === "string") ? f[r][c] : "#8aa0b6";
            bctx.fillRect(c * CELL + 4, r * CELL + 4, CELL - 8, CELL - 8);
          }
        }
      }
      bctx.restore();
    }

    // ゴースト & アクティブ
    if (G.active) {
      const a = G.active;
      if (settings.ghost) {
        const gy = E.dropY(G.grid, a.piece, a.rot, a.px, a.py);
        const gc = E.absCells(a.piece, a.rot, a.px, gy);
        bctx.save();
        bctx.fillStyle = "rgba(255,255,255,0.12)";
        for (let i = 0; i < gc.length; i++) {
          const r = gc[i][0], c = gc[i][1];
          if (r >= 0) bctx.fillRect(c * CELL + 3, r * CELL + 3, CELL - 6, CELL - 6);
        }
        bctx.restore();
      }
      const cells = E.absCells(a.piece, a.rot, a.px, a.py);
      const color = E.PIECES[a.piece].color;
      for (let i = 0; i < cells.length; i++) {
        const r = cells[i][0], c = cells[i][1];
        if (r >= 0) roundedCell(bctx, c * CELL, r * CELL, CELL, color);
      }
    }

    // ゲームオーバー
    if (G.over) {
      bctx.fillStyle = "rgba(0,0,0,0.6)";
      bctx.fillRect(0, 0, boardCv.width, boardCv.height);
      bctx.fillStyle = "#fff"; bctx.font = "bold 28px system-ui"; bctx.textAlign = "center";
      bctx.fillText("ゲームオーバー", boardCv.width / 2, boardCv.height / 2 - 10);
      bctx.font = "16px system-ui";
      bctx.fillText("リセットで再開", boardCv.width / 2, boardCv.height / 2 + 20);
      bctx.textAlign = "left";
    }

    drawPreview(hctx, holdCv, G.hold ? [G.hold] : []);
    drawPreview(nctx, nextCv, previewQueue());
  }

  function previewQueue() {
    if (G.mode === "template" && tplType() === "steps") {
      const out = [];
      for (let i = G.stepIndex; i < Math.min(G.stepIndex + 5, G.template.steps.length); i++) {
        out.push(G.template.steps[i].piece);
      }
      return out;
    }
    if (G.mode === "template" && tplType() === "fsteps") {
      const fs = G.template.fsteps, out = [];
      for (let i = G.stepIndex; i < Math.min(G.stepIndex + 5, fs.length); i++) out.push(fs[i].piece);
      return out;
    }
    if (G.mode === "template" && G.template && G.template.queue) {
      const q = G.template.queue, out = [];
      for (let i = G.stepIndex; i < Math.min(G.stepIndex + 5, q.length); i++) out.push(q[i]);
      return out;
    }
    return G.queue.slice(0, 5);
  }

  function drawPreview(ctx, cv, pieces) {
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, cv.width, cv.height);
    let oy = 8;
    for (let p = 0; p < pieces.length; p++) {
      const piece = pieces[p];
      const cells = E.PIECES[piece].states[0];
      // バウンディングを正規化して中央寄せ
      let minR = 9, minC = 9, maxR = -9, maxC = -9;
      for (let i = 0; i < cells.length; i++) {
        minR = Math.min(minR, cells[i][0]); maxR = Math.max(maxR, cells[i][0]);
        minC = Math.min(minC, cells[i][1]); maxC = Math.max(maxC, cells[i][1]);
      }
      const w = (maxC - minC + 1) * MINI;
      const ox = (cv.width - w) / 2;
      const color = E.PIECES[piece].color;
      for (let i = 0; i < cells.length; i++) {
        const r = cells[i][0] - minR, c = cells[i][1] - minC;
        roundedCell(ctx, ox + c * MINI, oy + r * MINI, MINI, color);
      }
      oy += (maxR - minR + 1) * MINI + 12;
    }
  }

  // ===== 入力(DAS/ARR付き) =====
  const held = {}; // key -> {start, last, dir}
  function pressMove(dir) {
    tryMove(dir, 0);
    held.move = { dir: dir, start: performance.now(), last: performance.now(), fired: false };
  }
  function inputLoop(now) {
    // 横移動のDAS/ARR
    if (held.move) {
      const h = held.move;
      const el = now - h.start;
      if (!h.fired && el >= settings.das) { h.fired = true; tryMove(h.dir, 0); h.last = now; }
      else if (h.fired && now - h.last >= settings.arr) { tryMove(h.dir, 0); h.last = now; }
    }
    // ソフトドロップ連続
    if (held.soft && now - (held.soft.last || 0) >= Math.max(15, settings.arr)) {
      tryMove(0, 1); held.soft.last = now;
    }
    // gravity
    if (settings.gravity && G.active && !G.over && G.mode !== "template") {
      if (now - G.lastGravity >= settings.gravityMs) {
        if (!tryMove(0, 1)) { hardDropNoExtend(); }
        G.lastGravity = now;
      }
    }
    requestAnimationFrame(inputLoop);
  }
  function hardDropNoExtend() {
    // gravityで底に着いたら固定（ロックディレイ簡略: 即固定）
    if (!G.active) return;
    lockPiece();
  }

  window.addEventListener("keydown", function (e) {
    if (e.repeat) {
      // 横/ソフトはDAS/ARRで処理するのでブラウザリピートは無視
      if (["ArrowLeft", "ArrowRight", "ArrowDown"].indexOf(e.key) >= 0) { e.preventDefault(); return; }
    }
    const k = e.key;
    if (k === "ArrowLeft") { e.preventDefault(); pressMove(-1); }
    else if (k === "ArrowRight") { e.preventDefault(); pressMove(1); }
    else if (k === "ArrowDown") { e.preventDefault(); held.soft = { last: 0 }; tryMove(0, 1); }
    else if (k === "ArrowUp" || k === "x" || k === "X") { e.preventDefault(); tryRotate(1); }
    else if (k === "z" || k === "Z" || k === "Control") { e.preventDefault(); tryRotate(-1); }
    else if (k === "a" || k === "A") { e.preventDefault(); tryRotate(1); tryRotate(1); } // 180
    else if (k === " ") { e.preventDefault(); hardDrop(); }
    else if (k === "Shift" || k === "c" || k === "C") { e.preventDefault(); holdPiece(); }
    else if (k === "Backspace" || k === "u" || k === "U") { e.preventDefault(); undo(); }
    else if (k === "r" || k === "R") { e.preventDefault(); doReset(); }
  });
  window.addEventListener("keyup", function (e) {
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowRight") { if (held.move) held.move = null; }
    else if (k === "ArrowDown") { held.soft = null; }
  });

  function doReset() {
    if (G.mode === "free") startFree();
    else if (G.mode === "template") resetTemplate();
    else startDig(8);
  }

  // ===== 画面UI構築 =====
  function buildUI() {
    // モードボタン
    $("btn-free").addEventListener("click", startFree);
    $("btn-dig").addEventListener("click", function () { startDig(8); });
    $("btn-reset").addEventListener("click", doReset);
    $("btn-undo").addEventListener("click", undo);

    // テンプレ一覧（手順型 built-in + カタログ + カスタム）
    buildMenu();

    // 設定トグル
    bindToggle("set-ghost", "ghost");
    bindToggle("set-hint", "showHint");
    bindToggle("set-gravity", "gravity");
    bindToggle("set-repeat", "autoRepeat");

    // 検証パネル
    $("btn-verify").addEventListener("click", function () {
      $("verify-out").innerHTML = verifyAll();
    });

    // 盤面保存 / インポート・エクスポート
    $("btn-save").addEventListener("click", function () { saveCurrentTo(G.buildSlot); });
    $("btn-savenew").addEventListener("click", saveAsNew);
    $("btn-fumen").addEventListener("click", importFumen);
    $("btn-fumen-steps").addEventListener("click", importFumenSteps);
    $("btn-export").addEventListener("click", function () {
      $("io-text").value = JSON.stringify(userStore);
      flashHint("エクスポート: 下のテキストをコピーして保存してください。", false);
    });
    $("btn-import").addEventListener("click", function () {
      const txt = $("io-text").value.trim();
      if (!txt) { flashHint("インポートするJSONを貼り付けてください。", true); return; }
      try {
        const obj = JSON.parse(txt);
        let n = 0;
        Object.keys(obj).forEach(function (k) { userStore[k] = obj[k]; n++; });
        saveUserStore(); buildMenu();
        flashHint(n + "件のテンプレを取り込みました。", false);
      } catch (e) { flashHint("JSONの解析に失敗しました。", true); }
    });

    // タッチ操作
    bindTouch();
  }

  // テンプレ・メニュー（折りたたみ見出し付き）
  function buildMenu() {
    const root = $("tpl-list");
    root.innerHTML = "";

    function section(title, entries, render1) {
      if (!entries.length) return;
      const det = document.createElement("details");
      det.className = "tpl-sec";
      const sum = document.createElement("summary");
      sum.textContent = title + " (" + entries.length + ")";
      det.appendChild(sum);
      entries.forEach(function (t) { det.appendChild(render1(t)); });
      root.appendChild(det);
    }
    function btn(label, sub, cls, onClick, onDel) {
      const wrap = document.createElement("div");
      wrap.className = "tpl-row";
      const b = document.createElement("button");
      b.className = "tpl-btn " + (cls || "");
      b.innerHTML = "<span class='tpl-name'>" + label + "</span>" + (sub ? "<span class='tpl-sub'>" + sub + "</span>" : "");
      b.addEventListener("click", onClick);
      wrap.appendChild(b);
      if (onDel) {
        const d = document.createElement("button");
        d.className = "tpl-del"; d.textContent = "✕"; d.title = "削除";
        d.addEventListener("click", onDel);
        wrap.appendChild(d);
      }
      return wrap;
    }

    // 1) 手順型（検証済みドリル）
    section("手順型ドリル（ヒント付き）", TPL.list, function (t) {
      return btn(t.name, t.category, "ok", function () { startTemplate(t.id); });
    });

    // 2) カタログ（ユーザー指定の名前付きセットアップ）をグループ別に
    CAT.groups().forEach(function (gname) {
      const entries = CAT.list.filter(function (t) { return t.group === gname; });
      section(gname, entries, function (t) {
        const set = fieldSet(t.id);
        const sub = t.info ? "知識ノート" : (set ? "✓ 練習可" : "未設定→組んで保存");
        const cls = t.info ? "info" : (set ? "ok" : "unset");
        return btn(t.name, sub, cls, function () { startTemplate(t.id); });
      });
    });

    // 3) カスタム（自作保存）
    const cust = customIds().map(function (id) { return findTemplate(id); }).filter(Boolean);
    section("カスタム（自作）", cust, function (t) {
      return btn(t.name, "✓ 練習可", "ok",
        function () { startTemplate(t.id); },
        function (e) { e.stopPropagation(); deleteUserTemplate(t.id); });
    });
  }
  function bindToggle(id, key) {
    const el = $(id);
    el.checked = settings[key];
    el.addEventListener("change", function () { settings[key] = el.checked; render(); });
  }

  function bindTouch() {
    const map = {
      "t-left": function () { tryMove(-1, 0); },
      "t-right": function () { tryMove(1, 0); },
      "t-down": function () { tryMove(0, 1); },
      "t-ccw": function () { tryRotate(-1); },
      "t-cw": function () { tryRotate(1); },
      "t-drop": hardDrop,
      "t-hold": holdPiece,
      "t-undo": undo,
    };
    Object.keys(map).forEach(function (id) {
      const el = $(id); if (!el) return;
      el.addEventListener("click", function (e) { e.preventDefault(); map[id](); });
    });
  }

  // ===== テンプレ検証 =====
  function verifyAll() {
    let html = "<table class='vtab'><tr><th>テンプレ</th><th>手数</th><th>結果</th></tr>";
    TPL.list.forEach(function (t) {
      const res = verifyTemplate(t);
      const ok = res.ok;
      html += "<tr><td>" + t.name + "</td><td>" + t.steps.length + "</td><td class='" +
        (ok ? "vok" : "vng") + "'>" + res.msg + "</td></tr>";
    });
    html += "</table>";
    return html;
  }
  function verifyTemplate(t) {
    let grid = E.emptyGrid();
    for (let i = 0; i < t.steps.length; i++) {
      const step = t.steps[i];
      const px = step.col - minLocalCol(step.piece, step.rot);
      // 盤外チェック(回転状態のセル列が範囲内か)
      const cells0 = E.absCells(step.piece, step.rot, px, 0);
      for (let j = 0; j < cells0.length; j++) {
        if (cells0[j][1] < 0 || cells0[j][1] >= COLS) {
          return { ok: false, msg: "✗ 手" + (i + 1) + ": 盤外(col=" + step.col + ")" };
        }
      }
      const py = E.dropY(grid, step.piece, step.rot, px, -2);
      if (E.collide(grid, step.piece, step.rot, px, py) || py < 0) {
        return { ok: false, msg: "✗ 手" + (i + 1) + ": 配置不可" };
      }
      E.lock(grid, step.piece, step.rot, px, py);
      // 途中でラインが揃ってしまわないか(最終手以外)
      const cl = E.clearLines(E.cloneGrid(grid));
      if (cl.cleared > 0 && i < t.steps.length - 1) {
        return { ok: false, msg: "△ 手" + (i + 1) + "で消去(途中消し)" };
      }
    }
    // 穴(下に空きがあるのに上が埋まっている)チェック
    let holes = 0;
    for (let c = 0; c < COLS; c++) {
      let seen = false;
      for (let r = 0; r < ROWS; r++) {
        if (grid[r][c]) seen = true;
        else if (seen) holes++;
      }
    }
    const cl = E.clearLines(E.cloneGrid(grid));
    const after = cl.grid;
    const empty = after.every(function (row) { return row.every(function (x) { return !x; }); });
    if (t.pc) {
      if (empty) return { ok: true, msg: "✓ PC成立 (" + cl.cleared + "ライン消去)" };
      return { ok: false, msg: "✗ PC不成立(残りあり, 消去" + cl.cleared + ")" };
    }
    if (holes > 0) return { ok: false, msg: "△ 穴 " + holes + " 個" };
    return { ok: true, msg: "✓ 穴なし(消去" + cl.cleared + ")" };
  }

  // ===== 起動 =====
  buildUI();
  startFree();
  requestAnimationFrame(inputLoop);

  // デバッグ用に公開
  window.TTGAME = G;
})();
