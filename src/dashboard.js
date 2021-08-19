const express = require("express");
const osu = require("node-os-utils");
const path = require("path");

const app = express();

app.use(express.static(path.resolve(__dirname + "/../dashboard/static")));

app.get("/", (req, res) => {
    res.sendFile(path.resolve(__dirname + "/../dashboard/static/index.html"));
})

app.get("/workers", (req, res) => {
    res.sendFile(path.resolve(__dirname + "/../dashboard/workers.json"));
})

app.get("/rewards", (req, res) => {
    res.sendFile(path.resolve(__dirname + "/../dashboard/rewards.json"));
})

app.get("/statistics", async (req, res) => {
    require("./index");

    const cpuUsage = await osu.cpu.usage();
    let ramUsage =  await osu.mem.info();
    ramUsage = 100 - ramUsage.freeMemPercentage;

    res.json({
        "connections": connections,
        "cpu": cpuUsage,
        "ram": ramUsage
    });
})

app.listen(5998);
console.log("Dashboard started at http://127.0.0.1:5998/");
