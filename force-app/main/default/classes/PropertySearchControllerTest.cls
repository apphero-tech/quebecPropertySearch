/**
 * @description Tests unitaires pour PropertySearchController avec API réelle
 * @author Assistant AI
 * @version 1.0.0
 * @since 2025-01-01
 */
@IsTest
private class PropertySearchControllerTest {
    
    // Test data constants
    private static final String VALID_MUNICIPALITY_CODE = '66102';
    private static final String VALID_API_KEY = 'API_KEY_KIRKLAND_2025_SECURE';
    private static final String INVALID_MUNICIPALITY_CODE = '99999';
    private static final String INVALID_API_KEY = 'INVALID_KEY';
    
    /**
     * @description Test setup method
     */
    @TestSetup
    static void setupTestData() {
        // No setup required for this test class as we use API calls
    }
    
    /**
     * @description Test getCollections method with successful API response
     */
    @IsTest
    static void testGetCollections_Success() {
        // Given - Mock successful API response
        String mockResponse = '{"Collections": ["66102", "66023", "23027"]}';
        Test.setMock(HttpCalloutMock.class, new PropertySearchMock(200, mockResponse));
        
        // When
        Test.startTest();
        List<String> collections = PropertySearchController.getCollections();
        Test.stopTest();
        
        // Then
        System.assertNotEquals(null, collections, 'Collections should not be null');
        System.assertEquals(3, collections.size(), 'Should return 3 collections');
        System.assert(collections.contains('66102'), 'Should contain Kirkland');
        System.assert(collections.contains('66023'), 'Should contain Montreal');
        System.assert(collections.contains('23027'), 'Should contain Quebec');
    }
    
