(function () {
// Stall dashboard. A stall signs in with its name and an access code given to the stall.
// The code is checked on the server for every request and is never put in the page address.
var stallId = "";
var login = JSON.parse(localStorage.getItem("hmLogin") || "null");
var timer = null;
var cfg = null;
var editing = false;
var lastStall = null;
var seen = JSON.parse(sessionStorage.getItem("seen") || "[]");
var firstLoad = true;
var lastItems = null;
var lastOrders = [];
var view = null;

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function api(payload) {
  payload.login = login.login;
  payload.code = login.code;
  var t0 = Date.now();
  return fetch(cfg.backend.url, { method: "POST", body: JSON.stringify(payload) })
    .then(function (r) { return r.json(); })
    .then(function (j) { hm.lastMs = Date.now() - t0; return j; });
}

function clock(iso) {
  var d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ", " + d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function rupee(n) { return "\u20B9" + (Math.round(n) || 0); }

// ---------- orders: three clear sections ----------

var AWAITING = ["new", "awaiting"];

function section(title, sub, count, tone) {
  var s = el("section", "osec " + (tone || ""));
  var h = el("header", "osec-head");
  var t = el("div", "osec-t");
  t.appendChild(el("h2", "osec-title", title));
  if (sub) t.appendChild(el("p", "osec-sub", sub));
  h.appendChild(t);
  h.appendChild(el("span", "osec-count", String(count)));
  s.appendChild(h);
  return s;
}

function cardHead(o, opts) {
  var head = el("div", "card-head");
  head.appendChild(el("h3", "item-name", o.qty + " \u00d7 " + o.itemName));
  head.appendChild(el("p", "price", rupee(o.total)));
  return head;
}

function drawOrders(orders, boxEl, opts) {
  opts = opts || {};
  var box = boxEl || document.getElementById("orders");
  box.textContent = "";
  if (!boxEl && ofilter) orders = orders.filter(function (o) { return [o.id, o.itemName, o.name, o.hostel, o.room].join(" ").toLowerCase().indexOf(ofilter) !== -1; });
  orders = orders.slice().sort(function (a, b) { return a.time < b.time ? 1 : -1; });
  var waiting = orders.filter(function (o) { return AWAITING.indexOf(o.status) !== -1; });
  var making = orders.filter(function (o) { return o.status === "accepted"; });
  var done = orders.filter(function (o) { return ["delivered", "cancelled", "flagged", "expired"].indexOf(o.status) !== -1; });

  if (!boxEl) {
    var parts = [];
    parts.push(waiting.length + " awaiting payment check");
    parts.push(making.length + " to make");
    document.getElementById("new-count").textContent = parts.join("  \u00b7  ");
    document.title = (waiting.length ? "(" + waiting.length + ") " : "") + "Stall orders";
  }

  // 1. Awaiting payment verification
  var sw = section("Awaiting payment check", "Customers who have placed an order. Confirm the money arrived in your UPI app, then approve.", waiting.length, "tone-wait");
  if (!waiting.length) sw.appendChild(el("p", "empty", "Nothing waiting. New orders show up here by themselves."));
  waiting.forEach(function (o) {
    var card = el("article", "card order-card is-new");
    card.appendChild(cardHead(o, opts));
    if (!firstLoad && seen.indexOf(o.id) === -1) card.appendChild(el("p", "best", "Just in"));
    card.appendChild(el("p", "dash-where", o.hostel + (opts.stallNames && o.stallName ? " \u00b7 " + o.stallName : "")));
    card.appendChild(el("p", "stall", clock(o.time) + " \u00b7 " + o.id));
    var payer = el("p", "payer");
    payer.appendChild(el("span", "", "Paid from number ending "));
    payer.appendChild(el("b", "", o.mobileLast4 ? "\u2022\u2022\u2022\u2022 " + o.mobileLast4 : "unknown"));
    card.appendChild(payer);
    card.appendChild(el("p", "hint", "Verify payment from this number in your UPI app before approving. Customer name, room and full number unlock after you approve."));
    var extra = o.custom || {};
    Object.keys(extra).forEach(function (k) { if (extra[k]) card.appendChild(el("p", "dash-extra", k + ": " + extra[k])); });
    var actions = el("div", "actions");
    actions.appendChild(statusBtn(opts, o, "accepted", "Approve payment"));
    actions.appendChild(statusBtn(opts, o, "cancelled", "Not received", true));
    actions.appendChild(statusBtn(opts, o, "flagged", "Flag fake", true));
    card.appendChild(actions);
    sw.appendChild(card);
    if (seen.indexOf(o.id) === -1) seen.push(o.id);
  });
  box.appendChild(sw);

  // 2. Approved, still to make and hand over
  var sm = section("To make", "Payment verified. Make these and deliver them.", making.length, "tone-make");
  if (!making.length) sm.appendChild(el("p", "empty", "Nothing to make right now."));
  making.forEach(function (o) {
    var card = el("article", "card order-card handled");
    card.appendChild(cardHead(o, opts));
    card.appendChild(el("p", "dash-where", o.hostel + " \u00b7 Room " + o.room + (opts.stallNames && o.stallName ? " \u00b7 " + o.stallName : "")));
    var who = el("p", "stall");
    who.appendChild(document.createTextNode(o.name + " \u00b7 "));
    if (/^\d{10}$/.test(o.mobile || "")) {
      var tel = el("a", "tel", "+91 " + o.mobile.slice(0, 5) + " " + o.mobile.slice(5));
      tel.href = "tel:+91" + o.mobile;
      who.appendChild(tel);
    }
    card.appendChild(who);
    card.appendChild(el("p", "stall", clock(o.time) + " \u00b7 " + o.id));
    var extra = o.custom || {};
    Object.keys(extra).forEach(function (k) { if (extra[k]) card.appendChild(el("p", "dash-extra", k + ": " + extra[k])); });
    var actions = el("div", "actions");
    actions.appendChild(statusBtn(opts, o, "delivered", "Mark delivered"));
    actions.appendChild(statusBtn(opts, o, "cancelled", "Cancel", true));
    card.appendChild(actions);
    sm.appendChild(card);
  });
  box.appendChild(sm);

  // 3. Finished
  if (done.length) {
    var det = el("details", "osec tone-done");
    var sum = el("summary", "osec-head");
    sum.appendChild(el("h2", "osec-title", "Completed"));
    sum.appendChild(el("span", "osec-count", String(done.length)));
    det.appendChild(sum);
    done.forEach(function (o) {
      var row = el("div", "done-row");
      row.appendChild(el("span", "done-main", o.qty + " \u00d7 " + o.itemName + " \u00b7 " + rupee(o.total)));
      row.appendChild(el("span", "done-meta", (o.name ? o.name + " \u00b7 " : "") + o.hostel + " \u00b7 " + clock(o.time)));
      row.appendChild(el("span", "facts-status", o.status.toUpperCase()));
      det.appendChild(row);
    });
    box.appendChild(det);
  }
  sessionStorage.setItem("seen", JSON.stringify(seen));
  firstLoad = false;
}

function statusBtn(opts, o, status, label, quiet) {
  var b = el("button", "order" + (quiet ? " off quiet" : ""), label);
  b.type = "button";
  b.onclick = function () {
    b.disabled = true;
    o.status = status;
    if (opts.onChange) opts.onChange(); else drawOrders(lastOrders);
    api({ action: "status", id: o.id, status: status }).then(function (r) {
      if (!r.ok) window.alert(r.error || "Could not save. Try again.");
      refresh();
    });
  };
  return b;
}

var ofilter = "";
var knownWaiting = null, audioCtx = null;
function unlockAudio() {
  try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch (e) {}
}
document.addEventListener("pointerdown", unlockAudio, { passive: true });
function ding() {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  try {
    unlockAudio(); if (!audioCtx) return;
    [[880, 0], [1175, 0.16]].forEach(function (n) {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = n[0]; o.connect(g); g.connect(audioCtx.destination);
      var t = audioCtx.currentTime + n[1];
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t); o.stop(t + 0.4);
    });
  } catch (e) {}
}
function checkNewOrders(orders) {
  var ids = orders.filter(function (o) { return AWAITING.indexOf(o.status) !== -1; }).map(function (o) { return o.id; });
  if (knownWaiting) {
    var fresh = ids.filter(function (id) { return knownWaiting.indexOf(id) === -1; });
    if (fresh.length) {
      ding();
      var line = document.getElementById("status-line");
      if (line) line.textContent = fresh.length + " new order" + (fresh.length === 1 ? "" : "s") + " just came in";
    }
  }
  knownWaiting = ids;
}
var tabNow = "overview";
var TABS = [["overview", "Overview"], ["orders", "Orders"], ["menu", "Menu"], ["settings", "Settings"], ["support", "Support"]];
var editId = "";

function setTab(k) {
  tabNow = k;
  TABS.forEach(function (t) { document.getElementById("p-" + t[0]).hidden = t[0] !== k; });
  Array.prototype.forEach.call(document.getElementById("stabs").children, function (b) { b.classList.toggle("on", b.dataset.k === k); b.setAttribute("aria-selected", b.dataset.k === k ? "true" : "false"); });
}

function buildTabs() {
  var bar = document.getElementById("stabs");
  if (bar.children.length) return;
  TABS.forEach(function (t) {
    var b = el("button", "tab", t[1]); b.type = "button"; b.dataset.k = t[0]; b.setAttribute("role", "tab");
    b.onclick = function () { setTab(t[0]); window.scrollTo(0, 0); };
    var c = el("span", "tab-n"); c.id = "tn-" + t[0]; b.appendChild(c);
    bar.appendChild(b);
  });
  setTab(tabNow);
}

function sameDay(iso) { return new Date(iso).toDateString() === new Date().toDateString(); }

function stat(label, value, note) {
  var s = el("div", "stat");
  s.appendChild(el("p", "stat-n", String(value)));
  s.appendChild(el("p", "stat-l", label));
  if (note) s.appendChild(el("p", "stat-note", note));
  return s;
}

function drawOverview() {
  var box = document.getElementById("p-overview"); box.textContent = "";
  var os = lastOrders || [], its = lastItems || [];
  var wait = os.filter(function (o) { return AWAITING.indexOf(o.status) !== -1; });
  var make = os.filter(function (o) { return o.status === "accepted"; });
  var del = os.filter(function (o) { return o.status === "delivered"; });
  var today = del.concat(make).filter(function (o) { return sameDay(o.time); });
  var earn = today.reduce(function (a, o) { return a + (Number(o.total) || 0); }, 0);
  var allEarn = del.concat(make).reduce(function (a, o) { return a + (Number(o.total) || 0); }, 0);
  var out = its.filter(function (i) { return !i.inStock; });
  var st = el("div", "stats");
  st.appendChild(stat("Awaiting payment check", wait.length, wait.length ? "Needs you now" : "All clear"));
  st.appendChild(stat("To make", make.length, "Payment approved"));
  st.appendChild(stat("Approved today", rupee(earn), today.length + " order" + (today.length === 1 ? "" : "s")));
  st.appendChild(stat("Approved in total", rupee(allEarn), del.length + " delivered"));
  st.appendChild(stat("Items sold out", out.length, "of " + its.length + " on your menu"));
  box.appendChild(st);
  box.appendChild(el("p", "dash-p", "Amounts are the orders you approved, paid to your UPI ID directly. The site never holds money."));
  var sec = section("Needs your attention", "What to do next.", 0, "tone-wait");
  var n = 0;
  function row(text, label, go) {
    n++;
    var r = el("div", "item-row"); r.appendChild(el("span", "item-row-name", text));
    var b = el("button", "order", label); b.type = "button"; b.onclick = go; r.appendChild(b); sec.appendChild(r);
  }
  if (wait.length) row(wait.length + " order" + (wait.length === 1 ? "" : "s") + " waiting for a payment check", "Review", function () { setTab("orders"); });
  if (make.length) row(make.length + " approved order" + (make.length === 1 ? "" : "s") + " to make and deliver", "Open", function () { setTab("orders"); });
  if (out.length) row(out.length + " item" + (out.length === 1 ? " is" : "s are") + " sold out", "Manage menu", function () { setTab("menu"); });
  if (!n) sec.appendChild(el("p", "empty", "Nothing needs you right now. New orders appear here by themselves."));
  sec.querySelector(".osec-count").textContent = String(n);
  box.appendChild(sec);
  var tn = function (id, v) { var e = document.getElementById("tn-" + id); if (e) e.textContent = v ? String(v) : ""; };
  tn("orders", wait.length);
}

function drawItems(items) {
  var box = document.getElementById("items");
  box.textContent = "";
  document.getElementById("menu-count").textContent = String(items.length);
  document.getElementById("stock-help").textContent = "Out of something? Tap Sold out. Prices and names you change here update on the site within about a minute.";
  if (!items.length) box.appendChild(el("p", "empty", "No items yet. Add your first one below."));
  items.forEach(function (it) {
    var row = el("div", "item-row mrow" + (it.inStock ? "" : " is-out"));
    if (editId === it.id) {
      var f = el("form", "inline-edit");
      var nm = el("input"); nm.value = it.name; nm.maxLength = 80; nm.required = true; nm.setAttribute("aria-label", "Item name");
      var pr = el("input"); pr.value = String(it.price); pr.inputMode = "numeric"; pr.maxLength = 5; pr.required = true; pr.setAttribute("aria-label", "Price in rupees");
      var sv = el("button", "order", "Save"); sv.type = "submit";
      var cx = el("button", "order off quiet", "Cancel"); cx.type = "button"; cx.onclick = function () { editId = ""; drawItems(items); };
      var em = el("p", "form-msg");
      f.appendChild(nm); f.appendChild(pr); f.appendChild(sv); f.appendChild(cx); f.appendChild(em);
      f.onsubmit = function (e) {
        e.preventDefault();
        var p = Number(pr.value);
        if (!(p > 0) || Math.round(p) !== p) { em.className = "form-msg err"; em.textContent = "Price must be a whole number of rupees."; return; }
        sv.disabled = true; em.className = "form-msg"; em.textContent = "Saving...";
        api({ action: "stallitem", itemId: it.id, name: nm.value.trim(), price: p }).then(function (r) {
          if (!r.ok) { sv.disabled = false; em.className = "form-msg err"; em.textContent = r.error === "Bad request" ? "Check the details and try again." : (r.error || "Could not save."); return; }
          it.name = nm.value.trim(); it.price = p; editId = ""; drawItems(items); drawOverview();
        }).catch(function () { sv.disabled = false; em.className = "form-msg err"; em.textContent = "Could not save. Try again."; });
      };
      row.appendChild(f); box.appendChild(row); return;
    }
    var main = el("div", "mrow-main");
    main.appendChild(el("span", "item-row-name", it.name));
    main.appendChild(el("span", "mrow-meta", "\u20B9" + it.price + (it.packLabel ? " \u00b7 " + it.packLabel : "") + (it.sub ? " \u00b7 " + it.sub : "")));
    row.appendChild(main);
    row.appendChild(el("span", "pill " + (it.inStock ? "pill-in" : "pill-out"), it.inStock ? "In stock" : "Sold out"));
    var acts = el("div", "mrow-acts");
    var eb = el("button", "order off quiet", "Edit"); eb.type = "button"; eb.onclick = function () { editId = it.id; drawItems(items); };
    var b = el("button", "order" + (it.inStock ? "" : " off"), it.inStock ? "Sold out" : "Back in stock");
    b.type = "button";
    b.onclick = function () {
      b.disabled = true;
      api({ action: "stock", itemId: it.id, inStock: !it.inStock }).then(function (r) {
        if (r.ok) { it.inStock = !it.inStock; drawItems(items); drawOverview(); }
        else b.disabled = false;
      }).catch(function () { b.disabled = false; });
    };
    acts.appendChild(eb); acts.appendChild(b); row.appendChild(acts);
    box.appendChild(row);
  });
}

function bulkStock(on) {
  var items = lastItems || [], todo = items.filter(function (i) { return i.inStock !== on; });
  var msg = document.getElementById("stock-help");
  if (!todo.length) return;
  if (!window.confirm((on ? "Put " : "Mark ") + todo.length + (on ? " items back in stock?" : " items sold out?"))) return;
  var i = 0;
  document.getElementById("all-out").disabled = true; document.getElementById("all-in").disabled = true;
  (function next() {
    if (i >= todo.length) { document.getElementById("all-out").disabled = false; document.getElementById("all-in").disabled = false; drawItems(items); drawOverview(); return; }
    msg.textContent = "Updating " + (i + 1) + " of " + todo.length + "...";
    var it = todo[i++];
    api({ action: "stock", itemId: it.id, inStock: on }).then(function (r) { if (r.ok) it.inStock = on; next(); }).catch(next);
  })();
}
document.getElementById("all-out").onclick = function () { bulkStock(false); };
document.getElementById("all-in").onclick = function () { bulkStock(true); };

document.getElementById("add-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var f = e.target, msg = document.getElementById("add-msg"), p = Number(f.elements.price.value);
  if (!(p > 0) || Math.round(p) !== p) { msg.className = "form-msg err"; msg.textContent = "Price must be a whole number of rupees."; return; }
  msg.className = "form-msg"; msg.textContent = "Adding...";
  api({ action: "additem", name: f.elements.name.value.trim(), price: p, category: f.elements.category.value, sub: f.elements.sub.value.trim(), packLabel: f.elements.packLabel.value.trim() }).then(function (r) {
    if (!r.ok) throw new Error(r.error || "failed");
    f.reset(); msg.textContent = "Added, as sold out. Switch it on from the list above when it is ready.";
    return refresh();
  }).catch(function (err) {
    msg.className = "form-msg err";
    msg.textContent = (err && err.message && err.message !== "failed" && err.message !== "Bad request") ? err.message : "Could not add. Try again in a minute.";
  });
});

function drawAddForm() {
  var f = document.getElementById("add-form"), c = f.elements.category;
  if (c.options.length) return;
  (cfg.categories || []).forEach(function (k) { var o = el("option", "", k.label); o.value = k.id; c.appendChild(o); });
}

function drawSettings() {
  var box = document.getElementById("p-settings"); box.textContent = "";
  var s = lastStall; if (!s) return;
  var sec = section("Your stall", "What customers and the site team see and use.", 0);
  sec.querySelector(".osec-count").hidden = true;
  function line(k, v) { var r = el("div", "kv"); r.appendChild(el("span", "kv-k", k)); r.appendChild(el("span", "kv-v", v || "Not set")); sec.appendChild(r); }
  line("Stall name", s.name);
  line("Owner", s.owner);
  line("UPI ID", s.upi);
  line("Delivers to", (s.hostels || []).join(", "));
  line("Most per order", String(s.maxQty || 5));
  var b = el("button", "order", "Edit details"); b.type = "button"; b.onclick = function () { showSetup(lastStall, false); };
  var w = el("div", "actions"); w.appendChild(b); sec.appendChild(w);
  sec.appendChild(el("p", "dash-p", "Your UPI ID makes the payment code at checkout. Change it only to an ID you own. Your access code is for your stall only and is not shown here."));
  box.appendChild(sec);
  var so = el("button", "order off quiet", "Sign out"); so.type = "button"; so.onclick = function () { document.getElementById("signout").click(); };
  box.appendChild(so);
}

document.getElementById("osearch").addEventListener("input", function (e) { ofilter = e.target.value.trim().toLowerCase(); drawOrders(lastOrders); });

var hm = { el: el, clock: clock, drawOrders: drawOrders, root: null, lastMs: 0, api: function (p) { return api(p); }, refresh: function () { return refresh(); } };

// ---------- screens: login, setup, dashboard ----------

function screen(which) {
  document.getElementById("login").hidden = which !== "login";
  document.getElementById("setup").hidden = which !== "setup";
  document.getElementById("board").hidden = which !== "board";
  var pg = document.getElementById("pending"); if (pg) pg.hidden = which !== "pending";
  var scx = document.getElementById("stall-complaint"); if (scx) scx.hidden = which !== "board";
  var inn = which === "setup" || which === "board" || which === "pending";
  document.getElementById("acct-business").hidden = !inn;
  document.getElementById("dash-kicker").textContent = which === "setup" ? "Setup" : which === "board" ? "Stall dashboard" : "Stall dashboard";
}

function loadBoard() {
  return new Promise(function (ok, no) {
    var s = document.createElement("script");
    s.src = "board.js";
    s.onload = ok; s.onerror = no;
    document.head.appendChild(s);
  });
}

function showSetup(stall, first) {
  editing = true;
  var f = document.getElementById("setup-form");
  document.getElementById("setup-title").textContent = first ? "A few details before you start" : "Payment and delivery details";
  document.getElementById("setup-kicker").textContent = first ? "Set up your stall" : "Your stall";
  f.elements.owner.value = stall.owner || "";
  f.elements.upi.value = stall.upi || "";
  f.elements.upi2.value = "";
  f.elements.ownerMobile.value = stall.ownerMobile || "";
  f.elements.ownerEmail.value = stall.ownerEmail || "";
  var tb = document.getElementById("setup-team"); tb.textContent = "";
  for (var ti = 0; ti < 4; ti++) {
    var tm = (stall.team && stall.team[ti]) || {};
    var row = el("div", "team-row");
    row.appendChild(el("p", "team-n", "Member " + (ti + 2)));
    [["name", "Full name", "text", 60], ["mobile", "10-digit mobile", "tel", 10], ["email", "Email", "email", 120]].forEach(function (c) {
      var inp = document.createElement("input"); inp.type = c[2]; inp.maxLength = c[3]; inp.required = true; inp.placeholder = c[1]; inp.value = tm[c[0]] || ""; inp.dataset.k = c[0]; inp.autocomplete = "off"; inp.setAttribute("aria-label", "Member " + (ti + 2) + " " + c[1]);
      if (c[0] === "mobile") inp.inputMode = "numeric";
      row.appendChild(inp);
    });
    tb.appendChild(row);
  }
  var hb = document.getElementById("setup-hostels"); hb.textContent = "";
  var picked = (stall.hostels && stall.hostels.length) ? stall.hostels : (cfg.hostels || []);
  (cfg.hostels || []).forEach(function (h) {
    var l = el("label", "chk");
    var i = document.createElement("input"); i.type = "checkbox"; i.value = h; i.checked = picked.indexOf(h) !== -1;
    l.appendChild(i); l.appendChild(el("span", "", h)); hb.appendChild(l);
  });
  var mx = document.getElementById("setup-max"); mx.textContent = "";
  for (var n = 1; n <= 20; n++) { var o = el("option", "", String(n)); o.value = String(n); mx.appendChild(o); }
  mx.value = String(stall.maxQty || 5);
  document.getElementById("setup-cancel").hidden = first;
  document.getElementById("setup-msg").textContent = "";
  document.getElementById("setup-submit").disabled = false;
  screen("setup");
}

function paintHeader(name) {
  document.getElementById("stall-name").textContent = name;
  document.getElementById("bacct-name").textContent = name;
  document.getElementById("bacct-avatar").textContent = (name.match(/[A-Za-z0-9]/) || ["S"])[0].toUpperCase();
  document.getElementById("bmenu-who").textContent = "Signed in as " + name;
}

function showPending(st) {
  var box = document.getElementById("pending-pay"); box.textContent = "";
  document.getElementById("pending-msg").textContent = "";
  document.getElementById("pending-title").textContent = st.name + " is set up";
  if (st.fee && st.fee.upi) {
    var f = st.fee, link = "upi://pay?pa=" + encodeURIComponent(f.upi) + "&pn=" + encodeURIComponent(f.payee) + "&am=" + encodeURIComponent(String(f.amount)) + "&cu=INR&tn=" + encodeURIComponent("Listing fee");
    box.appendChild(el("p", "kicker", "One-time listing fee"));
    box.appendChild(el("h3", "pay-amt", "\u20b9" + f.amount));
    box.appendChild(el("p", "pay-to", "to " + f.payee));
    var cv = document.createElement("canvas"); cv.className = "qr"; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "UPI QR code for the listing fee");
    try {
      var q = qrcode(0, "M"); q.addData(link); q.make();
      var n = q.getModuleCount(), cell = 6, quiet = 3, size = (n + quiet * 2) * cell;
      cv.width = size; cv.height = size;
      var g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, size, size); g.fillStyle = "#15100e";
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    } catch (e) {}
    box.appendChild(cv);
    box.appendChild(el("p", "pay-id", f.upi));
    var a = el("a", "order pay-open", "Open in UPI app"); a.href = link; box.appendChild(a);
    box.appendChild(el("p", "dash-p", "After you pay, your stall goes live once the payment is confirmed by the site team. This page updates when it does."));
  } else {
    box.appendChild(el("p", "dash-p", "The site team will confirm your listing shortly. Check back here."));
  }
  screen("pending");
}

