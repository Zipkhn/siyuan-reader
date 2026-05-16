# siyuan-reader

Service Next.js + Auth.js qui sert les documents publiés (snapshots produits par l'extracteur) à des **lecteurs externes invités** par email (magic-link). Aucun contact direct avec Siyuan — lit uniquement les snapshots filesystem.

V1 — pour usage personnel. Spec : `docs/v1/architecture.md` sur la branche `custom/main` du fork Siyuan.

## Périmètre V1

- Auth par **magic-link Resend**, **invite-only** : un email inconnu ne reçoit pas de lien.
- Bootstrap : l'`ADMIN_EMAIL` (env) peut toujours se connecter, même sans invitation préalable (premier sign-in).
- Tables Drizzle : `users`, `projects`, `documents`, `user_projects` (+ tables Auth.js).
- Routes :
  - `/login` + `/login/verify` — magic-link UX.
  - `/` — liste des projets autorisés du user connecté.
  - `/[project]` — liste des documents du projet (filtrée par ACL).
  - `/[project]/[doc]` — rendu du HTML sanitisé.
  - `/api/admin/projects` (GET/POST) — créer/lister projets (admin only).
  - `/api/admin/invite` (POST) — inviter un user sur un projet (admin only).
  - `/api/admin/sync` (POST) — sync snapshots filesystem → table documents.
- DB **SQLite** (better-sqlite3 + WAL + foreign_keys ON). FTS5 et recherche → V1.1.
- UI sobre, Tailwind utility-first. Branding par projet → V1.1.

## Stack

- Next.js 15 (App Router) + React 19.
- Auth.js v5 (`next-auth@beta`) + adapter Drizzle, provider Resend.
- Drizzle ORM + drizzle-kit pour migrations.
- Tailwind CSS 3 + classes custom `.doc-html` pour le rendu du contenu publié.
- Zod pour la validation des envs et des bodies API.

## Configuration

Toutes les env vars passent par `src/env.ts` (validation au boot, fail-fast).

| Env | Required | Description |
|---|---|---|
| `DATABASE_URL` | oui | Chemin fichier SQLite. En Docker : `/data/reader/reader.db`. |
| `AUTH_SECRET` | oui | 32+ chars. `openssl rand -base64 32`. |
| `AUTH_URL` | recommandé | URL publique reader (pour les magic-link). |
| `AUTH_TRUST_HOST` | recommandé en dev | `true` derrière un proxy/Docker. |
| `RESEND_API_KEY` | oui | Clé Resend. |
| `AUTH_EMAIL_FROM` | oui | Sender vérifié sur Resend. |
| `SNAPSHOTS_DIR` | oui | Racine snapshots produits par l'extracteur (read-only OK). |
| `ADMIN_EMAIL` | oui | Email qui a accès aux endpoints `/api/admin/*` + bootstrap. |

## Premier setup

```bash
cp .env.example .env
# Édite .env. Génère AUTH_SECRET : openssl rand -base64 32
# Renseigne RESEND_API_KEY et ADMIN_EMAIL.

npm install
npm run db:push                      # crée le schéma SQLite
npm run dev                          # http://localhost:3000

# 1. Sign-in initial avec ADMIN_EMAIL → reçoit magic-link → connecté.
# 2. Créer un projet via curl (avec session cookie OU depuis l'UI quand on l'aura) :
curl -X POST http://localhost:3000/api/admin/projects \
  -H "Content-Type: application/json" \
  -H "Cookie: <copie depuis ton navigateur>" \
  -d '{"slug":"test","name":"Test","description":"Espace de test"}'
# 3. Inviter un user (ou toi-même) sur ce projet :
curl -X POST http://localhost:3000/api/admin/invite \
  -H "Content-Type: application/json" -H "Cookie: ..." \
  -d '{"email":"reader@example.com","projectSlug":"test"}'
# 4. Sync les snapshots produits par l'extracteur :
curl -X POST http://localhost:3000/api/admin/sync \
  -H "Content-Type: application/json" -H "Cookie: ..." \
  -d '{}'
```

> Note : pour V1, les actions admin se font via l'API (curl avec ton cookie de session). Une UI admin viendra plus tard.

## Build & prod

```bash
npm run build                 # next build (output: standalone)
node .next/standalone/server.js
```

Image Docker (multi-stage, runtime ≈ 200 MB) :
```bash
docker build -t siyuan-reader:latest .
```

## Flow d'auth complet

1. Lecteur va sur `/login`, saisit son email.
2. Auth.js appelle `signIn` callback :
   - Si email == `ADMIN_EMAIL` → bootstrap autorisé (toujours).
   - Sinon → vérifie que l'email existe dans `users` (créé par admin invite).
   - Si absent → refus.
3. Email envoyé via Resend avec un lien magique.
4. Clic sur le lien → token vérifié → session créée (DB strategy).
5. Redirect vers `/` → liste des projets via `user_projects` JOIN.

## Sécurité

- `AUTH_SECRET` jamais commité. Cookies session signés.
- Pas d'auto-signup : `signIn` callback rejette les emails inconnus.
- Endpoints `/api/admin/*` protégés par `requireAdmin` (compare `session.user.email` à `ADMIN_EMAIL`).
- `SNAPSHOTS_DIR` est monté en lecture seule côté reader (`:ro` dans le compose).
- `safeJoin()` dans `src/snapshots/fs.ts` refuse les `..` et autres path traversals.
- Validation Zod sur tous les bodies API.

## Limites V1 (à étendre)

- Pas d'UI admin (curl pour créer/inviter/sync).
- Pas de recherche full-text (FTS5 hors V1).
- Pas de branding par client (logo, couleurs, sous-domaine).
- Pas d'audit log (qui a lu quoi).
- Sync snapshots manuel (admin endpoint) — pas de file watcher.
