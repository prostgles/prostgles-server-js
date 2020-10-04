const proxy = require("http-proxy-middleware")

module.exports = app => {
  app.use(proxy("/websocket", {target: "https://localhost:8080", ws: true}))
}