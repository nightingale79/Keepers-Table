/* The Keeper's Table — front-end SPA (talks to the JSON API over fetch). */
"use strict";
(function () {

/* ---------- constants ---------- */
var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
var SLOTS = ["Morning", "Afternoon", "Evening", "Late Night"];
var STAT_KEYS = ["STR", "CON", "SIZ", "DEX", "APP", "INT", "POW", "EDU"];
var CAMP_STATUS = ["active", "planning", "hiatus", "complete"];
var ASSET_KINDS = ["Handout", "Location", "Clue", "Item", "NPC Note", "Map", "Lore"];

/* ---------- state ---------- */
var S = {
  state: null,          // last /api/state snapshot
  view: "home",
  campaignId: null,
  campTab: "assets"
};

/* ---------- utils ---------- */
function $(s, r) { return (r || document).querySelector(s); }
function app() { return $("#app"); }
function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function me() { return (S.state && S.state.me) || { role: "investigator", displayName: "" }; }
// "isKeeper" means game-running staff — a Keeper OR an Admin (Admins outrank Keepers).
function isKeeper() { return me().role === "keeper" || me().role === "admin"; }
function isAdmin() { return me().role === "admin"; }
function roleLabel(r) { return r === "admin" ? "Admin" : r === "keeper" ? "Keeper" : "Investigator"; }
function cfg() { return (S.state && S.state.config) || {}; }
function siteTitle() { return cfg().title || "The Keeper's Table"; }
function siteTagline() { return cfg().tagline || "A private circle for players of Call of Cthulhu"; }
function byOrder(a, b) { return (a.order || 0) - (b.order || 0); }

var _toastT;
function toast(msg, isErr) {
  var t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(_toastT);
  _toastT = setTimeout(function () { t.className = "toast"; }, 2800);
}

/* ---------- API ---------- */
function api(method, url, body) {
  return fetch(url, {
    method: method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined
  }).then(function (r) {
    if (r.status === 401) { location.href = "/login"; throw new Error("auth"); }
    return r.json().then(function (j) {
      if (!r.ok) { throw new Error(j.error || "Request failed."); }
      return j;
    });
  });
}
function refresh() {
  return api("GET", "/api/state").then(function (st) { S.state = st; render(); return st; });
}
// perform a mutation, then refresh + toast
function act(method, url, body, okMsg) {
  return api(method, url, body).then(function (r) {
    return refresh().then(function () { if (okMsg) toast(okMsg); return r; });
  }).catch(function (e) {
    if (e.message !== "auth") toast(e.message || "Something went wrong.", true);
    throw e;
  });
}

/* ================= RENDER ================= */
var _pending = false;
function scheduleRender() { if (_pending) return; _pending = true; requestAnimationFrame(function () { _pending = false; render(); }); }

function render() {
  if (!S.state) return;
  if (S.dragging) return; // don't rebuild the DOM out from under an active drag
  var html = topbar();
  if (S.view === "home") html += viewHome();
  else if (S.view === "resources") html += viewResources();
  else if (S.view === "campaigns") html += viewCampaigns();
  else if (S.view === "scheduler") html += viewScheduler();
  else if (S.view === "myinv") html += viewMyInvestigators();
  else if (S.view === "players" && isKeeper()) html += viewPlayers();
  else if (S.view === "keeper" && isKeeper()) html += viewKeeper();
  else if (S.view === "account") html += viewAccount();
  else { S.view = "home"; html += viewHome(); }
  html += footer();
  app().innerHTML = "<div class='wrap'>" + html + "</div>";
}

function sigil() {
  return "<svg class='sigil' viewBox='0 0 48 48' fill='none' aria-hidden='true'>" +
    "<circle cx='24' cy='24' r='21' stroke='#c8a951' stroke-width='1.2'/>" +
    "<circle cx='24' cy='24' r='16' stroke='#9c7f37' stroke-width='.8'/>" +
    "<path d='M24 5 L29.5 19 L44 19 L32.5 28 L37 43 L24 34 L11 43 L15.5 28 L4 19 L18.5 19 Z' stroke='#e6cd82' stroke-width='1' fill='rgba(200,169,81,.12)'/>" +
    "<circle cx='24' cy='24' r='3.4' fill='#e6cd82'/></svg>";
}

function topbar() {
  var r = me().role;
  var roleCls = r === "admin" ? "admin" : r === "keeper" ? "keeper" : "invest";
  var roleTxt = (r === "admin" ? "✦ Admin" : r === "keeper" ? "✦ Keeper" : "◈ Investigator");
  return "<div class='topbar'>" +
    "<button class='brand' data-nav='home'>" + sigil() +
      "<div class='brand-txt'><div class='title'>" + esc(siteTitle()) + "</div>" +
      "<div class='sub'>Call of Cthulhu</div></div></button>" +
    "<div class='who'>" +
      "<button class='name' data-nav='account'>" + esc(me().displayName || "Account") + "</button>" +
      "<span class='role " + roleCls + "'>" + roleTxt + "</span>" +
      "<button class='lo' data-act='logout'>Leave</button>" +
    "</div></div>";
}

/* ---------- HOME ---------- */
function viewHome() {
  var camps = (S.state.campaigns || []);
  var cards = [
    { v: "resources", num: "V", card: "The Hierophant", icon: "⚕", title: "Resources",
      desc: "Rulebooks, the investigator handbook, a blank character sheet, and quick reference for the table." },
    { v: "campaigns", num: "XVI", card: "The Tower", icon: "☗", title: "Campaigns",
      desc: (camps.length || "No") + " " + (camps.length === 1 ? "chronicle" : "chronicles") + " of madness — assets, handouts, and the investigators who dare them." },
    { v: "scheduler", num: "XVIII", card: "The Moon", icon: "☾", title: "Scheduler",
      desc: "Mark the nights you can play and vote on session dates. The stars align where you overlap." },
    { v: "myinv", num: "VII", card: "The Chariot", icon: "⚔", title: "My Investigators",
      desc: myInvSummary() }
  ];
  var deck = cards.map(arcanaCard).join("");
  if (isKeeper()) {
    deck += arcanaCard({ v: "players", num: "IV", card: "The Emperor", icon: "☗", title: "Players & Accounts",
      desc: (S.state.users ? S.state.users.length : 0) + " at the table. " + (isAdmin() ? "Create accounts, assign Keepers & Admins, share an invite code." : "Create player accounts and share an invite code."), keeper: true });
    deck += arcanaCard({ v: "keeper", num: "II", card: "The High Priestess", icon: "🜃", title: "Keeper's Table",
      desc: "Your private table — secret notes live per campaign, plus the hub's title, tagline, and resource links.", keeper: true });
  }
  return "<div class='hero'><div class='eye'>Enter, if you dare</div>" +
    "<h1>" + heroTitle() + "</h1><div class='flourish'>✦ ☾ ✦</div>" +
    "<p>" + esc(siteTagline()) + "</p></div><div class='deck'>" + deck + "</div>";
}
function heroTitle() {
  var t = siteTitle();
  if (t === "The Keeper's Table") return "The Keeper's <em>Table</em>";
  return esc(t);
}
function arcanaCard(c) {
  return "<button class='arcana " + (c.keeper ? "keeper" : "") + "' data-nav='" + c.v + "'>" +
    "<span class='num'>" + c.num + "</span><span class='icon'>" + c.icon + "</span>" +
    "<h3>" + esc(c.title) + "</h3><span class='card-name'>" + esc(c.card) + "</span>" +
    "<p>" + esc(c.desc) + "</p><span class='go'>Draw the card →</span></button>";
}

function crumb(target, txt) {
  return "<div class='crumb'><button class='back' data-nav='" + (target || "home") + "'>← " + esc(txt || "The Deck") + "</button></div>";
}
function panelHead(sub, title, desc, actions) {
  return "<div class='panel-head'><div><div class='sub'>" + esc(sub) + "</div><h2>" + esc(title) + "</h2>" +
    (desc ? "<p>" + esc(desc) + "</p>" : "") + "</div><div class='btn-row'>" + (actions || "") + "</div></div>";
}
function emptyState(icon, title, desc, action) {
  return "<div class='empty'><div class='big'>" + icon + "</div><h3 style='color:var(--ink)'>" + esc(title) +
    "</h3><p>" + esc(desc) + "</p>" + (action || "") + "</div>";
}

/* ---------- MAP (Roll20-style battle map) ---------- */
function campMaps(c) { return (S.state.maps || []).filter(function (m) { return m.campaignId === c.id; }); }
function initials(s) { return (String(s || "?").trim().replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2) || "?").toUpperCase(); }
function mapTab(c) {
  var maps = campMaps(c);
  var kctrl = isKeeper() ? "<button class='btn btn-gold btn-sm' data-act='upload-map' data-id='" + esc(c.id) + "'>✦ Upload map</button>" : "";
  if (!maps.length) {
    return (kctrl ? "<div class='btn-row' style='margin-bottom:16px'>" + kctrl + "</div>" : "") +
      emptyState("🗺", "No map yet", isKeeper() ? "Upload a battle map or location image, then drop tokens your players can move." : "Your Keeper hasn't laid out a map yet.", "");
  }
  var sel = maps.find(function (m) { return m.id === S.mapId; }) || maps[0];
  S.mapId = sel.id;
  var chips = maps.map(function (m) {
    return "<button class='inv-chip " + (m.id === sel.id ? "on" : "") + "' data-sel-map='" + esc(m.id) + "'><span class='cn'>" + esc(m.name) + "</span></button>";
  }).join("");
  var tokens = (S.state.tokens || []).filter(function (t) { return t.mapId === sel.id; });
  var tokEls = tokens.map(function (t) {
    var canMove = isKeeper() || t.ownerId === me().id;
    var canDel = isKeeper() || t.ownerId === me().id;
    return "<div class='token" + (canMove ? " draggable" : "") + "' data-token-id='" + esc(t.id) + "' style='left:" + (t.x * 100) + "%;top:" + (t.y * 100) + "%;--tk:" + esc(t.color || "#c23d4a") + "'>" +
      "<span class='tk-dot'>" + esc(initials(t.label)) + "</span>" +
      "<span class='tk-label'>" + esc(t.label) + "</span>" +
      (canDel ? "<button class='tk-x' data-act='" + (isKeeper() ? "del-token" : "del-my-token") + "' data-id='" + esc(t.id) + "' aria-label='Remove token'>✕</button>" : "") +
      "</div>";
  }).join("");
  var controls = "<div class='btn-row' style='margin-bottom:12px'>" + kctrl +
    (isKeeper() ?
      "<button class='btn btn-ghost btn-sm' data-act='add-token' data-id='" + esc(sel.id) + "'>+ Add token</button>" +
      "<button class='btn btn-ghost btn-sm' data-act='toggle-grid' data-id='" + esc(sel.id) + "'>Grid: " + (sel.gridOn ? "on" : "off") + "</button>" +
      "<button class='btn btn-ghost btn-sm' data-act='rename-map' data-id='" + esc(sel.id) + "'>Rename</button>" +
      "<button class='btn btn-blood btn-sm' data-act='del-map' data-id='" + esc(sel.id) + "'>Delete map</button>" : "") +
    (myInvestigators().length ? "<button class='btn btn-gold btn-sm' data-act='place-me' data-id='" + esc(sel.id) + "'>+ Place my investigator</button>" : "") +
    "</div>";
  var chipRow = (maps.length > 1 || isKeeper()) ? "<div class='inv-chips' style='margin-bottom:14px'>" + chips + "</div>" : "";
  return chipRow + controls +
    "<p class='muted tiny'>Drag a token you control to move it. Everyone at the table sees moves within a few seconds.</p>" +
    "<div class='map-wrap'><div class='map-stage" + (sel.gridOn ? " grid" : "") + "' data-map-stage='" + esc(sel.id) + "'>" +
      "<img class='map-img' src='/api/files/" + esc(sel.fileId) + "' alt='" + esc(sel.name) + "' draggable='false'>" +
      tokEls +
    "</div></div>";
}

/* ---------- RESOURCES ---------- */
function defaultLinks() {
  return [
    { icon: "📖", label: "Call of Cthulhu (Chaosium)", note: "The official publisher's page for the 7th-edition rules.", url: "https://www.chaosium.com/call-of-cthulhu-rpg/" },
    { icon: "🎲", label: "Free Quick-Start Rules", note: "Enough to run and play a first game. Add your link.", url: "" },
    { icon: "🗂", label: "Investigator Handbook", note: "Occupations, skills, and 1920s background. Add your link.", url: "" },
    { icon: "📝", label: "Blank Investigator Sheet (PDF)", note: "Your group's fillable character sheet. Add your link.", url: "" }
  ];
}
function viewResources() {
  var links = (cfg().links && cfg().links.length) ? cfg().links : defaultLinks();
  var kbtn = isKeeper() ? "<button class='btn btn-ghost btn-sm' data-act='edit-resources'>Edit links</button>" : "";
  var cards = links.map(function (l) {
    var has = l.url && /^https?:\/\//i.test(l.url);
    return "<div class='res'><div class='rico'>" + (l.icon || "❖") + "</div><div>" +
      "<h4>" + esc(l.label) + "</h4><p>" + esc(l.note || "") + "</p>" +
      (has ? "<a class='lk' href='" + esc(l.url) + "' target='_blank' rel='noopener'>Open ↗</a>"
           : "<span class='lk noset'>" + (isKeeper() ? "No link yet — add one" : "Link not set") + "</span>") +
      "</div></div>";
  }).join("");
  return crumb() + "<div class='panel'>" +
    panelHead("V · The Hierophant", "Resources", "Everything the table needs to begin. The Keeper can point each link to your own copies.", kbtn) +
    "<div class='res-grid'>" + cards + "</div><div class='rule'></div>" + sheetTemplate() + "</div>";
}
function sheetTemplate() {
  var stats = STAT_KEYS.map(function (k) {
    return "<div class='statcell'><div class='k'>" + k + "</div><div class='v'>—<small>/00</small></div></div>";
  }).join("");
  return "<div class='sheet-block'><h3 style='font-size:20px'>The Investigator, at a glance</h3>" +
    "<p class='muted tiny'>A reminder of the 7th-edition shape while you fill your own sheet. Characteristics run 0–99; derived stats follow from them.</p>" +
    "<div class='statgrid'>" + stats + "</div>" +
    "<div class='statgrid'>" +
      "<div class='statcell'><div class='k'>Hit Points</div><div class='v'>(CON+SIZ)/10</div></div>" +
      "<div class='statcell'><div class='k'>Magic Pts</div><div class='v'>POW/5</div></div>" +
      "<div class='statcell'><div class='k'>Sanity</div><div class='v'>= POW</div></div>" +
      "<div class='statcell'><div class='k'>Luck</div><div class='v'>3d6×5</div></div>" +
      "<div class='statcell'><div class='k'>Move</div><div class='v'>7–9</div></div>" +
    "</div><p class='muted tiny' style='margin-top:10px'>Sanity is the coin of this game — spend it wisely, and never look too long.</p></div>";
}

/* ---------- CAMPAIGNS ---------- */
function viewCampaigns() {
  if (S.campaignId) return viewCampaignDetail();
  var kbtn = isKeeper() ? "<button class='btn btn-gold btn-sm' data-act='new-campaign'>✦ New campaign</button>" : "";
  var list = (S.state.campaigns || []).slice().sort(byOrder);
  var body;
  if (!list.length) {
    body = emptyState("☗", isKeeper() ? "No chronicles yet" : "The Keeper hasn't opened a chronicle yet",
      isKeeper() ? "Draw the Tower and begin your first campaign — a name and a hook are all it takes." : "Check back once your Keeper has prepared the table.",
      isKeeper() ? "<button class='btn btn-gold' data-act='new-campaign'>✦ Open the first campaign</button>" : "");
  } else {
    body = "<div class='camp-list'>" + list.map(function (c) {
      var st = c.status || "planning";
      var ex = c.example ? "<span class='pill example'><span class='dot'></span>Example</span>" : "";
      return "<button class='camp' data-open-camp='" + esc(c.id) + "'>" +
        "<div style='display:flex;justify-content:space-between;align-items:flex-start;gap:8px'>" +
        "<span class='cico'>" + (c.icon || "☗") + "</span><span class='pill " + st + "'><span class='dot'></span>" + st + "</span></div>" +
        "<h4>" + esc(c.name || "Untitled") + "</h4><div class='era'>" + esc(c.era || "1920s") + "</div>" +
        "<p>" + esc(c.synopsis || "No synopsis yet.") + "</p>" + ex + "</button>";
    }).join("") + "</div>";
  }
  return crumb() + "<div class='panel'>" +
    panelHead("XVI · The Tower", "Campaigns", "The chronicles your circle has dared — and those still gathering in the dark.", kbtn) +
    body + "</div>";
}
function viewCampaignDetail() {
  var c = (S.state.campaigns || []).find(function (x) { return x.id === S.campaignId; });
  if (!c) { S.campaignId = null; return viewCampaigns(); }
  var st = c.status || "planning";
  var kbtns = isKeeper() ?
    "<button class='btn btn-ghost btn-sm' data-act='edit-campaign' data-id='" + esc(c.id) + "'>Edit</button>" +
    "<button class='btn btn-blood btn-sm' data-act='del-campaign' data-id='" + esc(c.id) + "'>Delete</button>" : "";
  var tabs = "<div class='tabs'>" +
    "<button class='tab " + (S.campTab === "assets" ? "on" : "") + "' data-tab='assets'>Assets &amp; Handouts</button>" +
    "<button class='tab " + (S.campTab === "chars" ? "on" : "") + "' data-tab='chars'>Investigators &amp; NPCs</button>" +
    "<button class='tab " + (S.campTab === "map" ? "on" : "") + "' data-tab='map'>Map</button>" +
    (isKeeper() ? "<button class='tab " + (S.campTab === "secret" ? "on" : "") + "' data-tab='secret'>Keeper's Secrets</button>" : "") +
    "</div>";
  var body = S.campTab === "assets" ? assetsTab(c)
    : S.campTab === "chars" ? charsTab(c)
    : S.campTab === "map" ? mapTab(c)
    : (isKeeper() ? secretTab(c) : assetsTab(c));
  return crumb("campaigns", "All campaigns") + "<div class='panel'>" +
    panelHead((c.era || "1920s") + " · " + st, c.name || "Untitled", c.synopsis || "", kbtns) + tabs + body + "</div>";
}
function assetsTab(c) {
  var mine = (S.state.assets || []).filter(function (a) { return a.campaignId === c.id; });
  var kbtn = isKeeper() ? "<div class='btn-row' style='margin-bottom:16px'><button class='btn btn-gold btn-sm' data-act='new-asset' data-id='" + esc(c.id) + "'>✦ Add asset</button></div>" : "";
  if (!mine.length) return kbtn + emptyState("📜", "No assets yet",
    isKeeper() ? "Add handouts, locations, clues, and lore. Mark any as a secret to hide it from the investigators." : "Handouts will appear here as your Keeper reveals them.", "");
  var cards = mine.map(function (a) {
    return "<div class='item'><div class='ihead'><h4>" + esc(a.title || "Untitled") + "</h4><span class='kind'>" + esc(a.kind || "Lore") + "</span></div>" +
      (a.body ? "<div class='body'>" + esc(a.body) + "</div>" : "") +
      (a.hidden ? "<div class='secret'>🔒 Keeper only</div>" : "") +
      (isKeeper() ? "<div class='edit-row'><button class='btn btn-ghost btn-sm' data-act='edit-asset' data-id='" + esc(a.id) + "'>Edit</button>" +
        "<button class='btn btn-blood btn-sm' data-act='del-asset' data-id='" + esc(a.id) + "'>Delete</button></div>" : "") + "</div>";
  }).join("");
  return kbtn + "<div class='items'>" + cards + "</div>";
}
function charsTab(c) {
  var list = (S.state.characters || []).filter(function (ch) { return ch.campaignId === c.id; });
  var kbtn = isKeeper() ? "<div class='btn-row' style='margin-bottom:16px'><button class='btn btn-gold btn-sm' data-act='new-char' data-id='" + esc(c.id) + "'>✦ Add character</button></div>" : "";
  if (!list.length) return kbtn + emptyState("👤", "No characters yet",
    isKeeper() ? "Add the investigators and the NPCs who cross their path." : "The dramatis personae will appear here.", "");
  var cards = list.map(function (ch) {
    var isNPC = ch.kind === "NPC";
    var stats = STAT_KEYS.map(function (k) {
      return "<div class='c'><div class='k'>" + k + "</div><div class='v'>" + esc((ch.stats && ch.stats[k]) || "—") + "</div></div>";
    }).join("");
    return "<div class='item'><div class='ihead'><h4>" + esc(ch.name || "Unnamed") + "</h4><span class='kind'>" + (isNPC ? "NPC" : "Investigator") + "</span></div>" +
      "<div class='char-meta'>" + (ch.player && !isNPC ? "<b>" + esc(ch.player) + "</b> · " : "") + esc(ch.occupation || "") + (ch.age ? " · age " + esc(ch.age) : "") + "</div>" +
      (ch.stats && Object.keys(ch.stats).length ? "<div class='char-stats'>" + stats + "</div>" : "") +
      (ch.hp || ch.san || ch.luck ? "<div class='char-meta'>" + (ch.hp ? "HP <b>" + esc(ch.hp) + "</b> · " : "") + (ch.san ? "SAN <b>" + esc(ch.san) + "</b> · " : "") + (ch.luck ? "Luck <b>" + esc(ch.luck) + "</b>" : "") + "</div>" : "") +
      (ch.notes ? "<div class='body'>" + esc(ch.notes) + "</div>" : "") +
      (ch.hidden ? "<div class='secret'>🔒 Keeper only</div>" : "") +
      (!isKeeper() && ch.ownerId === me().id ? "<div class='edit-row'><button class='btn btn-ghost btn-sm' data-act='edit-myinv' data-id='" + esc(ch.id) + "'>Edit (yours)</button></div>" : "") +
      (isKeeper() ? "<div class='edit-row'><button class='btn btn-ghost btn-sm' data-act='edit-char' data-id='" + esc(ch.id) + "'>Edit</button>" +
        "<button class='btn btn-blood btn-sm' data-act='del-char' data-id='" + esc(ch.id) + "'>Delete</button></div>" : "") + "</div>";
  }).join("");
  return kbtn + "<div class='items'>" + cards + "</div>";
}
function secretTab(c) {
  var notes = (S.state.secrets && S.state.secrets.byCampaign && S.state.secrets.byCampaign[c.id]) || "";
  return "<div class='notice blood'><span class='ni'>🔒</span><div>Private to you. These notes never leave the server for anyone but a Keeper.</div></div>" +
    "<div class='field'><label>Secret notes for “" + esc(c.name || "this campaign") + "”</label>" +
    "<textarea id='secret-notes' style='min-height:200px' placeholder='Twists, the true nature of the cult, what waits behind the door…'>" + esc(notes) + "</textarea></div>" +
    "<button class='btn btn-gold' data-act='save-secret' data-id='" + esc(c.id) + "'>Seal these notes</button>";
}

/* ---------- SCHEDULER ---------- */
function myAvail() {
  return (S.state.avail || []).find(function (a) { return a.userId === me().id; }) || null;
}
function viewScheduler() {
  return crumb() + "<div class='panel'>" +
    panelHead("XVIII · The Moon", "The Scheduler", "Two ways to find a night: mark the hours you're free, and vote on specific dates.") +
    weeklySection() + "<div class='rule'></div>" + pollsSection() + "</div>";
}
function weeklySection() {
  var mine = myAvail();
  var cells = (mine && mine.cells) || {};
  var head = "<tr><th></th>" + DAYS.map(function (d) { return "<th>" + d + "</th>"; }).join("") + "</tr>";
  var rows = SLOTS.map(function (slot, si) {
    var tds = DAYS.map(function (d, di) {
      var key = di + "_" + si; var on = cells[key];
      return "<td><button class='cell " + (on ? "on" : "") + "' data-cell='" + key + "' aria-label='" + d + " " + slot + "'></button></td>";
    }).join("");
    return "<tr><th>" + slot + "</th>" + tds + "</tr>";
  }).join("");

  var avail = S.state.avail || [];
  var maxN = Math.max(1, avail.length);
  var heatRows = SLOTS.map(function (slot, si) {
    var tds = DAYS.map(function (d, di) {
      var key = di + "_" + si;
      var n = avail.filter(function (a) { return a.cells && a.cells[key]; }).length;
      var alpha = n ? (0.14 + 0.6 * (n / maxN)) : 0;
      var col = n ? "background:rgba(74,147,138," + alpha.toFixed(2) + ");" : "";
      return "<td class='heat' style='" + col + "'><span class='cnt' style='color:" + (n ? "#0f5f56" : "var(--ink-faint)") + "'>" + (n || "·") + "</span></td>";
    }).join("");
    return "<tr><th>" + slot + "</th>" + tds + "</tr>";
  }).join("");

  var scored = [];
  SLOTS.forEach(function (slot, si) { DAYS.forEach(function (d, di) {
    var key = di + "_" + si; var n = avail.filter(function (a) { return a.cells && a.cells[key]; }).length;
    if (n > 0) scored.push({ label: DAYS[di] + " · " + slot, n: n });
  }); });
  scored.sort(function (a, b) { return b.n - a.n; });
  var top = scored.slice(0, 3);
  var best = (avail.length && top.length) ? "<div class='best'><h4>✦ Where the stars align</h4><ul>" +
    top.map(function (t) { return "<li><b>" + esc(t.label) + "</b> — " + t.n + " of " + avail.length + " free</li>"; }).join("") + "</ul></div>" : "";

  var nameNote = me().displayName ? "" : "<div class='notice'><span class='ni'>✦</span><div>Set a display name in <b>Account</b> (top-right) so the Keeper knows whose availability this is.</div></div>";

  return "<div class='sched-intro'><h3 style='font-size:22px;margin-right:auto'>Weekly availability</h3></div>" + nameNote +
    "<p class='muted tiny'>Tap the hours you can usually play. " + (avail.length ? avail.length + " " + (avail.length === 1 ? "person has" : "people have") + " marked their week." : "Be the first to mark your week.") + "</p>" +
    "<div class='tablewrap'><table class='grid'><thead>" + head + "</thead><tbody>" + rows + "</tbody></table></div>" +
    "<p class='label' style='margin:22px 0 8px;color:var(--gold-deep)'>The whole circle · overlap</p>" +
    "<div class='tablewrap'><table class='grid'><thead>" + head + "</thead><tbody>" + heatRows + "</tbody></table></div>" + best +
    "<div class='legend'><span><span class='sw' style='background:rgba(74,147,138,.5)'></span>more free</span>" +
    "<span><span class='sw' style='background:rgba(74,147,138,.14)'></span>fewer</span>" +
    (isKeeper() ? "<button class='btn btn-ghost btn-sm' data-act='add-roster'>+ Add someone manually</button>" : "") + "</div>" +
    (isKeeper() ? keeperRoster() : "");
}
function keeperRoster() {
  var avail = S.state.avail || [];
  if (!avail.length) return "";
  var lines = avail.map(function (a) {
    return "<div class='roster-line'><span class='rn'>" + esc(a.name || "Unnamed") + (a.userId === me().id ? " (you)" : (a.userId ? "" : " · manual")) + "</span>" +
      "<span class='tiny muted'>" + Object.keys(a.cells || {}).length + " slots</span>" +
      (a.userId ? "" : "<button class='btn btn-blood btn-sm' data-act='del-avail' data-id='" + esc(a.id) + "'>Remove</button>") + "</div>";
  }).join("");
  return "<div style='margin-top:18px'><p class='label' style='color:var(--oxblood)'>Keeper · roster</p>" + lines +
    "<p class='muted tiny' style='margin-top:8px'>Manual entries are for players without an account — you set their availability. Account holders manage their own row.</p></div>";
}
function pollsSection() {
  var kbtn = isKeeper() ? "<button class='btn btn-gold btn-sm' data-act='new-poll'>✦ Propose dates</button>" : "";
  var list = (S.state.polls || []).slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  var body = list.length ? list.map(pollCard).join("") :
    emptyState("🃏", "No date polls yet", isKeeper() ? "Propose a few candidate dates and let your circle vote." : "Your Keeper hasn't proposed dates yet.", "");
  return "<div class='panel-head' style='margin-top:6px'><div><div class='sub'>The Wheel turns</div><h3 style='color:var(--ink);font-size:24px'>Session date polls</h3></div><div class='btn-row'>" + kbtn + "</div></div>" + body;
}
function pollCard(p) {
  var dates = p.dates || [];
  var voters = (S.state.votes || []).filter(function (v) { return v.pollId === p.id; });
  var myVote = voters.find(function (v) { return v.userId === me().id; });
  var head = "<tr><th></th>" + dates.map(function (d) { return "<th>" + esc(d.label) + "</th>"; }).join("") + "</tr>";
  var canWrite = !p.closed;
  var myRow = dates.map(function (d) {
    var cur = (myVote && myVote.choices && myVote.choices[d.id]) || "";
    return "<td style='background:rgba(200,169,81,.06)'><span class='vote'>" +
      "<button class='vbtn yes " + (cur === "yes" ? "on" : "") + "' data-vote='" + esc(p.id) + "|" + esc(d.id) + "|yes' " + (canWrite ? "" : "disabled") + " title='Yes'>✓</button>" +
      "<button class='vbtn maybe " + (cur === "maybe" ? "on" : "") + "' data-vote='" + esc(p.id) + "|" + esc(d.id) + "|maybe' " + (canWrite ? "" : "disabled") + " title='Maybe'>~</button>" +
      "<button class='vbtn no " + (cur === "no" ? "on" : "") + "' data-vote='" + esc(p.id) + "|" + esc(d.id) + "|no' " + (canWrite ? "" : "disabled") + " title='No'>✗</button>" +
      "</span></td>";
  }).join("");
  var otherRows = voters.filter(function (v) { return v.userId !== me().id; }).map(function (v) {
    var cells = dates.map(function (d) {
      var ch = (v.choices || {})[d.id];
      return "<td>" + (ch ? "<span class='tally " + (ch === "yes" ? "y" : ch === "maybe" ? "m" : "n") + "'>" + (ch === "yes" ? "✓" : ch === "maybe" ? "~" : "✗") + "</span>" : "–") + "</td>";
    }).join("");
    return "<tr><th>" + esc(v.name || "Someone") + "</th>" + cells + "</tr>";
  }).join("");
  var tallyCells = dates.map(function (d) {
    var y = 0, m = 0, n = 0;
    voters.forEach(function (v) { var c = (v.choices || {})[d.id]; if (c === "yes") y++; else if (c === "maybe") m++; else if (c === "no") n++; });
    return "<td class='tally'><span class='y'>" + y + "✓</span> <span class='m'>" + m + "~</span> <span class='n'>" + n + "✗</span></td>";
  }).join("");
  var kctrl = isKeeper() ? "<div class='btn-row'>" +
    "<button class='btn btn-ghost btn-sm' data-act='toggle-poll' data-id='" + esc(p.id) + "'>" + (p.closed ? "Reopen" : "Close") + "</button>" +
    "<button class='btn btn-blood btn-sm' data-act='del-poll' data-id='" + esc(p.id) + "'>Delete</button></div>" : "";
  return "<div class='poll " + (p.closed ? "closed" : "") + "'><div class='phead'><h4>" + esc(p.title || "Session dates") +
    (p.closed ? " <span class='pill complete'><span class='dot'></span>Closed</span>" : "") + "</h4>" + kctrl + "</div>" +
    "<div class='polltable'><table><thead>" + head + "</thead><tbody>" +
    "<tr style='background:rgba(200,169,81,.08)'><th style='color:var(--ink)'>" + esc(me().displayName || "Your vote") + "</th>" + myRow + "</tr>" +
    otherRows +
    "<tr style='border-top:2px solid rgba(156,127,55,.4)'><th style='color:var(--gold-deep)'>Tally</th>" + tallyCells + "</tr>" +
    "</tbody></table></div></div>";
}

/* ---------- PLAYERS (keeper) ---------- */
function viewPlayers() {
  var users = S.state.users || [];
  var c = cfg();
  var inviteBox = "<div class='invitebox'><div class='label' style='color:var(--gold-deep)'>Invite-code sign-up</div>" +
    "<p class='muted tiny' style='margin:6px 0 10px'>When on, players can create their own account at the sign-in page using this code. Turn it off any time; change the code to lock out an old one.</p>" +
    "<div class='btn-row'>" +
      "<span class='code'>" + (c.inviteCode ? esc(c.inviteCode) : "— none —") + "</span>" +
      "<span class='pill " + (c.inviteEnabled ? "active" : "complete") + "'><span class='dot'></span>" + (c.inviteEnabled ? "On" : "Off") + "</span>" +
      "<button class='btn btn-ghost btn-sm' data-act='edit-invite'>Change / toggle</button>" +
    "</div></div>";
  var lines = users.map(function (u) {
    var isSelf = u.id === me().id;
    var canManage = isAdmin() || u.role === "investigator";
    return "<div class='user-line'><div class='un'><b>" + esc(u.displayName || u.username) + "</b>" + (isSelf ? " <span class='tiny muted'>(you)</span>" : "") +
      "<div class='uu'>@" + esc(u.username) + "</div></div>" +
      "<span class='rolechip " + u.role + "'>" + roleLabel(u.role) + "</span>" +
      (canManage ? "<button class='btn btn-ghost btn-sm' data-act='edit-user' data-id='" + esc(u.id) + "'>Manage</button>" : "<span class='tiny muted' style='min-width:70px;text-align:center'>—</span>") +
      "</div>";
  }).join("");
  var desc = isAdmin() ? "You are the Admin — you control who sits at the table and who runs the games." : "Create player accounts and share the invite code. Only an Admin can appoint Keepers.";
  return crumb() + "<div class='panel'>" +
    panelHead("IV · The Emperor", "Players & Accounts", desc,
      "<button class='btn btn-gold btn-sm' data-act='new-user'>✦ Create account</button>") +
    inviteBox +
    "<h3 style='font-size:20px;margin-bottom:6px'>At the table</h3>" + lines + "</div>";
}

/* ---------- KEEPER TABLE ---------- */
function viewKeeper() {
  var c = cfg();
  return crumb() + "<div class='panel'>" +
    panelHead("II · The High Priestess", "Keeper's Table", "The hub's identity and your resources, in one place.") +
    "<div class='field'><label>Hub title</label><input id='k-title' value='" + esc(c.title || "") + "' placeholder=\"The Keeper's Table\"></div>" +
    "<div class='field'><label>Tagline</label><input id='k-tagline' value='" + esc(c.tagline || "") + "' placeholder='A private circle for players of Call of Cthulhu'></div>" +
    "<button class='btn btn-gold' data-act='save-site'>Save the hub</button>" +
    "<div class='rule'></div><h3 style='font-size:20px'>Resource links</h3>" +
    "<p class='muted tiny'>Point each link at your own copies. Leave a URL blank to show it as “not set.”</p>" +
    "<div class='btn-row' style='margin-top:12px'><button class='btn btn-ghost btn-sm' data-act='edit-resources'>Edit resource links</button></div>" +
    "<div class='rule'></div><h3 style='font-size:20px'>Tidy up</h3>" +
    "<p class='muted tiny'>Remove the example campaign once you've seen how it works.</p>" +
    "<div class='btn-row' style='margin-top:10px'>" +
    ((S.state.campaigns || []).some(function (c) { return c.example; }) ?
      "<button class='btn btn-blood btn-sm' data-act='clear-examples'>Delete example data</button>" :
      "<span class='muted tiny'>No example data remains.</span>") + "</div></div>";
}

/* ---------- MY INVESTIGATORS (self) ---------- */
function myInvestigators() { return (S.state.characters || []).filter(function (c) { return c.ownerId === me().id; }); }
function myInvSummary() {
  var n = myInvestigators().length;
  if (!n) return "Create your own characters, upload a sheet, and switch between them for each campaign.";
  return n + " " + (n === 1 ? "investigator" : "investigators") + " in your keeping — switch between them and keep their sheets to hand.";
}
function campNameOf(cid) { var c = (S.state.campaigns || []).find(function (x) { return x.id === cid; }); return c ? c.name : ""; }
function selInvId() {
  var list = myInvestigators();
  var saved = null; try { saved = localStorage.getItem("kt_sel_inv"); } catch (e) {}
  if (saved && list.some(function (c) { return c.id === saved; })) return saved;
  return list.length ? list[0].id : null;
}
function viewMyInvestigators() {
  var list = myInvestigators();
  var head = panelHead("VII · The Chariot", "My Investigators",
    "Your own characters. Create as many as you like, attach a sheet, and switch between them for each campaign.",
    "<button class='btn btn-gold btn-sm' data-act='new-myinv'>✦ New investigator</button>");
  if (!list.length) {
    return crumb() + "<div class='panel'>" + head +
      emptyState("👤", "No investigators yet",
        "Create one by hand, or make one and upload your character sheet — the app fills in the stat block it can read from a fillable PDF.",
        "<button class='btn btn-gold' data-act='new-myinv'>✦ Create your first investigator</button>") + "</div>";
  }
  var sel = selInvId();
  var chips = list.map(function (c) {
    var on = c.id === sel;
    return "<button class='inv-chip " + (on ? "on" : "") + "' data-sel-inv='" + esc(c.id) + "'>" +
      "<span class='cn'>" + esc(c.name || "Unnamed") + "</span>" +
      "<span class='cc'>" + esc(c.campaignId ? campNameOf(c.campaignId) : "No campaign") + "</span></button>";
  }).join("");
  var ch = list.find(function (c) { return c.id === sel; }) || list[0];
  return crumb() + "<div class='panel'>" + head +
    "<div class='inv-chips'>" + chips + "</div><div class='rule'></div>" + investigatorSheet(ch) + "</div>";
}
function investigatorSheet(ch) {
  var stats = STAT_KEYS.map(function (k) {
    return "<div class='statcell'><div class='k'>" + k + "</div><div class='v'>" + esc((ch.stats && ch.stats[k]) || "—") + "</div></div>";
  }).join("");
  var derived = "<div class='statgrid'>" +
    "<div class='statcell'><div class='k'>Hit Points</div><div class='v'>" + esc(ch.hp || "—") + "</div></div>" +
    "<div class='statcell'><div class='k'>Sanity</div><div class='v'>" + esc(ch.san || "—") + "</div></div>" +
    "<div class='statcell'><div class='k'>Luck</div><div class='v'>" + esc(ch.luck || "—") + "</div></div>" +
    "<div class='statcell'><div class='k'>Move</div><div class='v'>" + esc(ch.mov || "—") + "</div></div></div>";
  var sheetRow = ch.sheetFile ?
    "<div class='sheet-attach'><span class='sa-ico'>📎</span><a href='/api/files/" + esc(ch.sheetFile.id) + "' target='_blank' rel='noopener'>" + esc(ch.sheetFile.name) + "</a>" +
      "<button class='btn btn-blood btn-sm' data-act='del-sheet' data-id='" + esc(ch.id) + "'>Remove</button></div>" :
    "<p class='muted tiny'>No sheet attached. Upload a fillable PDF and the app will try to read your characteristics.</p>";
  return "<div class='inv-head'><div><h3 style='font-size:24px'>" + esc(ch.name || "Unnamed") + "</h3>" +
      "<div class='char-meta'>" + esc(ch.occupation || "") + (ch.age ? " · age " + esc(ch.age) : "") + (ch.campaignId ? " · " + esc(campNameOf(ch.campaignId)) : " · no campaign") + "</div></div>" +
      "<div class='btn-row'>" +
        "<button class='btn btn-ghost btn-sm' data-act='edit-myinv' data-id='" + esc(ch.id) + "'>Edit</button>" +
        "<button class='btn btn-gold btn-sm' data-act='upload-sheet' data-id='" + esc(ch.id) + "'>Upload sheet</button>" +
        "<button class='btn btn-blood btn-sm' data-act='del-myinv' data-id='" + esc(ch.id) + "'>Delete</button></div></div>" +
    "<p class='label' style='color:var(--gold-deep);margin:16px 0 8px'>Investigator at a glance</p>" +
    "<div class='statgrid'>" + stats + "</div>" + derived +
    (ch.skills ? "<div style='margin-top:14px'><p class='label' style='color:var(--gold-deep)'>Skills</p><div class='item body' style='color:var(--ink-soft)'>" + esc(ch.skills) + "</div></div>" : "") +
    (ch.notes ? "<div style='margin-top:14px'><p class='label' style='color:var(--gold-deep)'>Backstory</p><div class='item body' style='color:var(--ink-soft)'>" + esc(ch.notes) + "</div></div>" : "") +
    "<div class='rule'></div><p class='label' style='color:var(--gold-deep)'>Character sheet</p>" + sheetRow;
}

/* ---------- ACCOUNT (self) ---------- */
function viewAccount() {
  var m = me();
  return crumb() + "<div class='panel'>" +
    panelHead("XIX · The Sun", "Your Account", "How you appear at the table, and your key to the door.") +
    "<div class='field'><label>Display name</label><input id='ac-name' value='" + esc(m.displayName || "") + "' placeholder='Your name at the table'></div>" +
    "<div class='field'><label>Username (sign-in)</label><input value='" + esc(m.username || "") + "' disabled></div>" +
    "<button class='btn btn-gold' data-act='save-name'>Save name</button>" +
    "<div class='rule'></div><h3 style='font-size:20px'>Change password</h3>" +
    "<div class='grid2' style='margin-top:10px'>" +
    "<div class='field'><label>Current password</label><input id='ac-cur' type='password' autocomplete='current-password'></div>" +
    "<div class='field'><label>New password</label><input id='ac-new' type='password' autocomplete='new-password'></div></div>" +
    "<button class='btn btn-ghost' data-act='save-pass' style='margin-top:12px'>Change password</button></div>";
}

function footer() {
  return "<div class='foot'><span class='orn'>✦ ☾ ✦</span>Bound by candlelight · Keep your Sanity close</div>";
}

/* ================= MODALS ================= */
var MR = $("#modal-root");
function closeModal() { MR.innerHTML = ""; }
function openModal(title, sub, inner, onSave, saveLabel) {
  MR.innerHTML = "<div class='modal-bg' data-modalbg><div class='modal'>" +
    "<button class='close-x' data-modalclose aria-label='Close'>✕</button>" +
    "<h3>" + esc(title) + "</h3><div class='msub'>" + esc(sub) + "</div>" + inner +
    "<div class='modal-actions'><span></span><div class='btn-row'>" +
    "<button class='btn btn-ghost' data-modalclose>Cancel</button>" +
    "<button class='btn btn-gold' data-modalsave>" + esc(saveLabel || "Save") + "</button></div></div></div></div>";
  MR._onSave = onSave;
  var f = MR.querySelector("input,textarea,select"); if (f) f.focus();
}
MR.addEventListener("click", function (e) {
  if (e.target.hasAttribute("data-modalclose") || e.target.hasAttribute("data-modalbg")) closeModal();
  else if (e.target.hasAttribute("data-modalsave")) { if (MR._onSave) MR._onSave(); }
});
function field(label, id, v, o) {
  o = o || {};
  if (o.opts) return "<div class='field'><label for='" + id + "'>" + label + "</label><select id='" + id + "'>" +
    o.opts.map(function (x) { return "<option value='" + esc(x) + "' " + (x === v ? "selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select>" + (o.hint ? "<div class='hint'>" + esc(o.hint) + "</div>" : "") + "</div>";
  if (o.area) return "<div class='field'><label for='" + id + "'>" + label + "</label><textarea id='" + id + "' placeholder='" + esc(o.ph || "") + "'>" + esc(v || "") + "</textarea>" + (o.hint ? "<div class='hint'>" + esc(o.hint) + "</div>" : "") + "</div>";
  return "<div class='field'><label for='" + id + "'>" + label + "</label><input id='" + id + "' type='" + (o.type || "text") + "' value='" + esc(v || "") + "' placeholder='" + esc(o.ph || "") + "'>" + (o.hint ? "<div class='hint'>" + esc(o.hint) + "</div>" : "") + "</div>";
}
function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }
function checked(id) { var e = document.getElementById(id); return e ? e.checked : false; }

function modalCampaign(existing) {
  var c = existing || {};
  var inner = field("Campaign name", "f-cname", c.name || "", { ph: "The Haunting" }) +
    "<div class='grid2'>" + field("Era", "f-cera", c.era || "1920s", { ph: "1920s" }) +
    field("Status", "f-cstatus", c.status || "planning", { opts: CAMP_STATUS }) + "</div>" +
    field("Card icon", "f-cicon", c.icon || "☗", { hint: "A glyph for the card — e.g. ☗ ☾ ☠ ✦ ⚔ 🜏" }) +
    field("Synopsis", "f-csyn", c.synopsis || "", { area: true, ph: "A hook, a place, a dread…" });
  openModal(existing ? "Edit campaign" : "Open a new campaign", "XVI · The Tower", inner, function () {
    var name = val("f-cname"); if (!name) { toast("A campaign needs a name.", true); return; }
    var body = { name: name, era: val("f-cera") || "1920s", status: val("f-cstatus") || "planning", icon: val("f-cicon") || "☗", synopsis: val("f-csyn") };
    var p = existing ? act("PUT", "/api/campaigns/" + existing.id, body, "Campaign updated.")
                     : act("POST", "/api/campaigns", body, "The chronicle begins.");
    p.then(function (r) { closeModal(); if (r && r.campaign) { S.campaignId = r.campaign.id; render(); } });
  }, existing ? "Update" : "Open campaign");
}
function modalAsset(campaignId, existing) {
  var a = existing || {};
  var inner = field("Title", "f-atitle", a.title || "", { ph: "The Torn Letter" }) +
    field("Kind", "f-akind", a.kind || "Handout", { opts: ASSET_KINDS }) +
    field("Contents", "f-abody", a.body || "", { area: true, ph: "What the investigators read, see, or find…" }) +
    "<div class='field'><label style='display:flex;align-items:center;gap:8px;cursor:pointer'><input type='checkbox' id='f-ahidden' " + (a.hidden ? "checked" : "") + " style='width:auto'> Keeper only (hidden from investigators)</label></div>";
  openModal(existing ? "Edit asset" : "Add an asset", "Handouts · clues · lore", inner, function () {
    var title = val("f-atitle"); if (!title) { toast("Give the asset a title.", true); return; }
    var body = { campaignId: campaignId, title: title, kind: val("f-akind") || "Handout", body: val("f-abody"), hidden: checked("f-ahidden") };
    var p = existing ? act("PUT", "/api/assets/" + existing.id, body, "Asset saved.") : act("POST", "/api/assets", body, "Asset saved.");
    p.then(closeModal);
  }, existing ? "Update" : "Add asset");
}
function modalChar(campaignId, existing) {
  var ch = existing || {}; var st = ch.stats || {};
  var statFields = "<div class='grid4'>" + STAT_KEYS.map(function (k) { return field(k, "f-st-" + k, st[k] || "", { ph: "50" }); }).join("") + "</div>";
  var inner = field("Name", "f-chname", ch.name || "", { ph: "Prof. Henry Armitage" }) +
    "<div class='grid2'>" + field("Type", "f-chkind", ch.kind || "Investigator", { opts: ["Investigator", "NPC"] }) +
    field("Player", "f-chplayer", ch.player || "", { ph: "(for investigators)" }) + "</div>" +
    "<div class='grid2'>" + field("Occupation", "f-chocc", ch.occupation || "", { ph: "Professor" }) +
    field("Age", "f-chage", ch.age || "", { ph: "52" }) + "</div>" +
    "<p class='label' style='color:var(--gold-deep);margin:6px 0 8px'>Characteristics</p>" + statFields +
    "<div class='grid4' style='margin-top:10px'>" + field("HP", "f-chhp", ch.hp || "") + field("SAN", "f-chsan", ch.san || "") + field("Luck", "f-chluck", ch.luck || "") + field("MOV", "f-chmov", ch.mov || "") + "</div>" +
    field("Notes / backstory", "f-chnotes", ch.notes || "", { area: true }) +
    "<div class='field'><label style='display:flex;align-items:center;gap:8px;cursor:pointer'><input type='checkbox' id='f-chhidden' " + (ch.hidden ? "checked" : "") + " style='width:auto'> Keeper only (hidden NPC)</label></div>";
  openModal(existing ? "Edit character" : "Add a character", "Investigators & NPCs", inner, function () {
    var name = val("f-chname"); if (!name) { toast("Every soul needs a name.", true); return; }
    var stats = {}; STAT_KEYS.forEach(function (k) { var v = val("f-st-" + k); if (v) stats[k] = v; });
    var body = { campaignId: campaignId, name: name, kind: val("f-chkind") || "Investigator", player: val("f-chplayer"),
      occupation: val("f-chocc"), age: val("f-chage"), stats: stats, hp: val("f-chhp"), san: val("f-chsan"), luck: val("f-chluck"), mov: val("f-chmov"), notes: val("f-chnotes"), hidden: checked("f-chhidden") };
    var p = existing ? act("PUT", "/api/characters/" + existing.id, body, "Character recorded.") : act("POST", "/api/characters", body, "Character recorded.");
    p.then(closeModal);
  }, existing ? "Update" : "Add character");
}
function modalResources() {
  var links = (cfg().links && cfg().links.length) ? cfg().links : defaultLinks();
  var rows = links.map(function (l, i) {
    return "<div style='border:1px solid rgba(156,127,55,.35);border-radius:7px;padding:12px;margin-bottom:10px'>" +
      "<div class='grid2'>" + field("Label", "f-l-label-" + i, l.label || "") + field("Icon", "f-l-icon-" + i, l.icon || "❖") + "</div>" +
      field("URL", "f-l-url-" + i, l.url || "", { ph: "https://…  (leave blank if none yet)" }) +
      field("Note", "f-l-note-" + i, l.note || "") + "</div>";
  }).join("");
  openModal("Resource links", "Point each at your own copies", "<div style='max-height:52vh;overflow-y:auto;padding-right:4px'>" + rows + "</div>", function () {
    var out = links.map(function (l, i) { return { label: val("f-l-label-" + i) || l.label, icon: val("f-l-icon-" + i) || "❖", url: val("f-l-url-" + i), note: val("f-l-note-" + i) }; });
    act("PUT", "/api/config", { links: out }, "Resources updated.").then(closeModal);
  }, "Save links");
}
function modalPoll() {
  var inner = field("Poll title", "f-ptitle", "", { ph: "October sessions" }) +
    "<p class='label' style='color:var(--gold-deep);margin:6px 0 8px'>Candidate dates</p>" +
    [0, 1, 2, 3, 4].map(function (i) { return field("Date " + (i + 1), "f-pd-" + i, "", { type: "date" }); }).join("") +
    "<div class='hint'>Leave any blank. Players vote yes / maybe / no on each.</div>";
  openModal("Propose session dates", "XVIII · The Moon", inner, function () {
    var dates = [];
    [0, 1, 2, 3, 4].forEach(function (i) {
      var v = val("f-pd-" + i);
      if (v) { var dt = new Date(v + "T00:00"); dates.push({ id: "d" + i + "_" + v.replace(/-/g, ""), iso: v, label: dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) }); }
    });
    if (!dates.length) { toast("Add at least one date.", true); return; }
    act("POST", "/api/polls", { title: val("f-ptitle") || "Session dates", dates: dates }, "Dates proposed.").then(closeModal);
  }, "Propose dates");
}
function modalRoster() {
  openModal("Add someone to the roster", "Mark availability on their behalf", field("Name", "f-rn", "", { ph: "A player without an account" }), function () {
    var n = val("f-rn"); if (!n) { toast("Give them a name.", true); return; }
    act("POST", "/api/avail", { name: n }, n + " added.").then(closeModal);
  }, "Add");
}
function roleFromLabel(l) { return l === "Admin" ? "admin" : l === "Keeper" ? "keeper" : "investigator"; }
function modalNewUser() {
  var roleField = isAdmin()
    ? field("Role", "f-un-role", "Investigator", { opts: ["Investigator", "Keeper", "Admin"], hint: "Keepers run games & see secrets. Admins also manage accounts and roles." })
    : "";
  var inner = field("Display name", "f-un-name", "", { ph: "Shown at the table" }) +
    field("Username", "f-un-user", "", { ph: "for signing in", hint: "3–24 letters, numbers, or . _ -" }) +
    field("Starting password", "f-un-pass", "", { hint: "At least 6 characters — hand it to them; they can change it." }) +
    roleField;
  openModal("Create an account", "IV · The Emperor", inner, function () {
    var role = isAdmin() ? roleFromLabel(val("f-un-role")) : "investigator";
    var body = { username: val("f-un-user"), password: val("f-un-pass"), displayName: val("f-un-name"), role: role };
    if (!body.username || !body.password) { toast("Username and password are required.", true); return; }
    act("POST", "/api/users", body, "Account created.").then(closeModal);
  }, "Create account");
}
function modalEditUser(u) {
  var isSelf = u.id === me().id;
  var roleField = isAdmin()
    ? field("Role", "f-eu-role", roleLabel(u.role), { opts: ["Investigator", "Keeper", "Admin"], hint: isSelf ? "You can't remove your own last Admin role." : "Admins can assign Keepers and other Admins." })
    : "<div class='field'><label>Role</label><input value='" + esc(roleLabel(u.role)) + "' disabled><div class='hint'>Only an Admin can change roles.</div></div>";
  var inner = field("Display name", "f-eu-name", u.displayName || "") +
    "<div class='field'><label>Username</label><input value='" + esc(u.username) + "' disabled></div>" +
    roleField +
    field("Reset password", "f-eu-pass", "", { type: "password", hint: "Leave blank to keep their current password." });
  var extra = isSelf ? "" : "<div class='field'><button class='btn btn-blood btn-sm' data-deluser='" + esc(u.id) + "'>Delete this account</button></div>";
  openModal("Manage " + (u.displayName || u.username), "@" + u.username, inner + extra, function () {
    var body = { displayName: val("f-eu-name") };
    if (isAdmin()) body.role = roleFromLabel(val("f-eu-role"));
    var pw = val("f-eu-pass"); if (pw) body.password = pw;
    act("PUT", "/api/users/" + u.id, body, "Account updated.").then(closeModal);
  }, "Save");
}

function modalOwnedChar(existing) {
  var ch = existing || {}; var st = ch.stats || {};
  var camps = (S.state.campaigns || []);
  var campOpts = ["— None —"].concat(camps.map(function (c) { return c.name; }));
  var curCamp = ch.campaignId ? ((camps.find(function (c) { return c.id === ch.campaignId; }) || {}).name || "— None —") : "— None —";
  var statFields = "<div class='grid4'>" + STAT_KEYS.map(function (k) { return field(k, "f-mi-st-" + k, st[k] || "", { ph: "50" }); }).join("") + "</div>";
  var inner = field("Name", "f-mi-name", ch.name || "", { ph: "Eleanor Vance" }) +
    "<div class='grid2'>" + field("Occupation", "f-mi-occ", ch.occupation || "", { ph: "Journalist" }) + field("Age", "f-mi-age", ch.age || "", { ph: "29" }) + "</div>" +
    field("Campaign", "f-mi-camp", curCamp, { opts: campOpts, hint: "Which chronicle this investigator belongs to." }) +
    "<p class='label' style='color:var(--gold-deep);margin:6px 0 8px'>Characteristics</p>" + statFields +
    "<div class='grid4' style='margin-top:10px'>" + field("HP", "f-mi-hp", ch.hp || "") + field("SAN", "f-mi-san", ch.san || "") + field("Luck", "f-mi-luck", ch.luck || "") + field("MOV", "f-mi-mov", ch.mov || "") + "</div>" +
    field("Skills", "f-mi-skills", ch.skills || "", { area: true, ph: "Spot Hidden 45%, Library Use 60%, Firearms (Handgun) 40%…" }) +
    field("Backstory / notes", "f-mi-notes", ch.notes || "", { area: true });
  openModal(existing ? "Edit investigator" : "New investigator", "VII · The Chariot", inner, function () {
    var name = val("f-mi-name"); if (!name) { toast("Your investigator needs a name.", true); return; }
    var stats = {}; STAT_KEYS.forEach(function (k) { var v = val("f-mi-st-" + k); if (v) stats[k] = v; });
    var cn = val("f-mi-camp"); var camp = camps.find(function (c) { return c.name === cn; });
    var body = { name: name, occupation: val("f-mi-occ"), age: val("f-mi-age"), campaignId: camp ? camp.id : "", stats: stats,
      hp: val("f-mi-hp"), san: val("f-mi-san"), luck: val("f-mi-luck"), mov: val("f-mi-mov"), skills: val("f-mi-skills"), notes: val("f-mi-notes") };
    var p = existing ? act("PUT", "/api/my/characters/" + existing.id, body, "Investigator saved.") : act("POST", "/api/my/characters", body, "Investigator created.");
    p.then(function (r) { closeModal(); if (r && r.character) { try { localStorage.setItem("kt_sel_inv", r.character.id); } catch (e) {} S.view = "myinv"; render(); } });
  }, existing ? "Save" : "Create");
}
function uploadSheet(charId) {
  var inp = document.createElement("input");
  inp.type = "file";
  inp.accept = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";
  inp.onchange = function () {
    var file = inp.files && inp.files[0]; if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast("That file is over 8 MB.", true); return; }
    toast("Reading your sheet…");
    var rd = new FileReader();
    rd.onload = function () {
      var ct = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "");
      act("POST", "/api/my/characters/" + charId + "/sheet", { filename: file.name, contentType: ct, dataBase64: String(rd.result), autofill: true })
        .then(function (r) {
          if (r && r.filled && r.filled.length) toast("Filled " + r.filled.join(", ") + " from your sheet.");
          else toast("Sheet attached. Couldn't auto-read the stats — type them in with Edit.");
        }).catch(function () {});
    };
    rd.onerror = function () { toast("Couldn't read that file.", true); };
    rd.readAsDataURL(file);
  };
  inp.click();
}

