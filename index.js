const express = require('express')

const caching = require("./scripts/caching");

const path = require('path')
const PORT = process.env.PORT || 5000

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '/views/pages/index.html')));

app.get('/cached-nodes', async (req, res) => {
    console.log("Sending cached node data to client");
    const mapData = await caching.getNodeData();
    res.json(mapData);
});

app.get('/cached-connections', async (req, res) => {
    console.log("Sending cached connections data to client");
    const connData = await caching.getConnectionData();
    res.json(connData);
});

app.get('/cached-names', async (req, res) => {
    console.log("Sending cached name data to client");
    const nameData = await caching.getNameData();
    res.json(nameData);
});

let lastCheckDate = new Date(0);
const rateLimitMs = 5000;
app.get('/regen-fb-caches', async (req, res) => {
    console.log("Got request to regen fb caches, last was at ", lastCheckDate);
    let now = new Date();
    let difference = Math.abs(now.getTime() - lastCheckDate.getTime());
    if(difference > rateLimitMs) {
        caching.forceCheckCacheVersions();
        lastCheckDate = new Date();
        res.send("checking versions")
    } else {
        res.statusCode = 429;
        res.send(`it has been ${difference} ms since last send, needs to be more than ${rateLimitMs}`)
    }
});

const server = app.listen(PORT, () => console.log(`Listening on ${ PORT }`));
