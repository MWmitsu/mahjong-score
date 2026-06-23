/* テトリス・コアエンジン（SRS準拠）
   - 盤面 10x20、座標は row=0 が上端 / row=ROWS-1 が下端、col=0 が左端。
   - ミノは「ボックス左上(px,py)」＋「回転状態 rot(0,1,2,3)」で表現。
   - 純粋ロジックのみ（DOM非依存）。window.TT に公開。 */
window.TT = (function () {
  "use strict";

  const COLS = 10;
  const ROWS = 20;

  /* 各ミノの回転状態ごとのセル座標 [row, col]（ボックス内ローカル座標）。
     SRS の「真の回転（中心まわり）」を満たすよう状態を明示定義している。
     rot: 0=出現, 1=右回転(CW), 2=180, 3=左回転(CCW)。 */
  const PIECES = {
    I: {
      color: "#27c4e6",
      spawnCol: 3,
      states: [
        [[1, 0], [1, 1], [1, 2], [1, 3]],
        [[0, 2], [1, 2], [2, 2], [3, 2]],
        [[2, 0], [2, 1], [2, 2], [2, 3]],
        [[0, 1], [1, 1], [2, 1], [3, 1]],
      ],
    },
    J: {
      color: "#4763e8",
      spawnCol: 3,
      states: [
        [[0, 0], [1, 0], [1, 1], [1, 2]],
        [[0, 1], [0, 2], [1, 1], [2, 1]],
        [[1, 0], [1, 1], [1, 2], [2, 2]],
        [[0, 1], [1, 1], [2, 0], [2, 1]],
      ],
    },
    L: {
      color: "#ef8a17",
      spawnCol: 3,
      states: [
        [[0, 2], [1, 0], [1, 1], [1, 2]],
        [[0, 1], [1, 1], [2, 1], [2, 2]],
        [[1, 0], [1, 1], [1, 2], [2, 0]],
        [[0, 0], [0, 1], [1, 1], [2, 1]],
      ],
    },
    S: {
      color: "#3fce4d",
      spawnCol: 3,
      states: [
        [[0, 1], [0, 2], [1, 0], [1, 1]],
        [[0, 1], [1, 1], [1, 2], [2, 2]],
        [[1, 1], [1, 2], [2, 0], [2, 1]],
        [[0, 0], [1, 0], [1, 1], [2, 1]],
      ],
    },
    Z: {
      color: "#e74060",
      spawnCol: 3,
      states: [
        [[0, 0], [0, 1], [1, 1], [1, 2]],
        [[0, 2], [1, 1], [1, 2], [2, 1]],
        [[1, 0], [1, 1], [2, 1], [2, 2]],
        [[0, 1], [1, 0], [1, 1], [2, 0]],
      ],
    },
    T: {
      color: "#a855e8",
      spawnCol: 3,
      states: [
        [[0, 1], [1, 0], [1, 1], [1, 2]],
        [[0, 1], [1, 1], [1, 2], [2, 1]],
        [[1, 0], [1, 1], [1, 2], [2, 1]],
        [[0, 1], [1, 0], [1, 1], [2, 1]],
      ],
    },
    O: {
      color: "#f4c430",
      spawnCol: 3,
      states: [
        [[0, 1], [0, 2], [1, 1], [1, 2]],
        [[0, 1], [0, 2], [1, 1], [1, 2]],
        [[0, 1], [0, 2], [1, 1], [1, 2]],
        [[0, 1], [0, 2], [1, 1], [1, 2]],
      ],
    },
  };

  /* 壁蹴りテーブル（配列座標系: dr が下方向で正）。
     wiki の (x,y)[y上向き] を (dc, dr=-y) に変換済み。 */
  const KICKS_JLSTZ = {
    "01": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "10": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    "12": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    "21": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "23": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "32": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "30": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "03": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  };
  const KICKS_I = {
    "01": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    "10": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    "12": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    "21": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    "23": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    "32": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    "30": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    "03": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  };

  const ORDER = ["I", "J", "L", "O", "S", "T", "Z"];

  function emptyGrid() {
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) row.push(null);
      g.push(row);
    }
    return g;
  }

  function cloneGrid(g) { return g.map(function (row) { return row.slice(); }); }

  /* ボックス左上(px,py)・回転rot のミノが占める盤面セル [row,col] を返す */
  function absCells(piece, rot, px, py) {
    const local = PIECES[piece].states[rot];
    const out = [];
    for (let i = 0; i < 4; i++) out.push([py + local[i][0], px + local[i][1]]);
    return out;
  }

  /* 衝突判定: 盤外(左右・下)または既存ブロックと重なれば true。
     row<0（盤面上方）は空きとして許容（出現直後の回転を可能にするため）。 */
  function collide(grid, piece, rot, px, py) {
    const cells = absCells(piece, rot, px, py);
    for (let i = 0; i < 4; i++) {
      const r = cells[i][0], c = cells[i][1];
      if (c < 0 || c >= COLS) return true;
      if (r >= ROWS) return true;
      if (r >= 0 && grid[r][c]) return true;
    }
    return false;
  }

  /* px 固定でハードドロップ後の py を返す（出現位置から下げていく） */
  function dropY(grid, piece, rot, px, startPy) {
    let py = (startPy == null) ? -2 : startPy;
    while (!collide(grid, piece, rot, px, py + 1)) py++;
    return py;
  }

  /* ミノを盤面に固定（破壊的）。row<0 のセルは盤外なので書き込まない。 */
  function lock(grid, piece, rot, px, py) {
    const cells = absCells(piece, rot, px, py);
    const color = PIECES[piece].color;
    for (let i = 0; i < 4; i++) {
      const r = cells[i][0], c = cells[i][1];
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = color;
    }
  }

  /* 揃った行を消去。{ grid, cleared, rows } を返す（rows は消えた行index）。 */
  function clearLines(grid) {
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      let full = true;
      for (let c = 0; c < COLS; c++) if (!grid[r][c]) { full = false; break; }
      if (full) rows.push(r);
    }
    if (rows.length === 0) return { grid: grid, cleared: 0, rows: rows };
    const kept = [];
    for (let r = 0; r < ROWS; r++) if (rows.indexOf(r) < 0) kept.push(grid[r]);
    const ng = [];
    for (let i = 0; i < rows.length; i++) {
      const row = [];
      for (let c = 0; c < COLS; c++) row.push(null);
      ng.push(row);
    }
    return { grid: ng.concat(kept), cleared: rows.length, rows: rows };
  }

  /* SRS 回転。dir: +1=CW, -1=CCW。成功時 {rot,px,py,kick}、失敗時 null。
     kick は採用した壁蹴りオフセットの index（0=蹴りなし, 4=最遠の蹴り）。 */
  function rotate(grid, st, dir) {
    const from = st.rot;
    const to = (from + (dir > 0 ? 1 : 3)) % 4;
    if (st.piece === "O") return { rot: to, px: st.px, py: st.py, kick: 0 };
    const table = (st.piece === "I") ? KICKS_I : KICKS_JLSTZ;
    const kicks = table[String(from) + String(to)];
    for (let i = 0; i < kicks.length; i++) {
      const dc = kicks[i][0], dr = kicks[i][1];
      const npx = st.px + dc, npy = st.py + dr;
      if (!collide(grid, st.piece, to, npx, npy)) return { rot: to, px: npx, py: npy, kick: i };
    }
    return null;
  }

  /* T-spin 判定（ガイドライン 3-corner ルール）。
     直前の操作が回転であること（lastRotation）は呼び出し側が保証する。
     返り値: 'none' | 'mini' | 'full'。
     kickIndex===4（最遠の蹴り=TSTキック）なら mini を full に格上げ。 */
  function tSpinType(grid, st, kickIndex) {
    if (st.piece !== "T") return "none";
    const cr = st.py + 1, cc = st.px + 1; // T の中心セル（ローカル(1,1)）の盤面座標
    function filled(r, c) {
      if (c < 0 || c >= COLS || r >= ROWS) return true; // 壁・床は埋まり扱い
      if (r < 0) return false;
      return !!grid[r][c];
    }
    const tl = filled(cr - 1, cc - 1), tr = filled(cr - 1, cc + 1);
    const bl = filled(cr + 1, cc - 1), br = filled(cr + 1, cc + 1);
    const corners = (tl ? 1 : 0) + (tr ? 1 : 0) + (bl ? 1 : 0) + (br ? 1 : 0);
    if (corners < 3) return "none";
    // 凸側（pointing side）の2隅
    let front;
    if (st.rot === 0) front = [tl, tr];
    else if (st.rot === 1) front = [tr, br];
    else if (st.rot === 2) front = [bl, br];
    else front = [tl, bl];
    const filledFront = (front[0] ? 1 : 0) + (front[1] ? 1 : 0);
    if (filledFront === 2) return "full";
    if (kickIndex === 4) return "full"; // TSTキック等での格上げ
    return "mini";
  }

  /* 7-bag: ORDER をシャッフルして返す */
  function newBag() {
    const bag = ORDER.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
    }
    return bag;
  }

  function spawnState(piece) {
    return { piece: piece, rot: 0, px: PIECES[piece].spawnCol, py: 0 };
  }

  /* セル集合を "r,c" 文字列 Set 風（ソート済み配列）に正規化して比較用に返す */
  function cellKey(cells) {
    return cells.map(function (rc) { return rc[0] + "," + rc[1]; }).sort().join("|");
  }

  return {
    COLS: COLS, ROWS: ROWS, PIECES: PIECES, ORDER: ORDER,
    emptyGrid: emptyGrid, cloneGrid: cloneGrid, absCells: absCells,
    collide: collide, dropY: dropY, lock: lock, clearLines: clearLines,
    rotate: rotate, tSpinType: tSpinType, newBag: newBag, spawnState: spawnState, cellKey: cellKey,
  };
})();
