/* Appli partagée JDR Pokémon avec Ryo — GitHub Pages + Supabase.
   Tout l'affichage est CALCULÉ depuis les données de la base.
   Bilingue par construction : aucun repli sur le français côté Ryo. */
(function () {
"use strict";

/* ================= Config & état ================= */
var CFG = window.APP_CONFIG || {};
var REST = (CFG.SUPABASE_URL || "") + "/rest/v1";
var HEADERS = { "apikey": CFG.SUPABASE_ANON_KEY || "", "Authorization": "Bearer " + (CFG.SUPABASE_ANON_KEY || "") };
var LS_PLAYER = "jdr-ryo-player", LS_DICE = "jdr-ryo-dice";

var DB = null;            // données chargées
var me = null;            // 'julien' | 'ryo'
var lang = "fr";          // 'fr' | 'jp'
var tab = "home";
var teamView = null;      // joueur affiché dans le menu d'équipe
var openPassport = null;  // slug du passeport déplié
var storeOpen = {};       // dépôt/pension dépliés par joueur
var mapTf = { k: 1, x: 0, y: 0 };

var EXTRA = {
  fr: { changePlayer: "Changer de joueur", loading: "Chargement de la partie…", loadError: "Impossible de charger la partie. Vérifie ta connexion, puis réessaie.",
        retry: "Réessayer", hp: "PV", money: "₽", turnW: "Tour", chapterW: "Chapitre", situation: "Situation actuelle",
        noText: "Texte non disponible.", hereYou: "Vous êtes ici", nextDest: "Prochaine destination", seenInDex: "vu au Pokédex",
        allRoll: null, rollOne: "Lancer", teamTitle: "Équipes", rolledStats: "Statistiques de campagne (dés archivés)", diceArchived: "dés lancés", nat20: "20 naturels", nat1: "1 naturels",
        sendFail: "Envoi impossible — réessaie dans un instant.", sending: "Envoi…", myAction: "Mon action", otherAction: "Action de {name}",
        questDone: "Terminées", noJpReso: "La version japonaise de ce tour n'est pas encore disponible.", searchNpc: "Rechercher un personnage…",
        atGym: "Arène", champion: "Champion", noPlaceImg: "Illustration à venir pour ce lieu.", albumNote: "Les compagnons du voyage, tels qu'ils sont aujourd'hui." },
  jp: { changePlayer: "プレイヤーを変更", loading: "セーブデータを読み込み中…", loadError: "データを読み込めませんでした。接続を確認して、もう一度お試しください。",
        retry: "再試行", hp: "HP", money: "円", turnW: "ターン", chapterW: "チャプター", situation: "現在の状況",
        noText: "テキストがありません。", hereYou: "現在地", nextDest: "次の目的地", seenInDex: "図鑑に登録",
        rollOne: "振る", teamTitle: "チーム", rolledStats: "キャンペーン統計（記録済みダイス）", diceArchived: "振ったダイス", nat20: "自然な20", nat1: "自然な1",
        sendFail: "送信できませんでした — 少し待ってからもう一度どうぞ。", sending: "送信中…", myAction: "自分のアクション", otherAction: "{name}のアクション",
        questDone: "完了済み", noJpReso: "このターンの日本語版はまだ用意されていません。", searchNpc: "キャラクターを検索…",
        atGym: "ジム", champion: "ジムリーダー", noPlaceImg: "この場所のイラストは準備中です。", albumNote: "旅の仲間たち、今の姿。" }
};
function T(k) { var d = (window.I18N && window.I18N[lang]) || {}; if (d[k] != null) return d[k]; var e = EXTRA[lang] || {}; return e[k] != null ? e[k] : k; }
function X(k) { var e = EXTRA[lang] || {}; return e[k] != null ? e[k] : k; }

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
/* Contenu bilingue : JAMAIS de repli croisé. Retourne null si absent dans la langue. */
function pick(o) { if (!o || typeof o !== "object") return null; var v = o[lang]; return (typeof v === "string" && v.trim()) ? v : null; }
function pickOr(o, fallback) { var v = pick(o); return v != null ? v : fallback; }
function nameOf(slug) { if (slug === "julien") return lang === "jp" ? "ジュリアン" : "Julien"; if (slug === "ryo") return lang === "jp" ? "リョウ" : "Ryo"; return slug; }
function speciesName(dex, frName) {
  var e = (dex && window.DEX_NAMES && window.DEX_NAMES[dex]) || (dex && window.DEX_NAT && window.DEX_NAT[dex]);
  if (e) return lang === "jp" ? e[1] : e[0];
  return lang === "jp" ? null : frName;
}
/* Les espèces sont stockées en objet bilingue {fr, jp} (ou chaîne FR héritée). */
function spFr(s) { if (!s) return ""; return typeof s === "string" ? s : (s.fr || ""); }
function spName(dex, s) { if (s && typeof s === "object") { var v = pick(s); if (v) return v; } return speciesName(dex, spFr(s)); }
function spriteOf(dex) { return dex ? "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/emerald/" + dex + ".png" : ""; }
function dexImg(dex) { return dex ? "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/" + dex + ".png" : ""; }

/* ================= Supabase ================= */
function sbGet(path) {
  return fetch(REST + path, { headers: HEADERS }).then(function (r) {
    if (!r.ok) throw new Error("GET " + path + " -> " + r.status);
    return r.json();
  });
}
function sbPost(table, row) {
  return fetch(REST + "/" + table, { method: "POST", headers: Object.assign({}, HEADERS, { "Content-Type": "application/json", "Prefer": "return=representation" }), body: JSON.stringify(row) })
    .then(function (r) { if (!r.ok) throw new Error("POST " + table + " -> " + r.status); return r.json(); });
}
function loadAll() {
  return Promise.all([
    sbGet("/game_state?id=eq.1&select=data"),
    sbGet("/characters?select=slug,data"),
    sbGet("/npcs?select=data"),
    sbGet("/pokemon?select=trainer_slug,species,data"),
    sbGet("/items?select=owner_slug,data"),
    sbGet("/objectives?select=data"),
    sbGet("/encounters?select=data"),
    sbGet("/resolutions?select=turn_number,data&order=turn_number.asc"),
    sbGet("/journal?select=data&order=id.asc")
  ]).then(function (res) {
    var chars = {}; res[1].forEach(function (r) { chars[r.slug] = r.data; });
    DB = {
      state: res[0][0] ? res[0][0].data : {},
      characters: chars,
      npcs: res[2].map(function (r) { return r.data; }),
      pokemon: res[3].map(function (r) { var d = r.data || {}; if (!d.trainer && r.trainer_slug) d.trainer = r.trainer_slug; return d; }),
      items: res[4].map(function (r) { var d = r.data || {}; if (!d.owner && r.owner_slug) d.owner = r.owner_slug; return d; }),
      objectives: res[5].map(function (r) { return r.data; }),
      encounters: res[6].map(function (r) { return r.data; }),
      resolutions: res[7].map(function (r) { var d = r.data || {}; d.turn = r.turn_number; return d; }),
      journal: res[8].map(function (r) { return r.data; }),
      actions: []
    };
    return loadActions();
  });
}
function loadActions() {
  var turn = DB && DB.state ? DB.state.turn : 0;
  return sbGet("/player_actions?select=turn_number,trainer_slug,text,status,created_at&turn_number=eq." + turn + "&order=created_at.asc")
    .then(function (rows) { DB.actions = rows; })
    .catch(function () { DB.actions = DB.actions || []; });
}

/* ================= Démarrage / joueur ================= */
var $ = function (id) { return document.getElementById(id); };
function setPlayer(slug, reload) {
  me = slug; lang = slug === "ryo" ? "jp" : "fr";
  document.body.setAttribute("data-player", slug);
  localStorage.setItem(LS_PLAYER, slug);
  teamView = slug; bagView = slug; tab = "home"; openPassport = null;
  $("entry").hidden = true; $("loading").hidden = false;
  $("loadingTxt").textContent = X("loading");
  loadAll().then(function () {
    $("loading").hidden = true; $("app").hidden = false; $("mainNav").hidden = false;
    var sw = $("switchPlayer"); sw.hidden = false; sw.textContent = X("changePlayer");
    buildNav(); renderBrand(); render();
  }).catch(function (e) {
    $("loading").innerHTML = '<p class="muted">' + esc(X("loadError")) + '</p><button class="btn" onclick="location.reload()">' + esc(X("retry")) + "</button>";
    console.error(e);
  });
}
function showEntry() {
  me = null; localStorage.removeItem(LS_PLAYER);
  document.body.removeAttribute("data-player");
  $("app").hidden = true; $("mainNav").hidden = true; $("switchPlayer").hidden = true;
  $("loading").hidden = true; $("entry").hidden = false;
  $("brandTitle").textContent = "Pokémon Neko";
  $("brandSub").textContent = "";
}
$("pickJulien").addEventListener("click", function () { setPlayer("julien"); });
$("pickRyo").addEventListener("click", function () { setPlayer("ryo"); });
$("switchPlayer").addEventListener("click", showEntry);

var TABS = [
  ["home", "tabhome", "🏠"], ["teams", "tabteams", "🎒"], ["chars", "tabchars", "🧑‍🤝‍🧑"],
  ["bag", "tabbag", "🎁"], ["quests", "tabquests", "🗺️"], ["map", "tabmap", "🧭"],
  ["enc", "tabenc", "👀"], ["journal", "tabjournal", "📖"], ["dex", "tabdex", "📕"]
];
function buildNav() {
  $("mainNav").innerHTML = TABS.map(function (tb) {
    return '<button type="button" data-tab="' + tb[0] + '" class="' + (tab === tb[0] ? "on" : "") + '"><span class="ni">' + tb[2] + '</span>' + esc(T(tb[1])) + "</button>";
  }).join("");
  Array.prototype.forEach.call($("mainNav").querySelectorAll("button"), function (b) {
    b.addEventListener("click", function () { tab = b.getAttribute("data-tab"); buildNav(); renderBrand(); render(); window.scrollTo(0, 0); document.querySelector(".dex-screen").scrollTop = 0; });
  });
}
function renderBrand() {
  $("brandTitle").textContent = lang === "jp" ? "ポケモン クマ" : "Pokémon Neko";
  var lbl = TABS.filter(function (tb) { return tb[0] === tab; })[0];
  var st = DB.state;
  $("brandSub").textContent = (lbl ? T(lbl[1]) : "") + " · " + X("chapterW") + " " + st.chapter + " · " + X("turnW") + " " + (lang === "jp" ? "第" + st.turn + "ターン" : "n°" + st.turn);
  $("footNote").textContent = T("footer") || "";
}
function render() {
  renderBrand();
  var v = $("view");
  if (tab === "home") v.innerHTML = viewHome();
  else if (tab === "teams") v.innerHTML = viewTeams();
  else if (tab === "chars") v.innerHTML = viewChars();
  else if (tab === "bag") v.innerHTML = viewBag();
  else if (tab === "quests") v.innerHTML = viewQuests();
  else if (tab === "map") { v.innerHTML = viewMap(); initMap(); }
  else if (tab === "enc") v.innerHTML = viewEnc();
  else if (tab === "journal") v.innerHTML = viewJournal();
  else if (tab === "dex") v.innerHTML = viewDex();
  bindView();
}

/* ================= Helpers données ================= */
function lastReso() { return DB.resolutions.length ? DB.resolutions[DB.resolutions.length - 1] : null; }
function teamOf(slug, loc) { return DB.pokemon.filter(function (p) { return p.trainer === slug && (!loc || p.location === loc); }); }
function charOf(slug) { return DB.characters[slug]; }
function parseDiceLine(line) {
  var m = line.match(/^(.+?)\s*\((.*)\)\s*[:：]\s*(?:dé|ダイス)\s*(\d+)\s*(.*)$/);
  if (!m) { var m2 = line.match(/^(.+?)\s*[:：]\s*(?:dé|ダイス)\s*(\d+)\s*(.*)$/); if (!m2) return null; m = [m2[0], m2[1], "", m2[2], m2[3]]; }
  var rest = m[4] || "";
  var verdict = "";
  var vm = rest.match(/=\s*\d+\s*[,、—-]\s*(.+)$/) || rest.match(/[—-]\s*(.+)$/) || rest.match(/、\s*([^、]+)$/);
  if (vm) verdict = vm[1].trim();
  return { who: m[1].trim(), action: m[2].trim(), value: parseInt(m[3], 10), verdict: verdict };
}
function verdictClass(v) {
  if (/nette|大成功|クリティカル|決定的/.test(v)) return "v-ok";
  if (/partielle|部分的|一部/.test(v)) return "v-mid";
  if (/échec|失敗/.test(v)) return /net|大失敗/.test(v) ? "v-bad" : "v-bad";
  if (/réussite|成功/.test(v)) return "v-ok";
  return "";
}
function diceOf(reso) {
  var lines = [];
  if (lang === "jp") { if (reso.diceJp && reso.diceJp.length) lines = reso.diceJp; }
  else if (reso.dice) lines = String(reso.dice).split("\n");
  return lines.map(parseDiceLine).filter(Boolean);
}
function campaignStats() {
  var stats = { julien: { total: 0, n20: 0, n1: 0 }, ryo: { total: 0, n20: 0, n1: 0 } };
  DB.resolutions.forEach(function (r) {
    if (!r.dice) return;
    String(r.dice).split("\n").forEach(function (line) {
      var d = parseDiceLine(line); if (!d) return;
      var slug = /^Julien/.test(d.who) ? "julien" : (/^Ryo/.test(d.who) ? "ryo" : null);
      if (!slug) return;
      stats[slug].total++; if (d.value === 20) stats[slug].n20++; if (d.value === 1) stats[slug].n1++;
    });
  });
  return stats;
}
var BADGES = [
  { key: "roche", fr: "Badge Roche", jp: "グレーバッジ", img: "roche", gym: { fr: "Arène d'Argenta — Pierre", jp: "ニビジム — タケシ" } },
  { key: "cascade", fr: "Badge Cascade", jp: "ブルーバッジ", img: "cascade", gym: { fr: "Arène d'Azuria — Ondine", jp: "ハナダジム — カスミ" } },
  { key: "foudre", fr: "Badge Foudre", jp: "オレンジバッジ", img: "foudre", gym: { fr: "Arène de Carmin-sur-Mer — Major Bob", jp: "クチバジム — マチス" } },
  { key: "plante", fr: "Badge Plante", jp: "レインボーバッジ", img: "plante", gym: { fr: "Arène de Céladopole — Erika", jp: "タマムシジム — エリカ" } },
  { key: "ame", fr: "Badge Âme", jp: "ピンクバッジ", img: "ame", gym: { fr: "Arène de Parmanie — Koga", jp: "セキチクジム — キョウ" } },
  { key: "marais", fr: "Badge Marais", jp: "ゴールドバッジ", img: "marais", gym: { fr: "Arène de Safrania — Morgane", jp: "ヤマブキジム — ナツメ" } },
  { key: "volcan", fr: "Badge Volcan", jp: "クリムゾンバッジ", img: "volcan", gym: { fr: "Arène de Cramois'Île — Auguste", jp: "グレンジム — カツラ" } },
  { key: "terre", fr: "Badge Terre", jp: "グリーンバッジ", img: "terre", gym: { fr: "Arène de Jadielle — Giovanni", jp: "トキワジム — サカキ" } }
];
function badgesHTML(slug) {
  var got = (charOf(slug).badges) || [];
  return '<div class="badges-row">' + BADGES.map(function (b) {
    var has = got.indexOf(b.key) >= 0;
    return '<div class="badge-cell' + (has ? "" : " off") + '"><img src="assets/badges/badge-' + b.img + '.png" alt=""><div class="bc-name">' + esc(lang === "jp" ? b.jp : b.fr) + "</div></div>";
  }).join("") + "</div>";
}
function seenDex() {
  var seen = {};
  DB.pokemon.forEach(function (p) {
    if (!p.dex) return;
    (seen[p.dex] = seen[p.dex] || []).push({ kind: "poke", p: p });
  });
  DB.encounters.forEach(function (e) {
    if (!e.dex) return;
    (seen[e.dex] = seen[e.dex] || []).push({ kind: "enc", e: e });
  });
  return seen;
}
function hpBar(p) {
  var pct = p.hpMax ? Math.round(100 * p.hpCur / p.hpMax) : 100;
  var cls = pct <= 25 ? "low" : (pct <= 55 ? "mid" : "");
  return '<div class="hpbar"><i class="' + cls + '" style="width:' + pct + '%"></i></div><div class="hp-num">' + X("hp") + " " + p.hpCur + "/" + p.hpMax + "</div>";
}

/* ================= Accueil ================= */
function placeBlock() {
  var st = DB.state, map = st.map || {};
  var here = (map.places || []).filter(function (p) { return p.state === "here"; })[0];
  var pres = map.playersHere || {};
  var together = pres.julien && pres.julien === pres.ryo;
  var imgs = st.lieuImages || {};
  function imgFor(pid, who) {
    var src = imgs[pid];
    if (!src) return '<div class="lock-note">' + esc(X("noPlaceImg")) + "</div>";
    return '<div><img class="place-img" src="' + esc(src) + '" alt=""><div class="place-cap">' + esc(who) + "</div></div>";
  }
  if (together) {
    var nm = here ? pick(here) : null;
    return '<div class="place-wrap">' + imgFor(pres.julien, (lang === "jp" ? "みんな一緒" : "Groupe réuni") + (nm ? " — " + nm : "")) + "</div>";
  }
  var pj = (map.places || []).filter(function (p) { return p.fr && map.pos; });
  function placeName(pid) {
    var pl = (map.places || []).filter(function (p) { return p.fr; });
    return "";
  }
  return '<div class="place-wrap"><div class="place-split">' +
    '<div>' + imgFor(pres.julien, nameOf("julien")) + '</div><div>' + imgFor(pres.ryo, nameOf("ryo")) + "</div></div></div>";
}
function diceState(turn) {
  try { var all = JSON.parse(localStorage.getItem(LS_DICE) || "{}"); return all[turn] || {}; } catch (e) { return {}; }
}
function saveDiceState(turn, st) {
  try { var all = JSON.parse(localStorage.getItem(LS_DICE) || "{}"); all[turn] = st; localStorage.setItem(LS_DICE, JSON.stringify(all)); } catch (e) {}
}
function viewHome() {
  var st = DB.state, reso = lastReso();
  var h = "";
  /* Bandeau d'infos — calculé */
  var locTxt = pick(st.location) || "";
  var clockTxt = pick(st.clock) || "";
  var clockParts = clockTxt.split(/\s*[—–-]\s*/);
  var dayTxt = clockParts[0] || clockTxt, timeTxt = clockParts.slice(1).join(" — ") || clockTxt;
  h += '<div class="infoband">' +
    '<div class="ib"><div class="ib-k">' + esc(T("bandDay")) + '</div><div class="ib-v">' + esc(dayTxt) + '</div></div>' +
    '<div class="ib"><div class="ib-k">' + esc(T("bandTime")) + '</div><div class="ib-v">' + esc(timeTxt) + '</div></div>' +
    '<div class="ib"><div class="ib-k">' + esc(T("bandPlace")) + '</div><div class="ib-v">' + esc(locTxt) + '</div></div>' +
    '<div class="ib"><div class="ib-k">' + esc(T("bandTurn")) + '</div><div class="ib-v">' + (lang === "jp" ? "第" + st.turn + "ターン（進行中）" : "Tour n°" + st.turn + " — en cours") + "</div></div></div>";
  h += placeBlock();
  /* Phase de dés + résolution du dernier tour */
  if (reso) {
    var dice = diceOf(reso);
    var stDice = diceState(reso.turn);
    var allRolled = dice.length > 0 && dice.every(function (d, i) { return stDice[i]; });
    h += '<section class="card"><span class="pill">' + esc(T("lastResoBadge")) + '</span>' +
      '<h2>' + esc(T("lastResoTitle")) + " — " + (lang === "jp" ? "第" + reso.turn + "ターン" : "tour n°" + reso.turn) + '</h2>' +
      '<p class="muted small">' + esc(pick(reso.clock) || "") + " · " + esc(pick(reso.place) || locTxt) + "</p>";
    if (dice.length) {
      h += '<p class="small">' + esc(T("diceIntro")) + '</p><div id="diceBox">' +
        dice.map(function (d, i) {
          var rolled = !!stDice[i];
          return '<div class="die-cell">' +
            '<button type="button" class="die' + (rolled ? " rolled" : "") + '" data-die="' + i + '" aria-label="' + esc(T("dieAria")) + '">' +
            '<span class="die-scene"><span class="cube">' +
            '<span class="cface cf-front"><span class="cnum">' + (rolled ? d.value : "?") + '</span></span>' +
            '<span class="cface cf-top"><span class="cq">?</span></span>' +
            '<span class="cface cf-bottom"><span class="cq">?</span></span>' +
            '<span class="cface cf-right"><span class="cq">?</span></span>' +
            '<span class="cface cf-left"><span class="cq">?</span></span>' +
            '<span class="cface cf-back"><span class="cq">?</span></span>' +
            '</span></span>' +
            '<span class="die-meta"><span class="die-who">' + esc(d.who) + '</span><br><span class="die-act">' + esc(d.action) + "</span>" +
            (rolled && d.verdict ? '<br><span class="die-verdict ' + verdictClass(d.verdict) + '">' + esc(d.verdict) + "</span>" : "") + "</span></button>" +
            (rolled ? "" : '<button type="button" class="roll-one" data-roll="' + i + '">' + esc(T("rollOne")) + "</button>") +
            "</div>";
        }).join("") + "</div>" +
        '<button type="button" class="btn blue" id="rollAll">' + esc(T("rollAll")) + "</button>";
    }
    var resoTxt = pick(reso.text);
    h += '<div id="resoBox" style="margin-top:12px">';
    if (!dice.length || allRolled) {
      h += resoTxt ? '<div class="reso-text">' + esc(resoTxt) + "</div>" : '<p class="muted">' + esc(X("noJpReso")) + "</p>";
    } else {
      h += '<div class="lock-note">🔒 ' + esc(T("diceIntro")) + '</div><div class="reso-text locked-box" aria-hidden="true">' + esc(resoTxt || X("noJpReso")) + "</div>";
    }
    h += "</div>";
    var acts = reso.actions || {};
    var myAct = acts[me] ? pick(acts[me]) : null;
    h += "</section>";
    /* Situation */
    var sit = pick(st.situation);
    if (sit) h += '<section class="card neutral"><span class="pill blue">' + esc(X("situation")) + '</span><div class="reso-text">' + esc(sit) + "</div></section>";
  }
  /* Objectif (Accueil + Journal uniquement) */
  var obj = pick(st.objective);
  if (obj) h += '<section class="card"><span class="pill">' + esc(T("objlabel")) + '</span><div class="reso-text">' + esc(obj) + "</div></section>";
  /* Actions du tour en cours + composer */
  h += '<section class="card"><span class="pill">' + (lang === "jp" ? "第" + st.turn + "ターン" : "Tour n°" + st.turn) + "</span><h3>" + esc(T("composertitle")) + "</h3>";
  var draft = (st.draft87 && st.draft87[me === "julien" ? "ryo" : "julien"]) || (st.draft87 && st.draft87.ryo);
  ["julien", "ryo"].forEach(function (slug) {
    var sent = DB.actions.filter(function (a) { return a.trainer_slug === slug; });
    sent.forEach(function (a) {
      h += '<div class="action-line"><span class="al-who">' + esc(nameOf(slug)) + '</span> · <span class="muted small">' + esc(a.status || "") + "</span><br>" + esc(a.text) + "</div>";
    });
    if (!sent.length && st.draft87 && st.draft87[slug]) {
      var dtxt = pick(st.draft87[slug]);
      if (dtxt) h += '<div class="action-line"><span class="al-who">' + esc(nameOf(slug)) + '</span> · <span class="muted small">' + esc(T("draftLbl")) + "</span><br>" + esc(dtxt) + "</div>";
    }
  });
  var mine = DB.actions.filter(function (a) { return a.trainer_slug === me; });
  if (!mine.length) {
    h += '<label class="small" for="actionText">' + esc(T("composerlabel")) + '</label>' +
      '<textarea class="action-input" id="actionText" placeholder="' + esc(T("composerph")) + '"></textarea>' +
      '<div style="margin-top:8px"><button type="button" class="btn" id="sendAction">' + esc(T("send")) + '</button></div><div id="sendMsg"></div>';
  } else {
    h += '<div class="sent-ok">' + esc(T("sent")) + "</div>";
  }
  h += "</section>";
  return h;
}
var rollingNow = {};
function rollDie(i) {
  var reso = lastReso(); if (!reso) return;
  var dice = diceOf(reso); var stDice = diceState(reso.turn);
  if (stDice[i] || rollingNow[i]) return;
  rollingNow[i] = true;
  var btn = document.querySelector('[data-die="' + i + '"]');
  var one = document.querySelector('[data-roll="' + i + '"]');
  if (one) one.disabled = true;
  if (btn) { btn.classList.add("rolling"); var face = btn.querySelector(".cf-front .cnum"); var n = 0;
    var iv = setInterval(function () { if (face) face.textContent = String(1 + Math.floor(Math.random() * 20)); if (++n > 7) { clearInterval(iv); delete rollingNow[i]; var fresh = diceState(reso.turn); fresh[i] = true; saveDiceState(reso.turn, fresh); render(); } }, 110);
  } else { delete rollingNow[i]; var fresh2 = diceState(reso.turn); fresh2[i] = true; saveDiceState(reso.turn, fresh2); render(); }
}
function bindHome() {
  Array.prototype.forEach.call(document.querySelectorAll("[data-die]"), function (b) {
    b.addEventListener("click", function () { rollDie(parseInt(b.getAttribute("data-die"), 10)); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-roll]"), function (b) {
    b.addEventListener("click", function () { rollDie(parseInt(b.getAttribute("data-roll"), 10)); });
  });
  var all = $("rollAll");
  if (all) all.addEventListener("click", function () {
    var reso = lastReso(); var dice = diceOf(reso); var stDice = diceState(reso.turn);
    var pending = dice.map(function (d, i) { return i; }).filter(function (i) { return !stDice[i]; });
    pending.forEach(function (i, k) { setTimeout(function () { rollDie(i); }, k * 180); });
  });
  var send = $("sendAction");
  if (send) send.addEventListener("click", function () {
    var txt = ($("actionText").value || "").trim(); if (!txt) return;
    send.disabled = true; send.textContent = X("sending");
    sbPost("player_actions", { turn_number: DB.state.turn, trainer_slug: me, text: txt, status: "received" })
      .then(function () { return loadActions(); })
      .then(function () { render(); })
      .catch(function () { send.disabled = false; send.textContent = T("send"); $("sendMsg").innerHTML = '<div class="sent-ok" style="background:#fdecec;border-color:var(--red);color:#7f1d1d">' + esc(X("sendFail")) + "</div>"; });
  });
}

/* ================= Équipes ================= */
var MOVE_JP_INDEX = null;
function moveJp(nameFr) {
  if (lang === "fr") return nameFr;
  if (!MOVE_JP_INDEX) {
    MOVE_JP_INDEX = {};
    Object.keys(window.LEARNSETS || {}).forEach(function (sp) {
      window.LEARNSETS[sp].forEach(function (a) { if (a.jp) MOVE_JP_INDEX[a.name] = a.jp; });
    });
    Object.keys(window.MOVE_DB || {}).forEach(function (n) { /* noms seulement */ });
  }
  return MOVE_JP_INDEX[nameFr] || null;
}
function typeName(tFr) { return lang === "jp" ? ((window.TYPE_JP || {})[tFr] || tFr) : tFr; }
function typeColor(tFr) { return (window.TYPE_COLORS || {})[tFr] || "#888"; }
function typeInk(tFr) { return (window.TYPE_TEXT_DARK || {})[tFr] ? "#23255e" : "#fff"; }
function knownMoves(p) {
  var ls = (window.LEARNSETS || {})[spFr(p.species)] || [];
  var out = [], seen = {};
  ls.forEach(function (a) { if (a.n <= p.level) { out.push({ nameFr: a.name, nameJp: a.jp, type: a.type, lvl: a.n }); seen[a.name] = 1; } });
  (p.moves || []).forEach(function (m) {
    var nFr = spFr(m.name), nJp = (m.name && typeof m.name === "object") ? m.name.jp : null;
    if (!seen[nFr]) { out.push({ nameFr: nFr, nameJp: nJp, type: m.type, lvl: null }); seen[nFr] = 1; }
  });
  return out;
}
function moveDisplayName(m) { if (typeof m === "string") return lang === "jp" ? (moveJp(m) || m) : m; return lang === "jp" ? (m.nameJp || moveJp(m.nameFr) || m.nameFr) : m.nameFr; }
function pokeCard(p) {
  var nick = pick(p.nickname) || spName(p.dex, p.species);
  var sp = spName(p.dex, p.species);
  return '<button type="button" class="poke-card" data-poke="' + p.id + '"><img src="' + spriteOf(p.dex) + '" alt="">' +
    '<div class="pk-nick">' + esc(nick) + '</div><div class="pk-sp">' + esc(sp || "") + " · " + (lang === "jp" ? "Lv" : "niv.") + " " + p.level + "</div>" + hpBar(p) + "</button>";
}
function viewTeams() {
  var stats = campaignStats();
  var h = "<h1>" + esc(T("tabteams")) + '</h1><span class="pill">' + esc(T("passportsTitle")) + "</span>";
  h += '<div class="passports">' + ["julien", "ryo"].map(function (slug) {
    var c = charOf(slug);
    return '<button type="button" class="passport-mini" data-passport="' + slug + '"><img src="' + esc(c.img || "") + '" alt="">' +
      '<span><span class="pm-name">' + esc(nameOf(slug)) + '</span><br><span class="pm-sub">' + esc(pick(c.talent) || "") + "<br>🏅 " + (c.badges || []).length + "/8</span></span></button>";
  }).join("") + "</div>";
  if (openPassport) {
    var c = charOf(openPassport), st = stats[openPassport];
    h += '<section class="card"><span class="pill">' + esc(T("passportTitle")) + '</span>' +
      '<div class="sheet-head"><img src="' + esc(c.img || "") + '" alt="" style="image-rendering:auto"><div><div class="sh-name">' + esc(nameOf(openPassport)) + '</div><div class="muted small">' + esc(pick(c.role) || "") + "</div></div></div>" +
      '<table class="kv">' +
      "<tr><th>" + esc(T("talent")) + "</th><td><b>" + esc(pick(c.talent) || "") + "</b>" + (pick(c.talentDesc) ? "<br>" + esc(pick(c.talentDesc)) : "") + "</td></tr>" +
      "<tr><th>" + esc(T("attrsLbl")) + "</th><td>" + (lang === "jp" ? "直感" : "Instinct") + " +" + c.stats.instinct + " · " + (lang === "jp" ? "心" : "Cœur") + " +" + c.stats.coeur + " · " + (lang === "jp" ? "戦術" : "Tactique") + " +" + c.stats.tactique + "</td></tr>" +
      "<tr><th>" + esc(T("money")) + "</th><td>" + Number(c.money).toLocaleString("fr-FR") + " " + X("money") + "</td></tr>" +
      "<tr><th>" + esc(T("clutch")) + "</th><td>×" + c.clutch + "</td></tr>" +
      "<tr><th>" + esc(T("currentLoc")) + "</th><td>" + esc(pick(c.status) || "") + "</td></tr></table>" +
      '<h3 style="margin-top:10px">' + esc(T("badgesLbl")) + " — " + (c.badges || []).length + "/8</h3>" + badgesHTML(openPassport) +
      '<h3 style="margin-top:10px">' + esc(T("miniTeamLbl")) + '</h3><div class="mini-team">' +
      teamOf(openPassport, "equipe").map(function (p) { return '<button type="button" data-poke="' + p.id + '"><img src="' + spriteOf(p.dex) + '" alt="' + esc(spFr(p.species)) + '"></button>'; }).join("") + "</div>" +
      '<h3 style="margin-top:10px">' + esc(X("rolledStats")) + '</h3><table class="kv">' +
      "<tr><th>" + esc(X("diceArchived")) + "</th><td>" + st.total + "</td></tr>" +
      "<tr><th>" + esc(X("nat20")) + "</th><td>" + st.n20 + "</td></tr>" +
      "<tr><th>" + esc(X("nat1")) + "</th><td>" + st.n1 + "</td></tr></table></section>";
  }
  /* Menu d'équipe */
  var slug = teamView || me;
  h += '<span class="pill blue">' + esc(T("teamMenuTitle")) + '</span><div class="player-switch">' +
    ["julien", "ryo"].map(function (s) { return '<button type="button" data-teamview="' + s + '" class="' + (slug === s ? "on" : "") + '">' + esc(nameOf(s)) + "</button>"; }).join("") + "</div>";
  var team = teamOf(slug, "equipe");
  h += '<div class="team-grid">' + team.map(pokeCard).join("");
  for (var i = team.length; i < 6; i++) h += '<div class="poke-empty"><span>＋</span>' + esc(T("emptySlot")) + "</div>";
  var egg = DB.items.filter(function (it) { return it.owner === slug && it.qty > 0 && /Œuf|タマゴ/.test(it.name && it.name.fr || ""); })[0];
  if (egg) h += '<div class="poke-egg"><div class="egg-emoji">🥚</div><b>' + esc(T("eggTitle")) + '</b><div class="small muted">' + esc(T("eggNote")) + "</div></div>";
  h += "</div>";
  ["depot", "pension"].forEach(function (loc) {
    var list = teamOf(slug, loc);
    var key = slug + ":" + loc;
    h += '<div class="store-btns"><button type="button" class="btn blue" data-store="' + key + '">' + esc(loc === "depot" ? T("depotBtn") : T("pensionBtn")) + " (" + list.length + ")</button></div>";
    if (storeOpen[key]) {
      h += list.length ? '<div class="team-grid" style="margin-top:10px">' + list.map(pokeCard).join("") + "</div>"
        : '<p class="muted small">' + esc(T("emptyStore")) + "</p>";
    }
  });
  return h;
}
function openSheet(html) {
  closeSheet();
  var d = document.createElement("div");
  d.className = "sheet"; d.id = "sheet";
  d.innerHTML = '<div class="sheet-box">' + html + "</div>";
  d.addEventListener("click", function (e) { if (e.target === d) closeSheet(); });
  document.body.appendChild(d);
}
function closeSheet() { var s = $("sheet"); if (s) s.remove(); }
function moveSheet(nameFr, typeFr) {
  var db = (window.MOVE_DB || {})[nameFr];
  var nm = moveDisplayName(nameFr);
  var effOff = db ? (lang === "jp" ? db.e.jp : db.e.fr) : null;
  var jdr;
  if (!db || db.p == null) {
    jdr = lang === "jp" ? "ステータス変化技：成功で公式の効果がそのまま適用され、部分成功では効果が弱まるか短時間だけ続き、失敗では何も起きない。"
      : "Attaque de statut : sur une réussite, l'effet officiel s'applique pleinement ; sur une réussite partielle, il est réduit ou bref ; sur un échec, rien ne se passe.";
  } else {
    var tier = db.p <= 40 ? 0 : db.p <= 70 ? 1 : db.p <= 100 ? 2 : 3;
    var tiersFr = ["faibles", "moyens", "forts", "très forts"], tiersJp = ["小さい", "中くらい", "大きい", "とても大きい"];
    jdr = lang === "jp"
      ? "ダメージは" + tiersJp[tier] + "（威力" + db.p + "）。成功でフルダメージ、部分成功で軽減、失敗で当たらないか効果なし。"
      : "Dégâts " + tiersFr[tier] + " (puissance " + db.p + ") : réussite = pleins dégâts, réussite partielle = dégâts réduits, échec = l'attaque manque son effet.";
  }
  openSheet('<button type="button" class="btn blue" data-close="1">' + esc(T("closeLbl")) + "</button>" +
    '<h2 style="margin-top:10px">' + esc(nm) + '</h2>' +
    '<span class="move-pill" style="background:' + typeColor(typeFr) + ";color:" + typeInk(typeFr) + '">' + esc(typeName(typeFr)) + "</span>" +
    '<table class="kv" style="margin-top:10px">' +
    (db ? "<tr><th>" + esc(T("powLbl")) + "</th><td>" + (db.p == null ? "—" : db.p) + "</td></tr><tr><th>" + esc(T("accLbl")) + "</th><td>" + (db.a == null ? "—" : db.a + " %") + "</td></tr>" : "") +
    "<tr><th>" + esc(T("offEffLbl")) + "</th><td>" + esc(effOff || X("noText")) + "</td></tr>" +
    "<tr><th>" + esc(T("jdrLbl")) + "</th><td>" + esc(jdr) + "</td></tr></table>");
  bindSheet();
}
function pokeSheet(p) {
  var nick = pick(p.nickname) || spName(p.dex, p.species);
  var sp = spName(p.dex, p.species);
  var locLbl = p.location === "equipe" ? T("inTeam") : (p.location === "depot" ? T("atDepot") : T("atPension"));
  var moves = knownMoves(p);
  var ls = (window.LEARNSETS || {})[spFr(p.species)] || [];
  var note = pick(p.statusNote);
  var html = '<button type="button" class="btn blue" data-close="1">' + esc(T("backTeams")) + "</button>" +
    '<div class="sheet-head"><img src="' + spriteOf(p.dex) + '" alt=""><div><div class="sh-name">' + esc(nick) + '</div>' +
    '<div class="muted">' + esc(sp || "") + " · " + (lang === "jp" ? "Lv" : "niv.") + " " + p.level + " · " + esc(locLbl) + "</div>" + hpBar(p) + "</div></div>" +
    '<span class="pill">' + esc(T("identityLbl")) + '</span><table class="kv">' +
    "<tr><th>" + esc(T("speciesLbl")) + "</th><td>" + esc(sp || "") + "</td></tr>" +
    "<tr><th>" + esc(T("nickLbl")) + "</th><td>" + (pick(p.nickname) || esc(T("noNick"))) + "</td></tr>" +
    "<tr><th>" + esc(T("levelLbl")) + "</th><td>" + p.level + "</td></tr>" +
    "<tr><th>" + esc(T("dexNoLbl")) + "</th><td>N° " + p.dex + "</td></tr>" +
    "<tr><th>" + esc(T("trainerLbl")) + "</th><td>" + esc(nameOf(p.trainer)) + "</td></tr>" +
    "<tr><th>" + esc(T("traitPlusLbl")) + "</th><td><b>" + esc(pick(p.traitPlus && p.traitPlus.name) || "") + "</b>" + (pick(p.traitPlus && p.traitPlus.desc) ? "<br>" + esc(pick(p.traitPlus.desc)) : "") + "</td></tr>" +
    "<tr><th>" + esc(T("traitMinusLbl")) + "</th><td><b>" + esc(pick(p.traitMinus && p.traitMinus.name) || "") + "</b>" + (pick(p.traitMinus && p.traitMinus.desc) ? "<br>" + esc(pick(p.traitMinus.desc)) : "") + "</td></tr>" +
    (note ? "<tr><th>" + esc(T("statusLbl")) + "</th><td>" + esc(note) + "</td></tr>" : "") + "</table>" +
    '<h3 style="margin-top:12px">' + esc(T("movesTitle")) + ' <span class="muted small">(' + esc(T("tapMoveHint")) + ')</span></h3><div class="move-pills">' +
    moves.map(function (m) {
      return '<button type="button" class="move-pill" data-move="' + esc(m.nameFr) + '" data-type="' + esc(m.type) + '" style="background:' + typeColor(m.type) + ";color:" + typeInk(m.type) + '">' + esc(moveDisplayName(m)) + (m.lvl ? " <small>" + esc(T("learnAtLbl")) + " " + m.lvl + "</small>" : "") + "</button>";
    }).join("") + "</div>" +
    '<details class="fold" style="margin-top:12px"><summary>' + esc(T("learnsetLbl")) + " — " + moves.length + "/" + ls.length + " " + esc(T("knownLbl")) + '</summary><div class="move-pills" style="margin-top:8px">' +
    ls.map(function (a) {
      var ok = a.n <= p.level;
      return '<span class="move-pill' + (ok ? "" : " locked") + '" style="background:' + typeColor(a.type) + ";color:" + typeInk(a.type) + '">' + esc(lang === "jp" ? (a.jp || a.name) : a.name) + " <small>" + a.n + "</small></span>";
    }).join("") + "</div></details>";
  openSheet(html); bindSheet();
}
function bindSheet() {
  var box = $("sheet"); if (!box) return;
  Array.prototype.forEach.call(box.querySelectorAll("[data-close]"), function (b) { b.addEventListener("click", closeSheet); });
  Array.prototype.forEach.call(box.querySelectorAll("[data-move]"), function (b) {
    b.addEventListener("click", function () { moveSheet(b.getAttribute("data-move"), b.getAttribute("data-type")); });
  });
}
function bindTeams() {
  Array.prototype.forEach.call(document.querySelectorAll("[data-passport]"), function (b) {
    b.addEventListener("click", function () { var s = b.getAttribute("data-passport"); openPassport = openPassport === s ? null : s; render(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-teamview]"), function (b) {
    b.addEventListener("click", function () { teamView = b.getAttribute("data-teamview"); render(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-store]"), function (b) {
    b.addEventListener("click", function () { var k = b.getAttribute("data-store"); storeOpen[k] = !storeOpen[k]; render(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-poke]"), function (b) {
    b.addEventListener("click", function () {
      var id = parseInt(b.getAttribute("data-poke"), 10);
      var p = DB.pokemon.filter(function (x) { return x.id === id; })[0];
      if (p) pokeSheet(p);
    });
  });
}

/* ================= Personnages ================= */
var GROUP_JP = { "Joueurs et compagnons": "プレイヤーと仲間", "Champions d'arène": "ジムリーダー", "Proches et alliés": "身近な人々と味方", "Rencontres de voyage": "旅先での出会い" };
function groupName(g) { return lang === "jp" ? (GROUP_JP[g] || g) : g; }
function allChars() {
  var list = [];
  ["julien", "ryo", "kuma", "neko"].forEach(function (slug) {
    var c = DB.characters[slug]; if (!c) return;
    list.push({ key: "c:" + slug, name: c.name, nameJp: c.nameJp, img: c.img, group: c.group, role: c.role, status: c.status, first: c.first, facts: c.facts, appearance: c.appearance });
  });
  DB.npcs.forEach(function (n, i) {
    list.push({ key: "n:" + i, name: n.name, nameJp: n.nameJp, dex: n.dex, group: n.group, role: n.role, status: n.status, first: n.first, facts: n.facts, note: n.note });
  });
  return list;
}
function charItem(c, open) {
  var nm = lang === "jp" ? (c.nameJp || c.name) : c.name;
  var face = c.img ? '<img class="ci-face" src="' + esc(c.img) + '" alt="">'
    : (c.dex ? '<img class="ci-sprite" src="' + spriteOf(c.dex) + '" alt="">'
    : '<span class="ci-face" style="display:flex;align-items:center;justify-content:center;font-weight:900;background:#eaf2ff">' + esc((nm || "?").charAt(0)) + "</span>");
  var body = "";
  var app = c.appearance ? pick(c.appearance) : null;
  if (app) body += "<p>" + esc(app) + "</p>";
  var st = pick(c.status); if (st) body += '<div class="kv-line"><span>' + esc(T("statusLbl")) + "</span><b>" + esc(st) + "</b></div>";
  var fi = pick(c.first); if (fi) body += "<p><b>" + esc(T("firstMeetLbl")) + "</b><br>" + esc(fi) + "</p>";
  var fa = pick(c.facts); if (fa) body += "<p><b>" + esc(T("factsLbl")) + "</b><br>" + esc(fa) + "</p>";
  var no = c.note ? pick(c.note) : null; if (no) body += "<p>" + esc(no) + "</p>";
  return '<details class="char-item" data-charname="' + esc((c.name + " " + (c.nameJp || "")).toLowerCase()) + '"' + (open ? " open" : "") + "><summary>" + face +
    '<span><span class="ci-name">' + esc(nm) + '</span><br><span class="ci-role">' + esc(pick(c.role) || "") + "</span></span></summary>" +
    '<div class="ci-body">' + body + "</div></details>";
}
function viewChars() {
  var groups = ["Joueurs et compagnons", "Champions d'arène", "Proches et alliés", "Rencontres de voyage"];
  var chars = allChars();
  var h = "<h1>" + esc(T("charsTitle")) + '</h1><p class="intro">' + esc(T("charsIntro")) + '</p>' +
    '<input class="search-input" id="charSearch" type="search" placeholder="' + esc(X("searchNpc")) + '">' +
    '<div style="margin-bottom:10px"><button type="button" class="btn blue" id="openAllChars">' + esc(T("openAll")) + '</button> <button type="button" class="btn blue" id="closeAllChars">' + esc(T("closeAll")) + "</button></div>" +
    '<div id="charList">';
  groups.forEach(function (g) {
    var inG = chars.filter(function (c) { return c.group === g; });
    if (!inG.length) return;
    h += '<div class="obj-cat">' + esc(groupName(g)) + "</div>" + inG.map(function (c) { return charItem(c, window.__openNpc && (c.name === window.__openNpc || c.nameJp === window.__openNpc)); }).join("");
  });
  h += '</div><p class="muted small" id="noCharMsg" hidden>' + esc(T("noChar")) + "</p>";
  return h;
}
function bindChars() {
  var inp = $("charSearch");
  if (inp) inp.addEventListener("input", function () {
    var q = inp.value.trim().toLowerCase(); var any = false;
    Array.prototype.forEach.call(document.querySelectorAll(".char-item"), function (d) {
      var show = !q || d.getAttribute("data-charname").indexOf(q) >= 0;
      d.style.display = show ? "" : "none"; if (show) any = true;
    });
    $("noCharMsg").hidden = any;
  });
  var oa = $("openAllChars"), ca = $("closeAllChars");
  if (oa) oa.addEventListener("click", function () { Array.prototype.forEach.call(document.querySelectorAll(".char-item"), function (d) { d.open = true; }); });
  if (ca) ca.addEventListener("click", function () { Array.prototype.forEach.call(document.querySelectorAll(".char-item"), function (d) { d.open = false; }); });
  if (window.__openNpc) { var target = document.querySelector(".char-item[open]"); if (target) target.scrollIntoView({ block: "center" }); window.__openNpc = null; }
}

/* ================= Inventaire ================= */
var bagView = null;
function viewBag() {
  var slug = bagView || me;
  var h = "<h1>" + esc(T("bagTitle")) + '</h1><p class="intro">' + esc(T("bagIntro")) + '</p><div class="player-switch">' +
    ["julien", "ryo"].map(function (s) { return '<button type="button" data-bagview="' + s + '" class="' + (slug === s ? "on" : "") + '">' + esc((T("bagOf") || "").replace("{name}", nameOf(s))) + "</button>"; }).join("") + "</div>";
  var items = DB.items.filter(function (it) { return it.owner === slug && it.qty > 0; });
  h += '<section class="card"><span class="pill">' + esc(nameOf(slug)) + "</span>" +
    (items.length ? items.map(function (it) {
      var nm = it.name ? pick(it.name) : null;
      return '<div class="kv-line"><span>' + esc(nm || "?") + (it.qty > 1 ? " <b>×" + it.qty + "</b>" : "") + '</span></div>' +
        (it.note && pick(it.note) ? '<p class="small muted" style="margin:2px 0 8px">' + esc(pick(it.note)) + "</p>" : "");
    }).join("") : '<p class="muted">' + esc(X("noText")) + "</p>") + "</section>";
  return h;
}
function bindBag() {
  Array.prototype.forEach.call(document.querySelectorAll("[data-bagview]"), function (b) {
    b.addEventListener("click", function () { bagView = b.getAttribute("data-bagview"); render(); });
  });
}

/* ================= Objectifs ================= */
function viewQuests() {
  var cats = [["principal", T("mainQuest")], ["secondaire", T("sideQuests")], ["personnel", lang === "jp" ? "個人的な目標" : "Objectifs personnels"], ["rumeur", T("rumors")]];
  var h = "<h1>" + esc(T("questsTitle")) + '</h1><p class="intro">' + esc(T("questsIntro")) + "</p>";
  h += '<section class="card neutral"><span class="pill">' + esc(T("badgeQuestTitle")) + '</span><p class="small">' + esc(T("badgeQuestDesc")) + "</p>" +
    ["julien", "ryo"].map(function (slug) {
      var c = charOf(slug);
      return '<div class="kv-line"><span>' + esc(nameOf(slug)) + '</span><b>' + (c.badges || []).length + " / 8 " + esc(T("badgesWord")) + "</b></div>";
    }).join("") + "</section>";
  var done = [];
  cats.forEach(function (cat) {
    var list = DB.objectives.filter(function (o) { return o.category === cat[0] && o.status === "active"; });
    list.forEach(function (o) { /* triées par id dans la base */ });
    if (!list.length) return;
    h += '<div class="obj-cat">' + esc(cat[1]) + "</div>" + list.map(function (o) {
      return '<section class="card"><b>' + esc(pick(o.title) || "") + '</b><div class="reso-text" style="margin-top:4px">' + esc(pick(o.text) || "") + "</div>" +
        (pick(o.source) ? '<p class="small muted" style="margin:6px 0 0">' + esc(pick(o.source)) + "</p>" : "") + "</section>";
    }).join("");
  });
  done = DB.objectives.filter(function (o) { return o.status !== "active"; });
  if (done.length) {
    h += '<details class="fold"><summary>' + esc(X("questDone")) + " (" + done.length + ")</summary>" + done.map(function (o) {
      return '<div class="kv-line"><span>' + esc(pick(o.title) || "") + '</span><b>' + (o.status === "done" ? esc(T("doneLbl")) : esc(T("todoLbl"))) + "</b></div>";
    }).join("") + "</details>";
  }
  return h;
}

/* ================= Carte ================= */
function viewMap() {
  var st = DB.state, map = st.map || {};
  var places = map.places || [], pos = map.pos || {}, route = map.route || [];
  var hereFr = (places.filter(function (p) { return p.state === "here"; })[0] || {}).fr;
  var hereIdx = route.indexOf(hereFr);
  var pts = route.map(function (n) { return pos[n]; }).filter(Boolean);
  var lineDone = pts.slice(0, hereIdx + 1).map(function (p) { return p.x + "," + p.y; }).join(" ");
  var lineTodo = pts.slice(hereIdx).map(function (p) { return p.x + "," + p.y; }).join(" ");
  var h = "<h1>" + esc(T("mapTitle")) + '</h1><p class="intro">' + esc(T("mapIntro")) + "</p>";
  h += '<div class="kmap" id="kmap"><div class="kmap-inner" id="kmapInner"><img class="map-img" src="assets/carte-kanto.webp" alt="Kanto">' +
    '<svg class="route" viewBox="0 0 100 100" preserveAspectRatio="none">' +
    (lineTodo ? '<polyline points="' + lineTodo + '" fill="none" stroke="#d64545" stroke-width="0.7" stroke-dasharray="1.6 1.2" opacity="0.75"/>' : "") +
    (lineDone ? '<polyline points="' + lineDone + '" fill="none" stroke="#d64545" stroke-width="0.8" opacity="0.9"/>' : "") + "</svg>" +
    places.map(function (p) {
      var pp = pos[p.fr]; if (!pp) return "";
      return '<div class="kmark ' + p.state + " side-" + (pp.side || "r") + '" style="left:' + pp.x + "%;top:" + pp.y + '%"><div class="dot"></div><span class="klab">' + esc(pick(p) || "") + "</span></div>";
    }).join("") + "</div></div>" +
    '<div style="margin-top:8px;display:flex;gap:8px"><button type="button" class="btn blue" id="mapZoomOut">−</button><button type="button" class="btn blue" id="mapZoomIn">+</button><button type="button" class="btn blue" id="mapReset">' + esc(T("mapReset")) + "</button></div>" +
    '<div class="legend"><span><span class="dot" style="background:var(--green)"></span>' + esc(T("lgVisited")) + '</span><span><span class="dot" style="background:var(--red)"></span>' + esc(T("lgHere")) + '</span><span><span class="dot" style="background:#b9bdd6"></span>' + esc(T("todoLbl2") || T("lgTodo")) + "</span></div>";
  /* Vous êtes ici */
  var here = places.filter(function (p) { return p.state === "here"; })[0];
  if (here) {
    var npcsHere = (map.destNpcs || {})[here.fr] || [];
    h += '<section class="card" style="margin-top:12px"><span class="pill">' + esc(X("hereYou")) + '</span><h3>' + esc(pick(here) || "") + '</h3>' +
      (pick(here.note) ? '<p class="small" style="margin:0 0 6px"><b>' + esc(pick(here.note)) + "</b></p>" : "") +
      (pick(here.desc) ? '<div class="reso-text">' + esc(pick(here.desc)) + "</div>" : "") +
      (npcsHere.length ? '<p class="small" style="margin:10px 0 6px"><b>' + esc(T("npcHereLbl")) + '</b></p><div class="npc-chips">' + npcsHere.map(function (n) {
        var role = (map.npcRoleShort || {})[n]; var rl = role ? pick(role) : null;
        return '<button type="button" data-npc="' + esc(n) + '">' + esc(lang === "jp" ? jpNpcName(n) : n) + (rl ? " · " + esc(rl) : "") + "</button>";
      }).join("") + "</div>" : "") + "</section>";
  }
  /* Prochaine destination */
  var nextFr = (map.next || [])[1];
  var next = places.filter(function (p) { return p.fr === nextFr; })[0];
  if (next) {
    var imgs = st.lieuImages || {}; var pid = nextFr === "Safrania" ? "safrania" : (nextFr === "Céladopole" ? "celadopole" : null);
    h += '<section class="card neutral"><span class="pill blue">' + esc(X("nextDest")) + '</span><h3>' + esc(pick(next) || "") + "</h3>" +
      (pid && imgs[pid] ? '<img class="place-img" src="' + esc(imgs[pid]) + '" alt="">' : "") +
      (pick(next.desc) ? '<div class="reso-text" style="margin-top:8px">' + esc(pick(next.desc)) + "</div>" : "") + "</section>";
  }
  /* Lieux visités */
  h += '<section class="card"><span class="pill">' + esc(T("placesTitle")) + '</span><p class="small">' + esc(T("placesIntro")) + "</p>" +
    places.map(function (p) {
      var lbl = p.state === "visited" ? T("visitedLbl") : (p.state === "here" ? T("lgHere") : T("notVisitedLbl"));
      return '<div class="kv-line"><span>' + esc(pick(p) || "") + '</span><b>' + esc(lbl) + "</b></div>";
    }).join("") + "</section>";
  return h;
}
function jpNpcName(frName) {
  var all = allChars();
  for (var i = 0; i < all.length; i++) if (all[i].name === frName) return all[i].nameJp || frName;
  return frName;
}
function initMap() {
  var inner = $("kmapInner"), box = $("kmap"); if (!inner || !box) return;
  function apply() { inner.style.transform = "translate(" + mapTf.x + "px," + mapTf.y + "px) scale(" + mapTf.k + ")"; }
  apply();
  var zin = $("mapZoomIn"), zout = $("mapZoomOut"), zr = $("mapReset");
  if (zin) zin.addEventListener("click", function () { mapTf.k = Math.min(3, mapTf.k * 1.3); apply(); });
  if (zout) zout.addEventListener("click", function () { mapTf.k = Math.max(1, mapTf.k / 1.3); if (mapTf.k === 1) { mapTf.x = 0; mapTf.y = 0; } apply(); });
  if (zr) zr.addEventListener("click", function () { mapTf = { k: 1, x: 0, y: 0 }; apply(); });
  var drag = null;
  box.addEventListener("pointerdown", function (e) { drag = { x: e.clientX - mapTf.x, y: e.clientY - mapTf.y }; box.setPointerCapture(e.pointerId); });
  box.addEventListener("pointermove", function (e) { if (!drag) return; mapTf.x = e.clientX - drag.x; mapTf.y = e.clientY - drag.y; apply(); });
  box.addEventListener("pointerup", function () { drag = null; });
  Array.prototype.forEach.call(document.querySelectorAll("[data-npc]"), function (b) {
    b.addEventListener("click", function () { window.__openNpc = b.getAttribute("data-npc"); tab = "chars"; buildNav(); render(); });
  });
}

/* ================= Rencontres ================= */
function viewEnc() {
  var h = "<h1>" + esc(T("encTitle")) + '</h1><p class="intro">' + esc(T("encIntro")) + "</p>";
  h += DB.encounters.map(function (e) {
    var nm = e.displayName ? pick(e.displayName) : null;
    var sp = spName(e.dex, e.species);
    return '<section class="card"><div class="enc-card"><img src="' + spriteOf(e.dex) + '" alt="">' +
      "<div><b>" + esc(nm || sp || spFr(e.species)) + "</b>" +
      (sp && nm && sp !== nm ? ' <span class="muted small">(' + esc(sp) + ")</span>" : "") +
      (e.turn ? '<div class="kv-line"><span>' + esc(T("turnLbl")) + "</span><b>" + (lang === "jp" ? "第" + e.turn + "ターン" : "n°" + e.turn) + "</b></div>" : "") +
      (e.where && pick(e.where) ? '<div class="kv-line"><span>📍</span><b>' + esc(pick(e.where)) + "</b></div>" : "") +
      (e.when && pick(e.when) ? '<div class="kv-line"><span>🕐</span><b>' + esc(pick(e.when)) + "</b></div>" : "") +
      (e.note && pick(e.note) ? '<p class="small" style="margin:6px 0 0">' + esc(pick(e.note)) + "</p>" : "") +
      "</div></div></section>";
  }).join("");
  return h;
}

/* ================= Journal ================= */
function resoCard(r, openByDefault) {
  var txt = pick(r.text);
  var diceLines = lang === "jp" ? (r.diceJp || []) : (r.dice ? String(r.dice).split("\n") : []);
  var inten = r.intentions ? (lang === "jp" ? null : r.intentions) : null;
  var acts = "";
  if (r.actions) {
    ["julien", "ryo"].forEach(function (slug) {
      var a = r.actions[slug] ? pick(r.actions[slug]) : null;
      if (a) acts += '<div class="action-line"><span class="al-who">' + esc(nameOf(slug)) + "</span><br>" + esc(a) + "</div>";
    });
  }
  return '<details class="fold"' + (openByDefault ? " open" : "") + "><summary>" +
    (lang === "jp" ? "第" + r.turn + "ターン" : "Tour n°" + r.turn) + " — " + esc(pick(r.clock) || "") + "</summary>" +
    (inten ? '<div class="dice-lines">' + esc(inten) + "</div>" : "") + acts +
    (diceLines.length ? '<div class="dice-lines">' + esc(diceLines.join("\n")) + "</div>" : "") +
    (txt ? '<div class="reso-text">' + esc(txt) + "</div>" : '<p class="muted small">' + esc(X("noJpReso")) + "</p>") + "</details>";
}
function viewJournal() {
  var reso = lastReso();
  var h = "<h1>" + esc(T("tabjournal")) + "</h1>";
  if (reso) {
    h += '<section class="card"><span class="pill">' + esc(T("prevTitle")) + '</span><h3>' +
      (lang === "jp" ? "第" + reso.turn + "ターン" : "Tour n°" + reso.turn) + " — " + esc(pick(reso.clock) || "") + "</h3>" +
      (pick(reso.text) ? '<div class="reso-text">' + esc(pick(reso.text)) + "</div>" : '<p class="muted">' + esc(X("noJpReso")) + "</p>") + "</section>";
  }
  var obj = pick(DB.state.objective);
  if (obj) h += '<section class="card"><span class="pill">' + esc(T("objlabel")) + '</span><div class="reso-text">' + esc(obj) + "</div></section>";
  /* Album de souvenirs */
  var figs = [];
  ["julien", "ryo"].forEach(function (slug) {
    teamOf(slug, "equipe").forEach(function (p) {
      figs.push({ img: spriteOf(p.dex), cap: (pick(p.nickname) || spName(p.dex, p.species) || spFr(p.species)) });
    });
  });
  figs.push({ img: "assets/kuma-sprite-dort.png", cap: nameOf("ryo") === "Ryo" ? "Kuma" : "クマ" });
  figs.push({ img: "assets/neko-sprite-assis.png", cap: lang === "jp" ? "ネコ" : "Neko" });
  h += '<section class="card neutral"><span class="pill blue">' + esc(T("albumTitle")) + '</span><p class="small muted">' + esc(X("albumNote")) + '</p><div class="album">' +
    figs.map(function (f) { return "<figure><img src=\"" + esc(f.img) + "\" alt=\"\"><figcaption>" + esc(f.cap) + "</figcaption></figure>"; }).join("") + "</div></section>";
  /* Entrées du journal */
  var entries = DB.journal.slice().sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
  h += entries.map(function (e) {
    var txt = pick(e.text); if (!txt) return "";
    var head = e.kind === "turn" && e.turn ? (lang === "jp" ? "第" + e.turn + "ターン" : "Tour n°" + e.turn) : null;
    return '<section class="card">' + (head ? '<span class="pill grey">' + esc(head) + "</span>" : "") + '<div class="reso-text">' + esc(txt) + "</div></section>";
  }).join("");
  /* Historique des résolutions */
  h += '<div class="obj-cat">' + esc(T("resoLabel")) + "</div>" +
    DB.resolutions.slice().reverse().map(function (r) { return resoCard(r, false); }).join("");
  return h;
}

/* ================= Pokédex ================= */
function provLabel(dex, seen) {
  var entries = seen[dex] || [];
  var poke = entries.filter(function (e) { return e.kind === "poke"; })[0];
  if (poke) {
    var loc = poke.p.location === "equipe" ? T("provTeam") : (poke.p.location === "depot" ? T("provDepot") : (lang === "jp" ? "預かり" : "Pension"));
    return (loc || "").replace("{name}", nameOf(poke.p.trainer));
  }
  var enc = entries.filter(function (e) { return e.kind === "enc"; })[0];
  if (enc) {
    return (T("provEnc") || "").replace("{where}", (enc.e.where && pick(enc.e.where)) || "").replace("{n}", enc.e.turn != null ? enc.e.turn : "?");
  }
  return "";
}
function viewDex() {
  var seen = seenDex();
  var kantoSeen = 0, natSeen = [];
  for (var d = 1; d <= 151; d++) if (seen[d]) kantoSeen++;
  Object.keys(seen).forEach(function (k) { if (parseInt(k, 10) > 151) natSeen.push(parseInt(k, 10)); });
  natSeen.sort(function (a, b) { return a - b; });
  /* À la une : rencontre la plus récente, sinon dernier Pokémon arrivé */
  var featDex = null, bestTurn = -1;
  DB.encounters.forEach(function (e) { var t = e.turn || 0; if (t > bestTurn) { bestTurn = t; featDex = e.dex; } });
  if (!featDex && DB.pokemon.length) featDex = DB.pokemon[DB.pokemon.length - 1].dex;
  var h = "<h1>" + esc(T("dexTitle")) + '</h1><p class="intro">' + esc(T("dexSeen")) + "</p>";
  h += '<section class="card neutral"><span class="pill">' + esc(T("totalSeen")) + '</span><div class="dex-count">' + kantoSeen + " / 151 — " + esc(T("kantoLbl")) + '</div>' +
    '<div class="dex-progress"><i style="width:' + Math.round(100 * kantoSeen / 151) + '%"></i></div></section>';
  if (featDex) {
    var fn = speciesName(featDex, "");
    h += '<section class="card"><span class="pill">' + esc(T("dexFeat")) + '</span><div class="sheet-head"><img src="' + dexImg(featDex) + '" alt="" style="image-rendering:auto">' +
      '<div><div class="sh-name">N° ' + featDex + " — " + esc(fn || "") + '</div><div class="muted small">' + esc(T("dexFeatCtx")) + "<br>" + esc(provLabel(featDex, seen)) + "</div></div></div></section>";
  }
  var cells = "";
  for (var n = 1; n <= 151; n++) {
    var isSeen = !!seen[n];
    var nm = isSeen ? speciesName(n, "") : "???";
    cells += '<div class="dex-cell' + (isSeen ? "" : " unseen") + '"><img src="' + dexImg(n) + '" alt="" loading="lazy"><div class="dc-num">N° ' + n + (isSeen ? ' <span class="dc-check">✓</span>' : "") + '</div><div class="dc-name">' + esc(nm || "???") + "</div></div>";
  }
  h += '<section class="card"><div class="dex-grid">' + cells + "</div></section>";
  if (natSeen.length) {
    h += '<section class="card"><span class="pill blue">' + esc(T("natTitle")) + '</span><p class="small">' + esc(T("natIntro")) + '</p><div class="dex-grid">' +
      natSeen.map(function (d) {
        return '<div class="dex-cell"><img src="' + dexImg(d) + '" alt=""><div class="dc-num">N° ' + d + ' <span class="dc-check">✓</span></div><div class="dc-name">' + esc(speciesName(d, "") || "") + '</div><div class="dc-name muted">' + esc(provLabel(d, seen)) + "</div></div>";
      }).join("") + "</div></section>";
  }
  return h;
}

/* ================= Routage des bindings ================= */
function bindView() {
  if (tab === "home") bindHome();
  else if (tab === "teams") bindTeams();
  else if (tab === "chars") bindChars();
  else if (tab === "bag") bindBag();
}

/* ================= Actualisation douce ================= */
var lastStamp = null;
function stampOf() { return DB ? (DB.state.turn + "|" + DB.resolutions.length + "|" + DB.actions.length) : ""; }
setInterval(function () {
  if (!me || !DB) return;
  sbGet("/game_state?id=eq.1&select=data").then(function (rows) {
    var st = rows[0] && rows[0].data;
    if (!st) return;
    if (st.turn !== DB.state.turn || st.phase !== DB.state.phase) {
      loadAll().then(function () { render(); }).catch(function () {});
    }
  }).catch(function () {});
}, 30000);
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && me && DB) loadActions().then(function () { if (tab === "home") render(); }).catch(function () {});
});

/* ================= Démarrage ================= */
var saved = null;
try { saved = localStorage.getItem(LS_PLAYER); } catch (e) {}
if (saved === "julien" || saved === "ryo") setPlayer(saved);
else showEntry();
})();