function refresh() {
  return api({ action: "orders" }).then(async function (res) {
    if (!res.ok) throw new Error(res.error || "failed");
    paintHeader(res.stall.name);
    stallId = res.stall.id;
    lastStall = res.stall;
    lastOrders = res.orders;
    if (res.stall.setup !== false) checkNewOrders(res.orders);
    if (res.stall.setup === false && !editing) { showSetup(res.stall, true); return; }
    if (editing) return;
    if (res.stall.setup !== false && res.stall.status && res.stall.status !== "live") { showPending(res.stall); return; }
    screen("board");
    if (res.overview && !view) {
      try {
        if (!window.hmBoard) await loadBoard();
        view = window.hmBoard(hm);
      } catch (e) { view = null; }
    }
    var ext = document.getElementById("ext");
    ext.hidden = !view;
    document.getElementById("board").hidden = !!view;
    if (view) {
      view.update(res);
    } else {
      buildTabs();
      lastItems = res.items;
      drawOrders(lastOrders);
      drawItems(lastItems);
      drawAddForm();
      drawOverview();
      drawSettings();
    }
    var line = document.getElementById("status-line");
    line.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    line.classList.remove("err");
    var sc = document.getElementById("stall-complaint"); if (sc) sc.hidden = !!view;
    drawStallComplaint();
    if (!timer) timer = setInterval(function () { if (!document.getElementById("view-business").hidden) refresh(); }, 15000);
  }).catch(function (err) {
    window.__lastErr = err && err.stack || String(err);
    var line = document.getElementById("status-line");
    if (err.message === "bad login") {
      localStorage.removeItem("hmLogin");
      login = null; view = null; editing = false;
      document.getElementById("ext").hidden = true;
      screen("login");
      clearInterval(timer); timer = null;
      paintHeader("Stall login");
      line.textContent = "";
      document.getElementById("login-msg").textContent = "Wrong stall name or code.";
      return;
    }
    line.classList.add("err");
    line.textContent = "No connection. Showing the last orders. Retrying...";
    if (!document.getElementById("login").hidden) document.getElementById("login-msg").textContent = "Could not reach the server. Check your connection and try again.";
  });
}

