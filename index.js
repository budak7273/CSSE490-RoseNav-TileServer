const express = require('express')
const firebase = require("firebase");
require("firebase/firestore");

const caching = require("./scripts/caching");

const path = require('path')
const PORT = process.env.PORT || 5000

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

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.set('views', path.join(__dirname, 'views'));
  // .set('view engine', 'ejs')
  // .get('/', (req, res) => res.render('pages/index'))

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '/views/pages/index.html')));

app.get('/cached-nodes', async (req, res) => {
  console.log("Testing");
  db.collection("Constants").get().then((querySnapshot) => {
    querySnapshot.forEach((doc) => {
        console.log(`${doc.id} => ${doc.data()}`);
    });
  });
  res.send(caching.getSomeThings());
});

const server = app.listen(PORT, () => console.log(`Listening on ${ PORT }`));
