/* Duino-Coin Pool dashboard generator
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2021 Duino-Coin community */

const express = require("express");
const osu = require("node-os-utils");
const path = require("path");

const chalk = require('chalk');
const error = chalk.bold.red;
const info = chalk.blue;
const success = chalk.green;
const warning = chalk.hex('#FFA500');

const {
    poolName,
    dashboard_port,
    base_sync_folder
} = require("../config/config.json");
const app = express();

app.get("/ping", async(req, res) => {
    require("./index");
    res.json({
        "result": "Pong!",
        "success": true
    });
})


app.listen(8080).on('error', function(err) { });
console.log(`${poolName}: ${new Date().toLocaleString()}` + info(` Ping listener on port 8080 enabled`));
