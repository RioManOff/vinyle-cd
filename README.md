# Ma Collection

Site pour ranger ses **vinyles** et ses **CD**, avec barre de recherche et photos prises depuis le téléphone.
La collection est stockée sur **Supabase** : elle est partagée entre tous vos appareils et protégée par mot de passe.

## Fichiers

- `index.html` : la page
- `style.css` : le design
- `script.js` : le fonctionnement
- `config.js` : l'adresse et la clé de ton projet Supabase (à remplir)
- `supabase.sql` : la base de données à créer une fois

## 1. Créer le projet Supabase

1. Va sur https://supabase.com, crée un compte puis **New project** (plan gratuit).
2. Ouvre **SQL Editor → New query**, colle tout le contenu de `supabase.sql`, puis **Run**.
3. Ouvre **Authentication → Users → Add user → Create new user**. Crée un utilisateur pour toi et un pour ta femme (email + mot de passe, coche « Auto Confirm User »).
4. Ferme les inscriptions pour que personne d'autre ne puisse créer de compte : **Authentication → Sign In / Providers** (ou Settings), désactive **Allow new users to sign up**.
5. Ouvre **Project Settings → API** et copie :
   - **Project URL**
   - la clé publique (**anon** ou **publishable**). Jamais la clé `service_role`.
6. Colle ces deux valeurs dans `config.js`.

## 2. Mettre en ligne sur GitHub Pages

1. Crée un dépôt GitHub (ex. `ma-collection`) et envoie tous les fichiers à la racine.
2. **Settings → Pages**, « Deploy from a branch », branche `main`, dossier `/ (root)`, Save.
3. Le site est sur `https://TON-PSEUDO.github.io/ma-collection/`.

## Bon à savoir

- La clé publique dans `config.js` peut être visible sans danger : sans connexion, la base et les photos refusent tout accès.
- Sur le plan gratuit, Supabase met le projet en pause après environ une semaine sans activité. Il se relance en un clic depuis le tableau de bord.
- Les photos sont réduites (1000 px max) pour économiser l'espace gratuit.
