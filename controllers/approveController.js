const randomstring = require("randomstring");
const _ = require("underscore");

const { getScopesFromForm, getClient, buildUrl } = require("../utils");

exports.approve = (req, res) => {
  const requests = req.session.requests[req.body.reqid];
  delete req.session.requests[req.body.reqid];
  // reqidに紐づいたリクエストが見つからない場合エラーを返す
  if (!requests) {
    res.render("warn", { message: "No matching authorization request" });
    return;
  }
  // ユーザーが認可を承認した場合
  if (req.body.action === "approve") {
    if (requests.response_type === "code") {
      const scope = getScopesFromForm(req.body);
      const client = getClient(requests.client_id);

      if (_.difference(scope, client.scope).length > 0) {
        const urlParsed = buildUrl(requests.redirect_uri, {
          error: "invalid_scope",
        });
        res.redirect(urlParsed);
        return;
      }
      // 認可コードの生成
      const code = randomstring.generate(16);

      const urlParams = {
        code: code,
      };

      if (requests.state) {
        urlParams.state = requests.state;
      }

      req.session.requests = {};
      req.session.requests[code] = requests;
      req.session.requests[code].scope = scope;

      const urlParsed = buildUrl(requests.redirect_uri, urlParams);

      res.redirect(urlParsed);
      return;
    } else {
      const urlParsed = buildUrl(requests.redirect_uri, {
        error: "unsupported_response_type",
      });
      res.redirect(urlParsed);
      return;
    }
  }
  // ユーザーが認可を拒否した場合
  else {
    const urlParsed = buildUrl(requests.redirect_uri, {
      error: "accsess_denied",
    });
    res.redirect(urlParsed);
    return;
  }
};
