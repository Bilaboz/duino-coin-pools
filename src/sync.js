const net = require("net");
const axios = require("axios");
const fs = require("fs");
const osu = require("node-os-utils");
const { exit } = require("process");

const { poolID, poolVersion, port, serverIP, serverPort } = require("../config/config.json");
let ip;

async function login() {
    const res = await axios.get("https://api.ipify.org/");
    if (!res.data) {
        console.log("Error: can't get the pool IP");
        exit(1);
    }
    ip = res.data;

    const loginInfos = {
        host: ip,
        port: port,
        version: poolVersion,
        identifier: poolID
    };

    const socket = new net.Socket();
    socket.setEncoding("utf-8");
    socket.connect(serverPort, serverIP);

    socket.on("error", (err) => {
        console.log(`Socket error at login: ${err}`);
        exit(1);
    });

    socket.on("timeout", () => {
        console.log("Socket timeout at login");
        exit(1);
    });

    socket.on("data", (data) => {
        if (data.startsWith("2")) {
            socket.write(`PoolLogin,${JSON.stringify(loginInfos)}`);
        } else if (data === "LoginOK") {
            console.log("Pool successfully logged in");
            socket.destroy();
            sync();
        } else {
            console.log(`Unknown error, server returned ${data} in login`);
            exit(data)
        }
    })
}

function logout() {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.setEncoding("utf-8");
        socket.connect(serverPort, serverIP);
    
        socket.on("error", (err) => {
            console.log(`Socket error at logout: ${err}`);
            reject(1);
        });
    
        socket.on("timeout", () => {
            console.log("Socket timeout at logout");
            reject(1);
        });
    
        socket.on("data", (data) => {
            console.log(data)
            if (data.startsWith("2")) {
                socket.write(`PoolLogout,${poolID}`);
            } else if (data === "LogoutOK") {
                console.log("Pool successfully logged out")
                resolve();
            } else {
                console.log(`Unknown error, server returned ${data} in logout`);
                reject(data);
            }
        })
    })
}

function updatePoolReward() {
    axios({
        method: "get",
        url: "https://server.duinocoin.com/PoolRewards.json",
        responseType: "stream"
    }).then((response) => {
        response.data.pipe(fs.createWriteStream("./config/poolRewards.json"))
        
        response.data.on("error", (err) => {
            console.log(`Error downloading poolRewards.json: ${err}`);
        });
    
        response.data.on("end", () => {
            console.log("Updated poolRewards.json")
        });
    });

    setTimeout(updatePoolReward, 120000)
}

async function sync() {
    const mining = require("./mining");

    const cpuUsage = await osu.cpu.usage();
    let ramUsage =  await osu.mem.info();
    ramUsage = 100 - ramUsage.freeMemPercentage;

    const blockIncrease = mining.stats.globalShares.increase;
    mining.stats.globalShares.increase = 0;

    const balancesToUpdate = mining.stats.balancesToUpdate;

    const syncData = {
        rewards: balancesToUpdate,
        blocks: {
            "blockIncrease": blockIncrease
        },
        cpu: cpuUsage,
        ram: ramUsage
    }

    const loginInfos = {
        host: ip,
        port: port,
        version: poolVersion,
        identifier: poolID
    };

    const socket = new net.Socket();
    socket.setEncoding("utf-8");
    socket.connect(serverPort, serverIP);

    socket.on("error", (err) => {
        console.log(`Socket error at sync: ${err}`);
    });

    socket.on("timeout", () => {
        console.log("Socket timeout at sync");
    });

    socket.on("data", (data) => {
        if (data.startsWith("2")) {
            socket.write(`PoolLogin,${JSON.stringify(loginInfos)}`);  
        } else if (data === "LoginOK") {
            socket.write("PoolPreSync");
        } else if (data === "OK") {
            socket.write(JSON.stringify(syncData));
            //console.log(syncData)
        } else if (data.startsWith("SyncOK")) {
            socket.end();
            Object.keys(mining.stats.balancesToUpdate).forEach(k =>{
                mining.stats.balancesToUpdate[k] = 0;
            });
        } else {
            console.log(`Unknown error, server returned ${data} in sync`);
        }
    });

    setTimeout(sync, 20000)
}

module.exports = { login, logout, updatePoolReward };
