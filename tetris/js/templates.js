/* 練習テンプレート定義
   各テンプレは steps の列で表現する:
     { piece: 'O', rot: 0, col: 0 }
   col は「そのミノが実際に占める一番左の列」(0=左壁にぴったり)。
   回転状態ごとのローカル座標の差は app 側で吸収して px に変換する。
   落下行(py)はエンジンがその時点の積みに対して自動計算する
   → 人間の操作「回転して列へ動かしてハードドロップ」と一致。

   rot: 0=出現, 1=右回転(CW), 2=180, 3=左回転(CCW)。

   注意: テンプレ途中ではライン消去が起きない前提（最終手で揃える）。
   各テンプレは app の検証で「盤外/重なり/穴/PC成立」を自動チェックする。 */
window.TT_TEMPLATES = (function () {
  "use strict";

  const list = [
    {
      id: "pc_oi",
      name: "4ライン パーフェクトクリア (O×8 + I×2)",
      category: "開幕/PC",
      pc: true,
      desc: "Oミノで左8列を4段ぶん埋め、最後に縦Iを2本立てて4ライン同時消し(テトリス)。ハードドロップ・移動・反復の基本に最適。",
      steps: [
        { piece: "O", rot: 0, col: 0 },
        { piece: "O", rot: 0, col: 0 },
        { piece: "O", rot: 0, col: 2 },
        { piece: "O", rot: 0, col: 2 },
        { piece: "O", rot: 0, col: 4 },
        { piece: "O", rot: 0, col: 4 },
        { piece: "O", rot: 0, col: 6 },
        { piece: "O", rot: 0, col: 6 },
        { piece: "I", rot: 1, col: 8 },
        { piece: "I", rot: 1, col: 9 },
      ],
    },
    {
      id: "pc_flat2",
      name: "2ライン パーフェクトクリア (I×4 + O)",
      category: "開幕/PC",
      pc: true,
      desc: "横Iで下2段の左8列を敷き、最後にOで右2列を埋めて2ライン同時消し。少ない手数でPCの感覚をつかむ反復ドリル。",
      steps: [
        { piece: "I", rot: 0, col: 0 },
        { piece: "I", rot: 0, col: 4 },
        { piece: "I", rot: 0, col: 0 },
        { piece: "I", rot: 0, col: 4 },
        { piece: "O", rot: 0, col: 8 },
      ],
    },
    {
      id: "flat4",
      name: "平積みドリル (O×4 フラット)",
      category: "基礎",
      pc: false,
      desc: "左8列を凹凸なく2段だけ平らに積む基礎反復（消去なし）。回転・横移動・ハードドロップの指慣らし用。",
      steps: [
        { piece: "O", rot: 0, col: 0 },
        { piece: "O", rot: 0, col: 2 },
        { piece: "O", rot: 0, col: 4 },
        { piece: "O", rot: 0, col: 6 },
      ],
    },
  ];

  function byId(id) { return list.find(function (t) { return t.id === id; }); }
  function categories() {
    const out = [];
    list.forEach(function (t) { if (out.indexOf(t.category) < 0) out.push(t.category); });
    return out;
  }

  return { list: list, byId: byId, categories: categories };
})();
