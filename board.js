// Dashboard tabs: overview, operations, orders, stalls and items. Draws only when the server returns overview data.
window.hmBoard = function (hm) {
var root = hm.root, el = hm.el;
var tab = "overview", last = null, filter = "";
var NAMES = { overview: "Overview", ops: "Operations", orders: "Orders", manage: "Stalls and items" };
var bar = el("div", "tabs"), body = el("div", "tab-body");
root.textContent = ""; root.appendChild(bar); root.appendChild(body);
Object.keys(NAMES).forEach(function (k) {
  var b = el("button", "tab", NAMES[k]); b.type = "button"; b.dataset.k = k;
  b.onclick = function () { tab = k; draw(); };
  bar.appendChild(b);
});
function stat(label, value, note) {
  var s = el("div", "stat");
  s.appendChild(el("p", "stat-n", String(value)));
  s.appendChild(el("p", "stat-l", label));
  if (note) s.appendChild(el("p", "stat-note", note));
  return s;
}
function ago(iso) {
  if (!iso) return "none yet";
  var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  if (m < 1440) return Math.round(m / 60) + " h ago";
  return Math.round(m / 1440) + " d ago";
}
function rupee(n) { return "\u20B9" + (Math.round(n) || 0); }
function drawOverview() {
  var o = last.overview, g = el("div", "stats");
  g.appendChild(stat("Visitors today", o.visitors, "Distinct browsers, counted once per visit"));
  g.appendChild(stat("Active right now", o.active, "Seen in the last 2 minutes"));
  g.appendChild(stat("Orders today", o.ordersToday, "Cancelled and deleted ones excluded"));
  g.appendChild(stat("Order value today", rupee(o.valueToday), "Sum of order totals, not money collected"));
  body.appendChild(g);
  body.appendChild(el("h2", "dash-h", "By stall, today"));
  var rows = o.perStall.filter(function (s) { return s.orders > 0; });
  if (!rows.length) body.appendChild(el("p", "dash-p", "No orders today yet."));
  rows.forEach(function (s) {
    var r = el("div", "item-row");
    r.appendChild(el("span", "item-row-name", s.name));
    r.appendChild(el("span", "dash-p", s.orders + " order" + (s.orders === 1 ? "" : "s") + " \u00b7 " + rupee(s.value)));
    body.appendChild(r);
  });
  body.appendChild(el("h2", "dash-h", "All time"));
  var t = el("div", "stats");
  t.appendChild(stat("Orders", o.ordersTotal));
  t.appendChild(stat("Live stalls", last.stalls.filter(function (s) { return s.status === "live"; }).length, "of " + last.stalls.length));
  body.appendChild(t);
}
function drawOps() {
  var o = last.overview, g = el("div", "stats");
  g.appendChild(stat("Last order", ago(o.lastOrderAt)));
  g.appendChild(stat("Reports waiting", last.bugs.length, "Most recent 25 shown below"));
  g.appendChild(stat("Server round trip", (hm.lastMs / 1000).toFixed(1) + " s", "Time this dashboard just took to load"));
  g.appendChild(stat("Page views today", o.views, "Includes repeat loads"));
  body.appendChild(g);
  body.appendChild(el("p", "dash-p", "A round trip over about 8 seconds means the server is slow right now."));
  body.appendChild(el("h2", "dash-h", "Bug reports and complaints"));
  if (!last.bugs.length) body.appendChild(el("p", "empty", "Nothing reported."));
  last.bugs.forEach(function (b) {
    var c = el("article", "card order-card handled");
    c.appendChild(el("p", "dash-where", b.message));
    c.appendChild(el("p", "stall", [b.name, b.contact, b.stall, hm.clock(b.time)].filter(Boolean).join(" \u00b7 ")));
    body.appendChild(c);
  });
}
function drawOrdersTab() {
  var sel = el("select", "filter");
  var all = el("option", "", "All stalls"); all.value = ""; sel.appendChild(all);
  last.stalls.forEach(function (s) { var op = el("option", "", s.name); op.value = s.id; sel.appendChild(op); });
  sel.value = filter;
  sel.onchange = function () { filter = sel.value; draw(); };
  body.appendChild(sel);
  var box = el("div", "");
  body.appendChild(box);
  var list = last.orders.filter(function (o) { return !filter || o.stallId === filter; });
  hm.drawOrders(list, box, { stallNames: true, onChange: draw });
}
function drawManage() {
  body.appendChild(el("h2", "dash-h", "Stalls"));
  body.appendChild(el("p", "dash-p", "Live stalls can take orders. Pending ones are hidden from the site."));
  last.stalls.forEach(function (s) {
    var row = el("div", "item-row");
    row.appendChild(el("span", "item-row-name", s.name + " \u00b7 " + (s.status === "live" ? "LIVE" : "PENDING")));
    var b = el("button", "order" + (s.status === "live" ? " off" : ""), s.status === "live" ? "Set pending" : "Set live");
    b.type = "button";
    b.onclick = function () {
      b.disabled = true; s.status = s.status === "live" ? "pending" : "live"; draw();
      hm.api({ action: "stallstatus", stallId: s.id, status: s.status }).then(function () { hm.refresh(); });
    };
    row.appendChild(b); body.appendChild(row);
  });
  body.appendChild(el("h2", "dash-h", "Items"));
  last.items.forEach(function (it) {
    var st = last.stalls.filter(function (s) { return s.id === it.stall; })[0];
    var row = el("div", "item-row");
    row.appendChild(el("span", "item-row-name", (st ? st.name + " \u00b7 " : "") + it.name + " \u00b7 " + rupee(it.price)));
    var pb = el("button", "order off quiet", "Edit price"); pb.type = "button";
    pb.onclick = function () {
      var v = window.prompt("New price in rupees for " + it.name, String(it.price));
      if (v === null) return;
      var n = Number(v);
      if (!(n > 0 && n < 100000)) { window.alert("Enter a price above 0."); return; }
      hm.api({ action: "edititem", itemId: it.id, price: n }).then(function (r) { if (r.ok) { it.price = n; draw(); } else window.alert("Could not save. Try again."); });
    };
    var sb = el("button", "order" + (it.inStock ? "" : " off"), it.inStock ? "Sold out" : "Back in stock"); sb.type = "button";
    sb.onclick = function () {
      sb.disabled = true;
      hm.api({ action: "stock", itemId: it.id, inStock: !it.inStock }).then(function (r) { if (r.ok) { it.inStock = !it.inStock; draw(); } else sb.disabled = false; });
    };
    row.appendChild(pb); row.appendChild(sb); body.appendChild(row);
  });
}
function draw() {
  if (!last) return;
  body.textContent = "";
  Array.prototype.forEach.call(bar.children, function (b) { b.classList.toggle("on", b.dataset.k === tab); });
  ({ overview: drawOverview, ops: drawOps, orders: drawOrdersTab, manage: drawManage })[tab]();
}
return { update: function (res) { last = res; draw(); } };
};
