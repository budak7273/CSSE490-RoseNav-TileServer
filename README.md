# CSSE490-RoseNav-TileServer

Was going to be a custom tile server for [RoseNav](https://github.com/budak7273/CSSE280-RoseNav) and might be eventually, but for now, it handles writing the cache copy when needed. This cache handling could probably be done serverless, but that can be implemented later down the line if it's worth our time.

Node.js app using [Express 4](http://expressjs.com/) originally set up with the [Getting Started on Heroku with Node.js](https://devcenter.heroku.com/articles/getting-started-with-nodejs) article.

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

Make sure you're logged in first:

```sh
heroku login
```

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
