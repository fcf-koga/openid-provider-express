const randomstring = require("randomstring");
const _ = require("underscore");

const { getScopesFromForm, getClient, buildUrl } = require("../utils");

exports.approve = (req, res) => {
  const { reqid, action } = req.body;

  const s_req = req.session.requests[reqid];
  delete req.session.requests[reqid];

  // reqidに紐づいたリクエストが見つからない場合エラーを返す
  if (!s_req) {
    res.render("warn", { message: "No matching authorization request" });
    return;
  }

  const {
    response_type: s_response_type,
    client_id: s_client_id,
    redirect_uri: s_redirect_uri,
    state: s_state,
  } = s_req;

  // ユーザーが認可を承認した場合
  if (action === "approve") {
    if (s_response_type === "code") {
      const scope = getScopesFromForm(req.body);
      const client = getClient(s_client_id);

      if (_.difference(scope, client.scope).length > 0) {
        const urlParsed = buildUrl(s_redirect_uri, {
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

      if (s_state) {
        urlParams.state = s_state;
      }

      req.session.requests = {};
      req.session.requests[code] = {
        response_type: s_response_type,
        client_id: s_client_id,
        redirect_uri: s_redirect_uri,
        state: s_state,
        scope,
      };

      const urlParsed = buildUrl(s_redirect_uri, urlParams);

      res.redirect(urlParsed);
      return;
    } else {
      const urlParsed = buildUrl(s_redirect_uri, {
        error: "unsupported_response_type",
      });
      res.redirect(urlParsed);
      return;
    }
  }
  // ユーザーが認可を拒否した場合
  else {
    const urlParsed = buildUrl(s_redirect_uri, {
      error: "accsess_denied",
    });
    res.redirect(urlParsed);
    return;
  }
};
