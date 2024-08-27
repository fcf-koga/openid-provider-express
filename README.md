DEBUG=openid-provider-express:\* npm start

http://localhost:3000 にアクセスできるか確認 アクセスできたら成功

## MongoDBの起動

```
docker compose up -d
```

### MongoDBへの接続

```
docker compose exec mongo bash

mongosh --port 27017  --authenticationDatabase -u "root" -p

Enter password:
<!-- パスワードはdocker-compose.ymlで設定したもの -->
```
