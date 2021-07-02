const express = require("express");
const osu = require("node-os-utils");

const app = express();

app.use(express.static(__dirname + "/../dashboard/static"));

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/../dashboard/static/index.html");
})

app.get("/workers", (req, res) => {
    res.sendFile(__dirname + "/../dashboard/workers.json");
})

app.get("/statistics", async (req, res) => {
    const { connections } = require("./index");

    const cpuUsage = await osu.cpu.usage();
    let ramUsage =  await osu.mem.info();
    ramUsage = 100 - ramUsage.freeMemPercentage;

    res.json({
        "connections": connections,
        "cpu": cpuUsage,
        "ram": ramUsage
    });
})

app.listen(6001);
console.log("Dashboard started at http://127.0.0.1:6001/");