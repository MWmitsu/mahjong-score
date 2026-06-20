/* UI補助: DOM生成・トースト・数値整形。 */
window.MJ = window.MJ || {};
MJ.ui = (function () {
  "use strict";

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      });
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  // ポイント整形（小数は最大1桁、符号付き）
  function fmtPoint(n) {
    const r = Math.round(n * 10) / 10;
    const s = (r % 1 === 0) ? String(r) : r.toFixed(1);
    return (r > 0 ? "+" : "") + s;
  }
  function fmtYen(n) {
    const sign = n < 0 ? "-" : "";
    return sign + "¥" + Math.abs(Math.round(n)).toLocaleString("ja-JP");
  }
  function pointClass(n) { return n > 0 ? "pos" : (n < 0 ? "neg" : ""); }

  function fmtDate(iso) {
    const d = new Date(iso);
    const w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    return (d.getMonth() + 1) + "/" + d.getDate() + "(" + w + ")";
  }

  return { el: el, clear: clear, toast: toast, fmtPoint: fmtPoint, fmtYen: fmtYen, pointClass: pointClass, fmtDate: fmtDate };
})();
