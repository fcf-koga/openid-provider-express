const randomstring = require("randomstring");
const nosql = require("nosql").load("database.nosql");

const { decodeClientCredentials, getClient } = require("../utils");

exports.token = (req, res) => {
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
};
