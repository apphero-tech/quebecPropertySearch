// Analyse complète des données MongoDB pour identifier les informations manquantes
System.debug('=== ANALYSE COMPLÈTE DES DONNÉES MONGODB ===');

// Configuration
String municipalityCode = 'Kirkland';
String apiKey = 'PcIRmLSCoH19AAfigHkpTeM66kL6dgO4B1L6htUa';

// Test avec l'adresse principale
Map<String, Object> property = AddressSearchController.getPropertyDetails('HYMUS', '17200', municipalityCode, apiKey);

if (property != null) {
    System.debug('✅ Document MongoDB récupéré avec succès');
    System.debug('Clés principales du document: ' + property.keySet());
    
    // Analyse de la structure RLUEx
    if (property.containsKey('RLUEx')) {
        Map<String, Object> rluex = (Map<String, Object>) property.get('RLUEx');
        System.debug('Clés RLUEx: ' + rluex.keySet());
        
        // === SECTION 1: IDENTIFICATION DE L'UNITÉ D'ÉVALUATION ===
        System.debug('\n📍 SECTION 1: IDENTIFICATION DE L\'UNITÉ D\'ÉVALUATION');
        
        // RL0101 - Adresse
        if (rluex.containsKey('RL0101')) {
            Map<String, Object> rl0101 = (Map<String, Object>) rluex.get('RL0101');
            if (rl0101.containsKey('RL0101x')) {
                Map<String, Object> address = (Map<String, Object>) rl0101.get('RL0101x');
                System.debug('RL0101x - Adresse complète: ' + address);
            }
        }
        
        // RL0103 - Matricule
        if (rluex.containsKey('RL0103')) {
            Map<String, Object> rl0103 = (Map<String, Object>) rluex.get('RL0103');
            if (rl0103.containsKey('RL0103x')) {
                Map<String, Object> matricule = (Map<String, Object>) rl0103.get('RL0103x');
                System.debug('RL0103x - Matricule: ' + matricule);
            }
        }
        
        // RL0104 - Numéro de lot
        if (rluex.containsKey('RL0104')) {
            Map<String, Object> rl0104 = (Map<String, Object>) rluex.get('RL0104');
            System.debug('RL0104 - Numéro de lot: ' + rl0104);
        }
        
        // RL0105A, RL0106A, RL0107A
        System.debug('RL0105A - Numéro d\'ordre: ' + rluex.get('RL0105A'));
        System.debug('RL0106A - Numéro de dossier: ' + rluex.get('RL0106A'));
        System.debug('RL0107A - Numéro de cadastre: ' + rluex.get('RL0107A'));
        
        // === SECTION 2: IDENTIFICATION DU PROPRIÉTAIRE ===
        System.debug('\n👤 SECTION 2: IDENTIFICATION DU PROPRIÉTAIRE');
        
        if (rluex.containsKey('RL0201')) {
            Map<String, Object> rl0201 = (Map<String, Object>) rluex.get('RL0201');
            System.debug('RL0201 - Clés: ' + rl0201.keySet());
            
            if (rl0201.containsKey('RL0201x')) {
                Map<String, Object> owner = (Map<String, Object>) rl0201.get('RL0201x');
                System.debug('RL0201x - Propriétaire complet: ' + owner);
                
                // Analyse détaillée des champs du propriétaire
                System.debug('RL0201Ax - Nom: ' + owner.get('RL0201Ax'));
                System.debug('RL0201Bx - Prénom: ' + owner.get('RL0201Bx'));
                System.debug('RL0201Cx - Adresse: ' + owner.get('RL0201Cx'));
                System.debug('RL0201Dx - Ville: ' + owner.get('RL0201Dx'));
                System.debug('RL0201Ex - Code postal: ' + owner.get('RL0201Ex'));
                System.debug('RL0201Gx - Date d\'acquisition: ' + owner.get('RL0201Gx'));
                System.debug('RL0201Hx - Type de propriétaire: ' + owner.get('RL0201Hx'));
                System.debug('RL0201Ix - Numéro civique: ' + owner.get('RL0201Ix'));
                System.debug('RL0201Kx - Type de voie: ' + owner.get('RL0201Kx'));
                System.debug('RL0201Mx - Nom de rue: ' + owner.get('RL0201Mx'));
            }
            
            System.debug('RL0201U - Nombre de propriétaires: ' + rl0201.get('RL0201U'));
        }
        
        // === SECTION 3: CARACTÉRISTIQUES DU TERRAIN ===
        System.debug('\n🌍 SECTION 3: CARACTÉRISTIQUES DU TERRAIN');
        System.debug('RL0301A - Mesure frontale: ' + rluex.get('RL0301A'));
        System.debug('RL0302A - Superficie: ' + rluex.get('RL0302A'));
        System.debug('RL0303A - Facteur d\'ajustement: ' + rluex.get('RL0303A'));
        
        // Vérifier s'il y a d'autres champs de terrain
        List<String> terrainFields = new List<String>{'RL0306A', 'RL0307A', 'RL0307B', 'RL0308A', 'RL0309A', 'RL0310A', 'RL0311A'};
        for (String field : terrainFields) {
            if (rluex.containsKey(field)) {
                System.debug(field + ' - Valeur: ' + rluex.get(field));
            }
        }
        
        // === SECTION 4: VALEURS PORTÉES AU RÔLE ===
        System.debug('\n💰 SECTION 4: VALEURS PORTÉES AU RÔLE');
        System.debug('RL0401A - Date de référence: ' + rluex.get('RL0401A'));
        System.debug('RL0402A - Valeur du terrain: ' + rluex.get('RL0402A'));
        System.debug('RL0403A - Valeur du bâtiment: ' + rluex.get('RL0403A'));
        System.debug('RL0404A - Valeur de l\'immeuble: ' + rluex.get('RL0404A'));
        System.debug('RL0405A - Valeur imposable: ' + rluex.get('RL0405A'));
        
        // === SECTION 5: EXONÉRATIONS ===
        System.debug('\n🏛️ SECTION 5: EXONÉRATIONS');
        System.debug('RL0501A - Valeur exonérée: ' + rluex.get('RL0501A'));
        
        if (rluex.containsKey('RL0504')) {
            Map<String, Object> rl0504 = (Map<String, Object>) rluex.get('RL0504');
            if (rl0504.containsKey('RL0504x')) {
                List<Object> exemptions = (List<Object>) rl0504.get('RL0504x');
                System.debug('RL0504x - Nombre d\'exonérations: ' + exemptions.size());
                for (Integer i = 0; i < exemptions.size(); i++) {
                    Map<String, Object> exemption = (Map<String, Object>) exemptions[i];
                    System.debug('Exonération ' + (i+1) + ': ' + exemption);
                }
            }
        }
        
        // === INFORMATIONS ANNEXABLES UNITÉ ===
        System.debug('\n🏢 INFORMATIONS ANNEXABLES UNITÉ');
        if (rluex.containsKey('RENSEIGNEMENTS_ANNEXABLES_UNITE')) {
            Map<String, Object> annexables = (Map<String, Object>) rluex.get('RENSEIGNEMENTS_ANNEXABLES_UNITE');
            System.debug('Clés des informations annexables: ' + annexables.keySet());
            
            // Analyser chaque section des annexables
            for (String key : annexables.keySet()) {
                Object value = annexables.get(key);
                System.debug(key + ': ' + value);
            }
        }
        
    } else {
        System.debug('❌ RLUEx non trouvé dans le document');
    }
    
    // === INFORMATIONS GLOBALES ===
    System.debug('\n📊 INFORMATIONS GLOBALES');
    System.debug('VERSION: ' + property.get('VERSION'));
    System.debug('RLM01A - Code municipalité: ' + property.get('RLM01A'));
    System.debug('RLM02A - Millésime: ' + property.get('RLM02A'));
    
    if (property.containsKey('RENSEIGNEMENTS_ANNEXABLES_GLOBAL')) {
        Map<String, Object> globalInfo = (Map<String, Object>) property.get('RENSEIGNEMENTS_ANNEXABLES_GLOBAL');
        System.debug('Informations annexables globales: ' + globalInfo);
    }
    
    // === DÉCLARATION DE L'ÉVALUATEUR ===
    System.debug('\n📝 DÉCLARATION DE L\'ÉVALUATEUR');
    System.debug('RL0601A - Nom: ' + property.get('RL0601A'));
    System.debug('RL0601B - Prénom: ' + property.get('RL0601B'));
    System.debug('RL0602A - Titre: ' + property.get('RL0602A'));
    System.debug('RL0603A - Organisme: ' + property.get('RL0603A'));
    System.debug('RL0604A - Date de signature: ' + property.get('RL0604A'));
    System.debug('RL0605A - Lieu de signature: ' + property.get('RL0605A'));
    
} else {
    System.debug('❌ Aucun document trouvé');
}

System.debug('=== FIN DE L\'ANALYSE ==='); 