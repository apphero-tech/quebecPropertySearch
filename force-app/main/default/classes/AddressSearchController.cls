public with sharing class AddressSearchController {
    
    // Configuration API
    private static final String API_BASE_URL = 'https://nd6ev9abcc.execute-api.ca-central-1.amazonaws.com/api';
    
    /**
     * Convertit un code municipalité en nom de collection utilisé par l'API
     * Retourne null si non supporté
     */
    private static String getCollectionName(String municipalityCode) {
        if (String.isBlank(municipalityCode)) {
            return null;
        }
        Map<String, String> codeToCollection = new Map<String, String>{
            '66102' => 'Kirkland',
            '66023' => 'Montreal',
            '23027' => 'Quebec'
        };
        // Si le code est déjà un nom de collection supporté, le retourner tel quel
        if (codeToCollection.values().contains(municipalityCode)) {
            return municipalityCode;
        }
        return codeToCollection.get(municipalityCode);
    }
    
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
            
            if (String.isBlank(searchTerm) || searchTerm.length() < 2) {
                System.debug('Search term too short, returning empty list');
                return new List<String>();
            }
            
            // Déterminer la collection à partir du code municipalité
            String collectionName = getCollectionName(municipalityCode);
            if (String.isBlank(collectionName)) {
                System.debug('Unsupported municipality: ' + municipalityCode);
                return new List<String>();
            }
            
            // Construction de l'URL
            String endpoint = API_BASE_URL + '/distinct-streets';
            String queryParams = '?collection=' + EncodingUtil.urlEncode(collectionName, 'UTF-8') + '&address=' + EncodingUtil.urlEncode(searchTerm, 'UTF-8');
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
            
            // Filtrer éventuellement ici selon la clé API (conservé à Kirkland par défaut)
            List<String> authorizedCollections = new List<String>();
            for (String collection : allCollections) {
                if (collection == 'Kirkland') {
                    authorizedCollections.add(collection);
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
    // Removed getStreetNumbers (unused, expensive callout loop)
    
    /**
     * Test direct de l'API pour vérifier les données MongoDB réelles
     * @param streetName Le nom de la rue à tester
     * @return Réponse brute de l'API
     */
    // Removed testDirectAPI (debug-only, not used by LWC)

    /**
     * Test direct de l'endpoint distinct-owner pour debug
     */
    // Removed testOwnerEndpoint (debug-only, not used by LWC)
    
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
            
            // Déterminer la collection à partir du code municipalité
            String collectionName = getCollectionName(municipalityCode);
            if (String.isBlank(collectionName)) {
                System.debug('Unsupported municipality: ' + municipalityCode);
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
            String searchParams = '?collection=' + EncodingUtil.urlEncode(collectionName, 'UTF-8') + '&address=' + EncodingUtil.urlEncode(cleanStreetName, 'UTF-8') + '&doorNumber=' + EncodingUtil.urlEncode(streetNumber, 'UTF-8');
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
            String documentParams = '?collection=' + EncodingUtil.urlEncode(collectionName, 'UTF-8');
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
     * Recherche de propriétés par propriétaire (personne physique ou morale)
     * @param name Nom de famille (physique) ou nom d'entreprise (morale)
     * @param firstName Prénom (optionnel pour personne physique)
     * @param ownerType 'physical' ou 'moral' (peut être null → heuristique côté client)
     * @param municipalityCode Code municipalité (autorisé: 'Kirkland' ou '66102')
     * @param apiKey Clé API
     * @return Liste de documents MongoDB correspondant à la recherche
     */
    @AuraEnabled(cacheable=true)
    public static List<Object> searchByOwner(String name, String firstName, String ownerType, String municipalityCode, String apiKey) {
        List<Object> documents = new List<Object>();
        try {
            System.debug('=== SEARCH BY OWNER DEBUG ===');
            System.debug('Input lastName (name): ' + name);
            System.debug('Input firstName: ' + firstName);
            System.debug('Municipality: ' + municipalityCode);
            System.debug('=== AddressSearchController.searchByOwner START ===');
            System.debug('Params - name: ' + name + ', firstName: ' + firstName + ', ownerType: ' + ownerType + ', municipalityCode: ' + municipalityCode);

            // Déterminer la collection à partir du code municipalité
            String collectionName = getCollectionName(municipalityCode);
            if (String.isBlank(collectionName)) {
                System.debug('Unsupported municipality: ' + municipalityCode);
                return documents;
            }

            if (String.isBlank(name)) {
                return documents;
            }

            // Base URL (contract confirmé: last_name / first_name)
            String endpoint = API_BASE_URL + '/search-owner';

            // Construire les URLs selon la stratégie validée
            List<Object> result;
            String baseParams = '?collection=' + EncodingUtil.urlEncode(collectionName, 'UTF-8');

            // Contrat API: always use last_name (uppercase) and optional first_name (uppercase)
            String ln = String.isBlank(name) ? '' : name.toUpperCase();
            String fn = String.isBlank(firstName) ? '' : firstName.toUpperCase();
            String url = endpoint + baseParams + '&last_name=' + EncodingUtil.urlEncode(ln, 'UTF-8');
            if (String.isNotBlank(fn)) {
                url += '&first_name=' + EncodingUtil.urlEncode(fn, 'UTF-8');
            }
            System.debug('Endpoint URL: ' + url);
            result = performOwnerRequest(url, apiKey);
            if (!result.isEmpty()) {
                System.debug('API returned ' + result.size() + ' items');
                return result;
            }
            // As a permissive fallback, retry last_name only if first_name was provided and got no result
            if (String.isNotBlank(fn)) {
                String url2 = endpoint + baseParams + '&last_name=' + EncodingUtil.urlEncode(ln, 'UTF-8');
                System.debug('Fallback URL (last_name only): ' + url2);
                result = performOwnerRequest(url2, apiKey);
                if (!result.isEmpty()) {
                    return result;
                }
            }

            System.debug('No owner results found with provided parameters');
            return documents;

        } catch (Exception e) {
            System.debug('Exception in searchByOwner: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return documents;
        }
    }

    /**
     * Parsing tolérant de la réponse owner search
     */
    private static List<Object> parseOwnerSearchResponse(String jsonResponse) {
        List<Object> documents = new List<Object>();
        try {
            if (String.isBlank(jsonResponse)) {
                return documents;
            }
            Object jsonObj = JSON.deserializeUntyped(jsonResponse);
            if (jsonObj instanceof List<Object>) {
                documents = (List<Object>) jsonObj;
            } else if (jsonObj instanceof Map<String, Object>) {
                Map<String, Object> jsonMap = (Map<String, Object>) jsonObj;
                // Ignorer si message d'erreur
                Object error = jsonMap.get('error');
                if (error == null) {
                    documents.add(jsonMap);
                }
            }
        } catch (Exception e) {
            System.debug('Exception in parseOwnerSearchResponse: ' + e.getMessage());
        }
        return documents;
    }

    /**
     * Exécuter une requête GET et parser la réponse pour la recherche propriétaire
     */
    private static List<Object> performOwnerRequest(String url, String apiKey) {
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint(url);
            req.setMethod('GET');
            req.setHeader('x-api-key', apiKey);
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(30000);
            Http http = new Http();
            HttpResponse res = http.send(req);
            System.debug('Owner search URL: ' + url);
            System.debug('Owner search status: ' + res.getStatusCode());
            System.debug('Owner search body: ' + res.getBody());
            if (res.getStatusCode() != 200) {
                return new List<Object>();
            }
            return parseOwnerSearchResponse(res.getBody());
        } catch (Exception e) {
            System.debug('Exception in performOwnerRequest: ' + e.getMessage());
            return new List<Object>();
        }
    }

    /**
     * Suggestions de propriétaires (un seul champ Nom) – retourne une liste d'objets {id, value, display}
     */
    @AuraEnabled(cacheable=true)
    public static List<Object> searchOwnerSuggestions(String ownerName, String municipalityCode, String apiKey) {
        List<Object> suggestions = new List<Object>();
        try {
            System.debug('=== OWNER SUGGESTIONS DEBUG START ===');
            System.debug('Original ownerName: ' + ownerName);
            System.debug('Municipality: ' + municipalityCode);
            System.debug('API key (masked): len=' + (apiKey == null ? 0 : apiKey.length()) + ', last4=' + (apiKey == null || apiKey.length() < 4 ? 'NA' : apiKey.substring(apiKey.length()-4)));
            if (String.isBlank(ownerName) || ownerName.length() < 2) {
                System.debug('Owner name too short, returning empty suggestions');
                System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
                return suggestions;
            }
            // Déterminer la collection à partir du code municipalité
            String collectionName = getCollectionName(municipalityCode);
            if (String.isBlank(collectionName)) {
                System.debug('Unsupported municipality: ' + municipalityCode);
                System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
                return suggestions;
            }

            // Nouvel endpoint: search-distinct-owner (retourne { owners: [...] })
            String endpoint = API_BASE_URL + '/search-distinct-owner';
            String upper = ownerName == null ? '' : ownerName.trim().toUpperCase();
            String params = '?collection=' + EncodingUtil.urlEncode(collectionName, 'UTF-8') +
                            '&last_name=' + EncodingUtil.urlEncode(upper, 'UTF-8');
            String url = endpoint + params;

            HttpRequest req = new HttpRequest();
            req.setEndpoint(url);
            req.setMethod('GET');
            req.setHeader('x-api-key', apiKey);
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(20000);

            Http http = new Http();
            HttpResponse res = http.send(req);
            System.debug('Endpoint URL: ' + url);
            System.debug('API call status: ' + res.getStatusCode());
            System.debug('Raw response body: ' + res.getBody());
            if (res.getStatusCode() != 200) {
                System.debug('Non-200 status for owner suggestions, returning empty');
                System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
                return suggestions;
            }

            // Primary parse: { owners: [ { RL0201Ax, RL0201Bx }, ... ] }
            Object jsonObj = JSON.deserializeUntyped(res.getBody());
            if (jsonObj instanceof Map<String, Object>) {
                Map<String, Object> mapResp = (Map<String, Object>) jsonObj;
                System.debug('Parsed response keys: ' + mapResp.keySet());
                Object ownersObj = mapResp.get('owners');
                if (ownersObj instanceof List<Object>) {
                    List<Object> owners = (List<Object>) ownersObj;
                    System.debug('Owners array size: ' + owners.size());
                    if (!owners.isEmpty()) {
                        System.debug('First owner (preview): ' + owners[0]);
                    }
                    List<Object> fromDistinct = buildOwnerSuggestionsFromDistinctOwners(owners);
                    if (!fromDistinct.isEmpty()) {
                        System.debug('Final suggestions size (distinct): ' + fromDistinct.size());
                        System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
                        return fromDistinct;
                    }
                }
                System.debug('Response does not contain owners key or empty owners; will try fallback');
            }

            // Fallback: ancienne forme (tableau de documents MongoDB)
            List<Object> docs = new List<Object>();
            if (jsonObj instanceof List<Object>) {
                docs = (List<Object>) jsonObj;
            }

            // Si résultat vide et saisie courte (2 caractères), fan-out sur A..Z sur le nouvel endpoint
            if ((docs == null || docs.isEmpty()) && upper.length() == 2) {
                List<Object> unionOwners = new List<Object>();
                String alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                for (Integer i = 0; i < alphabet.length(); i++) { // 'A'..'Z'
                    String ch = alphabet.substring(i, i+1);
                    String tryUrl = endpoint + '?collection=' + EncodingUtil.urlEncode(collectionName, 'UTF-8') +
                                    '&last_name=' + EncodingUtil.urlEncode(upper + ch, 'UTF-8');

                    try {
                        HttpRequest req2 = new HttpRequest();
                        req2.setEndpoint(tryUrl);
                        req2.setMethod('GET');
                        req2.setHeader('x-api-key', apiKey);
                        req2.setHeader('Content-Type', 'application/json');
                        req2.setTimeout(10000);
                        HttpResponse res2 = http.send(req2);
                        if (res2.getStatusCode() == 200) {
                            Object obj2 = JSON.deserializeUntyped(res2.getBody());
                            if (obj2 instanceof Map<String, Object>) {
                                Map<String, Object> map2 = (Map<String, Object>) obj2;
                                Object owners2 = map2.get('owners');
                                if (owners2 instanceof List<Object>) {
                                    unionOwners.addAll((List<Object>) owners2);
                                }
                            }
                        }
                    } catch (Exception ignore) {
                        // continuer
                    }

                    if (unionOwners.size() >= 50) { // limite raisonnable
                        break;
                    }
                }
                if (!unionOwners.isEmpty()) {
                    List<Object> distinctUnion = buildOwnerSuggestionsFromDistinctOwners(unionOwners);
                    System.debug('Final suggestions size (distinct fan-out): ' + distinctUnion.size());
                    System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
                    return distinctUnion;
                }
            }

            List<Object> fallbackSuggestions = buildOwnerSuggestionsFromDocuments(docs);
            System.debug('Final suggestions size (fallback docs): ' + fallbackSuggestions.size());
            System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
            return fallbackSuggestions;
        } catch (Exception e) {
            System.debug('Exception in searchOwnerSuggestions: ' + e.getMessage());
            System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
            return suggestions;
        }
    }

    // Construit des suggestions à partir d'une liste de documents MongoDB
    private static List<Object> buildOwnerSuggestionsFromDocuments(List<Object> docs) {
        List<Object> suggestions = new List<Object>();
        Set<String> seen = new Set<String>();
        Integer idx = 0;
        for (Object d : docs) {
            if (!(d instanceof Map<String, Object>)) continue;
            Map<String, Object> doc = (Map<String, Object>) d;
            Object rluexObj = doc.get('RLUEx');
            if (!(rluexObj instanceof Map<String, Object>)) continue;
            Map<String, Object> rluex = (Map<String, Object>) rluexObj;
            Object rl0201Obj = rluex.get('RL0201');
            if (!(rl0201Obj instanceof Map<String, Object>)) continue;
            Map<String, Object> rl0201 = (Map<String, Object>) rl0201Obj;
            Object rl0201xObj = rl0201.get('RL0201x');
            if (rl0201xObj instanceof Map<String, Object>) {
                addOwnerSuggestionFromOwnerMap((Map<String, Object>) rl0201xObj, seen, suggestions, idx);
                idx++;
            } else if (rl0201xObj instanceof List<Object>) {
                for (Object o : (List<Object>) rl0201xObj) {
                    if (o instanceof Map<String, Object>) {
                        addOwnerSuggestionFromOwnerMap((Map<String, Object>) o, seen, suggestions, idx);
                        idx++;
                    }
                }
            }
        }
        return suggestions;
    }

    private static void addOwnerSuggestionFromOwnerMap(Map<String, Object> owner, Set<String> seen, List<Object> out, Integer idx) {
        String nomLegal = (String) owner.get('RL0201Ax');
        String prenom = (String) owner.get('RL0201Bx');
        String statut = (String) owner.get('RL0201Hx');
        if (String.isBlank(nomLegal)) return;
        String key = (prenom != null ? prenom : '') + '|' + nomLegal + '|' + (statut != null ? statut : '');
        if (seen.contains(key)) return;
        seen.add(key);
        String display = ('1' == statut && String.isNotBlank(prenom)) ? (nomLegal + ', ' + prenom) : nomLegal;
        Map<String, Object> suggestion = new Map<String, Object>();
        suggestion.put('id', String.valueOf(idx));
        suggestion.put('value', nomLegal);
        suggestion.put('display', display);
        out.add(suggestion);
    }

    // Construit des suggestions à partir du format distinct-owner: [{RL0201Ax, RL0201Bx}]
    private static List<Object> buildOwnerSuggestionsFromDistinctOwners(List<Object> owners) {
        List<Object> suggestions = new List<Object>();
        if (owners == null || owners.isEmpty()) {
            return suggestions;
        }
        Set<String> seen = new Set<String>();
        Integer idx = 0;
        for (Object o : owners) {
            if (!(o instanceof Map<String, Object>)) continue;
            Map<String, Object> owner = (Map<String, Object>) o;
            String nomLegal = (String) owner.get('RL0201Ax');
            String prenom = (String) owner.get('RL0201Bx');
            if (String.isBlank(nomLegal)) continue;
            String key = (prenom != null ? prenom : '') + '|' + nomLegal;
            if (seen.contains(key)) continue;
            seen.add(key);
            String display = String.isNotBlank(prenom) ? (nomLegal + ', ' + prenom) : nomLegal;
            Map<String, Object> suggestion = new Map<String, Object>();
            suggestion.put('id', String.valueOf(idx));
            suggestion.put('value', nomLegal);
            suggestion.put('display', display);
            suggestions.add(suggestion);
            idx++;
        }
        return suggestions;
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