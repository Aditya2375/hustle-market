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

var cmpIds = [];
try { cmpIds = JSON.parse(sessionStorage.getItem("hmCmp") || "[]"); if (!Array.isArray(cmpIds)) cmpIds = []; } catch (e) { cmpIds = []; }
function saveCmp() { try { sessionStorage.setItem("hmCmp", JSON.stringify(cmpIds)); } catch (e) {} }
function toggleCmp(id) {
  var i = cmpIds.indexOf(id);
  if (i > -1) cmpIds.splice(i, 1); else cmpIds.push(id);
  saveCmp();
}
function cmpItems() {
  return cmpIds.map(function (id) {
    return data.items.filter(function (i) { return i.id === id; })[0];
  }).filter(function (i) { return i && deliversHere(stallById(i.stall)); });
}
function drawTray() {
  var tray = document.getElementById("cmp-tray");
  if (!tray) return;
  var n = cmpItems().length;
  var onCompare = window.location.hash === "#compare";
  tray.hidden = !(n > 0 && state.hostel && role() === "customer" && !onCompare);
  document.getElementById("cmp-count").textContent = n + " selected";
  document.getElementById("cmp-go").textContent = n > 1 ? "Compare " + n : "Add one more";
  document.getElementById("cmp-go").classList.toggle("off", n < 2);
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

function digits(v) { return String(v || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""); }
function validMobile(v) { return /^[6-9]\d{9}$/.test(v) && mobileProblem(v) === ""; }
// Friendly sanity check, not verification: catches obviously fake numbers.
function mobileProblem(v) {
  if (!/^\d{10}$/.test(v)) return "Enter a 10-digit mobile number.";
  if (!/^[6-9]/.test(v)) return "Indian mobile numbers start with 6, 7, 8 or 9. Please check your number.";
  if (/^(\d)\1{9}$/.test(v)) return "That number doesn't look real. Please enter your own mobile number.";
  var asc = "01234567890123456789", desc = "98765432109876543210";
  if (asc.indexOf(v) > -1 || desc.indexOf(v) > -1) return "That number doesn't look real. Please enter your own mobile number.";
  if (/^(\d{2})\1{4}$/.test(v) || /^(\d{5})\1$/.test(v)) return "That number doesn't look real. Please enter your own mobile number.";
  if (/(\d)\1{6,}/.test(v)) return "That number doesn't look real. Please enter your own mobile number.";
  return "";
}
function profile() {
  try { var p = JSON.parse(localStorage.getItem("hmMe") || "null"); return p && p.name && validMobile(p.mobile) ? p : null; } catch (e) { return null; }
}
function saveProfile(name, mobile) { localStorage.setItem("hmMe", JSON.stringify({ name: name, mobile: mobile })); drawAccount(); }

var MOBILE_HELP = "This is how the business contacts you about your order. Double-check it. A wrong number means they can't reach you and you lose your order.";

function mobileField(name, value) {
  var wrap = el("label", "field", "Mobile number");
  var row = el("span", "phone");
  row.appendChild(el("span", "phone-cc", "+91"));
  var i = document.createElement("input");
  i.name = name; i.type = "tel"; i.inputMode = "numeric"; i.autocomplete = "tel-national";
  i.required = true; i.maxLength = 12; i.placeholder = "10-digit number"; i.value = value;
  i.addEventListener("input", function () { i.value = i.value.replace(/[^\d ]/g, ""); });
  row.appendChild(i);
  wrap.appendChild(row);
  wrap.appendChild(el("small", "help-line", MOBILE_HELP));
  return wrap;
}

// UPI QR drawn in the browser. The site never touches the money: the customer pays the stall directly.
function paymentPanel(res, stall, item, qty, hostel, room) {
  var pay = res.pay || {};
  var box = el("div", "pay");
  box.appendChild(el("p", "kicker", "Step 2 of 2 \u00b7 Pay the stall"));
  box.appendChild(el("h3", "pay-amt", rupees(pay.amount || qty * item.price)));
  box.appendChild(el("p", "pay-to", "to " + (pay.payee || stall.name)));
  if (pay.upi) {
    var link = "upi://pay?pa=" + encodeURIComponent(pay.upi) + "&pn=" + encodeURIComponent(pay.payee || stall.name) +
      "&am=" + encodeURIComponent(String(pay.amount)) + "&cu=INR&tn=" + encodeURIComponent(res.id);
    var cv = document.createElement("canvas");
    cv.className = "qr"; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "UPI QR code for " + rupees(pay.amount));
    try {
      var q = qrcode(0, "M"); q.addData(link); q.make();
      var n = q.getModuleCount(), cell = 6, quiet = 3, size = (n + quiet * 2) * cell;
      cv.width = size; cv.height = size;
      var g = cv.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, size, size);
      g.fillStyle = "#15100e";
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    } catch (e) {}
    box.appendChild(cv);
    var idRow = el("p", "pay-id");
    idRow.appendChild(el("span", "", pay.upi));
    var copy = el("button", "linkbtn", "Copy"); copy.type = "button";
    copy.onclick = function () {
      try { navigator.clipboard.writeText(pay.upi); copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy"; }, 1500); } catch (e) {}
    };
    idRow.appendChild(copy);
    box.appendChild(idRow);
    var open = el("a", "order pay-open", "Open my UPI app");
    open.href = link;
    box.appendChild(open);
  }
  var steps = el("ol", "pay-steps");
  ["Scan the code, or open your UPI app on this phone.", "Pay exactly " + rupees(pay.amount || qty * item.price) + ". Don't change the amount.", "The stall checks your payment. Your order is confirmed once they verify it."].forEach(function (s) { steps.appendChild(el("li", "", s)); });
  box.appendChild(steps);
  var ref = el("p", "pay-ref");
  ref.appendChild(el("span", "", "Order "));
  ref.appendChild(el("b", "", res.id));
  ref.appendChild(el("span", "", " \u00b7 " + qty + " x " + item.name + " \u00b7 " + hostel + ", room " + room));
  box.appendChild(ref);
  box.appendChild(el("p", "pay-note", "Status: awaiting payment verification. If it isn't confirmed in a few minutes, message the stall or use the help form."));
  var done = el("button", "order", "I've paid");
  done.type = "button"; done.onclick = closeSheet;
  box.appendChild(done);
  return box;
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
  var me = profile() || {};
  var nameIn = input("name", "text", true); nameIn.maxLength = 60; nameIn.value = me.name || ""; nameIn.autocomplete = "name";
  form.appendChild(labelled("Your name", nameIn));
  form.appendChild(mobileField("mobile", me.mobile || ""));
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
    var mob = digits(form.elements.mobile.value);
    if (!validMobile(mob)) {
      submit.disabled = false; msg.className = "form-msg err";
      msg.textContent = mobileProblem(mob) || "Check your mobile number.";
      return;
    }
    saveProfile(form.elements.name.value.trim(), mob);
    send({
      action: "order", mobile: mob,
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
      form.appendChild(paymentPanel(res, stall, item, qty, shownHostel, shownRoom));
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
  if (!liveReady) {
    var up = el("button", "order off", "Updating..."); up.type = "button"; up.disabled = true; return up;
  }
  var stallObj = stallById(item.stall);
  if (stallObj && stallObj.payReady === false) {
    var np = el("button", "order off", "Not taking orders yet"); np.type = "button"; np.disabled = true; return np;
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
    var on = cmpIds.indexOf(item.id) > -1;
    var tg = el("button", "cmp-toggle" + (on ? " on" : ""), on ? "Added \u2713" : "+ Compare");
    tg.type = "button"; tg.setAttribute("aria-pressed", on ? "true" : "false");
    tg.addEventListener("click", function () {
      toggleCmp(item.id);
      var now = cmpIds.indexOf(item.id) > -1;
      tg.className = "cmp-toggle" + (now ? " on" : "");
      tg.textContent = now ? "Added \u2713" : "+ Compare";
      tg.setAttribute("aria-pressed", now ? "true" : "false");
      drawTray();
    });
    actions.appendChild(tg);
    actions.appendChild(orderButton(item));

    var others = peers(item);
    if (others.length > 1) {
      var cmp = el("a", "compare-link", "Compare all " + others.length + " stalls");
      cmp.href = "#compare";
      cmp.addEventListener("click", function () {
        others.forEach(function (o) { if (cmpIds.indexOf(o.id) < 0) cmpIds.push(o.id); });
        saveCmp();
      });
      actions.appendChild(cmp);
    }
    card.appendChild(actions);

    box.appendChild(card);
  });
  drawTray();
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

function drawCompareSel() {
  var rows = cmpItems();
  var body = document.getElementById("compare-body");
  body.textContent = ""; body.className = "cmp-wrap";
  document.getElementById("compare-title").textContent = "Your comparison";
  var note = document.getElementById("compare-note");
  if (rows.length < 2) {
    note.textContent = rows.length ? "Pick at least one more item to compare." : "Nothing selected yet.";
    var back = el("p", "empty", "Tap + Compare on any item, as many as you like.");
    body.appendChild(back);
    return;
  }
  note.textContent = rows.length + " items from stalls delivering to " + state.hostel + ". Scroll sideways to see them all.";
  var cheapest = {};
  rows.forEach(function (it) {
    if (!it.inStock) return;
    var k = it.compare, v = perUnitNumber(it);
    if (cheapest[k] === undefined || v < cheapest[k]) cheapest[k] = v;
  });
  var table = el("table", "cmp");
  var defs = [
    ["Stall", function (it, td) { td.textContent = stallById(it.stall).name; td.className = "cmp-stall"; }],
    ["Item", function (it, td) { td.textContent = it.name; td.className = "cmp-name"; }],
    ["Price", function (it, td) { td.textContent = rupees(it.price); td.className = "cmp-price"; }],
    ["Pack", function (it, td) { td.textContent = it.packLabel; }],
    ["Per unit", function (it, td) {
      td.textContent = perUnit(it);
      var same = rows.filter(function (r) { return r.compare === it.compare; }).length > 1;
      if (same && it.inStock && perUnitNumber(it) === cheapest[it.compare]) td.appendChild(el("span", "best", "Best value"));
    }],
    ["Delivery", function (it, td) { td.textContent = it.freeDelivery ? "Free" : "Paid"; td.className = it.freeDelivery ? "yes" : "no"; }],
    ["Stock", function (it, td) { td.textContent = it.inStock ? "In stock" : "Out of stock"; td.className = it.inStock ? "yes" : "no"; }]
  ];
  var tb = el("tbody");
  defs.forEach(function (d) {
    var tr = el("tr");
    tr.appendChild(el("th", "", d[0]));
    rows.forEach(function (it) { var td = el("td"); d[1](it, td); tr.appendChild(td); });
    tb.appendChild(tr);
  });
  var ar = el("tr", "cmp-act");
  ar.appendChild(el("th", "", ""));
  rows.forEach(function (it) {
    var td = el("td");
    td.appendChild(orderButton(it));
    var rm = el("button", "linkbtn", "Remove"); rm.type = "button";
    rm.addEventListener("click", function () { toggleCmp(it.id); drawCompareSel(); drawTray(); });
    td.appendChild(rm);
    ar.appendChild(td);
  });
  tb.appendChild(ar);
  table.appendChild(tb);
  body.appendChild(table);
  var clr = el("button", "linkbtn cmp-clear", "Clear all"); clr.type = "button";
  clr.addEventListener("click", function () { cmpIds = []; saveCmp(); drawCompareSel(); });
  body.appendChild(clr);
}

// ---------- page switching (results <-> compare) ----------

function showRoute() {
  var hash = window.location.hash;
  var compare = document.getElementById("compare");
  var results = document.getElementById("results");
  var count = document.getElementById("count");

  if (hash === "#business") { setRole("business"); return; }
  if (!role()) return;

  if ((hash === "#compare" || hash.indexOf("#compare/") === 0) && state.hostel && role() === "customer") {
    if (hash === "#compare") drawCompareSel(); else { document.getElementById("compare-body").className = "grid"; drawCompare(hash.slice(9)); }
    compare.hidden = false;
    results.hidden = true;
    count.hidden = true;
    window.scrollTo(0, 0);
  } else {
    compare.hidden = true;
    results.hidden = false;
    count.hidden = false;
  }
  var hero = document.querySelector(".hero"); if (hero) hero.hidden = !compare.hidden;
  var cats = document.querySelector("nav.cats"); if (cats) cats.hidden = !compare.hidden;
  drawTray();
}

// ---------- account menus ----------

window.hmMenu = function (btnId, menuId) {
  var btn = document.getElementById(btnId), menu = document.getElementById(menuId);
  function close() { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = menu.hidden;
    document.querySelectorAll(".menu").forEach(function (m) { m.hidden = true; });
    document.querySelectorAll(".acct-btn").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    menu.hidden = !open; btn.setAttribute("aria-expanded", String(open));
  });
  menu.addEventListener("click", close);
  document.addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
};

function drawAccount() {
  var p = profile();
  var name = p ? p.name : "Account";
  document.getElementById("acct-name").textContent = p ? p.name.split(" ")[0] : "Account";
  document.getElementById("acct-avatar").textContent = p ? (p.name.match(/\p{L}/u) || ["?"])[0].toUpperCase() : "?";
  document.getElementById("menu-who").textContent = p ? p.name + " \u00b7 +91 " + p.mobile.slice(0, 5) + " " + p.mobile.slice(5) : "Not signed in";
}

// ---------- customer details, asked once ----------

function showIdentify(edit) {
  var form = document.getElementById("identify-form");
  var p = profile() || {};
  form.elements.name.value = p.name || "";
  var holder = document.getElementById("identify-mobile");
  holder.textContent = "";
  holder.appendChild(mobileField("mobile", p.mobile || ""));
  document.getElementById("identify-msg").textContent = "";
  document.getElementById("identify-back").hidden = false;
  document.getElementById("gate").hidden = true;
  document.getElementById("app").hidden = true;
  document.getElementById("identify").hidden = false;
  document.body.classList.add("is-gate");
  form.dataset.edit = edit ? "1" : "";
}

document.getElementById("identify-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var f = e.target, msg = document.getElementById("identify-msg");
  var name = f.elements.name.value.trim(), mob = digits(f.elements.mobile.value);
  if (!/^[\p{L}][\p{L} .'\-]{1,59}$/u.test(name)) { msg.className = "form-msg err"; msg.textContent = "Enter your name."; return; }
  var mp = mobileProblem(mob); if (mp) { msg.className = "form-msg err"; msg.textContent = mp; return; }
  saveProfile(name, mob);
  document.getElementById("identify").hidden = true;
  setRole("customer");
});
document.getElementById("identify-back").addEventListener("click", function () {
  document.getElementById("identify").hidden = true;
  setRole(profile() && sessionStorage.getItem("role") === "customer" ? "customer" : "");
});

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
  if (r === "customer" && !profile()) { showIdentify(false); return; }
  if (r) sessionStorage.setItem("role", r); else sessionStorage.removeItem("role");
  var shown = r === "customer" || r === "business";
  document.getElementById("identify").hidden = true;
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

// Keep listings fresh: sold-out and price changes show up within about 30 seconds.
setInterval(function () {
  if (document.hidden || !data || !backendUrl() || sessionStorage.getItem("role") !== "customer") return;
  if (!document.getElementById("sheet").hidden || window.location.hash) return;
  fetch(backendUrl() + "?action=data").then(function (r) { return r.json(); }).then(function (live) {
    if (!live || !live.items || !live.stalls) return;
    live.backend = data.backend; live.support = data.support; data = live; liveReady = true;
    try { localStorage.setItem("hmData", JSON.stringify({ t: Date.now(), d: live })); } catch (e) {}
    if (!document.getElementById("sheet").hidden || window.location.hash) return;
    drawStats(); drawResults();
  }).catch(function () {});
}, 30000);

// ---------- start ----------

// Gate is visible straight away; the app shows after the data loads and a role is known.
(function () {
  if (role() || window.location.hash === "#business") document.getElementById("gate").hidden = true;
})();

document.getElementById("search").addEventListener("input", function (e) {
  state.query = e.target.value;
  drawResults();
  drawSuggest();
});

// ---------- search suggestions ----------
var sugIndex = -1, sugList = [];
function suggestions(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  var pool = {};
  function add(text, kind) { if (text && !pool[text.toLowerCase()]) pool[text.toLowerCase()] = { text: text, kind: kind }; }
  data.items.forEach(function (i) {
    if (!deliversHere(stallById(i.stall))) return;
    add(i.name, "Item"); add(i.sub, "Type"); add(keyLabel(i.compare), "Item");
  });
  data.stalls.forEach(function (s) { add(s.name, "Stall"); });
  var out = Object.keys(pool).map(function (k) {
    var t = k, p = pool[k], rank = t.indexOf(q) === 0 ? 0 : (t.indexOf(" " + q) > -1 ? 1 : (t.indexOf(q) > -1 ? 2 : 9));
    return { text: p.text, kind: p.kind, rank: rank };
  }).filter(function (x) { return x.rank < 9 && x.text.toLowerCase() !== q; });
  out.sort(function (a, b) { return a.rank - b.rank || a.text.length - b.text.length; });
  return out.slice(0, 6);
}
function drawSuggest() {
  var box = document.getElementById("suggest");
  if (!box) return;
  sugList = suggestions(document.getElementById("search").value);
  sugIndex = -1;
  box.textContent = "";
  box.hidden = sugList.length === 0;
  sugList.forEach(function (s, i) {
    var b = el("button", "sug", ""); b.type = "button"; b.setAttribute("role", "option");
    var q = document.getElementById("search").value.trim(), at = s.text.toLowerCase().indexOf(q.toLowerCase());
    var lab = el("span", "");
    lab.appendChild(document.createTextNode(s.text.slice(0, at)));
    lab.appendChild(el("b", "", s.text.slice(at, at + q.length)));
    lab.appendChild(document.createTextNode(s.text.slice(at + q.length)));
    b.appendChild(lab);
    b.appendChild(el("i", "", s.kind));
    b.addEventListener("mousedown", function (ev) { ev.preventDefault(); pickSuggest(i); });
    box.appendChild(b);
  });
}
function pickSuggest(i) {
  var s = sugList[i]; if (!s) return;
  var inp = document.getElementById("search");
  inp.value = s.text; state.query = s.text; drawResults();
  document.getElementById("suggest").hidden = true; sugList = [];
}
function markSuggest() {
  Array.prototype.forEach.call(document.getElementById("suggest").children, function (c, k) { c.classList.toggle("on", k === sugIndex); });
}
document.getElementById("search").addEventListener("keydown", function (e) {
  if (!sugList.length) return;
  if (e.key === "ArrowDown") { e.preventDefault(); sugIndex = (sugIndex + 1) % sugList.length; markSuggest(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); sugIndex = (sugIndex - 1 + sugList.length) % sugList.length; markSuggest(); }
  else if (e.key === "Enter" && sugIndex > -1) { e.preventDefault(); pickSuggest(sugIndex); }
  else if (e.key === "Escape") { document.getElementById("suggest").hidden = true; }
});
document.getElementById("search").addEventListener("blur", function () { setTimeout(function () { document.getElementById("suggest").hidden = true; }, 120); });
document.getElementById("search").addEventListener("focus", drawSuggest);

document.getElementById("cmp-clear").addEventListener("click", function () { cmpIds = []; saveCmp(); drawResults(); });
document.getElementById("compare-back").addEventListener("click", function () {
  window.location.hash = "";
});

window.addEventListener("hashchange", showRoute);

// Listings come from data.json. If a backend URL is set there, the live Sheet data replaces it.
// A saved copy of the last live listing paints instantly; ordering waits for the fresh copy.
var liveReady = false, booted = false;
var noteTimer = setTimeout(function () {
  var n = document.getElementById("gate-note");
  if (n && !booted) n.textContent = "Still loading. The server is waking up, this can take a few more seconds.";
}, 6000);

function boot(json, live) {
  data = json;
  liveReady = live;
  document.getElementById("support-note").textContent = (data.support && data.support.note) || "";
  if (data.hostels.indexOf(state.hostel) === -1) state.hostel = data.hostels[0];
  // The demo banner stays until a live backend URL is set AND the Sheet Config says demo is FALSE.
  document.getElementById("demo-banner").hidden = !!(backendUrl() && !data.event.demo);
  if (data.event.stockNote) document.getElementById("stock-note").textContent = data.event.stockNote;
  if (!booted) {
    booted = true;
    clearTimeout(noteTimer);
    var gn = document.getElementById("gate-note"); if (gn) gn.hidden = true;
    document.getElementById("gate-customer").disabled = false;
    document.getElementById("gate-business").disabled = false;
    setRole(role());
    if (window.location.hash === "#business") setRole("business");
  } else if (sessionStorage.getItem("role") === "customer") {
    drawStats(); drawResults(); showRoute();
  }
}

var cached = null;
try { cached = JSON.parse(localStorage.getItem("hmData") || "null"); } catch (e) { cached = null; }

fetch("data.json")
  .then(function (r) { return r.json(); })
  .then(function (local) {
    if (!local.backend || !local.backend.url) { boot(local, true); return; }
    if (cached && cached.d && cached.d.items && Date.now() - cached.t < 86400000) {
      cached.d.backend = local.backend; cached.d.support = local.support;
      boot(cached.d, false);
    }
    return fetch(local.backend.url + "?action=data").then(function (r) { return r.json(); })
      .then(function (live) {
        if (!live || !live.items || !live.stalls) throw new Error("bad data");
        live.backend = local.backend; live.support = local.support;
        try { localStorage.setItem("hmData", JSON.stringify({ t: Date.now(), d: live })); } catch (e) {}
        boot(live, true);
      });
  })
  .catch(function () {
    if (booted) return;
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

document.getElementById("gate-customer").addEventListener("click", function () { if (profile()) setRole("customer"); else showIdentify(false); });
document.getElementById("menu-edit").addEventListener("click", function () { showIdentify(true); });
document.getElementById("menu-out").addEventListener("click", function () {
  localStorage.removeItem("hmMe"); sessionStorage.removeItem("role"); drawAccount(); setRole("");
});
window.hmMenu("acct-btn", "acct-menu");
drawAccount();
document.getElementById("gate-business").addEventListener("click", function () { window.location.hash = "#business"; setRole("business"); });
document.getElementById("to-business").addEventListener("click", function () { window.location.hash = "#business"; setRole("business"); });
document.getElementById("to-customer").addEventListener("click", function () { setRole("customer"); });
