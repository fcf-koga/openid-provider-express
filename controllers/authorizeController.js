const { authzServer } = require("../config");
const { getClient, buildUrl } = require("../utils");
const randomstring = require("randomstring");
const _ = require("underscore");

exports.authorization = (req, res) => {
  const { client_id, response_type, scope } = req.query;
  let { redirect_uri } = req.query;

  // リクエストで渡されたclient_idが存在するかチェック
  const client = getClient(client_id);
  if (!client) {
    // 存在しない場合エラーページを返す
    res.render("warn", { message: "Unknown client" });
    return;
  }

  if (redirect_uri) {
    // リクエストで渡されたredirect_urlが登録されたuriと一致するかチェック
    if (!client.redirect_uris.includes(redirect_uri)) {
      // 一致しない場合エラーページを返す
      res.render("warn", { message: "Invalid redirect URI" });
      return;
    }
    redirect_uri = redirect_uri;
  }
  // redirect_urlが指定されていない場合、デフォルトのredirect_urlを設定
  else {
    [redirect_uri] = client.redirect_uris;
  }

  // リクエストにrespons_typeが指定されているかチェック
  if (!response_type) {
    const parsedUrl = buildUrl(redirect_uri, {
      error: "invalid_response_type",
    });
    res.redirect(parsedUrl);
    return;
  }

  // リクエストで渡されたrespons_typeについて対応しているかチェック
  else if (!authzServer.responseType.includes(response_type)) {
    const parsedUrl = buildUrl(redirect_uri, {
      error: "unsupported_response_type",
    });
    res.redirect(parsedUrl);
    return;
  }

  const scopes = scope ? scope.split(" ") : undefined;
  // リクエストにscopeが指定されているかチェック
  if (scopes) {
    // リクエストで渡されたscopeに不正なscopeが1つでも含まれているかチェック
    if (_.difference(scopes, client.scope).length > 0) {
      // 含まれていた場合、リダイレクトエンドポインへエラーを返す
      const urlParsed = buildUrl(redirect_uri, {
        error: "invalid_scope",
      });
      res.redirect(urlParsed);
      return;
    }
  }
  // 指定されていない場合エラー
  else {
    const urlParsed = buildUrl(redirect_uri, {
      error: "invalid_scope",
    });
    res.redirect(urlParsed);
    return;
  }

  const reqid = randomstring.generate(8);
  // reqidをキーとしてリクエストのクエリパラメータを格納
  req.session.requests = {};
  req.session.requests[reqid] = req.query;
  req.session.requests[reqid].redirect_uri = redirect_uri;

  // 認可承認画面を表示する
  res.render("approve", {
    requests: req.session.requests[reqid],
    reqid: reqid,
    scope: scope,
  });
  return;
};
