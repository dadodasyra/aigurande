# Aigurande Cadastre Map

Une application cartographique web interactive permettant de visualiser des données de parcelles cadastrales et d'y associer des notes synchronisées. 

## Fonctionnalités
- Affichage mobile-first d'une carte interactive (via Leaflet) centrée sur la zone Aigurande / Crozon.
- Chargement et survol des polygones de zones interactives à partir d'un fichier local GeoJSON (`assets/merged_crozon_aigurande.json`).
- Boutons de géolocalisation de l'utilisateur (avec indication de la précision en mètres) et de recentrage rapide.
- Tiroir interactif d'information de parcelles redimensionnable.
- Système d'authentification robuste. L'administrateur peut créer des comptes pour ses collaborateurs.
- Sélecteur de fonds de plan (OpenStreetMap, IGN, Sattelite 1 et 2).
- Ajout de notes : 
  - **Note Commune** : Une note partagée et éditable par toutes les personnes du projet.
  - **Notes Individuelles** : Liste de messages avec horodatage automatique au fuseau de Paris.
- **Support Offline** : En cas de perte de connexion réseau au milieu du terrain, vos nouvelles notes individuelles sont conservées localement et se synchroniseront avec le serveur dès le retour d'accès internet !

## Architecture technique
- **Backend** : Serveur Node.js utilisant le framework `express`.
- **Base de données** : Fichier local `SQLite` (`database.sqlite`) généré automatiquement au premier lancement.
- **Frontend** : Pur HTML/CSS/JS pour une légèreté maximale sur mobile, rendu dynamique avec `Leaflet`.
- **Sécurité** : Chiffrement des mots de passe avec `bcrypt` et authentification par `JSON Web Tokens (JWT)`.

## Comment déployer

### Prérequis
- [Node.js](https://nodejs.org/) installé sur votre machine.

### Lancement
1. Placez les fichiers du projet dans un dossier de votre choix.
2. Ouvrez un terminal dans ce dossier et installez les paquets requis :
   ```bash
   npm install
   ```
3. Démarrez le serveur (il va automatiquement créer le fichier `database.sqlite` s'il n'existe pas) :
   ```bash
   npm start
   ```
4. Ouvrez votre navigateur et accédez à [http://localhost:3000](http://localhost:3000) (ou via l'adresse IP locale de l'ordinateur hébergeur si vous consultez avec votre téléphone).

*(Le premier compte par défaut pour lancer vos notes est **Nom d'utilisateur :** `admin` avec le **Mot de passe :** `admin123`).* Vous pourrez ensuite en créer des nouveaux en cliquant sur l'engrenage "⚙️" apparu en haut à droite !

## Crédits
Ce projet a été intégralement pensé et développé par Intelligence Artificielle, via **GitHub Copilot** propulsé par le modèle **Gemini 3.1 Pro**.
