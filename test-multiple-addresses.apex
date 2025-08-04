// Test de robustesse avec 5 adresses différentes
System.debug('=== TEST DE ROBUSTESSE - 5 ADRESSES DIFFÉRENTES ===');

// Configuration
String municipalityCode = 'Kirkland';
String apiKey = 'PcIRmLSCoH19AAfigHkpTeM66kL6dgO4B1L6htUa';

// Liste des adresses à tester
List<Map<String, String>> testAddresses = new List<Map<String, String>>{
    // Test 1: Adresse principale (déjà validée)
    new Map<String, String>{
        'street' => 'HYMUS',
        'number' => '17200',
        'description' => 'Adresse principale - Boulevard HYMUS'
    },
    
    // Test 2: Autre adresse sur HYMUS
    new Map<String, String>{
        'street' => 'HYMUS',
        'number' => '17201',
        'description' => 'Adresse secondaire - Boulevard HYMUS'
    },
    
    // Test 3: Rue SAINT-CHARLES (si disponible)
    new Map<String, String>{
        'street' => 'SAINT-CHARLES',
        'number' => '2755',
        'description' => 'Rue SAINT-CHARLES'
    },
    
    // Test 4: Rue SAINT-CHARLES avec numéro différent
    new Map<String, String>{
        'street' => 'SAINT-CHARLES',
        'number' => '2756',
        'description' => 'Rue SAINT-CHARLES - Numéro alternatif'
    },
    
    // Test 5: Test avec rue inexistante (pour tester la gestion d'erreur)
    new Map<String, String>{
        'street' => 'RUE-QUI-N-EXISTE-PAS',
        'number' => '123',
        'description' => 'Rue inexistante - Test gestion d\'erreur'
    }
};

// Exécution des tests
Integer successCount = 0;
Integer totalTests = testAddresses.size();

for (Integer i = 0; i < testAddresses.size(); i++) {
    Map<String, String> testAddress = testAddresses[i];
    
    System.debug('=== TEST ' + (i+1) + ': ' + testAddress.get('description') + ' ===');
    System.debug('Rue: ' + testAddress.get('street') + ', Numéro: ' + testAddress.get('number'));
    
    try {
        // Test de recherche de propriété
        Map<String, Object> property = AddressSearchController.getPropertyDetails(
            testAddress.get('street'), 
            testAddress.get('number'), 
            municipalityCode, 
            apiKey
        );
        
        if (property != null && property.containsKey('RLUEx')) {
            successCount++;
            System.debug('✅ SUCCÈS: Propriété trouvée');
            
            // Afficher quelques données clés pour validation
            if (property.containsKey('RLUEx')) {
                Map<String, Object> rluex = (Map<String, Object>) property.get('RLUEx');
                
                // Adresse
                if (rluex.containsKey('RL0101')) {
                    Map<String, Object> rl0101 = (Map<String, Object>) rluex.get('RL0101');
                    if (rl0101.containsKey('RL0101x')) {
                        Map<String, Object> address = (Map<String, Object>) rl0101.get('RL0101x');
                        String fullAddress = address.get('RL0101Ax') + ' ' + address.get('RL0101Ex') + ' ' + address.get('RL0101Gx');
                        System.debug('📍 Adresse: ' + fullAddress);
                    }
                }
                
                // Propriétaire
                if (rluex.containsKey('RL0201')) {
                    Map<String, Object> rl0201 = (Map<String, Object>) rluex.get('RL0201');
                    if (rl0201.containsKey('RL0201x')) {
                        Map<String, Object> owner = (Map<String, Object>) rl0201.get('RL0201x');
                        System.debug('👤 Propriétaire: ' + owner.get('RL0201Ax'));
                    }
                }
                
                // Valeur
                if (rluex.containsKey('RL0404A')) {
                    System.debug('💰 Valeur de l\'immeuble: ' + rluex.get('RL0404A') + ' $');
                }
            }
            
        } else {
            System.debug('❌ ÉCHEC: Aucune propriété trouvée');
        }
        
    } catch (Exception e) {
        System.debug('❌ ERREUR: ' + e.getMessage());
    }
    
    System.debug('---');
}

// Résumé des tests
System.debug('=== RÉSUMÉ DES TESTS ===');
System.debug('Tests réussis: ' + successCount + '/' + totalTests);
System.debug('Taux de succès: ' + ((successCount * 100.0) / totalTests) + '%');

if (successCount >= 3) {
    System.debug('✅ ROBUSTESSE VALIDÉE: Le composant gère bien différentes adresses');
} else {
    System.debug('⚠️ ATTENTION: Le composant pourrait avoir des problèmes de robustesse');
}

System.debug('=== FIN DES TESTS ==='); 