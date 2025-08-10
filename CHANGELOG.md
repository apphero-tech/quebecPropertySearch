# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-12-19

### 🚀 Ajouté
- **Nouvelle fonctionnalité majeure : Recherche par Propriétaire**
  - Recherche par nom de famille (personne physique ou morale)
  - Recherche combinée nom + prénom
  - Autocomplétion intelligente des propriétaires avec debouncing (300ms)
  - Support des propriétaires multiples (2+ propriétaires)
  - Gestion des types : personnes physiques, morales, gouvernement, organismes religieux, fiducies
  - Formatage intelligent des adresses complètes des propriétaires

- **Mapping MongoDB complet (100% des champs)**
  - Section Propriétaire : TOUS les champs RL0201x (A-X, U) maintenant mappés
  - Champs précédemment manquants : RL0201Fx, RL0201Jx, RL0201Lx, RL0201Nx, RL0201Ox, RL0201Px, RL0201Qx, RL0201Rx, RL0201Sx, RL0201Tx
  - Section Évaluateur : Champs RL060x complètement intégrés
  - Caractéristiques avancées : RL030x étendus (étages, année construction, qualité, etc.)
  - Sections annexes : RLZU et RLZG entièrement traités

- **Améliorations de l'affichage**
  - Formatage intelligent des adresses complètes propriétaires
  - Support des numéros d'appartement, fractions, compléments d'adresse
  - Libellés explicites pour les statuts et conditions
  - Gestion robuste des propriétaires multiples
  - Interface utilisateur enrichie avec toutes les données disponibles

### 🔧 Modifié
- **Synchronisation complète HTML/JavaScript**
  - Template HTML entièrement synchronisé avec les données JavaScript
  - Tous les champs MongoDB extraits sont maintenant affichés
  - Structure des sections réorganisée pour une meilleure lisibilité

- **Amélioration de la gestion des erreurs**
  - Gestion robuste des propriétaires multiples
  - Validation améliorée des formulaires de recherche
  - Messages d'erreur plus informatifs

### ✅ Maintenu
- **Recherche par Adresse** : Fonctionnelle et optimisée
- **Recherche par Matricule** : Fonctionnelle
- **Recherche par Lot** : Fonctionnelle
- **Compatibilité Flow Builder** : Maintenue avec toutes les propriétés de sortie
- **Interface responsive** : Adaptée mobile et desktop

### 📚 Documentation
- **README.md** : Complètement mis à jour pour la v2.0
- **Nouvelles sections** : Utilisation de la recherche par propriétaire, structure des données MongoDB
- **Exemples d'utilisation** : Instructions détaillées pour toutes les fonctionnalités

### 🚀 Déploiement
- **Deploy ID** : `0Afa500002OkmysCAB`
- **Org cible** : `eva-dev_jerome@apphero.tech`
- **Temps de déploiement** : 2.19 secondes
- **Statut** : Succès complet

---

## [1.0.0] - 2024-12-19

### 🚀 Ajouté
- **Fonctionnalité de base : Recherche par Adresse**
  - Recherche par voie publique + numéro civique
  - Autocomplétion des rues avec debouncing (300ms)
  - Formatage d'adresse selon le standard Canada Poste

- **Interface utilisateur de base**
  - Composant LWC respectant SLDS
  - Interface responsive et accessible
  - Affichage des résultats en sections accordion

- **Intégration Flow Builder**
  - Compatible avec `lightning__FlowScreen`
  - Propriétés de sortie pour la sélection de propriétés

### 🔧 Modifié
- **Mapping MongoDB de base**
  - Extraction des champs principaux (RL0101x, RL0201x, RL040x)
  - Structure de données simplifiée

### 📚 Documentation
- **README.md** : Documentation de base du composant
- **Instructions de déploiement** : Utilisation de la SF CLI

---

## Notes de version

### Version 2.0.0
Cette version constitue une **amélioration majeure** avec :
- Nouvelle fonctionnalité de recherche par propriétaire
- Mapping de données MongoDB complet
- Interface utilisateur enrichie
- Gestion robuste des propriétaires multiples

**Cette version est prête pour la production** et peut servir de référence stable dans le dépôt guide.

### Version 1.0.0
Version initiale avec les fonctionnalités de base de recherche par adresse et l'intégration Flow Builder.
