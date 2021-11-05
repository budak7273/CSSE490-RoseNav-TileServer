(function() {
    var someThings = "helloworld";

    FB_COLLECTION_CONSTANTS = "Constants";
    FB_COLLECTION_LOCATIONS = "Locations";
    FB_COLLECTION_CONNECTIONS = "Connections";

    KEY_STORAGE_NODES = "local-data-nodes";
    KEY_STORAGE_CONNECTIONS = "local-data-connections";
    KEY_STORAGE_NAMES = "local-data-names";

    let cached_data = {};

    
    const buildDataFromFb = () => {

    }

    const writeCachedDataItem =(keyString, data, versionEpochTime) => {
    cached_data[`${keyString}_DATA`] = data;
    cached_data[`${keyString}_VERSION`] = versionEpochTime;
    }


    module.exports.getSomeThings = function() {
        return someThings;
    }

}());