// Configuration Supabase — valeurs publiques (conçues pour être embarquées dans l'appli).
// Projet « jdr-ryo » (organisation lapra-julien, région Northeast Asia Tokyo), créé le 2026-11-19.
window.APP_CONFIG = {
  SUPABASE_URL: "https://ijfocucogltelxmzliax.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqZm9jdWNvZ2x0ZWx4bXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNDI5MTcsImV4cCI6MjExMDYxODkxN30.W2MeGlWhSZZGNj5fwZU04mgUQaKI3QVGL7kYa1xeOk8",
  // Clé PUBLIQUE VAPID des notifications push (la clé privée reste hors du site,
  // dans ~/workspace/jdr-ryo-shared-app/private/vapid.json — jamais publiée).
  VAPID_PUBLIC_KEY: "BK2KzhrmGUBr5-2aCil7oZZbSYC9l2Lp4JPgFaUvLNcMs0P6SDKj2sUKv2BnAOCGl2Gw5k81Bzsq8UCsxUrATts",
  APP_URL: "https://lapra-julien.github.io/jdr-ryo/"
};
