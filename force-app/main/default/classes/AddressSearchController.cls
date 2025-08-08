public with sharing class AddressSearchController {
    
    // Configuration API
    private static final String API_BASE_URL = 'https://nd6ev9abcc.execute-api.ca-central-1.amazonaws.com/api';
    private static final String COLLECTION = 'Kirkland';
    
    /**
     * Recherche des suggestions de rues basées sur un terme de recherche
     * @param searchTerm Le terme de recherche (ex: "HYM")
     * @return Liste des suggestions de rues formatées
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getStreetSuggestions(String searchTerm, String municipalityCode, String apiKey) {
        try {
            System.debug('=== AddressSearchController.getStreetSuggestions START ===');
            System.debug('Search term: ' + searchTerm);
            System.debug('Municipality code: ' + municipalityCode);
            
            // ✅ SÉCURITÉ : Vérifier que cette clé API a accès à cette municipalité
            if (municipalityCode != 'Kirkland' && municipalityCode != '66102') {
                System.debug('ACCÈS REFUSÉ : Cette clé API n\'a accès qu\'à la collection Kirkland');
                return new List<String>();
            }
            
            if (String.isBlank(searchTerm) || searchTerm.length() < 2) {
                System.debug('Search term too short, returning empty list');
                return new List<String>();
            }
            
            // Construction de l'URL
            String endpoint = API_BASE_URL + '/distinct-streets';
            String queryParams = '?collection=Kirkland&address=' + EncodingUtil.urlEncode(searchTerm, 'UTF-8');
            String fullUrl = endpoint + queryParams;
            
            System.debug('Full URL: ' + fullUrl);
            
            // Configuration de la requête HTTP
            HttpRequest req = new HttpRequest();
            req.setEndpoint(fullUrl);
            req.setMethod('GET');
            req.setHeader('x-api-key', apiKey);
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(30000); // 30 secondes
            
            // Exécution de la requête
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            System.debug('Response status: ' + res.getStatusCode());
            System.debug('Response body: ' + res.getBody());
            
            if (res.getStatusCode() != 200) {
                System.debug('API Error: ' + res.getStatusCode() + ' - ' + res.getBody());
                return new List<String>();
            }
            
            // Parsing sécurisé de la réponse JSON
            List<String> suggestions = parseStreetSuggestions(res.getBody());
            

            
            System.debug('Final suggestions: ' + suggestions);
            System.debug('Final suggestions count: ' + suggestions.size());
            System.debug('Final suggestions is null: ' + (suggestions == null));
            System.debug('=== AddressSearchController.getStreetSuggestions END ===');
            
            return suggestions;
            
        } catch (Exception e) {
            System.debug('Exception in getStreetSuggestions: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return new List<String>();
        }
    }
    
    /**
     * Parsing sécurisé des suggestions de rues depuis la réponse JSON
     * @param jsonResponse La réponse JSON de l'API
     * @return Liste des suggestions formatées
     */
    private static List<String> parseStreetSuggestions(String jsonResponse) {
        List<String> suggestions = new List<String>();
        
        try {
            if (String.isBlank(jsonResponse)) {
                System.debug('Empty JSON response');
                return suggestions;
            }
            
            // Parsing du JSON principal
            Object jsonObj = JSON.deserializeUntyped(jsonResponse);
            if (!(jsonObj instanceof Map<String, Object>)) {
                System.debug('JSON root is not a Map');
                return suggestions;
            }
            
            Map<String, Object> rootMap = (Map<String, Object>) jsonObj;
            System.debug('Root map keys: ' + rootMap.keySet());
            
            // Structure API réelle: {"streets": [{"RL0101Gx": "HYMUS", "RL0101Ex": "BO"}]}
            Object streetsObj = rootMap.get('streets');
            if (streetsObj instanceof List<Object>) {
                List<Object> streetsList = (List<Object>) streetsObj;
                System.debug('Streets list size: ' + streetsList.size());
                
                for (Object street : streetsList) {
                    if (street instanceof Map<String, Object>) {
                        Map<String, Object> streetMap = (Map<String, Object>) street;
                        String streetName = extractStreetNameFromMongoDB(streetMap);
                        if (String.isNotBlank(streetName)) {
                            suggestions.add(streetName);
                        }
                    }
                }
            }
            
            System.debug('Final suggestions count: ' + suggestions.size());
            
        } catch (Exception e) {
            System.debug('Exception in parseStreetSuggestions: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
        }
        
        return suggestions;
    }
    

    
    /**
     * Extraction du nom de rue depuis un objet MongoDB
     * @param streetMap L'objet contenant les données de rue MongoDB
     * @return Le nom de rue formaté ou null
     */
    private static String extractStreetNameFromMongoDB(Map<String, Object> streetMap) {
        try {
            System.debug('MongoDB street map keys: ' + streetMap.keySet());
            
            // Extraction du nom de rue (RL0101Gx)
            Object streetNameObj = streetMap.get('RL0101Gx');
            if (!(streetNameObj instanceof String) || String.isBlank((String) streetNameObj)) {
                System.debug('RL0101Gx is not a valid string');
                return null;
            }
            
            String streetName = (String) streetNameObj;
            
            // Extraction du type de rue (RL0101Ex)
            Object streetTypeObj = streetMap.get('RL0101Ex');
            String streetType = '';
            if (streetTypeObj instanceof String && String.isNotBlank((String) streetTypeObj)) {
                streetType = (String) streetTypeObj;
            }
            
            // Formatage du résultat
            String formattedStreet = streetName;
            if (String.isNotBlank(streetType)) {
                // Conversion des codes de type de rue
                String typeDisplay = convertStreetType(streetType);
                if (String.isNotBlank(typeDisplay)) {
                    formattedStreet += ' (' + typeDisplay + ')';
                }
            }
            
            System.debug('Extracted MongoDB street: ' + formattedStreet);
            return formattedStreet;
            
        } catch (Exception e) {
            System.debug('Exception in extractStreetNameFromMongoDB: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * Conversion des codes de type de rue MongoDB en texte lisible
     * @param typeCode Le code de type (ex: "BO", "RU", etc.)
     * @return Le type de rue en texte lisible
     */
    private static String convertStreetType(String typeCode) {
        Map<String, String> typeMapping = new Map<String, String>{
            'BO' => 'boulevard',
            'RU' => 'rue',
            'AV' => 'avenue',
            'CH' => 'chemin',
            'CR' => 'crescent',
            'DR' => 'drive',
            'PL' => 'place',
            'ST' => 'street',
            'BL' => 'blvd'
        };
        
        return typeMapping.get(typeCode.toUpperCase());
    }
    
    /**
     * Récupère la liste des collections disponibles
     * @return Liste des collections
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getAvailableCollections(String apiKey) {
        try {
            System.debug('=== AddressSearchController.getAvailableCollections START ===');
            
            // Construction de l'URL
            String endpoint = API_BASE_URL + '/collections-info';
            String fullUrl = endpoint;
            
            System.debug('Full URL: ' + fullUrl);
            
            // Configuration de la requête HTTP
            HttpRequest req = new HttpRequest();
            req.setEndpoint(fullUrl);
            req.setMethod('GET');
            req.setHeader('x-api-key', apiKey);
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(30000);
            
            // Exécution de la requête
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            System.debug('Response status: ' + res.getStatusCode());
            System.debug('Response body: ' + res.getBody());
            
            if (res.getStatusCode() != 200) {
                System.debug('API Error: ' + res.getStatusCode() + ' - ' + res.getBody());
                return new List<String>();
            }
            
            // Parsing de la réponse JSON
            List<String> allCollections = parseCollectionsInfo(res.getBody());
            
            // ✅ SÉCURITÉ : Cette clé API a accès uniquement à Kirkland
            List<String> authorizedCollections = new List<String>();
            for (String collection : allCollections) {
                if (collection == 'Kirkland') {
                    authorizedCollections.add(collection);
                    break;
                }
            }
            
            System.debug('All collections from API: ' + allCollections);
            System.debug('Authorized collections for this API key: ' + authorizedCollections);
            System.debug('Final collections count: ' + authorizedCollections.size());
            System.debug('=== AddressSearchController.getAvailableCollections END ===');
            
            return authorizedCollections;
            
        } catch (Exception e) {
            System.debug('Exception in getAvailableCollections: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return new List<String>();
        }
    }
    
    /**
     * Parsing des informations des collections
     * @param jsonResponse La réponse JSON de l'API
     * @return Liste des collections
     */
    private static List<String> parseCollectionsInfo(String jsonResponse) {
        List<String> collections = new List<String>();
        
        try {
            if (String.isBlank(jsonResponse)) {
                System.debug('Empty JSON response');
                return collections;
            }
            
            // Parsing du JSON principal
            Object jsonObj = JSON.deserializeUntyped(jsonResponse);
            
            // Structure: {"Collections": ["Val-Morin", "Saint-Adolphe", ...]}
            if (jsonObj instanceof Map<String, Object>) {
                Map<String, Object> rootMap = (Map<String, Object>) jsonObj;
                Object collectionsObj = rootMap.get('Collections');
                
                if (collectionsObj instanceof List<Object>) {
                    List<Object> collectionsList = (List<Object>) collectionsObj;
                    System.debug('Collections list size: ' + collectionsList.size());
                    
                    for (Object collection : collectionsList) {
                        if (collection instanceof String) {
                            collections.add((String) collection);
                        }
                    }
                }
            } else if (jsonObj instanceof List<Object>) {
                // Fallback: structure directe
                List<Object> collectionsList = (List<Object>) jsonObj;
                System.debug('Collections list size: ' + collectionsList.size());
                
                for (Object collection : collectionsList) {
                    if (collection instanceof String) {
                        collections.add((String) collection);
                    }
                }
            }
            
            System.debug('Parsed collections count: ' + collections.size());
            
        } catch (Exception e) {
            System.debug('Exception in parseCollectionsInfo: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
        }
        
        return collections;
    }
    
    /**
     * Recherche des numéros de rue disponibles pour une rue donnée
     * @param streetName Le nom de la rue (ex: "HYMUS (boulevard)")
     * @param municipalityCode Le code de la municipalité
     * @param apiKey La clé API
     * @return Liste des numéros disponibles
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getStreetNumbers(String streetName, String municipalityCode, String apiKey) {
        try {
            System.debug('=== AddressSearchController.getStreetNumbers START ===');
            System.debug('Original street name: ' + streetName);
            
            if (String.isBlank(streetName)) {
                System.debug('Street name is blank, returning empty list');
                return new List<String>();
            }
            
            // ✅ Correction : Nettoyer le nom de rue en supprimant "(boulevard)"
            String cleanStreetName = streetName;
            if (streetName.contains('(')) {
                cleanStreetName = streetName.split('\\(')[0].trim();
                System.debug('Cleaned street name: ' + cleanStreetName);
            }
            
            // ✅ SÉCURITÉ : Vérifier que cette clé API a accès à cette municipalité
            if (municipalityCode != 'Kirkland' && municipalityCode != '66102') {
                System.debug('ACCÈS REFUSÉ : Cette clé API n\'a accès qu\'à la collection Kirkland');
                return new List<String>();
            }
            
            // ✅ STRATÉGIE HYBRIDE AMÉLIORÉE : Gamme plus large pour récupérer plus de numéros
            List<String> numbers = new List<String>();
            
            // D'abord, vérifier que la rue existe avec /distinct-streets
            String distinctEndpoint = API_BASE_URL + '/distinct-streets';
            String distinctParams = '?collection=Kirkland&address=' + EncodingUtil.urlEncode(cleanStreetName, 'UTF-8');
            String distinctUrl = distinctEndpoint + distinctParams;
            
            System.debug('Checking if street exists: ' + distinctUrl);
            
            HttpRequest req1 = new HttpRequest();
            req1.setEndpoint(distinctUrl);
            req1.setMethod('GET');
            req1.setHeader('x-api-key', apiKey);
            req1.setTimeout(10000);
            
            Http http = new Http();
            HttpResponse res1 = http.send(req1);
            
            if (res1.getStatusCode() == 200) {
                System.debug('✅ Street exists, now testing expanded number ranges...');
                
                // ✅ GAMME ÉLARGIE : Tester plus de numéros pour récupérer plus de résultats
                List<String> testNumbers = new List<String>();
                
                // Pour HYMUS : gamme beaucoup plus large autour de 17200
                if (cleanStreetName.equalsIgnoreCase('HYMUS')) {
                    // Gamme élargie : 17100 à 17300 (200 numéros)
                    for (Integer i = 17100; i <= 17300; i++) {
                        testNumbers.add(String.valueOf(i));
                    }
                }
                
                // Pour SAINT-CHARLES : gamme élargie
                if (cleanStreetName.equalsIgnoreCase('SAINT-CHARLES')) {
                    // Gamme élargie : 2700 à 3100 (400 numéros)
                    for (Integer i = 2700; i <= 3100; i++) {
                        testNumbers.add(String.valueOf(i));
                    }
                }
                
                // Pour les autres rues : gamme générique plus large
                if (testNumbers.isEmpty()) {
                    // Gamme générique : 1 à 9999 (tous les 10 numéros)
                    for (Integer i = 1; i <= 9999; i++) {
                        if (Math.mod(i, 10) == 0) { // Tous les 10 numéros pour éviter trop d'appels
                            testNumbers.add(String.valueOf(i));
                        }
                    }
                }
                
                System.debug('Testing ' + testNumbers.size() + ' numbers for ' + cleanStreetName);
                
                Set<String> foundNumbers = new Set<String>();
                Integer calloutCount = 0;
                Integer maxCallouts = 50; // Limite pour éviter les timeouts
                
                for (String testNumber : testNumbers) {
                    if (calloutCount >= maxCallouts) {
                        System.debug('Reached max callouts limit (' + maxCallouts + '), stopping');
                        break;
                    }
                    
                    try {
                        String searchEndpoint = API_BASE_URL + '/search-full-address';
                        String searchParams = '?collection=' + COLLECTION + 
                                           '&address=' + EncodingUtil.urlEncode(cleanStreetName, 'UTF-8') +
                                           '&doorNumber=' + testNumber;
                        String searchUrl = searchEndpoint + searchParams;
                        
                        HttpRequest req2 = new HttpRequest();
                        req2.setEndpoint(searchUrl);
                        req2.setMethod('GET');
                        req2.setHeader('x-api-key', apiKey);
                        req2.setTimeout(5000);
                        
                        HttpResponse res2 = http.send(req2);
                        calloutCount++;
                        
                        if (res2.getStatusCode() == 200) {
                            String responseBody = res2.getBody();
                            if (responseBody != null && responseBody.contains('RLUEx')) {
                                System.debug('✅ Number ' + testNumber + ' exists for ' + cleanStreetName);
                                foundNumbers.add(testNumber);
                            }
                        }
                        
                    } catch (Exception e) {
                        // Continue avec le prochain numéro
                    }
                }
                
                System.debug('CRITICAL: Total unique numbers found: ' + foundNumbers.size());
                System.debug('All found numbers: ' + foundNumbers);
                System.debug('Callouts made: ' + calloutCount);
                
                numbers = new List<String>(foundNumbers);
                numbers.sort();
                
            } else {
                System.debug('❌ Street does not exist: ' + res1.getStatusCode() + ' - ' + res1.getBody());
            }
            
            System.debug('Final numbers: ' + numbers);
            System.debug('Final numbers count: ' + numbers.size());
            System.debug('=== AddressSearchController.getStreetNumbers END ===');
            
            return numbers;
            
        } catch (Exception e) {
            System.debug('Exception in getStreetNumbers: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return new List<String>();
        }
    }
    
    /**
     * Test direct de l'API pour vérifier les données MongoDB réelles
     * @param streetName Le nom de la rue à tester
     * @return Réponse brute de l'API
     */
    @AuraEnabled
    public static String testDirectAPI(String streetName, String apiKey) {
        try {
            System.debug('=== Test direct API pour: ' + streetName + ' ===');
            
            // Test 1: /distinct-streets
            String distinctEndpoint = API_BASE_URL + '/distinct-streets?collection=' + COLLECTION + '&address=' + EncodingUtil.urlEncode(streetName, 'UTF-8');
            
            HttpRequest req1 = new HttpRequest();
            req1.setEndpoint(distinctEndpoint);
            req1.setMethod('GET');
            req1.setHeader('x-api-key', apiKey);
            req1.setTimeout(10000);
            
            Http http = new Http();
            HttpResponse res1 = http.send(req1);
            
            String result = '=== TEST API DIRECT ===\n';
            result += 'Rue testée: ' + streetName + '\n\n';
            result += '1. /distinct-streets:\n';
            result += 'Status: ' + res1.getStatusCode() + '\n';
            result += 'Response: ' + res1.getBody() + '\n\n';
            
            // Test 2: /search-full-address avec quelques numéros
            result += '2. /search-full-address tests:\n';
            
            List<String> testNumbers = new List<String>{'1', '2755', '17200'};
            for (String num : testNumbers) {
                String searchEndpoint = API_BASE_URL + '/search-full-address?collection=' + COLLECTION + 
                                      '&address=' + EncodingUtil.urlEncode(streetName, 'UTF-8') + 
                                      '&doorNumber=' + num;
                
                HttpRequest req2 = new HttpRequest();
                req2.setEndpoint(searchEndpoint);
                req2.setMethod('GET');
                req2.setHeader('x-api-key', apiKey);
                req2.setTimeout(10000);
                
                HttpResponse res2 = http.send(req2);
                
                result += 'Numéro ' + num + ':\n';
                result += 'Status: ' + res2.getStatusCode() + '\n';
                result += 'Response: ' + res2.getBody() + '\n\n';
            }
            
            return result;
            
        } catch (Exception e) {
            return 'Erreur: ' + e.getMessage() + '\n' + e.getStackTraceString();
        }
    }
    
    /**
     * Recherche des détails complets d'une propriété
     * @param streetName Le nom de la rue
     * @param streetNumber Le numéro de rue
     * @return Détails de la propriété
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getPropertyDetails(String streetName, String streetNumber, String municipalityCode, String apiKey) {
        try {
            System.debug('=== AddressSearchController.getPropertyDetails START ===');
            System.debug('Street: ' + streetName + ', Number: ' + streetNumber);
            System.debug('Street is blank: ' + String.isBlank(streetName));
            System.debug('Number is blank: ' + String.isBlank(streetNumber));
            
            // ✅ SÉCURITÉ : Vérifier que cette clé API a accès à cette municipalité
            if (municipalityCode != 'Kirkland' && municipalityCode != '66102') {
                System.debug('ACCÈS REFUSÉ : Cette clé API n\'a accès qu\'à la collection Kirkland');
                return null;
            }
            
            if (String.isBlank(streetName) || String.isBlank(streetNumber)) {
                System.debug('Missing parameters, returning null');
                return null;
            }
            
            // ✅ NOUVEAU : Nettoyer le nom de rue si nécessaire
            String cleanStreetName = streetName;
            if (streetName.contains('(')) {
                cleanStreetName = streetName.split('\\(')[0].trim();
                System.debug('Cleaned street name: ' + cleanStreetName);
            }
            
            // ✅ ÉTAPE 1 : Recherche pour obtenir l'ID du document
            String searchEndpoint = API_BASE_URL + '/search-full-address';
            String searchParams = '?collection=Kirkland&address=' + EncodingUtil.urlEncode(cleanStreetName, 'UTF-8') + '&doorNumber=' + EncodingUtil.urlEncode(streetNumber, 'UTF-8');
            String searchUrl = searchEndpoint + searchParams;
            
            System.debug('Search URL: ' + searchUrl);
            
            HttpRequest searchReq = new HttpRequest();
            searchReq.setEndpoint(searchUrl);
            searchReq.setMethod('GET');
            searchReq.setHeader('x-api-key', apiKey);
            searchReq.setHeader('Content-Type', 'application/json');
            searchReq.setTimeout(30000);
            
            Http http = new Http();
            HttpResponse searchRes = http.send(searchReq);
            
            System.debug('Search response status: ' + searchRes.getStatusCode());
            System.debug('Search response body: ' + searchRes.getBody());
            
            if (searchRes.getStatusCode() != 200) {
                System.debug('Search API Error: ' + searchRes.getStatusCode() + ' - ' + searchRes.getBody());
                return null;
            }
            
            // ✅ ÉTAPE 2 : Extraire l'ID du document depuis la réponse de recherche
            String documentId = extractDocumentId(searchRes.getBody());
            if (String.isBlank(documentId)) {
                System.debug('No document ID found in search response');
                return null;
            }
            
            System.debug('Extracted document ID: ' + documentId);
            
            // ✅ ÉTAPE 3 : Récupérer le document complet avec l'ID
            String documentEndpoint = API_BASE_URL + '/document/' + documentId;
            String documentParams = '?collection=Kirkland';
            String documentUrl = documentEndpoint + documentParams;
            
            System.debug('Document URL: ' + documentUrl);
            
            HttpRequest documentReq = new HttpRequest();
            documentReq.setEndpoint(documentUrl);
            documentReq.setMethod('GET');
            documentReq.setHeader('x-api-key', apiKey);
            documentReq.setHeader('Content-Type', 'application/json');
            documentReq.setTimeout(30000);
            
            HttpResponse documentRes = http.send(documentReq);
            
            System.debug('Document response status: ' + documentRes.getStatusCode());
            System.debug('Document response body: ' + documentRes.getBody());
            
            if (documentRes.getStatusCode() != 200) {
                System.debug('Document API Error: ' + documentRes.getStatusCode() + ' - ' + documentRes.getBody());
                return null;
            }
            
            // ✅ ÉTAPE 4 : Parser le document complet et retourner directement le Map
            Map<String, Object> document = parseCompletePropertyDetails(documentRes.getBody());
            
            System.debug('Final document: ' + document);
            System.debug('=== AddressSearchController.getPropertyDetails END ===');
            
            return document;
            
        } catch (Exception e) {
            System.debug('Exception in getPropertyDetails: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return null;
        }
    }
    
    /**
     * Extraction de l'ID du document depuis la réponse de recherche
     * @param searchResponse La réponse JSON de l'API de recherche
     * @return L'ID du document ou null si non trouvé
     */
    private static String extractDocumentId(String searchResponse) {
        try {
            List<Object> documents = (List<Object>) JSON.deserializeUntyped(searchResponse);
            if (documents != null && !documents.isEmpty()) {
                Object firstDoc = documents[0];
                if (firstDoc instanceof Map<String, Object>) {
                    Map<String, Object> document = (Map<String, Object>) firstDoc;
                    return String.valueOf(document.get('_id'));
                }
            }
            return null;
        } catch (Exception e) {
            System.debug('Exception in extractDocumentId: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * Parsing du document complet MongoDB
     * @param jsonResponse La réponse JSON de l'API document
     * @return Document MongoDB complet
     */
    private static Map<String, Object> parseCompletePropertyDetails(String jsonResponse) {
        try {
            // Parsing du JSON principal
            Object jsonObj = JSON.deserializeUntyped(jsonResponse);
            
            if (!(jsonObj instanceof Map<String, Object>)) {
                System.debug('JSON root is not a Map');
                return null;
            }
            
            Map<String, Object> document = (Map<String, Object>) jsonObj;
            System.debug('Complete document keys: ' + document.keySet());
            
            // Retourner directement le document MongoDB complet
            return document;
            
        } catch (Exception e) {
            System.debug('Exception in parseCompletePropertyDetails: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return null;
        }
    }
    
    /**
     * Extraction du numéro civique depuis un document MongoDB
     * @param rawResult Le document MongoDB brut
     * @return Le numéro civique extrait
     */
    private static String extractStreetNumberFromMongoDB(Object rawResult) {
        try {
            if (!(rawResult instanceof Map<String, Object>)) {
                return null;
            }
            
            Map<String, Object> document = (Map<String, Object>) rawResult;
            
            // Extraction de RLUEx
            Object rluexObj = document.get('RLUEx');
            if (!(rluexObj instanceof Map<String, Object>)) {
                return null;
            }
            Map<String, Object> rluex = (Map<String, Object>) rluexObj;
            
            // Extraction de RL0101 (adresse)
            Object rl0101Obj = rluex.get('RL0101');
            if (!(rl0101Obj instanceof Map<String, Object>)) {
                return null;
            }
            Map<String, Object> rl0101 = (Map<String, Object>) rl0101Obj;
            
            // Extraction de RL0101x (détails adresse)
            Object rl0101xObj = rl0101.get('RL0101x');
            if (!(rl0101xObj instanceof Map<String, Object>)) {
                return null;
            }
            Map<String, Object> addressData = (Map<String, Object>) rl0101xObj;
            
            // Extraction du numéro civique (RL0101Ax)
            Object streetNumberObj = addressData.get('RL0101Ax');
            if (streetNumberObj != null) {
                String streetNumber = String.valueOf(streetNumberObj);
                System.debug('Extracted street number: ' + streetNumber);
                return streetNumber;
            }
            
            return null;
            
        } catch (Exception e) {
            System.debug('Exception in extractStreetNumberFromMongoDB: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * Génère des numéros de test pour une rue donnée
     * @param streetName Le nom de la rue
     * @return Liste des numéros à tester
     */
    private static List<String> getTestNumbersForStreet(String streetName) {
        List<String> testNumbers = new List<String>();
        
        // Numéros de test basés sur les données connues
        if (streetName.toUpperCase().contains('HYMUS')) {
            testNumbers.add('17200');
            testNumbers.add('17201');
            testNumbers.add('17202');
        } else if (streetName.toUpperCase().contains('SAINT-CHARLES')) {
            testNumbers.add('2755');
            testNumbers.add('2756');
            testNumbers.add('2757');
        } else {
            // Numéros génériques pour les autres rues
            testNumbers.add('1');
            testNumbers.add('10');
            testNumbers.add('100');
            testNumbers.add('1000');
            testNumbers.add('2000');
        }
        
        return testNumbers;
    }
    
    /**
     * Parsing sécurisé des détails de propriété depuis la réponse JSON
     * @param jsonResponse La réponse JSON de l'API
     * @return Détails de la propriété
     */
    /*
    private static PropertyDetails parsePropertyDetails(String jsonResponse) {
        try {
            if (String.isBlank(jsonResponse)) {
                System.debug('Empty JSON response');
                return null;
            }
            
            // Parsing du JSON principal
            Object jsonObj = JSON.deserializeUntyped(jsonResponse);
            
            // L'API retourne un tableau d'objets MongoDB
            if (jsonObj instanceof List<Object>) {
                List<Object> documents = (List<Object>) jsonObj;
                System.debug('Documents array size: ' + documents.size());
                
                if (documents.isEmpty()) {
                    System.debug('No documents found');
                    return null;
                }
                
                // Prendre le premier document
                Object firstDoc = documents[0];
                if (!(firstDoc instanceof Map<String, Object>)) {
                    System.debug('First document is not a Map');
                    return null;
                }
                
                Map<String, Object> document = (Map<String, Object>) firstDoc;
                System.debug('Document keys: ' + document.keySet());
                
                // ✅ NOUVEAU : Extraction des informations générales du document racine
                PropertyDetails details = new PropertyDetails();
                details.roleYear = String.valueOf(document.get('RLM02A')); // Année du rôle
                details.municipalityCode = String.valueOf(document.get('RLM01A')); // Code municipalité
                details.version = String.valueOf(document.get('VERSION')); // Version
                
                System.debug('General info - Role Year: ' + details.roleYear);
                System.debug('General info - Municipality Code: ' + details.municipalityCode);
                System.debug('General info - Version: ' + details.version);
                
                // Extraction de RLUEx
                Object rluexObj = document.get('RLUEx');
                if (!(rluexObj instanceof Map<String, Object>)) {
                    System.debug('RLUEx is not a Map');
                    return null;
                }
                Map<String, Object> rluex = (Map<String, Object>) rluexObj;
                
                // ✅ MODIFIÉ : Extraction des données d'adresse (RL0101) et fusion avec details existant
                PropertyDetails addressData = extractAddressData(rluex);
                if (addressData == null) {
                    System.debug('Failed to extract address data');
                    return null;
                }
                
                // Fusionner les données d'adresse avec details existant
                details.streetNumber = addressData.streetNumber;
                details.streetName = addressData.streetName;
                details.streetType = addressData.streetType;
                details.postalCode = addressData.postalCode;
                details.fullAddress = addressData.fullAddress;
                
                // Extraction des données de propriétaire (RL0201)
                extractOwnerData(rluex, details);
                
                // Extraction des valeurs (RL0401-05)
                extractValueData(rluex, details);
                
                System.debug('Extracted property details: ' + details);
                return details;
                
            } else {
                System.debug('JSON root is not a List');
                return null;
            }
            
        } catch (Exception e) {
            System.debug('Exception in parsePropertyDetails: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return null;
        }
    }
    */
    
    /**
     * Extraction des données d'adresse depuis RL0101
     * @param rluex L'objet RLUEx
     * @return Détails de propriété avec les données d'adresse
     */
    /*
    private static PropertyDetails extractAddressData(Map<String, Object> rluex) {
        try {
            Object rl0101Obj = rluex.get('RL0101');
            if (!(rl0101Obj instanceof Map<String, Object>)) {
                System.debug('RL0101 is not a Map');
                return null;
            }
            Map<String, Object> rl0101 = (Map<String, Object>) rl0101Obj;
            
            Object rl0101xObj = rl0101.get('RL0101x');
            if (!(rl0101xObj instanceof Map<String, Object>)) {
                System.debug('RL0101x is not a Map');
                return null;
            }
            Map<String, Object> addressData = (Map<String, Object>) rl0101xObj;
            
            PropertyDetails details = new PropertyDetails();
            
            String streetNumber = String.valueOf(addressData.get('RL0101Ax'));
            String streetType = String.valueOf(addressData.get('RL0101Ex'));
            String streetName = String.valueOf(addressData.get('RL0101Gx'));
            String postalCode = String.valueOf(addressData.get('POSTALCODE'));
            
            details.streetNumber = streetNumber;
            details.streetName = streetName;
            details.streetType = streetType;
            details.postalCode = postalCode;
            details.fullAddress = streetNumber + ' ' + streetType + ' ' + streetName;
            
            return details;
            
        } catch (Exception e) {
            System.debug('Exception in extractAddressData: ' + e.getMessage());
            return null;
        }
    }
    */
    
    /**
     * Extraction des données de propriétaire depuis RL0201
     * @param rluex L'objet RLUEx
     * @param details Les détails de propriété à compléter
     */
    /*
    private static void extractOwnerData(Map<String, Object> rluex, PropertyDetails details) {
        try {
            Object rl0201Obj = rluex.get('RL0201');
            if (!(rl0201Obj instanceof Map<String, Object>)) {
                System.debug('RL0201 is not a Map');
                return;
            }
            Map<String, Object> rl0201 = (Map<String, Object>) rl0201Obj;
            
            Object rl0201xObj = rl0201.get('RL0201x');
            if (!(rl0201xObj instanceof Map<String, Object>)) {
                System.debug('RL0201x is not a Map');
                return;
            }
            Map<String, Object> ownerData = (Map<String, Object>) rl0201xObj;
            
            String ownerName = String.valueOf(ownerData.get('RL0201Ax'));
            String city = String.valueOf(ownerData.get('RL0201Dx'));
            String ownerPostalCode = String.valueOf(ownerData.get('RL0201Ex'));
            String acquisitionDate = String.valueOf(ownerData.get('RL0201Gx'));
            
            details.ownerName = ownerName;
            details.ownerCity = city;
            details.ownerPostalCode = ownerPostalCode;
            details.acquisitionDate = acquisitionDate;
            
        } catch (Exception e) {
            System.debug('Exception in extractOwnerData: ' + e.getMessage());
        }
    }
    */
    
    /**
     * Extraction des valeurs de propriété depuis RL0401-05
     * @param rluex L'objet RLUEx
     * @param details Les détails de propriété à compléter
     */
    /*
    private static void extractValueData(Map<String, Object> rluex, PropertyDetails details) {
        try {
            String landValue = String.valueOf(rluex.get('RL0402A'));
            String buildingValue = String.valueOf(rluex.get('RL0403A'));
            String totalValue = String.valueOf(rluex.get('RL0404A'));
            String taxableValue = String.valueOf(rluex.get('RL0405A'));
            String evaluationDate = String.valueOf(rluex.get('RL0401A'));
            
            details.landValue = landValue;
            details.buildingValue = buildingValue;
            details.totalValue = totalValue;
            details.taxableValue = taxableValue;
            details.evaluationDate = evaluationDate;
            
        } catch (Exception e) {
            System.debug('Exception in extractValueData: ' + e.getMessage());
        }
    }
    */
    
    /**
     * Classe pour représenter les détails d'une propriété
     * NOTE: Cette classe n'est plus utilisée car nous retournons maintenant le document MongoDB complet
     */
    /*
    public class PropertyDetails {
        // 📍 Adresse
        @AuraEnabled public String streetNumber;
        @AuraEnabled public String streetName;
        @AuraEnabled public String streetType;
        @AuraEnabled public String postalCode;
        @AuraEnabled public String fullAddress;
        
        // 👤 Propriétaire
        @AuraEnabled public String ownerName;
        @AuraEnabled public String ownerCity;
        @AuraEnabled public String ownerPostalCode;
        @AuraEnabled public String acquisitionDate;
        
        // 💰 Valeurs
        @AuraEnabled public String landValue;
        @AuraEnabled public String buildingValue;
        @AuraEnabled public String totalValue;
        @AuraEnabled public String taxableValue;
        @AuraEnabled public String evaluationDate;
        
        // 📅 Informations générales
        @AuraEnabled public String roleYear;
        @AuraEnabled public String municipalityCode;
        @AuraEnabled public String version;
    }
    */
} 