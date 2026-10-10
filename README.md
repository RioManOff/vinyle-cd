# Ma Collection — vinyles & CD

Un petit site privé pour ranger ta collection de **vinyles** et de **CD**, à deux (toi et ta femme), depuis vos téléphones.
Il tourne gratuitement sur **GitHub Pages**, et les données sont partagées grâce à **Supabase**.

Adresse du site : `https://riomanoff.github.io/vinyle-cd/`

---

## 🔄 Mettre à jour depuis la version précédente (3 étapes)

**1. Mettre à jour la base (une fois, 1 minute)**
Supabase → ton projet → **SQL Editor** → **New query** → colle tout le contenu de `supabase.sql` → **Run**.
Tu peux le relancer autant de fois que tu veux : il **ne supprime rien** et ne touche pas à tes disques.

**2. Envoyer les nouveaux fichiers sur GitHub**
Dézippe l'archive, puis sur GitHub : ton dépôt `vinyle-cd` → **Add file** → **Upload files** → glisse **tous les fichiers** (pas le .zip lui-même) → **Commit changes**.
Les fichiers qui existent déjà sont remplacés. `config.js` est déjà rempli avec les infos de ton projet.

**3. Recharger**
Attends 1 à 2 minutes que GitHub Pages se mette à jour, ouvre le site et tire l'écran vers le bas pour recharger.
Tes disques et tes photos sont toujours là.

---

## ✨ Ce que fait le site

- **Deux onglets** : Vinyles et CD, avec le nombre de disques. Une couleur par format (ambre / turquoise).
- **Recherche instantanée** : titre, artiste, année, genre, notes — sans se soucier des accents ni des majuscules. Si rien n'est trouvé ici, le site t'indique s'il y a un résultat dans l'autre onglet.
- **Ajout en 10 secondes** : tape « Daft Punk Discovery » dans *Trouver la pochette en ligne*, touche le bon résultat : titre, artiste, année, genre et pochette se remplissent tout seuls. Tu peux aussi **prendre une photo** avec l'appareil ou choisir une image de la galerie.
- **Favoris** ♥, **filtre par genre**, **tri** (artiste, titre, année, derniers ajoutés), vue **grille** ou **liste**.
- **Fiche détaillée** avec modification, suppression (avec bouton « Annuler » pendant quelques secondes) et liens pour écouter sur Spotify / YouTube.
- **Synchronisation en direct** : si ta femme ajoute un disque, il apparaît sur ton téléphone sans recharger.
- **Alerte doublons** quand tu ajoutes un album que vous avez déjà.
- **Statistiques** (artistes, genres, décennies) et **export CSV** (ouvrable dans Excel) depuis le menu ⋯.
- **Thème** automatique, clair ou sombre.
- **Installable** comme une application sur l'écran d'accueil.
- Photos réduites automatiquement (1200 px) avec une miniature légère (360 px) : le site reste rapide même avec des milliers de disques.

## 📱 Ajouter à l'écran d'accueil

- **iPhone (Safari)** : bouton **Partager** → **Sur l'écran d'accueil**.
- **Android (Chrome)** : menu ⋮ → **Installer l'application** (ou **Ajouter à l'écran d'accueil**).

---

## 🆘 Si ça ne marche pas

| Ce que tu vois | Ce qu'il faut faire |
|---|---|
| « Configuration à faire » | `config.js` n'a pas été envoyé sur GitHub (ou contient encore « TON-PROJET »). Renvoie le fichier fourni. |
| « Connexion impossible — la bibliothèque Supabase n'a pas pu se charger » | Vérifie ta connexion internet, ou désactive le bloqueur de publicités pour ce site. |
| « La base de données n'est pas à jour » | Relance `supabase.sql` dans le SQL Editor (étape 1 ci-dessus). |
| « Impossible de joindre le serveur » | Sur l'offre gratuite, Supabase **met le projet en pause** après une semaine sans activité. Dans le tableau de bord Supabase, clique sur **Restore project**. |
| « Email ou mot de passe incorrect » | Supabase → **Authentication → Users** : vérifie l'email, et utilise **Send password recovery** ou recrée l'utilisateur au besoin. |
| La recherche de pochette ne répond pas | Les services en ligne sont parfois indisponibles. Remplis les champs à la main ou prends la pochette en photo : ça marche toujours. |
| Ancienne version affichée | Ferme complètement l'application / l'onglet et rouvre-la. Le site vérifie toujours s'il y a du nouveau quand tu as du réseau. |

---

## 🔒 À savoir

- La **clé publique** (`sb_publishable_…`) dans `config.js` est faite pour être visible : elle ne permet rien sans être connecté. Ce qui protège tes données, c'est **la connexion** et les règles de sécurité créées par `supabase.sql`.
- Le dépôt GitHub doit être **public** (condition de GitHub Pages gratuit). Ne mets **jamais** la clé « secret » / `service_role` dans un fichier.
- Dans Supabase → **Authentication → Sign In / Providers**, laisse **désactivé** « Allow new users to sign up » : seuls vous deux (comptes créés dans *Authentication → Users*) pouvez vous connecter.
- Les **photos sont privées** : elles sont stockées dans un espace Supabase accessible uniquement aux utilisateurs connectés.
- Les informations et pochettes proposées en ligne viennent d'**iTunes**, de **MusicBrainz** et de **Cover Art Archive**. Quand c'est possible, la pochette choisie est **copiée dans ton Supabase** pour rester disponible même si ces services changent.
- Pense à faire un **export CSV** de temps en temps : c'est ta sauvegarde.

## 🗂️ Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `script.js` | Le site |
| `config.js` | L'adresse et la clé publique de ton projet Supabase |
| `supabase.sql` | Crée / met à jour la base, les photos et les règles de sécurité (relançable sans risque) |
| `manifest.json`, `sw.js`, `icon*.png`, `icon.svg`, `apple-touch-icon.png` | Installation sur l'écran d'accueil et icônes |

Tout est à la racine du dépôt (pas de sous-dossiers), pour que l'envoi par le navigateur reste simple.

## 🙏 Crédits

Icônes dérivées de [Feather](https://feathericons.com) (licence MIT) · [supabase-js](https://github.com/supabase/supabase-js) (licence MIT) · pochettes et informations : iTunes Search API, [MusicBrainz](https://musicbrainz.org) et [Cover Art Archive](https://coverartarchive.org).
