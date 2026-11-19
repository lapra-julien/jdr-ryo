/* Service worker de l'appli partagée JDR Pokémon avec Ryo.
   Rôle UNIQUE : recevoir les notifications push du MJ et ouvrir l'appli au clic.
   Volontairement AUCUN cache et AUCUN handler fetch : le code de l'appli est
   toujours servi frais par GitHub Pages, pour éviter tout écart de version
   entre les deux joueurs (leçon des correctifs de dés). */
"use strict";

self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {
    try { data = { body: event.data ? event.data.text() : "" }; } catch (e2) { data = {}; }
  }
  var title = data.title || "Pokémon Neko";
  var options = {
    body: data.body || "",
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png",
    tag: "mj-reso-" + (data.turn || "x"),
    data: { url: data.url || "./", turn: data.turn || null }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf("/jdr-ryo/") >= 0 || c.url.indexOf(self.registration.scope) >= 0) {
          if ("focus" in c) return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