hm.root = document.getElementById("ext");
document.getElementById("login-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var f = e.target;
  login = { login: f.elements.login.value.trim(), code: f.elements.code.value.trim() };
  localStorage.setItem("hmLogin", JSON.stringify(login));
  var lm = document.getElementById("login-msg");
  lm.textContent = "Signing in... this can take a few seconds.";
  var sb = f.querySelector("button[type=submit], button:not([type])"); if (sb) sb.disabled = true;
  editing = false;
  refresh().then(function () { if (sb) sb.disabled = false; if (lm.textContent.indexOf("Signing in") === 0) lm.textContent = ""; });
});

document.getElementById("setup-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var f = e.target, msg = document.getElementById("setup-msg"), btn = document.getElementById("setup-submit");
  var hostels = Array.prototype.filter.call(f.querySelectorAll("#setup-hostels input"), function (i) { return i.checked; }).map(function (i) { return i.value; });
  if (!hostels.length) { msg.className = "form-msg err"; msg.textContent = "Pick at least one hostel you deliver to."; return; }
  btn.disabled = true; msg.className = "form-msg"; msg.textContent = "Saving...";
  var upiA = f.elements.upi.value.trim(), upiB = f.elements.upi2.value.trim();
  if (upiA.toLowerCase() !== upiB.toLowerCase()) { msg.className = "form-msg err"; msg.textContent = "The two UPI IDs do not match. Check them carefully."; return; }
  var team = Array.prototype.map.call(document.querySelectorAll("#setup-team .team-row"), function (r) { var o = {}; Array.prototype.forEach.call(r.querySelectorAll("input"), function (i) { o[i.dataset.k] = i.value.trim(); }); return o; });
  btn.disabled = true; msg.className = "form-msg"; msg.textContent = "Saving...";
  api({ action: "setprofile", owner: f.elements.owner.value.trim(), ownerMobile: f.elements.ownerMobile.value.trim(), ownerEmail: f.elements.ownerEmail.value.trim(), team: team, upi: upiA, hostels: hostels, maxQty: Number(f.elements.maxQty.value) }).then(function (r) {
    if (!r.ok) throw new Error(r.error || "failed");
    editing = false; firstLoad = true;
    return refresh();
  }).catch(function (err) {
    btn.disabled = false; msg.className = "form-msg err";
    msg.textContent = err.message && err.message !== "failed" ? err.message : "Could not save. Try again.";
  });
});
document.getElementById("pending-refresh").addEventListener("click", function () { var m = document.getElementById("pending-msg"); m.className = "form-msg"; m.textContent = "Checking..."; refresh().then(function () { var pg = document.getElementById("pending"); if (pg && !pg.hidden) m.textContent = "Not confirmed yet. It can take a few minutes."; }).catch(function () { m.className = "form-msg err"; m.textContent = "Could not check. Try again."; }); });
document.getElementById("setup-cancel").addEventListener("click", function () { editing = false; refresh(); });
document.getElementById("bmenu-settings").addEventListener("click", function () {
  if (lastStall && lastStall.id !== "*") showSetup(lastStall, false);
  else window.alert("Operator accounts have no payment details to edit.");
});

