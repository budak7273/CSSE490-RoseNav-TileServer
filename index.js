const express = require('express')

const caching = require("./scripts/caching");

const path = require('path')
const PORT = process.env.PORT || 5000

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '/views/pages/index.html')));

app.get('/cached-nodes', async (req, res) => {
    console.log("Testing");
    // res.send(caching.getSomeThings());
    const mapData = caching.getNodeData();
    console.log("responding with data: ", mapData);
    res.send(mapData);
});

const server = app.listen(PORT, () => console.log(`Listening on ${ PORT }`));
