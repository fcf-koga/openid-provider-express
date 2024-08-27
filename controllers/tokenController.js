const randomstring = require("randomstring");
const nosql = require("nosql").load("database.nosql");

const { decodeClientCredentials, getClient } = require("../utils");

exports.token = (req, res) => {
  /*
    クライアント認証情報取得
    */

  // クライアント情報をAuthorizationヘッダーに登録してきた場合
  const { authorization } = req.headers;
  let r_clientId;
  let r_clientSecret;

  if (authorization) {
    const clientCredentials = decodeClientCredentials(authorization);
    r_clientId = clientCredentials.id;
    r_clientSecret = clientCredentials.secret;
  }

  const { client_id, client_secret, grant_type } = req.body;

  // クライアント情報をformパラメーターに登録してきた場合
  if (client_id) {
    // Authorizationヘッダーとボディ両方に含めている場合はエラーを返す
    if (r_clientId) {
      res.status(401).json({ error: "invalid_client" });
      return;
    }
    r_clientId = client_id;
    r_clientSecret = client_secret;
  }

  /*
    パラメータチェック
    client_id[任意]
    */
  const client = getClient(r_clientId);

  if (!client) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  if (client.client_secret !== r_clientSecret) {
    res.status(401).json({ error: "invalid_clientsecret" });
    return;
  }

  /*
    パラメータチェック
    grant_type[必須]
     */
  if (grant_type) {
    // 認可コードグラントの場合
    if (grant_type === "authorization_code") {
      /*
        パラメータチェック
        code[必須]
        */
      const { code } = req.body;
      const s_req = req.session.requests[code];
      delete req.session.requests[code];
      // 前回のセッションで使用した認可コードと同じ場合
      if (s_req) {
        const { client_id: s_client_id, scope: s_scope } = s_req;
        // 前回のセッションで渡されたclient_idと同じかチェック
        if (s_client_id === r_clientId) {
          // トークンの生成
          const access_token = randomstring.generate();
          const refresh_token = randomstring.generate();

          nosql.insert({
            access_token: access_token,
            client_id: r_clientId,
            scope: s_scope,
          });
          nosql.insert({
            refresh_token: refresh_token,
            client_id: r_clientId,
            scope: s_scope,
          });

          res.status(200).json({
            access_token: access_token,
            refresh_token: refresh_token,
            token_type: "Bearer",
            scope: s_scope.join(" "),
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
    else if (grant_type === "refresh_token") {
      const { refresh_token } = req.body;
      nosql.one().make((builder) => {
        builder.where("refresh_token", refresh_token);
        builder.callback((err, token) => {
          if (token) {
            if (token.client_id !== r_clientId) {
              nosql.remove().make((builder) => {
                builder.where("refresh_token", refresh_token);
              });
              res.status(400).json({ error: "invalid_grant" });
              return;
            }

            const access_token = randomstring.generate();
            nosql.insert({ access_token: access_token, client_id: r_clientId });
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
