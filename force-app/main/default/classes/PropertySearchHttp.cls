public with sharing class PropertySearchHttp {

    /**
     * Validates API key presence (no format check here).
     */
    public static Boolean isValidApiKey(String apiKey) {
        return String.isNotBlank(apiKey);
    }

    /**
     * Builds a GET HttpRequest with URL constructed from baseUrl and query params.
     */
    public static HttpRequest buildGet(String baseUrl, Map<String, String> queryParams, String apiKey, Integer timeoutMs) {
        String fullUrl = baseUrl;
        if (queryParams != null && !queryParams.isEmpty()) {
            List<String> parts = new List<String>();
            for (String key : queryParams.keySet()) {
                String value = queryParams.get(key);
                parts.add(EncodingUtil.urlEncode(key, 'UTF-8') + '=' + EncodingUtil.urlEncode(value == null ? '' : value, 'UTF-8'));
            }
            fullUrl = baseUrl + '?' + String.join(parts, '&');
        }

        HttpRequest req = new HttpRequest();
        req.setEndpoint(fullUrl);
        req.setMethod('GET');
        if (isValidApiKey(apiKey)) {
            req.setHeader('x-api-key', apiKey);
        }
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(timeoutMs != null ? timeoutMs : 30000);
        return req;
    }

    /**
     * Builds a GET HttpRequest from a fully constructed URL.
     */
    public static HttpRequest buildGetFromFullUrl(String fullUrl, String apiKey, Integer timeoutMs) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(fullUrl);
        req.setMethod('GET');
        if (isValidApiKey(apiKey)) {
            req.setHeader('x-api-key', apiKey);
        }
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(timeoutMs != null ? timeoutMs : 30000);
        return req;
    }

    /**
     * Sends the request and returns the response or null on exception.
     */
    public static HttpResponse send(HttpRequest req) {
        try {
            Http http = new Http();
            return http.send(req);
        } catch (Exception e) {
            System.debug('HTTP send exception: ' + e.getMessage());
            return null;
        }
    }

    /**
     * Returns the body if status code is 200, else null.
     */
    public static String getBodyIfOk(HttpResponse res) {
        if (res != null && res.getStatusCode() == 200) {
            return res.getBody();
        }
        return null;
    }
}


