const express = require('express');
const cors = require('cors');

const caching = require("./scripts/caching");

const path = require('path');
const PORT = process.env.PORT || 8000;

const app = express();

app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '/views/pages/index.html')));

app.get('/cached-nodes', async (req, res) => {
    console.log("Sending cached node data to client");
    const info = await caching.getNodeData();
    res.statusCode = info.rebuilt ? 202 : 203;
    res.json(info.data);
});

app.get('/cached-connections', async (req, res) => {
    console.log("Sending cached connections data to client");
    const info = await caching.getConnectionData();
    res.statusCode = info.rebuilt ? 202 : 203;
    res.json(info.data);
});

app.get('/cached-names', async (req, res) => {
    console.log("Sending cached name data to client");
    const info = await caching.getNameData();
    res.statusCode = info.rebuilt ? 202 : 203;
    res.json(info.data);
});

let lastCheckDate = new Date(0);
const rateLimitMs = 5000;
app.get('/regen-fb-caches', async (req, res) => {
    console.log("Got request to regen fb caches, last was at ", lastCheckDate);
    let now = new Date();
    let difference = Math.abs(now.getTime() - lastCheckDate.getTime());
    if(difference > rateLimitMs) {
        const wasUpdated = await caching.forceCheckCacheVersions();
        lastCheckDate = new Date();
        res.statusCode = wasUpdated ? 202 : 200;
        res.send(wasUpdated ? "Updated firebase caches" : "No cache update was required")
    } else {
        res.statusCode = 429;
        res.send(`It has only been ${difference} ms since last send, needs to be more than ${rateLimitMs}`)
    }
});

const server = app.listen(PORT, () => console.log(`Listening on ${ PORT }`));
