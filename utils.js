const { clients } = require("./config");
const _ = require("underscore");
const querystring = require("querystring");

const getClient = (client_id) => {
  return _.find(clients, (client) => {
    return client.client_id === client_id;
  });
};

const buildUrl = (url, params) => {
  const urlParsed = new URL(url);
  urlParsed.search = new URLSearchParams(params).toString();
  return urlParsed.toString();
};

const decodeClientCredentials = (auth) => {
  const clientCredentials = Buffer.from(auth.slice("basic ".length), "base64")
    .toString()
    .split(":");
  const clientId = querystring.unescape(clientCredentials[0]);
  const clientSecret = querystring.unescape(clientCredentials[1]);
  return { id: clientId, secret: clientSecret };
};

const getScopesFromForm = (body) => {
  return _.filter(_.keys(body), (s) => {
    return s.startsWith("scope_");
  }).map((s) => {
    return s.slice("scope_".length);
  });
};
module.exports = {
  getClient,
  buildUrl,
  decodeClientCredentials,
  getScopesFromForm,
};
