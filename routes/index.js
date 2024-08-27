const express = require("express");
const router = express.Router();
const randomstring = require("randomstring");
const _ = require("underscore");
const nosql = require("nosql").load("database.nosql");
const { authzServer, clients } = require("../config");
const {
  getClient,
  buildUrl,
  decodeClientCredentials,
  getScopesFromForm,
} = require("../utils");

// トップページを返す
router.get("/", (req, res) => {
  res.render("index", {
    clients: clients,
    authzServer: authzServer,
  });
});

// 認可エンドポイント
router.get("/authorize", (req, res) => {
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
});

// 承認エンドポイント
router.post("/approve", (req, res) => {
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
});

// トークンエンドポイント
router.post("/token", (req, res) => {
  /*
  クライアント認証情報取得
  */

  // クライアント情報をAuthorizationヘッダーに登録してきた場合
  const auth = req.headers.authorization;
  let clientId;
  let clientSecret;

  if (auth) {
    const clientCredentials = decodeClientCredentials(auth);
    clientId = clientCredentials.id;
    clientSecret = clientCredentials.secret;
  }

  // クライアント情報をformパラメーターに登録してきた場合
  if (req.body.client_id) {
    // Authorizationヘッダーとボディ両方に含めている場合はエラーを返す
    if (clientId) {
      res.status(401).json({ error: "invalid_client" });
      return;
    }
    clientId = req.body.client_id;
    clientSecret = req.body.client_secret;
  }

  /*
  パラメータチェック
  client_id[任意]
  */
  const client = getClient(clientId);

  if (!client) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  if (client.client_secret !== clientSecret) {
    res.status(401).json({ error: "invalid_clientsecret" });
    return;
  }

  /*
  パラメータチェック
  grant_type[必須]
   */
  if (req.body.grant_type) {
    // 認可コードグラントの場合
    if (req.body.grant_type === "authorization_code") {
      /*
      パラメータチェック
      code[必須]
      */
      const requests = req.session.requests[req.body.code];
      delete req.session.requests[req.body.code];
      // 前回のセッションで使用した認可コードと同じ場合
      if (requests) {
        // 前回のセッションで渡されたclient_idと同じかチェック
        if (requests.client_id === clientId) {
          // トークンの生成
          const access_token = randomstring.generate();
          const refresh_token = randomstring.generate();

          nosql.insert({
            access_token: access_token,
            client_id: clientId,
            scope: requests.scope,
          });
          nosql.insert({
            refresh_token: refresh_token,
            client_id: clientId,
            scope: requests.scope,
          });

          res.status(200).json({
            access_token: access_token,
            refresh_token: refresh_token,
            token_type: "Bearer",
            scope: requests.scope.join(" "),
          });
          return;
        }
        // 異なる場合
        else {
          // エラーを返す
          res.status(400).json({ error: "invalid_grant" });
          return;
        }
      }
      // 前回のセッションで使用した認可コードと異なる場合
      else {
        // エラーを返す
        res.status(400).json({ error: "invalid_grant" });
        return;
      }
    }
    // リフレッシュトークンの場合
    else if (req.body.grant_type === "refresh_token") {
      nosql.one().make((builder) => {
        builder.where("refresh_token", req.body.refresh_token);
        builder.callback((err, token) => {
          if (token) {
            if (token.client_id !== clientId) {
              nosql.remove().make((builder) => {
                builder.where("refresh_token", req.body.refresh_token);
              });
              res.status(400).json({ error: "invalid_grant" });
              return;
            }

            const access_token = randomstring.generate();
            nosql.insert({ access_token: access_token, client_id: clientId });
            const token_response = {
              access_token: access_token,
              token_type: "Bearer",
              refresh_token: token.refresh_token,
            };
            res.status(200).json(token_response);
            return;
          } else {
            res.status(400).json({ error: "invalid_grant" });
            return;
          }
        });
      });
    } else {
      // エラーを返す
      res.status(400).json({ error: "unsupported_grant_type" });
      return;
    }
  }
  // それ以外の付与法新規の場合
  else {
    // エラーを返す
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }
});

module.exports = router;
