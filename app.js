// Hustle Market - plain JavaScript, no libraries.
// All stall and item data lives in data.json. Edit that file to update the site.

var data = null;
var state = {
  hostel: localStorage.getItem("hostel") || "",
  query: "",
  category: "all",
  sub: "all"
};

// ---------- small helpers ----------

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function stallById(id) {
  return data.stalls.filter(function (s) { return s.id === id; })[0];
}

// A stall shows only after payment is verified. "pending" stalls stay hidden.
function liveStall(stall) {
  return stall.status !== "pending";
}

function rupees(n) {
  return "\u20B9" + n;
}

// A search word can be plural: "brownies" also tries "brownie", "chips" tries "chip"
function variants(word) {
  var list = [word];
  if (word.length > 3 && word.slice(-3) === "ies") list.push(word.slice(0, -3) + "y", word.slice(0, -1));
  if (word.length > 3 && word.slice(-2) === "es") list.push(word.slice(0, -2));
  if (word.length > 3 && word.slice(-1) === "s") list.push(word.slice(0, -1));
  return list;
}

// A stall delivers to the chosen hostel if the hostel is in its list
function deliversHere(stall) {
  return liveStall(stall) && stall.hostels.indexOf(state.hostel) !== -1;
}

function perUnit(item) {
  if (item.packUnit) {
    return rupees(Math.round((item.price / item.packCount) * 100 * 10) / 10) + " per 100 " + item.packUnit;
  }
  return rupees(Math.round((item.price / item.packCount) * 10) / 10) + " each";
}

function perUnitNumber(item) {
  if (item.packUnit) return (item.price / item.packCount) * 100;
  return item.price / item.packCount;
}

// ---------- filtering ----------

function visibleItems() {
  var words = state.query.toLowerCase().split(/\s+/).filter(Boolean);

  return data.items.filter(function (item) {
    var stall = stallById(item.stall);
    if (!deliversHere(stall)) return false;
    if (state.category !== "all" && item.category !== state.category) return false;
    if (state.category === "food" && state.sub !== "all" && item.sub !== state.sub) return false;

    var text = (item.name + " " + stall.name + " " + item.sub + " " + item.category + " " + item.compare.replace(/-/g, " ")).toLowerCase();
    return words.every(function (w) {
      return variants(w).some(function (v) { return text.indexOf(v) !== -1; });
    });
  }).sort(function (a, b) {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    return a.price - b.price;
  });
}

// other items (from stalls that deliver here) selling the same thing
function peers(item) {
  return data.items.filter(function (other) {
    return other.compare === item.compare && deliversHere(stallById(other.stall));
  });
}

// ---------- backend (Google Apps Script web app) ----------
// data.backend.url empty = demo mode: orders are kept in this browser only.

function backendUrl() {
  return data.backend && data.backend.url ? data.backend.url : "";
}

function send(payload) {
  var url = backendUrl();
  if (!url) {
    return new Promise(function (resolve) {
      var list = JSON.parse(localStorage.getItem("demoOrders") || "[]");
      if (payload.action === "order") {
        payload.id = "DEMO-" + (list.length + 1);
        payload.time = new Date().toISOString();
        payload.status = "new";
        list.push(payload);
        localStorage.setItem("demoOrders", JSON.stringify(list));
      }
      if (payload.action === "bug") {
        var bugs = JSON.parse(localStorage.getItem("demoBugs") || "[]");
        bugs.push(payload);
        localStorage.setItem("demoBugs", JSON.stringify(bugs));
      }
      resolve({ ok: true, id: payload.id || "DEMO", demo: true });
    });
  }
  return fetch(url, { method: "POST", body: JSON.stringify(payload) })
    .then(function (r) { return r.json(); });
}

// random id kept on this device, only used to slow down spam
function deviceId() {
  var id = localStorage.getItem("deviceId");
  if (!id) {
    var b = new Uint8Array(12);
    crypto.getRandomValues(b);
    id = Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    localStorage.setItem("deviceId", id);
  }
  return id;
}

// ---------- order sheet ----------

function labelled(text, control) {
  var l = el("label", "", text);
  l.appendChild(control);
  return l;
}

function input(name, type, required) {
  var i = document.createElement("input");
  i.name = name;
  i.type = type || "text";
  i.required = !!required;
  return i;
}

