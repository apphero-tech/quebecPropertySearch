// Test spécifique pour l'adresse SAINT-CHARLES avec prénom de propriétaire
System.debug('=== TEST SAINT-CHARLES - PROPRIÉTAIRE AVEC PRÉNOM ===');

// Configuration
String municipalityCode = 'Kirkland';
String apiKey = 'PcIRmLSCoH19AAfigHkpTeM66kL6dgO4B1L6htUa';

// Test avec l'adresse SAINT-CHARLES
Map<String, Object> property = AddressSearchController.getPropertyDetails('SAINT-CHARLES', '2755', municipalityCode, apiKey);

if (property != null && property.containsKey('RLUEx')) {
    Map<String, Object> rluex = (Map<String, Object>) property.get('RLUEx');
    
    if (rluex.containsKey('RL0201')) {
        Map<String, Object> rl0201 = (Map<String, Object>) rluex.get('RL0201');
        
        if (rl0201.containsKey('RL0201x')) {
            Map<String, Object> owner = (Map<String, Object>) rl0201.get('RL0201x');
            
            System.debug('=== DONNÉES DU PROPRIÉTAIRE SAINT-CHARLES ===');
            System.debug('Nom (RL0201Ax): ' + owner.get('RL0201Ax'));
            System.debug('Prénom (RL0201Bx): ' + owner.get('RL0201Bx'));
            System.debug('Type de propriétaire (RL0201Hx): ' + owner.get('RL0201Hx'));
            System.debug('Adresse complète: ' + owner.get('RL0201Cx'));
            System.debug('Ville: ' + owner.get('RL0201Dx'));
            System.debug('Code postal: ' + owner.get('RL0201Ex'));
            System.debug('Date d\'acquisition: ' + owner.get('RL0201Gx'));
            
            // Test des nouvelles fonctionnalités
            String fullName = '';
            if (owner.get('RL0201Bx') != null) {
                fullName = owner.get('RL0201Bx') + ' ' + owner.get('RL0201Ax');
            } else {
                fullName = String.valueOf(owner.get('RL0201Ax'));
            }
            
            System.debug('Nom complet formaté: ' + fullName);
            
            // Test du type de propriétaire
            String typeCode = String.valueOf(owner.get('RL0201Hx'));
            String typeDescription = '';
            switch on typeCode {
                when '1' { typeDescription = 'Personne physique'; }
                when '2' { typeDescription = 'Personne morale'; }
                when '3' { typeDescription = 'Gouvernement'; }
                when else { typeDescription = 'Type ' + typeCode; }
            }
            System.debug('Type de propriétaire formaté: ' + typeDescription);
            
        } else {
            System.debug('❌ RL0201x non trouvé');
        }
    } else {
        System.debug('❌ RL0201 non trouvé');
    }
} else {
    System.debug('❌ Document non trouvé');
}

System.debug('=== FIN DU TEST SAINT-CHARLES ==='); 