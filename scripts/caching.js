(function() {
    const firebase = require("firebase");
    require("firebase/firestore");

    var someThings = "helloworld"; // TODO remove me

    const FB_COLLECTION_CONSTANTS = "Constants";
    const FB_COLLECTION_LOCATIONS = "Locations";
    const FB_COLLECTION_CONNECTIONS = "Connections";
    const FB_KEY_LOC_GEO = "location";
    const FB_KEY_LOC_NAME = "name";
    const FB_KEY_LOC_ALIAS = "name-aliases";
    const FB_KEY_LOC_SEARCHABLE = "searchable?";
    const FB_KEY_CON_NAME = "name";
    const FB_KEY_CON_PLACE1 = "place1";
    const FB_KEY_CON_PLACE2 = "place2";
    const FB_KEY_CON_STAIRCASE = "staircase?";

    const KEY_STORAGE_NODES = "local-data-nodes";
    const KEY_STORAGE_CONNECTIONS = "local-data-connections";
    const KEY_STORAGE_NAMES = "local-data-names";

    // Forcibly get new map data regardless of cache.
    // Takes precedence over DEBUG_FORCE_CACHED_MAP
    // Forcibly rewrites the caches, even if they aren't outdated
    const DEBUG_FORCE_LIVE_MAP = false;

    // Forcibly use cached map data, unless DEBUG_FORCE_LIVE_MAP is true.
    const DEBUG_FORCE_CACHED_MAP = false;

    // Forcibly make a new cache every time
    const DEBUG_FORCE_REWRITE_CACHE = false;


    let cached_data = {};

    // Import the functions you need from the SDKs you need
    // https://firebase.google.com/docs/web/setup#available-libraries
    // import { initializeApp } from "firebase/app";
    // import { getFirestore, collection, getDocs } from "firebase/firestore";

    const firebaseConfig = {
        apiKey: "AIzaSyDiV5BMtwk4o_5fXFaCNHM5DInoPfRC9xA",
        authDomain: "rose-nav.firebaseapp.com",
        projectId: "rose-nav",
        storageBucket: "rose-nav.appspot.com",
        messagingSenderId: "107394543013",
        appId: "1:107394543013:web:c71ba364ae81ee9afa4c4c",
        measurementId: "G-FLS4RY3XL8"
    };

    // Initialize Firebase
    const firebaseApp = firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    const Connection = class {
        constructor (fbKey, fbConnectionDocumentData) {
            this.fbKey = fbKey;
            this.place1FbID = fbConnectionDocumentData[FB_KEY_CON_PLACE1].id;
            this.place2FbID = fbConnectionDocumentData[FB_KEY_CON_PLACE2].id;
            this.staircase = fbConnectionDocumentData[FB_KEY_CON_STAIRCASE];
        }
    
        // Since we directly stringify these, they can't have methods.
    };

    const MapNode = class {
        constructor (fbKey, fbLocationDocumentData, vertexIndex) {
            this.fbKey = fbKey;
            this.aliasList = fbLocationDocumentData[FB_KEY_LOC_ALIAS] || [];
            this.vertexIndex = vertexIndex;
    
            const geopoint = fbLocationDocumentData[FB_KEY_LOC_GEO];
            this.lat = geopoint.df;
            this.lon = geopoint.wf;
    
            // if a node has a name, then set its searchability based on the data.
            // otherwise, give it a placeholder name and never let it be searchable
            this.name = fbLocationDocumentData[FB_KEY_LOC_NAME];
            if (this.name) {
                this.searchable = fbLocationDocumentData[FB_KEY_LOC_SEARCHABLE] || false;
            } else {
                this.name = `Unnamed node ${fbKey}`;
                this.searchable = false;
            }
        }
    };

    // MapDataSubsystem stores the nodes and connections for the map
    const MapDataSubsystem = class {
        constructor(shouldBuildGraph, shouldBuildNames, callbackWhenDone) {
            // this._cachedDataVersion = parseInt(localStorage.getItem(KEY_STORAGE_VERSION)) || -1; // Version is stored or blank

            // An object used as a map. The keys are firebase ID strings, the values are the MapNodes they correspond to.
            this._fbIDToMapNode = {};
            // An array used as a map. The index is the index of the vertex in the graph, the stored value is the firebase ID string.
            this._graphIndexToFbID = [];
            // An object used as a map. The keys are firebase ID strings, the values are the Connection objects they correspond to.
            this._connections = {};
            // Object used as a map of all location names and aliases mapped to their firebase ID string
            this._namesAndAliasToFbId = {};

            this._ref = firebase.firestore();
            this._locationsRef = this._ref.collection(FB_COLLECTION_LOCATIONS);
            this._connectionsRef = this._ref.collection(FB_COLLECTION_CONNECTIONS);

            // TODO make use of this later. Some screens don't need to build map (settings?) if names are cached already
            this._shouldBuildMapNodes = true;
            this._shouldBuildGraph = shouldBuildGraph;
            this._shouldBuildNames = shouldBuildNames;

            this._prepareData(callbackWhenDone);
        }

        async _prepareData(finalCallback) {
            try {
                // console.log(`LOCAL map data version is ${this._cachedDataVersion}`);
                const liveDataVersion = await this._getMapLiveVersionNumber();
                console.log(`🔥 LIVE map data version is ${liveDataVersion} (${new Date(liveDataVersion).toString()})`);

                // Any change to the map increases the liveDataVersion timestamp
                // Increases in the liveDataVersion mean that ALL caches are invalid,
                // but each cached item needs to keep track of if it has been updated or not
                // individually, since different parts of the data load at different times.

                // Decide to load either cached or fresh data
                // given an item's cached version timestamp
                const shouldUseLiveFor = (cachedVersion) => {
                    return DEBUG_FORCE_LIVE_MAP ||
                        DEBUG_FORCE_REWRITE_CACHE ||
                        (liveDataVersion > cachedVersion &&
                            !DEBUG_FORCE_CACHED_MAP);
                };

                const mapNodeCachedVersion = this._getCachedDataItem_Version(KEY_STORAGE_NODES);
                const shouldUseLiveForMapNodes = shouldUseLiveFor(mapNodeCachedVersion);
                if (this._shouldBuildMapNodes) {
                    if (shouldUseLiveForMapNodes) {
                        console.log("🔥 Using *firebase* for MapNodes");
                        await this._buildNodeDataFromFb();
                    } else {
                        console.log("📦 Using *local storage* for MapNodes");
                        await this._buildNodeDataFromCache();
                    }
                }

                const connectionsCachedVersion = this._getCachedDataItem_Version(KEY_STORAGE_CONNECTIONS);
                const shouldUseLiveForConnections = shouldUseLiveFor(connectionsCachedVersion);
                if (this._shouldBuildGraph) {
                    if (shouldUseLiveForConnections) {
                        console.log("🔥 Using *firebase* for Connections");
                        await this._buildConnectionDataFromFb();
                    } else {
                        console.log("📦 Using *local storage* for Connections");
                        await this._buildConnectionDataFromCache();
                    }
                }

                const namesCachedVersion = this._getCachedDataItem_Version(KEY_STORAGE_NAMES);
                const shouldUseLiveForNames = shouldUseLiveFor(namesCachedVersion);
                if (this._shouldBuildNames) {
                    if (shouldUseLiveForNames) {
                        console.log("🔥 Using *MapNodes* for Names");
                        await this._buildNamesFromMapNodes();
                    } else {
                        console.log("📦 Using *local storage* for Names");
                        await this._buildNamesFromCache();
                    }
                }

                // Update the caches as needed for each item
                const isUsingLiveMap = {
                    nodes: shouldUseLiveForMapNodes,
                    connections: shouldUseLiveForConnections,
                    names: shouldUseLiveForNames,
                };
                await this._writeUpdatedCachedMapData(liveDataVersion, isUsingLiveMap);

                console.log("Calling final MapDataSubsystem callback...");
                await finalCallback();
            } catch (error) {
                console.error("MapDataSubsystem failed while prepping data:", error);
            }
        }

        get numNodes() {
            return this._graphIndexToFbID.length;
        }

        get nodeData() {
            if (this._fbIDToMapNode == {}) {
                console.error("Tried to access map nodes before they were loaded; returning null instead");
            }
            return this._fbIDToMapNode;
        }

        get connectionData() {
            if (this._connections == {}) {
                console.error("Tried to access map connections before they were loaded; returning {} instead");
            }
            return this._connections;
        }

        get namesToFbId() {
            if (this._namesAndAliasToFbId == {}) {
                console.error("Tried to access names before they were loaded; returning {} instead");
            }
            return this._namesAndAliasToFbId;
        }

        getFbIDFromGraphVertexIndex(index) {
            return this._graphIndexToFbID[index];
        }

        getMapNodeFromGraphVertexIndex(index) {
            const fbID = this.getFbIDFromGraphVertexIndex(index);
            return this._fbIDToMapNode[fbID];
        }

        getMapNodeFromFbID(fbID) {
            return this._fbIDToMapNode[fbID];
        }

        getGraphVertexIndexFromFbID(fbID) {
            return this._fbIDToMapNode[fbID].vertexIndex;
        }

        getMapNodeDistanceMeters(node1, node2) {
            return movabletype.haversine(node1.lat, node2.lat, node1.lon, node2.lon);
        }

        getLocationFbIdFromNameOrAlias(locationNameOrAlias) {
            // console.log("Validating name", locationNameOrAlias);
            return this.namesToFbId[locationNameOrAlias];
        }

        validateLocationFbId(locationFbId) {
            // console.log("Validating fbid", locationFbId);
            return Object.values(this.namesToFbId).includes(locationFbId);
        }

        async _getMapLiveVersionNumber() {
            const liveMapVersionRef = this._ref.collection("Constants").doc("Versions");
            return await liveMapVersionRef.get().then((doc) => {
                if (doc.exists) {
                    // console.log(doc.data());
                    return doc.data().map.seconds;
                } else {
                    throw new Error("No such document - map data version");
                }
            });
        }

        bumpVersionNumber() {
            // https://firebase.google.com/docs/database/web/read-and-write?authuser=0#update_specific_fields
            const liveMapVersionRef = this._ref.collection("Constants").doc("Versions");
            const now = new Date();
            return liveMapVersionRef.update({
                "map": now,
            }).then(() => {
                console.log("🔼 Bumped map version to ", now);
            }).catch((error) => {
                console.error("Failed to update version document:", error);
            });
        }

        // Builds this._fbIDToMapNode and this._graphIndexToFbID from Firebase-fetched data
        async _buildNodeDataFromFb() {
            await this._locationsRef.get().then((querySnapshot) => {
                console.log("Num nodes:", querySnapshot.size);
                let index = 0;
                querySnapshot.forEach((doc) => {
                    // doc.data() is never undefined for query doc snapshots
                    // console.log(doc.id, " => ", doc.data());
                    const thisNode = new MapNode(doc.id, doc.data(), index);
                    this._fbIDToMapNode[doc.id] = thisNode;
                    this._graphIndexToFbID.push(doc.id);
                    index++;
                });
            });
        }

        // Builds this._fbIDToMapNode and this._graphIndexToFbID from cached data
        async _buildNodeDataFromCache() {
            const cached_fbIDToMapNode = this._getCachedDataItem_Data(KEY_STORAGE_NODES);

            // Setup _fbIDToMapNode from cache
            this._fbIDToMapNode = cached_fbIDToMapNode;

            // Also set up _graphIndexToFbID
            for (const key in cached_fbIDToMapNode) {
                if (Object.hasOwnProperty.call(cached_fbIDToMapNode, key)) {
                    this._graphIndexToFbID.push(key);
                }
            }
        }

        // Builds this._connections from Firebase-fetched data
        async _buildConnectionDataFromFb() {
            await this._connectionsRef.get().then((querySnapshot) => {
                console.log("Num connections:", querySnapshot.size);
                const connectionData = {};
                querySnapshot.forEach((doc) => {
                    // doc.data() is never undefined for query doc snapshots
                    // console.log(doc.id, " => ", doc.data());
                    const thisConnection = new Connection(doc.id, doc.data());
                    connectionData[doc.id] = thisConnection;
                });
                this._connections = connectionData;
            });
        }

        // Builds this._connections from cached data
        async _buildConnectionDataFromCache() {
            const cached_connections = this._getCachedDataItem_Data(KEY_STORAGE_CONNECTIONS);
            this._connections = cached_connections;
        }

        // Kept as separate objects so you don't have to load the whole thing just to check the version
        _writeCachedDataItem(keyString, data, versionEpochTime) {
            cached_data[`${keyString}_DATA`] = data;
            cached_data[`${keyString}_VERSION`] = versionEpochTime;
        }
        _getCachedDataItem_Data(keyString) {
            return cached_data[`${keyString}_DATA`];
        }
        _getCachedDataItem_Version(keyString) {
            return cached_data[`${keyString}_VERSION`];
        }

        _writeUpdatedCachedMapData(liveDataVersion, isUsingLiveMap) {
            // Only (re-)write the data that was loaded to avoid overwriting with bad data
            if (this._shouldBuildMapNodes && isUsingLiveMap.nodes) {
                console.info("📝 Updating cached MapNodes");
                this._writeCachedDataItem(KEY_STORAGE_NODES, JSON.stringify(this._fbIDToMapNode), liveDataVersion);
            }
            if (this._shouldBuildGraph && isUsingLiveMap.connections) {
                console.info("📝 Updating cached Connections");
                this._writeCachedDataItem(KEY_STORAGE_CONNECTIONS, JSON.stringify(this._connections), liveDataVersion);
            }
            if (this._shouldBuildNames && isUsingLiveMap.names) {
                console.info("📝 Updating cached Names");
                this._writeCachedDataItem(KEY_STORAGE_NAMES, JSON.stringify(this._namesAndAliasToFbId), liveDataVersion);
            }
        }

        _buildNamesFromMapNodes() {
            const mapNodeValidNameToFbId = {};

            // For every map node...
            for (const fbId in this._fbIDToMapNode) {
                if (Object.hasOwnProperty.call(this._fbIDToMapNode, fbId)) {
                    const mapNode = this._fbIDToMapNode[fbId];
                    // Make an array with its alias names and its name
                    const nodeNames = [...mapNode.aliasList, mapNode.name];
                    nodeNames.forEach((possibleName) => {
                        // Check if 1. the node is meant to be searchable 2. it's non-null 3. non-empty
                        if (mapNode.searchable && possibleName && possibleName.trim().length > 0) {
                            // Skip and warn if the name was already added by something else
                            if (mapNodeValidNameToFbId[possibleName]) {
                                console.warn(`MapNode ${fbId} tried to add name ${possibleName},` +
                                    ` but it was already defined by map node ${mapNodeValidNameToFbId[possibleName]}`);
                            } else {
                                // Add the name mapping
                                mapNodeValidNameToFbId[possibleName] = fbId;
                            }
                        }
                    });
                }
            }
            this._namesAndAliasToFbId = mapNodeValidNameToFbId;

            // console.log(mapNodeValidNameToFbId);
        }

        _buildNamesFromCache() {
            // throw new Error("Unimplemented: Names data building from local storage");
            console.warn("Unimplemented: Names data building from local storage. Using from map nodes instead");
            this._buildNamesFromMapNodes();
        }
    };

    const mapDataSubsystemSingleton = new MapDataSubsystem(false, true, () => {
        console.log("Finished loading map data subsystem");
    });

    module.exports.getSomeThings = function() {
        db.collection("Constants").get().then((querySnapshot) => {
            querySnapshot.forEach((doc) => {
                console.log(`${doc.id} => ${doc.data()}`);
            });
        });
        return someThings;
    }

    module.exports.getNodeData = () => {
        return mapDataSubsystemSingleton.nodeData;
    }

}());