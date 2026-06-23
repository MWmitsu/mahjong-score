/* テト譜(fumen) デコーダ  v115 / v110 対応
   knewjade/tetris-fumen のアルゴリズムを忠実に移植（純粋JS・依存なし）。
   目的: テト譜コードから「完成形の盤面(最終フレーム)」を取り出し、
   完成形テンプレ(field型)として登録できるようにする。

   公開API:
     TT_FUMEN.decodePages(str) -> [{ field:FF, op:{type,rotation,x,y}|null, lock }]
        ※ field は内部表現(FF)。テスト/上級用。
     TT_FUMEN.toTargetField(str) -> { field: 20x10(色|null), pages, error? }
        ※ アプリ用。最終ページの盤面＋そのページのミノを重ねた完成形を
          このツールの盤面(行0=上, 20行)に変換して返す。 */
window.TT_FUMEN = (function () {
  "use strict";

  const TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const TLEN = TABLE.length;

  // Piece値: 0空 1I 2L 3O 4Z 5T 6J 7S 8Gray
  const PIECE_LETTER = { 1: "I", 2: "L", 3: "O", 4: "Z", 5: "T", 6: "J", 7: "S" };

  // ---- Buffer（base64風・リトルエンディアン poll）----
  function Buffer(data) {
    this.values = [];
    for (let i = 0; i < data.length; i++) {
      const v = TABLE.indexOf(data[i]);
      if (v >= 0) this.values.push(v); // テーブル外文字は無視
    }
    this.pos = 0;
  }
  Buffer.prototype.poll = function (n) {
    let value = 0;
    for (let i = 0; i < n; i++) {
      const v = this.values[this.pos++];
      if (v === undefined) throw new Error("Unexpected fumen (buffer end)");
      value += v * Math.pow(TLEN, i);
    }
    return value;
  };
  Buffer.prototype.isEmpty = function () { return this.pos >= this.values.length; };

  // ---- フィールド内部表現（field:230 (y0..22) + garbage:10 (y=-1)）----
  function FF() { this.field = new Array(230).fill(0); this.garbage = new Array(10).fill(0); }
  FF.prototype.copy = function () { const f = new FF(); f.field = this.field.slice(); f.garbage = this.garbage.slice(); return f; };
  FF.prototype.addNumber = function (x, y, value) {
    if (y >= 0) this.field[x + y * 10] += value;
    else this.garbage[x + (-(y + 1)) * 10] += value;
  };
  FF.prototype.getAt = function (x, y) {
    if (y >= 0) return this.field[x + y * 10] | 0;
    return this.garbage[x + (-(y + 1)) * 10] | 0;
  };
  FF.prototype.setAt = function (x, y, v) {
    if (y >= 0) this.field[x + y * 10] = v;
    else this.garbage[x + (-(y + 1)) * 10] = v;
  };
  FF.prototype.fill = function (type, rotation, x, y) {
    const blocks = getBlocks(type, rotation);
    for (let i = 0; i < blocks.length; i++) this.setAt(x + blocks[i][0], y + blocks[i][1], type);
  };
  FF.prototype.clearLine = function () {
    const rows = [];
    for (let y = 0; y < 23; y++) rows.push(this.field.slice(y * 10, (y + 1) * 10));
    const kept = rows.filter(function (line) { return !line.every(function (v) { return v !== 0; }); });
    while (kept.length < 23) kept.push(new Array(10).fill(0)); // 上(高y)へ空行を補充
    let nf = [];
    for (let i = 0; i < kept.length; i++) nf = nf.concat(kept[i]);
    this.field = nf;
  };
  FF.prototype.riseGarbage = function () {
    this.field = this.garbage.concat(this.field).slice(0, 230);
    this.garbage = new Array(10).fill(0);
  };
  FF.prototype.mirror = function () {
    let nf = [];
    for (let y = 0; y < 23; y++) {
      const line = this.field.slice(y * 10, (y + 1) * 10);
      line.reverse();
      nf = nf.concat(line);
    }
    this.field = nf;
  };

  // ---- ミノ形状（fumen座標: y上方向が正, 中心基準）----
  function basePieces(type) {
    switch (type) {
      case 1: return [[0, 0], [-1, 0], [1, 0], [2, 0]];   // I
      case 5: return [[0, 0], [-1, 0], [1, 0], [0, 1]];   // T
      case 3: return [[0, 0], [1, 0], [0, 1], [1, 1]];    // O
      case 2: return [[0, 0], [-1, 0], [1, 0], [1, 1]];   // L
      case 6: return [[0, 0], [-1, 0], [1, 0], [-1, 1]];  // J
      case 7: return [[0, 0], [-1, 0], [0, 1], [1, 1]];   // S
      case 4: return [[0, 0], [1, 0], [0, 1], [-1, 1]];   // Z
    }
    return [];
  }
  // rotation: 0=Spawn(Reverseではない) ... 実際は decodeAction が enum値で渡す
  // enum: Spawn=0, Right=1, Reverse=2, Left=3
  function getBlocks(type, rotation) {
    const b = basePieces(type);
    if (rotation === 0) return b;                                   // Spawn
    if (rotation === 3) return b.map(function (p) { return [-p[1], p[0]]; });  // Left
    if (rotation === 2) return b.map(function (p) { return [-p[0], -p[1]]; }); // Reverse
    if (rotation === 1) return b.map(function (p) { return [p[1], -p[0]]; });  // Right
    return b;
  }

  // ---- アクション(3 base64)デコード ----
  // fieldTop は版で変わる（115:23 / 110:21）。numFieldBlocks=(fieldTop+1)*10。
  function decodeAction(v, fieldTop) {
    const numFieldBlocks = (fieldTop + 1) * 10;
    let value = v;
    const type = value % 8; value = Math.floor(value / 8);
    const rotRaw = value % 4; value = Math.floor(value / 4);
    // rotRaw: 0=Reverse 1=Right 2=Spawn 3=Left → enum(Spawn0,Right1,Reverse2,Left3)
    const rotation = (rotRaw === 0) ? 2 : (rotRaw === 1) ? 1 : (rotRaw === 2) ? 0 : 3;
    const coordVal = value % numFieldBlocks; value = Math.floor(value / numFieldBlocks);
    const coord = decodeCoordinate(coordVal, type, rotation, fieldTop);
    const rise = (value % 2) !== 0; value = Math.floor(value / 2);
    const mirror = (value % 2) !== 0; value = Math.floor(value / 2);
    const colorize = (value % 2) !== 0; value = Math.floor(value / 2);
    const comment = (value % 2) !== 0; value = Math.floor(value / 2);
    const lock = !((value % 2) !== 0);
    return { rise: rise, mirror: mirror, colorize: colorize, comment: comment, lock: lock,
      piece: { type: type, rotation: rotation, x: coord.x, y: coord.y } };
  }
  function decodeCoordinate(n, type, rotation, fieldTop) {
    let x = n % 10;
    const originY = Math.floor(n / 10);
    let y = fieldTop - originY - 1;
    // O=3 I=1 S=7 Z=4 の補正（enum: Spawn0 Right1 Reverse2 Left3）
    if (type === 3 && rotation === 3) { x += 1; y -= 1; }
    else if (type === 3 && rotation === 2) { x += 1; }
    else if (type === 3 && rotation === 0) { y -= 1; }
    else if (type === 1 && rotation === 2) { x += 1; }
    else if (type === 1 && rotation === 3) { y -= 1; }
    else if (type === 7 && rotation === 0) { y -= 1; }
    else if (type === 7 && rotation === 1) { x -= 1; }
    else if (type === 4 && rotation === 0) { y -= 1; }
    else if (type === 4 && rotation === 3) { x += 1; }
    return { x: x, y: y };
  }

  function isMino(type) { return type !== 0 && type !== 8; }

  // ---- 抽出（バージョン判定）----
  function extract(str) {
    let data = str;
    const amp = data.indexOf("&");
    if (amp >= 0) data = data.substring(0, amp);
    let m = str.match(/[vmd]115@/);
    if (m && m.index !== undefined) return { version: "115", data: data.substr(m.index + 5).replace(/[?\s]+/g, "") };
    m = str.match(/[vmd]110@/);
    if (m && m.index !== undefined) return { version: "110", data: data.substr(m.index + 5).replace(/[?\s]+/g, "") };
    throw new Error("対応していないテト譜バージョンです（v115/v110のみ）");
  }

  // ---- 本体デコード ----
  function decodePages(str) {
    const ex = extract(str);
    const fieldTop = (ex.version === "115") ? 23 : 21;
    const numFieldBlocks = (fieldTop + 1) * 10;
    const buffer = new Buffer(ex.data);

    function updateField(prev) {
      const result = { changed: true, field: prev };
      let index = 0;
      while (index < numFieldBlocks) {
        const diffBlock = buffer.poll(2);
        const diff = Math.floor(diffBlock / numFieldBlocks);
        const numOfBlocks = diffBlock % numFieldBlocks;
        if (diff === 8 && numOfBlocks === numFieldBlocks - 1) result.changed = false;
        for (let block = 0; block < numOfBlocks + 1; block++) {
          const x = index % 10;
          const y = fieldTop - Math.floor(index / 10) - 1;
          result.field.addNumber(x, y, diff - 8);
          index += 1;
        }
      }
      return result;
    }

    let prevField = new FF();
    let repeatCount = -1;
    const pages = [];

    while (!buffer.isEmpty()) {
      let cur;
      if (repeatCount > 0) { cur = { field: prevField, changed: false }; repeatCount -= 1; }
      else {
        cur = updateField(prevField.copy());
        if (!cur.changed) repeatCount = buffer.poll(1);
      }
      const action = decodeAction(buffer.poll(3), fieldTop);
      if (action.comment) {
        const len = buffer.poll(2);
        const times = Math.floor((len + 3) / 4);
        for (let i = 0; i < times; i++) buffer.poll(5); // コメントは消費のみ（本文は使わない）
      }
      let op = null;
      if (action.piece.type !== 0) op = { type: action.piece.type, rotation: action.piece.rotation, x: action.piece.x, y: action.piece.y };
      pages.push({ field: cur.field.copy(), op: op, lock: action.lock });

      if (action.lock) {
        if (isMino(action.piece.type)) cur.field.fill(action.piece.type, action.piece.rotation, action.piece.x, action.piece.y);
        cur.field.clearLine();
        if (action.rise) cur.field.riseGarbage();
        if (action.mirror) cur.field.mirror();
      }
      prevField = cur.field;
    }
    return pages;
  }

  // ---- アプリ用: 最終フレームを 20x10(色|null) に変換 ----
  function valueToColor(v) {
    if (!v) return null;
    if (v === 8) return "#7a8290"; // Gray(お邪魔)
    const letter = PIECE_LETTER[v];
    if (letter && window.TT && window.TT.PIECES[letter]) return window.TT.PIECES[letter].color;
    return "#9aa7b5";
  }
  function toTargetField(str) {
    let pages;
    try { pages = decodePages(str); }
    catch (e) { return { error: e.message || "デコードに失敗しました" }; }
    if (!pages.length) return { error: "ページがありません" };
    const last = pages[pages.length - 1];
    let ff = last.field;
    if (last.op && isMino(last.op.type)) {
      ff = ff.copy();
      ff.fill(last.op.type, last.op.rotation, last.op.x, last.op.y);
    }
    // fumen(y0=下,高さ23) → 本ツール(行0=上,20行)
    const field = [];
    for (let r = 0; r < 20; r++) { const row = []; for (let c = 0; c < 10; c++) row.push(null); field.push(row); }
    let any = false;
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        const v = ff.getAt(x, y);
        if (v) { field[19 - y][x] = valueToColor(v); any = true; }
      }
    }
    if (!any) return { error: "盤面が空です（最終ページにブロックがありません）" };
    return { field: field, pages: pages.length };
  }

  return { decodePages: decodePages, toTargetField: toTargetField, extract: extract, FF: FF };
})();
