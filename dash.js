(function () {
// Stall dashboard. Open as stall.html?s=<stall id>&k=<private key>.
// Reads orders from the Apps Script backend every 30 seconds. Demo mode (no backend URL) reads this browser's demo orders.

// Stall dashboard. The stall signs in with its name and an access code (given by the admin).
// The code is checked on the server for every request. It is never put in the page address.
var stallId = "";
var login = JSON.parse(localStorage.getItem("hmLogin") || "null");
var timer = null;
var started = false;
var cfg = null;
var seen = JSON.parse(sessionStorage.getItem("seen") || "[]");
var firstLoad = true;
var isAdmin = false;

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function api(payload) {
  if (!cfg.backend || !cfg.backend.url) {
    // demo mode: any stall name from the list, code "DEMO"
    var list = JSON.parse(localStorage.getItem("demoOrders") || "[]");
    if (payload.action === "orders") {
      var st = cfg.stalls.filter(function (s) { return s.name.toLowerCase() === login.login.toLowerCase() || s.id === login.login; })[0];
      if (!st || login.code.toUpperCase() !== "DEMO") return Promise.resolve({ ok: false, error: "bad login" });
      stallId = st.id;
      return Promise.resolve({ ok: true, stall: { id: st.id, name: st.name }, orders: list.filter(function (o) { return o.stallId === stallId; }) });
    }
    if (payload.action === "status") {
      list.forEach(function (o) { if (o.id === payload.id) o.status = payload.status; });
      list = list.filter(function (o) { return o.status !== "deleted"; });
      localStorage.setItem("demoOrders", JSON.stringify(list));
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve({ ok: false, error: "Demo mode" });
  }
  if (payload.action === "orders") {
  }

  payload.login = login.login;
  payload.code = login.code;
  return fetch(cfg.backend.url, { method: "POST", body: JSON.stringify(payload) }).then(function (r) { return r.json(); });
}

function clock(iso) {
  var d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ", " + d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function drawOrders(orders) {
  var box = document.getElementById("orders");
  box.textContent = "";
  orders.sort(function (a, b) { return a.time < b.time ? 1 : -1; });

  var fresh = orders.filter(function (o) { return o.status === "new"; });
  document.getElementById("new-count").textContent =
    fresh.length ? fresh.length + " new order" + (fresh.length === 1 ? "" : "s") + " waiting" : "No new orders. Waiting...";
  document.title = (fresh.length ? "(" + fresh.length + ") " : "") + "Stall orders";

  if (orders.length === 0) box.appendChild(el("p", "empty", "Nothing yet. New orders appear here by themselves."));

  orders.forEach(function (o) {
    var isNew = o.status === "new";
    var card = el("article", "card cat-food order-card" + (isNew ? " is-new" : " handled"));
    var head = el("div", "card-head");
    head.appendChild(el("h2", "item-name", o.qty + " x " + o.itemName));
    head.appendChild(el("p", "price", "\u20B9" + o.total));
    card.appendChild(head);
    if (isNew && !firstLoad && seen.indexOf(o.id) === -1) card.appendChild(el("p", "best", "Just in"));

    var where = el("p", "dash-where", o.hostel + " \u00b7 Room " + o.room);
    card.appendChild(where);
    if (isAdmin && o.stallName) card.appendChild(el("p", "best", o.stallName));
    card.appendChild(el("p", "stall", o.name + " \u00b7 " + clock(o.time) + " \u00b7 " + o.id));

    var extra = o.custom || {};
    Object.keys(extra).forEach(function (k) {
      if (extra[k]) card.appendChild(el("p", "dash-extra", k + ": " + extra[k]));
    });

    var actions = el("div", "actions");
    if (o.status === "new") actions.appendChild(statusBtn(o, "accepted", "Accept"));
    if (o.status === "new" || o.status === "accepted") {
      actions.appendChild(statusBtn(o, "delivered", "Delivered"));
      actions.appendChild(statusBtn(o, "cancelled", "Cancel", true));
    }
    if (o.status !== "flagged") actions.appendChild(statusBtn(o, "flagged", "Flag fake", true));
    actions.appendChild(statusBtn(o, "deleted", "Delete", true));
    if (o.status !== "new") actions.appendChild(el("span", "facts-status", o.status.toUpperCase()));
    card.appendChild(actions);
    box.appendChild(card);
    if (seen.indexOf(o.id) === -1) seen.push(o.id);
  });
  sessionStorage.setItem("seen", JSON.stringify(seen));
  firstLoad = false;
}

function statusBtn(o, status, label, quiet) {
  var b = el("button", "order" + (quiet ? " off quiet" : ""), label);
  b.type = "button";
  b.onclick = function () {
    b.disabled = true;
    api({ action: "status", id: o.id, status: status }).then(function () { refresh(); });
  };
  return b;
}

function drawItems(items) {
  var box = document.getElementById("items");
  box.textContent = "";
  var real = cfg.backend && cfg.backend.url;
  document.getElementById("stock-help").textContent = isAdmin ? "Every item across every stall. Sold out and price changes reach the site within about a minute." : real
    ? "Out of something? Tap Sold out. It stops being orderable on the site within about a minute."
    : "Demo mode: stock buttons are off.";
  items.forEach(function (it) {
    var row = el("div", "item-row");
    var stallLabel = isAdmin && adminStalls ? (adminStalls.filter(function (s) { return s.id === it.stall; })[0] || {}).name : "";
    row.appendChild(el("span", "item-row-name", (stallLabel ? stallLabel + " \u00b7 " : "") + it.name + " \u00b7 \u20B9" + it.price));
    if (isAdmin) {
      var pb = el("button", "order off quiet", "Edit price");
      pb.type = "button";
      pb.onclick = function () {
        var v = window.prompt("New price in rupees for " + it.name, String(it.price));
        if (v === null) return;
        var n = Number(v);
        if (!(n > 0 && n < 100000)) { window.alert("Enter a price above 0."); return; }
        api({ action: "edititem", itemId: it.id, price: n }).then(function (r) { if (r.ok) { it.price = n; drawItems(items); } else window.alert("Could not save. Try again."); });
      };
      row.appendChild(pb);
    }
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

var lastItems = null;
var adminStalls = null;

function drawAdmin(stalls) {
  var box = document.getElementById("admin-stalls");
  box.textContent = "";
  stalls.forEach(function (s) {
    var row = el("div", "item-row");
    row.appendChild(el("span", "item-row-name", s.name + " \u00b7 " + (s.status === "live" ? "LIVE" : "PENDING")));
    var b = el("button", "order" + (s.status === "live" ? " off" : ""), s.status === "live" ? "Set pending" : "Set live");
    b.type = "button";
    b.onclick = function () {
      b.disabled = true;
      api({ action: "stallstatus", stallId: s.id, status: s.status === "live" ? "pending" : "live" }).then(function () { refresh(); });
    };
    row.appendChild(b);
    box.appendChild(row);
  });
}
function show(signedIn) {
  document.getElementById("login").hidden = signedIn;
  document.getElementById("board").hidden = !signedIn;
  document.getElementById("signout").hidden = !signedIn;
}

function refresh() {
  return api({ action: "orders" }).then(function (res) {
    if (!res.ok) throw new Error(res.error || "failed");
    show(true);
    document.getElementById("stall-name").textContent = res.stall.name;
    stallId = res.stall.id;
    isAdmin = !!res.admin;
    adminStalls = res.stalls || null;
    document.getElementById("admin").hidden = !isAdmin;
    if (isAdmin) drawAdmin(res.stalls || []);
    drawOrders(res.orders);
    lastItems = res.items || cfg.items.filter(function (i) { return i.stall === stallId; });
    drawItems(lastItems);
    var line = document.getElementById("status-line");
    line.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    line.classList.remove("err");
    if (!timer) timer = setInterval(function () { if (!document.getElementById("view-business").hidden) refresh(); }, 30000);
  }).catch(function (err) {
    var line = document.getElementById("status-line");
    if (err.message === "bad login") {
      localStorage.removeItem("hmLogin");
      login = null;
      show(false);
      clearInterval(timer); timer = null;
      document.getElementById("stall-name").textContent = "Stall login";
      line.textContent = "";
      document.getElementById("login-msg").textContent = "Wrong name or code.";
      return;
    }
    line.classList.add("err");
    line.textContent = "No connection. Showing the last orders. Retrying...";
  });
}

document.getElementById("login-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var f = e.target;
  login = { login: f.elements.login.value.trim(), code: f.elements.code.value.trim() };
  localStorage.setItem("hmLogin", JSON.stringify(login));
  document.getElementById("login-msg").textContent = "";
  refresh();
});

document.getElementById("signout").addEventListener("click", function () {
  localStorage.removeItem("hmLogin");
  sessionStorage.removeItem("role");
  location.hash = "";
  location.reload();
});


window.hmBusiness = {
  start: function (data) {
    cfg = data;
    login = JSON.parse(localStorage.getItem("hmLogin") || "null");
    if (login) refresh();
    else {
      show(false);
      document.getElementById("stall-name").textContent = "Stall login";
    }
  }
};
})();