function openOrder(item) {
  var stall = stallById(item.stall);
  var sheet = document.getElementById("sheet");
  var form = document.getElementById("order-form");
  document.getElementById("sheet-title").textContent = item.name;
  document.getElementById("sheet-sub").textContent = stall.name + " \u00b7 " + item.packLabel + " \u00b7 " + rupees(item.price) + " each";
  form.textContent = "";

  var qty = 1;
  var max = stall.maxQty || 10;
  var out = document.createElement("output");
  var total = el("p", "total");
  function paint() {
    out.textContent = qty;
    total.textContent = "Total " + rupees(qty * item.price) + (item.freeDelivery ? " + free delivery" : " + delivery fee (stall will tell you)");
  }
  var minus = el("button", "", "\u2212"); minus.type = "button";
  var plus = el("button", "", "+"); plus.type = "button";
  minus.onclick = function () { if (qty > 1) { qty--; paint(); } };
  plus.onclick = function () { if (qty < max) { qty++; paint(); } };
  var row = el("div", "qty");
  row.appendChild(minus); row.appendChild(out); row.appendChild(plus);
  var qtyLabel = el("label", "", "Quantity");
  qtyLabel.appendChild(row);
  form.appendChild(qtyLabel);

  var hostel = document.createElement("select");
  hostel.name = "hostel";
  stall.hostels.forEach(function (h) {
    var o = el("option", "", h); o.value = h;
    if (h === state.hostel) o.selected = true;
    hostel.appendChild(o);
  });
  form.appendChild(labelled("Hostel", hostel));
  form.appendChild(labelled("Room number", input("room", "text", true)));
  form.appendChild(labelled("Your name", input("name", "text", true)));
  var trap = labelled("Website", input("website", "text", false));
  trap.className = "trap";
  trap.setAttribute("aria-hidden", "true");
  trap.firstElementChild && (trap.firstElementChild.tabIndex = -1);
  form.appendChild(trap);

  (stall.orderFields || []).forEach(function (f) {
    var c;
    if (f.type === "select") {
      c = document.createElement("select");
      c.name = "x_" + f.id;
      c.required = !!f.required;
      var blank = el("option", "", "Choose"); blank.value = "";
      c.appendChild(blank);
      f.options.forEach(function (op) { var o = el("option", "", op); o.value = op; c.appendChild(o); });
    } else {
      c = input("x_" + f.id, "text", f.required);
    }
    form.appendChild(labelled(f.label, c));
  });

  form.appendChild(total);
  var submit = el("button", "order", "Place order");
  submit.type = "submit";
  var msg = el("p", "form-msg");
  msg.setAttribute("aria-live", "polite");
  form.appendChild(submit);
  form.appendChild(msg);
  paint();

  form.onsubmit = function (e) {
    e.preventDefault();
    submit.disabled = true;
    msg.className = "form-msg";
    msg.textContent = "Sending...";
    var custom = {};
    (stall.orderFields || []).forEach(function (f) {
      custom[f.label] = form.elements["x_" + f.id].value;
    });
    send({
      action: "order",
      stallId: stall.id, itemId: item.id, itemName: item.name, packLabel: item.packLabel,
      qty: qty, unitPrice: item.price, total: qty * item.price,
      hostel: form.elements.hostel.value, room: form.elements.room.value.trim(),
      name: form.elements.name.value.trim(), website: form.elements.website.value, device: deviceId(),
      custom: custom
    }).then(function (res) {
      if (!res.ok) throw new Error(res.error || "failed");
      var shownHostel = form.elements.hostel.value;
      var shownRoom = form.elements.room.value;
      form.textContent = "";
      var done = el("div", "done");
      done.appendChild(el("h3", "", "Order sent to " + stall.name));
      done.appendChild(el("p", "ref", res.id));
      done.appendChild(el("p", "", qty + " x " + item.name + " to " + shownHostel + ", room " + shownRoom + ". The stall sees it on their screen now. They will confirm it from there."));
      if (res.demo) done.appendChild(el("p", "", "Demo mode: nothing was really sent."));
      var again = el("button", "order", "Done");
      again.type = "button";
      again.onclick = closeSheet;
      done.appendChild(again);
      form.appendChild(done);
    }).catch(function (err) {
      submit.disabled = false;
      msg.className = "form-msg err";
      msg.textContent = (err && err.message && err.message !== "failed" && err.message.indexOf("fetch") === -1)
        ? err.message : "Could not send. Check your connection and try again. Your details are still here.";
    });
  };

  sheet.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSheet() {
  document.getElementById("sheet").hidden = true;
  document.body.style.overflow = "";
}

function orderButton(item) {
  if (!item.inStock) {
    var off = el("button", "order off", "Out of stock");
    off.type = "button";
    off.disabled = true;
    return off;
  }
  var b = el("button", "order", "Order");
  b.type = "button";
  b.addEventListener("click", function () { openOrder(item); });
  return b;
}

// ---------- drawing the page ----------

function drawHostelToggle() {
  var box = document.getElementById("hostel-toggle");
  box.textContent = "";
  var idx = Math.max(0, data.hostels.indexOf(state.hostel));
  box.style.setProperty("--n", data.hostels.length);
  box.style.setProperty("--i", idx);
  box.appendChild(el("span", "thumb"));
  data.hostels.forEach(function (name) {
    var b = el("button", "switch-btn" + (state.hostel === name ? " on" : ""), name);
    b.type = "button";
    b.setAttribute("aria-pressed", state.hostel === name ? "true" : "false");
    b.addEventListener("click", function () {
      state.hostel = name;
      localStorage.setItem("hostel", name);
      drawAll();
    });
    box.appendChild(b);
  });
}

function drawCategoryChips() {
  var box = document.getElementById("category-chips");
  box.textContent = "";

  var all = [{ id: "all", label: "All" }].concat(data.categories);
  all.forEach(function (cat) {
    var cls = "chip" + (state.category === cat.id ? " on" : "") + (cat.id === "food" ? " big" : "");
    var b = el("button", cls, cat.label);
    b.type = "button";
    b.addEventListener("click", function () {
      state.category = cat.id;
      state.sub = "all";
      drawAll();
    });
    box.appendChild(b);
  });

  var subBox = document.getElementById("sub-chips");
  subBox.textContent = "";
  var food = data.categories.filter(function (c) { return c.id === "food"; })[0];
  if (state.category === "food" && food) {
    ["all"].concat(food.subs).forEach(function (name) {
      var b = el("button", "chip sub-chip" + (state.sub === name ? " on" : ""), name === "all" ? "All food" : name);
      b.type = "button";
      b.addEventListener("click", function () {
        state.sub = name;
        drawAll();
      });
      subBox.appendChild(b);
    });
  }
}

function drawResults() {
  var box = document.getElementById("results");
  box.textContent = "";
  var items = visibleItems();

  var count = document.getElementById("count");
  count.textContent = state.hostel
    ? items.length + " item" + (items.length === 1 ? "" : "s") + " delivering to " + state.hostel
    : "Pick your hostel above";

  if (!state.hostel) return;

  if (items.length === 0) {
    box.appendChild(el("p", "empty", "Nothing matches. Try a shorter word, or switch the hostel."));
    return;
  }

  items.forEach(function (item) {
    var stall = stallById(item.stall);
    var card = el("article", "card cat-" + item.category + (item.inStock ? "" : " gone"));
    card.appendChild(plate(item));

    var head = el("div", "card-head");
    head.appendChild(el("h2", "item-name", item.name));
    head.appendChild(el("p", "price", rupees(item.price)));
    card.appendChild(head);

    card.appendChild(el("p", "stall", stall.name));

    var facts = el("p", "facts");
    facts.appendChild(el("span", "", item.packLabel));
    facts.appendChild(el("span", item.freeDelivery ? "yes" : "no", item.freeDelivery ? "Free delivery" : "Paid delivery"));
    facts.appendChild(el("span", item.inStock ? "yes" : "no", item.inStock ? "In stock" : "Out of stock"));
    card.appendChild(facts);

    var actions = el("div", "actions");
    actions.appendChild(orderButton(item));

    var others = peers(item);
    if (others.length > 1) {
      var cmp = el("a", "compare-link", "Compare " + others.length + " stalls");
      cmp.href = "#compare/" + item.compare;
      actions.appendChild(cmp);
    }
    card.appendChild(actions);

    box.appendChild(card);
  });
}

// Typographic stand-in for a photo: soft tinted block with the item's first letter
function plate(item) {
  var p = el("div", "plate");
  p.appendChild(el("span", "plate-letter", item.name.charAt(0)));
  p.appendChild(el("span", "plate-cat", item.sub || item.category));
  return p;
}

// "brownie-box" -> "Brownie box"
function keyLabel(key) {
  var text = key.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function drawCompare(key) {
  var rows = data.items.filter(function (i) {
    return i.compare === key && deliversHere(stallById(i.stall));
  }).sort(function (a, b) {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    return perUnitNumber(a) - perUnitNumber(b);
  });

  var body = document.getElementById("compare-body");
  body.textContent = "";
  if (rows.length === 0) return;

  document.getElementById("compare-title").textContent = "Compare: " + keyLabel(key);
  document.getElementById("compare-note").textContent =
    "Stalls delivering to " + state.hostel + ". Cheapest per unit first. Out of stock items cannot be ordered.";

  rows.forEach(function (item, index) {
    var stall = stallById(item.stall);
    var card = el("article", "card cat-" + item.category + (item.inStock ? "" : " gone"));
    card.appendChild(plate(item));

    var head = el("div", "card-head");
    head.appendChild(el("h3", "item-name", stall.name));
    head.appendChild(el("p", "price", rupees(item.price)));
    card.appendChild(head);

    if (index === 0 && item.inStock) card.appendChild(el("p", "best", "Best value"));

    var facts = el("p", "facts");
    facts.appendChild(el("span", "", item.packLabel));
    facts.appendChild(el("span", "", perUnit(item)));
    facts.appendChild(el("span", item.freeDelivery ? "yes" : "no", item.freeDelivery ? "Free delivery" : "Paid delivery"));
    facts.appendChild(el("span", item.inStock ? "yes" : "no", item.inStock ? "In stock" : "Out of stock"));
    card.appendChild(facts);

    var actions = el("div", "actions");
    actions.appendChild(orderButton(item));
    card.appendChild(actions);

    body.appendChild(card);
  });
}

// ---------- page switching (results <-> compare) ----------

function showRoute() {
  var hash = window.location.hash;
  var compare = document.getElementById("compare");
  var results = document.getElementById("results");
  var count = document.getElementById("count");

  if (hash === "#business") { setRole("business"); return; }
  if (!role()) return;

  if (hash.indexOf("#compare/") === 0 && state.hostel && role() === "customer") {
    drawCompare(hash.slice(9));
    compare.hidden = false;
    results.hidden = true;
    count.hidden = true;
    window.scrollTo(0, 0);
  } else {
    compare.hidden = true;
    results.hidden = false;
    count.hidden = false;
  }
}

// ---------- who is this: customer or business ----------

function role() {
  return sessionStorage.getItem("role") || (localStorage.getItem("hmLogin") ? "business" : "");
}

// Visit counter. A random id the browser makes up, no personal data. Only while the customer view is open and visible.
var presenceTimer = null;
function presence(on) {
  clearInterval(presenceTimer); presenceTimer = null;
  if (!on || !backendUrl()) return;
  var sid = sessionStorage.getItem("hmSid");
  if (!sid) { sid = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-6); sessionStorage.setItem("hmSid", sid); }
  function send(kind) {
    if (document.hidden) return;
    try { fetch(backendUrl(), { method: "POST", body: JSON.stringify({ action: kind, sid: sid }), keepalive: true }).catch(function () {}); } catch (e) {}
  }
  send("hit");
  presenceTimer = setInterval(function () { send("ping"); }, 90000);
}

function setRole(r) {
  if (r) sessionStorage.setItem("role", r); else sessionStorage.removeItem("role");
  var shown = r === "customer" || r === "business";
  document.getElementById("gate").hidden = shown;
  document.getElementById("app").hidden = !shown;
  document.getElementById("view-customer").hidden = r !== "customer";
  document.getElementById("view-business").hidden = r !== "business";
  document.querySelector(".bar").hidden = r !== "customer";
  document.body.classList.toggle("is-gate", !shown);
  if (r === "business" && window.hmBusiness && data) window.hmBusiness.start(data);
  if (r === "customer" && window.location.hash === "#business") history.replaceState(null, "", window.location.pathname);
  if (r === "customer" && data) drawAll();
  presence(r === "customer");
  window.scrollTo(0, 0);
}

function drawStats() {
  var box = document.getElementById("stats");
  box.textContent = "";
  var live = data.stalls.filter(liveStall);
  var rows = [[live.length, "Stalls"], [data.items.filter(function (i) { return liveStall(stallById(i.stall)); }).length, "Items"], [data.hostels.length, "Hostels"]];
  rows.forEach(function (r) {
    var li = el("li");
    li.appendChild(el("b", "", String(r[0])));
    li.appendChild(el("span", "", r[1]));
    box.appendChild(li);
  });
}

function drawAll() {
  drawStats();
  drawHostelToggle();
  drawCategoryChips();
  drawResults();
  showRoute();
}

// ---------- start ----------

// Gate is visible straight away; the app shows after the data loads and a role is known.
(function () {
  if (role() || window.location.hash === "#business") document.getElementById("gate").hidden = true;
})();

document.getElementById("search").addEventListener("input", function (e) {
  state.query = e.target.value;
  drawResults();
});

document.getElementById("compare-back").addEventListener("click", function () {
  window.location.hash = "";
});

window.addEventListener("hashchange", showRoute);

// Listings come from data.json. If a backend URL is set there, the live Sheet data replaces it.
fetch("data.json")
  .then(function (r) { return r.json(); })
  .then(function (local) {
    if (!local.backend || !local.backend.url) return local;
    return fetch(local.backend.url + "?action=data").then(function (r) { return r.json(); })
      .then(function (live) {
        if (!live || !live.items || !live.stalls) throw new Error("bad data");
        live.backend = local.backend; live.support = local.support; return live;
      });
  })
  .then(function (json) {
    data = json;
    document.getElementById("support-note").textContent = (data.support && data.support.note) || "";
    if (data.hostels.indexOf(state.hostel) === -1) state.hostel = data.hostels[0];
    // The demo banner stays until a live backend URL is set AND the Sheet Config says demo is FALSE.
    document.getElementById("demo-banner").hidden = !!(backendUrl() && !data.event.demo);
    if (data.event.stockNote) document.getElementById("stock-note").textContent = data.event.stockNote;
    document.getElementById("gate-customer").disabled = false;
    document.getElementById("gate-business").disabled = false;
    setRole(role());
    if (window.location.hash === "#business") setRole("business");
  })
  .catch(function () {
    // With a live backend there is no stale fallback: orderable items must be current.
    document.getElementById("gate").hidden = true;
    document.getElementById("app").hidden = false;
    document.getElementById("view-customer").hidden = false;
    document.querySelector(".bar").hidden = true;
    var c = document.getElementById("count");
    c.textContent = "Could not load the stall list. Check your connection, then ";
    var again = el("button", "linkbtn", "try again");
    again.type = "button";
    again.onclick = function () { location.reload(); };
    c.appendChild(again);
  });

document.getElementById("sheet-close").addEventListener("click", closeSheet);

document.getElementById("bug-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var f = e.target;
  var msg = document.getElementById("bug-msg");
  msg.className = "form-msg";
  msg.textContent = "Sending...";
  send({
    action: "bug", message: f.elements.message.value, name: f.elements.name.value,
    contact: f.elements.contact.value, stall: f.elements.stall.value,
    page: location.href, agent: navigator.userAgent
  }).then(function (res) {
    if (!res.ok) throw new Error("failed");
    f.reset();
    msg.textContent = "Got it. Thanks." + (res.demo ? " (Demo mode: nothing was really sent.)" : "");
  }).catch(function () {
    msg.className = "form-msg err";
    msg.textContent = "Could not send. Try again in a minute.";
  });
});

document.getElementById("gate-customer").addEventListener("click", function () { setRole("customer"); });
document.getElementById("gate-business").addEventListener("click", function () { window.location.hash = "#business"; setRole("business"); });
document.getElementById("to-business").addEventListener("click", function () { window.location.hash = "#business"; setRole("business"); });
document.getElementById("to-customer").addEventListener("click", function () { setRole("customer"); });
