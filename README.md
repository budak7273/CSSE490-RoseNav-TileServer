# CSSE490-RoseNav-TileServer

Right now, a barebones Node.js app using [Express 4](http://expressjs.com/) based on the [Getting Started on Heroku with Node.js](https://devcenter.heroku.com/articles/getting-started-with-nodejs) article.

## Running Locally

Make sure you have [Node.js](http://nodejs.org/) installed. Clone the repo, then:

```sh
npm install
npm start
```

Your app should now be running on [localhost:5000](http://localhost:5000/).

## Running Tests

Make sure you don't have a running local copy, then run:

```sh
npm test
```

## Deploying to Heroku

```sh
git push heroku main
heroku open
```

or

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## Documentation

For more information about using Node.js on Heroku, see these Dev Center articles:

- [Getting Started on Heroku with Node.js](https://devcenter.heroku.com/articles/getting-started-with-nodejs)
- [Heroku Node.js Support](https://devcenter.heroku.com/articles/nodejs-support)
- [Node.js on Heroku](https://devcenter.heroku.com/categories/nodejs)
- [Best Practices for Node.js Development](https://devcenter.heroku.com/articles/node-best-practices)
- [Using WebSockets on Heroku with Node.js](https://devcenter.heroku.com/articles/node-websockets)
