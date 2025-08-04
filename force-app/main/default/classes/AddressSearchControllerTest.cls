@isTest
private class AddressSearchControllerTest {
    
    @isTest
    static void testGetStreetSuggestions() {
        // Test avec un terme de recherche valide
        Test.startTest();
        
        List<String> suggestions = AddressSearchController.getStreetSuggestions('HYM', 'Kirkland', 'test-api-key');
        
        Test.stopTest();
        
        // Vérifications de base
        System.assertNotEquals(null, suggestions, 'Suggestions should not be null');
        System.debug('Test suggestions: ' + suggestions);
        
        // Note: En test, l'API externe n'est pas appelée, donc on vérifie juste que la méthode s'exécute sans erreur
    }
    
    @isTest
    static void testGetStreetSuggestionsEmptyTerm() {
        // Test avec un terme vide
        Test.startTest();
        
        List<String> suggestions = AddressSearchController.getStreetSuggestions('', 'Kirkland', 'test-api-key');
        
        Test.stopTest();
        
        System.assertEquals(0, suggestions.size(), 'Should return empty list for empty search term');
    }
    
    @isTest
    static void testGetStreetSuggestionsShortTerm() {
        // Test avec un terme trop court
        Test.startTest();
        
        List<String> suggestions = AddressSearchController.getStreetSuggestions('H', 'Kirkland', 'test-api-key');
        
        Test.stopTest();
        
        System.assertEquals(0, suggestions.size(), 'Should return empty list for short search term');
    }
} 