    /**
     * @description Test getCollections method with API error
     */
    @IsTest
    static void testGetCollections_APIError() {
        // Given - Mock API error response
        Test.setMock(HttpCalloutMock.class, new PropertySearchMock(500, 'Internal Server Error'));
        
        // When & Then
        Test.startTest();
        try {
            PropertySearchController.getCollections();
            System.assert(false, 'Should throw exception for API error');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('Erreur lors de la récupération'), 
                         'Exception message should indicate API error');
        }
        Test.stopTest();
    }
    
    /**
     * @description Test municipality access validation with valid credentials
     */
    @IsTest
    static void testValidateMunicipalityAccess_ValidCredentials() {
        // Given - Mock successful API response
        String mockResponse = '{"Collections": ["66102", "66023", "23027"]}';
        Test.setMock(HttpCalloutMock.class, new PropertySearchMock(200, mockResponse));
        
        // When
        Test.startTest();
        Boolean result = PropertySearchController.validateMunicipalityAccess(VALID_MUNICIPALITY_CODE, VALID_API_KEY);
        Test.stopTest();
        
        // Then
        System.assert(result, 'Validation should succeed with valid credentials');
    }
    
    /**
     * @description Test municipality access validation with invalid municipality code
     */
    @IsTest
    static void testValidateMunicipalityAccess_InvalidMunicipalityCode() {
        // Given - Mock successful API response
        String mockResponse = '{"Collections": ["66102", "66023", "23027"]}';
        Test.setMock(HttpCalloutMock.class, new PropertySearchMock(200, mockResponse));
        
        // When
        Test.startTest();
        Boolean result = PropertySearchController.validateMunicipalityAccess(INVALID_MUNICIPALITY_CODE, VALID_API_KEY);
        Test.stopTest();
        
        // Then
        System.assert(!result, 'Validation should fail with invalid municipality code');
    }
    
    /**
     * @description Test municipality access validation with invalid API key
     */
    @IsTest
    static void testValidateMunicipalityAccess_InvalidApiKey() {
        // Given
        String municipalityCode = VALID_MUNICIPALITY_CODE;
        String apiKey = INVALID_API_KEY;
        
        // When
        Test.startTest();
        Boolean result = PropertySearchController.validateMunicipalityAccess(municipalityCode, apiKey);
        Test.stopTest();
        
        // Then
        System.assert(!result, 'Validation should fail with invalid API key');
    }
    
    /**
     * @description Test municipality access validation with null parameters
     */
    @IsTest
    static void testValidateMunicipalityAccess_NullParameters() {
        // Given
        String municipalityCode = null;
        String apiKey = null;
        
        // When & Then
        Test.startTest();
        try {
            PropertySearchController.validateMunicipalityAccess(municipalityCode, apiKey);
            System.assert(false, 'Should throw exception for null parameters');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('Code municipalité et clé API requis'), 
                         'Exception message should indicate missing parameters');
        }
        Test.stopTest();
    }
    
    /**
     * @description Test address search with valid parameters and successful API response
     */
    @IsTest
    static void testSearchByAddress_ValidParameters() {
        // Given - Mock successful API response for collections
        String collectionsResponse = '{"Collections": ["66102", "66023", "23027"]}';
        // Given - Mock successful API response for address search
        String searchResponse = '[{"id": "12345", "matricule": "7734-20-9033-7-000-0000", "doorNumber": "2755", "streetName": "SAINT-CHARLES", "streetType": "BOULEVARD", "apartmentNumber": null, "postalCode": "H9H 3B5", "municipality": "Kirkland", "ownerLastName": "BRIEN", "ownerFirstName": "RITA", "lotNumber": "1992963", "assessmentYear": "2023", "propertyValue": 1254400, "landValue": 502500, "buildingValue": 751900, "landArea": 1219.40, "buildingArea": 134.3, "constructionYear": 1986}]';
        
        PropertySearchMock mock = new PropertySearchMock();
        mock.addResponse(200, collectionsResponse); // For validateMunicipalityAccess
        mock.addResponse(200, searchResponse); // For searchByAddress
        Test.setMock(HttpCalloutMock.class, mock);
        
        // When
        Test.startTest();
        PropertySearchController.SearchResult result = PropertySearchController.searchByAddress(
            'SAINT-CHARLES', '2755', VALID_MUNICIPALITY_CODE, VALID_API_KEY);
        Test.stopTest();
        
        // Then
        System.assert(result.success, 'Search should succeed');
        System.assertEquals('address', result.searchType, 'Search type should be address');
        System.assertEquals(VALID_MUNICIPALITY_CODE, result.municipality.code, 'Municipality code should match');
        System.assertEquals(1, result.results.size(), 'Should return one result');
        
        // Verify first result details
        PropertySearchController.PropertyData firstResult = result.results[0];
        System.assertEquals('2755', firstResult.address.streetNumber, 'Street number should match');
        System.assertEquals('SAINT-CHARLES', firstResult.address.streetName, 'Street name should match');
        System.assertEquals('Kirkland', firstResult.address.municipality, 'Municipality should match');
        System.assertEquals('BRIEN', firstResult.owner.lastName, 'Owner last name should match');
        System.assertEquals('RITA', firstResult.owner.firstName, 'Owner first name should match');
    }
    
    /**
     * @description Test address search with no results (404 response)
     */
    @IsTest
    static void testSearchByAddress_NoResults() {
        // Given - Mock successful API response for collections
        String collectionsResponse = '{"Collections": ["66102", "66023", "23027"]}';
        // Given - Mock 404 response for address search
        PropertySearchMock mock = new PropertySearchMock();
        mock.addResponse(200, collectionsResponse); // For validateMunicipalityAccess
        mock.addResponse(404, ''); // For searchByAddress - no results
        Test.setMock(HttpCalloutMock.class, mock);
        
        // When
        Test.startTest();
        PropertySearchController.SearchResult result = PropertySearchController.searchByAddress(
            'NON-EXISTENT', '9999', VALID_MUNICIPALITY_CODE, VALID_API_KEY);
        Test.stopTest();
        
        // Then
        System.assert(result.success, 'Search should succeed but return no results');
        System.assertEquals(0, result.totalResults, 'Should return 0 results');
        System.assertEquals(0, result.results.size(), 'Results list should be empty');
    }
    
    /**
     * @description Test address search with API error
     */
    @IsTest
    static void testSearchByAddress_APIError() {
        // Given - Mock successful API response for collections
        String collectionsResponse = '{"Collections": ["66102", "66023", "23027"]}';
        // Given - Mock API error response for address search
        PropertySearchMock mock = new PropertySearchMock();
        mock.addResponse(200, collectionsResponse); // For validateMunicipalityAccess
        mock.addResponse(500, 'Internal Server Error'); // For searchByAddress - API error
        Test.setMock(HttpCalloutMock.class, mock);
        
        // When & Then
        Test.startTest();
        try {
            PropertySearchController.searchByAddress('SAINT-CHARLES', '2755', VALID_MUNICIPALITY_CODE, VALID_API_KEY);
            System.assert(false, 'Should throw exception for API error');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('Erreur de recherche par adresse'), 
                         'Exception message should indicate search error');
        }
        Test.stopTest();
    }
    
    /**
     * @description Test address search with invalid access
     */
    @IsTest
    static void testSearchByAddress_InvalidAccess() {
        // Given - Mock successful API response for collections (but municipality not in list)
        String collectionsResponse = '{"Collections": ["66023", "23027"]}'; // 66102 not included
        Test.setMock(HttpCalloutMock.class, new PropertySearchMock(200, collectionsResponse));
        
        // When & Then
        Test.startTest();
        try {
            PropertySearchController.searchByAddress('SAINT-CHARLES', '2755', VALID_MUNICIPALITY_CODE, VALID_API_KEY);
            System.assert(false, 'Should throw exception for invalid access');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('Accès non autorisé'), 
                         'Exception message should indicate unauthorized access');
        }
        Test.stopTest();
    }
    
    /**
     * @description Test address search with invalid street length
     */
    @IsTest
    static void testSearchByAddress_InvalidStreetLength() {
        // Given
        String street = 'AB'; // Too short
        String streetNumber = '2755';
        String municipalityCode = VALID_MUNICIPALITY_CODE;
        String apiKey = VALID_API_KEY;
        
        // When & Then
        Test.startTest();
        try {
            PropertySearchController.searchByAddress(street, streetNumber, municipalityCode, apiKey);
            System.assert(false, 'Should throw exception for short street name');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('3 caractères'), 
                         'Exception message should indicate minimum length requirement');
        }
        Test.stopTest();
    }
    
    /**
     * @description Test address search with missing number
     */
    @IsTest
    static void testSearchByAddress_MissingNumber() {
        // Given
        String street = 'SAINT-CHARLES';
        String streetNumber = '';
        String municipalityCode = VALID_MUNICIPALITY_CODE;
        String apiKey = VALID_API_KEY;
        
        // When & Then
        Test.startTest();
        try {
            PropertySearchController.searchByAddress(street, streetNumber, municipalityCode, apiKey);
            System.assert(false, 'Should throw exception for missing number');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('Numéro civique requis'), 
                         'Exception message should indicate missing number');
        }
        Test.stopTest();
    }
    
    /**
     * @description Test owner search (placeholder implementation)
     */
    @IsTest
    static void testSearchByOwner_NotImplemented() {
        // Given
        String lastName = 'BRIEN';
        String firstName = 'RITA';
        String municipalityCode = VALID_MUNICIPALITY_CODE;
        String apiKey = VALID_API_KEY;
        
        // When & Then
        Test.startTest();
        try {
            PropertySearchController.searchByOwner(lastName, firstName, municipalityCode, apiKey);
            System.assert(false, 'Should throw exception for not implemented method');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('non encore implémentée'), 
                         'Exception message should indicate not implemented');
        }
        Test.stopTest();
    }
    
    /**
     * @description Test matricule search (placeholder implementation)
     */
    @IsTest
    static void testSearchByMatricule_NotImplemented() {
        // Given
        String matricule = '7734-20-9033-7-000-0000';
        String municipalityCode = VALID_MUNICIPALITY_CODE;
        String apiKey = VALID_API_KEY;
        
        // When & Then
        Test.startTest();
        try {
            PropertySearchController.searchByMatricule(matricule, municipalityCode, apiKey);
            System.assert(false, 'Should throw exception for not implemented method');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('non encore implémentée'), 
                         'Exception message should indicate not implemented');
        }
        Test.stopTest();
    }
    
    /**
     * @description Test lot search (placeholder implementation)
     */
    @IsTest
    static void testSearchByLot_NotImplemented() {
        // Given
        String lotNumber = '1992963';
        String municipalityCode = VALID_MUNICIPALITY_CODE;
        String apiKey = VALID_API_KEY;
        
        // When & Then
        Test.startTest();
        try {
            PropertySearchController.searchByLot(lotNumber, municipalityCode, apiKey);
            System.assert(false, 'Should throw exception for not implemented method');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('non encore implémentée'), 
                         'Exception message should indicate not implemented');
        }
        Test.stopTest();
    }
    
    /**
     * @description Test search with multiple results
     */
    @IsTest
    static void testSearchByAddress_MultipleResults() {
        // Given - Mock successful API response for collections
        String collectionsResponse = '{"Collections": ["66102", "66023", "23027"]}';
        // Given - Mock successful API response with multiple results
        String searchResponse = '[{"id": "12345", "matricule": "7734-20-9033-7-000-0000", "doorNumber": "2755", "streetName": "SAINT-CHARLES", "streetType": "BOULEVARD", "apartmentNumber": null, "postalCode": "H9H 3B5", "municipality": "Kirkland", "ownerLastName": "BRIEN", "ownerFirstName": "RITA", "lotNumber": "1992963", "assessmentYear": "2023", "propertyValue": 1254400, "landValue": 502500, "buildingValue": 751900, "landArea": 1219.40, "buildingArea": 134.3, "constructionYear": 1986}, {"id": "12346", "matricule": "7734-20-9033-7-000-0001", "doorNumber": "2757", "streetName": "SAINT-CHARLES", "streetType": "BOULEVARD", "apartmentNumber": null, "postalCode": "H9H 3B5", "municipality": "Kirkland", "ownerLastName": "TREMBLAY", "ownerFirstName": "JEAN", "lotNumber": "1992964", "assessmentYear": "2023", "propertyValue": 1180000, "landValue": 480000, "buildingValue": 700000, "landArea": 1100.00, "buildingArea": 120.0, "constructionYear": 1985}]';
        
        PropertySearchMock mock = new PropertySearchMock();
        mock.addResponse(200, collectionsResponse); // For validateMunicipalityAccess
        mock.addResponse(200, searchResponse); // For searchByAddress
        Test.setMock(HttpCalloutMock.class, mock);
        
        // When
        Test.startTest();
        PropertySearchController.SearchResult result = PropertySearchController.searchByAddress(
            'SAINT-CHARLES', '2755', VALID_MUNICIPALITY_CODE, VALID_API_KEY);
        Test.stopTest();
        
        // Then
        System.assert(result.success, 'Search should succeed');
        System.assertEquals(2, result.results.size(), 'Should return 2 results');
        System.assertEquals(2, result.totalResults, 'Total results should be 2');
    }
    
    /**
     * @description Test search with malformed API response
     */
    @IsTest
    static void testSearchByAddress_MalformedResponse() {
        // Given - Mock successful API response for collections
        String collectionsResponse = '{"Collections": ["66102", "66023", "23027"]}';
        // Given - Mock malformed API response
        String searchResponse = '[{"invalid": "response"}]'; // Missing required fields
        
        PropertySearchMock mock = new PropertySearchMock();
        mock.addResponse(200, collectionsResponse); // For validateMunicipalityAccess
        mock.addResponse(200, searchResponse); // For searchByAddress
        Test.setMock(HttpCalloutMock.class, mock);
        
        // When
        Test.startTest();
        PropertySearchController.SearchResult result = PropertySearchController.searchByAddress(
            'SAINT-CHARLES', '2755', VALID_MUNICIPALITY_CODE, VALID_API_KEY);
        Test.stopTest();
        
        // Then
        System.assert(result.success, 'Search should succeed');
        System.assertEquals(0, result.results.size(), 'Should return 0 results due to malformed data');
    }
    
    /**
     * @description Mock class for HTTP callouts
     */
    private class PropertySearchMock implements HttpCalloutMock {
        private List<Integer> statusCodes;
        private List<String> responses;
        private Integer callCount;
        
        public PropertySearchMock() {
            this.statusCodes = new List<Integer>();
            this.responses = new List<String>();
            this.callCount = 0;
        }
        
        public PropertySearchMock(Integer statusCode, String response) {
            this.statusCodes = new List<Integer>{statusCode};
            this.responses = new List<String>{response};
            this.callCount = 0;
        }
        
        public void addResponse(Integer statusCode, String response) {
            this.statusCodes.add(statusCode);
            this.responses.add(response);
        }
        
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            
            if (callCount < statusCodes.size()) {
                res.setStatusCode(statusCodes[callCount]);
                res.setBody(responses[callCount]);
            } else {
                // Default response if no more responses configured
                res.setStatusCode(200);
                res.setBody('{"Collections": ["66102"]}');
            }
            
            callCount++;
            return res;
        }
    }
} 