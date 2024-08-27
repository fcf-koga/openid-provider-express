const { authzServer } = require("../config");
const { getClient, buildUrl } = require("../utils");
const randomstring = require("randomstring");
const _ = require("underscore");

exports.authorization = (req, res) => {
  /*
    パラメータチェック
    client_id[必須]
    */

  // リクエストで渡されたclient_idが存在するかチェック
  const client = getClient(req.query.client_id);
  if (!client) {
    // 存在しない場合エラーページを返す
    res.render("warn", { message: "Unknown client" });
    return;
  }

  /*
    パラメータチェック
    redirect_uri[任意]
    */
  let redirect_uri;

  if (req.query.redirect_uri) {
    // リクエストで渡されたredirect_urlが登録されたuriと一致するかチェック
    if (!client.redirect_uris.includes(req.query.redirect_uri)) {
      // 一致しない場合エラーページを返す
      res.render("warn", { message: "Invalid redirect URI" });
      return;
    }
    redirect_uri = req.query.redirect_uri;
  }
  // redirect_urlが指定されていない場合、デフォルトのredirect_urlを設定
  else {
    redirect_uri = client.redirect_uris[0];
  }

  /*
    パラメータチェック
    response_type[必須]
    */

  // リクエストにrespons_typeが指定されているかチェック
  if (!req.query.response_type) {
    const parsedUrl = buildUrl(redirect_uri, {
      error: "invalid_response_type",
    });
    res.redirect(parsedUrl);
    return;
  }
  // リクエストで渡されたrespons_typeについて対応しているかチェック
  else if (!authzServer.responseType.includes(req.query.response_type)) {
    const parsedUrl = buildUrl(redirect_uri, {
      error: "unsupported_response_type",
    });
    res.redirect(parsedUrl);
    return;
  }

  /*
    パラメータチェック
    scope[任意]
    */

  const scope = req.query.scope ? req.query.scope.split(" ") : undefined;
  // リクエストにscopeが指定されているかチェック
  if (scope) {
    // リクエストで渡されたscopeに不正なscopeが1つでも含まれているかチェック
    if (_.difference(scope, client.scope).length > 0) {
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

  /*
    リダイレクト前後で状態を保持するためのreqidを発行
    */
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
