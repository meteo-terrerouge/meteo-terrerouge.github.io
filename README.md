# Bulletin local Météo-France

Utilise les API de données ouvertes de Météo-France et Open-Meteo pour les tendances de J+8 à J+16.

La collecte des API météo peut utiliser GitHub Actions ou un serveur personnel.
Le site peut être hébergé sur GitHub Pages ou sur un autre hébergement, dont ce serveur.

## Prérequis

1. Sur le [portail API Météo-France](https://portail-api.meteofrance.fr/web/), souscrire aux API suivantes, puis générer un jeton de type **API Key** :
   - Modèle AROME ;
   - Modèle ARPEGE ;
   - Modèle AROME Prévision d’Ensemble ;
   - Modèle ARPEGE Prévision d’Ensemble ;
   - Modèle AROME Prévision Immédiate Agrégée Fusionnée (PIAF) ;
   - Bulletin Vigilance.

2. Prévoir un **jeton GitHub personnel à permissions fines**, limité au fork créé lors de l’installation, avec les permissions **Actions, Contents et Workflows en lecture et écriture**.

## Installation

1. Forker ce dépôt et nommer le fork `<compte>.github.io` pour l’adresse `https://<compte>.github.io/`.
2. Copier `site.private.example.conf` dans `site.private.conf`. Renseigner les paramètres du site, `meteoFranceToken` avec la clé Météo-France et `githubToken` avec le jeton GitHub.
3. Dans **Settings → Secrets and variables → Actions**, créer le secret **`BULLETIN_CONFIG`** contenant l’intégralité du fichier. Conserver le fichier privé, sans le commiter.
4. Activer les workflows dans **Actions**.
5. Dans **Settings → Pages → Build and deployment → Source**, sélectionner **GitHub Actions**.
6. Lancer le workflow **Préparer les données météo** avec `group: all` et `publish: true`.

Une fois le workflow terminé, le site est accessible à **`https://<compte>.github.io/`**. Les données météo sont ensuite actualisées automatiquement.

## Choix de collecte et d’hébergement

Chaque installation conserve sa configuration privée. Les anciennes configurations
continuent à utiliser GitHub Actions et les fichiers JSON locaux sans modification.

| Fonction | Choix prévus |
| --- | --- |
| Requêtes des API météo | GitHub Actions ou serveur personnel |
| Nowcasting et images radar | Module optionnel sur serveur personnel uniquement |
| Archives | Module optionnel sur serveur personnel uniquement |
| Hébergement du site | GitHub Pages ou hébergement externe, notamment le serveur personnel |

Le nowcasting avec images radar et les archives sont deux modules distincts,
combinables. Leur activation, leurs services et leur stockage seront indépendants
du mode de collecte des API météo et de l’hébergement du site. **Cette version
ajoute le choix de collecte API et le serveur météo ; elle n’active ni n’implémente
les modules nowcasting/radar et archives.** Les clés Météo-France restent dans le
processus de collecte, jamais dans le navigateur.

### API collectées par le serveur personnel

Dans `site.private.conf`, renseigner les champs suivants dans `site` :

```json
{
  "name": "Mon bulletin météo",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "department": "75",
  "publicUrl": "https://meteo.exemple.fr/",
  "apiMode": "server",
  "apiBaseUrl": "https://meteo.exemple.fr/"
}
```

Cet extrait est l’objet `site`, à placer dans le fichier privé existant avec
`meteoFranceToken`. Pour une installation entièrement sur serveur, `githubToken`
et `site.githubRepository` peuvent être omis. Si le site reste sur GitHub Pages,
conserver ces paramètres et indiquer son adresse dans `publicUrl`.

Sur le serveur avec Node.js 22 ou ultérieur, installer les dépendances puis
construire et servir le site avec **le même fichier privé**, conservé hors de `dist` :

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build -- --config=/etc/meteo/site.private.conf
npm run serve -- --config=/etc/meteo/site.private.conf --site=dist --state=/var/lib/meteo/weather.json --port=8080
```

Le serveur écoute par défaut sur `127.0.0.1`. Placer un reverse proxy HTTPS
(par exemple Nginx ou Caddy) devant lui et le gérer comme un service redémarré
automatiquement. Les chemins publics de `publicUrl` et `apiBaseUrl` doivent être
transmis au serveur sans réécriture. Pour ne fournir que les API à un site hébergé
ailleurs, omettre `--site=dist` ; le serveur autorise les lectures depuis l’origine
de `publicUrl` par CORS. Une seule installation est servie par processus.

Le processus vérifie les sources chaque minute, en respectant leurs cadences
existantes (PIAF environ toutes les cinq minutes ; modèles selon leur cadence).
PIAF et les modèles utilisent deux traitements indépendants : un téléchargement
long de modèles ne bloque pas PIAF, et deux passages du même traitement ne se
chevauchent pas. Les sauvegardes fusionnent chaque source sans revenir à une
acquisition plus ancienne. Les acquisitions réussies sont
enregistrées au fur et à mesure dans le cache privé ; une panne partielle conserve
les acquisitions précédentes, avec leurs dates réelles. Le site relit le tableau
de bord chaque minute, sans reconstruction ni nouvelle publication.

En mode `server`, le workflow GitHub programmé ne collecte ni ne publie. Une
publication manuelle du code reste possible pour les installations GitHub Pages,
sans lancer de collecte météo supplémentaire. La mise à jour du code sur le
serveur personnel reste une opération à effectuer par son administrateur.

### Site externe avec collecte GitHub Actions

Conserver `apiMode: "github-actions"` et renseigner `apiBaseUrl` avec l’adresse
GitHub Pages qui fournit les données, par exemple `https://compte.github.io/`.
Construire le site avec `npm run build -- --config=...`, puis servir le contenu de
`dist` sur votre hébergement statique. Les fichiers sont lus à
`https://compte.github.io/data/dashboard.json`, `week.json` et `config.json`.
L’origine qui fournit ces JSON doit autoriser la lecture depuis le site (CORS).
Sans `apiBaseUrl`, les JSON sont lus dans le dossier `data/` du site courant.

Le choix de l’hébergement ne change donc pas le choix du collecteur. Aucun jeton
GitHub n’est nécessaire pour exécuter une installation entièrement sur serveur.

## Licence

Copyright (C) 2026 nicklausFR.

Le code source de ce projet est distribué sous la licence **GNU General Public License version 3 uniquement (GPL-3.0-only)**. Vous pouvez le redistribuer et le modifier selon les termes du fichier [LICENSE](LICENSE).

Ce programme est distribué sans aucune garantie, dans les limites prévues par cette licence.

Les composants tiers conservent leurs licences respectives, notamment celles indiquées dans `THIRD_PARTY` et `public/vendor`. Les données et services météo restent soumis aux conditions de leurs fournisseurs.