document.getElementById("signout").addEventListener("click", function () {
  localStorage.removeItem("hmLogin");
  sessionStorage.clear();
  location.hash = "";
  location.reload();
});

window.hmMenu("bacct-btn", "bacct-menu");

window.hmBusiness = {
  start: function (data) {
    cfg = data;
    login = JSON.parse(localStorage.getItem("hmLogin") || "null");
    if (login) refresh();
    else { screen("login"); paintHeader("Stall login"); }
  }
};

// ---------- order complaints (stall) ----------
var STALL_TYPES = ["Customer unreachable", "Suspected fake order", "Payment problem", "Wrong details given", "Other"];
function drawStallComplaint() {
  var f = document.getElementById("stall-complaint-form");
  if (!f || !lastOrders) return;
  var os = f.elements.orderId, keep = os.value; os.textContent = "";
  var none = hm.el("option", "", "Not about one order"); none.value = ""; os.appendChild(none);
  lastOrders.slice().sort(function (a, b) { return a.time < b.time ? 1 : -1; }).slice(0, 40).forEach(function (o) {
    var op = hm.el("option", "", o.id + " \u00b7 " + o.qty + " x " + o.itemName); op.value = o.id; os.appendChild(op);
  });
  os.value = keep;
  var ts = f.elements.type; if (!ts.options.length) STALL_TYPES.forEach(function (t) { var op = hm.el("option", "", t); op.value = t; ts.appendChild(op); });
}
document.getElementById("stall-complaint-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var f = e.target, msg = document.getElementById("stall-complaint-msg");
  msg.className = "form-msg"; msg.textContent = "Sending...";
  api({ action: "complaint", side: "stall", orderId: f.elements.orderId.value, type: f.elements.type.value, message: f.elements.message.value })
    .then(function (res) {
      if (!res.ok) throw new Error(res.error || "failed");
      f.elements.message.value = "";
      msg.textContent = "Got it. Logged" + (res.id ? " (" + res.id + ")" : "") + " and will be handled.";
    }).catch(function (err) {
      msg.className = "form-msg err";
      msg.textContent = (err && err.message && err.message !== "failed") ? err.message : "Could not send. Try again in a minute.";
    });
});
})();