function uploadMap(campaignId) {
  var inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif";
  inp.onchange = function () {
    var f = inp.files && inp.files[0]; if (!f) return;
    if (f.size > 9 * 1024 * 1024) { toast("That image is over 9 MB.", true); return; }
    toast("Uploading map…");
    var rd = new FileReader();
    rd.onload = function () {
      var name = f.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Map";
      var ct = f.type || (/\.png$/i.test(f.name) ? "image/png" : "image/jpeg");
      act("POST", "/api/maps", { campaignId: campaignId, name: name, contentType: ct, dataBase64: String(rd.result) }, "Map uploaded.")
        .then(function (r) { if (r && r.map) { S.mapId = r.map.id; render(); } });
    };
    rd.onerror = function () { toast("Couldn't read that image.", true); };
    rd.readAsDataURL(f);
  };
  inp.click();
}
var TOKEN_COLOR_NAMES = { Crimson: "#c23d4a", Teal: "#4a938a", Gold: "#c8a951", Violet: "#6a5acd", Green: "#3f7d3f", Amber: "#b5651d", Oxblood: "#8f2531", Blue: "#2e6f9e" };
function modalAddToken(mapId, campaignId) {
  var chars = (S.state.characters || []).filter(function (c) { return c.campaignId === campaignId; });
  var opts = ["— Custom pin —"].concat(chars.map(function (c) { return c.name + (c.kind === "NPC" ? " (NPC)" : ""); }));
  var inner = field("Token from", "f-tk-char", opts[0], { opts: opts, hint: "Link to a character so its player can move it, or make a custom pin." }) +
    field("Label (for a custom pin)", "f-tk-label", "", { ph: "Cultist, Door, Clue…" }) +
    field("Colour", "f-tk-color", "Crimson", { opts: Object.keys(TOKEN_COLOR_NAMES) });
  openModal("Add a token", "It drops in the centre — drag to place it", inner, function () {
    var pick = val("f-tk-char");
    var body = { mapId: mapId, x: 0.5, y: 0.5, color: TOKEN_COLOR_NAMES[val("f-tk-color")] || "#c23d4a" };
    if (pick && pick !== "— Custom pin —") {
      var ch = chars[opts.indexOf(pick) - 1];
      if (ch) { body.label = ch.name; body.characterId = ch.id; body.ownerId = ch.ownerId || null; }
    } else { body.label = val("f-tk-label") || "Pin"; }
    act("POST", "/api/tokens", body, "Token added.").then(closeModal);
  }, "Add token");
}
function modalPlaceMe(mapId) {
  var list = myInvestigators();
  if (list.length === 1) { act("POST", "/api/my/tokens", { mapId: mapId, characterId: list[0].id, x: 0.5, y: 0.5 }, "Placed " + list[0].name + ". Drag to move."); return; }
  var opts = list.map(function (c) { return c.name; });
  openModal("Place my investigator", "Which one joins the map?", field("Investigator", "f-pm", opts[0], { opts: opts }), function () {
    var ch = list.find(function (c) { return c.name === val("f-pm"); });
    if (!ch) { toast("Pick one.", true); return; }
    act("POST", "/api/my/tokens", { mapId: mapId, characterId: ch.id, x: 0.5, y: 0.5 }, "Placed " + ch.name + ". Drag to move.").then(closeModal);
  }, "Place");
}
function modalRenameMap(map) {
  if (!map) return;
  openModal("Rename map", esc(map.name || ""), field("Name", "f-mn", map.name || ""), function () {
    act("PUT", "/api/maps/" + map.id, { name: val("f-mn") }, "Renamed.").then(closeModal);
  }, "Save");
}

