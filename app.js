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
        stSent: "Envoyée", stNone: "Non envoyée",
        questDone: "Terminées", noJpReso: "La version japonaise de ce tour n'est pas encore disponible.", searchNpc: "Rechercher un personnage…",
        learnsetTitle: "Attaques par montée de niveau",
        lsLoading: "Chargement des attaques officielles…", lsOffline: "Liste des attaques indisponible hors ligne.",
        mjWorking: "Le MJ au travail",
        atGym: "Arène", champion: "Champion", noPlaceImg: "Illustration à venir pour ce lieu.", albumNote: "Les compagnons du voyage, tels qu'ils sont aujourd'hui." },
  jp: { changePlayer: "プレイヤーを変更", loading: "セーブデータを読み込み中…", loadError: "データを読み込めませんでした。接続を確認して、もう一度お試しください。",
        retry: "再試行", hp: "HP", money: "円", turnW: "ターン", chapterW: "チャプター", situation: "現在の状況",
        noText: "テキストがありません。", hereYou: "現在地", nextDest: "次の目的地", seenInDex: "図鑑に登録",
        rollOne: "振る", teamTitle: "チーム", rolledStats: "キャンペーン統計（記録済みダイス）", diceArchived: "振ったダイス", nat20: "自然な20", nat1: "自然な1",
        sendFail: "送信できませんでした — 少し待ってからもう一度どうぞ。", sending: "送信中…", myAction: "自分のアクション", otherAction: "{name}のアクション",
        stSent: "送信済み", stNone: "未送信",
        questDone: "完了済み", noJpReso: "このターンの日本語版はまだ用意されていません。", searchNpc: "キャラクターを検索…",
        learnsetTitle: "レベルアップで覚えるわざ",
        lsLoading: "公式のわざデータを読み込み中…", lsOffline: "オフラインのため、わざリストを表示できません。",
        mjWorking: "GMが作業中",
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
/* Sprites officiels des objets (dépôt PokeAPI/sprites, dossier items), résolus
   depuis le nom FR stocké en base — jamais depuis le nom affiché : le côté JP
   montre donc les mêmes images. Clés = normName(nom FR). Valeur = slug PokeAPI.
   Absent de la table = pas de sprite officiel (objet de campagne, ou objet sans
   icône d'item dans les jeux, ex. le Pokédex) → repli sur le glyphe stocké. */
var ITEM_SPRITES = {
  "potion": "potion", "pokeball": "poke-ball", "superball": "great-ball",
  "baieoran": "oran-berry", "vieillecanne": "old-rod", "perle": "pearl",
  "pierrefeu": "fire-stone", "pierreplante": "leaf-stone",
  "ufdepokemon": "egg", "ct19megasangsue": "tm-grass"
};
function itemSpriteOf(frName) {
  if (!frName) return null;
  var key = normName(frName), slug = ITEM_SPRITES[key];
  if (!slug && key.indexOf("ball") >= 0) slug = key.indexOf("super") >= 0 ? "great-ball" : "poke-ball";
  return slug ? "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/" + slug + ".png" : null;
}
/* Pastille d'objet : le sprite officiel couvre le glyphe stocké ; si le sprite
   est absent ou échoue (onerror), le glyphe reste visible — jamais d'image cassée. */
function itemIconHTML(it) {
  var src = itemSpriteOf(spFr(it.name));
  return '<span class="item-ic">' + esc(it.icon || "•") +
    (src ? '<img class="item-img" src="' + src + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : "") + "</span>";
}

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
/* Pied de page calculé depuis les données chargées : bornes réelles des
   résolutions en base + tour en cours (remplace l'ancien libellé figé). */
function footerText() {
  if (!DB || !DB.resolutions || !DB.resolutions.length || !DB.state) return "";
  var first = DB.resolutions[0].turn, last = DB.resolutions[DB.resolutions.length - 1].turn, cur = DB.state.turn;
  if (lang === "jp") return "実際のゲームデータ：第" + first + "〜" + last + "ターン解決済み、第" + cur + "ターン進行中。";
  return "Données réelles de la partie : tours n°" + first + " à " + last + " résolus, tour n°" + cur + " en cours.";
}
function renderBrand() {
  $("brandTitle").textContent = lang === "jp" ? "ポケモン クマ" : "Pokémon Neko";
  var lbl = TABS.filter(function (tb) { return tb[0] === tab; })[0];
  var st = DB.state;
  $("brandSub").textContent = (lbl ? T(lbl[1]) : "") + " · " + X("chapterW") + " " + st.chapter + " · " + X("turnW") + " " + (lang === "jp" ? "第" + st.turn + "ターン" : "n°" + st.turn);
  $("footNote").textContent = footerText();
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
  setupMjPolling();
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
/* État du tour en cours pour un joueur : actions envoyées (base), sinon
   brouillon enregistré dans l'état de partie, sinon rien. Source unique
   partagée par le bloc du haut et le bloc d'origine (synchronisés). */
function playerTurnInfo(slug) {
  var st = DB.state;
  var sent = DB.actions.filter(function (a) { return a.trainer_slug === slug; });
  var draft = (!sent.length && st.draft87 && st.draft87[slug]) ? pick(st.draft87[slug]) : null;
  return { sent: sent, draft: draft, status: sent.length ? "sent" : (draft ? "draft" : "none") };
}
/* Formulaire d'envoi de l'action du joueur courant. Les identifiants sont
   paramétrés : le bloc d'origine garde actionText/sendAction/sendMsg,
   la copie du haut utilise les mêmes noms suffixés « Top ». Après un envoi,
   render() ré-affiche tout : les deux blocs restent synchronisés. */
function composerHTML(ids) {
  var mine = DB.actions.filter(function (a) { return a.trainer_slug === me; });
  if (mine.length) return '<div class="sent-ok">' + esc(T("sent")) + "</div>";
  return '<label class="small" for="' + ids.text + '">' + esc(T("composerlabel")) + '</label>' +
    '<textarea class="action-input" id="' + ids.text + '" placeholder="' + esc(T("composerph")) + '"></textarea>' +
    '<div style="margin-top:8px"><button type="button" class="btn" id="' + ids.send + '">' + esc(T("send")) + '</button></div><div id="' + ids.msg + '"></div>';
}
var COMPOSER_MAIN = { text: "actionText", send: "sendAction", msg: "sendMsg" };
var COMPOSER_TOP = { text: "actionTextTop", send: "sendActionTop", msg: "sendMsgTop" };
/* Copie du bloc du tour, juste sous l'illustration du lieu, disposée comme
   la référence d'Axel : deux cartes joueurs (portrait rond, nom, statut),
   puis le texte de l'action de chacun, puis le même formulaire d'envoi. */
function turnTopHTML() {
  var st = DB.state;
  var h = '<section class="card" id="turnTop"><span class="pill">' + (lang === "jp" ? "第" + st.turn + "ターン" : "Tour n°" + st.turn) + "</span><h3>" + esc(T("composertitle")) + "</h3>";
  h += '<div class="duel-cards">' + ["julien", "ryo"].map(function (slug) {
    var info = playerTurnInfo(slug);
    var c = charOf(slug) || {};
    var img = c.img || ("assets/portrait-" + slug + ".webp");
    var stLbl = info.status === "sent" ? "📤 " + X("stSent") : (info.status === "draft" ? "📝 " + T("draftLbl") : "⌛ " + X("stNone"));
    return '<div class="pcard"><img class="pcard-face" src="' + esc(img) + '" alt="">' +
      '<div class="pcard-name">' + esc(nameOf(slug)) + '</div>' +
      '<div class="pcard-status ' + info.status + '">' + esc(stLbl) + "</div></div>";
  }).join("") + "</div>";
  h += ["julien", "ryo"].map(function (slug) {
    var info = playerTurnInfo(slug);
    var body;
    if (info.sent.length) body = info.sent.map(function (a) { return esc(a.text); }).join("<br>");
    else if (info.draft) body = esc(info.draft);
    else body = '<span class="muted">' + esc(T("noaction")) + "</span>";
    return '<div class="duel-line"><span class="dl-who">' + esc(nameOf(slug)) + " :</span> " + body + "</div>";
  }).join("");
  h += composerHTML(COMPOSER_TOP);
  h += "</section>";
  return h;
}
function diceState(turn) {
  try { var all = JSON.parse(localStorage.getItem(LS_DICE) || "{}"); return all[turn] || {}; } catch (e) { return {}; }
}
function saveDiceState(turn, st) {
  try { var all = JSON.parse(localStorage.getItem(LS_DICE) || "{}"); all[turn] = st; localStorage.setItem(LS_DICE, JSON.stringify(all)); } catch (e) {}
}
/* ============ Statut de résolution du MJ, en temps réel ============
   Le MJ publie sa progression dans game_state.data.mjStatus :
   { turn, step, updatedAt } — step = index (base 1) de l'étape EN COURS, de 1 à 6.
   L'accueil affiche alors une carte « Le MJ au travail » près du bloc du tour :
   étapes terminées ✓, étape en cours en évidence (pulsation douce), à venir grisées.
   Tant que l'étape finale (6) n'est pas atteinte, l'appli réinterroge game_state
   toutes les ~10 s et met la carte à jour sans rechargement ; à l'étape finale,
   le polling s'arrête. Sans mjStatus, aucune carte n'est affichée. */
var MJ_STEPS = {
  fr: ["Actions reçues", "Vérification de la partie", "Lecture de vos actions", "Résolution du tour", "Écriture du résultat", "Terminé — nouveau tour ouvert"],
  jp: ["アクション受信済み", "ゲームの状態を確認中", "アクションを読み取り中", "ターンを解決中", "結果を書き込み中", "完了 — 次のターンが開きました"]
};
function mjStatusOf() {
  var s = DB && DB.state ? DB.state.mjStatus : null;
  return (s && typeof s.step === "number" && isFinite(s.step)) ? s : null;
}
function mjCardInner(s) {
  var step = Math.max(1, Math.min(6, Math.round(s.step)));
  var labels = MJ_STEPS[lang] || MJ_STEPS.fr;
  var rows = labels.map(function (lbl, i) {
    var n = i + 1;
    var cls, ico;
    if (n < step || (n === step && step >= 6)) { cls = "done" + (n === step ? " final" : ""); ico = "✓"; }
    else if (n === step) { cls = "current"; ico = "●"; }
    else { cls = "todo"; ico = String(n); }
    return '<div class="mj-step ' + cls + '"><span class="mj-ico">' + ico + '</span><span class="mj-lbl">' + esc(lbl) + "</span></div>";
  }).join("");
  return '<span class="pill blue">' + esc(X("mjWorking")) + "</span>" +
    (s.turn ? '<span class="muted small">' + (lang === "jp" ? "第" + s.turn + "ターン" : "Tour n°" + s.turn) + "</span>" : "") +
    '<div class="mj-steps">' + rows + "</div>";
}
function mjCardHTML() {
  var s = mjStatusOf();
  return s ? '<section class="card" id="mjCard">' + mjCardInner(s) + "</section>" : "";
}
var mjPollTimer = null;
function setupMjPolling() {
  if (mjPollTimer) { clearInterval(mjPollTimer); mjPollTimer = null; }
  if (tab !== "home") return;
  var s = mjStatusOf();
  if (!s || s.step >= 6) return;
  mjPollTimer = setInterval(function () {
    if (tab !== "home") { clearInterval(mjPollTimer); mjPollTimer = null; return; }
    if (document.hidden) return;
    sbGet("/game_state?id=eq.1&select=data").then(function (rows) {
      if (!rows || !rows[0] || !rows[0].data) return;
      DB.state = rows[0].data;
      var ns = mjStatusOf();
      var el = $("mjCard");
      if (!ns) { if (el) el.remove(); clearInterval(mjPollTimer); mjPollTimer = null; return; }
      if (el) el.innerHTML = mjCardInner(ns);
      if (ns.step >= 6) { clearInterval(mjPollTimer); mjPollTimer = null; }
    }).catch(function () { /* réseau : on réessaiera au prochain cycle */ });
  }, 10000);
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
  /* Copie du bloc du tour, juste sous l'illustration du lieu */
  h += turnTopHTML();
  /* Statut de résolution du MJ en temps réel (si le MJ en publie un) */
  h += mjCardHTML();
  /* Phase de dés + résolution du dernier tour */
  if (reso) {
    var dice = diceOf(reso);
    var stDice = diceState(reso.turn);
    var allRolled = dice.length > 0 && dice.every(function (d, i) { return stDice[i]; });
    h += '<section class="card"><span class="pill">' + esc(T("lastResoBadge")) + '</span>' +
      '<h2>' + esc(T("lastResoTitle")) + " — " + (lang === "jp" ? "第" + reso.turn + "ターン" : "tour n°" + reso.turn) + '</h2>' +
      '<p class="muted small">' + esc(pick(reso.clock) || "") + " · " + esc(pick(reso.place) || locTxt) + "</p>";
    if (dice.length) {
      var rolledCount = dice.filter(function (d, i) { return stDice[i]; }).length;
      h += '<p class="small">' + esc(T("diceIntro")) + '</p><div id="diceBox" class="roll-grid">' +
        dice.map(function (d, i) {
          var rolled = !!stDice[i];
          var tc = rolled ? dieTileClass(d) : { cls: "", crit: false };
          return '<div class="roll-cell">' +
            '<button type="button" class="roll-die' + (rolled ? " landed" + (tc.cls ? " " + tc.cls : "") + (tc.crit ? " crit" : "") : "") + '" data-die="' + i + '"' + (rolled ? " disabled" : "") + ' aria-label="' + esc(T("dieAria")) + '">' +
            '<span class="roll-in"><span class="roll-face">' + (rolled ? d.value : "?") + '</span><span class="roll-tag">d20</span></span></button>' +
            '<div class="roll-label"><span class="who">' + esc(d.who) + "</span>" +
            (d.action ? '<span class="what">' + esc(d.action) + "</span>" : "") +
            /* anti-spoiler : le verdict n'entre dans le DOM qu'une fois le dé lancé */
            (rolled && d.verdict ? '<span class="outcome' + (tc.cls ? " " + tc.cls : "") + '">' + esc(d.verdict) + "</span>" : "") +
            "</div>" +
            (rolled ? "" : '<button type="button" class="roll-one" data-roll="' + i + '">' + esc(T("rollOne")) + "</button>") +
            "</div>";
        }).join("") + "</div>" +
        '<div class="roll-actions"><button type="button" class="btn blue" id="rollAll">' + esc(T("rollAll")) + '</button>' +
        '<span class="small muted" id="rollProgress">' + esc(T("diceProgress").replace("{a}", rolledCount).replace("{b}", dice.length)) + "</span></div>";
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
  /* Actions du tour en cours + composer (bloc d'origine, synchronisé avec la copie du haut) */
  h += '<section class="card"><span class="pill">' + (lang === "jp" ? "第" + st.turn + "ターン" : "Tour n°" + st.turn) + "</span><h3>" + esc(T("composertitle")) + "</h3>";
  ["julien", "ryo"].forEach(function (slug) {
    var info = playerTurnInfo(slug);
    info.sent.forEach(function (a) {
      h += '<div class="action-line"><span class="al-who">' + esc(nameOf(slug)) + '</span> · <span class="muted small">' + esc(a.status || "") + "</span><br>" + esc(a.text) + "</div>";
    });
    if (info.draft) {
      h += '<div class="action-line"><span class="al-who">' + esc(nameOf(slug)) + '</span> · <span class="muted small">' + esc(T("draftLbl")) + "</span><br>" + esc(info.draft) + "</div>";
    }
  });
  h += composerHTML(COMPOSER_MAIN);
  h += "</section>";
  return h;
}
/* Classe de tuile façon démo : couleur selon le verdict, dorée si réussite nette. */
function dieTileClass(d) {
  var v = d.verdict || "";
  var cls = "";
  /* précédence alignée sur verdictClass() : le partiel (jaune) prime sur l'échec */
  if (/部分的|辛勝|partielle|justesse/.test(v)) cls = "mid";
  else if (/失敗|échec/.test(v)) cls = "bad";
  else if (/成功|réussite/.test(v)) cls = "ok";
  return { cls: cls, crit: /réussite nette|大成功|クリティカル|決定的|明確な成功/.test(v) };
}
function updateRollProgress() {
  var el = $("rollProgress"); if (!el) return;
  var reso = lastReso(); if (!reso) return;
  var dice = diceOf(reso); var stDice = diceState(reso.turn);
  var n = dice.filter(function (d, i) { return stDice[i]; }).length;
  el.textContent = T("diceProgress").replace("{a}", n).replace("{b}", dice.length);
}
var rollingNow = {};
/* Lancer façon démo : la tuile sautille (dieBounce) pendant que les valeurs
   défilent sur la face (~1 s), puis elle retombe sur sa vraie valeur (pop +
   étincelles) et le verdict est créé dans le DOM à cet instant seulement.
   La résolution ne se déverrouille (render) que lorsque tous les dés sont tombés. */
function rollDie(i) {
  var reso = lastReso(); if (!reso) return;
  var dice = diceOf(reso); var stDice = diceState(reso.turn);
  if (stDice[i] || rollingNow[i]) return;
  var d = dice[i]; if (!d) return;
  var btn = document.querySelector('[data-die="' + i + '"]');
  var one = document.querySelector('[data-roll="' + i + '"]');
  if (!btn) { var f0 = diceState(reso.turn); f0[i] = true; saveDiceState(reso.turn, f0); render(); return; }
  rollingNow[i] = true;
  if (one) one.disabled = true;
  btn.classList.add("rolling");
  btn.disabled = true;
  var face = btn.querySelector(".roll-face");
  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var iv = null;
  if (!reduced) iv = setInterval(function () { if (face) face.textContent = String(1 + Math.floor(Math.random() * 20)); }, 55);
  setTimeout(function () {
    if (iv) clearInterval(iv);
    delete rollingNow[i];
    var fresh = diceState(reso.turn); fresh[i] = true; saveDiceState(reso.turn, fresh);
    if (btn.isConnected) {
      if (face) face.textContent = String(d.value);
      btn.classList.remove("rolling");
      var tc = dieTileClass(d);
      btn.classList.add("landed", "pop");
      if (tc.cls) btn.classList.add(tc.cls);
      if (tc.crit) btn.classList.add("crit");
      if (d.verdict) {
        var label = btn.parentNode.querySelector(".roll-label");
        if (label && !label.querySelector(".outcome")) {
          var oc = document.createElement("span");
          oc.className = "outcome" + (tc.cls ? " " + tc.cls : "");
          oc.textContent = d.verdict;
          label.appendChild(oc);
        }
      }
      if (one) one.remove();
    }
    updateRollProgress();
    var now = diceState(reso.turn);
    if (dice.every(function (dd, j) { return now[j]; })) setTimeout(function () { render(); }, 750);
  }, reduced ? 200 : 1000);
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
  bindComposer(COMPOSER_MAIN);
  bindComposer(COMPOSER_TOP);
}
/* Liaison d'un formulaire d'action (bloc d'origine ou copie du haut).
   Après l'envoi, loadActions() + render() ré-affichent les deux blocs. */
function bindComposer(ids) {
  var send = $(ids.send);
  if (!send) return;
  send.addEventListener("click", function () {
    var txt = ($(ids.text).value || "").trim(); if (!txt) return;
    send.disabled = true; send.textContent = X("sending");
    sbPost("player_actions", { turn_number: DB.state.turn, trainer_slug: me, text: txt, status: "received" })
      .then(function () { return loadActions(); })
      .then(function () { render(); })
      .catch(function () { send.disabled = false; send.textContent = T("send"); $(ids.msg).innerHTML = '<div class="sent-ok" style="background:#fdecec;border-color:var(--red);color:#7f1d1d">' + esc(X("sendFail")) + "</div>"; });
  });
}

/* ================= Équipes ================= */
var MOVE_JP_INDEX = null;
function moveJp(nameFr) {
  if (lang === "fr") return nameFr;
  if (!MOVE_JP_INDEX) {
    MOVE_JP_INDEX = {};
    Object.keys(window.LEARNSETS || {}).forEach(function (sp) {
      window.LEARNSETS[sp].forEach(function (a) { var f = spFr(a.name); if (f && a.name && a.name.jp) MOVE_JP_INDEX[f] = a.name.jp; });
    });
    Object.keys(LS_AUTO).forEach(function (sp) {
      LS_AUTO[sp].forEach(function (a) { var f = spFr(a.name); if (f && a.name && a.name.jp) MOVE_JP_INDEX[f] = a.name.jp; });
    });
    Object.keys(window.MOVE_DB || {}).forEach(function (n) { /* noms seulement */ });
  }
  return MOVE_JP_INDEX[nameFr] || null;
}
function typeName(tFr) { return lang === "jp" ? ((window.TYPE_JP || {})[tFr] || tFr) : tFr; }
function typeColor(tFr) { return (window.TYPE_COLORS || {})[tFr] || "#888"; }
function typeInk(tFr) { return (window.TYPE_TEXT_DARK || {})[tFr] ? "#23255e" : "#fff"; }
function normName(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); }
function knownMoves(p) {
  var ls = (window.LEARNSETS || {})[spFr(p.species)] || LS_AUTO[spFr(p.species)] || [];
  var out = [], seen = {};
  ls.forEach(function (a) { if (a.n <= p.level) { var f = spFr(a.name); out.push({ nameFr: f, nameJp: (a.name && a.name.jp) || null, type: a.type, lvl: a.n }); seen[normName(f)] = 1; } });
  (p.moves || []).forEach(function (m) {
    var nFr = spFr(m.name), nJp = (m.name && typeof m.name === "object") ? m.name.jp : null;
    if (!seen[normName(nFr)]) { out.push({ nameFr: nFr, nameJp: nJp, type: m.type, lvl: null }); seen[normName(nFr)] = 1; }
  });
  return out;
}
/* Liste complète des attaques par montée de niveau : accessibles en évidence
   (avec compteur), futures grisées avec leur niveau d'apprentissage. */
function learnsetSection(p, ls) {
  if (!ls.length) return "";
  var known = ls.filter(function (a) { return a.n <= p.level; }).length;
  var rows = ls.map(function (a) {
    var ok = a.n <= p.level;
    var nm = lang === "jp" ? ((a.name && a.name.jp) || spFr(a.name)) : spFr(a.name);
    var inner = '<span class="ls-lvl">' + esc(T("learnAtLbl")) + " " + a.n + "</span>" +
      '<span class="ls-name">' + esc(nm) + "</span>" +
      '<span class="ls-type" style="background:' + typeColor(a.type) + ";color:" + typeInk(a.type) + '">' + esc(typeName(a.type)) + "</span>" +
      (ok ? '<span class="ls-ok">✓</span>' : "");
    return ok
      ? '<button type="button" class="ls-row" data-move="' + esc(spFr(a.name)) + '" data-type="' + esc(a.type) + '">' + inner + "</button>"
      : '<div class="ls-row locked">' + inner + "</div>";
  }).join("");
  return '<h3 style="margin-top:14px">' + esc(X("learnsetTitle")) + ' <span class="ls-count">' + known + " / " + ls.length + " " + esc(T("knownLbl")) + "</span></h3>" +
    '<div class="ls-list">' + rows + "</div>";
}
/* ============ Learnsets automatiques (espèces absentes des données locales) ============
   Règle de la partie : tout doit être automatique — capture, niveau gagné, nouvelle
   attaque apprise — sans que personne ait à demander. À l'ouverture de la fiche d'un
   Pokémon dont l'espèce n'a pas de learnset local validé, l'appli résout elle-même
   le learnset officiel depuis PokeAPI : attaques par montée de niveau du groupe de
   versions le plus récent disponible pour l'espèce (priorité à Écarlate/Violet),
   noms officiels FR + JP, types convertis vers les noms FR de l'appli. Le résultat
   est injecté dans LS_AUTO (même format que learnsets.js, donc knownMoves(),
   l'index JP et la section « Attaques par montée de niveau » s'en servent sans autre
   changement) et mis en cache dans localStorage, par n° de dex.
   Les espèces locales validées gardent TOUJOURS la priorité (choix de partie). */
var LS_AUTO = {};
var LS_AUTO_STATE = {};   /* espèce FR -> "loading" | "done" | "error" */
var LS_CACHE_KEY = "jdr-ryo-learnsets-v1";
var VG_PRIORITY = ["scarlet-violet", "legends-arceus", "brilliant-diamond-shining-pearl", "sword-shield", "lets-go-pikachu-lets-go-eevee", "ultra-sun-ultra-moon", "sun-moon", "omega-ruby-alpha-sapphire", "x-y", "black-2-white-2", "black-white", "heartgold-soulsilver", "platinum", "diamond-pearl", "firered-leafgreen", "emerald", "ruby-sapphire", "crystal", "gold-silver", "yellow", "red-blue"];
var TYPE_EN_FR = { normal: "Normal", fighting: "Combat", flying: "Vol", poison: "Poison", ground: "Sol", rock: "Roche", bug: "Insecte", ghost: "Spectre", steel: "Acier", fire: "Feu", water: "Eau", grass: "Plante", electric: "Électrik", psychic: "Psy", ice: "Glace", dragon: "Dragon", dark: "Ténèbres", fairy: "Fée" };
function lsCacheRead() { try { return JSON.parse(localStorage.getItem(LS_CACHE_KEY) || "{}"); } catch (e) { return {}; } }
function lsCacheWrite(dex, ls) { try { var c = lsCacheRead(); c[dex] = ls; localStorage.setItem(LS_CACHE_KEY, JSON.stringify(c)); } catch (e) {} }
function fetchJson(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }); }
function pokeName(names, langs) {
  for (var i = 0; i < langs.length; i++) {
    var hit = (names || []).filter(function (n) { return n.language && n.language.name === langs[i]; })[0];
    if (hit) return hit.name;
  }
  return null;
}
function resolveLearnset(dex) {
  return fetchJson("https://pokeapi.co/api/v2/pokemon/" + dex).then(function (pk) {
    var chosen = null;
    VG_PRIORITY.forEach(function (vg) {
      if (chosen) return;
      var has = (pk.moves || []).some(function (m) {
        return (m.version_group_details || []).some(function (v) { return v.version_group && v.version_group.name === vg && v.move_learn_method && v.move_learn_method.name === "level-up"; });
      });
      if (has) chosen = vg;
    });
    if (!chosen) return [];
    var byMove = {};
    (pk.moves || []).forEach(function (m) {
      (m.version_group_details || []).forEach(function (v) {
        if (!v.version_group || v.version_group.name !== chosen || !v.move_learn_method || v.move_learn_method.name !== "level-up") return;
        var parts = String(m.move.url || "").split("/").filter(Boolean);
        var id = parseInt(parts[parts.length - 1], 10);
        if (!id) return;
        var lvl = Math.max(1, v.level_learned_at || 0);
        if (!byMove[id] || lvl < byMove[id]) byMove[id] = lvl;
      });
    });
    var entries = Object.keys(byMove).map(function (k) { return { id: parseInt(k, 10), n: byMove[k] }; })
      .sort(function (a, b) { return a.n - b.n || a.id - b.id; });
    return Promise.all(entries.map(function (e) {
      return fetchJson("https://pokeapi.co/api/v2/move/" + e.id).then(function (mv) {
        var fr = pokeName(mv.names, ["fr"]);
        if (!fr) return null;
        var jp = pokeName(mv.names, ["ja-Hrkt", "ja"]) || fr;
        var tEn = mv.type && mv.type.name;
        return { n: e.n, name: { fr: fr, jp: jp }, type: TYPE_EN_FR[tEn] || (tEn ? tEn.charAt(0).toUpperCase() + tEn.slice(1) : "Normal") };
      });
    })).then(function (list) { return list.filter(Boolean); });
  });
}
function ensureLearnset(p) {
  var spF = spFr(p.species), dex = p.dex;
  if ((window.LEARNSETS || {})[spF] || !dex) return;               /* local validé : prioritaire, jamais écrasé */
  if (LS_AUTO_STATE[spF] === "done" || LS_AUTO_STATE[spF] === "error" || LS_AUTO_STATE[spF] === "loading") return;
  var cached = lsCacheRead()[dex];
  if (cached) {
    LS_AUTO[spF] = cached; LS_AUTO_STATE[spF] = "done"; MOVE_JP_INDEX = null;
    if (sheetPokeId === p.id && $("sheet")) pokeSheet(p);
    return;
  }
  LS_AUTO_STATE[spF] = "loading";
  resolveLearnset(dex).then(function (ls) {
    LS_AUTO[spF] = ls; LS_AUTO_STATE[spF] = "done"; MOVE_JP_INDEX = null;
    lsCacheWrite(dex, ls);
    if (sheetPokeId === p.id && $("sheet")) pokeSheet(p);
  }).catch(function () {
    LS_AUTO_STATE[spF] = "error";
    if (sheetPokeId === p.id && $("sheet")) pokeSheet(p);
  });
}
/* Section learnset de la fiche : locale si elle existe, résolue automatiquement
   sinon ; pendant la résolution (ou hors ligne), un état discret à la place. */
function learnsetBlock(p) {
  var spF = spFr(p.species);
  if ((window.LEARNSETS || {})[spF]) return learnsetSection(p, window.LEARNSETS[spF]);
  if (LS_AUTO_STATE[spF] === "done") return learnsetSection(p, LS_AUTO[spF] || []);
  var err = LS_AUTO_STATE[spF] === "error";
  return '<h3 style="margin-top:14px">' + esc(X("learnsetTitle")) + '</h3><p class="muted small">' + esc(err ? X("lsOffline") : X("lsLoading")) + "</p>";
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
var sheetPokeId = null;   /* id du Pokémon dont la fiche est ouverte (suivi pour la résolution auto) */
function closeSheet() { sheetPokeId = null; var s = $("sheet"); if (s) s.remove(); }
function moveSheet(nameFr, typeFr) {
  sheetPokeId = null;   /* la fiche d'attaque remplace la fiche Pokémon : plus de ré-affichage auto */
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
    learnsetBlock(p);
  openSheet(html); bindSheet();
  sheetPokeId = p.id;   /* après openSheet : son closeSheet() interne remet le suivi à zéro */
  ensureLearnset(p);   /* espèce sans learnset local : résolution automatique (no-op sinon) */
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
  var h = "<h1>" + esc(T("bagTitle")) + '</h1><p class="intro">' + esc(T("bagIntro")) + '</p><div class="bag-switch">' +
    ["julien", "ryo"].map(function (s) {
      var c = charOf(s) || {};
      return '<button type="button" data-bagview="' + s + '" class="bag-btn' + (slug === s ? " on" : "") + '" aria-pressed="' + (slug === s) + '">' +
        '<img class="bag-face" src="' + esc(c.img || "") + '" alt="">' +
        '<span class="bag-lbl">' + esc((T("bagOf") || "").replace("{name}", nameOf(s))) + "</span></button>";
    }).join("") + "</div>";
  var items = DB.items.filter(function (it) { return it.owner === slug && it.qty > 0; });
  h += '<section class="card"><span class="pill">' + esc(nameOf(slug)) + "</span>" +
    (items.length ? items.map(function (it) {
      var nm = it.name ? pick(it.name) : null;
      return '<div class="item-row">' + itemIconHTML(it) + '<div class="item-body">' +
        '<div class="item-name">' + esc(nm || "?") + (it.qty > 1 ? " <b>×" + it.qty + "</b>" : "") + "</div>" +
        (it.note && pick(it.note) ? '<p class="small muted item-note">' + esc(pick(it.note)) + "</p>" : "") + "</div></div>";
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
