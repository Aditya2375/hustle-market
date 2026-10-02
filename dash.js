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
  orders.sort(function (a, b) { return a.time < b.time ? 1 : -1; });
  var waiting = orders.filter(function (o) { return AWAITING.indexOf(o.status) !== -1; });
  var making = orders.filter(function (o) { return o.status === "accepted"; });
  var done = orders.filter(function (o) { return ["delivered", "cancelled", "flagged"].indexOf(o.status) !== -1; });

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

function drawItems(items) {
  var box = document.getElementById("items");
  box.textContent = "";
  var real = true;
  document.getElementById("stock-help").textContent = real
    ? "Out of something? Tap Sold out. It stops being orderable on the site within about a minute."
    : "Demo mode: stock buttons are off.";
  items.forEach(function (it) {
    var row = el("div", "item-row");
    row.appendChild(el("span", "item-row-name", it.name + " \u00b7 \u20B9" + it.price));
    var b = el("button", "order" + (it.inStock ? "" : " off"), it.inStock ? "Sold out" : "Back in stock");
    b.type = "button";
    b.disabled = !real;
    b.onclick = function () {
      b.disabled = true;
      api({ action: "stock", itemId: it.id, inStock: !it.inStock }).then(function (r) {
        if (r.ok) { it.inStock = !it.inStock; drawItems(items); }
        else b.disabled = false;
      });
    };
    row.appendChild(b);
    box.appendChild(row);
  });
}


var hm = { el: el, clock: clock, drawOrders: drawOrders, root: null, lastMs: 0, api: function (p) { return api(p); }, refresh: function () { return refresh(); } };

// ---------- screens: login, setup, dashboard ----------

function screen(which) {
  document.getElementById("login").hidden = which !== "login";
  document.getElementById("setup").hidden = which !== "setup";
  document.getElementById("board").hidden = which !== "board";
  var scx = document.getElementById("stall-complaint"); if (scx) scx.hidden = which !== "board";
  var inn = which === "setup" || which === "board";
  document.getElementById("acct-business").hidden = !inn;
  document.getElementById("dash-kicker").textContent = which === "setup" ? "Setup" : which === "board" ? "Live orders" : "Stall dashboard";
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

function refresh() {
  return api({ action: "orders" }).then(async function (res) {
    if (!res.ok) throw new Error(res.error || "failed");
    paintHeader(res.stall.name);
    stallId = res.stall.id;
    lastStall = res.stall;
    lastOrders = res.orders;
    if (res.stall.setup === false && !editing) { showSetup(res.stall, true); return; }
    if (editing) return;
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
      drawOrders(lastOrders);
      lastItems = res.items;
      drawItems(lastItems);
    }
    var line = document.getElementById("status-line");
    line.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    line.classList.remove("err");
    var sc = document.getElementById("stall-complaint"); if (sc) sc.hidden = !!view;
    drawStallComplaint();
    if (!timer) timer = setInterval(function () { if (!document.getElementById("view-business").hidden) refresh(); }, 15000);
  }).catch(function (err) {
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
  api({ action: "setprofile", owner: f.elements.owner.value.trim(), upi: f.elements.upi.value.trim(), hostels: hostels, maxQty: Number(f.elements.maxQty.value) }).then(function (r) {
    if (!r.ok) throw new Error(r.error || "failed");
    editing = false; firstLoad = true;
    return refresh();
  }).catch(function (err) {
    btn.disabled = false; msg.className = "form-msg err";
    msg.textContent = err.message && err.message !== "failed" ? err.message : "Could not save. Try again.";
  });
});
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
})();

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