/* ================= EVENTS ================= */
document.addEventListener("click", function (e) {
  var deluser = e.target.closest("[data-deluser]");
  if (deluser) { var uid = deluser.getAttribute("data-deluser"); confirmDel("Delete this account? Their availability and votes go too.", function () { return act("DELETE", "/api/users/" + uid, null, "Account deleted."); }); return; }
  var nav = e.target.closest("[data-nav]");
  if (nav) { go(nav.getAttribute("data-nav")); return; }
  var oc = e.target.closest("[data-open-camp]");
  if (oc) { S.campaignId = oc.getAttribute("data-open-camp"); S.campTab = "assets"; render(); window.scrollTo(0, 0); return; }
  var tab = e.target.closest("[data-tab]");
  if (tab) { S.campTab = tab.getAttribute("data-tab"); render(); return; }
  var seli = e.target.closest("[data-sel-inv]");
  if (seli) { try { localStorage.setItem("kt_sel_inv", seli.getAttribute("data-sel-inv")); } catch (x) {} render(); return; }
  var selm = e.target.closest("[data-sel-map]");
  if (selm) { S.mapId = selm.getAttribute("data-sel-map"); render(); return; }
  var cell = e.target.closest("[data-cell]");
  if (cell && !cell.disabled) { toggleCell(cell.getAttribute("data-cell")); return; }
  var vote = e.target.closest("[data-vote]");
  if (vote && !vote.disabled) { castVote(vote.getAttribute("data-vote")); return; }
  var a = e.target.closest("[data-act]");
  if (a) { handleAct(a.getAttribute("data-act"), a.getAttribute("data-id")); return; }
});
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

