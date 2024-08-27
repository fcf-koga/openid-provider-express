const { clients, authzServer } = require("../config");

exports.index = (req, res) => {
  res.render("index", {
    clients: clients,
    authzServer: authzServer,
  });
};
