/* Duino-Coin Pool dashboard generator
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2021 Duino-Coin community */

const express = require("express");
const log = require("./logging");
const app = express();

app.get("/ping", async(req, res) => {
    require("./index");
    res.json({
        "result": "Pong!",
        "success": true
    });
})

try {
    app.listen(8080);
    log.info("Ping listener on port 8080 enabled");
} catch (err) {
    log.warning(`Ping listener is probably already running (${err})`);
}