/* ---- token dragging (pointer events, delegated) ---- */
var drag = null;
document.addEventListener("pointerdown", function (e) {
  if (e.target.closest(".tk-x")) return; // let the remove button work
  var tk = e.target.closest(".token.draggable");
  if (!tk) return;
  var stage = tk.closest(".map-stage");
  if (!stage) return;
  e.preventDefault();
  var rect = stage.getBoundingClientRect();
  drag = { id: tk.getAttribute("data-token-id"), el: tk, rect: rect, moved: false, lastX: 0, lastY: 0 };
  S.dragging = true;
  tk.classList.add("dragging");
  try { tk.setPointerCapture(e.pointerId); } catch (x) {}
});
document.addEventListener("pointermove", function (e) {
  if (!drag) return;
  var x = (e.clientX - drag.rect.left) / drag.rect.width;
  var y = (e.clientY - drag.rect.top) / drag.rect.height;
  x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y));
  drag.el.style.left = (x * 100) + "%";
  drag.el.style.top = (y * 100) + "%";
  drag.lastX = x; drag.lastY = y; drag.moved = true;
});
function endDrag() {
  if (!drag) return;
  var dd = drag; drag = null; S.dragging = false;
  if (dd.el) dd.el.classList.remove("dragging");
  if (dd.moved) {
    api("PUT", "/api/tokens/" + dd.id + "/move", { x: dd.lastX, y: dd.lastY })
      .then(function () { refresh(); }).catch(function () { refresh(); });
  }
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

function go(v) {
  if ((v === "keeper" || v === "players") && !isKeeper()) return;
  S.view = v; S.campaignId = null; render(); window.scrollTo(0, 0);
}

function toggleCell(key) {
  var mine = myAvail();
  var cells = {};
  if (mine && mine.cells) for (var k in mine.cells) cells[k] = mine.cells[k];
  if (cells[key]) delete cells[key]; else cells[key] = true;
  // optimistic paint
  if (mine) mine.cells = cells;
  else { S.state.avail.push({ id: "tmp", userId: me().id, name: me().displayName, cells: cells }); }
  render();
  api("PUT", "/api/avail/me", { cells: cells }).then(refresh).catch(function (e) { if (e.message !== "auth") { toast(e.message, true); refresh(); } });
}
function castVote(spec) {
  var parts = spec.split("|"); var pollId = parts[0], dateId = parts[1], choice = parts[2];
  var ex = (S.state.votes || []).find(function (v) { return v.pollId === pollId && v.userId === me().id; });
  var choices = {};
  if (ex && ex.choices) for (var k in ex.choices) choices[k] = ex.choices[k];
  if (choices[dateId] === choice) delete choices[dateId]; else choices[dateId] = choice;
  if (ex) ex.choices = choices; else S.state.votes.push({ id: "tmp", pollId: pollId, userId: me().id, name: me().displayName, choices: choices });
  render();
  api("PUT", "/api/votes/" + pollId, { choices: choices }).then(refresh).catch(function (e) { if (e.message !== "auth") { toast(e.message, true); refresh(); } });
}

function handleAct(act_, id) {
  var camps = S.state.campaigns || [], assets = S.state.assets || [], chars = S.state.characters || [], users = S.state.users || [];
  switch (act_) {
    case "logout": api("POST", "/api/logout").then(function () { location.href = "/login"; }); break;
    case "new-campaign": modalCampaign(null); break;
    case "edit-campaign": modalCampaign(camps.find(function (c) { return c.id === id; })); break;
    case "del-campaign": confirmDel("Delete this campaign and all its assets & characters?", function () {
        return act("DELETE", "/api/campaigns/" + id, null, "Campaign struck from the record.").then(function () { S.campaignId = null; S.view = "campaigns"; render(); });
      }); break;
    case "new-asset": modalAsset(id, null); break;
    case "edit-asset": { var a = assets.find(function (x) { return x.id === id; }); modalAsset(a.campaignId, a); } break;
    case "del-asset": confirmDel("Delete this asset?", function () { return act("DELETE", "/api/assets/" + id, null, "Asset removed."); }); break;
    case "new-char": modalChar(id, null); break;
    case "edit-char": { var c = chars.find(function (x) { return x.id === id; }); modalChar(c.campaignId, c); } break;
    case "del-char": confirmDel("Delete this character?", function () { return act("DELETE", "/api/characters/" + id, null, "Character removed."); }); break;
    case "save-secret": act("PUT", "/api/secrets/" + id, { notes: val("secret-notes") }, "Secrets sealed."); break;
    case "new-poll": modalPoll(); break;
    case "toggle-poll": { var p = (S.state.polls || []).find(function (x) { return x.id === id; }); act("PUT", "/api/polls/" + id, { closed: !p.closed }); } break;
    case "del-poll": confirmDel("Delete this poll and its votes?", function () { return act("DELETE", "/api/polls/" + id, null, "Poll removed."); }); break;
    case "add-roster": modalRoster(); break;
    case "del-avail": confirmDel("Remove this person from the roster?", function () { return act("DELETE", "/api/avail/" + id, null, "Removed."); }); break;
    case "edit-resources": modalResources(); break;
    case "save-site": act("PUT", "/api/config", { title: val("k-title"), tagline: val("k-tagline") }, "Hub saved."); break;
    case "clear-examples": confirmDel("Delete the example campaign and its contents?", function () {
        var ex = camps.filter(function (c) { return c.example; });
        return Promise.all(ex.map(function (c) { return api("DELETE", "/api/campaigns/" + c.id); })).then(function () { return refresh(); }).then(function () { toast("Example data cleared."); });
      }); break;
    case "new-myinv": modalOwnedChar(null); break;
    case "edit-myinv": modalOwnedChar((S.state.characters || []).find(function (c) { return c.id === id; })); break;
    case "del-myinv": confirmDel("Delete this investigator and its sheet?", function () {
        return act("DELETE", "/api/my/characters/" + id, null, "Investigator laid to rest.").then(function () { try { localStorage.removeItem("kt_sel_inv"); } catch (x) {} });
      }); break;
    case "upload-sheet": uploadSheet(id); break;
    case "del-sheet": confirmDel("Remove the attached sheet?", function () { return act("DELETE", "/api/my/characters/" + id + "/sheet", null, "Sheet removed."); }); break;
    case "upload-map": uploadMap(id); break;
    case "add-token": { var mp0 = (S.state.maps || []).find(function (m) { return m.id === id; }); modalAddToken(id, mp0 ? mp0.campaignId : S.campaignId); } break;
    case "toggle-grid": { var mp1 = (S.state.maps || []).find(function (m) { return m.id === id; }); if (mp1) act("PUT", "/api/maps/" + id, { gridOn: !mp1.gridOn }); } break;
    case "rename-map": modalRenameMap((S.state.maps || []).find(function (m) { return m.id === id; })); break;
    case "del-map": confirmDel("Delete this map and its tokens?", function () { return act("DELETE", "/api/maps/" + id, null, "Map removed.").then(function () { S.mapId = null; }); }); break;
    case "place-me": modalPlaceMe(id); break;
    case "del-token": act("DELETE", "/api/tokens/" + id, null, "Token removed."); break;
    case "del-my-token": act("DELETE", "/api/my/tokens/" + id, null, "Token removed."); break;
    case "new-user": modalNewUser(); break;
    case "edit-user": modalEditUser(users.find(function (u) { return u.id === id; })); break;
    case "edit-invite": modalInvite(); break;
    case "save-name": act("PUT", "/api/account/name", { displayName: val("ac-name") }, "Name saved."); break;
    case "save-pass": {
      var cur = val("ac-cur"), nw = val("ac-new");
      if (!cur || !nw) { toast("Fill in both password fields.", true); return; }
      act("PUT", "/api/account/password", { current: cur, next: nw }, "Password changed.").then(function () { var a = document.getElementById("ac-cur"), b = document.getElementById("ac-new"); if (a) a.value = ""; if (b) b.value = ""; });
    } break;
  }
}
function modalInvite() {
  var c = cfg();
  var inner = field("Invite code", "f-inv-code", c.inviteCode || "", { ph: "e.g. ARKHAM-1923", hint: "Players enter this to create their own account." }) +
    "<div class='field'><label style='display:flex;align-items:center;gap:8px;cursor:pointer'><input type='checkbox' id='f-inv-on' " + (c.inviteEnabled ? "checked" : "") + " style='width:auto'> Allow sign-up with this code</label></div>";
  openModal("Invite-code sign-up", "IV · The Emperor", inner, function () {
    act("PUT", "/api/config", { inviteCode: val("f-inv-code"), inviteEnabled: checked("f-inv-on") }, "Invite settings saved.").then(closeModal);
  }, "Save");
}

function confirmDel(msg, fn) {
  openModal("Are you certain?", "This cannot be undone", "<p style='color:var(--ink-soft);font-size:16px'>" + esc(msg) + "</p>", function () {
    closeModal(); Promise.resolve(fn()).catch(function () {});
  }, "Delete");
  var b = MR.querySelector("[data-modalsave]"); if (b) { b.classList.remove("btn-gold"); b.classList.add("btn-blood"); }
}

/* ================= BOOT ================= */
refresh().catch(function (e) { if (e.message !== "auth") app().innerHTML = "<div class='wrap'><div class='loading'>The table could not be reached. Refresh to try again.</div></div>"; });
// gentle live-ish refresh so players see each other's marks & votes
setInterval(function () { if (S.dragging || MR.innerHTML) return; refresh().catch(function () {}); }, 20000);
// faster refresh while a battle map is open, so token moves feel near-live
setInterval(function () {
  if (S.dragging || MR.innerHTML) return;
  if (S.view === "campaigns" && S.campaignId && S.campTab === "map") refresh().catch(function () {});
}, 5000);

})();
