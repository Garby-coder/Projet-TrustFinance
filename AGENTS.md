# TF-Portal / Formation Finance Pro — Project Guidance (AGENTS.md)

## Objectif produit
Livrer un MVP stable, simple et itératif d’un portail élève (3 onglets) :
1) Mes séances
2) Ma formation
3) Statistiques
Tout en français.

## Stack & infra
- Front : Vite + React + TypeScript
- Auth + DB : Supabase (RLS activé)
- Déploiement : Netlify (prod)
- Repo : Garby-coder/Projet-TrustFinance

## Règles non négociables (à respecter systématiquement)
- Ne pas casser l’existant (login, routing, navigation, pages).
- Ne pas ajouter de dépendances sans demande explicite.
- Ne pas toucher au schéma DB / policies / paramètres Supabase sauf demande explicite.
  - Si une feature nécessite un changement DB : proposer un SQL minimal + expliquer.
- Ne jamais committer `.env.local` / `.env*` / aucune clé.
- Toujours vérifier `npm run build` avant push.
- Petits changements, réversibles. Éviter les refactors lourds.

## Netlify / SPA routing
- Build command : `npm run build`
- Publish dir : `dist`
- SPA routing : `public/_redirects` doit contenir `/* /index.html 200`

## Sécurité (Supabase / RLS)
- `lessons` : lecture pour `authenticated` (éventuellement filtrage `is_published`)
- `tasks`, `sessions`, `lesson_progress`, `module_quiz_progress` :
  chaque élève ne voit/modifie que ses lignes (auth.uid() = user_id)
- Toute écriture côté élève doit passer par RLS (pas de contournement).

## Données (schéma actuel)
- lessons : supporte `content_type` (video/lecture), `tella_url` nullable, `content_markdown` pour lecture, `module_id`
- modules : modules de formation
- module_quizzes, quiz_questions, quiz_choices : quiz par module
- module_quiz_progress : réussi/pas réussi (par user/module)

## Conventions UX (sans focus design)
- Garder l’UX simple, claire, et stable.
- Les actions “lien externe” (Calendly) doivent ouvrir dans un nouvel onglet via `<a href target="_blank" rel="noreferrer">`.
- Gestion des états : loading / empty / error en français.
- Ne pas introduire de complexité inutile (pagination plus tard, admin plus tard).

## Workflow attendu (à suivre à chaque ticket)
1) Travailler sur une branche feature (ex: `feat-...`).
2) Modifier le minimum de fichiers possible (idéalement 1 fichier par itération).
3) Review des changements (diff) avant commit.
4) Tester en local (`npm run dev` + test manuel sur la page concernée).
5) Vérifier build (`npm run build`).
6) Commit clair, puis push.
7) Merge vers `main` uniquement quand validé (Netlify déploie `main`).

## Instructions pour Codex (très important)
- Toujours annoncer les fichiers modifiés.
- Ne pas créer de nouveaux fichiers sauf demande.
- Ne pas modifier le routing / App.tsx sans demande.
- Ne pas toucher au bootstrap (ensureDefaultsForUser) sans demande.
- Si une table/colonne peut manquer en prod, prévoir un fallback “ne pas casser l’écran” (message + comportement dégradé).