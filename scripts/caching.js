(function() {
    const firebase = require("firebase");
    require("firebase/firestore");

    const FB_COLLECTION_CONSTANTS = "Constants";
    const FB_COLLECTION_LOCATIONS = "Locations";
    const FB_COLLECTION_CONNECTIONS = "Connections";
    const FB_COLLECTION_CACHED = "Cached";
    const FB_KEY_LOC_GEO = "location";
    const FB_KEY_LOC_NAME = "name";
    const FB_KEY_LOC_ALIAS = "name-aliases";
    const FB_KEY_LOC_SEARCHABLE = "searchable?";
    const FB_KEY_CON_NAME = "name";
    const FB_KEY_CON_PLACE1 = "place1";
    const FB_KEY_CON_PLACE2 = "place2";
    const FB_KEY_CON_STAIRCASE = "staircase?";

    const KEY_STORAGE_VERSION = "local-data-version";
    const KEY_STORAGE_NODES = "local-data-nodes";
    const KEY_STORAGE_CONNECTIONS = "local-data-connections";
    const KEY_STORAGE_NAMES = "local-data-names";

    // Forcibly get new map data regardless of cache.
    // Forcibly rewrites the caches, even if they aren't outdated
    const DEBUG_FORCE_LIVE_MAP = false;

    // Forcibly make a new cache every time
    const DEBUG_FORCE_REWRITE_ALL_CACHES = false;


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
            this._localDataVersion = cached_data[KEY_STORAGE_VERSION] || new Date(0);

            // An object used as a map. The keys are firebase ID strings, the values are the MapNodes they correspond to.
            this._fbIDToMapNode = {};
            // An object used as a map. The keys are firebase ID strings, the values are the Connection objects they correspond to.
            this._connections = {};
            // Object used as a map of all location names and aliases mapped to their firebase ID string
            this._namesAndAliasToFbId = {};

            this._ref = firebase.firestore();
            this._locationsRef = this._ref.collection(FB_COLLECTION_LOCATIONS);
            this._connectionsRef = this._ref.collection(FB_COLLECTION_CONNECTIONS);
            this._cachesRef = this._ref.collection(FB_COLLECTION_CACHED);

            this._shouldBuildMapNodes = true;
            this._shouldBuildGraph = shouldBuildGraph;
            this._shouldBuildNames = shouldBuildNames;

            this._prepareData(callbackWhenDone);
        }

        async _prepareData(finalCallback) {
            try {
                const localDataVersion = this._localDataVersion;
                const liveDataVersion = await this.getMapLiveVersionNumber();
                const fbCachedDataVersion = await this.getMapFbCachedVersionNumber();
                console.log(`📦 LOCAL data version is ${localDataVersion}`);
                console.log(`🔥 LIVE map data version is ${liveDataVersion}`);
                console.log(`💾 FbCached map data version is ${fbCachedDataVersion}`);

                // Any change to the map increases the liveDataVersion timestamp
                // Increases in the liveDataVersion mean that ALL caches are invalid,
                // but each cached item needs to keep track of if it has been updated or not
                // individually, since different parts of the data load at different times.

                const fbCacheNeedsRefreshing = liveDataVersion > fbCachedDataVersion || DEBUG_FORCE_REWRITE_ALL_CACHES;
                if(fbCacheNeedsRefreshing) {
                    console.log("📝 Firebase cache of map data needs updating, so getting live data and sending up the updated copy");
                } else {
                    console.log("✅ Firebase cache does not need updating");
                }

                // Decide to load either cached or fresh data
                // given an item's cached version timestamp
                const shouldUseLiveFor = (cachedVersion) => {
                    return DEBUG_FORCE_LIVE_MAP ||
                        DEBUG_FORCE_REWRITE_ALL_CACHES ||
                        fbCacheNeedsRefreshing ||
                        (liveDataVersion > cachedVersion);
                };

                const shouldUseFbCachedFor = (cachedVersion) => {
                    return !fbCacheNeedsRefreshing &&
                        !DEBUG_FORCE_REWRITE_ALL_CACHES &&
                        (fbCachedDataVersion > cachedVersion);
                };

                const mapNodeCachedVersion = this._getCachedDataItem_Version(KEY_STORAGE_NODES);
                // console.log(`📦 LOCAL CACHED map data version is ${mapNodeCachedVersion} (${new Date(mapNodeCachedVersion).toString()})`);
                const shouldUseFbCachedForMapNodes = shouldUseFbCachedFor(mapNodeCachedVersion);
                const shouldUseLiveForMapNodes = shouldUseLiveFor(mapNodeCachedVersion);
                if (this._shouldBuildMapNodes) {
                    if (shouldUseFbCachedForMapNodes) {
                        console.log("💾 Using *Firebase Cached* for MapNodes");
                        await this._buildNodeDataFromFbCache();
                    } else if (shouldUseLiveForMapNodes) {
                        console.log("🔥 Using *live firebase* for MapNodes");
                        await this._buildNodeDataFromFb();
                    } else {
                        console.log("📦 Using *local data* for MapNodes");
                        await this._buildNodeDataFromLocal();
                    }
                }

                const connectionsCachedVersion = this._getCachedDataItem_Version(KEY_STORAGE_CONNECTIONS);
                // console.log(`📦 LOCAL CACHED connection data version is ${connectionsCachedVersion} (${new Date(connectionsCachedVersion).toString()})`);
                const shouldUseFbCachedForConnections = shouldUseFbCachedFor(connectionsCachedVersion);
                const shouldUseLiveForConnections = shouldUseLiveFor(connectionsCachedVersion);
                if (this._shouldBuildGraph) {
                    if (shouldUseFbCachedForConnections) {
                        console.log("💾 Using *Firebase Cached* for Connections");
                        await this._buildConnectionDataFromFbCache();
                    } else if (shouldUseLiveForConnections) {
                        console.log("🔥 Using *firebase live* for Connections");
                        await this._buildConnectionDataFromFb();
                    } else {
                        console.log("📦 Using *local data* for Connections");
                        await this._buildConnectionDataFromLocal();
                    }
                }

                const namesCachedVersion = this._getCachedDataItem_Version(KEY_STORAGE_NAMES);
                const shouldUseLiveForNames = shouldUseLiveFor(namesCachedVersion);
                if (this._shouldBuildNames) {
                    if (shouldUseLiveForNames) {
                        console.log("  Using *MapNodes* for Names");
                        await this._buildNamesFromMapNodes();
                    } else {
                        console.log("📦 Using *local data* for Names");
                        await this._buildNamesFromCache();
                    }
                }

                // Update the memory caches as needed for each item
                const isUsingLiveMap = {
                    nodes: shouldUseLiveForMapNodes,
                    connections: shouldUseLiveForConnections,
                    names: shouldUseLiveForNames,
                };
                await this._writeUpdatedLocalMapData(liveDataVersion, isUsingLiveMap);

                if(fbCacheNeedsRefreshing) {
                    console.log("📤 Sending updated data to firebase cache");
                    const updateCacheFor = {
                        nodes: shouldUseFbCachedForMapNodes,
                        connections: true,
                        names: true,
                    }
                    await this._uploadUpdatedCacheData(liveDataVersion, updateCacheFor);
                }

                console.log("Calling final MapDataSubsystem callback...");
                await finalCallback();
            } catch (error) {
                console.error("MapDataSubsystem failed while prepping data:", error);
            }
        }

        get nodeData() {
            if (this._fbIDToMapNode == {} || this._fbIDToMapNode == undefined) {
                console.error("Tried to access map nodes before they were loaded; returning null instead");
            }
            return this._fbIDToMapNode;
        }

        get connectionData() {
            if (this._connections == {} || this._connections == undefined) {
                console.error("Tried to access map connections before they were loaded; returning {} instead");
            }
            return this._connections;
        }

        get nameData() {
            if (this._namesAndAliasToFbId == {} || this._namesAndAliasToFbId == undefined) {
                console.error("Tried to access names before they were loaded; returning {} instead");
            }
            return this._namesAndAliasToFbId;
        }

        async _getFbVersionEntry(versionDocName, fieldName) {
            const liveMapVersionRef = this._ref.collection(FB_COLLECTION_CONSTANTS).doc(versionDocName);
            return await liveMapVersionRef.get().then((doc) => {
                if (doc.exists) {
                    let data = doc.data();
                    if (data[fieldName]) {
                        return data[fieldName].toDate();
                    } else {
                        throw new Error("No such field in Versions document - " + fieldName);
                    }
                } else {
                    throw new Error("No such document - Versions");
                }
            });
        }

        async getMapLiveVersionNumber() {
            return await this._getFbVersionEntry("Versions", "map");
        }

        async getMapFbCachedVersionNumber() {
            return await this._getFbVersionEntry("CacheVersions", "fbCachedNodes");
        }

        async doesNewerVersionExistThanCached() {
            const localDataVersion = this._localDataVersion;
            const liveDataVersion = await this.getMapLiveVersionNumber();
            // console.log(`  LOCAL data version is ${localDataVersion}`);
            // console.log(`  LIVE map data version is ${liveDataVersion}`);
            const res = liveDataVersion > localDataVersion;
            console.log(" New>old: ", res);
            return res;
        }

        async _getJsonFromFirebaseCache(cacheDocumentName) {
            const fbCacheRef = this._cachesRef.doc(cacheDocumentName);
            return await fbCacheRef.get().then((doc) => {
                if (doc.exists) {
                    return JSON.parse(doc.data().dataJson);
                } else {
                    throw new Error(`${cacheDocumentName} cache document not present`);
                }
            });
        }

        _bumpFbCachedVersionNumber(liveDataVersion) {
            // https://firebase.google.com/docs/database/web/read-and-write?authuser=0#update_specific_fields
            const liveMapVersionRef = this._ref.collection(FB_COLLECTION_CONSTANTS).doc("CacheVersions");
            const date = new Date(liveDataVersion);
            return liveMapVersionRef.update({
                "fbCachedNodes": date,
            }).then(() => {
                console.log("🔼 Bumped fbCachedNodes version to ", date);
            }).catch((error) => {
                console.error("Failed to update version document:", error);
            });
        }

        // Builds this._fbIDToMapNode from Firebase-fetched data
        async _buildNodeDataFromFb() {
            await this._locationsRef.get().then((querySnapshot) => {
                console.log("Num nodes:", querySnapshot.size);
                let index = 0;
                querySnapshot.forEach((doc) => {
                    // doc.data() is never undefined for query doc snapshots
                    // console.log(doc.id, " => ", doc.data());
                    const thisNode = new MapNode(doc.id, doc.data(), index);
                    this._fbIDToMapNode[doc.id] = thisNode;
                    index++;
                });
            });
        }

        // Builds this._fbIDToMapNode from local data
        async _buildNodeDataFromLocal() {
            this._fbIDToMapNode = this._getCachedDataItem_Data(KEY_STORAGE_NODES);
        }

        //Builds this._fbIDToMapNode from firebase cached copy of data
        async _buildNodeDataFromFbCache() {
            this._fbIDToMapNode = await this._getJsonFromFirebaseCache("nodes");
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

        //Builds this._connections from firebase cached copy of data
        async _buildConnectionDataFromFbCache() {
            this._connections = await this._getJsonFromFirebaseCache("connections");
        }

        // Builds this._connections from local data
        async _buildConnectionDataFromLocal() {
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
            return cached_data[`${keyString}_VERSION`] || 0;
        }

        _writeUpdatedLocalMapData(liveDataVersion, isUsingLiveMap) {
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

            this._localDataVersion = liveDataVersion;
            cached_data[KEY_STORAGE_VERSION] = liveDataVersion;
        }

        _uploadCacheDataItem(documentName, dataString, liveDataVersion) {
            console.info("💾 Updating FB cache for " + documentName);
            const liveMapVersionRef = this._ref.collection(FB_COLLECTION_CACHED).doc(documentName);
            const date = new Date(liveDataVersion);
            return liveMapVersionRef.update({
                "version": date,
                "dataJson": dataString,
            }).then(() => {
                console.log(`🔼 Wrote updated ${documentName} cache with version ${date}`);
            }).catch((error) => {
                console.error("Failed to update document:", error);
            });
        }

        _uploadUpdatedCacheData(liveDataVersion, updateCacheFor) {
            this._uploadCacheDataItem("nodes", JSON.stringify(this._fbIDToMapNode), liveDataVersion);
            this._uploadCacheDataItem("connections", JSON.stringify(this._connections), liveDataVersion);
            this._uploadCacheDataItem("names", JSON.stringify(this._namesAndAliasToFbId), liveDataVersion);
            this._bumpFbCachedVersionNumber(liveDataVersion);
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
            // throw new Error("Unimplemented: Names data building from local data");
            console.warn("Unimplemented: Names data building from local data. Using from map nodes instead");
            this._buildNamesFromMapNodes();
        }
    };

    let mapDataSubsystemSingleton = new MapDataSubsystem(true, true, () => {
        console.log("Finished first time loading map data subsystem");
    });

    const checkIfNeedToRebuildLocalCopy = async () => {
        if(await mapDataSubsystemSingleton.doesNewerVersionExistThanCached()) {
            console.log("⚠ Live map data is newer so rebuilding");
            // TODO the new object is not ready in time for the response. Need to fix this if we ever use this as the source for the map data instead of fb.
            mapDataSubsystemSingleton = new MapDataSubsystem(true, true, () => {
                console.log("> Finished rebuilding map data subsystem");
            });
            return true;
        } else {
            console.log("✅ Local data is up to date");
            return false;
        }
    }

    module.exports.getNodeData = async () => {
        let rebuilt = await checkIfNeedToRebuildLocalCopy();
        return {
            data: mapDataSubsystemSingleton.nodeData,
            rebuilt: rebuilt
        };
    }

    module.exports.getConnectionData = async () => {
        let rebuilt = await checkIfNeedToRebuildLocalCopy();
        return {
            data: mapDataSubsystemSingleton.connectionData,
            rebuilt: rebuilt,
        };
    }

    module.exports.getNameData = async () => {
        let rebuilt = await checkIfNeedToRebuildLocalCopy();
        return {
            data: mapDataSubsystemSingleton.nameData,
            rebuilt: rebuilt,
        };
    }

    module.exports.forceCheckCacheVersions = async () => {
        return await checkIfNeedToRebuildLocalCopy();
    }

}());