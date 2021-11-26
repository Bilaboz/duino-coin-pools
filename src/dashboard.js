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

app.use(express.static(path.resolve(__dirname + "/../dashboard/static")));

app.get("/", (req, res) => {
    res.sendFile(path.resolve(__dirname + "/../dashboard/static/index.html"));
})

app.get("/workers", (req, res) => {
    res.sendFile(path.resolve(`${base_sync_folder}/workers_${poolID}.json`));
})

app.get("/rewards", (req, res) => {
    res.sendFile(path.resolve(`${base_sync_folder}/rewards_${poolID}.json`));
})

app.get("/statistics", async(req, res) => {
    require("./index");

    const cpuUsage = await osu.cpu.usage();
    let ramUsage = await osu.mem.info();
    ramUsage = 100 - ramUsage.freeMemPercentage;

    res.json({
        "connections": connections,
        "cpu": cpuUsage,
        "ram": ramUsage
    });
})

app.listen(dashboard_port);
console.log(`${poolName}: ${new Date().toLocaleString()}` + info(` Dashboard listening on port ${dashboard_port}`));
