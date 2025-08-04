// Debug des requêtes API pour comprendre le problème
System.debug('=== DEBUG API REQUESTS ===');

// Test 1: Recherche de rues
System.debug('Test 1: Recherche de rues pour HYMUS');
List<String> streets = AddressSearchController.getStreetSuggestions('HYMUS', 'Kirkland', 'PcIRmLSCoH19AAfigHkpTeM66kL6dgO4B1L6htUa');
System.debug('Rues trouvées: ' + streets);

// Test 2: Recherche de propriété
System.debug('Test 2: Recherche de propriété 17200 HYMUS');
Map<String, Object> property = AddressSearchController.getPropertyDetails('HYMUS (boulevard)', '17200', 'Kirkland', 'PcIRmLSCoH19AAfigHkpTeM66kL6dgO4B1L6htUa');
System.debug('Propriété trouvée: ' + property);

// Test 3: Recherche avec nom de rue nettoyé
System.debug('Test 3: Recherche avec nom de rue nettoyé (HYMUS)');
Map<String, Object> property2 = AddressSearchController.getPropertyDetails('HYMUS', '17200', 'Kirkland', 'PcIRmLSCoH19AAfigHkpTeM66kL6dgO4B1L6htUa');
System.debug('Propriété trouvée (nettoyée): ' + property2);

// Test 4: Test avec différents numéros
System.debug('Test 4: Test avec différents numéros');
Map<String, Object> property3 = AddressSearchController.getPropertyDetails('HYMUS', '17201', 'Kirkland', 'PcIRmLSCoH19AAfigHkpTeM66kL6dgO4B1L6htUa');
System.debug('Propriété 17201: ' + property3);

System.debug('=== FIN DEBUG ==='); 