const express = require("express");
const router = express.Router();

const home_controller = require("../controllers/homeController");
const authz_controller = require("../controllers/authorizeController");
const approve_controller = require("../controllers/approveController");
const token_controller = require("../controllers/tokenController");

// トップページを返す
router.get("/", home_controller.index);

// 認可エンドポイント
router.get("/authorize", authz_controller.authorization);

// 承認エンドポイント
router.post("/approve", approve_controller.approve);

// トークンエンドポイント
router.post("/token", token_controller.token);

module.exports = router;
